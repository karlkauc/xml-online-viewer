// Share a validation result without storing anything: the error list (never
// the document) is compressed into the URL fragment of /report#…, which
// browsers do not send to the server. Messages can quote values from the
// document, so the UI asks before creating such a link.

import type { Severity, ValidationErrorItem } from "../types/model";

export const MAX_SHARED_ERRORS = 500;
const SEVERITIES: Severity[] = ["fatal", "error", "warning"];

export interface SharedReport {
  xmlFilename: string;
  xsdFilename: string;
  isValid: boolean;
  errors: ValidationErrorItem[];
  /** More errors existed than fit into the link. */
  truncated: boolean;
}

type Row = [number | null, number | null, string, string, string | null, string | null];

interface Payload {
  v: 1;
  x: string;
  s: string;
  ok: boolean;
  t: boolean;
  e: Row[];
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream): Promise<Uint8Array<ArrayBuffer>> {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function encodeReport(report: Omit<SharedReport, "truncated">): Promise<string> {
  const errors = report.errors.slice(0, MAX_SHARED_ERRORS);
  const payload: Payload = {
    v: 1,
    x: report.xmlFilename,
    s: report.xsdFilename,
    ok: report.isValid,
    t: report.errors.length > errors.length,
    e: errors.map((e) => [e.line, e.column, e.severity, e.message, e.path, e.help_slug ?? null]),
  };
  const json = new TextEncoder().encode(JSON.stringify(payload));
  return `z.${toBase64Url(await pipe(json, new CompressionStream("deflate-raw")))}`;
}

export async function decodeReport(fragment: string): Promise<SharedReport> {
  const data = fragment.replace(/^#/, "");
  if (!data.startsWith("z.")) throw new Error("This link does not contain a validation report.");
  const json = new TextDecoder().decode(await pipe(fromBase64Url(data.slice(2)), new DecompressionStream("deflate-raw")));
  const p = JSON.parse(json) as Payload;
  if (p.v !== 1 || !Array.isArray(p.e)) throw new Error("Unknown report format.");
  const errors = p.e.slice(0, MAX_SHARED_ERRORS).map(([line, column, severity, message, path, help]) => ({
    line: typeof line === "number" ? line : null,
    column: typeof column === "number" ? column : null,
    severity: SEVERITIES.includes(severity as Severity) ? (severity as Severity) : "error",
    message: String(message ?? ""),
    path: typeof path === "string" ? path : null,
    help_slug: typeof help === "string" && /^[a-z0-9-]+$/.test(help) ? help : null,
    type_name: null,
    domain: null,
    node_id: null,
  }));
  return { xmlFilename: String(p.x ?? ""), xsdFilename: String(p.s ?? ""), isValid: !!p.ok && errors.length === 0, errors, truncated: !!p.t };
}

export async function reportLink(report: Omit<SharedReport, "truncated">, origin: string = window.location.origin): Promise<string> {
  return `${origin}/report#${await encodeReport(report)}`;
}
