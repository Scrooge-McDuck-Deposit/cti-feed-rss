"""Fixtures condivise per i test di integrazione."""

from __future__ import annotations

from datetime import datetime

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.schemas import (
    AIAnalysis,
    ArticleAnalyzed,
    ArticleStatus,
    AttackTechnique,
    SeverityLevel,
    ThreatActor,
    ThreatCategory,
    ThreatIndicator,
    Vulnerability,
)


@pytest.fixture
def sample_analysis() -> AIAnalysis:
    """Analisi AI di esempio con dati realistici."""
    return AIAnalysis(
        summary_it="Campagna APT41 mirata al settore finanziario europeo.",
        summary_en="APT41 campaign targeting the European financial sector.",
        threat_category=ThreatCategory.FINANCE,
        severity=SeverityLevel.HIGH,
        threat_actors=[
            ThreatActor(
                name="APT41",
                aliases=["Barium", "Winnti"],
                motivation="financial",
                country="CN",
            )
        ],
        indicators=[
            ThreatIndicator(type="ip", value="198.51.100.1", context="C2 server"),
            ThreatIndicator(type="domain", value="evil.example.com", context="Phishing domain"),
            ThreatIndicator(type="hash", value="d41d8cd98f00b204e9800998ecf8427e", context="Payload MD5"),
            ThreatIndicator(type="url", value="https://evil.example.com/payload", context="Dropper URL"),
            ThreatIndicator(type="email", value="phish@evil.example.com", context="Sender"),
        ],
        attack_techniques=[
            AttackTechnique(
                technique_id="T1566.001",
                technique_name="Spearphishing Attachment",
                tactic="initial-access",
                description="Spear-phishing con allegato.",
            ),
            AttackTechnique(
                technique_id="T1059.001",
                technique_name="PowerShell",
                tactic="execution",
            ),
        ],
        vulnerabilities=[
            Vulnerability(
                cve_id="CVE-2024-12345",
                description="Remote code execution in ExampleApp",
                cvss_score=9.8,
                affected_products=["ExampleApp 1.0"],
            )
        ],
        affected_sectors=[ThreatCategory.FINANCE, ThreatCategory.TECHNOLOGY],
        malware_families=["PlugX", "ShadowPad"],
        recommendations=["Bloccare IP 198.51.100.1 sul firewall"],
        key_findings=["APT41 usa PlugX come backdoor primaria"],
        tags=["apt41", "plugx", "finance"],
        confidence_score=0.85,
    )


@pytest.fixture
def sample_article(sample_analysis: AIAnalysis) -> ArticleAnalyzed:
    """Articolo analizzato di esempio."""
    return ArticleAnalyzed(
        id="test-article-001",
        feed_id="test-feed",
        feed_name="Test Feed",
        title="APT41 targets European banks with PlugX",
        link="https://example.com/apt41-plugx",
        published=datetime(2024, 6, 15, 12, 0, 0),
        summary="APT41 has been observed targeting European financial institutions.",
        content="Full article content about APT41 campaign...",
        author="Threat Intel Team",
        tags=["apt41", "plugx"],
        status=ArticleStatus.ANALYZED,
        fetched_at=datetime(2024, 6, 15, 14, 0, 0),
        analysis=sample_analysis,
        stix_bundle={
            "type": "bundle",
            "id": "bundle--test-001",
            "objects": [
                {
                    "type": "threat-actor",
                    "id": "threat-actor--test-001",
                    "name": "APT41",
                    "created": "2024-06-15T12:00:00Z",
                    "modified": "2024-06-15T12:00:00Z",
                },
                {
                    "type": "indicator",
                    "id": "indicator--test-001",
                    "name": "C2 IP",
                    "pattern": "[ipv4-addr:value = '198.51.100.1']",
                    "pattern_type": "stix",
                    "valid_from": "2024-06-15T12:00:00Z",
                    "created": "2024-06-15T12:00:00Z",
                    "modified": "2024-06-15T12:00:00Z",
                },
            ],
        },
    )


@pytest.fixture
def sample_article_no_analysis() -> ArticleAnalyzed:
    """Articolo senza analisi AI."""
    return ArticleAnalyzed(
        id="test-article-noanalysis",
        feed_id="test-feed",
        feed_name="Test Feed",
        title="Generic news article",
        link="https://example.com/generic",
        status=ArticleStatus.PENDING,
    )


@pytest.fixture
async def async_client():
    """Client HTTP asincrono per test API."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
