"""Modelli dati per l'applicazione CTI Feed RSS."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, HttpUrl


# ── Enums ──────────────────────────────────────────────────────────────────────


class ThreatCategory(str, Enum):
    """Categorie di minaccia per settore colpito."""

    FINANCE = "finance"
    HEALTHCARE = "healthcare"
    GOVERNMENT = "government"
    ENERGY = "energy"
    TELECOMMUNICATIONS = "telecommunications"
    MANUFACTURING = "manufacturing"
    EDUCATION = "education"
    RETAIL = "retail"
    TECHNOLOGY = "technology"
    TRANSPORTATION = "transportation"
    DEFENSE = "defense"
    CRITICAL_INFRASTRUCTURE = "critical_infrastructure"
    GENERAL = "general"
    UNKNOWN = "unknown"


class SeverityLevel(str, Enum):
    """Livello di gravità della minaccia."""

    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFORMATIONAL = "informational"


class ArticleStatus(str, Enum):
    """Stato di elaborazione dell'articolo."""

    PENDING = "pending"
    PROCESSING = "processing"
    ANALYZED = "analyzed"
    ERROR = "error"


# ── Feed Models ────────────────────────────────────────────────────────────────


class FeedSource(BaseModel):
    """Sorgente RSS."""

    id: str
    name: str
    url: str
    language: str = "en"
    category: str = "general"
    description: str = ""
    enabled: bool = True
    last_fetched: Optional[datetime] = None


class FeedSourceResponse(FeedSource):
    """Risposta API per una sorgente RSS."""

    article_count: int = 0


# ── Article Models ─────────────────────────────────────────────────────────────


class Article(BaseModel):
    """Articolo RSS parsato."""

    id: str
    feed_id: str
    title: str
    link: str
    published: Optional[datetime] = None
    summary: str = ""
    content: str = ""
    author: str = ""
    tags: list[str] = Field(default_factory=list)
    status: ArticleStatus = ArticleStatus.PENDING
    fetched_at: datetime = Field(default_factory=datetime.utcnow)


class ArticleListResponse(BaseModel):
    """Risposta paginata di articoli."""

    articles: list[ArticleAnalyzed] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    page_size: int = 20
    has_next: bool = False


# ── AI Analysis Models ─────────────────────────────────────────────────────────


class ThreatIndicator(BaseModel):
    """Indicatore di compromissione (IoC)."""

    type: str  # ip, domain, hash, url, email, cve
    value: str
    context: str = ""


class ThreatActor(BaseModel):
    """Attore della minaccia identificato."""

    name: str
    aliases: list[str] = Field(default_factory=list)
    motivation: str = ""
    country: str = ""


class AttackTechnique(BaseModel):
    """Tecnica di attacco MITRE ATT&CK."""

    technique_id: str  # e.g. T1566
    technique_name: str
    tactic: str = ""
    description: str = ""


class Vulnerability(BaseModel):
    """Vulnerabilità identificata."""

    cve_id: str
    description: str = ""
    cvss_score: Optional[float] = None
    affected_products: list[str] = Field(default_factory=list)


class AIAnalysis(BaseModel):
    """Risultato dell'analisi AI di un articolo."""

    summary_it: str = ""  # Riassunto in italiano
    summary_en: str = ""  # Riassunto in inglese
    threat_category: ThreatCategory = ThreatCategory.UNKNOWN
    severity: SeverityLevel = SeverityLevel.INFORMATIONAL
    threat_actors: list[ThreatActor] = Field(default_factory=list)
    indicators: list[ThreatIndicator] = Field(default_factory=list)
    attack_techniques: list[AttackTechnique] = Field(default_factory=list)
    vulnerabilities: list[Vulnerability] = Field(default_factory=list)
    affected_sectors: list[ThreatCategory] = Field(default_factory=list)
    malware_families: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    key_findings: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    confidence_score: float = 0.0


class ArticleAnalyzed(BaseModel):
    """Articolo con analisi AI completata."""

    id: str
    feed_id: str
    feed_name: str = ""
    title: str
    link: str
    published: Optional[datetime] = None
    summary: str = ""
    content: str = ""
    author: str = ""
    tags: list[str] = Field(default_factory=list)
    status: ArticleStatus = ArticleStatus.ANALYZED
    fetched_at: datetime = Field(default_factory=datetime.utcnow)
    analysis: Optional[AIAnalysis] = None
    stix_bundle: Optional[dict] = None


# ── STIX Models ────────────────────────────────────────────────────────────────


class STIXBundleResponse(BaseModel):
    """Risposta contenente un bundle STIX."""

    article_id: str
    bundle: dict
    object_count: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ── Report Models ──────────────────────────────────────────────────────────────


class TechnicalReport(BaseModel):
    """Report tecnico generato dall'AI."""

    id: str
    title: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    article_ids: list[str] = Field(default_factory=list)
    executive_summary: str = ""
    technical_details: str = ""
    indicators_of_compromise: list[ThreatIndicator] = Field(default_factory=list)
    attack_techniques: list[AttackTechnique] = Field(default_factory=list)
    affected_sectors: list[ThreatCategory] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    stix_bundle: Optional[dict] = None
    severity: SeverityLevel = SeverityLevel.INFORMATIONAL


class ReportRequest(BaseModel):
    """Richiesta di generazione report."""

    article_ids: list[str]
    title: Optional[str] = None
    include_stix: bool = True
    language: str = "it"


# ── Stats Models ───────────────────────────────────────────────────────────────


class DashboardStats(BaseModel):
    """Statistiche per la dashboard."""

    total_articles: int = 0
    analyzed_articles: int = 0
    pending_articles: int = 0
    total_feeds: int = 0
    active_feeds: int = 0
    articles_by_category: dict[str, int] = Field(default_factory=dict)
    articles_by_severity: dict[str, int] = Field(default_factory=dict)
    recent_threat_actors: list[str] = Field(default_factory=list)
    last_update: Optional[datetime] = None


# Fix forward reference
ArticleListResponse.model_rebuild()
