"""Security-critical parser and network helpers.

Every ``lxml`` call goes through :func:`make_parser` so that external
entities, DTD loading and network access at parse-time are globally off.
URL fetching goes through :func:`fetch_url`, which restricts schemes to
http(s), blocks private IP ranges, caps response size and limits redirects.
Hosts are allowed by default; setting ``ALLOWED_SCHEMA_HOSTS`` switches to a
strict whitelist (lockdown mode) for hardened deployments.
"""

from __future__ import annotations

import ipaddress
import logging
import re
import socket
from dataclasses import dataclass

import httpx
from lxml import etree

from app.config import settings

logger = logging.getLogger(__name__)


class SecurityError(ValueError):
    """Raised when an upload or URL violates security policy."""


# ---------------------------------------------------------------------------
# Hardened lxml parser
# ---------------------------------------------------------------------------


def make_parser(*, internal_entities: bool = False) -> etree.XMLParser:
    """Return a parser configured to block XXE and external network access.

    - ``resolve_entities`` is off by default (no entity substitution ⇒ no XXE).
      It is switched on only for documents whose DOCTYPE passed
      :func:`inspect_dtd` — a bounded internal subset of literal-value
      entities, which is what the W3C xmldsig/xenc schemas ship with.
    - ``no_network=True`` forbids the parser from fetching DTDs/entities.
    - ``load_dtd=False`` never loads an external DTD subset, even when the
      DOCTYPE names one via SYSTEM/PUBLIC.
    - ``huge_tree=False`` leaves lxml's internal XML-bomb mitigations active.
    - ``remove_comments=False`` so comments are preserved for display.
    - ``collect_ids`` stays at its default: switching it off sets libxml2's
      ``XML_SKIP_IDS`` bit in ``loadsubset``, which libxml2 2.14 reads as "load
      the external DTD subset" — exactly what ``load_dtd=False`` forbids.
    """
    return etree.XMLParser(
        resolve_entities=internal_entities,
        no_network=True,
        load_dtd=False,
        dtd_validation=False,
        attribute_defaults=False,
        huge_tree=False,
        remove_blank_text=False,
        remove_comments=False,
        recover=False,
    )


# ---------------------------------------------------------------------------
# DTD inspection (same rule as the XSD Online Viewer's ``inspect_dtd``)
# ---------------------------------------------------------------------------

DTD_HEAD_BYTES = 16 * 1024
MAX_DTD_DECLARATIONS = 32
MAX_ENTITY_VALUE_CHARS = 512

_DTD_TOKENS = (b"<!DOCTYPE", b"<!ENTITY", b"<!ATTLIST", b"<!NOTATION", b"<!ELEMENT")
_DOCTYPE_RE = re.compile(rb"<!DOCTYPE\b(?P<header>[^\[>]*)(?:\[(?P<subset>.*?)\]\s*)?>", re.S)
_COMMENT_RE = re.compile(rb"<!--.*?-->", re.S)
_DECL_RE = re.compile(rb"<!(?P<kind>ENTITY|ATTLIST)\b(?P<body>[^>]*)>", re.S)
_ENTITY_BODY_RE = re.compile(
    rb"^\s*(?:%\s+)?[A-Za-z_:][\w.:-]*\s+(?P<q>[\"'])(?P<value>[^\"']*)(?P=q)\s*$", re.S
)
_UNSAFE_IN_VALUE = re.compile(rb"[&%<]")

DTD_REJECTED_MESSAGE = (
    "DTD constructs are not allowed here (only a DOCTYPE with simple, literal-value "
    "<!ENTITY> declarations is accepted); remove the DOCTYPE and inline the entity values"
)


def inspect_dtd(data: bytes) -> bool:
    """Return True when ``data`` carries a DOCTYPE that is safe to expand.

    Accepted: at most one DOCTYPE (with or without a PUBLIC/SYSTEM external
    id — the parser never loads it) whose internal subset contains only
    comments plus ≤ ``MAX_DTD_DECLARATIONS`` ``<!ENTITY>`` / ``<!ATTLIST>``
    declarations with literal values that reference nothing (no ``&``, ``%``
    or ``<``). That rules out XXE, billion-laughs nesting and injected
    markup while letting ordinary documents with a DOCTYPE through.

    The DOCTYPE must sit in the first ``DTD_HEAD_BYTES``; DTD markup anywhere
    else in the buffer is refused, so nothing can hide past an offset (a
    schema's includes are parsed by libxml2 itself, with entity substitution).

    Raises :class:`SecurityError` for everything else that looks like DTD
    markup; returns False when there is no DTD at all.
    """
    upper = data.upper()
    if not any(token in upper for token in _DTD_TOKENS):
        return False
    match = _DOCTYPE_RE.search(data[:DTD_HEAD_BYTES])
    if match is None:
        raise SecurityError(DTD_REJECTED_MESSAGE)
    remainder = upper[: match.start()] + upper[match.end() :]
    if any(token in remainder for token in _DTD_TOKENS):
        raise SecurityError(DTD_REJECTED_MESSAGE)
    subset = _COMMENT_RE.sub(b"", match.group("subset") or b"")
    declarations = 0
    pos = 0
    for decl in _DECL_RE.finditer(subset):
        if subset[pos : decl.start()].strip():
            raise SecurityError(DTD_REJECTED_MESSAGE)
        pos = decl.end()
        declarations += 1
        body = decl.group("body")
        if decl.group("kind") == b"ENTITY":
            entity = _ENTITY_BODY_RE.match(body)
            if entity is None or len(entity.group("value")) > MAX_ENTITY_VALUE_CHARS:
                raise SecurityError(DTD_REJECTED_MESSAGE)
            body = entity.group("value")
        if _UNSAFE_IN_VALUE.search(body):
            raise SecurityError(DTD_REJECTED_MESSAGE)
    if subset[pos:].strip() or declarations > MAX_DTD_DECLARATIONS:
        raise SecurityError(DTD_REJECTED_MESSAGE)
    return True


# ---------------------------------------------------------------------------
# SSRF-protected URL fetcher
# ---------------------------------------------------------------------------


@dataclass
class FetchedResource:
    url: str
    content: bytes
    content_type: str | None


def _host_is_allowed(host: str) -> bool:
    # Empty allowlist means "any host permitted" (default-open). Setting
    # ALLOWED_SCHEMA_HOSTS turns this into a strict lockdown whitelist.
    if not settings.allowed_schema_hosts:
        return True
    return any(pattern.search(host) for pattern in settings.allowed_schema_hosts)


def _ip_is_private(ip_text: str) -> bool:
    try:
        ip = ipaddress.ip_address(ip_text)
    except ValueError:
        return True  # treat unparseable as unsafe
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


def _resolve_all_addrs(host: str) -> list[str]:
    try:
        infos = socket.getaddrinfo(host, None)
    except OSError as exc:
        raise SecurityError(f"DNS resolution failed for {host!r}: {exc}") from exc
    return list({info[4][0] for info in infos})


# "www.example.org/x.xml" — an address copied without its scheme. Anything with
# an explicit scheme (ftp:, file:, mailto:) is left alone so ``_verify_url``
# rejects it with the usual "only http(s)" message; "host:8443/x" is a port,
# not a scheme.
_HAS_SCHEME_RE = re.compile(r"^[A-Za-z][A-Za-z0-9+.-]*:(?!\d+(?:[/?#]|$))")
_BARE_HOST_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}(?::\d+)?(?:[/?#]|$)")


def normalize_url(url: str) -> str:
    """Prepend ``https://`` to a bare ``host/path``; return anything else unchanged."""
    url = url.strip()
    if not _HAS_SCHEME_RE.match(url) and _BARE_HOST_RE.match(url):
        return "https://" + url
    return url


def _verify_url(url: str) -> tuple[str, str]:
    """Validate ``url`` (scheme, host allowlist, no private IPs) and return
    ``(host, pinned_ip)``. The pinned IP is one of the host's currently-resolved
    public addresses; the caller connects to *that* IP so a later DNS rebinding
    cannot redirect the request to a private address (TOCTOU)."""
    parsed = httpx.URL(url)
    if parsed.scheme not in ("http", "https"):
        raise SecurityError(f"only http(s) schemes are permitted; got {parsed.scheme!r}")
    host = parsed.host
    if not host:
        raise SecurityError(f"URL has no host: {url!r}")
    if not _host_is_allowed(host):
        raise SecurityError(
            f"host {host!r} is not on ALLOWED_SCHEMA_HOSTS lockdown whitelist"
        )
    addrs = _resolve_all_addrs(host)
    for addr in addrs:
        if _ip_is_private(addr):
            raise SecurityError(
                f"host {host!r} resolves to a private/loopback address ({addr}); refusing to fetch"
            )
    if not addrs:
        raise SecurityError(f"host {host!r} did not resolve to any address")
    return host, addrs[0]


def _read_capped(response: httpx.Response) -> bytes:
    """Read a streamed response body, aborting once the size cap is exceeded so
    a malicious server cannot exhaust memory before the check."""
    cap = settings.fetch_max_response_bytes
    chunks: list[bytes] = []
    total = 0
    for chunk in response.iter_bytes():
        total += len(chunk)
        if total > cap:
            raise SecurityError(
                f"response exceeds {settings.fetch_max_response_mb} MB cap"
            )
        chunks.append(chunk)
    return b"".join(chunks)


def fetch_url(url: str) -> FetchedResource:
    """Fetch a document by URL, enforcing all SSRF mitigations: scheme/host
    checks, private-IP block, connection pinned to a validated IP (DNS-rebinding
    safe), redirect cap with re-validation, and a streamed response-size cap."""
    remaining_redirects = settings.fetch_max_redirects
    current = normalize_url(url)
    with httpx.Client(
        follow_redirects=False,
        timeout=settings.fetch_timeout_seconds,
        limits=httpx.Limits(max_connections=4),
    ) as client:
        while True:
            host, pinned_ip = _verify_url(current)
            parsed = httpx.URL(current)
            # Connect to the pre-validated IP, but keep the original Host header
            # and use the hostname for TLS SNI / certificate verification.
            target = parsed.copy_with(host=pinned_ip)
            with client.stream(
                "GET",
                target,
                headers={"Host": parsed.netloc.decode("ascii")},
                extensions={"sni_hostname": host},
            ) as response:
                if response.is_redirect:
                    if remaining_redirects <= 0:
                        raise SecurityError("too many HTTP redirects")
                    remaining_redirects -= 1
                    location = response.headers.get("location")
                    if not location:
                        raise SecurityError("redirect without Location header")
                    current = str(httpx.URL(current).join(location))
                    continue
                if response.status_code >= 400:
                    raise SecurityError(
                        f"fetching {host!r} failed with HTTP {response.status_code}"
                    )
                content = _read_capped(response)
                content_type = response.headers.get("content-type")
            logger.info(
                "fetched remote resource",
                extra={
                    "ctx_host": host,
                    "ctx_size_bytes": len(content),
                    "ctx_content_type": content_type,
                },
            )
            return FetchedResource(url=current, content=content, content_type=content_type)
