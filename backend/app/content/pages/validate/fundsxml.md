+++
title = "FundsXML validator: validate FundsXML 4 files online against the official schema"
heading = "Validate FundsXML files online"
description = "Check FundsXML 4 documents against the official schema release: automatic schema detection, every error with line and path, Excel report for the data supplier, all releases from fundsxml/schema built in."
lastmod = 2026-10-21
cta_label = "Validate a FundsXML file"
cta_href = "/fundsxml"
+++

FundsXML files travel between asset managers, custodians, distributors and data vendors, and the receiver's first
check is always the schema. Run that check yourself before sending — or when you receive a file that fails.

1. Open the [FundsXML validator](/fundsxml): the newest official release is loaded as the schema.
2. Drop your FundsXML document. If it declares `xsi:noNamespaceSchemaLocation`, that schema is used instead.
3. Every error is listed with line, path and message and highlighted in the tree; **Excel report** exports the list.

To validate against another release, pick it under **XSD schema → FundsXML Releases**. All releases published in
[fundsxml/schema](https://github.com/fundsxml/schema/releases) are available, together with the
`xmldsig-core-schema.xsd` they import.

## Typical FundsXML errors

- Code lists that changed between releases → [value not in enumeration](/errors/value-not-in-enumeration).
  Which codes changed is listed per release on the [FundsXML release pages](https://www.xsd-viewer.online/fundsxml/releases).
- Dates and amounts in local formats → [not a valid value of the type](/errors/invalid-value-for-type).
- Elements in the wrong order or from another release → [element not expected](/errors/element-not-expected).
- Duplicate `UniqueID`s or positions referring to assets that are not in the file →
  [duplicate key or missing reference](/errors/duplicate-key-or-missing-reference).

To read the schema itself as a diagram, open it in the [XSD Viewer](https://www.xsd-viewer.online/fundsxml).

Working with Solvency II look-through data? The [TPT ⇄ FundsXML Converter](/go/tpt-converter) turns FinDatEx TPT
V7/V8 files into FundsXML 4 and back.
