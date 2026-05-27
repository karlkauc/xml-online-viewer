"""Parse an XML document into a serialisable, displayable tree model.

The submitted XML is pretty-printed first and the tree is built from the
*reformatted* bytes, so every node's ``line`` indexes the formatted text the
frontend shows back to the user. Pretty-printing also puts each element on its
own line, which lets us build a ``line -> node_id`` map: a validation error's
reported line then maps to exactly one tree node, enabling inline highlighting
without re-resolving XPaths.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from io import BytesIO

from lxml import etree
from pydantic import BaseModel, Field

from app.config import settings
from app.parser.security import SecurityError, _reject_known_bombs, make_parser

# ---------------------------------------------------------------------------
# Models (mirrored in frontend/src/types/model.ts)
# ---------------------------------------------------------------------------


class XmlAttribute(BaseModel):
    name: str
    value: str


class XmlNode(BaseModel):
    id: str
    kind: str = "element"  # "element" | "comment" | "pi"
    tag: str  # display name (prefix:local for elements, "#comment"/"#pi" otherwise)
    local_name: str | None = None
    namespace: str | None = None
    prefix: str | None = None
    attributes: list[XmlAttribute] = Field(default_factory=list)
    text: str | None = None
    line: int | None = None
    children: list[XmlNode] = Field(default_factory=list)


class XmlDocModel(BaseModel):
    xml_id: str = ""
    filename: str
    root: XmlNode
    reformatted_xml: str
    namespaces: dict[str, str] = Field(default_factory=dict)
    node_count: int = 0


@dataclass
class StoredXml:
    """In-memory cache entry: the displayable model plus the line→node-id map
    used to attach validation errors to tree nodes."""

    model: XmlDocModel
    line_to_id: dict[int, str] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Pretty-print + parse
# ---------------------------------------------------------------------------


def pretty_print(xml_bytes: bytes) -> bytes:
    """Pretty-print ``xml_bytes`` so each element occupies its own line.

    Raises ``etree.XMLSyntaxError`` if the input is not well-formed.
    """
    _reject_known_bombs(xml_bytes)
    parser = etree.XMLParser(
        remove_blank_text=True,
        resolve_entities=False,
        no_network=True,
        load_dtd=False,
        huge_tree=False,
        remove_comments=False,
        recover=False,
    )
    tree = etree.parse(BytesIO(xml_bytes), parser)
    return etree.tostring(tree, pretty_print=True, encoding="UTF-8", xml_declaration=True)


def _qname_parts(el: etree._Element) -> tuple[str | None, str | None, str | None]:
    """Return (prefix, local_name, namespace) for an element."""
    qn = etree.QName(el)
    return el.prefix, qn.localname, qn.namespace


def _format_attr_name(key: str, nsmap: dict) -> str:
    """Render an attribute key, restoring a ``prefix:local`` form when the
    attribute is namespace-qualified and a prefix is known."""
    if not key.startswith("{"):
        return key
    qn = etree.QName(key)
    if qn.namespace == "http://www.w3.org/XML/1998/namespace":
        return f"xml:{qn.localname}"
    for prefix, uri in nsmap.items():
        if uri == qn.namespace and prefix:
            return f"{prefix}:{qn.localname}"
    return qn.localname


def _build_node(
    el: etree._Element,
    line_to_id: dict[int, str],
    counter: list[int],
) -> XmlNode:
    if counter[0] >= settings.max_xml_nodes:
        raise SecurityError(
            f"XML document exceeds the {settings.max_xml_nodes}-node limit"
        )
    node_id = str(counter[0])
    counter[0] += 1

    line = el.sourceline
    if line is not None:
        line_to_id.setdefault(int(line), node_id)

    if isinstance(el, etree._Comment):
        node = XmlNode(
            id=node_id,
            kind="comment",
            tag="#comment",
            text=(el.text or "").strip() or None,
            line=line,
        )
    elif isinstance(el, etree._ProcessingInstruction):
        node = XmlNode(
            id=node_id,
            kind="pi",
            tag=f"#pi {el.target}",
            text=(el.text or "").strip() or None,
            line=line,
        )
    else:
        prefix, local, namespace = _qname_parts(el)
        display = f"{prefix}:{local}" if prefix else (local or "")
        text = (el.text or "").strip() or None
        attrs = [
            XmlAttribute(name=_format_attr_name(k, el.nsmap), value=v)
            for k, v in el.attrib.items()
        ]
        node = XmlNode(
            id=node_id,
            kind="element",
            tag=display,
            local_name=local,
            namespace=namespace,
            prefix=prefix,
            attributes=attrs,
            text=text,
            line=line,
        )

    for child in el.iterchildren():
        node.children.append(_build_node(child, line_to_id, counter))
    return node


def parse_xml(data: bytes, filename: str) -> StoredXml:
    """Parse XML ``data`` into a :class:`StoredXml`.

    Raises ``etree.XMLSyntaxError`` if the document is not well-formed and
    :class:`SecurityError` for banned DTD constructs.
    """
    pretty = pretty_print(data)
    tree = etree.parse(BytesIO(pretty), make_parser())
    root_el = tree.getroot()

    line_to_id: dict[int, str] = {}
    counter = [0]
    root_node = _build_node(root_el, line_to_id, counter)

    namespaces = {
        (prefix or ""): uri for prefix, uri in (root_el.nsmap or {}).items()
    }

    model = XmlDocModel(
        filename=filename,
        root=root_node,
        reformatted_xml=pretty.decode("utf-8"),
        namespaces=namespaces,
        node_count=counter[0],
    )
    return StoredXml(model=model, line_to_id=line_to_id)
