+++
title = "cvc-pattern-valid: The value is not accepted by the pattern \u2014 XML validation error explained"
heading = "The value is not accepted by the pattern (cvc-pattern-valid)"
description = "What the XML Schema validation error cvc-pattern-valid (\"The value is not accepted by the pattern\") means, typical causes, an example and how to fix it \u2014 with the libxml2 and Xerces wording."
lastmod = 2026-10-19
cta_label = "Validate your XML file"
cta_href = "/"
+++

## The message

libxml2 (Python lxml, PHP, xmllint, this site):

```
Element 'B': [facet 'pattern'] The value 'abc' is not accepted by the pattern '[A-Z]{3}'.
```

Java / Xerces:

```
cvc-pattern-valid: Value 'abc' is not facet-valid with respect to pattern '[A-Z]{3}' for type 'CurrencyCode'.
```

## What it means

The type restricts the value with a regular expression (`xs:pattern`) and the value does not match it — completely, from the first to the last character. XML Schema patterns are always anchored.

## Typical causes

- Lower case where upper case is required (currency and country codes, ISINs).
- Leading or trailing spaces or line breaks inside the element.
- Identifiers with the wrong length or check digit format (ISIN, LEI, IBAN, BIC).
- Separators the pattern does not allow (`-`, `/`, spaces).

## Example

Schema:

```xml
<xs:simpleType name="CurrencyCode">
  <xs:restriction base="xs:string">
    <xs:pattern value="[A-Z]{3}"/>
  </xs:restriction>
</xs:simpleType>
```

Document:

```xml
<Currency>eur</Currency>   <!-- must be EUR -->
```

## How to fix it

Compare the value with the pattern quoted in the message. To see the whole type with its documentation, open the schema in the [XSD Viewer](/go/xsd-viewer) and search for the type name.

## Find every occurrence at once

Load your XML file and its schema in the [XML Online Viewer](/): it lists all validation errors with line,
path and the surrounding lines, jumps to each one in the tree, and exports the list to Excel to hand to
whoever produces the file. The schema is detected from `xsi:schemaLocation` when the document names it.

Other errors: [all XML validation errors explained](/errors).
