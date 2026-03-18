"""Test di integrazione per le API routes (export endpoints, TAXII, task system)."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.data.cache_manager import cache_manager
from app.main import app
from app.models.schemas import ArticleAnalyzed


@pytest.fixture(autouse=True)
def _seed_cache(sample_article: ArticleAnalyzed, sample_article_no_analysis: ArticleAnalyzed):
    """Inserisce articoli di test nella cache prima di ogni test."""
    cache_manager.save_article(sample_article)
    cache_manager.save_article(sample_article_no_analysis)
    yield
    # Cleanup
    try:
        cache_manager.clear_all()
    except Exception:
        pass


@pytest.mark.asyncio
class TestArticleExportAPI:
    """Test endpoint di export per articoli."""

    async def test_export_misp(self, async_client: AsyncClient):
        resp = await async_client.get("/api/articles/test-article-001/export/misp")
        assert resp.status_code == 200
        data = resp.json()
        assert "Event" in data

    async def test_export_yara(self, async_client: AsyncClient):
        resp = await async_client.get("/api/articles/test-article-001/export/yara")
        assert resp.status_code == 200
        assert "rule " in resp.text

    async def test_export_sigma(self, async_client: AsyncClient):
        resp = await async_client.get("/api/articles/test-article-001/export/sigma")
        assert resp.status_code == 200
        assert "title:" in resp.text

    async def test_export_404(self, async_client: AsyncClient):
        resp = await async_client.get("/api/articles/nonexistent/export/misp")
        assert resp.status_code == 404

    async def test_export_no_analysis(self, async_client: AsyncClient):
        resp = await async_client.get("/api/articles/test-article-noanalysis/export/misp")
        assert resp.status_code == 400

    async def test_preview_thehive(self, async_client: AsyncClient):
        resp = await async_client.get("/api/articles/test-article-001/export/thehive")
        assert resp.status_code == 200
        data = resp.json()
        assert data["source"] == "CTI-Feed-RSS"

    async def test_preview_qradar(self, async_client: AsyncClient):
        resp = await async_client.get("/api/articles/test-article-001/export/qradar")
        assert resp.status_code == 200
        data = resp.json()
        assert "reference_sets" in data

    async def test_preview_elasticsearch(self, async_client: AsyncClient):
        resp = await async_client.get("/api/articles/test-article-001/export/elasticsearch")
        assert resp.status_code == 200
        data = resp.json()
        assert data["event"]["kind"] == "enrichment"


@pytest.mark.asyncio
class TestTAXIIAPI:
    """Test endpoint TAXII 2.1."""

    async def test_discovery(self, async_client: AsyncClient):
        resp = await async_client.get("/api/taxii2")
        assert resp.status_code == 200
        data = resp.json()
        assert "title" in data
        assert "api_roots" in data

    async def test_collections(self, async_client: AsyncClient):
        resp = await async_client.get("/api/taxii2/collections")
        assert resp.status_code == 200
        data = resp.json()
        assert "collections" in data
        assert len(data["collections"]) > 0

    async def test_collection_detail(self, async_client: AsyncClient):
        resp = await async_client.get("/api/taxii2/collections/cti-feed-rss-intel")
        assert resp.status_code == 200
        data = resp.json()
        assert data["can_read"] is True

    async def test_collection_not_found(self, async_client: AsyncClient):
        resp = await async_client.get("/api/taxii2/collections/nonexistent")
        assert resp.status_code == 404

    async def test_objects(self, async_client: AsyncClient):
        resp = await async_client.get("/api/taxii2/collections/cti-feed-rss-intel/objects")
        assert resp.status_code == 200
        data = resp.json()
        assert "objects" in data

    async def test_manifest(self, async_client: AsyncClient):
        resp = await async_client.get("/api/taxii2/collections/cti-feed-rss-intel/manifest")
        assert resp.status_code == 200
        data = resp.json()
        assert "objects" in data


@pytest.mark.asyncio
class TestTaskSystem:
    """Test del sistema task in background."""

    async def test_task_not_found(self, async_client: AsyncClient):
        resp = await async_client.get("/api/tasks/nonexistent")
        assert resp.status_code == 404


@pytest.mark.asyncio
class TestExistingEndpoints:
    """Verifica che gli endpoint esistenti funzionino ancora."""

    async def test_list_feeds(self, async_client: AsyncClient):
        resp = await async_client.get("/api/feeds")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_list_articles(self, async_client: AsyncClient):
        resp = await async_client.get("/api/articles")
        assert resp.status_code == 200
        data = resp.json()
        assert "articles" in data
        assert "total" in data

    async def test_get_article(self, async_client: AsyncClient):
        resp = await async_client.get("/api/articles/test-article-001")
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "APT41 targets European banks with PlugX"

    async def test_dashboard_stats(self, async_client: AsyncClient):
        resp = await async_client.get("/api/dashboard/stats")
        assert resp.status_code == 200

    async def test_categories(self, async_client: AsyncClient):
        resp = await async_client.get("/api/categories")
        assert resp.status_code == 200

    async def test_ai_status(self, async_client: AsyncClient):
        resp = await async_client.get("/api/ai/status")
        assert resp.status_code == 200

    async def test_cache_stats(self, async_client: AsyncClient):
        resp = await async_client.get("/api/cache/stats")
        assert resp.status_code == 200
