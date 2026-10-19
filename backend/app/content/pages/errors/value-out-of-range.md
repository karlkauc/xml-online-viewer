+++
title = "cvc-maxInclusive-valid: Value greater or less than allowed \u2014 XML validation error explained"
heading = "Value greater or less than allowed (cvc-maxInclusive-valid)"
description = "What the XML Schema validation error cvc-maxInclusive-valid (\"Value greater or less than allowed\") means, typical causes, an example and how to fix it \u2014 with the libxml2 and Xerces wording."
lastmod = 2026-10-19
cta_label = "Validate your XML file"
cta_href = "/"
+++

## The message

libxml2 (Python lxml, PHP, xmllint, this site):

```
Element 'F': [facet 'maxInclusive'] The value '11' is greater than the maximum value allowed ('10').
```

Java / Xerces:

```
cvc-maxInclusive-valid: Value '11' is not facet-valid with respect to maxInclusive '10' for type 'Percentage'.
cvc-minInclusive-valid: Value '-1' is not facet-valid with respect to minInclusive '0' for type 'Amount'.
```

## What it means

A numeric or date value is outside the range the type allows with `xs:minInclusive`, `xs:maxInclusive`, `xs:minExclusive` or `xs:maxExclusive`.

## Typical causes

- Percentages sent as `12.5` where the schema expects a fraction (`0.125`), or the other way round.
- Negative values where only positive ones are allowed (sign conventions for fees or flows).
- Dates outside a permitted window.

## Example

Schema:

```xml
<xs:restriction base="xs:decimal">
  <xs:minInclusive value="0"/>
  <xs:maxInclusive value="100"/>
</xs:restriction>
```

Document:

```xml
<Weight>104.2</Weight>
```

## How to fix it

Check the unit and sign the field expects (the type's documentation usually says) and convert the value.

## Find every occurrence at once

Load your XML file and its schema in the [XML Online Viewer](/): it lists all validation errors with line,
path and the surrounding lines, jumps to each one in the tree, and exports the list to Excel to hand to
whoever produces the file. The schema is detected from `xsi:schemaLocation` when the document names it.

Other errors: [all XML validation errors explained](/errors).
