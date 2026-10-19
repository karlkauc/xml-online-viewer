+++
title = "cvc-elt.1.a: No matching global declaration for the validation root \u2014 XML validation error explained"
heading = "No matching global declaration for the validation root (cvc-elt.1.a)"
description = "What the XML Schema validation error cvc-elt.1.a (\"No matching global declaration for the validation root\") means, typical causes, an example and how to fix it \u2014 with the libxml2 and Xerces wording."
lastmod = 2026-10-19
cta_label = "Validate your XML file"
cta_href = "/"
+++

## The message

libxml2 (Python lxml, PHP, xmllint, this site):

```
Element 'Q': No matching global declaration available for the validation root.
```

Java / Xerces:

```
cvc-elt.1.a: Cannot find the declaration of element 'Q'.
```

## What it means

The root element of the document is not declared as a global element in the schema you validate against — usually because document and schema do not belong together, or their namespaces differ.

## Typical causes

- Validating against the wrong schema (another message type or version).
- Namespace mismatch: the root element has `xmlns="…"` but the schema's `targetNamespace` is different or missing — or the other way round.
- The schema is a module that only defines types; the root element is declared in another file that imports it.
- A prefix on the root element that is bound to a different URI.

## Example

Schema:

```xml
<xs:schema targetNamespace="urn:example:v2" …>
  <xs:element name="Document"/>
</xs:schema>
```

Document:

```xml
<Document xmlns="urn:example:v1">…</Document>   <!-- v1 vs v2 -->
```

## How to fix it

Compare the namespace of the root element with the schema's `targetNamespace`, and load the main schema file (the one that declares the root element). The viewer can detect the schema from `xsi:schemaLocation` automatically.

## Find every occurrence at once

Load your XML file and its schema in the [XML Online Viewer](/): it lists all validation errors with line,
path and the surrounding lines, jumps to each one in the tree, and exports the list to Excel to hand to
whoever produces the file. The schema is detected from `xsi:schemaLocation` when the document names it.

Other errors: [all XML validation errors explained](/errors).
