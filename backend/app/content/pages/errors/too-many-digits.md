+++
title = "cvc-totalDigits-valid: More digits than allowed \u2014 XML validation error explained"
heading = "More digits than allowed (cvc-totalDigits-valid)"
description = "What the XML Schema validation error cvc-totalDigits-valid (\"More digits than allowed\") means, typical causes, an example and how to fix it \u2014 with the libxml2 and Xerces wording."
lastmod = 2026-10-19
cta_label = "Validate your XML file"
cta_href = "/"
+++

## The message

libxml2 (Python lxml, PHP, xmllint, this site):

```
Element 'F': [facet 'totalDigits'] The value '1.234' has more digits than are allowed ('3').
```

Java / Xerces:

```
cvc-totalDigits-valid: Value '1.234' with totalDigits = '4' is not facet-valid with respect to totalDigits '3' for type 'Rate'.
cvc-fractionDigits-valid: Value '0.12345' with fractionDigits = '5' is not facet-valid with respect to fractionDigits '4' for type 'Rate'.
```

## What it means

A decimal has more digits in total (`xs:totalDigits`) or more after the decimal point (`xs:fractionDigits`) than the type allows.

## Typical causes

- Unrounded floating-point output (`0.30000000000000004`).
- Prices or rates with more decimals than the standard defines.
- Very large amounts in a type designed for smaller ones.

## Example

Schema:

```xml
<xs:restriction base="xs:decimal">
  <xs:totalDigits value="18"/>
  <xs:fractionDigits value="2"/>
</xs:restriction>
```

Document:

```xml
<Amount>1234.567</Amount>   <!-- two decimals allowed -->
```

## How to fix it

Round the value to the allowed number of decimals when you write the XML, not before calculating.

## Find every occurrence at once

Load your XML file and its schema in the [XML Online Viewer](/): it lists all validation errors with line,
path and the surrounding lines, jumps to each one in the tree, and exports the list to Excel to hand to
whoever produces the file. The schema is detected from `xsi:schemaLocation` when the document names it.

Other errors: [all XML validation errors explained](/errors).
