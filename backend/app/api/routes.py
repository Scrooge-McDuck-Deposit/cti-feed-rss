"""API Routes per l'applicazione CTI Feed RSS."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Response

from app.data.cache_manager import cache_manager
from app.config import settings
from app.data.feeds import (
    get_all_feeds,
    get_enabled_feeds,
    get_feed_by_id,
    get_feeds_by_category,
    get_feeds_by_language,
)
from app.models.schemas import (
    AIAnalysis,
    ArticleAnalyzed,
    ArticleListResponse,
    ArticleStatus,
    DashboardStats,
    FeedSourceResponse,
    ReportRequest,
    STIXBundleResponse,
    TechnicalReport,
    ThreatCategory,
    SearchQuery,
    SearchResult,
    SearchResponse,
    MonitoredAsset,
    AssetAlert,
)
from app.services.ai_service import ai_service
from app.services.categorizer import categorizer_service
from app.services.rss_service import rss_service
from app.services.stix_service import stix_service
from app.services.opml_service import import_from_opml_url, import_from_opml_content
from app.services.misp_service import misp_service
from app.services.yara_service import yara_service
from app.services.sigma_service import sigma_service
from app.services.taxii_service import taxii_service, TAXII_MEDIA_TYPE, COLLECTION_ID, API_ROOT
from app.services.thehive_service import thehive_service
from app.services.qradar_service import qradar_service
from app.services.elastic_service import elastic_service
from app.services.watchlist_service import watchlist_service

logger = logging.getLogger(__name__)

router = APIRouter()

# ── Background Task Registry ──────────────────────────────────────────────────

_task_registry: dict[str, dict] = {}

# ── Favorites & Excluded Sources (in-memory + file persistence) ───────────────

_favorites_file = settings.CACHE_DIR / "favorites.json"
_excluded_sources_file = settings.CACHE_DIR / "excluded_sources.json"


def _load_json_set(path) -> set[str]:
    try:
        if path.exists():
            return set(json.loads(path.read_text(encoding="utf-8")))
    except (json.JSONDecodeError, OSError):
        pass
    return set()


def _save_json_set(path, data: set[str]):
    path.write_text(json.dumps(sorted(data)), encoding="utf-8")


_favorites: set[str] = _load_json_set(_favorites_file)
_excluded_sources: set[str] = _load_json_set(_excluded_sources_file)

# Maximum article age: 6 months
_MAX_ARTICLE_AGE = timedelta(days=180)


async def _run_fetch_task(task_id: str, feed_id: Optional[str] = None):
    """Background worker for article fetching."""
    _task_registry[task_id]["status"] = "running"
    try:
        if feed_id:
            articles = await rss_service.fetch_feed_by_id(feed_id)
        else:
            articles = await rss_service.fetch_all_feeds()

        new_count = 0
        for article in articles:
            existing = cache_manager.get_article(article.id)
            if not existing:
                feed = get_feed_by_id(article.feed_id)
                analyzed = ArticleAnalyzed(
                    **article.model_dump(),
                    feed_name=feed.name if feed else "",
                )
                cache_manager.save_article(analyzed)
                new_count += 1

        _task_registry[task_id].update({
            "status": "completed",
            "total_fetched": len(articles),
            "new_articles": new_count,
            "completed_at": datetime.utcnow().isoformat(),
        })
    except Exception as e:
        logger.error("Background fetch task %s failed: %s", task_id, e)
        _task_registry[task_id].update({
            "status": "error",
            "error": str(e),
            "completed_at": datetime.utcnow().isoformat(),
        })


# ── Feed Endpoints ─────────────────────────────────────────────────────────────


@router.get("/feeds", response_model=list[FeedSourceResponse])
async def list_feeds(
    language: Optional[str] = Query(None, description="Filtra per lingua (it, en, fr, de)"),
    category: Optional[str] = Query(None, description="Filtra per categoria"),
):
    """Restituisce l'elenco di tutti i feed CTI configurati."""
    if language:
        feeds = get_feeds_by_language(language)
    elif category:
        feeds = get_feeds_by_category(category)
    else:
        feeds = get_all_feeds()

    # Aggiungi conteggio articoli dalla cache
    cached_ids = cache_manager.get_cached_article_ids()
    results = []
    for feed in feeds:
        count = sum(1 for aid in cached_ids if cache_manager.get_article(aid) and cache_manager.get_article(aid).feed_id == feed.id)
        results.append(
            FeedSourceResponse(**feed.model_dump(), article_count=count)
        )
    return results


@router.get("/feeds/{feed_id}")
async def get_feed(feed_id: str):
    """Restituisce i dettagli di un singolo feed."""
    feed = get_feed_by_id(feed_id)
    if not feed:
        raise HTTPException(status_code=404, detail="Feed non trovato")
    return feed


# ── Article Endpoints ──────────────────────────────────────────────────────────


@router.post("/articles/fetch")
async def fetch_articles(
    background_tasks: BackgroundTasks,
    feed_id: Optional[str] = None,
):
    """Fetcha gli articoli dai feed RSS in background.

    Restituisce un task_id per il polling dello stato.
    """
    task_id = uuid.uuid4().hex[:12]
    _task_registry[task_id] = {
        "task_id": task_id,
        "status": "pending",
        "created_at": datetime.utcnow().isoformat(),
        "feed_id": feed_id,
    }
    background_tasks.add_task(_run_fetch_task, task_id, feed_id)
    return {
        "task_id": task_id,
        "status": "pending",
        "message": "Fetch avviato in background",
    }


@router.get("/tasks/{task_id}")
async def get_task_status(task_id: str):
    """Restituisce lo stato di un task in background."""
    task = _task_registry.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task non trovato")
    return task


@router.get("/articles", response_model=ArticleListResponse)
async def list_articles(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    category: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    feed_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
):
    """Restituisce gli articoli con paginazione e filtri (ottimizzato con indice)."""
    all_articles = cache_manager.get_filtered_articles(
        category=category,
        severity=severity,
        feed_id=feed_id,
        status=status,
        search=search,
    )

    # Exclude disabled sources and articles older than 6 months
    cutoff_date = datetime.utcnow() - _MAX_ARTICLE_AGE
    all_articles = [
        a for a in all_articles
        if a.feed_id not in _excluded_sources
        and not ((a.published or a.fetched_at) and (a.published or a.fetched_at) < cutoff_date)
    ]

    # Ordina per data (più recenti prima)
    all_articles.sort(
        key=lambda a: a.published or a.fetched_at,
        reverse=True,
    )

    # Paginazione
    total = len(all_articles)
    start = (page - 1) * page_size
    end = start + page_size
    page_articles = all_articles[start:end]

    return ArticleListResponse(
        articles=page_articles,
        total=total,
        page=page,
        page_size=page_size,
        has_next=end < total,
    )


@router.get("/articles/{article_id}", response_model=ArticleAnalyzed)
async def get_article(article_id: str):
    """Restituisce un singolo articolo con analisi."""
    article = cache_manager.get_article(article_id)
    if not article:
        raise HTTPException(status_code=404, detail="Articolo non trovato")
    return article


@router.post("/articles/{article_id}/analyze", response_model=ArticleAnalyzed)
async def analyze_article(article_id: str):
    """Analizza un articolo con l'AI."""
    article = cache_manager.get_article(article_id)
    if not article:
        raise HTTPException(status_code=404, detail="Articolo non trovato")

    if article.status == ArticleStatus.ANALYZED and article.analysis:
        return article

    # Esegui analisi AI
    from app.models.schemas import Article as RawArticle

    raw_article = RawArticle(
        id=article.id,
        feed_id=article.feed_id,
        title=article.title,
        link=article.link,
        published=article.published,
        summary=article.summary,
        content=article.content,
        author=article.author,
        tags=article.tags,
    )

    analysis = await ai_service.analyze_article(raw_article)

    # Genera bundle STIX
    article.analysis = analysis
    article.status = ArticleStatus.ANALYZED

    stix_bundle = stix_service.generate_bundle(article)
    if isinstance(stix_bundle, str):
        stix_bundle = json.loads(stix_bundle)
    article.stix_bundle = stix_bundle

    # Aggiorna cache
    cache_manager.save_article(article)

    return article


@router.post("/articles/analyze-all")
async def analyze_all_pending():
    """Analizza tutti gli articoli in attesa."""
    all_articles = cache_manager.get_all_cached_articles()
    pending = [a for a in all_articles if a.status == ArticleStatus.PENDING]

    analyzed_count = 0
    errors = 0

    for article in pending:
        try:
            from app.models.schemas import Article as RawArticle

            raw = RawArticle(
                id=article.id,
                feed_id=article.feed_id,
                title=article.title,
                link=article.link,
                published=article.published,
                summary=article.summary,
                content=article.content,
                author=article.author,
                tags=article.tags,
            )

            analysis = await ai_service.analyze_article(raw)
            article.analysis = analysis
            article.status = ArticleStatus.ANALYZED

            stix_bundle = stix_service.generate_bundle(article)
            if isinstance(stix_bundle, str):
                stix_bundle = json.loads(stix_bundle)
            article.stix_bundle = stix_bundle

            cache_manager.save_article(article)
            analyzed_count += 1

        except Exception as e:
            logger.error("Error analyzing article %s: %s", article.id, e)
            article.status = ArticleStatus.ERROR
            cache_manager.save_article(article)
            errors += 1

    return {
        "analyzed": analyzed_count,
        "errors": errors,
        "remaining": len(pending) - analyzed_count - errors,
    }


# ── STIX Endpoints ────────────────────────────────────────────────────────────


@router.get("/articles/{article_id}/stix", response_model=STIXBundleResponse)
async def get_article_stix(article_id: str):
    """Restituisce il bundle STIX di un articolo."""
    article = cache_manager.get_article(article_id)
    if not article:
        raise HTTPException(status_code=404, detail="Articolo non trovato")

    if not article.stix_bundle:
        # Genera il bundle STIX se mancante
        if not article.analysis:
            raise HTTPException(
                status_code=400,
                detail="Articolo non ancora analizzato. Eseguire prima l'analisi.",
            )
        stix_bundle = stix_service.generate_bundle(article)
        if isinstance(stix_bundle, str):
            stix_bundle = json.loads(stix_bundle)
        article.stix_bundle = stix_bundle
        cache_manager.save_article(article)

    return STIXBundleResponse(
        article_id=article_id,
        bundle=article.stix_bundle,
        object_count=len(article.stix_bundle.get("objects", [])),
    )


# ── Report Endpoints ──────────────────────────────────────────────────────────


@router.post("/reports/generate", response_model=TechnicalReport)
async def generate_report(request: ReportRequest):
    """Genera un report tecnico da uno o più articoli analizzati."""
    articles = []
    for aid in request.article_ids:
        article = cache_manager.get_article(aid)
        if not article:
            raise HTTPException(
                status_code=404, detail=f"Articolo {aid} non trovato"
            )
        if not article.analysis:
            raise HTTPException(
                status_code=400,
                detail=f"Articolo {aid} non ancora analizzato",
            )
        articles.append(article)

    # Prepara le analisi per il report
    analyses_data = []
    all_iocs = []
    all_techniques = []
    all_sectors = set()

    for article in articles:
        analysis = article.analysis
        analyses_data.append({
            "title": article.title,
            "source": article.feed_name or article.feed_id,
            "summary": analysis.summary_it or analysis.summary_en,
            "severity": analysis.severity.value,
            "threat_actors": [ta.model_dump() for ta in analysis.threat_actors],
            "indicators": [i.model_dump() for i in analysis.indicators],
            "techniques": [t.model_dump() for t in analysis.attack_techniques],
            "key_findings": analysis.key_findings,
        })
        all_iocs.extend(analysis.indicators)
        all_techniques.extend(analysis.attack_techniques)
        all_sectors.update(analysis.affected_sectors)

    # Genera contenuto report con AI
    report_content = await ai_service.generate_report_content(
        analyses_data, request.language
    )

    # Genera bundle STIX combinato
    combined_stix = None
    if request.include_stix and articles:
        # Usa il primo articolo come base per il STIX combinato
        combined_stix = stix_service.generate_bundle(articles[0])
        if isinstance(combined_stix, str):
            combined_stix = json.loads(combined_stix)

    report = TechnicalReport(
        id=uuid.uuid4().hex[:12],
        title=request.title or f"CTI Report - {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}",
        article_ids=request.article_ids,
        executive_summary=report_content.get("executive_summary", ""),
        technical_details=report_content.get("technical_details", ""),
        indicators_of_compromise=all_iocs,
        attack_techniques=all_techniques,
        affected_sectors=list(all_sectors),
        recommendations=report_content.get("recommendations", []),
        stix_bundle=combined_stix,
        severity=report_content.get("overall_severity", "informational"),
    )

    return report


# ── Dashboard / Stats ─────────────────────────────────────────────────────────


@router.get("/dashboard/stats", response_model=DashboardStats)
async def get_dashboard_stats():
    """Restituisce le statistiche per la dashboard."""
    all_articles = cache_manager.get_all_cached_articles()
    feeds = get_all_feeds()
    enabled_feeds = get_enabled_feeds()

    # Conteggi per categoria
    by_category: dict[str, int] = {}
    by_severity: dict[str, int] = {}
    threat_actors_set: set[str] = set()

    analyzed = 0
    pending = 0

    for article in all_articles:
        if article.status == ArticleStatus.ANALYZED and article.analysis:
            analyzed += 1
            cat = article.analysis.threat_category.value
            by_category[cat] = by_category.get(cat, 0) + 1

            sev = article.analysis.severity.value
            by_severity[sev] = by_severity.get(sev, 0) + 1

            for ta in article.analysis.threat_actors:
                threat_actors_set.add(ta.name)
        elif article.status == ArticleStatus.PENDING:
            pending += 1

    return DashboardStats(
        total_articles=len(all_articles),
        analyzed_articles=analyzed,
        pending_articles=pending,
        total_feeds=len(feeds),
        active_feeds=len(enabled_feeds),
        articles_by_category=by_category,
        articles_by_severity=by_severity,
        recent_threat_actors=sorted(threat_actors_set)[:20],
        last_update=datetime.utcnow(),
    )


# ── Categories ─────────────────────────────────────────────────────────────────


@router.get("/categories")
async def list_categories():
    """Restituisce tutte le categorie disponibili con i nomi display."""
    return [
        {
            "id": cat.value,
            "name": categorizer_service.get_category_display_name(cat),
        }
        for cat in ThreatCategory
    ]


# ── Cache Management ──────────────────────────────────────────────────────────


@router.get("/cache/stats")
async def cache_stats():
    """Restituisce statistiche sulla cache."""
    return cache_manager.get_cache_stats()


@router.post("/cache/cleanup")
async def cache_cleanup():
    """Pulisce la cache da elementi scaduti."""
    removed = cache_manager.cleanup_expired()
    return {"removed": removed}


@router.delete("/cache")
async def cache_clear():
    """Svuota completamente la cache."""
    cache_manager.clear_all()
    return {"message": "Cache svuotata"}


# ── OPML Import ────────────────────────────────────────────────────────────────



@router.post("/feeds/import-opml")
async def import_opml(url: Optional[str] = Query(None, description="URL del file OPML")):
    """Importa feed RSS da un file OPML remoto."""
    if not url:
        raise HTTPException(status_code=400, detail="Specificare l'URL del file OPML")

    result = await import_from_opml_url(url)
    if "error" in result:
        raise HTTPException(status_code=502, detail=result["error"])
    return result


# ── Export Endpoints ────────────────────────────────────────────────────────────


@router.get("/articles/{article_id}/export/misp")
async def export_misp(article_id: str):
    """Genera un MISP Event JSON da un articolo analizzato."""
    article = cache_manager.get_article(article_id)
    if not article:
        raise HTTPException(status_code=404, detail="Articolo non trovato")
    if not article.analysis:
        raise HTTPException(status_code=400, detail="Articolo non ancora analizzato")
    return misp_service.build_misp_event(article)


@router.get("/articles/{article_id}/export/yara")
async def export_yara(article_id: str):
    """Genera regole YARA da un articolo analizzato."""
    article = cache_manager.get_article(article_id)
    if not article:
        raise HTTPException(status_code=404, detail="Articolo non trovato")
    if not article.analysis:
        raise HTTPException(status_code=400, detail="Articolo non ancora analizzato")
    rules = yara_service.generate_rules(article)
    return Response(content=rules, media_type="text/x-yara")


@router.get("/articles/{article_id}/export/sigma")
async def export_sigma(article_id: str):
    """Genera regole Sigma da un articolo analizzato."""
    article = cache_manager.get_article(article_id)
    if not article:
        raise HTTPException(status_code=404, detail="Articolo non trovato")
    if not article.analysis:
        raise HTTPException(status_code=400, detail="Articolo non ancora analizzato")
    rules = sigma_service.generate_rules(article)
    return Response(content=rules, media_type="application/x-yaml")


@router.post("/articles/{article_id}/export/thehive")
async def export_thehive(article_id: str):
    """Invia un alert a TheHive da un articolo analizzato."""
    article = cache_manager.get_article(article_id)
    if not article:
        raise HTTPException(status_code=404, detail="Articolo non trovato")
    if not article.analysis:
        raise HTTPException(status_code=400, detail="Articolo non ancora analizzato")
    result = await thehive_service.push_alert(article)
    if "error" in result:
        raise HTTPException(status_code=502, detail=result["error"])
    return result


@router.get("/articles/{article_id}/export/thehive")
async def preview_thehive(article_id: str):
    """Preview del payload TheHive senza invio."""
    article = cache_manager.get_article(article_id)
    if not article:
        raise HTTPException(status_code=404, detail="Articolo non trovato")
    if not article.analysis:
        raise HTTPException(status_code=400, detail="Articolo non ancora analizzato")
    return thehive_service.build_alert(article)


@router.post("/articles/{article_id}/export/qradar")
async def export_qradar(article_id: str):
    """Invia IoC ai reference-set QRadar."""
    article = cache_manager.get_article(article_id)
    if not article:
        raise HTTPException(status_code=404, detail="Articolo non trovato")
    if not article.analysis:
        raise HTTPException(status_code=400, detail="Articolo non ancora analizzato")
    result = await qradar_service.push_indicators(article)
    if "error" in result:
        raise HTTPException(status_code=502, detail=result["error"])
    return result


@router.get("/articles/{article_id}/export/qradar")
async def preview_qradar(article_id: str):
    """Preview del payload QRadar senza invio."""
    article = cache_manager.get_article(article_id)
    if not article:
        raise HTTPException(status_code=404, detail="Articolo non trovato")
    if not article.analysis:
        raise HTTPException(status_code=400, detail="Articolo non ancora analizzato")
    return qradar_service.build_export_payload(article)


@router.post("/articles/{article_id}/export/elasticsearch")
async def export_elasticsearch(article_id: str):
    """Indicizza un articolo in Elasticsearch."""
    article = cache_manager.get_article(article_id)
    if not article:
        raise HTTPException(status_code=404, detail="Articolo non trovato")
    if not article.analysis:
        raise HTTPException(status_code=400, detail="Articolo non ancora analizzato")
    result = await elastic_service.index_article(article)
    if "error" in result:
        raise HTTPException(status_code=502, detail=result["error"])
    return result


@router.get("/articles/{article_id}/export/elasticsearch")
async def preview_elasticsearch(article_id: str):
    """Preview del documento ECS senza indicizzazione."""
    article = cache_manager.get_article(article_id)
    if not article:
        raise HTTPException(status_code=404, detail="Articolo non trovato")
    if not article.analysis:
        raise HTTPException(status_code=400, detail="Articolo non ancora analizzato")
    return elastic_service.build_ecs_document(article)


# ── Search Endpoints ───────────────────────────────────────────────────────────


@router.post("/search", response_model=SearchResponse)
async def search_articles(body: SearchQuery):
    """Ricerca articoli con filtri multipli e scoring AI.

    Non carica tutto: fetcha e filtra on-demand.
    """
    import asyncio

    # Step 1: Se non ci sono articoli in cache, fetcha prima
    all_articles = cache_manager.get_all_cached_articles()

    if not all_articles:
        # Fetch veloce dei feed per avere articoli
        articles_raw = await rss_service.fetch_all_feeds()
        for article in articles_raw:
            existing = cache_manager.get_article(article.id)
            if not existing:
                feed = get_feed_by_id(article.feed_id)
                analyzed = ArticleAnalyzed(
                    **article.model_dump(),
                    feed_name=feed.name if feed else "",
                )
                cache_manager.save_article(analyzed)
        all_articles = cache_manager.get_all_cached_articles()

    # Step 2: Filtra articoli
    filtered = _apply_search_filters(all_articles, body)

    # Step 3: Ordina per ricchezza di contenuto e data
    def _content_richness(art: ArticleAnalyzed) -> float:
        """Score 0-1 based on content completeness."""
        score = 0.0
        if art.content and len(art.content) > 200:
            score += 0.3
        if art.content and len(art.content) > 1000:
            score += 0.1
        if art.summary and len(art.summary) > 100:
            score += 0.1
        if art.analysis:
            if art.analysis.summary_it:
                score += 0.1
            if art.analysis.indicators:
                score += 0.1
            if art.analysis.key_findings:
                score += 0.1
            if art.analysis.threat_actors:
                score += 0.1
            if art.analysis.attack_techniques:
                score += 0.1
        return score

    filtered.sort(
        key=lambda a: (_content_richness(a), a.published or a.fetched_at),
        reverse=True,
    )

    # Step 4: AI scoring (su Max 50 articoli per performance)
    results: list[SearchResult] = []
    score_candidates = filtered[:50]

    if body.ai_score and body.query and ai_service.is_available:
        # Score in batch parallelo (max 10 concurrent)
        sem = asyncio.Semaphore(10)

        async def score_one(art: ArticleAnalyzed):
            async with sem:
                s = await ai_service.score_relevance(
                    art.title,
                    art.summary or (art.analysis.summary_it if art.analysis else ""),
                    body.query,
                    body.categories or None,
                )
                return SearchResult(
                    article=art,
                    relevance_score=s["score"],
                    match_reasons=[s["reason"]] if s["reason"] else [],
                    ai_suggestion=s.get("suggestion", ""),
                )

        scored = await asyncio.gather(*[score_one(a) for a in score_candidates])
        results = sorted(scored, key=lambda r: r.relevance_score, reverse=True)
    else:
        # Scoring base senza AI
        for art in score_candidates:
            score_data = ai_service._basic_score(
                art.title,
                art.summary or "",
                body.query or "",
                body.categories or None,
            )
            # Boost score by content richness
            richness = _content_richness(art)
            base_score = score_data["score"]
            final_score = min(1.0, base_score * 0.6 + richness * 0.4) if not body.query else base_score
            results.append(SearchResult(
                article=art,
                relevance_score=final_score,
                match_reasons=[score_data["reason"]] if score_data["reason"] else [],
            ))
        results.sort(key=lambda r: r.relevance_score, reverse=True)

    # Paginazione
    total = len(results)
    start = (body.page - 1) * body.page_size
    end = start + body.page_size
    page_results = results[start:end]

    # AI suggestions (solo alla prima pagina)
    ai_suggestions = []
    if body.page == 1 and body.query and ai_service.is_available:
        ai_suggestions = await ai_service.generate_search_suggestions(body.query, total)

    query_parts = []
    if body.query:
        query_parts.append(f'"{body.query}"')
    if body.categories:
        query_parts.append(f"categorie: {', '.join(body.categories)}")
    if body.severities:
        query_parts.append(f"severità: {', '.join(body.severities)}")

    return SearchResponse(
        results=page_results,
        total=total,
        page=body.page,
        page_size=body.page_size,
        has_next=end < total,
        query_summary=" | ".join(query_parts) if query_parts else "Tutti gli articoli",
        ai_suggestions=ai_suggestions,
    )


def _apply_search_filters(
    articles: list[ArticleAnalyzed],
    query: SearchQuery,
) -> list[ArticleAnalyzed]:
    """Applica i filtri della ricerca agli articoli."""
    filtered = []
    search_lower = query.query.lower().strip() if query.query else ""
    cutoff_date = datetime.utcnow() - _MAX_ARTICLE_AGE

    for art in articles:
        # Exclude articles from disabled sources
        if art.feed_id in _excluded_sources:
            continue

        # Exclude articles older than 6 months
        art_date = art.published or art.fetched_at
        if art_date and art_date < cutoff_date:
            continue
        # Categoria — skip filter for unanalyzed articles
        if query.categories and art.analysis:
            art_cat = art.analysis.threat_category.value
            if art_cat not in query.categories:
                continue

        # Severità — skip filter for unanalyzed articles
        if query.severities and art.analysis:
            art_sev = art.analysis.severity.value
            if art_sev not in query.severities:
                continue

        # Feed
        if query.feed_ids and art.feed_id not in query.feed_ids:
            continue

        # Date range
        art_date = art.published or art.fetched_at
        if query.date_from and art_date and art_date < query.date_from:
            continue
        if query.date_to and art_date and art_date > query.date_to:
            continue

        # IoC type filter
        if query.ioc_types and art.analysis:
            has_matching_ioc = any(
                ioc.type in query.ioc_types
                for ioc in art.analysis.indicators
            )
            if not has_matching_ioc:
                continue

        # Full-text search
        if search_lower:
            text = f"{art.title} {art.summary} {art.content or ''}".lower()
            # Anche IoC
            if art.analysis:
                ioc_text = " ".join(i.value for i in art.analysis.indicators)
                cve_text = " ".join(v.cve_id for v in art.analysis.vulnerabilities)
                text += f" {ioc_text} {cve_text}".lower()
            if search_lower not in text:
                # Prova match multi-termine (AND)
                terms = search_lower.split()
                if not all(t in text for t in terms):
                    continue

        filtered.append(art)

    return filtered


# ── Watchlist / Monitored Assets ───────────────────────────────────────────────


@router.get("/watchlist")
async def get_watchlist():
    """Restituisce tutti gli asset monitorati."""
    return [a.model_dump(mode="json") for a in watchlist_service.get_all()]


@router.post("/watchlist")
async def add_watchlist_asset(body: dict):
    """Aggiunge un asset alla watchlist.

    Body: { "asset_type": "ip|domain|hash|cve|keyword|email", "value": "...", "label": "..." }
    """
    asset_type = body.get("asset_type", "").strip()
    value = body.get("value", "").strip()
    if not asset_type or not value:
        raise HTTPException(status_code=400, detail="asset_type e value sono obbligatori")
    if asset_type not in ("ip", "domain", "hash", "cve", "keyword", "email", "url"):
        raise HTTPException(status_code=400, detail="Tipo non valido. Usa: ip, domain, hash, cve, keyword, email, url")

    asset = watchlist_service.add_asset(asset_type, value, body.get("label", ""))
    return asset.model_dump(mode="json")


@router.delete("/watchlist/{asset_id}")
async def remove_watchlist_asset(asset_id: str):
    """Rimuove un asset dalla watchlist."""
    if not watchlist_service.remove_asset(asset_id):
        raise HTTPException(status_code=404, detail="Asset non trovato")
    return {"message": "Asset rimosso"}


@router.patch("/watchlist/{asset_id}/toggle")
async def toggle_watchlist_asset(asset_id: str):
    """Abilita/disabilita un asset monitorato."""
    asset = watchlist_service.toggle_asset(asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset non trovato")
    return asset.model_dump(mode="json")


@router.get("/watchlist/alerts")
async def get_watchlist_alerts():
    """Scansiona tutti gli articoli in cache e restituisce gli alert per gli asset monitorati."""
    all_articles = cache_manager.get_all_cached_articles()
    alerts = watchlist_service.scan_all_articles(all_articles)

    # Ordina per relevance score
    alerts.sort(key=lambda a: a.relevance_score, reverse=True)

    return {
        "total_alerts": len(alerts),
        "assets_monitored": len(watchlist_service.get_enabled()),
        "alerts": [
            {
                "asset_type": a.asset.asset_type,
                "asset_value": a.asset.value,
                "asset_label": a.asset.label,
                "article_id": a.article.id,
                "article_title": a.article.title,
                "matched_in": a.matched_in,
                "relevance_score": a.relevance_score,
                "article_date": (a.article.published or a.article.fetched_at).isoformat() if (a.article.published or a.article.fetched_at) else None,
            }
            for a in alerts[:100]  # Max 100
        ],
    }


# ── Progressive Batch Analysis ─────────────────────────────────────────────────


async def _run_batch_analysis_task(task_id: str, article_ids: list[str], batch_size: int = 5):
    """Analyze articles in batches, updating task progress per-article."""
    import time as _time

    task = _task_registry[task_id]
    task["status"] = "running"
    task["analyzed"] = []
    task["errors"] = []
    task["total"] = len(article_ids)
    task["started_at"] = _time.time()
    task["current_article"] = None
    task["speed"] = 0
    task["eta_seconds"] = None

    def _update_progress():
        done = len(task["analyzed"]) + len(task["errors"])
        task["progress"] = done
        elapsed = _time.time() - task["started_at"]
        if done > 0 and elapsed > 0:
            task["speed"] = round(done / elapsed, 2)
            remaining = task["total"] - done
            task["eta_seconds"] = round(remaining / task["speed"])
        else:
            task["eta_seconds"] = None

    for i in range(0, len(article_ids), batch_size):
        batch = article_ids[i:i + batch_size]
        for aid in batch:
            try:
                article = cache_manager.get_article(aid)
                if not article:
                    _update_progress()
                    continue
                if article.status == ArticleStatus.ANALYZED and article.analysis:
                    task["analyzed"].append(aid)
                    _update_progress()
                    continue

                task["current_article"] = article.title[:80] if article.title else aid

                from app.models.schemas import Article as RawArticle
                raw = RawArticle(
                    id=article.id, feed_id=article.feed_id, title=article.title,
                    link=article.link, published=article.published, summary=article.summary,
                    content=article.content, author=article.author, tags=article.tags,
                )
                analysis = await ai_service.analyze_article(raw)
                article.analysis = analysis
                article.status = ArticleStatus.ANALYZED
                stix_bundle = stix_service.generate_bundle(article)
                if isinstance(stix_bundle, str):
                    stix_bundle = json.loads(stix_bundle)
                article.stix_bundle = stix_bundle
                cache_manager.save_article(article)
                task["analyzed"].append(aid)
            except Exception as e:
                logger.error("Batch analysis error for %s: %s", aid, e)
                task["errors"].append(aid)

            _update_progress()

    task["status"] = "completed"
    task["current_article"] = None
    task["completed_at"] = datetime.utcnow().isoformat()


@router.post("/articles/analyze-batch")
async def analyze_batch(background_tasks: BackgroundTasks, body: dict = None):
    """Avvia analisi progressiva: analizza articoli in batch di 5.

    Body opzionale: { "article_ids": [...], "batch_size": 5 }
    Se article_ids non è specificato, analizza tutti i pending.
    """
    body = body or {}
    article_ids = body.get("article_ids")
    batch_size = min(body.get("batch_size", 5), 10)

    if not article_ids:
        all_articles = cache_manager.get_all_cached_articles()
        cutoff = datetime.utcnow() - _MAX_ARTICLE_AGE
        article_ids = [
            a.id for a in all_articles
            if a.status == ArticleStatus.PENDING
            and a.feed_id not in _excluded_sources
            and not ((a.published or a.fetched_at) and (a.published or a.fetched_at) < cutoff)
        ]

    task_id = uuid.uuid4().hex[:12]
    _task_registry[task_id] = {
        "task_id": task_id,
        "status": "pending",
        "type": "batch_analysis",
        "total": len(article_ids),
        "progress": 0,
        "analyzed": [],
        "errors": [],
        "created_at": datetime.utcnow().isoformat(),
        "started_at": None,
        "current_article": None,
        "speed": 0,
        "eta_seconds": None,
    }
    background_tasks.add_task(_run_batch_analysis_task, task_id, article_ids, batch_size)
    return _task_registry[task_id]


# ── Favorites ──────────────────────────────────────────────────────────────────


@router.get("/favorites")
async def get_favorites():
    """Restituisce gli ID degli articoli preferiti e i loro dati."""
    articles = []
    for aid in sorted(_favorites):
        art = cache_manager.get_article(aid)
        if art:
            articles.append(art)
    return {"favorite_ids": sorted(_favorites), "articles": articles}


@router.post("/favorites/{article_id}")
async def add_favorite(article_id: str):
    """Aggiunge un articolo ai preferiti."""
    if not cache_manager.get_article(article_id):
        raise HTTPException(status_code=404, detail="Articolo non trovato")
    _favorites.add(article_id)
    _save_json_set(_favorites_file, _favorites)
    return {"message": "Aggiunto ai preferiti", "article_id": article_id}


@router.delete("/favorites/{article_id}")
async def remove_favorite(article_id: str):
    """Rimuove un articolo dai preferiti."""
    _favorites.discard(article_id)
    _save_json_set(_favorites_file, _favorites)
    return {"message": "Rimosso dai preferiti", "article_id": article_id}


@router.get("/favorites/check/{article_id}")
async def check_favorite(article_id: str):
    """Controlla se un articolo è nei preferiti."""
    return {"is_favorite": article_id in _favorites}


# ── Excluded Sources ───────────────────────────────────────────────────────────


@router.get("/sources/excluded")
async def get_excluded_sources():
    """Restituisce le sorgenti disabilitate con info feed."""
    sources_info = []
    for fid in sorted(_excluded_sources):
        feed = get_feed_by_id(fid)
        sources_info.append({
            "feed_id": fid,
            "name": feed.name if feed else fid,
            "url": feed.url if feed else "",
            "language": feed.language if feed else "",
        })
    return {"excluded": sources_info}


@router.post("/sources/exclude/{feed_id}")
async def exclude_source(feed_id: str):
    """Disabilita una sorgente feed."""
    _excluded_sources.add(feed_id)
    _save_json_set(_excluded_sources_file, _excluded_sources)
    return {"message": "Sorgente disabilitata", "feed_id": feed_id}


@router.delete("/sources/exclude/{feed_id}")
async def reenable_source(feed_id: str):
    """Riabilita una sorgente feed precedentemente disabilitata."""
    _excluded_sources.discard(feed_id)
    _save_json_set(_excluded_sources_file, _excluded_sources)
    return {"message": "Sorgente riabilitata", "feed_id": feed_id}


# ── Action Items ───────────────────────────────────────────────────────────────


@router.get("/articles/{article_id}/actions")
async def get_article_actions(article_id: str):
    """Restituisce le azioni consigliate per un articolo analizzato."""
    article = cache_manager.get_article(article_id)
    if not article:
        raise HTTPException(status_code=404, detail="Articolo non trovato")

    actions = []

    if not article.analysis:
        return {"article_id": article_id, "actions": [
            {"priority": "high", "icon": "sparkles", "action": "Analizza questo articolo con AI per ottenere raccomandazioni dettagliate."}
        ]}

    analysis = article.analysis

    # From recommendations
    for i, rec in enumerate(analysis.recommendations or []):
        actions.append({
            "priority": "medium",
            "icon": "checkmark-circle",
            "action": rec,
        })

    # From IoCs
    if analysis.indicators:
        ioc_types = set(i.type for i in analysis.indicators)
        ioc_vals = [i.value for i in analysis.indicators[:5]]
        actions.insert(0, {
            "priority": "high",
            "icon": "shield-checkmark",
            "action": f"Blocca/monitora {len(analysis.indicators)} IoC trovati ({', '.join(ioc_types)}): {', '.join(ioc_vals)}",
        })

    # From CVEs
    for vuln in (analysis.vulnerabilities or [])[:3]:
        score_text = f" (CVSS {vuln.cvss_score})" if vuln.cvss_score else ""
        actions.append({
            "priority": "critical" if vuln.cvss_score and vuln.cvss_score >= 9 else "high",
            "icon": "alert-circle",
            "action": f"Applica patch per {vuln.cve_id}{score_text}: {vuln.description or 'Vedi NVD per dettagli'}",
        })

    # From MITRE techniques
    if analysis.attack_techniques:
        technique_names = [t.technique_name for t in analysis.attack_techniques[:3]]
        actions.append({
            "priority": "medium",
            "icon": "git-network",
            "action": f"Verifica le difese contro: {', '.join(technique_names)}",
        })

    if not actions:
        actions.append({
            "priority": "low",
            "icon": "information-circle",
            "action": "Nessuna azione urgente richiesta. Articolo informativo.",
        })

    return {"article_id": article_id, "actions": actions}


# ── Demo / Test Article ───────────────────────────────────────────────────────


@router.post("/demo/create-test-article")
async def create_demo_article():
    """Crea un articolo di esempio completo con analisi pre-compilata per demo/tutorial."""
    demo_id = "demo_test_article_001"

    existing = cache_manager.get_article(demo_id)
    if existing:
        return existing

    demo_article = ArticleAnalyzed(
        id=demo_id,
        feed_id="demo_feed",
        title="[DEMO] APT29 sfrutta vulnerabilità critica in Microsoft Exchange per campagna di spionaggio",
        link="https://example.com/demo-article",
        published=datetime.utcnow(),
        summary="Gruppo APT29 (Cozy Bear) identificato in una nuova campagna di spionaggio che sfrutta CVE-2024-21400 in Microsoft Exchange Server.",
        content=(
            "Ricercatori di sicurezza hanno identificato una nuova campagna di spionaggio attribuita "
            "ad APT29 (Cozy Bear), il gruppo di minacce persistenti avanzate associato ai servizi "
            "di intelligence russi. La campagna sfrutta una vulnerabilità critica (CVE-2024-21400) "
            "in Microsoft Exchange Server per ottenere accesso iniziale alle reti target.\n\n"
            "Gli attaccanti utilizzano tecniche di spear-phishing con allegati malevoli che, "
            "una volta aperti, scaricano un payload attraverso PowerShell. Il malware FoggyWeb "
            "viene installato come backdoor persistente, consentendo l'esfiltrazione di dati sensibili.\n\n"
            "Indicatori di compromissione:\n"
            "- IP C2: 185.220.101.45\n"
            "- Dominio: update-service.example-cdn.com\n"
            "- Hash SHA256: a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456\n"
            "- Email di phishing: security-update@legitimate-corp.com\n\n"
            "Le organizzazioni che utilizzano Microsoft Exchange dovrebbero applicare "
            "immediatamente le patch di sicurezza e verificare la presenza degli IoC indicati."
        ),
        author="CTI Research Team",
        tags=["apt29", "exchange", "spionaggio", "russia"],
        feed_name="Demo Feed - CTI Intelligence",
        status=ArticleStatus.ANALYZED,
        analysis=AIAnalysis(
            summary_it=(
                "APT29 (Cozy Bear) sta conducendo una campagna di spionaggio sfruttando "
                "CVE-2024-21400 in Microsoft Exchange. Il gruppo utilizza spear-phishing "
                "per distribuire il malware FoggyWeb come backdoor persistente, puntando "
                "all'esfiltrazione di dati da organizzazioni governative e del settore difesa."
            ),
            summary_en=(
                "APT29 (Cozy Bear) is conducting an espionage campaign exploiting "
                "CVE-2024-21400 in Microsoft Exchange. The group uses spear-phishing "
                "to deploy FoggyWeb malware as a persistent backdoor, targeting data "
                "exfiltration from government and defense sector organizations."
            ),
            threat_category=ThreatCategory.APT,
            severity="critical",
            threat_actors=[{
                "name": "APT29",
                "aliases": ["Cozy Bear", "The Dukes", "Midnight Blizzard"],
                "motivation": "Spionaggio statale",
                "country": "Russia",
            }],
            indicators=[
                {"type": "ip", "value": "185.220.101.45", "context": "Server C2 principale"},
                {"type": "domain", "value": "update-service.example-cdn.com", "context": "Dominio C2 per download payload"},
                {"type": "hash_sha256", "value": "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456", "context": "Hash del payload FoggyWeb"},
                {"type": "email", "value": "security-update@legitimate-corp.com", "context": "Indirizzo mittente phishing"},
            ],
            attack_techniques=[
                {"technique_id": "T1566.001", "technique_name": "Spear-Phishing Attachment", "tactic": "Initial Access", "description": "Email con allegati malevoli Word/Excel"},
                {"technique_id": "T1059.001", "technique_name": "PowerShell", "tactic": "Execution", "description": "Script PowerShell per download del payload"},
                {"technique_id": "T1505.003", "technique_name": "Web Shell", "tactic": "Persistence", "description": "Web shell installata su Exchange compromesso"},
            ],
            vulnerabilities=[
                {"cve_id": "CVE-2024-21400", "cvss_score": 9.8, "description": "Remote Code Execution in Microsoft Exchange Server", "affected_products": ["Microsoft Exchange Server 2019", "Microsoft Exchange Server 2016"]},
            ],
            affected_sectors=["government", "defense", "energy"],
            malware_families=["FoggyWeb", "EnvyScout"],
            recommendations=[
                "Applicare immediatamente la patch per CVE-2024-21400 su tutti i server Exchange",
                "Bloccare gli IoC identificati su firewall, proxy e sistemi EDR",
                "Verificare i log di Exchange per accessi anomali nelle ultime 4 settimane",
                "Implementare MFA su tutte le caselle email con accesso a dati sensibili",
                "Eseguire threat hunting cercando processi PowerShell anomali su server Exchange",
            ],
            key_findings=[
                "APT29 ha evoluto le proprie TTP utilizzando exploit Exchange recenti",
                "La campagna è attiva da almeno 3 settimane con target in Europa",
                "FoggyWeb è stato aggiornato con capacità di evasione EDR migliorate",
                "Il gruppo utilizza infrastruttura cloud legittima per il C2",
            ],
            tags=["apt29", "cozy-bear", "exchange", "cve-2024-21400", "foggyweb", "spionaggio"],
            confidence_score=0.92,
        ),
    )

    cache_manager.save_article(demo_article)
    return demo_article


# ── TAXII 2.1 Endpoints ───────────────────────────────────────────────────────


@router.get("/taxii2")
async def taxii_discovery(request_obj: "starlette.requests.Request" = None):
    """TAXII 2.1 Discovery endpoint."""
    from starlette.requests import Request
    # Build base URL from request if available
    base_url = ""
    return Response(
        content=json.dumps(taxii_service.get_discovery(base_url)),
        media_type=TAXII_MEDIA_TYPE,
    )


@router.get("/taxii2/collections")
async def taxii_collections():
    """List available TAXII 2.1 collections."""
    return Response(
        content=json.dumps(taxii_service.get_collections()),
        media_type=TAXII_MEDIA_TYPE,
    )


@router.get("/taxii2/collections/{collection_id}")
async def taxii_collection(collection_id: str):
    """Get a specific TAXII collection."""
    result = taxii_service.get_collection(collection_id)
    if not result:
        raise HTTPException(status_code=404, detail="Collection not found")
    return Response(
        content=json.dumps(result),
        media_type=TAXII_MEDIA_TYPE,
    )


@router.get("/taxii2/collections/{collection_id}/objects")
async def taxii_objects(
    collection_id: str,
    added_after: Optional[str] = Query(None),
    type: Optional[str] = Query(None, alias="match[type]"),
    limit: int = Query(50, ge=1, le=500),
    next: Optional[str] = Query(None),
):
    """Get STIX objects from a TAXII collection."""
    result = taxii_service.get_objects(
        collection_id,
        added_after=added_after,
        object_type=type,
        limit=limit,
        next_cursor=next,
    )
    return Response(
        content=json.dumps(result, default=str),
        media_type=TAXII_MEDIA_TYPE,
    )


@router.get("/taxii2/collections/{collection_id}/manifest")
async def taxii_manifest(collection_id: str, limit: int = Query(50, ge=1, le=500)):
    """Get the manifest of objects in a TAXII collection."""
    result = taxii_service.get_manifest(collection_id, limit=limit)
    return Response(
        content=json.dumps(result, default=str),
        media_type=TAXII_MEDIA_TYPE,
    )


# ── AI Status ──────────────────────────────────────────────────────────────────


@router.get("/versions")
async def check_versions():
    """Restituisce le versioni dei componenti backend e le ultime disponibili su PyPI."""
    import importlib.metadata
    import aiohttp

    packages = [
        "fastapi", "uvicorn", "pydantic", "aiohttp", "feedparser",
        "beautifulsoup4", "stix2", "pyyaml",
    ]

    results = []

    async def check_one(pkg_name: str):
        # Versione installata
        try:
            installed = importlib.metadata.version(pkg_name)
        except importlib.metadata.PackageNotFoundError:
            installed = None

        # Ultima versione su PyPI
        latest = None
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"https://pypi.org/pypi/{pkg_name}/json",
                    timeout=aiohttp.ClientTimeout(total=5),
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        latest = data.get("info", {}).get("version")
        except Exception:
            pass

        return {
            "package": pkg_name,
            "installed": installed,
            "latest": latest,
            "up_to_date": installed == latest if installed and latest else None,
        }

    results = await asyncio.gather(*[check_one(p) for p in packages])
    all_ok = all(r["up_to_date"] for r in results if r["up_to_date"] is not None)

    return {
        "components": list(results),
        "all_up_to_date": all_ok,
        "python_version": __import__("sys").version,
    }


@router.get("/ai/status")
async def ai_status():
    """Verifica se il servizio AI è configurato e quale motore è in uso."""
    engine = ai_service.engine
    model = ai_service.model_name

    if engine:
        engine_labels = {"openai": "OpenAI", "gemini": "Google Gemini", "ollama": "Ollama (locale)"}
        return {
            "available": True,
            "engine": engine,
            "engine_label": engine_labels.get(engine, engine),
            "model": model,
            "message": f"AI attiva: {engine_labels.get(engine, engine)} — modello {model}",
        }

    return {
        "available": False,
        "engine": None,
        "engine_label": None,
        "model": None,
        "message": (
            "Nessun motore AI configurato. L'app funziona con analisi base "
            "(categorizzazione keyword, estrazione IoC regex). "
            "Configura AI_ENGINE nel .env: ollama (gratis, locale), "
            "gemini (gratis con limiti), oppure openai (a pagamento)."
        ),
    }


@router.get("/ai/config")
async def get_ai_config():
    """Restituisce la configurazione AI corrente (senza esporre chiavi intere)."""
    return ai_service.get_config()


@router.post("/ai/config")
async def update_ai_config(body: dict):
    """Aggiorna la configurazione AI a runtime dall'interfaccia mobile.

    Campi supportati nel body JSON:
    - engine: "ollama" | "gemini" | "openai" | ""
    - ollama_base_url, ollama_model
    - gemini_api_key, gemini_model
    - openai_api_key, openai_model
    """
    result = ai_service.update_config(body)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.post("/ai/test")
async def test_ai_connection():
    """Testa la connessione al motore AI configurato."""
    engine = ai_service.engine
    if not engine:
        return {"success": False, "message": "Nessun motore AI configurato"}

    try:
        response = await ai_service._chat_completion(
            system_prompt="Rispondi con un JSON: {\"status\": \"ok\"}",
            user_prompt="Test connessione. Rispondi solo con il JSON richiesto.",
            temperature=0.0,
            max_tokens=50,
        )
        if response:
            return {
                "success": True,
                "engine": engine,
                "model": ai_service.model_name,
                "message": f"Connessione a {engine} riuscita",
            }
        return {"success": False, "message": "Risposta vuota dal motore AI"}
    except Exception as e:
        return {"success": False, "engine": engine, "message": str(e)}
