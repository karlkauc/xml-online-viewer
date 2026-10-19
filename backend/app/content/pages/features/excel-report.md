+++
title = "XML validation errors to Excel: an XSD validation report you can hand over"
heading = "Export XML validation errors to Excel"
description = "Validate an XML file against its XSD and download every error as an Excel report — line, XML path, message, the surrounding lines and a link to what the error means. Free, in the browser."
lastmod = 2026-10-19
cta_label = "Validate a file"
cta_href = "/"
+++

When a file fails validation, the people who have to fix it are often not the people who ran the validator.
A list of errors in a terminal does not travel well; a spreadsheet does.

## What is in the report

One row per error, with:

| Column | Content |
|---|---|
| Severity | error, fatal (not well-formed) or warning |
| Line, Column | position in the file as the validator saw it |
| XML path | where in the document, e.g. `/FundsXML4/Funds/Fund[2]/FundStaticData/ISIN` |
| Message | the validator's message |
| Type, Domain | libxml2's error code — handy for filtering |
| Context | the line before, the error line (highlighted) and the line after |
| Help | a link to the explanation of this kind of error, e.g. [pattern mismatch](/errors/pattern-mismatch) |

A header block records the file, the schema, the time of validation and the number of errors, so the
workbook stands on its own when it is forwarded.

## How

1. Drop the XML file into the viewer. If it names its schema (`xsi:schemaLocation`), the schema is loaded
   automatically; otherwise add the `.xsd` or a `.zip` of the schema files.
2. The validation panel shows the result at once; every error is highlighted on its node in the tree.
3. Click **Excel report** to download the workbook.

## Typical uses

- A data supplier sends a FundsXML, ISO 20022 or e-invoice file that the receiver rejects — the report says
  exactly where and why.
- A developer hands the business side a list of data-quality problems found in an export.
- QA keeps the report as evidence of a test run.
