"""Messages for input that is not (quite) XML, and the repairs made before parsing."""

from __future__ import annotations

import io
import zipfile

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.parser.errors import BROWSER_COPY_HINT, clean_input, utf8_bytes
from app.parser.xml_tree import XmlError, parse_xml
from app.parser.xsd_store import AmbiguousMainError, XsdError, load_xsd

BANNER = (
    b"This XML file does not appear to have any style information associated with it. "
    b"The document tree is shown below.\n"
)
MARKED = b"-<a>\n  -<b>\n    <c/>\n  </b>\n</a>"


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def _message(data: bytes) -> str:
    with pytest.raises(XmlError) as caught:
        parse_xml(data, "doc.xml")
    return str(caught.value)


# --- Not XML at all ----------------------------------------------------------


@pytest.mark.parametrize(
    ("data", "expected"),
    [
        (b"  \n", "the document is empty"),
        (b'{"a": 1}', "not an XML file — it looks like JSON (it starts with b'{\"a\": 1}' instead of '<')"),
        (b"name;value\n1;2\n", "not an XML file (it starts with b'name;value\\n1' instead of '<')"),
        (
            b"PK\x03\x04rest-of-archive",
            "not an XML file — it looks like a ZIP archive (or a .docx/.xlsx/.odt file), "
            "i.e. binary data, not text",
        ),
    ],
)
def test_non_xml_input_is_named(data: bytes, expected: str) -> None:
    assert _message(data) == expected


def test_html_page_is_named() -> None:
    assert "this is an HTML page" in _message(b"<!doctype html>\n<html><body><p>Sign in</body></html>")


def test_unknown_binary_shows_the_bytes() -> None:
    msg = _message(b"\x01\x02\x03\x04garbage")
    assert msg.startswith("not an XML file — it starts with binary data (b'\\x01\\x02")


def test_collapsed_browser_view_cannot_be_restored() -> None:
    # "+" stands for children that were folded away when the text was copied.
    assert _message(BANNER + b"<a>\n  +<b>\n</a>") == BROWSER_COPY_HINT


# --- Repairs -----------------------------------------------------------------


@pytest.mark.parametrize(
    ("data", "needle"),
    [
        (BANNER + b"<a><b><c/></b></a>", "rendered XML view"),
        (MARKED, "rendered XML view"),
        (b'<?xml version="1.0"?>\n' + MARKED, "rendered XML view"),
        (b"```xml\n<a><b><c/></b></a>\n```\n", "Markdown code fence"),
        (b"\n  <?xml version='1.0'?><a><b><c/></b></a>", "Leading whitespace"),
        (b"\xef\xbb\xbf\n<?xml version='1.0'?><a><b><c/></b></a>", "Leading whitespace"),
    ],
    ids=["banner", "fold-markers", "after-declaration", "fence", "whitespace", "bom-whitespace"],
)
def test_wrappers_are_removed_with_a_notice(data: bytes, needle: str) -> None:
    model = parse_xml(data, "doc.xml").model
    assert model.node_count == 3
    assert len(model.notices) == 1 and needle in model.notices[0]


@pytest.mark.parametrize(
    "data",
    [b"<a>\n-<b>first</b>\n</a>", b"<a>```</a>", b"<?xml version='1.0'?>\n<a/>", b"\n <a/>"],
)
def test_clean_documents_are_left_alone(data: bytes) -> None:
    assert clean_input(data) == (data, [])


@pytest.mark.parametrize("encoding", ["windows-1251", "ISO-8859-1", "UTF-16"])
def test_pasted_text_ignores_its_declared_encoding(client: TestClient, encoding: str) -> None:
    content = f'<?xml version="1.0" encoding="{encoding}"?><a>ä</a>'
    assert utf8_bytes(content).startswith(b'<?xml version="1.0" encoding="UTF-8"?>')
    r = client.post("/api/xml/text", json={"content": content, "filename": "x.xml"})
    assert r.status_code == 200, r.text
    assert r.json()["root"]["text"] == "ä"


def test_notices_reach_the_client(client: TestClient) -> None:
    r = client.post("/api/xml/text", json={"content": "\n<?xml version='1.0'?><a/>", "filename": "x.xml"})
    assert r.status_code == 200
    assert "Leading whitespace" in r.json()["notices"][0]


# --- Well-formedness errors --------------------------------------------------


@pytest.mark.parametrize(
    ("data", "needle"),
    [
        (b"<a>x & y</a>", "write it as &amp;"),
        (b"<a>&ouml;</a>", "&ouml; is not declared in the document"),
        (b"<a/><b/>", "exactly one root"),
        (b"<a x=\xe2\x80\x9cy\xe2\x80\x9d/>", "straight quotes"),
        (b"<x:a/>", 'the prefix "x" is used but never declared'),
        (b"<a><b>", "looks cut off"),
        (b"<!-- x -->\n<?xml version='1.0'?><a/>", "must be the very first thing"),
    ],
)
def test_common_syntax_errors_say_what_to_do(data: bytes, needle: str) -> None:
    msg = _message(data)
    assert msg.startswith("XML is not well-formed: ")
    assert needle in msg and "line " in msg
    assert "<string>" not in msg


def test_nesting_limit_does_not_name_a_parser_option() -> None:
    msg = _message(b"<a>" * 300 + b"</a>" * 300)
    assert "nested more than 256 levels" in msg and "XML_PARSE_HUGE" not in msg


# --- XSD field ---------------------------------------------------------------


def test_binary_file_in_the_xsd_field_is_named() -> None:
    with pytest.raises(XsdError, match="Pattern Maker cross-stitch pattern"):
        load_xsd(zip_bytes=None, main_filename="p.xsd", main_bytes=b"\x10\x05\x80\x03\xb4Qzzzz")


def test_xsd_syntax_error_gets_a_hint_and_no_location_suffix() -> None:
    bad = b"<xs:schema xmlns:xs='http://www.w3.org/2001/XMLSchema'><xs:element name='a'>&x</xs:schema>"
    with pytest.raises(XsdError) as caught:
        load_xsd(zip_bytes=None, main_filename="s.xsd", main_bytes=bad)
    msg = str(caught.value)
    assert msg.startswith("schema could not be parsed: EntityRef: expecting ';', line 1")
    assert msg.endswith("write it as &amp;") and "(s.xsd" not in msg


XS = "http://www.w3.org/2001/XMLSchema"


def _zip(files: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as archive:
        for name, data in files.items():
            archive.writestr(name, data)
    return buf.getvalue()


def test_missing_import_is_named() -> None:
    main = (
        f'<xs:schema xmlns:xs="{XS}" xmlns:d="urn:d" targetNamespace="urn:m">'
        '<xs:import namespace="urn:d" schemaLocation="types/dep.xsd"/>'
        '<xs:element name="a" type="d:T"/></xs:schema>'
    ).encode()
    with pytest.raises(XsdError) as caught:
        load_xsd(zip_bytes=None, main_filename="main.xsd", main_bytes=main)
    msg = str(caught.value)
    assert msg.startswith(
        "the schema is incomplete: 1 imported or included file is missing (types/dep.xsd)"
    )
    assert "one ZIP archive" in msg and "does not resolve" in msg and "/tmp" not in msg


def test_missing_include_inside_a_zip_is_named() -> None:
    main = f'<xs:schema xmlns:xs="{XS}"><xs:include schemaLocation="../gone.xsd"/></xs:schema>'.encode()
    part = f'<xs:schema xmlns:xs="{XS}"/>'.encode()
    with pytest.raises(XsdError, match=r"1 imported or included file is missing \(\.\./gone\.xsd\)"):
        archive = _zip({"s/main.xsd": main, "s/part.xsd": part})
        load_xsd(zip_bytes=archive, main_filename="main.xsd", main_bytes=None)


def test_a_schema_with_all_its_files_reports_its_own_fault() -> None:
    main = f'<xs:schema xmlns:xs="{XS}"><xs:element name="a" type="Nope"/></xs:schema>'.encode()
    with pytest.raises(XsdError, match="^not a valid XSD schema: "):
        load_xsd(zip_bytes=None, main_filename="main.xsd", main_bytes=main)


@pytest.mark.parametrize(
    ("data", "needle"),
    [
        (b"<FundsXML4><Funds/></FundsXML4>", "an XML document (root element <FundsXML4>)"),
        (b'<x:stylesheet xmlns:x="http://www.w3.org/1999/XSL/Transform"/>', "an XSLT stylesheet"),
        (b"<schema/>", "a <schema> without the XML Schema namespace"),
    ],
)
def test_other_xml_in_the_xsd_field_is_explained(data: bytes, needle: str) -> None:
    with pytest.raises(XsdError) as caught:
        load_xsd(zip_bytes=None, main_filename="x.xsd", main_bytes=data)
    assert str(caught.value).startswith("not an XSD schema: this is ") and needle in str(caught.value)


def test_ambiguous_zip_asks_for_the_main_schema_in_plain_words() -> None:
    one = f'<xs:schema xmlns:xs="{XS}"/>'.encode()
    with pytest.raises(AmbiguousMainError) as caught:
        load_xsd(zip_bytes=_zip({"a.xsd": one, "b.xsd": one}), main_filename=None, main_bytes=None)
    msg = str(caught.value)
    assert "which of the 2 schemas" in msg and msg.endswith("candidates: a.xsd, b.xsd")
    assert caught.value.candidates == ["a.xsd", "b.xsd"]


# --- Several loose files -----------------------------------------------------

MAIN_XSD = (
    f'<xs:schema xmlns:xs="{XS}" xmlns:d="urn:d" targetNamespace="urn:m">'
    '<xs:import namespace="urn:d" schemaLocation="dep.xsd"/>'
    '<xs:element name="a" type="d:T"/></xs:schema>'
).encode()
DEP_XSD = (
    f'<xs:schema xmlns:xs="{XS}" targetNamespace="urn:d"><xs:simpleType name="T">'
    '<xs:restriction base="xs:string"/></xs:simpleType></xs:schema>'
).encode()


def _upload(client: TestClient, files: dict[str, bytes], main: str | None = None):
    parts = [("file", (name, data, "application/xml")) for name, data in files.items()]
    return client.post("/api/xsd/upload", files=parts, data={"main_filename": main} if main else None)


def test_schema_uploaded_with_its_import_compiles(client: TestClient) -> None:
    r = _upload(client, {"dep.xsd": DEP_XSD, "main.xsd": MAIN_XSD})
    assert r.status_code == 200, r.text
    assert r.json()["main_filename"] == "main.xsd"
    assert r.json()["filenames"] == ["dep.xsd", "main.xsd"]


def test_ambiguous_upload_lists_the_candidates(client: TestClient) -> None:
    one = f'<xs:schema xmlns:xs="{XS}"/>'.encode()
    r = _upload(client, {"a.xsd": one, "b.xsd": one + b" "})
    assert r.status_code == 422
    assert r.json()["candidates"] == ["a.xsd", "b.xsd"]
    assert "which of the 2 schemas" in r.json()["detail"]
    chosen = _upload(client, {"a.xsd": one, "b.xsd": one + b" "}, main="b.xsd")
    assert chosen.status_code == 200 and chosen.json()["main_filename"] == "b.xsd"


def test_zip_among_loose_files_is_refused(client: TestClient) -> None:
    r = _upload(client, {"main.xsd": MAIN_XSD, "rest.zip": _zip({"dep.xsd": DEP_XSD})})
    assert r.status_code == 400 and "not both" in r.json()["detail"]


def test_loose_files_share_the_upload_size_limit(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "max_upload_mb", 0.0001)  # ~104 bytes in total
    r = _upload(client, {"dep.xsd": DEP_XSD[:100], "main.xsd": MAIN_XSD[:100]})
    assert r.status_code == 413


def test_zip_without_a_schema_says_so() -> None:
    with pytest.raises(XsdError, match=r"contains no \.xsd file \(found: readme\.txt\)"):
        load_xsd(zip_bytes=_zip({"readme.txt": b"hi"}), main_filename=None, main_bytes=None)
