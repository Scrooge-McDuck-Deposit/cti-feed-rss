"""Test di integrazione per i servizi di export (MISP, YARA, Sigma, TheHive, QRadar, Elasticsearch)."""

from __future__ import annotations

import json

import pytest
import yaml

from app.models.schemas import ArticleAnalyzed
from app.services.misp_service import misp_service
from app.services.yara_service import yara_service
from app.services.sigma_service import sigma_service
from app.services.thehive_service import thehive_service
from app.services.qradar_service import qradar_service
from app.services.elastic_service import elastic_service


# ── MISP ──────────────────────────────────────────────────────────────────────


class TestMISPService:
    def test_build_misp_event_structure(self, sample_article: ArticleAnalyzed):
        event = misp_service.build_misp_event(sample_article)
        assert "Event" in event
        e = event["Event"]
        assert e["info"] == sample_article.title
        assert int(e["threat_level_id"]) <= 4
        assert e["analysis"] == "2"  # completed
        assert isinstance(e["Attribute"], list)
        assert len(e["Attribute"]) > 0

    def test_misp_attributes_have_required_fields(self, sample_article: ArticleAnalyzed):
        event = misp_service.build_misp_event(sample_article)
        for attr in event["Event"]["Attribute"]:
            assert "type" in attr
            assert "value" in attr
            assert "category" in attr
            assert "to_ids" in attr

    def test_misp_tags_present(self, sample_article: ArticleAnalyzed):
        event = misp_service.build_misp_event(sample_article)
        tags = event["Event"].get("Tag", [])
        tag_names = [t["name"] for t in tags]
        # Should have TLP and category tags
        assert any("tlp" in t.lower() for t in tag_names)

    def test_misp_galaxy_clusters(self, sample_article: ArticleAnalyzed):
        event = misp_service.build_misp_event(sample_article)
        galaxies = event["Event"].get("Galaxy", [])
        # Should have threat actor galaxy since sample has APT41
        assert len(galaxies) > 0

    def test_misp_empty_analysis(self, sample_article_no_analysis: ArticleAnalyzed):
        event = misp_service.build_misp_event(sample_article_no_analysis)
        # Should return empty or minimal event
        assert event == {} or "Event" in event


# ── YARA ──────────────────────────────────────────────────────────────────────


class TestYARAService:
    def test_generate_rules_not_empty(self, sample_article: ArticleAnalyzed):
        rules = yara_service.generate_rules(sample_article)
        assert isinstance(rules, str)
        assert len(rules) > 0
        assert "rule " in rules

    def test_rules_contain_hash(self, sample_article: ArticleAnalyzed):
        rules = yara_service.generate_rules(sample_article)
        # Should reference the MD5 hash from sample
        assert "d41d8cd98f00b204e9800998ecf8427e" in rules

    def test_rules_have_meta_block(self, sample_article: ArticleAnalyzed):
        rules = yara_service.generate_rules(sample_article)
        assert "meta:" in rules
        assert "author" in rules

    def test_rules_valid_syntax(self, sample_article: ArticleAnalyzed):
        rules = yara_service.generate_rules(sample_article)
        # Every 'rule X {' should have a matching '}'
        opens = rules.count("{")
        closes = rules.count("}")
        assert opens == closes
        assert opens > 0


# ── Sigma ─────────────────────────────────────────────────────────────────────


class TestSigmaService:
    def test_generate_rules_not_empty(self, sample_article: ArticleAnalyzed):
        rules = sigma_service.generate_rules(sample_article)
        assert isinstance(rules, str)
        assert len(rules) > 0

    def test_rules_are_valid_yaml(self, sample_article: ArticleAnalyzed):
        rules_text = sigma_service.generate_rules(sample_article)
        # Sigma rules are separated by ---
        docs = list(yaml.safe_load_all(rules_text))
        assert len(docs) > 0
        for doc in docs:
            if doc is None:
                continue
            assert "title" in doc
            assert "logsource" in doc
            assert "detection" in doc

    def test_rules_have_mitre_tags(self, sample_article: ArticleAnalyzed):
        rules_text = sigma_service.generate_rules(sample_article)
        # The sample has T1566.001 and T1059.001
        assert "attack.t1566.001" in rules_text.lower() or "attack.t1059.001" in rules_text.lower()

    def test_rules_reference_iocs(self, sample_article: ArticleAnalyzed):
        rules_text = sigma_service.generate_rules(sample_article)
        # Should contain at least one IoC value
        assert "198.51.100.1" in rules_text or "evil.example.com" in rules_text


# ── TheHive ───────────────────────────────────────────────────────────────────


class TestTheHiveService:
    def test_build_alert_structure(self, sample_article: ArticleAnalyzed):
        alert = thehive_service.build_alert(sample_article)
        assert alert["type"] == "external"
        assert alert["source"] == "CTI-Feed-RSS"
        assert alert["severity"] == 3  # HIGH -> 3
        assert isinstance(alert["tags"], list)
        assert isinstance(alert["observables"], list)

    def test_alert_observables_match_iocs(self, sample_article: ArticleAnalyzed):
        alert = thehive_service.build_alert(sample_article)
        obs = alert["observables"]
        data_values = {o["data"] for o in obs}
        assert "198.51.100.1" in data_values
        assert "evil.example.com" in data_values

    def test_alert_tags_contain_mitre(self, sample_article: ArticleAnalyzed):
        alert = thehive_service.build_alert(sample_article)
        tags = alert["tags"]
        assert any(t.startswith("mitre:") for t in tags)

    def test_build_alert_no_analysis(self, sample_article_no_analysis: ArticleAnalyzed):
        alert = thehive_service.build_alert(sample_article_no_analysis)
        assert alert == {}

    @pytest.mark.asyncio
    async def test_push_alert_no_config(self, sample_article: ArticleAnalyzed):
        """Without URL/key configured, push_alert returns error."""
        result = await thehive_service.push_alert(sample_article)
        assert "error" in result


# ── QRadar ────────────────────────────────────────────────────────────────────


class TestQRadarService:
    def test_build_reference_entries(self, sample_article: ArticleAnalyzed):
        entries = qradar_service.build_reference_entries(sample_article)
        assert isinstance(entries, dict)
        # Should have at least IPs and domains from sample
        assert any("IP" in k for k in entries)
        assert any("Domain" in k for k in entries)

    def test_entries_contain_correct_values(self, sample_article: ArticleAnalyzed):
        entries = qradar_service.build_reference_entries(sample_article)
        all_values = []
        for vals in entries.values():
            all_values.extend(vals)
        assert "198.51.100.1" in all_values
        assert "evil.example.com" in all_values

    def test_offense_note_format(self, sample_article: ArticleAnalyzed):
        note = qradar_service.build_offense_note(sample_article)
        assert "[CTI-Feed-RSS]" in note
        assert sample_article.title in note
        assert "APT41" in note

    def test_export_payload_complete(self, sample_article: ArticleAnalyzed):
        payload = qradar_service.build_export_payload(sample_article)
        assert "reference_sets" in payload
        assert "offense_note" in payload
        assert payload["article_id"] == sample_article.id

    @pytest.mark.asyncio
    async def test_push_indicators_no_config(self, sample_article: ArticleAnalyzed):
        result = await qradar_service.push_indicators(sample_article)
        assert "error" in result


# ── Elasticsearch ─────────────────────────────────────────────────────────────


class TestElasticService:
    def test_build_ecs_document(self, sample_article: ArticleAnalyzed):
        doc = elastic_service.build_ecs_document(sample_article)
        assert "@timestamp" in doc
        assert doc["event"]["kind"] == "enrichment"
        assert doc["event"]["severity"] == 70  # HIGH -> 70
        assert len(doc.get("vulnerability", [])) > 0

    def test_ecs_threat_fields(self, sample_article: ArticleAnalyzed):
        doc = elastic_service.build_ecs_document(sample_article)
        assert "threat" in doc
        threat = doc["threat"]
        # Should have techniques from sample
        if "technique" in threat:
            ids = [t["id"] for t in threat["technique"]]
            assert "T1566.001" in ids

    def test_ecs_group_field(self, sample_article: ArticleAnalyzed):
        doc = elastic_service.build_ecs_document(sample_article)
        groups = doc.get("threat", {}).get("group", [])
        if groups:
            names = [g["name"] for g in groups]
            assert "APT41" in names

    @pytest.mark.asyncio
    async def test_index_article_no_config(self, sample_article: ArticleAnalyzed):
        result = await elastic_service.index_article(sample_article)
        assert "error" in result
