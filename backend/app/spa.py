"""Serve the built SPA: static assets plus the HTML shell for known client routes.

The shell is returned only for paths the frontend actually handles. Everything
else gets a plain 404, so vulnerability scanners probing /wp-login.php & co.
neither receive a 200 nor pollute the usage stats with fake page views.

Search engines see the shell before any JavaScript runs, so title,
description and canonical are rewritten per route in the served HTML, and
the home FAQ is filled in. Content pages (``app.content``) are plain HTML
documents rendered here too; ``/sitemap.xml`` lists both kinds.
"""

from __future__ import annotations

import html
import re
from dataclasses import dataclass
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.content.pages import all_pages, get_page, home_faq
from app.content.render import faq_html, faq_script, render_page, render_sitemap
from app.usage.context import emit
from app.usage.events import utm_fields

SITE_ORIGIN = "https://www.xml-viewer.online"


@dataclass(frozen=True)
class RouteMeta:
    title: str
    description: str
    canonical: str
    # Kept out of search results and the sitemap (shared reports are private-ish).
    noindex: bool = False


_HOME_DESCRIPTION = (
    "Free online XML validator and viewer: validate an XML file against its XSD (detected from "
    "xsi:schemaLocation or uploaded), export the errors to Excel, and explore the document as a "
    "collapsible tree or diagram. No install, no account."
)

# Keep in sync with the client routes in frontend/src/App.tsx.
ROUTE_META: dict[str, RouteMeta] = {
    "": RouteMeta(
        "Validate XML against XSD Online – Tree Viewer & Excel Error Report (Free)", _HOME_DESCRIPTION, "/"
    ),
    "fundsxml": RouteMeta(
        "FundsXML validator — check FundsXML files online — XML Online Viewer",
        "Validate FundsXML 4 documents against the official schema release they declare, list every "
        "error with line and path, export the list to Excel, and browse the file as a tree.",
        "/fundsxml",
    ),
    "report": RouteMeta(
        "Shared validation report — XML Online Viewer",
        "A list of XML schema validation errors shared from the XML Online Viewer.",
        "/",
        noindex=True,
    ),
}

SPA_ROUTES: frozenset[str] = frozenset(ROUTE_META)

_TITLE_RE = re.compile(r"<title>.*?</title>", re.S)
_DESCRIPTION_RE = re.compile(r'(<meta\s+name="description"\s+content=")[^"]*(")', re.S)
_CANONICAL_RE = re.compile(r'(<link\s+rel="canonical"\s+href=")[^"]*(")', re.S)
_OG_RE = {
    key: re.compile(rf'(<meta\s+property="og:{key}"\s+content=")[^"]*(")', re.S)
    for key in ("title", "description", "url")
}
_FAQ_MARKER = "<!--faq-->"
_FAQ_JSONLD_MARKER = "<!--faq-jsonld-->"


def render_shell(shell: str, route: str) -> str:
    """Return the index.html shell with title/description/canonical/OG for ``route``."""
    route = route.rstrip("/")
    meta = ROUTE_META[route]
    canonical = SITE_ORIGIN + meta.canonical
    title, description = html.escape(meta.title), html.escape(meta.description)
    shell = _TITLE_RE.sub(f"<title>{title}</title>", shell, count=1)
    shell = _DESCRIPTION_RE.sub(rf"\g<1>{description}\g<2>", shell, count=1)
    shell = _CANONICAL_RE.sub(rf"\g<1>{canonical}\g<2>", shell, count=1)
    for key, value in (("title", title), ("description", description), ("url", canonical)):
        shell = _OG_RE[key].sub(rf"\g<1>{value}\g<2>", shell, count=1)
    if meta.noindex:
        shell = shell.replace("</head>", '<meta name="robots" content="noindex" />\n</head>', 1)
    # FAQPage markup belongs to one URL only; the other routes just drop the markers.
    faq = home_faq() if route == "" else ()
    shell = shell.replace(_FAQ_MARKER, faq_html(faq), 1)
    return shell.replace(_FAQ_JSONLD_MARKER, faq_script(faq), 1)


def sitemap_urls() -> list[tuple[str, str | None]]:
    """Indexable URLs: the SPA routes with their own canonical, then every content page."""
    urls: list[tuple[str, str | None]] = []
    seen: set[str] = set()
    for meta in ROUTE_META.values():
        if not meta.noindex and meta.canonical not in seen:
            seen.add(meta.canonical)
            urls.append((SITE_ORIGIN + meta.canonical, None))
    for page in all_pages().values():
        if not page.noindex:
            urls.append((f"{SITE_ORIGIN}/{page.slug}", page.lastmod))
    return urls


CSP = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: blob:; "
    "font-src 'self' data:; "
    "connect-src 'self'; "
    # Nothing on the page needs these; closing them limits what injected markup could do.
    "base-uri 'self'; form-action 'self'; object-src 'none'; frame-ancestors 'none'"
)

SPA_HEADERS = {
    "Content-Security-Policy": CSP,
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    # Keep window.opener alive: xsd-viewer.online and odata-viewer.online open
    # this page with ?from=… and post the file to it.
    "Cross-Origin-Opener-Policy": "unsafe-none",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
}


def is_spa_route(full_path: str) -> bool:
    """True if the path (without leading slash) is a client-side route; a trailing slash is tolerated."""
    return full_path.rstrip("/") in SPA_ROUTES


def mount_spa(app: FastAPI, static_path: Path) -> None:
    """Serve the built React SPA from ``static_path`` (must contain index.html)."""
    app.mount("/assets", StaticFiles(directory=static_path / "assets"), name="assets")
    static_root = static_path.resolve()
    index_file = static_path / "index.html"

    @app.get("/sitemap.xml", include_in_schema=False)
    async def sitemap() -> Response:
        return Response(render_sitemap(sitemap_urls()), media_type="application/xml")

    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str, request: Request) -> Response:
        if full_path.startswith("api/"):
            return JSONResponse(status_code=404, content={"error": "not_found"})
        # Root-level static files (favicon.svg, robots.txt, …) are served
        # directly; guarded against path traversal.
        if full_path and full_path != "index.html":
            candidate = (static_root / full_path).resolve()
            if static_root in candidate.parents and candidate.is_file():
                return FileResponse(candidate)
        # IndexNow proves domain ownership with a key file at the root.
        if settings.indexnow_key and full_path == f"{settings.indexnow_key}.txt":
            return Response(settings.indexnow_key, media_type="text/plain")
        route = "" if full_path == "index.html" else full_path.rstrip("/")
        utm = utm_fields(request.query_params)
        page = get_page(route) if route else None
        if page is not None:
            emit("page_view", path="/" + route, status_code=200, **utm)
            return Response(
                content=render_page(page, SITE_ORIGIN), media_type="text/html", headers=SPA_HEADERS
            )
        if not is_spa_route(route):
            return JSONResponse(status_code=404, content={"error": "not_found"})
        emit("page_view", path="/" + route, status_code=200, **utm)
        return Response(
            content=render_shell(index_file.read_text(encoding="utf-8"), route),
            media_type="text/html",
            headers=SPA_HEADERS,
        )
