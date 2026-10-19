+++
title = "cvc-maxLength-valid: Value too long or too short \u2014 XML validation error explained"
heading = "Value too long or too short (cvc-maxLength-valid)"
description = "What the XML Schema validation error cvc-maxLength-valid (\"Value too long or too short\") means, typical causes, an example and how to fix it \u2014 with the libxml2 and Xerces wording."
lastmod = 2026-10-19
cta_label = "Validate your XML file"
cta_href = "/"
+++

## The message

libxml2 (Python lxml, PHP, xmllint, this site):

```
Element 'D': [facet 'maxLength'] The value has a length of '4'; this exceeds the allowed maximum length of '3'.
```

Java / Xerces:

```
cvc-maxLength-valid: Value 'abcd' with length = '4' is not facet-valid with respect to maxLength '3' for type 'Code3'.
cvc-minLength-valid: Value 'a' with length = '1' is not facet-valid with respect to minLength '2' for type 'Text'.
cvc-length-valid: Value '12345' with length = '5' is not facet-valid with respect to length '12' for type 'ISIN'.
```

## What it means

The type limits the number of characters with `xs:maxLength`, `xs:minLength` or an exact `xs:length`, and the value is outside that range. Length counts characters, not bytes, and includes spaces.

## Typical causes

- Free text (names, descriptions) longer than the field allows — `Text256Type` and similar.
- Empty elements where `minLength` is 1.
- Padding with spaces from fixed-width source systems.
- Identifiers with missing leading zeros.

## Example

Schema:

```xml
<xs:restriction base="xs:string">
  <xs:maxLength value="35"/>
</xs:restriction>
```

Document:

```xml
<Name>A fund name that is considerably longer than thirty-five characters</Name>
```

## How to fix it

Shorten (or pad) the value to the allowed length, trim whitespace, and omit optional elements instead of sending them empty.

## Find every occurrence at once

Load your XML file and its schema in the [XML Online Viewer](/): it lists all validation errors with line,
path and the surrounding lines, jumps to each one in the tree, and exports the list to Excel to hand to
whoever produces the file. The schema is detected from `xsi:schemaLocation` when the document names it.

Other errors: [all XML validation errors explained](/errors).
