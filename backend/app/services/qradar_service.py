"""Servizio di integrazione con IBM QRadar.

Esporta IoC come Reference Set entries e genera offense note via REST API.
"""

from __future__ import annotations

import logging
from typing import Any

import aiohttp

from app.config import settings

logger = logging.getLogger(__name__)

# QRadar Reference Set names
REF_SET_IPS = "CTI_Malicious_IPs"
REF_SET_DOMAINS = "CTI_Malicious_Domains"
REF_SET_HASHES = "CTI_Malicious_Hashes"
REF_SET_URLS = "CTI_Malicious_URLs"

IOC_REF_MAP = {
    "ip": REF_SET_IPS,
    "domain": REF_SET_DOMAINS,
    "hash": REF_SET_HASHES,
    "url": REF_SET_URLS,
}


class QRadarService:
    """Esporta intelligence verso IBM QRadar via REST API."""

    # ------------------------------------------------------------------ #
    # Generazione payload (offline)
    # ------------------------------------------------------------------ #

    def build_reference_entries(self, article) -> dict[str, list[str]]:
        """Raggruppa gli IoC per reference set QRadar.

        Returns:
            dict con chiave = nome reference set, valore = lista di valori.
        """
        analysis = article.analysis
        if not analysis:
            return {}

        entries: dict[str, list[str]] = {}
        for ioc in analysis.indicators or []:
            ref_set = IOC_REF_MAP.get(ioc.type)
            if ref_set:
                entries.setdefault(ref_set, []).append(ioc.value)

        return entries

    def build_offense_note(self, article) -> str:
        """Genera una nota testuale per le QRadar Offenses."""
        analysis = article.analysis
        parts = [
            f"[CTI-Feed-RSS] {article.title or 'Untitled'}",
            f"Source: {article.link or 'N/A'}",
        ]
        if analysis:
            if analysis.summary:
                parts.append(f"Summary: {analysis.summary[:500]}")
            if analysis.severity:
                parts.append(f"Severity: {analysis.severity}")
            actors = [a.name for a in (analysis.threat_actors or []) if a.name]
            if actors:
                parts.append(f"Threat Actors: {', '.join(actors)}")
            techs = [t.technique_id for t in (analysis.attack_techniques or []) if t.technique_id]
            if techs:
                parts.append(f"MITRE ATT&CK: {', '.join(techs)}")

        return "\n".join(parts)

    def build_export_payload(self, article) -> dict[str, Any]:
        """Payload completo per il frontend (preview / download)."""
        return {
            "reference_sets": self.build_reference_entries(article),
            "offense_note": self.build_offense_note(article),
            "article_id": article.id,
            "article_title": article.title,
        }

    # ------------------------------------------------------------------ #
    # Push remoto
    # ------------------------------------------------------------------ #

    async def push_indicators(self, article) -> dict:
        """Invia gli IoC ai Reference Set di QRadar.

        Per ogni reference set aggiunge i valori uno alla volta tramite
        POST /api/reference_data/sets/{name} (QRadar REST API v18+).
        """
        url = getattr(settings, "QRADAR_URL", "")
        api_key = getattr(settings, "QRADAR_API_KEY", "")
        if not url or not api_key:
            return {"error": "QRadar URL or API key not configured"}

        entries = self.build_reference_entries(article)
        if not entries:
            return {"error": "No IoC to export"}

        headers = {
            "SEC": api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        results: dict[str, Any] = {}
        try:
            async with aiohttp.ClientSession() as session:
                for ref_set, values in entries.items():
                    added = 0
                    for value in values:
                        endpoint = (
                            f"{url.rstrip('/')}/api/reference_data/sets/{ref_set}"
                            f"?value={aiohttp.helpers.quote(value, safe='')}"
                        )
                        async with session.post(
                            endpoint, headers=headers,
                            timeout=aiohttp.ClientTimeout(total=15),
                            ssl=False,
                        ) as resp:
                            if resp.status in (200, 201):
                                added += 1
                            else:
                                body = await resp.text()
                                logger.warning(
                                    "QRadar ref set %s: %d – %s",
                                    ref_set, resp.status, body[:200],
                                )
                    results[ref_set] = {"total": len(values), "added": added}

            return {"success": True, "reference_sets": results}
        except Exception as exc:
            logger.error("Failed to push to QRadar: %s", exc)
            return {"error": str(exc)}


# Singleton
qradar_service = QRadarService()
