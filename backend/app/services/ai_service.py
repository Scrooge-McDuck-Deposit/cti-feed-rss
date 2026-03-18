"""Servizio di analisi AI per articoli di Cyber Threat Intelligence.

Supporta tre motori AI:
- Ollama (locale, gratuito)
- Google Gemini (gratuito con limiti)
- OpenAI (a pagamento)

Se nessun motore è configurato, usa analisi base tramite keyword/regex.
"""

from __future__ import annotations

import json
import logging
from typing import Optional

import aiohttp

from app.config import settings
from app.models.schemas import (
    AIAnalysis,
    Article,
    AttackTechnique,
    SeverityLevel,
    ThreatActor,
    ThreatCategory,
    ThreatIndicator,
    Vulnerability,
)

logger = logging.getLogger(__name__)

ANALYSIS_SYSTEM_PROMPT = """Sei un analista senior di Cyber Threat Intelligence. 
Il tuo compito è analizzare articoli sulla cybersecurity e estrarre informazioni strutturate
per la creazione di report tecnici.

Analizza l'articolo fornito e restituisci un JSON con la seguente struttura:
{
    "summary_it": "Riassunto dettagliato in italiano (3-5 frasi)",
    "summary_en": "Detailed summary in English (3-5 sentences)",
    "threat_category": "Categoria principale tra: finance, healthcare, government, energy, telecommunications, manufacturing, education, retail, technology, transportation, defense, critical_infrastructure, general, unknown",
    "severity": "Livello di gravità tra: critical, high, medium, low, informational",
    "threat_actors": [
        {
            "name": "Nome del threat actor",
            "aliases": ["alias1", "alias2"],
            "motivation": "Motivazione (financial, espionage, hacktivism, destruction)",
            "country": "Paese di origine se noto"
        }
    ],
    "indicators": [
        {
            "type": "Tipo tra: ip, domain, hash_md5, hash_sha1, hash_sha256, url, email, cve, filename",
            "value": "Valore dell'indicatore",
            "context": "Contesto in cui appare"
        }
    ],
    "attack_techniques": [
        {
            "technique_id": "ID MITRE ATT&CK (es. T1566.001)",
            "technique_name": "Nome della tecnica",
            "tactic": "Tattica MITRE (es. Initial Access, Execution, etc.)",
            "description": "Breve descrizione dell'uso nel contesto"
        }
    ],
    "vulnerabilities": [
        {
            "cve_id": "CVE-YYYY-NNNNN",
            "description": "Descrizione della vulnerabilità",
            "cvss_score": 0.0,
            "affected_products": ["prodotto1", "prodotto2"]
        }
    ],
    "affected_sectors": ["Lista dei settori colpiti usando le stesse categorie di threat_category"],
    "malware_families": ["Nomi delle famiglie malware menzionate"],
    "recommendations": ["Lista di raccomandazioni tecniche per la mitigazione"],
    "key_findings": ["Punti chiave emersi dall'analisi"],
    "tags": ["tag1", "tag2", "tag3"],
    "confidence_score": 0.85
}

Regole:
1. Estrai SOLO informazioni presenti nell'articolo, non inventare
2. Se un campo non ha informazioni, usa una lista vuota [] o stringa vuota ""
3. Per gli IoC, estrai IP, domini, hash, URL, email e CVE menzionati
4. Identifica le tecniche MITRE ATT&CK quando possibile
5. Assegna sempre un livello di severità basato sull'impatto potenziale
6. Il confidence_score indica quanto sei sicuro dell'analisi (0.0-1.0)
7. Rispondi ESCLUSIVAMENTE con il JSON, senza markdown o testo aggiuntivo"""


class AIService:
    """Servizio di analisi AI multi-engine per articoli CTI."""

    def __init__(self) -> None:
        self._openai_client = None
        # Runtime overrides (impostabili dall'interfaccia mobile)
        self._runtime_engine: str | None = None
        self._runtime_openai_key: str | None = None
        self._runtime_openai_model: str | None = None
        self._runtime_gemini_key: str | None = None
        self._runtime_gemini_model: str | None = None
        self._runtime_ollama_url: str | None = None
        self._runtime_ollama_model: str | None = None

    # ── Runtime config API ──────────────────────────────────────────

    def get_config(self) -> dict:
        """Restituisce la configurazione AI corrente (senza esporre chiavi intere)."""
        return {
            "engine": self._effective_engine_name(),
            "ollama_base_url": self._runtime_ollama_url or settings.OLLAMA_BASE_URL,
            "ollama_model": self._runtime_ollama_model or settings.OLLAMA_MODEL,
            "gemini_model": self._runtime_gemini_model or settings.GEMINI_MODEL,
            "gemini_api_key_set": bool(self._runtime_gemini_key or settings.GEMINI_API_KEY),
            "openai_model": self._runtime_openai_model or settings.OPENAI_MODEL,
            "openai_api_key_set": bool(self._runtime_openai_key or settings.OPENAI_API_KEY),
        }

    def update_config(self, data: dict) -> dict:
        """Aggiorna la configurazione AI a runtime."""
        if "engine" in data:
            val = data["engine"].strip().lower()
            if val not in ("ollama", "gemini", "openai", ""):
                return {"error": "Engine non valido. Usa: ollama, gemini, openai, o vuoto."}
            self._runtime_engine = val
        if "ollama_base_url" in data:
            self._runtime_ollama_url = data["ollama_base_url"].strip()
        if "ollama_model" in data:
            self._runtime_ollama_model = data["ollama_model"].strip()
        if "gemini_api_key" in data:
            self._runtime_gemini_key = data["gemini_api_key"].strip()
        if "gemini_model" in data:
            self._runtime_gemini_model = data["gemini_model"].strip()
        if "openai_api_key" in data:
            self._runtime_openai_key = data["openai_api_key"].strip()
            self._openai_client = None  # Reset cached client
        if "openai_model" in data:
            self._runtime_openai_model = data["openai_model"].strip()
        return {"success": True, "config": self.get_config()}

    def _effective_engine_name(self) -> str:
        """Restituisce il nome del motore tenendo conto degli override runtime."""
        if self._runtime_engine is not None:
            return self._runtime_engine
        return settings.AI_ENGINE.lower().strip()

    @property
    def engine(self) -> str:
        """Restituisce il motore AI configurato, o '' se nessuno."""
        engine = self._effective_engine_name()
        if engine == "openai" and (self._runtime_openai_key or settings.OPENAI_API_KEY):
            return "openai"
        if engine == "gemini" and (self._runtime_gemini_key or settings.GEMINI_API_KEY):
            return "gemini"
        if engine == "ollama":
            return "ollama"
        # Auto-detect se engine è vuoto ma ci sono credenziali
        if not engine:
            if self._runtime_openai_key or settings.OPENAI_API_KEY:
                return "openai"
            if self._runtime_gemini_key or settings.GEMINI_API_KEY:
                return "gemini"
        return ""

    @property
    def is_available(self) -> bool:
        """Verifica se un motore AI è configurato e disponibile."""
        return bool(self.engine)

    @property
    def model_name(self) -> str:
        """Restituisce il nome del modello in uso."""
        e = self.engine
        if e == "openai":
            return self._runtime_openai_model or settings.OPENAI_MODEL
        if e == "gemini":
            return self._runtime_gemini_model or settings.GEMINI_MODEL
        if e == "ollama":
            return self._runtime_ollama_model or settings.OLLAMA_MODEL
        return ""

    # ── Ollama Model Update ─────────────────────────────────────────────

    async def check_ollama_update(self) -> dict:
        """Controlla se il modello Ollama ha aggiornamenti e lo aggiorna."""
        model = self._runtime_ollama_model or settings.OLLAMA_MODEL
        base_url = self._runtime_ollama_url or settings.OLLAMA_BASE_URL
        url = f"{base_url}/api/pull"
        logger.info("🔄 Controllo aggiornamenti Ollama per '%s'...", model)

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    url,
                    json={"model": model, "stream": False},
                    timeout=aiohttp.ClientTimeout(total=600),
                ) as resp:
                    if resp.status != 200:
                        body = await resp.text()
                        logger.warning("⚠️ Ollama pull fallito (%d): %s", resp.status, body[:300])
                        return {"status": "error", "message": body[:300]}
                    data = await resp.json()
                    status = data.get("status", "")
                    if "up to date" in status.lower() or status == "success":
                        logger.info("✅ Modello '%s' già aggiornato", model)
                    else:
                        logger.info("✅ Modello '%s' aggiornato: %s", model, status)
                    return {"status": "ok", "model": model, "detail": status}
        except aiohttp.ClientError as e:
            logger.warning("⚠️ Ollama non raggiungibile per aggiornamento: %s", e)
            return {"status": "unreachable", "message": str(e)}
        except Exception as e:
            logger.error("❌ Errore aggiornamento Ollama: %s", e)
            return {"status": "error", "message": str(e)}

    # ── Chat Completion (multi-engine) ──────────────────────────────────

    async def _chat_completion(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.1,
        max_tokens: int = 4000,
    ) -> str | None:
        """Invia un prompt e restituisce la risposta testuale.

        Funziona con OpenAI, Gemini e Ollama in modo trasparente.
        """
        e = self.engine
        if e == "openai":
            return await self._openai_chat(system_prompt, user_prompt, temperature, max_tokens)
        if e == "gemini":
            return await self._gemini_chat(system_prompt, user_prompt, temperature, max_tokens)
        if e == "ollama":
            return await self._ollama_chat(system_prompt, user_prompt, temperature, max_tokens)
        return None

    async def _openai_chat(self, system: str, user: str, temperature: float, max_tokens: int) -> str | None:
        from openai import AsyncOpenAI
        api_key = self._runtime_openai_key or settings.OPENAI_API_KEY
        model = self._runtime_openai_model or settings.OPENAI_MODEL
        if self._openai_client is None or self._runtime_openai_key:
            self._openai_client = AsyncOpenAI(api_key=api_key)
        response = await self._openai_client.chat.completions.create(
            model=model,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            temperature=temperature,
            max_tokens=max_tokens,
            response_format={"type": "json_object"},
        )
        return response.choices[0].message.content

    async def _gemini_chat(self, system: str, user: str, temperature: float, max_tokens: int) -> str | None:
        api_key = self._runtime_gemini_key or settings.GEMINI_API_KEY
        model = self._runtime_gemini_model or settings.GEMINI_MODEL
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{model}:generateContent?key={api_key}"
        )
        payload = {
            "system_instruction": {"parts": [{"text": system}]},
            "contents": [{"parts": [{"text": user}]}],
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
                "responseMimeType": "application/json",
            },
        }
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, timeout=aiohttp.ClientTimeout(total=120)) as resp:
                if resp.status != 200:
                    body = await resp.text()
                    logger.error("Gemini API error %d: %s", resp.status, body[:500])
                    return None
                data = await resp.json()
                return data["candidates"][0]["content"]["parts"][0]["text"]

    async def _ollama_chat(self, system: str, user: str, temperature: float, max_tokens: int) -> str | None:
        base_url = self._runtime_ollama_url or settings.OLLAMA_BASE_URL
        model = self._runtime_ollama_model or settings.OLLAMA_MODEL
        url = f"{base_url}/api/chat"
        payload = {
            "model": model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "stream": False,
            "format": "json",
            "options": {"temperature": temperature, "num_predict": max_tokens},
        }
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, timeout=aiohttp.ClientTimeout(total=300)) as resp:
                if resp.status != 200:
                    body = await resp.text()
                    logger.error("Ollama API error %d: %s", resp.status, body[:500])
                    return None
                data = await resp.json()
                return data.get("message", {}).get("content")

    async def analyze_article(self, article: Article) -> AIAnalysis:
        """Analizza un articolo e restituisce l'analisi strutturata.

        Se nessun motore AI è configurato, restituisce un'analisi base
        tramite keyword matching (categorizzazione e tag extraction).
        """
        if not self.is_available:
            return self._basic_analysis(article)

        article_text = self._prepare_article_text(article)

        try:
            content = await self._chat_completion(
                system_prompt=ANALYSIS_SYSTEM_PROMPT,
                user_prompt=article_text,
                temperature=0.1,
                max_tokens=4000,
            )

            if not content:
                logger.warning("Empty AI response for article %s", article.id)
                return self._basic_analysis(article)

            analysis_data = json.loads(content)
            return self._parse_analysis(analysis_data)

        except json.JSONDecodeError as e:
            logger.error("JSON parse error for article %s: %s", article.id, e)
            return self._basic_analysis(article)
        except Exception as e:
            logger.error("AI analysis error for article %s: %s", article.id, e)
            return self._basic_analysis(article)

    def _prepare_article_text(self, article: Article) -> str:
        """Prepara il testo dell'articolo per l'analisi AI."""
        parts = [
            f"TITOLO: {article.title}",
            f"FONTE: {article.feed_id}",
            f"LINK: {article.link}",
        ]

        if article.author:
            parts.append(f"AUTORE: {article.author}")

        if article.published:
            parts.append(f"DATA PUBBLICAZIONE: {article.published.isoformat()}")

        if article.tags:
            parts.append(f"TAGS: {', '.join(article.tags)}")

        # Usa il contenuto completo se disponibile, altrimenti il summary
        text = article.content or article.summary
        if text:
            # Limita il testo per i token
            if len(text) > 8000:
                text = text[:8000] + "\n[... contenuto troncato ...]"
            parts.append(f"\nCONTENUTO:\n{text}")

        return "\n".join(parts)

    def _parse_analysis(self, data: dict) -> AIAnalysis:
        """Parsa la risposta AI in un oggetto AIAnalysis."""
        try:
            threat_actors = [
                ThreatActor(**ta) for ta in data.get("threat_actors", [])
            ]
        except (ValueError, TypeError):
            threat_actors = []

        try:
            indicators = [
                ThreatIndicator(**ioc) for ioc in data.get("indicators", [])
            ]
        except (ValueError, TypeError):
            indicators = []

        try:
            techniques = [
                AttackTechnique(**t) for t in data.get("attack_techniques", [])
            ]
        except (ValueError, TypeError):
            techniques = []

        try:
            vulnerabilities = [
                Vulnerability(**v) for v in data.get("vulnerabilities", [])
            ]
        except (ValueError, TypeError):
            vulnerabilities = []

        # Parsa categoria
        try:
            category = ThreatCategory(data.get("threat_category", "unknown"))
        except ValueError:
            category = ThreatCategory.UNKNOWN

        # Parsa severità
        try:
            severity = SeverityLevel(data.get("severity", "informational"))
        except ValueError:
            severity = SeverityLevel.INFORMATIONAL

        # Parsa settori colpiti
        affected_sectors = []
        for sector in data.get("affected_sectors", []):
            try:
                affected_sectors.append(ThreatCategory(sector))
            except ValueError:
                continue

        return AIAnalysis(
            summary_it=data.get("summary_it", ""),
            summary_en=data.get("summary_en", ""),
            threat_category=category,
            severity=severity,
            threat_actors=threat_actors,
            indicators=indicators,
            attack_techniques=techniques,
            vulnerabilities=vulnerabilities,
            affected_sectors=affected_sectors,
            malware_families=data.get("malware_families", []),
            recommendations=data.get("recommendations", []),
            key_findings=data.get("key_findings", []),
            tags=data.get("tags", []),
            confidence_score=float(data.get("confidence_score", 0.0)),
        )

    async def generate_report_content(
        self,
        articles_analyses: list[dict],
        language: str = "it",
    ) -> dict:
        """Genera il contenuto di un report tecnico da più analisi."""
        if not self.is_available:
            # Fallback senza AI: report basico assemblato dai dati disponibili
            summaries = [a.get("summary", "") for a in articles_analyses if a.get("summary")]
            findings = []
            for a in articles_analyses:
                findings.extend(a.get("key_findings", []))
            return {
                "executive_summary": " ".join(summaries[:3]) or "Report generato senza AI.",
                "technical_details": "\n\n".join(
                    f"### {a.get('title', 'N/D')}\n{a.get('summary', '')}"
                    for a in articles_analyses
                ),
                "recommendations": ["Configurare un motore AI per report completi (Ollama, Gemini o OpenAI)."],
                "overall_severity": articles_analyses[0].get("severity", "informational") if articles_analyses else "informational",
            }

        report_prompt = f"""Basandoti sulle seguenti analisi di articoli di Cyber Threat Intelligence,
genera un report tecnico completo in {"italiano" if language == "it" else "inglese"}.

ANALISI ARTICOLI:
{json.dumps(articles_analyses, indent=2, default=str)}

Genera un JSON con:
{{
    "executive_summary": "Riassunto esecutivo del report (paragrafo completo)",
    "technical_details": "Dettagli tecnici approfonditi (più paragrafi, con sezioni)",
    "recommendations": ["Lista di raccomandazioni operative"],
    "overall_severity": "critical/high/medium/low/informational"
}}

Rispondi ESCLUSIVAMENTE con il JSON."""

        try:
            content = await self._chat_completion(
                system_prompt="Sei un analista CTI esperto. Genera report tecnici strutturati.",
                user_prompt=report_prompt,
                temperature=0.2,
                max_tokens=6000,
            )

            if content:
                return json.loads(content)
        except Exception as e:
            logger.error("Report generation error: %s", e)

        return {
            "executive_summary": "Errore nella generazione del report",
            "technical_details": "",
            "recommendations": [],
            "overall_severity": "informational",
        }

    def _basic_analysis(self, article: Article) -> AIAnalysis:
        """Analisi base senza AI: usa keyword matching per categorizzazione e estrazione IoC basilare."""
        import re as _re
        from app.services.categorizer import categorizer_service

        text = f"{article.title} {article.summary} {article.content[:3000] if article.content else ''}"

        # Categorizzazione via keyword
        category = categorizer_service.categorize_by_keywords(article)

        # Estrazione CVE basilare
        cve_pattern = r"CVE-\d{4}-\d{4,7}"
        cves = list(set(_re.findall(cve_pattern, text, _re.IGNORECASE)))
        vulnerabilities = [
            Vulnerability(cve_id=cve.upper(), description="Estratto dall'articolo")
            for cve in cves[:20]
        ]

        # Estrazione IoC basilare (IP, hash, domini sospetti)
        indicators: list[ThreatIndicator] = []
        # IPv4
        for ip in set(_re.findall(r"\b(?:\d{1,3}\.){3}\d{1,3}\b", text)):
            if not ip.startswith(("10.", "192.168.", "127.", "0.")):
                indicators.append(ThreatIndicator(type="ip", value=ip, context="Estratto dall'articolo"))
        # SHA256
        for h in set(_re.findall(r"\b[a-fA-F0-9]{64}\b", text)):
            indicators.append(ThreatIndicator(type="hash_sha256", value=h, context="Estratto dall'articolo"))
        # MD5
        for h in set(_re.findall(r"\b[a-fA-F0-9]{32}\b", text)):
            indicators.append(ThreatIndicator(type="hash_md5", value=h, context="Estratto dall'articolo"))

        # Severità base dal titolo
        title_lower = article.title.lower()
        if any(w in title_lower for w in ("critical", "critico", "zero-day", "0-day", "emergency")):
            severity = SeverityLevel.CRITICAL
        elif any(w in title_lower for w in ("ransomware", "breach", "attack", "exploit", "vulnerability")):
            severity = SeverityLevel.HIGH
        elif any(w in title_lower for w in ("warning", "threat", "malware", "phishing")):
            severity = SeverityLevel.MEDIUM
        elif any(w in title_lower for w in ("update", "patch", "advisory")):
            severity = SeverityLevel.LOW
        else:
            severity = SeverityLevel.INFORMATIONAL

        # Tags dal titolo
        known_tags = [
            "ransomware", "phishing", "malware", "apt", "zero-day", "ddos",
            "data breach", "supply chain", "vulnerability", "exploit",
        ]
        tags = [t for t in known_tags if t in text.lower()]

        summary = article.summary[:500] if article.summary else article.title

        return AIAnalysis(
            summary_it=summary,
            summary_en="",
            threat_category=category,
            severity=severity,
            indicators=indicators[:30],
            vulnerabilities=vulnerabilities,
            tags=tags,
            key_findings=[f"Articolo da {article.feed_id}: {article.title}"],
            confidence_score=0.3,
        )


# Singleton
ai_service = AIService()
