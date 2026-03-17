"""Servizio per importazione feed da file OPML.

Parsa file OPML/XML e importa i feed RSS come sorgenti CTI.
"""

from __future__ import annotations

import hashlib
import logging
import re
from xml.etree import ElementTree

import aiohttp

from app.data.feeds import add_dynamic_feed
from app.models.schemas import FeedSource

logger = logging.getLogger(__name__)


def _make_feed_id(url: str) -> str:
    """Genera un ID stabile per un feed basato sull'URL."""
    return "opml-" + hashlib.sha256(url.encode()).hexdigest()[:12]


def _clean_name(name: str) -> str:
    """Pulisce il nome del feed."""
    # Rimuovi caratteri di controllo
    name = re.sub(r"[\r\n\t]+", " ", name).strip()
    return name[:120] if name else "Unnamed Feed"


def parse_opml_xml(xml_content: str) -> list[FeedSource]:
    """Parsa il contenuto XML OPML e restituisce una lista di FeedSource."""
    feeds: list[FeedSource] = []
    seen_urls: set[str] = set()

    try:
        root = ElementTree.fromstring(xml_content)
    except ElementTree.ParseError as e:
        logger.error("OPML parse error: %s", e)
        return feeds

    # Trova tutti gli <outline> con xmlUrl
    for outline in root.iter("outline"):
        xml_url = outline.get("xmlUrl", "").strip()
        if not xml_url or xml_url in seen_urls:
            continue

        seen_urls.add(xml_url)

        name = outline.get("title") or outline.get("text") or ""
        name = _clean_name(name)
        html_url = outline.get("htmlUrl", "")

        # Determina la categoria dal contesto (parent outline)
        parent = None
        for parent_outline in root.iter("outline"):
            for child in parent_outline:
                if child is outline:
                    parent = parent_outline
                    break

        parent_title = ""
        if parent is not None:
            parent_title = (parent.get("title") or parent.get("text") or "").lower()

        category = "general"
        if "vuln" in parent_title or "vuln" in name.lower():
            category = "vulnerability"
        elif "malware" in parent_title or "malware" in name.lower():
            category = "malware"
        elif "mobile" in parent_title:
            category = "mobile_security"
        elif "wireless" in parent_title:
            category = "wireless_security"
        elif any(w in parent_title for w in ("pwn", "exploit", "reverse")):
            category = "exploit_research"

        feed = FeedSource(
            id=_make_feed_id(xml_url),
            name=name,
            url=xml_url,
            language="en",
            category=category,
            description=f"Importato da OPML - {html_url}" if html_url else "Importato da OPML",
            enabled=True,
        )
        feeds.append(feed)

    return feeds


async def import_from_opml_url(url: str) -> dict:
    """Scarica un file OPML da URL e importa i feed."""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                if resp.status != 200:
                    return {"error": f"HTTP {resp.status}", "imported": 0}
                content = await resp.text()
    except Exception as e:
        logger.error("OPML download error: %s", e)
        return {"error": str(e), "imported": 0}

    return import_from_opml_content(content)


def import_from_opml_content(content: str) -> dict:
    """Importa feed da contenuto OPML XML."""
    feeds = parse_opml_xml(content)
    imported = 0
    skipped = 0

    for feed in feeds:
        if add_dynamic_feed(feed):
            imported += 1
        else:
            skipped += 1

    return {
        "total_found": len(feeds),
        "imported": imported,
        "skipped_duplicates": skipped,
    }
