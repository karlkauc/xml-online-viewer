+++
title = "cvc-complex-type.2.4.b: Missing child element(s) \u2014 XML validation error explained"
heading = "Missing child element(s) (cvc-complex-type.2.4.b)"
description = "What the XML Schema validation error cvc-complex-type.2.4.b (\"Missing child element(s)\") means, typical causes, an example and how to fix it \u2014 with the libxml2 and Xerces wording."
lastmod = 2026-10-19
cta_label = "Validate your XML file"
cta_href = "/"
+++

## The message

libxml2 (Python lxml, PHP, xmllint, this site):

```
Element 'R': Missing child element(s). Expected is ( B ).
```

Java / Xerces:

```
cvc-complex-type.2.4.b: The content of element 'R' is not complete. One of '{B}' is expected.
```

## What it means

An element ended before all its required children appeared. Every child with `minOccurs` greater than zero (the default is 1) must be present.

## Typical causes

- A mandatory element was left out or is empty in the source system and not exported.
- The required element is present but misspelled or in the wrong namespace, so it does not count.
- A required element further down the sequence is missing; the error names the first one that is.

## Example

Schema:

```xml
<xs:sequence>
  <xs:element name="Id"/>
  <xs:element name="Currency"/>  <!-- minOccurs defaults to 1 -->
</xs:sequence>
```

Document:

```xml
<Amount>
  <Id>1</Id>
</Amount>   <!-- Currency is missing -->
```

## How to fix it

Add the elements listed after *Expected is*. If the data really is unknown, check whether the schema offers an alternative (`xs:choice`) or whether the element should be optional in your version of the schema.

## Find every occurrence at once

Load your XML file and its schema in the [XML Online Viewer](/): it lists all validation errors with line,
path and the surrounding lines, jumps to each one in the tree, and exports the list to Excel to hand to
whoever produces the file. The schema is detected from `xsi:schemaLocation` when the document names it.

Other errors: [all XML validation errors explained](/errors).
