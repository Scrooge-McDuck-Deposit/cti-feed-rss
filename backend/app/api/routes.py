"""API Routes per l'applicazione CTI Feed RSS."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime
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

logger = logging.getLogger(__name__)

router = APIRouter()

# ── Background Task Registry ──────────────────────────────────────────────────

_task_registry: dict[str, dict] = {}


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
