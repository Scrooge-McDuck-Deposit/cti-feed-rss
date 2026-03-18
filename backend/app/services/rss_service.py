"""Servizio di fetching e parsing dei feed RSS."""

from __future__ import annotations

import asyncio
import hashlib
import logging
from datetime import datetime
from typing import Optional

import aiohttp
import feedparser
from bs4 import BeautifulSoup

from app.config import settings
from app.data.feeds import get_enabled_feeds, get_feed_by_id
from app.models.schemas import Article, ArticleStatus, FeedSource

logger = logging.getLogger(__name__)

# Concurrency limit for parallel feed fetching
_FETCH_SEMAPHORE_LIMIT = 20
_MAX_RETRIES = 2
_RETRY_BACKOFF_BASE = 1.5  # seconds


class RSSService:
    """Gestisce il fetching e il parsing dei feed RSS."""

    def __init__(self) -> None:
        self._session: Optional[aiohttp.ClientSession] = None
        self._semaphore = asyncio.Semaphore(_FETCH_SEMAPHORE_LIMIT)

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            timeout = aiohttp.ClientTimeout(
                total=settings.RSS_FETCH_TIMEOUT_SECONDS
            )
            self._session = aiohttp.ClientSession(
                timeout=timeout,
                headers={"User-Agent": f"{settings.APP_NAME}/{settings.APP_VERSION}"},
            )
        return self._session

    async def close(self) -> None:
        if self._session and not self._session.closed:
            await self._session.close()

    def _generate_article_id(self, feed_id: str, link: str, title: str) -> str:
        """Genera un ID univoco per l'articolo."""
        raw = f"{feed_id}:{link}:{title}"
        return hashlib.sha256(raw.encode()).hexdigest()[:16]

    def _clean_html(self, html_content: str) -> str:
        """Rimuove i tag HTML e restituisce testo pulito."""
        if not html_content:
            return ""
        soup = BeautifulSoup(html_content, "html.parser")
        text = soup.get_text(separator=" ", strip=True)
        # Limita la lunghezza del contenuto
        if len(text) > 10000:
            text = text[:10000] + "..."
        return text

    def _parse_date(self, entry: dict) -> Optional[datetime]:
        """Parsa la data di pubblicazione da un entry RSS."""
        date_fields = ["published_parsed", "updated_parsed", "created_parsed"]
        for field in date_fields:
            parsed = entry.get(field)
            if parsed:
                try:
                    return datetime(*parsed[:6])
                except (ValueError, TypeError):
                    continue
        return None

    def _parse_entry(self, entry: dict, feed_id: str) -> Article:
        """Converte un entry feedparser in un Article."""
        title = entry.get("title", "Senza titolo")
        link = entry.get("link", "")

        # Estrai contenuto
        content = ""
        if "content" in entry and entry["content"]:
            content = entry["content"][0].get("value", "")
        elif "summary_detail" in entry:
            content = entry["summary_detail"].get("value", "")

        summary = entry.get("summary", "")

        # Pulisci HTML
        content_clean = self._clean_html(content)
        summary_clean = self._clean_html(summary)

        # Se non c'è contenuto, usa il summary
        if not content_clean and summary_clean:
            content_clean = summary_clean

        # Tags
        tags = []
        if "tags" in entry:
            tags = [t.get("term", "") for t in entry["tags"] if t.get("term")]

        return Article(
            id=self._generate_article_id(feed_id, link, title),
            feed_id=feed_id,
            title=title,
            link=link,
            published=self._parse_date(entry),
            summary=summary_clean[:1000],
            content=content_clean,
            author=entry.get("author", ""),
            tags=tags,
            status=ArticleStatus.PENDING,
        )

    async def fetch_feed(self, feed: FeedSource) -> list[Article]:
        """Fetcha e parsa un singolo feed RSS con retry e semaphore."""
        for attempt in range(_MAX_RETRIES + 1):
            try:
                return await self._fetch_feed_once(feed)
            except (aiohttp.ClientError, asyncio.TimeoutError) as e:
                if attempt < _MAX_RETRIES:
                    wait = _RETRY_BACKOFF_BASE ** (attempt + 1)
                    logger.warning(
                        "Retry %d/%d for %s (wait %.1fs): %s",
                        attempt + 1, _MAX_RETRIES, feed.name, wait, e,
                    )
                    await asyncio.sleep(wait)
                else:
                    logger.error("Failed after %d retries for %s: %s", _MAX_RETRIES, feed.name, e)
            except Exception as e:
                logger.error("Unexpected error fetching %s: %s", feed.name, e)
                break
        return []

    async def _fetch_feed_once(self, feed: FeedSource) -> list[Article]:
        """Single fetch attempt for a feed, rate-limited by semaphore."""
        articles: list[Article] = []
        async with self._semaphore:
            session = await self._get_session()
            async with session.get(feed.url) as response:
                if response.status != 200:
                    logger.warning("Feed %s returned status %d", feed.name, response.status)
                    return articles

                content = await response.text()

        parsed = feedparser.parse(content)

        if parsed.bozo and not parsed.entries:
            logger.warning("Feed %s parsing error: %s", feed.name, parsed.bozo_exception)
            return articles

        for entry in parsed.entries[: settings.MAX_ARTICLES_PER_FEED]:
            try:
                article = self._parse_entry(entry, feed.id)
                articles.append(article)
            except Exception as e:
                logger.error("Error parsing entry from %s: %s", feed.name, str(e))
                continue

        logger.info("Fetched %d articles from %s", len(articles), feed.name)
        return articles

    async def fetch_all_feeds(self) -> list[Article]:
        """Fetcha tutti i feed attivi in parallelo con asyncio.gather."""
        feeds = get_enabled_feeds()

        tasks = [self.fetch_feed(feed) for feed in feeds]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        all_articles: list[Article] = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error("Feed %s raised exception: %s", feeds[i].name, result)
            elif isinstance(result, list):
                all_articles.extend(result)

        logger.info("Total articles fetched: %d from %d feeds", len(all_articles), len(feeds))
        return all_articles

    async def fetch_feed_by_id(self, feed_id: str) -> list[Article]:
        """Fetcha un singolo feed per ID."""
        feed = get_feed_by_id(feed_id)
        if not feed:
            logger.warning("Feed not found: %s", feed_id)
            return []
        return await self.fetch_feed(feed)


# Singleton
rss_service = RSSService()
