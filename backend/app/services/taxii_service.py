"""Servizio TAXII 2.1 integrato in FastAPI.

Implementa gli endpoint TAXII 2.1 (OASIS standard) per la condivisione
automatica di intelligence STIX con piattaforme compatibili.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Optional

from app.data.cache_manager import cache_manager
from app.services.stix_service import stix_service

logger = logging.getLogger(__name__)

TAXII_MEDIA_TYPE = "application/taxii+json;version=2.1"

# Default TAXII collection
COLLECTION_ID = "cti-feed-rss-intel"
COLLECTION_TITLE = "CTI Feed RSS Intelligence"
API_ROOT = "/taxii2"


class TAXIIService:
    """Gestisce le risposte TAXII 2.1."""

    def get_discovery(self, base_url: str) -> dict:
        """TAXII Discovery response."""
        return {
            "title": "CTI Feed RSS TAXII Server",
            "description": "TAXII 2.1 server for CTI Feed RSS intelligence sharing",
            "default": f"{base_url}{API_ROOT}",
            "api_roots": [f"{base_url}{API_ROOT}"],
        }

    def get_api_root(self, base_url: str) -> dict:
        """TAXII API Root information."""
        return {
            "title": "CTI Feed RSS",
            "description": "Automated CTI analysis and STIX generation",
            "versions": ["application/taxii+json;version=2.1"],
            "max_content_length": 10485760,
        }

    def get_collections(self) -> dict:
        """List available TAXII collections."""
        return {
            "collections": [
                {
                    "id": COLLECTION_ID,
                    "title": COLLECTION_TITLE,
                    "description": "STIX 2.1 bundles from analyzed CTI articles",
                    "can_read": True,
                    "can_write": False,
                    "media_types": ["application/stix+json;version=2.1"],
                }
            ]
        }

    def get_collection(self, collection_id: str) -> Optional[dict]:
        """Get a specific collection."""
        if collection_id != COLLECTION_ID:
            return None
        return {
            "id": COLLECTION_ID,
            "title": COLLECTION_TITLE,
            "description": "STIX 2.1 bundles from analyzed CTI articles",
            "can_read": True,
            "can_write": False,
            "media_types": ["application/stix+json;version=2.1"],
        }

    def get_objects(
        self,
        collection_id: str,
        added_after: Optional[str] = None,
        object_type: Optional[str] = None,
        limit: int = 50,
        next_cursor: Optional[str] = None,
    ) -> dict:
        """Get STIX objects from a collection with pagination."""
        if collection_id != COLLECTION_ID:
            return {"objects": []}

        # Get all analyzed articles with STIX bundles
        all_articles = cache_manager.get_all_cached_articles()
        analyzed = [
            a for a in all_articles
            if a.stix_bundle and a.analysis
        ]

        # Sort by date (newest first)
        analyzed.sort(
            key=lambda a: a.published or a.fetched_at,
            reverse=True,
        )

        # Apply added_after filter
        if added_after:
            try:
                after_dt = datetime.fromisoformat(added_after.replace("Z", "+00:00"))
                analyzed = [
                    a for a in analyzed
                    if (a.published or a.fetched_at) > after_dt
                ]
            except (ValueError, TypeError):
                pass

        # Apply cursor-based pagination
        start_idx = 0
        if next_cursor:
            try:
                start_idx = int(next_cursor)
            except ValueError:
                start_idx = 0

        page = analyzed[start_idx:start_idx + limit]

        # Collect all STIX objects
        all_objects = []
        for article in page:
            bundle = article.stix_bundle
            if isinstance(bundle, str):
                bundle = json.loads(bundle)
            objects = bundle.get("objects", [])

            if object_type:
                objects = [o for o in objects if o.get("type") == object_type]

            all_objects.extend(objects)

        response = {
            "objects": all_objects,
        }

        # Add pagination info
        has_more = (start_idx + limit) < len(analyzed)
        if has_more:
            response["more"] = True
            response["next"] = str(start_idx + limit)

        return response

    def get_manifest(self, collection_id: str, limit: int = 50) -> dict:
        """Get manifest of objects in a collection."""
        if collection_id != COLLECTION_ID:
            return {"objects": []}

        all_articles = cache_manager.get_all_cached_articles()
        manifest_entries = []

        for article in all_articles:
            if not article.stix_bundle:
                continue
            bundle = article.stix_bundle
            if isinstance(bundle, str):
                bundle = json.loads(bundle)

            for obj in bundle.get("objects", [])[:limit]:
                manifest_entries.append({
                    "id": obj.get("id", ""),
                    "date_added": (article.published or article.fetched_at).isoformat() + "Z"
                    if (article.published or article.fetched_at) else datetime.utcnow().isoformat() + "Z",
                    "version": obj.get("modified", obj.get("created", "")),
                    "media_type": "application/stix+json;version=2.1",
                })

        return {"objects": manifest_entries[:limit]}


# Singleton
taxii_service = TAXIIService()
