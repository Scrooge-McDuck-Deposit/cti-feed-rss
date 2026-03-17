"""API Routes per l'applicazione CTI Feed RSS."""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

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
)
from app.services.ai_service import ai_service
from app.services.categorizer import categorizer_service
from app.services.rss_service import rss_service
from app.services.stix_service import stix_service
from app.services.opml_service import import_from_opml_url, import_from_opml_content

logger = logging.getLogger(__name__)

router = APIRouter()


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
async def fetch_articles(feed_id: Optional[str] = None):
    """Fetcha gli articoli dai feed RSS.

    Se feed_id è specificato, fetcha solo quel feed.
    Altrimenti fetcha tutti i feed attivi.
    """
    if feed_id:
        articles = await rss_service.fetch_feed_by_id(feed_id)
    else:
        articles = await rss_service.fetch_all_feeds()

    if not articles:
        return {"message": "Nessun articolo trovato", "count": 0}

    # Salva gli articoli in cache come pending
    new_count = 0
    for article in articles:
        existing = cache_manager.get_article(article.id)
        if not existing:
            analyzed = ArticleAnalyzed(
                **article.model_dump(),
                feed_name=get_feed_by_id(article.feed_id).name if get_feed_by_id(article.feed_id) else "",
            )
            cache_manager.save_article(analyzed)
            new_count += 1

    return {
        "message": f"Fetch completato",
        "total_fetched": len(articles),
        "new_articles": new_count,
    }


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
    """Restituisce gli articoli con paginazione e filtri."""
    all_articles = cache_manager.get_all_cached_articles()

    # Filtri
    if category:
        try:
            cat = ThreatCategory(category)
            all_articles = [
                a for a in all_articles
                if a.analysis and a.analysis.threat_category == cat
            ]
        except ValueError:
            pass

    if severity:
        all_articles = [
            a for a in all_articles
            if a.analysis and a.analysis.severity.value == severity
        ]

    if feed_id:
        all_articles = [a for a in all_articles if a.feed_id == feed_id]

    if status:
        try:
            st = ArticleStatus(status)
            all_articles = [a for a in all_articles if a.status == st]
        except ValueError:
            pass

    if search:
        search_lower = search.lower()
        all_articles = [
            a for a in all_articles
            if search_lower in a.title.lower()
            or search_lower in a.summary.lower()
            or (a.analysis and search_lower in (a.analysis.summary_it or "").lower())
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


# ── AI Status ──────────────────────────────────────────────────────────────────


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
