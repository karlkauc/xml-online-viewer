+++
title = "cvc-enumeration-valid: The value is not an element of the set \u2014 XML validation error explained"
heading = "The value is not an element of the set (cvc-enumeration-valid)"
description = "What the XML Schema validation error cvc-enumeration-valid (\"The value is not an element of the set\") means, typical causes, an example and how to fix it \u2014 with the libxml2 and Xerces wording."
lastmod = 2026-10-19
cta_label = "Validate your XML file"
cta_href = "/"
+++

## The message

libxml2 (Python lxml, PHP, xmllint, this site):

```
Element 'C': [facet 'enumeration'] The value 'Q' is not an element of the set {'X', 'Y'}.
```

Java / Xerces:

```
cvc-enumeration-valid: Value 'Q' is not facet-valid with respect to enumeration '[X, Y]'. It must be a value from the enumeration.
```

## What it means

The type is a code list (`xs:enumeration`) and the value is not one of its entries. Comparison is exact: case, spaces and leading zeros count.

## Typical causes

- A code from a newer version of the standard than the schema you validate against (or an old code that was removed).
- Different spelling or case (`Eur`, `eur`).
- A descriptive text instead of the code (`Equity` instead of `EQ`).
- Whitespace around the value.

## Example

Schema:

```xml
<xs:restriction base="xs:string">
  <xs:enumeration value="ACC"/>
  <xs:enumeration value="DIS"/>
</xs:restriction>
```

Document:

```xml
<DistributionPolicy>Accumulating</DistributionPolicy>
```

## How to fix it

Use one of the values listed in the message. If your value should be valid, check whether the receiver expects a different schema version — code lists change between releases (see for example the [FundsXML release changes](https://www.xsd-viewer.online/fundsxml/releases)).

## Find every occurrence at once

Load your XML file and its schema in the [XML Online Viewer](/): it lists all validation errors with line,
path and the surrounding lines, jumps to each one in the tree, and exports the list to Excel to hand to
whoever produces the file. The schema is detected from `xsi:schemaLocation` when the document names it.

Other errors: [all XML validation errors explained](/errors).
