// Mirrors the Pydantic models in backend/app/parser/{xml_tree,validate}.py
// and the XsdInfo response in backend/app/api/xsd.py. Kept in sync manually.

export interface XmlAttribute {
  name: string;
  value: string;
}

export interface XmlNode {
  id: string;
  kind: "element" | "comment" | "pi";
  tag: string;
  local_name: string | null;
  namespace: string | null;
  prefix: string | null;
  attributes: XmlAttribute[];
  text: string | null;
  line: number | null;
  children: XmlNode[];
}

export interface XmlDocModel {
  xml_id: string;
  filename: string;
  root: XmlNode;
  reformatted_xml: string;
  namespaces: Record<string, string>;
  node_count: number;
}

export interface XsdInfo {
  xsd_id: string;
  main_filename: string;
  filenames: string[];
}

export type Severity = "fatal" | "error" | "warning";

export interface ValidationErrorItem {
  line: number | null;
  column: number | null;
  message: string;
  severity: Severity;
  type_name: string | null;
  domain: string | null;
  path: string | null;
  node_id: string | null;
}

export interface ValidationResponse {
  validation_id: string;
  xml_id: string;
  xsd_id: string;
  is_valid: boolean;
  errors: ValidationErrorItem[];
}
