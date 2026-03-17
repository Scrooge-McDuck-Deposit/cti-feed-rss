"""Servizio di categorizzazione automatica degli articoli.

Classifica gli articoli per settore aziendale colpito,
basandosi su keyword matching e analisi AI.
"""

from __future__ import annotations

import re
from app.models.schemas import Article, ThreatCategory

# Keyword per categorie - utilizzate per categorizzazione rapida pre-AI
CATEGORY_KEYWORDS: dict[ThreatCategory, list[str]] = {
    ThreatCategory.FINANCE: [
        "bank", "banca", "banking", "financial", "finanziario", "fintech",
        "payment", "pagamento", "credit card", "carta di credito", "swift",
        "cryptocurrency", "criptovaluta", "bitcoin", "blockchain", "defi",
        "insurance", "assicurazione", "stock", "borsa", "trading",
        "atm", "pos", "wire transfer", "bonifico",
    ],
    ThreatCategory.HEALTHCARE: [
        "hospital", "ospedale", "healthcare", "sanità", "sanitario",
        "medical", "medico", "pharmaceutical", "farmaceutico", "pharma",
        "patient", "paziente", "clinical", "clinica", "health",
        "vaccine", "vaccino", "hipaa", "hl7", "dicom", "ehr",
        "asl", "azienda sanitaria",
    ],
    ThreatCategory.GOVERNMENT: [
        "government", "governo", "governativo", "municipal", "comunale",
        "federal", "federale", "ministry", "ministero", "parliament",
        "parlamento", "election", "elezione", "diplomatic", "diplomatico",
        "embassy", "ambasciata", "public sector", "settore pubblico",
        "pubblica amministrazione", "state-sponsored", "nation-state",
        "apt", "agenzia", "agency",
    ],
    ThreatCategory.ENERGY: [
        "energy", "energia", "oil", "petrolio", "gas", "pipeline",
        "power grid", "rete elettrica", "nuclear", "nucleare",
        "solar", "solare", "wind", "eolico", "utility", "utilities",
        "electrical", "elettrico", "smart grid", "scada", "ics",
        "refinery", "raffineria", "opec",
    ],
    ThreatCategory.TELECOMMUNICATIONS: [
        "telecom", "telecomunicazione", "mobile operator", "operatore mobile",
        "isp", "internet provider", "5g", "carrier", "broadband",
        "satellite", "sim swap", "ss7", "voip", "radio",
    ],
    ThreatCategory.MANUFACTURING: [
        "manufacturing", "manifatturiero", "factory", "fabbrica",
        "industrial", "industriale", "supply chain", "catena di fornitura",
        "automotive", "automobile", "iot", "plc", "ot security",
        "operational technology", "robot", "assembly",
    ],
    ThreatCategory.EDUCATION: [
        "university", "università", "school", "scuola", "education",
        "istruzione", "academic", "accademico", "campus", "student",
        "studente", "research", "ricerca", "college",
    ],
    ThreatCategory.RETAIL: [
        "retail", "vendita al dettaglio", "e-commerce", "ecommerce",
        "shop", "negozio", "store", "marketplace", "magecart",
        "point of sale", "shopping", "consumer",
    ],
    ThreatCategory.TECHNOLOGY: [
        "tech company", "software", "cloud", "saas", "paas",
        "data center", "startup", "silicon valley",
        "microsoft", "google", "apple", "amazon", "meta", "facebook",
        "github", "gitlab", "devops", "kubernetes", "docker",
    ],
    ThreatCategory.TRANSPORTATION: [
        "transport", "trasporto", "aviation", "aviazione", "airline",
        "airport", "aeroporto", "railway", "ferrovia", "shipping",
        "maritime", "marittimo", "logistics", "logistica", "port",
        "porto", "fleet", "gps",
    ],
    ThreatCategory.DEFENSE: [
        "defense", "difesa", "military", "militare", "army", "esercito",
        "navy", "marina", "air force", "aeronautica", "nato",
        "weapons", "armi", "missile", "intelligence agency",
        "cyber warfare", "guerra cibernetica", "cyber espionage",
    ],
    ThreatCategory.CRITICAL_INFRASTRUCTURE: [
        "critical infrastructure", "infrastruttura critica",
        "water treatment", "trattamento acque", "dam", "diga",
        "traffic control", "controllo traffico", "emergency",
        "emergenza", "119", "112", "911",
    ],
}


class CategorizerService:
    """Categorizza gli articoli per settore colpito."""

    def categorize_by_keywords(self, article: Article) -> ThreatCategory:
        """Categorizzazione rapida basata su keyword matching."""
        # Combina titolo, summary e tags per il matching
        text = " ".join([
            article.title.lower(),
            article.summary.lower(),
            " ".join(article.tags).lower(),
            article.content[:2000].lower() if article.content else "",
        ])

        scores: dict[ThreatCategory, int] = {}

        for category, keywords in CATEGORY_KEYWORDS.items():
            score = 0
            for keyword in keywords:
                # Cerca la keyword come parola intera (word boundary)
                pattern = rf"\b{re.escape(keyword)}\b"
                matches = re.findall(pattern, text, re.IGNORECASE)
                score += len(matches)
            if score > 0:
                scores[category] = score

        if not scores:
            return ThreatCategory.GENERAL

        # Restituisci la categoria con il punteggio più alto
        return max(scores, key=scores.get)  # type: ignore[arg-type]

    def get_all_matching_categories(
        self, text: str, min_score: int = 2
    ) -> list[tuple[ThreatCategory, int]]:
        """Restituisce tutte le categorie con il loro punteggio."""
        text_lower = text.lower()
        results: list[tuple[ThreatCategory, int]] = []

        for category, keywords in CATEGORY_KEYWORDS.items():
            score = 0
            for keyword in keywords:
                pattern = rf"\b{re.escape(keyword)}\b"
                matches = re.findall(pattern, text_lower, re.IGNORECASE)
                score += len(matches)
            if score >= min_score:
                results.append((category, score))

        results.sort(key=lambda x: x[1], reverse=True)
        return results

    def get_category_display_name(self, category: ThreatCategory) -> str:
        """Restituisce il nome visualizzato della categoria."""
        names = {
            ThreatCategory.FINANCE: "Finanza e Banche",
            ThreatCategory.HEALTHCARE: "Sanità",
            ThreatCategory.GOVERNMENT: "Governo e PA",
            ThreatCategory.ENERGY: "Energia",
            ThreatCategory.TELECOMMUNICATIONS: "Telecomunicazioni",
            ThreatCategory.MANUFACTURING: "Manifattura e Industria",
            ThreatCategory.EDUCATION: "Istruzione e Ricerca",
            ThreatCategory.RETAIL: "Retail e E-commerce",
            ThreatCategory.TECHNOLOGY: "Tecnologia",
            ThreatCategory.TRANSPORTATION: "Trasporti e Logistica",
            ThreatCategory.DEFENSE: "Difesa e Militare",
            ThreatCategory.CRITICAL_INFRASTRUCTURE: "Infrastrutture Critiche",
            ThreatCategory.GENERAL: "Generale",
            ThreatCategory.UNKNOWN: "Non classificato",
        }
        return names.get(category, category.value)


# Singleton
categorizer_service = CategorizerService()
