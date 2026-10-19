"""Per-site constants for the content pages; the rest of ``app.content`` is shared with the siblings."""

from __future__ import annotations

SITE_NAME = "XML Online Viewer"
# Where the "Open the viewer" button in the page header points.
VIEWER_PATH = "/"
LOGO_PATH = "/favicon.svg"
# This site's key in FAMILY; its own entry is shown without a link.
SELF = "xml"

# Same list, same order on all three viewers. Sister links go through /go/
# so clicks are counted without client-side tracking.
FAMILY: tuple[tuple[str, str, str], ...] = (
    ("xsd", "XSD Viewer", "/go/xsd-viewer"),
    ("xml", "XML Viewer", "/go/xml-viewer"),
    ("odata", "OData Viewer", "/go/odata-viewer"),
    ("desktop", "Desktop app", "/go/freexmltoolkit"),
)

# /guides lists these sections in this order (app/content/pages.py, _hub). A prefix
# ending in "/" takes every page below it; pages in no section are not listed.
# The single error pages are linked from the errors overview.
HUB_INTRO = (
    "Guides for validating XML against XSD: what each validation error means, the Excel error "
    "report, large files, and checking FundsXML, ISO 20022 and XRechnung files."
)
HUB_SECTIONS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("Validation errors", ("errors",)),
    ("Validate by standard", ("validate/",)),
    ("Features", ("features/",)),
)
