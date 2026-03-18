"""Servizio di integrazione con Elasticsearch / OpenSearch.

Indicizza articoli CTI in formato ECS (Elastic Common Schema)
tramite Bulk API o singolo documento.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

import aiohttp

from app.config import settings

logger = logging.getLogger(__name__)

INDEX_NAME = "cti-feed-rss-intel"


class ElasticService:
    """Genera documenti ECS-compatibili e li indicizza in Elasticsearch."""

    # ------------------------------------------------------------------ #
    # Generazione documento ECS
    # ------------------------------------------------------------------ #

    def build_ecs_document(self, article) -> dict[str, Any]:
        """Converte un articolo analizzato in documento ECS threat-intel."""
        analysis = article.analysis
        ts = (article.published or article.fetched_at or datetime.utcnow()).isoformat()

        doc: dict[str, Any] = {
            "@timestamp": ts,
            "event": {
                "kind": "enrichment",
                "category": ["threat"],
                "type": ["indicator"],
                "severity": _severity_score(analysis.severity if analysis else None),
                "original": article.link or "",
            },
            "message": article.title or "",
            "tags": [],
            "threat": {
                "indicator": {"type": []},
                "technique": [],
                "software": [],
                "group": [],
            },
            "vulnerability": [],
            "source": {
                "domain": article.feed_id or "cti-feed-rss",
                "url": article.link or "",
            },
        }

        if not analysis:
            return doc

        # Summary
        if analysis.summary:
            doc["message"] = analysis.summary[:2048]

        # Categories
        doc["tags"] = list(analysis.categories or [])

        # Indicators (ECS threat.indicator)
        for ioc in analysis.indicators or []:
            doc["threat"]["indicator"]["type"].append(ioc.type)
            # ECS flattened fields per IOC type
            if ioc.type == "ip":
                doc.setdefault("threat.indicator.ip", []).append(ioc.value)
            elif ioc.type == "domain":
                doc.setdefault("threat.indicator.url.domain", []).append(ioc.value)
            elif ioc.type == "url":
                doc.setdefault("threat.indicator.url.full", []).append(ioc.value)
            elif ioc.type == "hash":
                doc.setdefault("threat.indicator.file.hash", []).append(ioc.value)
            elif ioc.type == "email":
                doc.setdefault("threat.indicator.email.address", []).append(ioc.value)

        # Techniques (ECS threat.technique)
        for tech in analysis.attack_techniques or []:
            entry: dict[str, Any] = {}
            if tech.technique_id:
                entry["id"] = tech.technique_id
            if tech.name:
                entry["name"] = tech.name
            if tech.tactic:
                entry["tactic"] = {"name": tech.tactic}
            if entry:
                doc["threat"]["technique"].append(entry)

        # Threat actors (ECS threat.group)
        for actor in analysis.threat_actors or []:
            entry = {}
            if actor.name:
                entry["name"] = actor.name
            if getattr(actor, "aliases", None):
                entry["alias"] = actor.aliases
            if entry:
                doc["threat"]["group"].append(entry)

        # Malware / software
        for mw in analysis.malware_families or []:
            doc["threat"]["software"].append({"name": mw})

        # Vulnerabilities (ECS)
        for vuln in analysis.vulnerabilities or []:
            v: dict[str, Any] = {"id": vuln.cve_id}
            if vuln.cvss_score is not None:
                v["score"] = {"base": vuln.cvss_score}
            if vuln.description:
                v["description"] = vuln.description[:512]
            doc["vulnerability"].append(v)

        # Cleanup empty arrays
        if not doc["threat"]["indicator"]["type"]:
            del doc["threat"]["indicator"]
        if not doc["threat"]["technique"]:
            del doc["threat"]["technique"]
        if not doc["threat"]["software"]:
            del doc["threat"]["software"]
        if not doc["threat"]["group"]:
            del doc["threat"]["group"]
        if not doc["vulnerability"]:
            del doc["vulnerability"]

        return doc

    # ------------------------------------------------------------------ #
    # Push remoto
    # ------------------------------------------------------------------ #

    async def index_article(self, article) -> dict:
        """Indicizza un singolo articolo in Elasticsearch."""
        url = getattr(settings, "ELASTICSEARCH_URL", "")
        api_key = getattr(settings, "ELASTICSEARCH_API_KEY", "")
        if not url:
            return {"error": "Elasticsearch URL not configured"}

        doc = self.build_ecs_document(article)
        doc_id = article.id or str(hash(article.link))
        endpoint = f"{url.rstrip('/')}/{INDEX_NAME}/_doc/{doc_id}"

        headers: dict[str, str] = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"ApiKey {api_key}"

        try:
            async with aiohttp.ClientSession() as session:
                async with session.put(
                    endpoint, json=doc, headers=headers,
                    timeout=aiohttp.ClientTimeout(total=15),
                    ssl=False,
                ) as resp:
                    body = await resp.json()
                    if resp.status in (200, 201):
                        logger.info("Indexed in ES: %s", doc_id)
                        return {"success": True, "id": doc_id, "result": body.get("result")}
                    else:
                        logger.warning("ES returned %d: %s", resp.status, body)
                        return {"error": f"Elasticsearch returned {resp.status}", "details": body}
        except Exception as exc:
            logger.error("Failed to index in Elasticsearch: %s", exc)
            return {"error": str(exc)}

    async def bulk_index(self, articles: list) -> dict:
        """Indicizza più articoli via Bulk API."""
        url = getattr(settings, "ELASTICSEARCH_URL", "")
        api_key = getattr(settings, "ELASTICSEARCH_API_KEY", "")
        if not url:
            return {"error": "Elasticsearch URL not configured"}

        import json as _json

        lines: list[str] = []
        for article in articles:
            doc = self.build_ecs_document(article)
            doc_id = article.id or str(hash(article.link))
            lines.append(_json.dumps({"index": {"_index": INDEX_NAME, "_id": doc_id}}))
            lines.append(_json.dumps(doc))

        body = "\n".join(lines) + "\n"

        headers: dict[str, str] = {"Content-Type": "application/x-ndjson"}
        if api_key:
            headers["Authorization"] = f"ApiKey {api_key}"

        endpoint = f"{url.rstrip('/')}/_bulk"

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    endpoint, data=body, headers=headers,
                    timeout=aiohttp.ClientTimeout(total=60),
                    ssl=False,
                ) as resp:
                    result = await resp.json()
                    errors = result.get("errors", False)
                    return {
                        "success": not errors,
                        "took": result.get("took"),
                        "indexed": len(articles),
                        "errors": errors,
                    }
        except Exception as exc:
            logger.error("Bulk index failed: %s", exc)
            return {"error": str(exc)}


def _severity_score(severity: str | None) -> int:
    mapping = {"critical": 90, "high": 70, "medium": 40, "low": 10}
    return mapping.get((severity or "low").lower(), 10)


# Singleton
elastic_service = ElasticService()
