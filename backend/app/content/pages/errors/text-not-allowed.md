+++
title = "cvc-complex-type.2.3: Character content is not allowed \u2014 XML validation error explained"
heading = "Character content is not allowed (cvc-complex-type.2.3)"
description = "What the XML Schema validation error cvc-complex-type.2.3 (\"Character content is not allowed\") means, typical causes, an example and how to fix it \u2014 with the libxml2 and Xerces wording."
lastmod = 2026-10-19
cta_label = "Validate your XML file"
cta_href = "/"
+++

## The message

libxml2 (Python lxml, PHP, xmllint, this site):

```
Element 'I': Character content is not allowed, because the content type is empty.
```

Java / Xerces:

```
cvc-complex-type.2.3: Element 'Fund' cannot have character [children], because the type's content type is element-only.
cvc-complex-type.2.1: Element 'Flag' must have no character or element information item [children], because the type's content type is empty.
```

## What it means

The element may only contain child elements (element-only) or nothing at all (empty), but it contains text.

## Typical causes

- Text placed directly into a container element instead of into one of its children.
- Stray characters between child elements, often from string concatenation in the exporting code.
- A value written into an element that is meant to be empty and carry only attributes.

## Example

Schema:

```xml
<xs:element name="Fund">
  <xs:complexType>
    <xs:sequence>
      <xs:element name="Name"/>
    </xs:sequence>
  </xs:complexType>
</xs:element>
```

Document:

```xml
<Fund>Global Equity<Name>Global Equity</Name></Fund>
```

## How to fix it

Move the text into the right child element, or remove it. Whitespace between elements is fine; anything else is not.

## Find every occurrence at once

Load your XML file and its schema in the [XML Online Viewer](/): it lists all validation errors with line,
path and the surrounding lines, jumps to each one in the tree, and exports the list to Excel to hand to
whoever produces the file. The schema is detected from `xsi:schemaLocation` when the document names it.

Other errors: [all XML validation errors explained](/errors).
