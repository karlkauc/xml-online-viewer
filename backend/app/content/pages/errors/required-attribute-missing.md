+++
title = "cvc-complex-type.4: The attribute is required but missing \u2014 XML validation error explained"
heading = "The attribute is required but missing (cvc-complex-type.4)"
description = "What the XML Schema validation error cvc-complex-type.4 (\"The attribute is required but missing\") means, typical causes, an example and how to fix it \u2014 with the libxml2 and Xerces wording."
lastmod = 2026-10-19
cta_label = "Validate your XML file"
cta_href = "/"
+++

## The message

libxml2 (Python lxml, PHP, xmllint, this site):

```
Element 'H': The attribute 'req' is required but missing.
```

Java / Xerces:

```
cvc-complex-type.4: Attribute 'ccy' must appear on element 'Amount'.
```

## What it means

The schema declares an attribute with `use="required"` and the element does not carry it.

## Typical causes

- The attribute was written on a different element (parent or child).
- A typo in the attribute name, or different case.
- The exporting code skips attributes whose value is empty.

## Example

Schema:

```xml
<xs:attribute name="ccy" type="CurrencyCode" use="required"/>
```

Document:

```xml
<Amount>100</Amount>   <!-- needs ccy="EUR" -->
```

## How to fix it

Add the attribute with a valid value.

## Find every occurrence at once

Load your XML file and its schema in the [XML Online Viewer](/): it lists all validation errors with line,
path and the surrounding lines, jumps to each one in the tree, and exports the list to Excel to hand to
whoever produces the file. The schema is detected from `xsi:schemaLocation` when the document names it.

Other errors: [all XML validation errors explained](/errors).
