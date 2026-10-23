/**
 * Receive a file handed over from a sibling viewer.
 *
 * Flow: xsd-viewer.online, odata-viewer.online or the Fund Data Converter opens
 * `https://www.xml-viewer.online/?from=xsd-viewer` (or `from=odata-viewer`,
 * `from=tpt-converter`)
 * in a new tab while keeping the File in memory. Once mounted we post
 * `{type: "xml-viewer:ready"}` to the opener; it answers with
 * `{type: "xml-viewer:file", name, content}` (content is a transferred
 * ArrayBuffer), optionally with `schema: {name, content, mainFilename}` — the
 * schema loaded over there as a single .xsd or a ZIP of all its files — so
 * the document can be validated right away. The XSD viewer can also send
 * `{type: "xml-viewer:schema", schema}` alone ("validate an XML file against
 * this schema"): the schema is loaded and the visitor adds the document.
 * Origins are checked strictly on both sides; without the `from` parameter
 * nothing here runs.
 */

export const HANDOFF_SOURCES = ["xsd-viewer", "odata-viewer", "tpt-converter"] as const;
export type HandoffSource = (typeof HANDOFF_SOURCES)[number];

// Keep in step with HANDOFF_SENDER_ORIGINS in the XSD viewer, the OData
// viewer (lib/xmlViewerHandoff.ts in both) and the Fund Data Converter (lib/handoff.ts).
const SENDER_ORIGINS = [
  "https://www.xsd-viewer.online",
  "https://xsd-viewer.online",
  "https://viewer.status20.net",
  "https://www.odata-viewer.online",
  "https://odata-viewer.online",
  "https://odata-viewer.status20.net",
  "https://www.fund-data-converter.eu",
  "https://converter.status20.net", // test instance of the Fund Data Converter
];

export const HANDOFF_LABELS: Record<HandoffSource, string> = {
  "xsd-viewer": "XSD Viewer",
  "odata-viewer": "OData Viewer",
  "tpt-converter": "Fund Data Converter",
};

export interface HandoffSchema {
  name: string;
  content: ArrayBuffer;
  /** Root schema inside a ZIP; absent for a single .xsd. */
  mainFilename?: string;
}

export interface HandoffFileMessage {
  type: "xml-viewer:file";
  name: string;
  content: ArrayBuffer;
  schema?: HandoffSchema;
}

/** The schema part of a hand-off, as a File plus the ZIP's main entry. */
export interface HandoffSchemaFile {
  file: File;
  mainFilename?: string;
}

function isAllowedOrigin(origin: string): boolean {
  if (SENDER_ORIGINS.includes(origin)) return true;
  // Local development: both apps run on localhost dev servers.
  return import.meta.env.DEV && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

export function handoffSource(search: string = window.location.search): HandoffSource | null {
  const from = new URLSearchParams(search).get("from");
  return (HANDOFF_SOURCES as readonly string[]).includes(from ?? "") ? (from as HandoffSource) : null;
}

export function isHandoffLanding(search: string = window.location.search): boolean {
  return handoffSource(search) !== null;
}

function isSchema(data: unknown): data is HandoffSchema {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.name === "string" &&
    d.content instanceof ArrayBuffer &&
    (d.mainFilename === undefined || typeof d.mainFilename === "string")
  );
}

function isFileMessage(data: unknown): data is HandoffFileMessage {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    d.type === "xml-viewer:file" &&
    typeof d.name === "string" &&
    d.content instanceof ArrayBuffer &&
    (d.schema === undefined || isSchema(d.schema))
  );
}

export interface HandoffSchemaMessage {
  type: "xml-viewer:schema";
  schema: HandoffSchema;
}

function isSchemaMessage(data: unknown): data is HandoffSchemaMessage {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return d.type === "xml-viewer:schema" && isSchema(d.schema);
}

function schemaFile(schema: HandoffSchema): HandoffSchemaFile {
  const lower = schema.name.toLowerCase();
  const type = lower.endsWith(".zip") ? "application/zip" : lower.endsWith(".xsd") ? "application/xml" : "";
  return { file: new File([schema.content], schema.name, { type }), mainFilename: schema.mainFilename };
}

/**
 * Announce readiness to the opener and resolve the handed-over File (plus
 * the schema, when one came along), or the schema alone (`file` null).
 * Returns a cleanup function; `onFile` is called at most once.
 */
export function receiveHandoff(onFile: (file: File | null, schema?: HandoffSchemaFile) => void): () => void {
  const opener = window.opener as Window | null;
  if (!opener) return () => {};

  let done = false;
  const onMessage = (event: MessageEvent) => {
    if (done || event.source !== opener || !isAllowedOrigin(event.origin)) return;
    if (isSchemaMessage(event.data)) {
      done = true;
      window.removeEventListener("message", onMessage);
      onFile(null, schemaFile(event.data.schema));
      return;
    }
    if (!isFileMessage(event.data)) return;
    done = true;
    window.removeEventListener("message", onMessage);
    const type = event.data.name.toLowerCase().endsWith(".xml") ? "application/xml" : "";
    const schema = event.data.schema ? schemaFile(event.data.schema) : undefined;
    onFile(new File([event.data.content], event.data.name, { type }), schema);
  };
  window.addEventListener("message", onMessage);

  // targetOrigin must be a single value; posting to a non-matching origin is
  // silently dropped, so announce to every sender we accept.
  const targets = import.meta.env.DEV ? [...SENDER_ORIGINS, "*"] : SENDER_ORIGINS;
  for (const origin of targets) {
    try {
      opener.postMessage({ type: "xml-viewer:ready" }, origin);
    } catch {
      /* opener closed or cross-origin severed — nothing to do */
    }
  }
  return () => window.removeEventListener("message", onMessage);
}
