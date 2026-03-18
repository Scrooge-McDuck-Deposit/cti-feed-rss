"""CTI Feed RSS - Backend Application.

FastAPI server per il fetching, l'analisi AI e la generazione STIX
di articoli di Cyber Threat Intelligence.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware

from app.api.routes import router
from app.config import settings
from app.services.ai_service import ai_service
from app.services.rss_service import rss_service

# Logging
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Gestione del ciclo di vita dell'applicazione."""
    logger.info("🚀 %s v%s avviato", settings.APP_NAME, settings.APP_VERSION)

    # Controlla aggiornamenti modello Ollama se configurato
    if ai_service.engine == "ollama":
        await ai_service.check_ollama_update()

    yield
    # Cleanup
    await rss_service.close()
    logger.info("👋 Applicazione terminata")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="API per il fetching e l'analisi di feed RSS di Cyber Threat Intelligence",
    lifespan=lifespan,
)

# CORS per l'app mobile
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In produzione, restringere alle origini dell'app
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Gzip compression for API responses (min 500 bytes)
app.add_middleware(GZipMiddleware, minimum_size=500)

# Registra routes
app.include_router(router, prefix="/api/v1")


@app.get("/")
async def root():
    """Health check."""
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running",
    }


@app.get("/health")
async def health():
    """Health check dettagliato."""
    return {
        "status": "healthy",
        "version": settings.APP_VERSION,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
    )
