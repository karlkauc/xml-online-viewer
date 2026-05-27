"""Validate a stored XML document against a stored XSD schema.

Both inputs are looked up from their caches by id. The XML's reformatted bytes
(each element on its own line) are validated, so every reported error line maps
through ``StoredXml.line_to_id`` to exactly one tree node — recorded on the
error as ``node_id`` for inline highlighting in the frontend.
"""

from __future__ import annotations

from io import BytesIO

from lxml import etree
from pydantic import BaseModel, Field

from app.parser.security import make_parser
from app.parser.xml_tree import StoredXml
from app.parser.xsd_store import StoredXsd, build_xmlschema


class ValidationErrorItem(BaseModel):
    line: int | None = None
    column: int | None = None
    message: str
    severity: str = "error"  # "fatal" | "error" | "warning"
    type_name: str | None = None
    domain: str | None = None
    path: str | None = None
    node_id: str | None = None


class ValidationResponse(BaseModel):
    validation_id: str = ""
    xml_id: str
    xsd_id: str
    is_valid: bool
    errors: list[ValidationErrorItem] = Field(default_factory=list)


_SEVERITY = {"FATAL": "fatal", "ERROR": "error", "WARNING": "warning"}


def _extract_errors(error_log: object, line_to_id: dict[int, str]) -> list[ValidationErrorItem]:
    items: list[ValidationErrorItem] = []
    for entry in error_log:  # type: ignore[attr-defined]
        line = entry.line or None
        node_id = line_to_id.get(int(line)) if line else None
        items.append(
            ValidationErrorItem(
                line=line,
                column=entry.column or None,
                message=entry.message or "",
                severity=_SEVERITY.get(entry.level_name or "", "error"),
                type_name=entry.type_name or None,
                domain=entry.domain_name or None,
                path=entry.path or None,
                node_id=node_id,
            )
        )
    return items


def validate(stored_xml: StoredXml, stored_xsd: StoredXsd) -> ValidationResponse:
    """Validate ``stored_xml`` against ``stored_xsd``.

    Raises :class:`app.parser.xsd_store.XsdError` if the schema fails to compile.
    """
    schema = build_xmlschema(stored_xsd)
    xml_bytes = stored_xml.model.reformatted_xml.encode("utf-8")
    tree = etree.parse(BytesIO(xml_bytes), make_parser())

    is_valid = bool(schema.validate(tree))
    errors = [] if is_valid else _extract_errors(schema.error_log, stored_xml.line_to_id)
    return ValidationResponse(
        xml_id=stored_xml.model.xml_id,
        xsd_id=stored_xsd.xsd_id,
        is_valid=is_valid,
        errors=errors,
    )
