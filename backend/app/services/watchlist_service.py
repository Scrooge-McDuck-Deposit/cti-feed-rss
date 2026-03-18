"""Servizio di monitoraggio asset per CTI Feed RSS.

Gestisce una watchlist di asset (IP, hash, domini, CVE, keyword)
che vengono monitorati continuamente contro gli articoli in cache.
"""

from __future__ import annotations

import json
import logging
import re
import time
import uuid
from pathlib import Path
from typing import Optional

from app.config import settings
from app.models.schemas import MonitoredAsset, AssetAlert, ArticleAnalyzed

logger = logging.getLogger(__name__)


class WatchlistService:
    """Gestisce la watchlist di asset monitorati."""

    def __init__(self) -> None:
        self._watchlist_file = settings.CACHE_DIR / "watchlist.json"
        self._assets: list[MonitoredAsset] = []
        self._load()

    def _load(self) -> None:
        """Carica la watchlist dal disco."""
        if self._watchlist_file.exists():
            try:
                data = json.loads(self._watchlist_file.read_text(encoding="utf-8"))
                self._assets = [MonitoredAsset(**a) for a in data]
            except (json.JSONDecodeError, OSError, ValueError) as e:
                logger.error("Errore caricamento watchlist: %s", e)
                self._assets = []
        else:
            self._assets = []

    def _save(self) -> None:
        """Salva la watchlist su disco."""
        self._watchlist_file.parent.mkdir(parents=True, exist_ok=True)
        data = [a.model_dump(mode="json") for a in self._assets]
        self._watchlist_file.write_text(
            json.dumps(data, indent=2, default=str), encoding="utf-8"
        )

    def get_all(self) -> list[MonitoredAsset]:
        """Restituisce tutti gli asset monitorati."""
        return self._assets

    def get_enabled(self) -> list[MonitoredAsset]:
        """Restituisce solo gli asset attivi."""
        return [a for a in self._assets if a.enabled]

    def add_asset(self, asset_type: str, value: str, label: str = "") -> MonitoredAsset:
        """Aggiunge un nuovo asset alla watchlist."""
        asset = MonitoredAsset(
            id=uuid.uuid4().hex[:12],
            asset_type=asset_type.lower().strip(),
            value=value.strip(),
            label=label.strip() or value.strip(),
        )
        self._assets.append(asset)
        self._save()
        return asset

    def remove_asset(self, asset_id: str) -> bool:
        """Rimuove un asset dalla watchlist."""
        before = len(self._assets)
        self._assets = [a for a in self._assets if a.id != asset_id]
        if len(self._assets) < before:
            self._save()
            return True
        return False

    def toggle_asset(self, asset_id: str) -> Optional[MonitoredAsset]:
        """Abilita/disabilita un asset."""
        for a in self._assets:
            if a.id == asset_id:
                a.enabled = not a.enabled
                self._save()
                return a
        return None

    def check_article(self, article: ArticleAnalyzed) -> list[AssetAlert]:
        """Controlla un articolo contro tutti gli asset attivi.

        Restituisce una lista di alert per ogni match trovato.
        """
        alerts: list[AssetAlert] = []
        enabled = self.get_enabled()
        if not enabled:
            return alerts

        # Prepara testo articolo per la ricerca
        title = article.title.lower()
        summary = article.summary.lower()
        content = (article.content or "").lower()
        full_text = f"{title} {summary} {content}"

        # IoC dall'analisi
        article_iocs: set[str] = set()
        if article.analysis:
            for ioc in article.analysis.indicators:
                article_iocs.add(ioc.value.lower())
            for vuln in article.analysis.vulnerabilities:
                article_iocs.add(vuln.cve_id.lower())

        for asset in enabled:
            val = asset.value.lower()
            matched_in = ""

            if asset.asset_type in ("ip", "domain", "hash", "email", "url"):
                # Match esatto negli IoC o nel testo
                if val in article_iocs:
                    matched_in = "ioc"
                elif val in full_text:
                    matched_in = "content"
            elif asset.asset_type == "cve":
                if val in article_iocs:
                    matched_in = "vulnerability"
                elif val in full_text:
                    matched_in = "content"
            elif asset.asset_type == "keyword":
                # Keyword matching (supporta multi-word)
                if val in title:
                    matched_in = "title"
                elif val in summary:
                    matched_in = "summary"
                elif val in content:
                    matched_in = "content"

            if matched_in:
                # Calcola un relevance score base
                score = 0.5
                if matched_in == "title":
                    score = 0.95
                elif matched_in == "ioc":
                    score = 0.9
                elif matched_in == "vulnerability":
                    score = 0.85
                elif matched_in == "summary":
                    score = 0.7
                elif matched_in == "content":
                    score = 0.5

                alerts.append(AssetAlert(
                    asset=asset,
                    article=article,
                    matched_in=matched_in,
                    relevance_score=score,
                ))

                # Aggiorna statistiche asset
                asset.last_match_at = article.fetched_at
                asset.match_count += 1

        if alerts:
            self._save()

        return alerts

    def scan_all_articles(self, articles: list[ArticleAnalyzed]) -> list[AssetAlert]:
        """Scansiona tutti gli articoli e restituisce gli alert aggregati."""
        all_alerts: list[AssetAlert] = []
        for article in articles:
            all_alerts.extend(self.check_article(article))
        return all_alerts


# Singleton
watchlist_service = WatchlistService()
