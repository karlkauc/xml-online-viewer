# FundsXML Online Validator

Ein selbst-hostbares Web-Tool, um **XML-Daten** anzusehen und gegen ein
**beliebiges XSD-Schema** zu validieren. Validierungsfehler lassen sich als
**Excel-Report** herunterladen.

Schwesterprojekt zum [Online XSD Viewer](../online_viewer); teilt dessen
Architektur (FastAPI + lxml Backend, React/TypeScript/Vite/Tailwind Frontend)
und sicherheitskritischen Code (XXE-, SSRF- und XML-Bomb-Schutz).

## Funktionen

- **Aufklappbare Baum-Darstellung** von XML-Daten (Elemente, Attribute, Werte,
  Kommentare) mit Suche und virtualisiertem Rendering für große Dokumente.
- **Schemavalidierung** gegen ein hochgeladenes XSD — Einzeldatei oder ZIP für
  mehrteilige Schemas (`include`/`import`, z.B. FundsXML4 + xmldsig).
- **Fehler-Highlighting im Baum**: jeder Fehler wird auf den betroffenen Knoten
  abgebildet; Klick auf einen Fehler springt dorthin.
- **Excel-Report** (.xlsx) aller Validierungsfehler zum Download.

XML und XSD lassen sich jeweils per Datei-Upload, Einfügen von Text oder URL laden.

## Lokal entwickeln

Backend (FastAPI, Port 8080):

```bash
cd backend
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8080
```

Frontend (Vite Dev-Server, Port 5173, proxyt `/api` → 8080):

```bash
cd frontend
npm install
npm run dev
```

## Tests & Linting

```bash
cd backend && pytest          # API-, Parser-, Validierungstests
cd backend && ruff check .
cd frontend && npm run build  # tsc + vite build
cd frontend && npm run lint
```

## Docker

```bash
docker compose up --build
# erreichbar unter http://127.0.0.1:8092
```

Das Multi-Stage-Image baut das Frontend (node:20) und serviert die statische
SPA zusammen mit der API aus einem Python-3.12-Runtime-Container.

## Konfiguration (Umgebungsvariablen)

| Variable | Default | Zweck |
|----------|---------|-------|
| `PORT` | `8080` | Server-Port |
| `MAX_UPLOAD_MB` | `50` | Maximale Upload-Größe |
| `ALLOWED_SCHEMA_HOSTS` | – | Komma-getrennte Host-Regexes; leer = alle öffentlichen http(s)-Hosts erlaubt (private/loopback bleiben blockiert) |
| `CACHE_TTL_MIN` | `60` | Cache-Lebensdauer (Minuten) |
| `CACHE_MAX_ENTRIES` | `64` | Cache-Größe pro Typ (XML/XSD/Validierung) |
| `CORS_ALLOW_ORIGINS` | – | Nur setzen, wenn ein fremdes Frontend die API aufruft |

## API

| Methode | Pfad | Zweck |
|---------|------|-------|
| POST | `/api/xml/{upload,text,url}` | XML-Daten laden → Baum-Modell |
| GET | `/api/xml/{xml_id}` | gecachtes XML-Modell |
| POST | `/api/xsd/{upload,text,url}` | XSD-Schema laden (Datei/ZIP) |
| POST | `/api/validate` | `{xml_id, xsd_id}` → Validierungsergebnis |
| GET | `/api/validate/{validation_id}/excel` | Excel-Report herunterladen |
| GET | `/api/health` | Liveness |
