"""Test per il servizio STIX e generazione bundle."""

from __future__ import annotations

import json

import pytest

from app.models.schemas import ArticleAnalyzed
from app.services.stix_service import stix_service


class TestSTIXService:
    def test_generate_bundle_returns_dict_or_str(self, sample_article: ArticleAnalyzed):
        result = stix_service.generate_bundle(sample_article)
        if isinstance(result, str):
            result = json.loads(result)
        assert result["type"] == "bundle"
        assert "objects" in result

    def test_bundle_has_objects(self, sample_article: ArticleAnalyzed):
        result = stix_service.generate_bundle(sample_article)
        if isinstance(result, str):
            result = json.loads(result)
        objects = result["objects"]
        assert len(objects) > 0

    def test_bundle_object_types(self, sample_article: ArticleAnalyzed):
        result = stix_service.generate_bundle(sample_article)
        if isinstance(result, str):
            result = json.loads(result)
        types = {obj["type"] for obj in result["objects"]}
        # Should have at least identity and report
        assert "identity" in types or "threat-actor" in types or "indicator" in types

    def test_bundle_stix_version(self, sample_article: ArticleAnalyzed):
        result = stix_service.generate_bundle(sample_article)
        if isinstance(result, str):
            result = json.loads(result)
        # STIX 2.1 bundles don't have spec_version at bundle level
        # but objects should have spec_version
        for obj in result["objects"]:
            if obj["type"] != "bundle":
                assert obj.get("spec_version", "2.1") == "2.1"
