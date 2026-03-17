"""Database dei feed RSS di Cyber Threat Intelligence.

Raccolta completa di fonti italiane e internazionali per CTI.
"""

from app.models.schemas import FeedSource

CTI_FEEDS: list[FeedSource] = [
    # ── Feed Italiani ──────────────────────────────────────────────────────────
    FeedSource(
        id="csirt-italia",
        name="CSIRT Italia",
        url="https://www.csirt.gov.it/contenuti/feed.rss",
        language="it",
        category="government",
        description="Computer Security Incident Response Team - Italia (ACN)",
    ),
    FeedSource(
        id="cert-agid",
        name="CERT-AGID",
        url="https://cert-agid.gov.it/feed/",
        language="it",
        category="government",
        description="CERT dell'Agenzia per l'Italia Digitale",
    ),
    FeedSource(
        id="redhotcyber",
        name="Red Hot Cyber",
        url="https://www.redhotcyber.com/feed/",
        language="it",
        category="general",
        description="Notizie di cybersecurity in italiano",
    ),
    FeedSource(
        id="cybersecurity360",
        name="Cybersecurity360",
        url="https://www.cybersecurity360.it/feed/",
        language="it",
        category="general",
        description="Testata italiana su cybersecurity e data protection",
    ),
    FeedSource(
        id="sicurezza-it",
        name="Sicurezza.net",
        url="https://sicurezza.net/feed/",
        language="it",
        category="general",
        description="Portale italiano sulla sicurezza informatica",
    ),
    FeedSource(
        id="insicurezzadigitale",
        name="Insicurezza Digitale",
        url="https://www.insicurezzadigitale.com/feed/",
        language="it",
        category="general",
        description="Blog italiano su vulnerabilità e minacce cyber",
    ),

    # ── Feed Internazionali - Vendor & Labs ────────────────────────────────────
    FeedSource(
        id="bleepingcomputer",
        name="BleepingComputer",
        url="https://www.bleepingcomputer.com/feed/",
        language="en",
        category="general",
        description="Technology news with focus on cybersecurity",
    ),
    FeedSource(
        id="therecord",
        name="The Record by Recorded Future",
        url="https://therecord.media/feed",
        language="en",
        category="general",
        description="Cybersecurity news by Recorded Future",
    ),
    FeedSource(
        id="darkreading",
        name="Dark Reading",
        url="https://www.darkreading.com/rss.xml",
        language="en",
        category="general",
        description="Enterprise cybersecurity news and analysis",
    ),
    FeedSource(
        id="threatpost",
        name="Threatpost",
        url="https://threatpost.com/feed/",
        language="en",
        category="general",
        description="Independent news site covering IT security",
    ),
    FeedSource(
        id="thehackernews",
        name="The Hacker News",
        url="https://feeds.feedburner.com/TheHackersNews",
        language="en",
        category="general",
        description="Most popular cyber security and hacking news site",
    ),
    FeedSource(
        id="krebs",
        name="Krebs on Security",
        url="https://krebsonsecurity.com/feed/",
        language="en",
        category="general",
        description="In-depth security news and investigation",
    ),
    FeedSource(
        id="schneier",
        name="Schneier on Security",
        url="https://www.schneier.com/feed/",
        language="en",
        category="general",
        description="Bruce Schneier's security blog",
    ),
    FeedSource(
        id="securityweek",
        name="SecurityWeek",
        url="https://www.securityweek.com/feed/",
        language="en",
        category="general",
        description="Cybersecurity news, insights and analysis",
    ),

    # ── Feed Threat Intelligence Specifici ─────────────────────────────────────
    FeedSource(
        id="mandiant",
        name="Mandiant (Google Cloud)",
        url="https://www.mandiant.com/resources/blog/rss.xml",
        language="en",
        category="threat_intel",
        description="Mandiant threat intelligence research",
    ),
    FeedSource(
        id="microsoft-threat",
        name="Microsoft Threat Intelligence",
        url="https://www.microsoft.com/en-us/security/blog/feed/",
        language="en",
        category="threat_intel",
        description="Microsoft security research and threat intel",
    ),
    FeedSource(
        id="crowdstrike",
        name="CrowdStrike Blog",
        url="https://www.crowdstrike.com/blog/feed/",
        language="en",
        category="threat_intel",
        description="CrowdStrike threat research and intelligence",
    ),
    FeedSource(
        id="sentinelone",
        name="SentinelOne Labs",
        url="https://www.sentinelone.com/labs/feed/",
        language="en",
        category="threat_intel",
        description="SentinelOne threat research",
    ),
    FeedSource(
        id="talosintel",
        name="Cisco Talos Intelligence",
        url="https://blog.talosintelligence.com/feeds/posts/default",
        language="en",
        category="threat_intel",
        description="Cisco Talos threat intelligence and research",
    ),
    FeedSource(
        id="kaspersky-securelist",
        name="Securelist (Kaspersky)",
        url="https://securelist.com/feed/",
        language="en",
        category="threat_intel",
        description="Kaspersky's threat research blog",
    ),
    FeedSource(
        id="paloalto-unit42",
        name="Unit 42 (Palo Alto)",
        url="https://unit42.paloaltonetworks.com/feed/",
        language="en",
        category="threat_intel",
        description="Palo Alto Networks threat research unit",
    ),
    FeedSource(
        id="trendmicro",
        name="Trend Micro Research",
        url="https://www.trendmicro.com/en_us/research.html/rss",
        language="en",
        category="threat_intel",
        description="Trend Micro threat research",
    ),
    FeedSource(
        id="proofpoint",
        name="Proofpoint Threat Insight",
        url="https://www.proofpoint.com/us/threat-insight/rss.xml",
        language="en",
        category="threat_intel",
        description="Proofpoint threat intelligence blog",
    ),
    FeedSource(
        id="sophos-news",
        name="Sophos News",
        url="https://news.sophos.com/en-us/feed/",
        language="en",
        category="threat_intel",
        description="Sophos cybersecurity research and news",
    ),
    FeedSource(
        id="welivesecurity",
        name="WeLiveSecurity (ESET)",
        url="https://www.welivesecurity.com/feed/",
        language="en",
        category="threat_intel",
        description="ESET security research blog",
    ),
    FeedSource(
        id="elastic-security",
        name="Elastic Security Labs",
        url="https://www.elastic.co/security-labs/rss/feed.xml",
        language="en",
        category="threat_intel",
        description="Elastic threat research and detection engineering",
    ),

    # ── Feed CERT / Governativi Internazionali ─────────────────────────────────
    FeedSource(
        id="cisa-alerts",
        name="CISA Alerts",
        url="https://www.cisa.gov/cybersecurity-advisories/all.xml",
        language="en",
        category="government",
        description="US Cybersecurity & Infrastructure Security Agency alerts",
    ),
    FeedSource(
        id="us-cert",
        name="US-CERT Current Activity",
        url="https://www.cisa.gov/uscert/ncas/current-activity.xml",
        language="en",
        category="government",
        description="US CERT current cyber activity",
    ),
    FeedSource(
        id="ncsc-uk",
        name="NCSC UK",
        url="https://www.ncsc.gov.uk/api/1/services/v1/report-rss-feed.xml",
        language="en",
        category="government",
        description="UK National Cyber Security Centre",
    ),
    FeedSource(
        id="cert-eu",
        name="CERT-EU",
        url="https://cert.europa.eu/publications/security-advisories/rss",
        language="en",
        category="government",
        description="CERT dell'Unione Europea",
    ),
    FeedSource(
        id="cert-fr",
        name="CERT-FR (ANSSI)",
        url="https://www.cert.ssi.gouv.fr/feed/",
        language="fr",
        category="government",
        description="CERT governativo francese (ANSSI)",
    ),
    FeedSource(
        id="bsi-germany",
        name="BSI Germany",
        url="https://www.bsi.bund.de/SiteGlobals/Functions/RSSFeed/RSSNewsfeed/RSSNewsfeed.xml",
        language="de",
        category="government",
        description="Bundesamt für Sicherheit in der Informationstechnik",
    ),

    # ── Feed Vulnerabilità ─────────────────────────────────────────────────────
    FeedSource(
        id="nist-nvd",
        name="NIST NVD",
        url="https://nvd.nist.gov/feeds/xml/cve/misc/nvd-rss-analyzed.xml",
        language="en",
        category="vulnerability",
        description="National Vulnerability Database - nuove CVE analizzate",
    ),
    FeedSource(
        id="exploit-db",
        name="Exploit-DB",
        url="https://www.exploit-db.com/rss.xml",
        language="en",
        category="vulnerability",
        description="Database di exploit pubblici",
    ),
    FeedSource(
        id="packetstorm",
        name="Packet Storm Security",
        url="https://rss.packetstormsecurity.com/",
        language="en",
        category="vulnerability",
        description="Security advisories, exploits and tools",
    ),

    # ── Feed da CyberSecurityRSS OPML ──────────────────────────────────────────
    FeedSource(
        id="qualys-blog",
        name="Qualys Threat Research",
        url="https://blog.qualys.com/feed",
        language="en",
        category="vulnerability",
        description="Qualys vulnerability and threat research",
    ),
    FeedSource(
        id="google-security",
        name="Google Online Security Blog",
        url="http://googleonlinesecurity.blogspot.com/feeds/posts/default",
        language="en",
        category="threat_intel",
        description="Google security research and advisories",
    ),
    FeedSource(
        id="security-boulevard",
        name="Security Boulevard",
        url="https://securityboulevard.com/feed/",
        language="en",
        category="general",
        description="Cybersecurity news and analysis community",
    ),
    FeedSource(
        id="tenable-blog",
        name="Tenable Blog",
        url="https://feeds.feedburner.com/tenable/qaXL",
        language="en",
        category="vulnerability",
        description="Tenable vulnerability research",
    ),
    FeedSource(
        id="vulners-rss",
        name="Vulners.com",
        url="https://vulners.com/rss.xml",
        language="en",
        category="vulnerability",
        description="Aggregated vulnerability data feed",
    ),
    FeedSource(
        id="vuldb",
        name="VulDB Recent Entries",
        url="https://vuldb.com/en/?rss.recent",
        language="en",
        category="vulnerability",
        description="Vulnerability database recent entries",
    ),
    FeedSource(
        id="cxsecurity",
        name="CXSecurity",
        url="https://cxsecurity.com/wlb/rss/all/",
        language="en",
        category="vulnerability",
        description="World Laboratory of Bugtraq 2",
    ),
    FeedSource(
        id="sploitus",
        name="Sploitus.com Exploits",
        url="https://sploitus.com/rss",
        language="en",
        category="vulnerability",
        description="Exploit and vulnerability search engine",
    ),
    FeedSource(
        id="securityaffairs",
        name="Security Affairs",
        url="https://securityaffairs.co/wordpress/category/data-breach/feed",
        language="en",
        category="general",
        description="Security Affairs - Data Breach intelligence",
    ),
    FeedSource(
        id="cybernews",
        name="CyberNews",
        url="https://cybernews.com/feed/",
        language="en",
        category="general",
        description="Cybersecurity news and investigations",
    ),
    FeedSource(
        id="troyhunt",
        name="Troy Hunt",
        url="https://www.troyhunt.com/rss/",
        language="en",
        category="general",
        description="Troy Hunt security blog (Have I Been Pwned creator)",
    ),
    FeedSource(
        id="fidelis",
        name="Fidelis Security",
        url="https://fidelissecurity.com/feed/",
        language="en",
        category="threat_intel",
        description="Fidelis Cybersecurity threat research",
    ),
    FeedSource(
        id="redpacket",
        name="RedPacket Security",
        url="https://www.redpacketsecurity.com/feed/",
        language="en",
        category="general",
        description="Cybersecurity news and alerts",
    ),
    FeedSource(
        id="portswigger-research",
        name="PortSwigger Research",
        url="https://portswigger.net/research/rss",
        language="en",
        category="vulnerability",
        description="Web security research by PortSwigger",
    ),
    FeedSource(
        id="fox-it",
        name="Fox-IT Blog",
        url="http://blog.fox-it.com/feed/",
        language="en",
        category="threat_intel",
        description="Fox-IT International threat research",
    ),
    FeedSource(
        id="horizon3",
        name="Horizon3.ai",
        url="https://www.horizon3.ai/feed/",
        language="en",
        category="threat_intel",
        description="Horizon3.ai attack research and NodeZero",
    ),
    FeedSource(
        id="trail-of-bits",
        name="Trail of Bits",
        url="https://blog.trailofbits.com/feed/",
        language="en",
        category="threat_intel",
        description="Trail of Bits security research",
    ),
    FeedSource(
        id="project-discovery",
        name="ProjectDiscovery Blog",
        url="https://blog.projectdiscovery.io/rss/",
        language="en",
        category="vulnerability",
        description="ProjectDiscovery security tools and research",
    ),
    FeedSource(
        id="google-bughunters",
        name="Google Bug Hunters",
        url="https://bughunters.google.com/feed/en",
        language="en",
        category="vulnerability",
        description="Google Security Engineering Blog",
    ),
    FeedSource(
        id="claroty-team82",
        name="Claroty Team82",
        url="https://claroty.com/team82/disclosure-dashboard/feed/atom",
        language="en",
        category="vulnerability",
        description="ICS/SCADA vulnerability disclosures",
    ),
    FeedSource(
        id="malwaretech",
        name="MalwareTech",
        url="http://www.malwaretech.com/feeds/posts/default",
        language="en",
        category="malware",
        description="MalwareTech security blog (WannaCry researcher)",
    ),
    FeedSource(
        id="intigriti",
        name="Intigriti Blog",
        url="https://blog.intigriti.com/feed/",
        language="en",
        category="vulnerability",
        description="Intigriti bug bounty and security research",
    ),
    FeedSource(
        id="hackernews-cc",
        name="HackerNews (Chinese EN)",
        url="http://hackernews.cc/feed",
        language="en",
        category="general",
        description="Cybersecurity news aggregator",
    ),
    FeedSource(
        id="anquanke",
        name="安全客 (AnQuanKe)",
        url="https://api.anquanke.com/data/v1/rss",
        language="zh",
        category="general",
        description="Chinese cybersecurity media platform",
    ),
    FeedSource(
        id="nosec-threat",
        name="NOSEC Threat Intelligence",
        url="https://rsshub.app/nosec/threaten",
        language="zh",
        category="threat_intel",
        description="NOSEC Chinese threat intelligence platform",
    ),
    FeedSource(
        id="hackingdream",
        name="Hacking Dream",
        url="https://www.hackingdream.net/feeds/posts/default?alt=rss",
        language="en",
        category="general",
        description="Hacking tutorials and security news",
    ),
    FeedSource(
        id="cert-vul-notes",
        name="CERT Vulnerability Notes",
        url="http://www.kb.cert.org/vulfeed",
        language="en",
        category="vulnerability",
        description="CERT/CC recently published vulnerability notes",
    ),

    # ── Feed Ransomware & Malware ──────────────────────────────────────────────
    FeedSource(
        id="malwarebytes-labs",
        name="Malwarebytes Labs",
        url="https://www.malwarebytes.com/blog/feed",
        language="en",
        category="malware",
        description="Malwarebytes threat intelligence and research",
    ),
    FeedSource(
        id="virustotal",
        name="VirusTotal Blog",
        url="https://blog.virustotal.com/feeds/posts/default",
        language="en",
        category="malware",
        description="VirusTotal research and updates",
    ),
]


def get_all_feeds() -> list[FeedSource]:
    """Restituisce tutti i feed CTI configurati (statici + dinamici)."""
    return CTI_FEEDS + _dynamic_feeds


def get_enabled_feeds() -> list[FeedSource]:
    """Restituisce solo i feed attivi."""
    return [f for f in CTI_FEEDS + _dynamic_feeds if f.enabled]


def get_feeds_by_language(language: str) -> list[FeedSource]:
    """Restituisce i feed per lingua."""
    return [f for f in CTI_FEEDS + _dynamic_feeds if f.language == language and f.enabled]


def get_feeds_by_category(category: str) -> list[FeedSource]:
    """Restituisce i feed per categoria."""
    return [f for f in CTI_FEEDS + _dynamic_feeds if f.category == category and f.enabled]


def get_feed_by_id(feed_id: str) -> FeedSource | None:
    """Restituisce un feed per ID."""
    for feed in CTI_FEEDS:
        if feed.id == feed_id:
            return feed
    # Cerca anche nei feed importati dinamicamente
    for feed in _dynamic_feeds:
        if feed.id == feed_id:
            return feed
    return None


# ── Feed Dinamici (importati da OPML) ──────────────────────────────────────────

_dynamic_feeds: list[FeedSource] = []


def add_dynamic_feed(feed: FeedSource) -> bool:
    """Aggiunge un feed importato dinamicamente. Restituisce True se nuovo."""
    existing_ids = {f.id for f in CTI_FEEDS} | {f.id for f in _dynamic_feeds}
    if feed.id in existing_ids:
        return False
    _dynamic_feeds.append(feed)
    return True


def get_dynamic_feeds() -> list[FeedSource]:
    """Restituisce i feed importati dinamicamente."""
    return _dynamic_feeds.copy()


def clear_dynamic_feeds() -> None:
    """Rimuove tutti i feed dinamici."""
    _dynamic_feeds.clear()
