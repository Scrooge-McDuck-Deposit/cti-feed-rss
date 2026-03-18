"""Servizio di export in formato MISP Event JSON.

Genera eventi MISP compatibili con l'import diretto su piattaforme MISP
per la condivisione di threat intelligence tra organizzazioni.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Optional

from app.models.schemas import ArticleAnalyzed, SeverityLevel, ThreatCategory

logger = logging.getLogger(__name__)

# Mappatura IoC type → MISP attribute type
IOC_TYPE_MAP = {
    "ip": "ip-dst",
    "ipv4": "ip-dst",
    "ipv6": "ip-dst",
    "domain": "domain",
    "url": "url",
    "email": "email-src",
    "hash_md5": "md5",
    "hash_sha1": "sha1",
    "hash_sha256": "sha256",
    "filename": "filename",
}

# Mappatura severity → MISP threat_level_id (1=high, 2=medium, 3=low, 4=undefined)
SEVERITY_MAP = {
    SeverityLevel.CRITICAL: 1,
    SeverityLevel.HIGH: 1,
    SeverityLevel.MEDIUM: 2,
    SeverityLevel.LOW: 3,
    SeverityLevel.INFORMATIONAL: 4,
}

# Mappatura categoria → MISP Galaxy cluster
CATEGORY_GALAXY_MAP = {
    ThreatCategory.FINANCE: "financial",
    ThreatCategory.HEALTHCARE: "healthcare",
    ThreatCategory.GOVERNMENT: "government",
    ThreatCategory.ENERGY: "energy",
    ThreatCategory.DEFENSE: "military",
}


class MISPService:
    """Genera eventi MISP JSON da articoli analizzati."""

    def generate_misp_event(self, article: ArticleAnalyzed) -> dict:
        """Genera un MISP Event JSON completo da un articolo analizzato."""
        if not article.analysis:
            return self._empty_event(article)

        analysis = article.analysis
        event_uuid = str(uuid.uuid5(uuid.NAMESPACE_URL, f"cti-feed-rss:{article.id}"))
        now = datetime.utcnow().strftime("%Y-%m-%d")

        # Build attributes
        attributes = []
        attr_uuid_counter = 0

        for ioc in analysis.indicators:
            misp_type = IOC_TYPE_MAP.get(ioc.type)
            if not misp_type:
                continue
            attr_uuid_counter += 1
            attributes.append({
                "uuid": str(uuid.uuid5(uuid.NAMESPACE_URL, f"{event_uuid}:attr:{attr_uuid_counter}")),
                "type": misp_type,
                "category": self._ioc_to_misp_category(ioc.type),
                "value": ioc.value,
                "comment": ioc.context or f"Extracted from: {article.title}",
                "to_ids": True,
                "disable_correlation": False,
            })

        # Add CVE as attributes
        for vuln in analysis.vulnerabilities:
            attr_uuid_counter += 1
            attributes.append({
                "uuid": str(uuid.uuid5(uuid.NAMESPACE_URL, f"{event_uuid}:attr:{attr_uuid_counter}")),
                "type": "vulnerability",
                "category": "External analysis",
                "value": vuln.cve_id,
                "comment": vuln.description or "",
                "to_ids": False,
                "disable_correlation": False,
            })

        # Build tags
        tags = []
        tags.append({"name": "tlp:amber", "colour": "#FFC000"})
        tags.append({"name": f"cti-feed-rss:category={analysis.threat_category.value}"})

        if analysis.severity:
            tags.append({"name": f"cti-feed-rss:severity={analysis.severity.value}"})

        for tech in analysis.attack_techniques:
            tags.append({
                "name": f"misp-galaxy:mitre-attack-pattern=\"{tech.technique_name} - {tech.technique_id}\""
            })

        for mw in analysis.malware_families:
            tags.append({"name": f"misp-galaxy:malpedia=\"{mw}\""})

        # Build Galaxy clusters for threat actors
        galaxies = []
        if analysis.threat_actors:
            galaxy_clusters = []
            for ta in analysis.threat_actors:
                cluster = {
                    "uuid": str(uuid.uuid5(uuid.NAMESPACE_URL, f"threat-actor:{ta.name}")),
                    "value": ta.name,
                    "description": f"Motivation: {ta.motivation}" if ta.motivation else "",
                    "meta": {},
                }
                if ta.aliases:
                    cluster["meta"]["synonyms"] = ta.aliases
                if ta.country:
                    cluster["meta"]["country"] = ta.country
                galaxy_clusters.append(cluster)

            galaxies.append({
                "uuid": "698774c7-8022-42c4-917f-8d6e4f06ada3",
                "name": "Threat Actor",
                "type": "threat-actor",
                "description": "Threat actors identified in this report",
                "GalaxyCluster": galaxy_clusters,
            })

        # Build MITRE ATT&CK galaxy
        if analysis.attack_techniques:
            attack_clusters = []
            for tech in analysis.attack_techniques:
                attack_clusters.append({
                    "uuid": str(uuid.uuid5(uuid.NAMESPACE_URL, f"mitre:{tech.technique_id}")),
                    "value": f"{tech.technique_name} - {tech.technique_id}",
                    "description": tech.description or "",
                    "meta": {
                        "external_id": [tech.technique_id],
                        "kill_chain": [f"mitre-attack:{tech.tactic}"] if tech.tactic else [],
                        "refs": [f"https://attack.mitre.org/techniques/{tech.technique_id.replace('.', '/')}/"],
                    },
                })

            galaxies.append({
                "uuid": "c4e851fa-775f-11e7-8163-b774922098cd",
                "name": "Attack Pattern",
                "type": "mitre-attack-pattern",
                "description": "MITRE ATT&CK techniques",
                "GalaxyCluster": attack_clusters,
            })

        event = {
            "Event": {
                "uuid": event_uuid,
                "info": article.title,
                "date": now,
                "threat_level_id": str(SEVERITY_MAP.get(analysis.severity, 4)),
                "analysis": "2",  # 2 = completed
                "distribution": "1",  # 1 = community
                "published": False,
                "Orgc": {
                    "name": "CTI Feed RSS Analyzer",
                    "uuid": "a]b1c2d3-e4f5-6789-abcd-ef0123456789",
                },
                "Tag": tags,
                "Attribute": attributes,
                "Galaxy": galaxies,
                "Object": [],
            }
        }

        return event

    def _empty_event(self, article: ArticleAnalyzed) -> dict:
        """Genera un evento MISP vuoto per articoli non analizzati."""
        return {
            "Event": {
                "uuid": str(uuid.uuid5(uuid.NAMESPACE_URL, f"cti-feed-rss:{article.id}")),
                "info": article.title,
                "date": datetime.utcnow().strftime("%Y-%m-%d"),
                "threat_level_id": "4",
                "analysis": "0",
                "Attribute": [],
                "Tag": [],
                "Galaxy": [],
            }
        }

    def _ioc_to_misp_category(self, ioc_type: str) -> str:
        """Mappa il tipo IoC alla categoria MISP."""
        mapping = {
            "ip": "Network activity",
            "ipv4": "Network activity",
            "ipv6": "Network activity",
            "domain": "Network activity",
            "url": "Network activity",
            "email": "Network activity",
            "hash_md5": "Payload delivery",
            "hash_sha1": "Payload delivery",
            "hash_sha256": "Payload delivery",
            "filename": "Payload delivery",
        }
        return mapping.get(ioc_type, "External analysis")


# Singleton
misp_service = MISPService()
