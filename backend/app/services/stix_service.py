"""Servizio di generazione oggetti STIX 2.1.

Converte le analisi AI in bundle STIX 2.1 (Structured Threat Information eXpression)
conformi allo standard OASIS per la condivisione di intelligence sulle minacce.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from stix2 import (
    AttackPattern,
    Bundle,
    Identity,
    Indicator,
    IntrusionSet,
    Malware,
    Note,
    Relationship,
    Report,
    ThreatActor as STIXThreatActor,
    Vulnerability as STIXVulnerability,
)

from app.models.schemas import (
    AIAnalysis,
    ArticleAnalyzed,
    ThreatCategory,
)

logger = logging.getLogger(__name__)

# Identità dell'organizzazione che genera i report
CTI_IDENTITY = Identity(
    name="CTI Feed RSS Analyzer",
    identity_class="system",
    description="Automated CTI analysis system",
)

# Mappatura categorie -> settori STIX
SECTOR_MAPPING = {
    ThreatCategory.FINANCE: "financial-services",
    ThreatCategory.HEALTHCARE: "healthcare",
    ThreatCategory.GOVERNMENT: "government-national",
    ThreatCategory.ENERGY: "energy",
    ThreatCategory.TELECOMMUNICATIONS: "telecommunications",
    ThreatCategory.MANUFACTURING: "manufacturing",
    ThreatCategory.EDUCATION: "education",
    ThreatCategory.RETAIL: "retail",
    ThreatCategory.TECHNOLOGY: "technology",
    ThreatCategory.TRANSPORTATION: "transportation",
    ThreatCategory.DEFENSE: "defense",
    ThreatCategory.CRITICAL_INFRASTRUCTURE: "utilities",
}


class STIXService:
    """Genera bundle STIX 2.1 dalle analisi AI."""

    def generate_bundle(self, article: ArticleAnalyzed) -> dict:
        """Genera un bundle STIX 2.1 completo da un articolo analizzato."""
        if not article.analysis:
            return Bundle(objects=[CTI_IDENTITY]).serialize()

        analysis = article.analysis
        stix_objects = [CTI_IDENTITY]
        relationships = []

        # ── Threat Actors ──────────────────────────────────────────────────
        threat_actor_objs = []
        for ta in analysis.threat_actors:
            try:
                stix_ta = STIXThreatActor(
                    name=ta.name,
                    aliases=ta.aliases if ta.aliases else None,
                    description=f"Motivation: {ta.motivation}" if ta.motivation else None,
                    threat_actor_types=["unknown"],
                    created_by_ref=CTI_IDENTITY.id,
                )
                stix_objects.append(stix_ta)
                threat_actor_objs.append(stix_ta)
            except Exception as e:
                logger.warning("Error creating STIX ThreatActor %s: %s", ta.name, e)

        # ── Malware ────────────────────────────────────────────────────────
        malware_objs = []
        for mw_name in analysis.malware_families:
            try:
                malware = Malware(
                    name=mw_name,
                    is_family=True,
                    malware_types=["unknown"],
                    created_by_ref=CTI_IDENTITY.id,
                )
                stix_objects.append(malware)
                malware_objs.append(malware)

                # Relazione threat actor -> usa malware
                for ta_obj in threat_actor_objs:
                    rel = Relationship(
                        relationship_type="uses",
                        source_ref=ta_obj.id,
                        target_ref=malware.id,
                        created_by_ref=CTI_IDENTITY.id,
                    )
                    relationships.append(rel)

            except Exception as e:
                logger.warning("Error creating STIX Malware %s: %s", mw_name, e)

        # ── Attack Patterns (MITRE ATT&CK) ────────────────────────────────
        for technique in analysis.attack_techniques:
            try:
                pattern = AttackPattern(
                    name=technique.technique_name,
                    description=technique.description or "",
                    external_references=[
                        {
                            "source_name": "mitre-attack",
                            "external_id": technique.technique_id,
                            "url": f"https://attack.mitre.org/techniques/{technique.technique_id.replace('.', '/')}/",
                        }
                    ],
                    created_by_ref=CTI_IDENTITY.id,
                )
                stix_objects.append(pattern)

                # Relazione threat actor -> usa tecnica
                for ta_obj in threat_actor_objs:
                    rel = Relationship(
                        relationship_type="uses",
                        source_ref=ta_obj.id,
                        target_ref=pattern.id,
                        created_by_ref=CTI_IDENTITY.id,
                    )
                    relationships.append(rel)

            except Exception as e:
                logger.warning("Error creating AttackPattern %s: %s", technique.technique_id, e)

        # ── Indicators of Compromise ───────────────────────────────────────
        indicator_objs = []
        for ioc in analysis.indicators:
            pattern_str = self._ioc_to_stix_pattern(ioc.type, ioc.value)
            if not pattern_str:
                continue

            try:
                indicator = Indicator(
                    name=f"{ioc.type}: {ioc.value}",
                    description=ioc.context or f"IoC extracted from: {article.title}",
                    pattern=pattern_str,
                    pattern_type="stix",
                    valid_from=datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
                    indicator_types=["malicious-activity"],
                    created_by_ref=CTI_IDENTITY.id,
                )
                stix_objects.append(indicator)
                indicator_objs.append(indicator)

                # Relazione indicatore -> indica threat actor
                for ta_obj in threat_actor_objs:
                    rel = Relationship(
                        relationship_type="indicates",
                        source_ref=indicator.id,
                        target_ref=ta_obj.id,
                        created_by_ref=CTI_IDENTITY.id,
                    )
                    relationships.append(rel)

            except Exception as e:
                logger.warning("Error creating Indicator %s: %s", ioc.value, e)

        # ── Vulnerabilities ────────────────────────────────────────────────
        for vuln in analysis.vulnerabilities:
            try:
                stix_vuln = STIXVulnerability(
                    name=vuln.cve_id,
                    description=vuln.description or "",
                    external_references=[
                        {
                            "source_name": "cve",
                            "external_id": vuln.cve_id,
                            "url": f"https://nvd.nist.gov/vuln/detail/{vuln.cve_id}",
                        }
                    ],
                    created_by_ref=CTI_IDENTITY.id,
                )
                stix_objects.append(stix_vuln)
            except Exception as e:
                logger.warning("Error creating Vulnerability %s: %s", vuln.cve_id, e)

        # ── Victim Identity (settori colpiti) ──────────────────────────────
        for sector in analysis.affected_sectors:
            stix_sector = SECTOR_MAPPING.get(sector)
            if stix_sector:
                try:
                    victim = Identity(
                        name=f"{sector.value} sector",
                        identity_class="class",
                        sectors=[stix_sector],
                        created_by_ref=CTI_IDENTITY.id,
                    )
                    stix_objects.append(victim)

                    for ta_obj in threat_actor_objs:
                        rel = Relationship(
                            relationship_type="targets",
                            source_ref=ta_obj.id,
                            target_ref=victim.id,
                            created_by_ref=CTI_IDENTITY.id,
                        )
                        relationships.append(rel)

                except Exception as e:
                    logger.warning("Error creating victim Identity: %s", e)

        # ── Report STIX ───────────────────────────────────────────────────
        all_object_refs = [obj.id for obj in stix_objects if obj != CTI_IDENTITY]
        all_object_refs.extend([r.id for r in relationships])

        if all_object_refs:
            try:
                stix_report = Report(
                    name=article.title,
                    description=analysis.summary_en or analysis.summary_it,
                    published=datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
                    object_refs=all_object_refs,
                    report_types=["threat-report"],
                    created_by_ref=CTI_IDENTITY.id,
                    external_references=[
                        {
                            "source_name": article.feed_name or article.feed_id,
                            "url": article.link,
                        }
                    ],
                )
                stix_objects.append(stix_report)
            except Exception as e:
                logger.warning("Error creating STIX Report: %s", e)

        # ── Note con analisi ───────────────────────────────────────────────
        if analysis.key_findings:
            try:
                findings_text = "\n".join(
                    f"- {f}" for f in analysis.key_findings
                )
                note = Note(
                    content=f"Key Findings:\n{findings_text}\n\nSeverity: {analysis.severity.value}\nConfidence: {analysis.confidence_score}",
                    object_refs=[stix_objects[-1].id] if len(stix_objects) > 1 else [CTI_IDENTITY.id],
                    created_by_ref=CTI_IDENTITY.id,
                )
                stix_objects.append(note)
            except Exception as e:
                logger.warning("Error creating STIX Note: %s", e)

        # ── Costruisci Bundle ──────────────────────────────────────────────
        stix_objects.extend(relationships)

        try:
            bundle = Bundle(objects=stix_objects)
            return bundle.serialize()
        except Exception as e:
            logger.error("Error creating STIX Bundle: %s", e)
            return Bundle(objects=[CTI_IDENTITY]).serialize()

    def _ioc_to_stix_pattern(self, ioc_type: str, value: str) -> Optional[str]:
        """Converte un IoC in un pattern STIX."""
        # Sanitizza il valore per il pattern STIX
        safe_value = value.replace("'", "\\'")

        patterns = {
            "ip": f"[ipv4-addr:value = '{safe_value}']",
            "ipv4": f"[ipv4-addr:value = '{safe_value}']",
            "ipv6": f"[ipv6-addr:value = '{safe_value}']",
            "domain": f"[domain-name:value = '{safe_value}']",
            "url": f"[url:value = '{safe_value}']",
            "email": f"[email-addr:value = '{safe_value}']",
            "hash_md5": f"[file:hashes.MD5 = '{safe_value}']",
            "hash_sha1": f"[file:hashes.'SHA-1' = '{safe_value}']",
            "hash_sha256": f"[file:hashes.'SHA-256' = '{safe_value}']",
            "filename": f"[file:name = '{safe_value}']",
        }
        return patterns.get(ioc_type)

    def get_bundle_summary(self, bundle_data: dict) -> dict:
        """Restituisce un riepilogo del bundle STIX."""
        objects = bundle_data.get("objects", [])
        type_counts: dict[str, int] = {}
        for obj in objects:
            obj_type = obj.get("type", "unknown")
            type_counts[obj_type] = type_counts.get(obj_type, 0) + 1

        return {
            "total_objects": len(objects),
            "object_types": type_counts,
            "bundle_id": bundle_data.get("id", ""),
        }


# Singleton
stix_service = STIXService()
