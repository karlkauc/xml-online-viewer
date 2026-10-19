+++
title = "XRechnung and UBL XML: XSD validation online (and where Schematron takes over)"
heading = "Validate XRechnung / UBL files against the XSD"
description = "Check the XML schema layer of XRechnung, ZUGFeRD/Factur-X and UBL e-invoices online, and understand what XSD validation does not cover: the Schematron business rules."
lastmod = 2026-10-19
cta_label = "Validate a file"
cta_href = "/"
+++

E-invoices such as XRechnung (UBL or CII syntax) are validated in two layers:

1. **XML Schema (XSD):** is the file well-formed, are the elements in the right place, are dates, amounts and
   codes of the right type? — This is what this site checks.
2. **Schematron business rules** (EN 16931 and the XRechnung CIUS): totals add up, mandatory business terms are
   present, codes fit together. — This needs a Schematron validator, for example the official KoSIT validator.

A file that fails the first layer never reaches the second, so the XSD check is a quick first step when an
invoice is rejected.

## How

1. Load the invoice XML.
2. Load the schema: for UBL, the `UBL-Invoice-2.1.xsd` with its `common` folder as a `.zip`; for CII, the
   `CrossIndustryInvoice` schema bundle.
3. Read the errors in the list or the Excel report; each links to an [explanation](/errors).

Typical XSD-level problems: dates as `19.10.2026` instead of `2026-10-19`
([invalid value](/errors/invalid-value-for-type)), elements in the wrong order after manual edits
([element not expected](/errors/element-not-expected)), and amounts with too many decimals
([too many digits](/errors/too-many-digits)).
