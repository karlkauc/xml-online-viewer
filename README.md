# XML Online Viewer

A self-hostable web tool to view **XML data** and validate it against an
**arbitrary XSD schema**. Validation errors can be downloaded as an
**Excel report**. Live at <https://www.xml-viewer.online>.

Sibling project to the [XSD Online Viewer](https://www.xsd-viewer.online); it
shares that project's architecture (FastAPI + lxml backend, React/TypeScript/
Vite/Tailwind frontend) and security-critical code (XXE, SSRF and XML-bomb
protection).

## Features

- **Collapsible tree view** of XML data (elements, attributes, values,
  comments) with search and virtualized rendering for large documents.
- **Graphical diagram view** (React Flow): horizontal node graph with
  expand/collapse, minimap and PNG/SVG export.
- **Schema validation** against an uploaded XSD — single file or ZIP for
  multi-file schemas (`include`/`import`, e.g. FundsXML4 + xmldsig). The main
  schema of a multi-file ZIP is auto-detected, and the bundled W3C
  `xmldsig-core-schema.xsd` is injected when referenced but not supplied.
- **Load schemas from FundsXML GitHub releases** via a dedicated tab.
- **Automatic validation** as soon as both an XML and an XSD are loaded.
- **Error highlighting** in both views: each error maps to the offending node
  (red); a parent whose subtree contains an error is marked amber (`⤵ N`), so
  you can open exactly the affected branches. Clicking an error reveals and
  centers the node.
- **Excel report** (.xlsx) of all validation errors, including, per error, the
  line before, the error line (highlighted) and the line after.

XML and XSD can each be loaded by file upload, pasting text, or a URL.

## Local development

Backend (FastAPI, port 8080):

```bash
cd backend
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8080
```

Frontend (Vite dev server, port 5173, proxies `/api` → 8080):

```bash
cd frontend
npm install
npm run dev
```

## Tests & linting

```bash
cd backend && pytest          # API, parser and validation tests
cd backend && ruff check .
cd frontend && npm run build  # tsc + vite build
cd frontend && npm run lint
```

## Docker

```bash
docker compose up --build
# available at http://127.0.0.1:8092
```

The multi-stage image builds the frontend (node:20) and serves the static SPA
together with the API from a Python 3.12 runtime container.

## Configuration (environment variables)

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `8080` | Server port |
| `MAX_UPLOAD_MB` | `50` | Maximum upload size |
| `ALLOWED_SCHEMA_HOSTS` | – | Comma-separated host regexes; empty = any public http(s) host allowed (private/loopback stay blocked) |
| `CACHE_TTL_MIN` | `60` | Cache lifetime (minutes) |
| `CACHE_MAX_ENTRIES` | `64` | Cache size per type (XML/XSD/validation) |
| `CORS_ALLOW_ORIGINS` | – | Only set if a foreign frontend calls the API |

## API

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/xml/{upload,text,url}` | Load XML data → tree model |
| GET | `/api/xml/{xml_id}` | Cached XML model |
| POST | `/api/xsd/{upload,text,url}` | Load XSD schema (file/ZIP) |
| GET | `/api/fundsxml/releases` | List FundsXML GitHub releases |
| POST | `/api/fundsxml/releases/{tag}/load` | Load a schema from a release |
| POST | `/api/validate` | `{xml_id, xsd_id}` → validation result |
| GET | `/api/validate/{validation_id}/excel` | Download Excel report |
| GET | `/api/health` | Liveness |
