+++
title = "cvc-complex-type.3.2.2: The attribute is not allowed \u2014 XML validation error explained"
heading = "The attribute is not allowed (cvc-complex-type.3.2.2)"
description = "What the XML Schema validation error cvc-complex-type.3.2.2 (\"The attribute is not allowed\") means, typical causes, an example and how to fix it \u2014 with the libxml2 and Xerces wording."
lastmod = 2026-10-19
cta_label = "Validate your XML file"
cta_href = "/"
+++

## The message

libxml2 (Python lxml, PHP, xmllint, this site):

```
Element 'H', attribute 'x': The attribute 'x' is not allowed.
```

Java / Xerces:

```
cvc-complex-type.3.2.2: Attribute 'x' is not allowed to appear in element 'H'.
```

## What it means

The element has an attribute its type does not declare, and the type has no `xs:anyAttribute` wildcard that would accept it.

## Typical causes

- A misspelled attribute name.
- An attribute from a newer schema version.
- `xsi:schemaLocation` or `xsi:type` written with a wrong or missing namespace prefix, so it is not recognised as the XML Schema instance attribute.

## Example

Schema:

```xml
<xs:complexType name="Amount">
  <xs:simpleContent>
    <xs:extension base="xs:decimal">
      <xs:attribute name="ccy"/>
    </xs:extension>
  </xs:simpleContent>
</xs:complexType>
```

Document:

```xml
<Amount ccy="EUR" currency="EUR">100</Amount>
```

## How to fix it

Remove the attribute or correct its name. For `xsi:` attributes, declare `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"` on the root element.

## Find every occurrence at once

Load your XML file and its schema in the [XML Online Viewer](/): it lists all validation errors with line,
path and the surrounding lines, jumps to each one in the tree, and exports the list to Excel to hand to
whoever produces the file. The schema is detected from `xsi:schemaLocation` when the document names it.

Other errors: [all XML validation errors explained](/errors).
