# CTI Feed RSS — Mobile App + Backend

Applicazione mobile per l'aggregazione di feed RSS relativi alla **Cyber Threat Intelligence (CTI)**, con analisi AI, generazione STIX 2.1 e categorizzazione automatica.

---

## Architettura

```
┌──────────────┐       REST API       ┌──────────────────┐
│  Mobile App  │  ◄──────────────►   │  Backend FastAPI  │
│  (Expo/RN)   │                      │  (Python 3.11+)  │
└──────────────┘                      └────────┬─────────┘
                                               │
                              ┌────────────────┼────────────────┐
                              │                │                │
                         Feed RSS         AI Engine          STIX 2.1
                         (50+ fonti)   (Ollama/Gemini/      (bundle)
                                        OpenAI/nessuno)
```

## Funzionalità

- **50+ feed RSS CTI** — fonti italiane (CSIRT Italia, CERT-AGID, Red Hot Cyber, Cybersecurity360) e internazionali (BleepingComputer, The Hacker News, Krebs, CrowdStrike, Mandiant, CISA, Unit42, Securelist, ecc.)
- **Importazione OPML** — importa feed da file OPML remoti
- **Analisi AI multi-engine** — estrazione automatica di: IoC, threat actor, tecniche MITRE ATT&CK, CVE, settori colpiti. Supporta:
  - **Ollama** (locale, gratuito) — Llama 3, Mistral, Gemma, ecc.
  - **Google Gemini** (gratuito con limiti) — Gemini 2.0 Flash
  - **OpenAI** (a pagamento) — GPT-4o
  - **Nessuno** — funziona come lettore RSS con categorizzazione base e IoC regex
- **STIX 2.1** — generazione bundle OASIS con ThreatActor, Malware, Indicator, AttackPattern, Vulnerability, Relationship, Report
- **Categorizzazione** — articoli divisi per settore aziendale (Finanza, Energia, Sanità, PA, Telecomunicazioni, ecc.)
- **Report tecnici** — generazione report multi-articolo con sommario esecutivo, dettagli tecnici e raccomandazioni
- **Cache offline** — cache lato backend (disco) e lato mobile (AsyncStorage) con TTL configurabile

---

## Requisiti

| Componente | Versione minima |
|------------|----------------|
| Python     | 3.11+          |
| Node.js    | 18+            |
| Expo CLI   | 6+             |
| AI Engine  | opzionale      |

---

## Setup Backend

```bash
cd backend

# Ambiente virtuale
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux

# Dipendenze
pip install -r requirements.txt

# Configurazione
cp .env.example .env
# Scegli un motore AI nel .env (opzionale)
```

### Variabili d'ambiente (.env)

```bash
# Motore AI: ollama, gemini, openai (o lascia vuoto per nessuno)
AI_ENGINE=ollama

# Ollama (locale, gratis — https://ollama.com)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3

# Google Gemini (gratis con limiti — https://aistudio.google.com/apikey)
# GEMINI_API_KEY=your-key
# GEMINI_MODEL=gemini-2.0-flash

# OpenAI (a pagamento)
# OPENAI_API_KEY=sk-...
# OPENAI_MODEL=gpt-4o

DEBUG=true
HOST=0.0.0.0
PORT=8000
```

### Avvio

```bash
python -m app.main
# Oppure:
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Il server sarà disponibile su `http://localhost:8000`. Documentazione API interattiva su `http://localhost:8000/docs`.

---

## Setup Mobile

```bash
cd mobile

# Dipendenze
npm install

# Avvio
npx expo start
```

Scansiona il QR code con **Expo Go** oppure premi `a` per l'emulatore Android / `i` per iOS Simulator.

### Configurazione

Nella schermata **Impostazioni** dell'app, inserisci l'URL del backend (es. `http://192.168.1.X:8000`).

---

## API Endpoints

| Metodo | Endpoint | Descrizione |
|--------|----------|-------------|
| `GET`  | `/api/v1/feeds` | Lista feed RSS disponibili |
| `GET`  | `/api/v1/feeds/{id}` | Dettaglio feed |
| `GET`  | `/api/v1/articles` | Articoli con filtri e paginazione |
| `GET`  | `/api/v1/articles/{id}` | Dettaglio articolo |
| `POST` | `/api/v1/articles/fetch` | Scarica nuovi articoli dai feed |
| `POST` | `/api/v1/articles/{id}/analyze` | Analisi AI di un articolo |
| `GET`  | `/api/v1/articles/{id}/stix` | Bundle STIX 2.1 |
| `POST` | `/api/v1/feeds/import-opml` | Importa feed da file OPML |
| `GET`  | `/api/v1/ai/status` | Stato motore AI |
| `POST` | `/api/v1/reports/generate` | Genera report tecnico |
| `GET`  | `/api/v1/dashboard/stats` | Statistiche dashboard |
| `GET`  | `/api/v1/categories` | Lista categorie con conteggi |
| `DELETE`| `/api/v1/cache` | Svuota cache backend |
| `GET`  | `/health` | Health check |

### Filtri articoli

`GET /api/v1/articles?category=FINANCE&severity=critical&feed_id=xxx&search=ransomware&page=1&page_size=20`

---

## Struttura Progetto

```
.
├── backend/
│   ├── app/
│   │   ├── api/routes.py          # Endpoint REST
│   │   ├── data/
│   │   │   ├── feeds.py           # 35+ feed RSS
│   │   │   └── cache_manager.py   # Cache su disco
│   │   ├── models/schemas.py      # Modelli dati Pydantic
│   │   ├── services/
│   │   │   ├── ai_service.py      # Analisi AI (Ollama/Gemini/OpenAI)
│   │   │   ├── rss_service.py     # Fetching feed RSS
│   │   │   ├── stix_service.py    # Generazione STIX 2.1
│   │   │   ├── categorizer.py     # Categorizzazione articoli
│   │   │   └── opml_service.py    # Import feed da OPML
│   │   ├── config.py
│   │   └── main.py
│   ├── requirements.txt
│   └── .env.example
│
├── mobile/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ArticleCard.js     # Card articolo
│   │   │   ├── CategoryBadge.js   # Badge categoria
│   │   │   └── StixViewer.js      # Visualizzatore STIX
│   │   ├── navigation/
│   │   │   └── AppNavigator.js    # Tab + stack navigation
│   │   ├── screens/
│   │   │   ├── HomeScreen.js      # Dashboard
│   │   │   ├── FeedScreen.js      # Lista articoli + filtri
│   │   │   ├── ArticleDetailScreen.js  # Dettaglio con tab
│   │   │   ├── ReportsScreen.js   # Generazione report
│   │   │   └── SettingsScreen.js  # Impostazioni
│   │   ├── services/
│   │   │   ├── api.js             # Client API REST
│   │   │   └── cacheService.js    # Cache AsyncStorage
│   │   ├── store/
│   │   │   └── ArticleStore.js    # Zustand global state
│   │   ├── theme/index.js         # Dark theme
│   │   └── utils/helpers.js       # Utilità
│   ├── App.js
│   ├── app.json
│   └── package.json
│
└── README.md
```

---

## Categorie Settoriali

| Codice | Settore |
|--------|---------|
| `FINANCE` | Banche, assicurazioni, fintech |
| `HEALTHCARE` | Ospedali, pharma, sanità |
| `GOVERNMENT` | Pubblica amministrazione, difesa |
| `ENERGY` | Energia, utility, oil & gas |
| `TELECOM` | Telecomunicazioni, ISP |
| `MANUFACTURING` | Industria, automotive, supply chain |
| `TECHNOLOGY` | IT, software, cloud, SaaS |
| `EDUCATION` | Università, scuole, ricerca |
| `RETAIL` | Retail, e-commerce |
| `TRANSPORTATION` | Trasporti, logistica, aviazione |
| `MEDIA` | Media, entertainment |
| `CRITICAL_INFRASTRUCTURE` | Infrastrutture critiche, SCADA/ICS |
| `MULTI_SECTOR` | Più settori coinvolti |
| `UNKNOWN` | Non classificato |

---

## Licenza

Uso personale / interno. Non distribuire le chiavi API.
