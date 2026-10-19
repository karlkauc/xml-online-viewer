"""Map libxml2 schema-validation errors to the help pages under /errors/<slug>.

libxml2 reports ``type_name`` values such as ``SCHEMAV_CVC_PATTERN_VALID``;
Java/Xerces (and most Stack Overflow questions) call the same rules
``cvc-pattern-valid``. Each page names both, so a message pasted into a search
engine finds it, and every error in the list and the Excel report links to it.
Pages live in ``app/content/pages/errors/<slug>.md``.
"""

from __future__ import annotations

from dataclasses import dataclass

HELP_BASE = "https://www.xml-viewer.online/errors/"


@dataclass(frozen=True)
class ErrorHelp:
    slug: str
    title: str
    xerces: tuple[str, ...]


HELP: dict[str, ErrorHelp] = {
    h.slug: h
    for h in (
        ErrorHelp(
            "element-not-expected",
            "This element is not expected",
            ("cvc-complex-type.2.4.a", "cvc-complex-type.2.4.d"),
        ),
        ErrorHelp(
            "missing-child-element",
            "Missing child element(s)",
            ("cvc-complex-type.2.4.b",),
        ),
        ErrorHelp(
            "invalid-value-for-type",
            "Not a valid value of the atomic type",
            ("cvc-datatype-valid.1.2.1", "cvc-type.3.1.3"),
        ),
        ErrorHelp(
            "pattern-mismatch",
            "The value is not accepted by the pattern",
            ("cvc-pattern-valid",),
        ),
        ErrorHelp(
            "value-not-in-enumeration",
            "The value is not an element of the set",
            ("cvc-enumeration-valid",),
        ),
        ErrorHelp(
            "string-length",
            "Value too long or too short",
            ("cvc-maxLength-valid", "cvc-minLength-valid", "cvc-length-valid"),
        ),
        ErrorHelp(
            "value-out-of-range",
            "Value greater or less than allowed",
            (
                "cvc-maxInclusive-valid",
                "cvc-minInclusive-valid",
                "cvc-maxExclusive-valid",
                "cvc-minExclusive-valid",
            ),
        ),
        ErrorHelp(
            "too-many-digits",
            "More digits than allowed",
            ("cvc-totalDigits-valid", "cvc-fractionDigits-valid"),
        ),
        ErrorHelp(
            "required-attribute-missing",
            "The attribute is required but missing",
            ("cvc-complex-type.4",),
        ),
        ErrorHelp(
            "attribute-not-allowed",
            "The attribute is not allowed",
            ("cvc-complex-type.3.2.2",),
        ),
        ErrorHelp(
            "text-not-allowed",
            "Character content is not allowed",
            ("cvc-complex-type.2.1", "cvc-complex-type.2.3"),
        ),
        ErrorHelp(
            "no-matching-global-declaration",
            "No matching global declaration for the validation root",
            ("cvc-elt.1.a",),
        ),
        ErrorHelp(
            "duplicate-key-or-missing-reference",
            "Duplicate key or missing key reference",
            ("cvc-identity-constraint.4.1", "cvc-identity-constraint.4.2.2", "cvc-identity-constraint.4.3"),
        ),
    )
}

_BY_TYPE: dict[str, str] = {
    "SCHEMAV_CVC_DATATYPE_VALID_1_2_1": "invalid-value-for-type",
    "SCHEMAV_CVC_DATATYPE_VALID_1_2_2": "invalid-value-for-type",
    "SCHEMAV_CVC_DATATYPE_VALID_1_2_3": "invalid-value-for-type",
    "SCHEMAV_CVC_PATTERN_VALID": "pattern-mismatch",
    "SCHEMAV_CVC_ENUMERATION_VALID": "value-not-in-enumeration",
    "SCHEMAV_CVC_MAXLENGTH_VALID": "string-length",
    "SCHEMAV_CVC_MINLENGTH_VALID": "string-length",
    "SCHEMAV_CVC_LENGTH_VALID": "string-length",
    "SCHEMAV_CVC_MAXINCLUSIVE_VALID": "value-out-of-range",
    "SCHEMAV_CVC_MININCLUSIVE_VALID": "value-out-of-range",
    "SCHEMAV_CVC_MAXEXCLUSIVE_VALID": "value-out-of-range",
    "SCHEMAV_CVC_MINEXCLUSIVE_VALID": "value-out-of-range",
    "SCHEMAV_CVC_TOTALDIGITS_VALID": "too-many-digits",
    "SCHEMAV_CVC_FRACTIONDIGITS_VALID": "too-many-digits",
    "SCHEMAV_CVC_COMPLEX_TYPE_4": "required-attribute-missing",
    "SCHEMAV_CVC_COMPLEX_TYPE_3_2_1": "attribute-not-allowed",
    "SCHEMAV_CVC_COMPLEX_TYPE_3_2_2": "attribute-not-allowed",
    "SCHEMAV_CVC_COMPLEX_TYPE_2_1": "text-not-allowed",
    "SCHEMAV_CVC_COMPLEX_TYPE_2_3": "text-not-allowed",
    "SCHEMAV_CVC_ELT_1": "no-matching-global-declaration",
    "SCHEMAV_CVC_IDC": "duplicate-key-or-missing-reference",
}


def help_slug(type_name: str | None, message: str | None = None) -> str | None:
    """Help page for one validation error, or None when there is none for its kind."""
    if type_name == "SCHEMAV_ELEMENT_CONTENT":
        # One libxml2 code for two Xerces rules: an extra element, or one that is missing.
        missing = message is not None and "Missing child element" in message
        return "missing-child-element" if missing else "element-not-expected"
    return _BY_TYPE.get(type_name or "")


def help_url(slug: str | None) -> str | None:
    return f"{HELP_BASE}{slug}" if slug else None
