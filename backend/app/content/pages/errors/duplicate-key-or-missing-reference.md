+++
title = "cvc-identity-constraint.4.2.2: Duplicate key or missing key reference \u2014 XML validation error explained"
heading = "Duplicate key or missing key reference (cvc-identity-constraint.4.2.2)"
description = "What the XML Schema validation error cvc-identity-constraint.4.2.2 (\"Duplicate key or missing key reference\") means, typical causes, an example and how to fix it \u2014 with the libxml2 and Xerces wording."
lastmod = 2026-10-19
cta_label = "Validate your XML file"
cta_href = "/"
+++

## The message

libxml2 (Python lxml, PHP, xmllint, this site):

```
Element 'Asset': Duplicate key-sequence ['42'] in key identity-constraint 'AssetKey'.
Element 'Position': No match found for key-sequence ['A-7'] of keyref 'AssetRef'.
```

Java / Xerces:

```
cvc-identity-constraint.4.2.2: Duplicate key value [42] declared for identity constraint "PositionKey" of element "Positions".
cvc-identity-constraint.4.3: Key 'AssetRef' with value 'A-7' not found for identity constraint of element 'Fund'.
cvc-identity-constraint.4.1: Duplicate unique value [42] declared for identity constraint of element 'Positions'.
```

## What it means

The schema defines identity constraints (`xs:key`, `xs:unique`, `xs:keyref`): values that must be unique within a scope, and references that must point to an existing key. The document has a duplicate, or a reference to a key that does not exist.

## Typical causes

- The same identifier used twice in a list (positions, assets, share classes).
- A reference (`keyref`) to an object that was not exported, or exported with a different ID.
- IDs that differ only in whitespace or case.

## Example

Schema:

```xml
<xs:key name="AssetKey">
  <xs:selector xpath="Assets/Asset"/>
  <xs:field xpath="UniqueID"/>
</xs:key>
<xs:keyref name="AssetRef" refer="AssetKey">
  <xs:selector xpath="Positions/Position"/>
  <xs:field xpath="UniqueID"/>
</xs:keyref>
```

Document:

```xml
<Position><UniqueID>A-7</UniqueID></Position>   <!-- no Asset A-7 -->
```

## How to fix it

Make the identifiers unique, and export every object that is referenced. The XSD Viewer shows which keys and references a schema declares on each element.

## Find every occurrence at once

Load your XML file and its schema in the [XML Online Viewer](/): it lists all validation errors with line,
path and the surrounding lines, jumps to each one in the tree, and exports the list to Excel to hand to
whoever produces the file. The schema is detected from `xsi:schemaLocation` when the document names it.

Other errors: [all XML validation errors explained](/errors).
