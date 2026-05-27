"""Security-focused tests for the hardening added for Cloud Run."""

from __future__ import annotations

import io
import zipfile

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.parser import security
from app.parser.security import SecurityError, _verify_url, fetch_url


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


# --- Security headers -------------------------------------------------------


def test_security_headers_on_api(client: TestClient) -> None:
    r = client.get("/api/health")
    assert r.headers["Strict-Transport-Security"].startswith("max-age=")
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert r.headers["X-Frame-Options"] == "DENY"
    assert "Content-Security-Policy" in r.headers


# --- DTD bomb pre-filter scans the whole buffer -----------------------------


def test_entity_after_4kb_rejected(client: TestClient) -> None:
    payload = "<root>" + ("x" * 5000) + "<!-- <!ENTITY a 'b'> --></root>"
    r = client.post("/api/xml/text", json={"content": payload, "filename": "x.xml"})
    assert r.status_code == 400


# --- XML node limit ---------------------------------------------------------


def test_xml_node_limit(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "max_xml_nodes", 2)
    xml = "<r><a/><b/><c/></r>"  # 4 nodes > limit
    r = client.post("/api/xml/text", json={"content": xml, "filename": "x.xml"})
    assert r.status_code == 400
    assert "node limit" in r.json()["detail"]


# --- ZIP hardening ----------------------------------------------------------

_XSD = (
    '<?xml version="1.0"?><xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">'
    '<xs:element name="r" type="xs:string"/></xs:schema>'
)


def _zip(files: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for name, data in files.items():
            z.writestr(name, data)
    return buf.getvalue()


def test_zip_uncompressed_cap(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "max_zip_uncompressed_mb", 0)
    data = _zip({"main.xsd": _XSD.encode()})
    r = client.post(
        "/api/xsd/upload",
        files={"file": ("s.zip", data, "application/zip")},
    )
    assert r.status_code == 422
    assert "uncompressed size" in r.json()["detail"]


def test_zip_entry_count_cap(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "max_zip_entries", 1)
    data = _zip({"main.xsd": _XSD.encode(), "extra.txt": b"x"})
    r = client.post(
        "/api/xsd/upload",
        files={"file": ("s.zip", data, "application/zip")},
    )
    assert r.status_code == 422
    assert "too many entries" in r.json()["detail"]


def test_zip_symlink_rejected(client: TestClient) -> None:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("main.xsd", _XSD)
        info = zipfile.ZipInfo("evil.xsd")
        info.external_attr = (0o120777 & 0xFFFF) << 16  # S_IFLNK
        z.writestr(info, "/etc/passwd")
    r = client.post(
        "/api/xsd/upload",
        files={"file": ("s.zip", buf.getvalue(), "application/zip")},
    )
    assert r.status_code == 422
    assert "symlink" in r.json()["detail"].lower()


# --- Error messages must not leak temp paths --------------------------------


def test_invalid_xsd_does_not_leak_tmp_path(client: TestClient) -> None:
    r = client.post("/api/xsd/text", json={"content": "<nope/>", "filename": "b.xsd"})
    assert r.status_code == 422
    detail = r.json()["detail"]
    assert "/tmp" not in detail and "xsd-" not in detail


# --- SSRF: private-resolving host blocked; pinning returns validated IP ------


def test_verify_url_blocks_private(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(security, "_resolve_all_addrs", lambda host: ["127.0.0.1"])
    with pytest.raises(SecurityError):
        _verify_url("https://evil.example.com/x.xsd")


def test_verify_url_returns_pinned_ip(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(security, "_resolve_all_addrs", lambda host: ["8.8.8.8"])
    host, ip = _verify_url("https://example.com/x.xsd")
    assert host == "example.com"
    assert ip == "8.8.8.8"


def test_fetch_url_blocks_private(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(security, "_resolve_all_addrs", lambda host: ["10.0.0.5"])
    with pytest.raises(SecurityError):
        fetch_url("https://internal.example.com/x.xsd")
