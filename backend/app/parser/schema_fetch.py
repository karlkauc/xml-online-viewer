"""Fetch a complete schema set starting from a single remote XSD URL.

Used by the auto-schema endpoint: an XML document names its schema through
``xsi:schemaLocation`` / ``xsi:noNamespaceSchemaLocation``, and that schema in
turn pulls in others via ``xs:include`` / ``xs:import``. This module walks those
references over the network and returns the same ``filename -> bytes`` map that
``load_xsd_from_files`` already consumes.

Two details make the result compile offline afterwards:

* Every document is keyed by ``host/path`` of the URL it was fetched from, so
  relative references between documents of the same host resolve identically
  once the set is materialised into a temp directory.
* ``schemaLocation`` values are rewritten to the matching relative path.
  ``build_xmlschema`` compiles with ``no_network=True``, so an absolute URL left
  in place would silently fail to resolve — lxml skips the import and then
  reports a confusing "does not resolve to a type definition" error instead.

Every fetch goes through ``security.fetch_url``, so the private-IP block,
DNS pinning, redirect re-verification and per-response size cap all apply.
"""

from __future__ import annotations

import logging
import posixpath
from collections import deque
from urllib.parse import urljoin, urlsplit

from lxml import etree

from app.config import settings
from app.parser.security import fetch_url as _default_fetch
from app.parser.security import make_parser
from app.parser.xsd_store import (
    _REF_TAGS,
    XSD_NS,
    XsdError,
    _iter_schema_locations,
    _safe_relative_path,
)

logger = logging.getLogger(__name__)

# Upper bound on how many documents one auto-detected schema may pull in. Real
# standards need more than one might think (SDMX, HL7 v3 multicacheschemas); the
# summed size is capped separately by MAX_UPLOAD_MB.
AUTO_SCHEMA_MAX_DOCS = 100


def is_schema_document(data: bytes) -> bool:
    """True when ``data`` parses as XML whose root is ``xs:schema``.

    Guards against a URL that answers with an HTML error/login page: without
    this the failure surfaces as an opaque XSD parse error.
    """
    try:
        root = etree.fromstring(data, make_parser())
    except etree.XMLSyntaxError:
        return False
    if not isinstance(root.tag, str):
        return False
    qname = etree.QName(root)
    return qname.localname == "schema" and qname.namespace == XSD_NS


def _url_key(url: str) -> str:
    """Map a URL to the relative path its document gets in the schema set.

    Keyed by ``host/path`` so two hosts serving ``/xsd/base.xsd`` do not
    collide, while same-host relative references still line up.
    """
    parts = urlsplit(url)
    return str(_safe_relative_path(f"{parts.netloc}{parts.path}", "schema.xsd"))


def _rewrite_locations(data: bytes, doc_key: str, url_to_key: dict[str, str], base_url: str) -> bytes:
    """Point every fetched ``schemaLocation`` in ``data`` at its local path.

    References we could not fetch are left untouched, so the compile error
    still names the original location.
    """
    try:
        root = etree.fromstring(data, make_parser())
    except etree.XMLSyntaxError:
        return data

    doc_dir = posixpath.dirname(doc_key) or "."
    changed = False
    for el in root.iter():
        if not isinstance(el.tag, str) or etree.QName(el).localname not in _REF_TAGS:
            continue
        loc = el.get("schemaLocation")
        if not loc:
            continue
        target = url_to_key.get(urljoin(base_url, loc))
        if target is None:
            continue
        relative = posixpath.relpath(target, doc_dir)
        if relative != loc:
            el.set("schemaLocation", relative)
            changed = True

    if not changed:
        return data
    return etree.tostring(root, encoding="UTF-8", xml_declaration=True)


def _walk(
    seeds: list[str], fetch, *, entry_required: bool, max_docs: int, max_bytes: int
) -> tuple[dict[str, bytes], dict[str, str], dict[str, str]]:
    """Breadth-first download of ``seeds`` and everything they reference.

    Returns ``(files, url_to_key, bases)``: documents keyed by ``host/path``,
    the URL -> key map for rewriting, and each document's final URL. With
    ``entry_required`` the first seed must be reachable and a schema; every
    other document that fails to download — or is not a schema — is skipped so
    the compile error can name it.
    """
    files: dict[str, bytes] = {}
    url_to_key: dict[str, str] = {}
    bases: dict[str, str] = {}
    seen: set[str] = set()
    queue: deque[str] = deque(seeds)
    total = 0
    first = True

    while queue:
        current = queue.popleft()
        if current in seen:
            continue
        seen.add(current)
        is_entry, first = entry_required and first, False

        if len(files) >= max_docs:
            raise XsdError(
                f"the referenced schema pulls in more than {max_docs} documents; "
                "load it manually instead"
            )

        try:
            fetched = fetch(current)
        except Exception as exc:
            # Only the entry point has to be reachable. A dependency that 404s
            # may still be covered by BUNDLED_SCHEMAS, and if it is not, the
            # compile error names the location — far more useful than failing
            # the whole load here. (FundsXML is the live case: its relative
            # xmldsig import resolves against GitHub's signed asset URL.)
            if is_entry:
                raise
            logger.info(
                "schema dependency not fetched",
                extra={"ctx_url": current, "ctx_error": str(exc)},
            )
            continue
        data = fetched.content

        if not is_schema_document(data):
            if is_entry:
                raise XsdError(
                    f"the schema URL referenced by this document did not return an XML Schema: {current}"
                )
            if not entry_required:
                continue

        total += len(data)
        if total > max_bytes:
            raise XsdError(
                f"the referenced schema set exceeds the {settings.max_upload_mb} MB limit"
            )

        # Key by the *requested* URL — a redirect target is often an opaque
        # signed URL, and that path would end up as the displayed filename.
        # Relative references are still resolved against the final URL.
        key = _url_key(current)
        files[key] = data
        bases[key] = fetched.url
        url_to_key[current] = key
        url_to_key[fetched.url] = key

        for loc in _iter_schema_locations(data, include_remote=True):
            nxt = urljoin(fetched.url, loc)
            if urlsplit(nxt).scheme.lower() in ("http", "https") and nxt not in seen:
                queue.append(nxt)

    return files, url_to_key, bases


def fetch_schema_set(url: str, *, fetcher=None) -> tuple[dict[str, bytes], str]:
    """Download the schema at ``url`` plus everything it references.

    Returns ``(files, main_filename)`` ready for ``load_xsd_from_files``.
    Raises :class:`XsdError` when the URL does not serve a schema or a cap is
    hit, and ``SecurityError`` (from ``fetch_url``) when a URL is not allowed.
    """
    files, url_to_key, bases = _walk(
        [url],
        fetcher or _default_fetch,
        entry_required=True,
        max_docs=AUTO_SCHEMA_MAX_DOCS,
        max_bytes=settings.max_upload_bytes,
    )
    rewritten = {
        key: _rewrite_locations(data, key, url_to_key, bases[key]) for key, data in files.items()
    }
    logger.info(
        "auto-schema fetched",
        extra={"ctx_url": url, "ctx_docs": len(rewritten), "ctx_bytes": sum(map(len, files.values()))},
    )
    return rewritten, url_to_key[url]


def add_remote_references(files: dict[str, bytes], *, fetcher=None) -> dict[str, bytes]:
    """Complete an uploaded schema set with the documents it imports by absolute URL.

    S-100, GML and many government schemas import their base schemas as
    ``https://…``; the compiler never fetches those (``no_network=True``), so
    without this the upload fails as "incomplete" although nothing is missing
    on the user's side. Downloads go through ``fetch_url`` (SSRF guard, size
    cap); one that fails is left as it was and named by the compile error.
    Files the user supplied always win over downloaded ones.
    """
    seeds: dict[str, None] = {}
    for name, data in files.items():
        if not name.lower().endswith(".xsd"):
            continue
        for loc in _iter_schema_locations(data, include_remote=True):
            if urlsplit(loc).scheme.lower() in ("http", "https"):
                seeds[loc] = None
    if not seeds:
        return files

    present = {posixpath.basename(name) for name in files}
    remote, url_to_key, bases = _walk(
        [url for url in seeds if posixpath.basename(urlsplit(url).path) not in present],
        fetcher or _default_fetch,
        entry_required=False,
        max_docs=AUTO_SCHEMA_MAX_DOCS,
        max_bytes=max(0, settings.max_upload_bytes - sum(len(d) for d in files.values())),
    )
    # An import the user did upload (same file name) points at their copy.
    for url in seeds:
        base = posixpath.basename(urlsplit(url).path)
        if url not in url_to_key:
            local = next((n for n in files if posixpath.basename(n) == base), None)
            if local is not None:
                url_to_key[url] = local
    if not url_to_key:
        return files

    result = {
        name: _rewrite_locations(data, name, url_to_key, "") for name, data in files.items()
    }
    for key, data in remote.items():
        if key not in result:
            result[key] = _rewrite_locations(data, key, url_to_key, bases[key])
    logger.info("remote schema imports fetched", extra={"ctx_docs": len(remote)})
    return result
