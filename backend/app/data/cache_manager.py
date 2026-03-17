"""Gestore della cache locale per gli articoli."""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Optional

from app.config import settings
from app.models.schemas import ArticleAnalyzed

logger = logging.getLogger(__name__)


class CacheManager:
    """Gestisce la cache su disco degli articoli analizzati."""

    def __init__(self, cache_dir: Optional[Path] = None) -> None:
        self.cache_dir = cache_dir or settings.CACHE_DIR
        self.articles_dir = self.cache_dir / "articles"
        self.reports_dir = self.cache_dir / "reports"
        self.meta_file = self.cache_dir / "cache_meta.json"

        self.articles_dir.mkdir(parents=True, exist_ok=True)
        self.reports_dir.mkdir(parents=True, exist_ok=True)

        self._meta = self._load_meta()

    def _load_meta(self) -> dict:
        """Carica i metadati della cache."""
        if self.meta_file.exists():
            try:
                return json.loads(self.meta_file.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                pass
        return {"articles": {}, "last_cleanup": 0}

    def _save_meta(self) -> None:
        """Salva i metadati della cache."""
        self.meta_file.write_text(
            json.dumps(self._meta, indent=2), encoding="utf-8"
        )

    def _is_expired(self, timestamp: float) -> bool:
        """Controlla se un elemento è scaduto."""
        ttl_seconds = settings.CACHE_TTL_HOURS * 3600
        return (time.time() - timestamp) > ttl_seconds

    def get_article(self, article_id: str) -> Optional[ArticleAnalyzed]:
        """Recupera un articolo dalla cache."""
        meta = self._meta["articles"].get(article_id)
        if not meta:
            return None

        if self._is_expired(meta["cached_at"]):
            self.remove_article(article_id)
            return None

        article_file = self.articles_dir / f"{article_id}.json"
        if not article_file.exists():
            return None

        try:
            data = json.loads(article_file.read_text(encoding="utf-8"))
            return ArticleAnalyzed(**data)
        except (json.JSONDecodeError, OSError, ValueError) as e:
            logger.error("Error reading cached article %s: %s", article_id, e)
            return None

    def save_article(self, article: ArticleAnalyzed) -> None:
        """Salva un articolo nella cache."""
        article_file = self.articles_dir / f"{article.id}.json"
        try:
            article_file.write_text(
                article.model_dump_json(indent=2), encoding="utf-8"
            )
            self._meta["articles"][article.id] = {
                "cached_at": time.time(),
                "feed_id": article.feed_id,
                "title": article.title[:100],
            }
            self._save_meta()
        except OSError as e:
            logger.error("Error caching article %s: %s", article.id, e)

    def remove_article(self, article_id: str) -> None:
        """Rimuove un articolo dalla cache."""
        article_file = self.articles_dir / f"{article_id}.json"
        if article_file.exists():
            article_file.unlink()
        self._meta["articles"].pop(article_id, None)
        self._save_meta()

    def get_all_cached_articles(self) -> list[ArticleAnalyzed]:
        """Restituisce tutti gli articoli in cache (non scaduti)."""
        articles = []
        expired_ids = []

        for article_id, meta in self._meta["articles"].items():
            if self._is_expired(meta["cached_at"]):
                expired_ids.append(article_id)
                continue

            article = self.get_article(article_id)
            if article:
                articles.append(article)

        # Pulizia articoli scaduti
        for aid in expired_ids:
            self.remove_article(aid)

        return articles

    def get_cached_article_ids(self) -> set[str]:
        """Restituisce gli ID degli articoli in cache."""
        return set(self._meta["articles"].keys())

    def cleanup_expired(self) -> int:
        """Rimuove tutti gli articoli scaduti. Restituisce il numero rimosso."""
        expired = []
        for article_id, meta in self._meta["articles"].items():
            if self._is_expired(meta["cached_at"]):
                expired.append(article_id)

        for aid in expired:
            self.remove_article(aid)

        if expired:
            logger.info("Cleaned up %d expired cache entries", len(expired))

        self._meta["last_cleanup"] = time.time()
        self._save_meta()
        return len(expired)

    def get_cache_stats(self) -> dict:
        """Restituisce statistiche sulla cache."""
        total_size = sum(
            f.stat().st_size
            for f in self.articles_dir.iterdir()
            if f.is_file()
        )
        return {
            "total_articles": len(self._meta["articles"]),
            "total_size_mb": round(total_size / (1024 * 1024), 2),
            "cache_dir": str(self.cache_dir),
            "ttl_hours": settings.CACHE_TTL_HOURS,
        }

    def clear_all(self) -> None:
        """Svuota tutta la cache."""
        import shutil

        shutil.rmtree(self.articles_dir, ignore_errors=True)
        shutil.rmtree(self.reports_dir, ignore_errors=True)
        self.articles_dir.mkdir(parents=True, exist_ok=True)
        self.reports_dir.mkdir(parents=True, exist_ok=True)
        self._meta = {"articles": {}, "last_cleanup": time.time()}
        self._save_meta()
        logger.info("Cache cleared")


# Singleton
cache_manager = CacheManager()
