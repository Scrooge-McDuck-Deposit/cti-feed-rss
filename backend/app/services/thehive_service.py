"""Servizio di integrazione con TheHive / Cortex.

Genera alert TheHive 5 compatibili a partire da articoli analizzati,
con observables (IoC) e tag MITRE ATT&CK.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

import aiohttp

from app.config import settings

logger = logging.getLogger(__name__)

SEVERITY_MAP = {
    "critical": 4,
    "high": 3,
    "medium": 2,
    "low": 1,
}

IOC_TYPE_MAP = {
    "ip": "ip",
    "domain": "domain",
    "hash": "hash",
    "url": "url",
    "email": "mail",
    "cve": "other",
}


class TheHiveService:
    """Crea alert e observable compatibili con TheHive 5 REST API."""

    # ------------------------------------------------------------------ #
    # Generazione payload (offline – non richiede connettività)
    # ------------------------------------------------------------------ #

    def build_alert(self, article) -> dict[str, Any]:
        """Costruisce il payload JSON di un alert TheHive."""
        analysis = article.analysis
        if not analysis:
            return {}

        severity = SEVERITY_MAP.get(
            (analysis.severity or "low").lower(), 1
        )

        tags = [f"source:{article.feed_id or 'cti-feed-rss'}"]

        for tech in analysis.attack_techniques or []:
            if tech.technique_id:
                tags.append(f"mitre:{tech.technique_id}")

        for actor in analysis.threat_actors or []:
            if actor.name:
                tags.append(f"actor:{actor.name}")

        categories = analysis.categories or []
        for cat in categories:
            tags.append(f"category:{cat}")

        tags.append(f"tlp:amber")

        observables = self._build_observables(analysis)

        alert: dict[str, Any] = {
            "type": "external",
            "source": "CTI-Feed-RSS",
            "sourceRef": article.id or article.link,
            "title": article.title or "Untitled CTI Alert",
            "description": (analysis.summary or article.title or "")[:4096],
            "severity": severity,
            "date": int(
                (article.published or article.fetched_at or datetime.utcnow())
                .timestamp()
                * 1000
            ),
            "tags": tags,
            "tlp": 2,  # AMBER
            "pap": 2,  # AMBER
            "observables": observables,
        }

        return alert

    def _build_observables(self, analysis) -> list[dict]:
        """Converte IoC in array di observable TheHive."""
        observables: list[dict] = []

        for ioc in analysis.indicators or []:
            data_type = IOC_TYPE_MAP.get(ioc.type, "other")
            observable = {
                "dataType": data_type,
                "data": ioc.value,
                "message": ioc.description or f"{ioc.type} indicator",
                "tags": [f"ioc:{ioc.type}"],
                "ioc": True,
                "sighted": False,
            }
            if ioc.confidence:
                observable["tags"].append(f"confidence:{ioc.confidence}")
            observables.append(observable)

        for vuln in analysis.vulnerabilities or []:
            observables.append({
                "dataType": "other",
                "data": vuln.cve_id,
                "message": f"CVSS {vuln.cvss_score}" if vuln.cvss_score else vuln.cve_id,
                "tags": ["vulnerability", f"cvss:{vuln.cvss_score or 'unknown'}"],
                "ioc": False,
                "sighted": False,
            })

        return observables

    # ------------------------------------------------------------------ #
    # Push remoto (richiede THEHIVE_URL / THEHIVE_API_KEY in config)
    # ------------------------------------------------------------------ #

    async def push_alert(self, article) -> dict:
        """Invia un alert a TheHive via REST API.

        Restituisce la risposta di TheHive o un dict con errore.
        """
        url = getattr(settings, "THEHIVE_URL", "")
        api_key = getattr(settings, "THEHIVE_API_KEY", "")
        if not url or not api_key:
            return {"error": "TheHive URL or API key not configured"}

        alert_payload = self.build_alert(article)
        if not alert_payload:
            return {"error": "Article has no analysis data"}

        endpoint = f"{url.rstrip('/')}/api/v1/alert"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    endpoint, json=alert_payload, headers=headers, timeout=aiohttp.ClientTimeout(total=30)
                ) as resp:
                    body = await resp.json()
                    if resp.status in (200, 201):
                        logger.info("Alert pushed to TheHive: %s", body.get("_id"))
                        return {"success": True, "alert_id": body.get("_id"), "status": resp.status}
                    else:
                        logger.warning("TheHive returned %d: %s", resp.status, body)
                        return {"error": f"TheHive returned {resp.status}", "details": body}
        except Exception as exc:
            logger.error("Failed to push alert to TheHive: %s", exc)
            return {"error": str(exc)}


# Singleton
thehive_service = TheHiveService()
