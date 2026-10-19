+++
title = "cvc-complex-type.2.4.a: This element is not expected \u2014 XML validation error explained"
heading = "This element is not expected (cvc-complex-type.2.4.a)"
description = "What the XML Schema validation error cvc-complex-type.2.4.a (\"This element is not expected\") means, typical causes, an example and how to fix it \u2014 with the libxml2 and Xerces wording."
lastmod = 2026-10-19
cta_label = "Validate your XML file"
cta_href = "/"
+++

## The message

libxml2 (Python lxml, PHP, xmllint, this site):

```
Element 'Z': This element is not expected. Expected is ( A ).
```

Java / Xerces:

```
cvc-complex-type.2.4.a: Invalid content was found starting with element 'Z'. One of '{A}' is expected.
cvc-complex-type.2.4.d: Invalid content was found starting with element 'Z'. No child element is expected at this point.
```

## What it means

The validator walked through the children of an element in the order the schema's `xs:sequence` (or `xs:choice`) prescribes and met an element it did not expect at that position. The element may be unknown to the schema, in the wrong order, repeated more often than `maxOccurs` allows, or in the wrong namespace.

## Typical causes

- Elements in a different order than the `xs:sequence` defines — order matters in a sequence.
- A typo in the element name, or different capitalisation (`Isin` vs `ISIN`).
- The element is in no namespace while the schema expects one (or the other way round): check `xmlns` on the root and `elementFormDefault`.
- The element occurs more often than `maxOccurs`.
- The element belongs to a newer or older version of the schema than the one you validate against.

## Example

Schema:

```xml
<xs:sequence>
  <xs:element name="Name"/>
  <xs:element name="Price"/>
</xs:sequence>
```

Document:

```xml
<Product>
  <Price>10</Price>   <!-- expected: Name first -->
  <Name>Pen</Name>
</Product>
```

## How to fix it

Read the *Expected is ( … )* part of the message: it lists what the schema allows at this point. Move the element there, rename it, or validate against the schema version your file was written for.

## Find every occurrence at once

Load your XML file and its schema in the [XML Online Viewer](/): it lists all validation errors with line,
path and the surrounding lines, jumps to each one in the tree, and exports the list to Excel to hand to
whoever produces the file. The schema is detected from `xsi:schemaLocation` when the document names it.

Other errors: [all XML validation errors explained](/errors).
