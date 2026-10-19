+++
title = "XML Schema validation errors explained: cvc-complex-type, cvc-pattern-valid, cvc-enumeration-valid and more"
heading = "XML validation errors explained"
description = "The most common XSD validation errors from libxml2 and Xerces — cvc-complex-type.2.4.a, cvc-datatype-valid.1.2.1, cvc-pattern-valid and others — with causes, examples and fixes."
lastmod = 2026-10-19
cta_label = "Validate your XML file"
cta_href = "/"
+++

Validators phrase the same rule differently: libxml2 (used by Python's lxml, PHP, xmllint and this site) says
*This element is not expected*, Java's Xerces says *cvc-complex-type.2.4.a: Invalid content was found*. Each page
below covers one rule with both wordings, typical causes, an example and the fix.

| Error | Xerces code |
|---|---|
| [This element is not expected](/errors/element-not-expected) | `cvc-complex-type.2.4.a` |
| [Missing child element(s)](/errors/missing-child-element) | `cvc-complex-type.2.4.b` |
| [Not a valid value of the atomic type](/errors/invalid-value-for-type) | `cvc-datatype-valid.1.2.1` |
| [The value is not accepted by the pattern](/errors/pattern-mismatch) | `cvc-pattern-valid` |
| [The value is not an element of the set](/errors/value-not-in-enumeration) | `cvc-enumeration-valid` |
| [Value too long or too short](/errors/string-length) | `cvc-maxLength-valid` |
| [Value greater or less than allowed](/errors/value-out-of-range) | `cvc-maxInclusive-valid` |
| [More digits than allowed](/errors/too-many-digits) | `cvc-totalDigits-valid` |
| [The attribute is required but missing](/errors/required-attribute-missing) | `cvc-complex-type.4` |
| [The attribute is not allowed](/errors/attribute-not-allowed) | `cvc-complex-type.3.2.2` |
| [Character content is not allowed](/errors/text-not-allowed) | `cvc-complex-type.2.3` |
| [No matching global declaration for the validation root](/errors/no-matching-global-declaration) | `cvc-elt.1.a` |
| [Duplicate key or missing key reference](/errors/duplicate-key-or-missing-reference) | `cvc-identity-constraint.4.2.2` |
