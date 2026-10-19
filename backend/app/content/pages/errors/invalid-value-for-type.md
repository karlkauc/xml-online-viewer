+++
title = "cvc-datatype-valid.1.2.1: Not a valid value of the atomic type \u2014 XML validation error explained"
heading = "Not a valid value of the atomic type (cvc-datatype-valid.1.2.1)"
description = "What the XML Schema validation error cvc-datatype-valid.1.2.1 (\"Not a valid value of the atomic type\") means, typical causes, an example and how to fix it \u2014 with the libxml2 and Xerces wording."
lastmod = 2026-10-19
cta_label = "Validate your XML file"
cta_href = "/"
+++

## The message

libxml2 (Python lxml, PHP, xmllint, this site):

```
Element 'A': 'x' is not a valid value of the atomic type 'xs:int'.
```

Java / Xerces:

```
cvc-datatype-valid.1.2.1: 'x' is not a valid value for 'integer'.
cvc-type.3.1.3: The value 'x' of element 'A' is not valid.
```

## What it means

The text of an element or attribute does not fit its built-in XML Schema type — a number that is not a number, a date in the wrong format, a boolean written as `yes`.

## Typical causes

- Dates in a local format: `01.01.2026` instead of `2026-01-01` (`xs:date`), or a date without time for `xs:dateTime`.
- Decimal commas (`1,5`) instead of points (`1.5`), thousands separators, currency symbols in numbers.
- Booleans as `yes`/`no` or `True` — only `true`, `false`, `1`, `0` are valid.
- Empty elements for numeric or date types: an empty string is not a valid `xs:int`.
- Leading or trailing text such as units (`10 kg`).

## Example

Schema:

```xml
<xs:element name="TradeDate" type="xs:date"/>
```

Document:

```xml
<TradeDate>19.10.2026</TradeDate>   <!-- must be 2026-10-19 -->
```

## How to fix it

Format the value as the type requires. Common formats: `xs:date` `2026-10-19`, `xs:dateTime` `2026-10-19T14:30:00` (optionally with `Z` or `+02:00`), `xs:decimal` `1234.56`, `xs:boolean` `true`. If the value is genuinely unknown, omit an optional element rather than leaving it empty.

## Find every occurrence at once

Load your XML file and its schema in the [XML Online Viewer](/): it lists all validation errors with line,
path and the surrounding lines, jumps to each one in the tree, and exports the list to Excel to hand to
whoever produces the file. The schema is detected from `xsi:schemaLocation` when the document names it.

Other errors: [all XML validation errors explained](/errors).
