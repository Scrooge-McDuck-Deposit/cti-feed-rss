"""Configurazione dell'applicazione CTI Feed RSS."""

import os
from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Impostazioni globali dell'app."""

    APP_NAME: str = "CTI Feed RSS"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False

    # AI Engine: "ollama", "gemini", "openai" o "" (disabilitato)
    AI_ENGINE: str = "ollama"

    # Ollama (locale, gratuito — https://ollama.com)
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3.2"

    # Google Gemini (gratuito con limiti — https://aistudio.google.com/apikey)
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.0-flash"

    # OpenAI (a pagamento)
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o"

    # RSS
    RSS_FETCH_INTERVAL_MINUTES: int = 30
    RSS_FETCH_TIMEOUT_SECONDS: int = 15
    MAX_ARTICLES_PER_FEED: int = 50

    # Cache
    CACHE_DIR: Path = Path("cache")
    CACHE_TTL_HOURS: int = 6

    # Database
    DATABASE_URL: str = "sqlite:///./cti_feeds.db"

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # SOC Integrations
    THEHIVE_URL: str = ""
    THEHIVE_API_KEY: str = ""
    QRADAR_URL: str = ""
    QRADAR_API_KEY: str = ""
    ELASTICSEARCH_URL: str = ""
    ELASTICSEARCH_API_KEY: str = ""

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()

# Crea directory cache se non esiste
settings.CACHE_DIR.mkdir(parents=True, exist_ok=True)
