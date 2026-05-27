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


def make_parser() -> etree.XMLParser:
    """Return a parser configured to block XXE and external network access.

    - ``resolve_entities=False`` disables entity substitution (XXE).
    - ``no_network=True`` forbids the parser from fetching DTDs/entities.
    - ``load_dtd=False`` skips DTD processing entirely.
    - ``huge_tree=False`` leaves lxml's internal XML-bomb mitigations active.
    - ``remove_comments=False`` so comments are preserved for display.
    """
    return etree.XMLParser(
        resolve_entities=False,
        no_network=True,
        load_dtd=False,
        dtd_validation=False,
        attribute_defaults=False,
        huge_tree=False,
        remove_blank_text=False,
        remove_comments=False,
        recover=False,
    )


_BANNED_TOKENS = (b"<!DOCTYPE", b"<!ENTITY", b"<!ATTLIST", b"<!NOTATION")


def _reject_known_bombs(data: bytes) -> None:
    # Pre-filter the whole document: any DTD markup is either unnecessary or a
    # vector for a billion-laughs attack. Scanning the entire buffer (not just
    # the head) prevents bypass by placing the construct past an offset.
    upper = data.upper()
    for token in _BANNED_TOKENS:
        if token in upper:
            raise SecurityError(
                f"DTD construct {token.decode()!r} is not permitted in uploads"
            )


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
    current = url
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
