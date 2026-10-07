import type {
  ValidationResponse,
  XmlDocModel,
  XsdInfo,
} from "../types/model";

const API_BASE = "/api";

export class ApiError extends Error {
  status: number;
  /** Schemas to choose the main one from, when the server could not tell. */
  candidates?: string[];
  constructor(message: string, status: number, candidates?: string[]) {
    super(message);
    this.status = status;
    this.candidates = candidates;
  }
}

async function handle<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    let candidates: string[] | undefined;
    try {
      const body = await response.json();
      if (typeof body?.detail === "string") detail = body.detail;
      if (Array.isArray(body?.candidates)) candidates = body.candidates;
    } catch {
      // ignore parse errors; fall back to status
    }
    throw new ApiError(detail, response.status, candidates);
  }
  return (await response.json()) as T;
}

// --- Expired documents ------------------------------------------------------
//
// The server keeps documents and schemas in a per-instance memory cache, so a
// later call can find them gone (idle too long, instance restarted, request
// routed to another instance). Ids are content hashes: repeating the load
// that produced one brings it back under the same id, and the call can simply
// be retried — the visitor never sees "not found or expired".

type SourceKind = "xml" | "xsd";
interface Source {
  id: string;
  reload: () => Promise<string>;
}
const sources: Partial<Record<SourceKind, Source>> = {};

const EXPIRED: Record<string, SourceKind> = {
  "XML not found or expired": "xml",
  "XSD not found or expired": "xsd",
};
const MAX_RELOADS = 2;

function expiredError(kind: SourceKind): ApiError {
  const what = kind === "xml" ? "XML document" : "XSD schema";
  return new ApiError(`The ${what} has expired on the server. Please load it again.`, 404);
}

async function rememberXml(load: () => Promise<XmlDocModel>): Promise<XmlDocModel> {
  const doc = await load();
  sources.xml = { id: doc.xml_id, reload: async () => (await load()).xml_id };
  return doc;
}

async function rememberXsd(load: () => Promise<XsdInfo>): Promise<XsdInfo> {
  const info = await load();
  sources.xsd = { id: info.xsd_id, reload: async () => (await load()).xsd_id };
  return info;
}

/** Run `call`; when it fails because a document or schema expired, reload
 * that one from its source and try again. */
async function withReload<T>(call: () => Promise<T>): Promise<T> {
  for (let reloads = 0; ; reloads++) {
    let kind: SourceKind | undefined;
    try {
      return await call();
    } catch (err) {
      // Other 404s ("this document does not reference a downloadable schema") are answers.
      kind = err instanceof ApiError && err.status === 404 ? EXPIRED[err.message] : undefined;
      if (!kind) throw err;
    }
    const source = sources[kind];
    if (!source || reloads === MAX_RELOADS) throw expiredError(kind);
    // A source that now yields other content (a URL whose file changed) has a
    // new id; the caller still holds the old one, so retrying cannot succeed.
    const id = await source.reload().catch(() => null);
    if (id !== source.id) throw expiredError(kind);
  }
}

// --- XML data -------------------------------------------------------------

export async function uploadXmlFile(file: File): Promise<XmlDocModel> {
  return rememberXml(async () => {
    const form = new FormData();
    form.append("file", file);
    return handle<XmlDocModel>(
      await fetch(`${API_BASE}/xml/upload`, { method: "POST", body: form }),
    );
  });
}

export async function uploadXmlText(
  content: string,
  filename = "document.xml",
): Promise<XmlDocModel> {
  return rememberXml(async () => {
    return handle<XmlDocModel>(
      await fetch(`${API_BASE}/xml/text`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content, filename }),
      }),
    );
  });
}

export async function uploadXmlUrl(url: string): Promise<XmlDocModel> {
  return rememberXml(async () => {
    return handle<XmlDocModel>(
      await fetch(`${API_BASE}/xml/url`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      }),
    );
  });
}

// --- XSD schema -----------------------------------------------------------

/** One schema, one ZIP, or a schema together with the files it imports. */
export async function uploadXsdFiles(
  files: File[],
  mainFilename?: string,
): Promise<XsdInfo> {
  return rememberXsd(async () => {
    const form = new FormData();
    for (const file of files) form.append("file", file);
    if (mainFilename) form.append("main_filename", mainFilename);
    return handle<XsdInfo>(
      await fetch(`${API_BASE}/xsd/upload`, { method: "POST", body: form }),
    );
  });
}

export async function uploadXsdText(
  content: string,
  filename = "schema.xsd",
): Promise<XsdInfo> {
  return rememberXsd(async () => {
    return handle<XsdInfo>(
      await fetch(`${API_BASE}/xsd/text`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content, filename }),
      }),
    );
  });
}

export async function uploadXsdUrl(url: string): Promise<XsdInfo> {
  return rememberXsd(async () => {
    return handle<XsdInfo>(
      await fetch(`${API_BASE}/xsd/url`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      }),
    );
  });
}

/** Load the schema the XML document itself points at (xsi:schemaLocation /
 * xsi:noNamespaceSchemaLocation), including everything it imports. 404 when
 * the document names no downloadable schema. */
export async function autoLoadXsd(xmlId: string): Promise<XsdInfo> {
  return rememberXsd(() =>
    withReload(async () =>
      handle<XsdInfo>(
        await fetch(`${API_BASE}/xsd/auto`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ xml_id: xmlId }),
        }),
      ),
    ),
  );
}

// --- Validation -----------------------------------------------------------

export async function runValidation(
  xmlId: string,
  xsdId: string,
): Promise<ValidationResponse> {
  return withReload(async () =>
    handle<ValidationResponse>(
      await fetch(`${API_BASE}/validate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ xml_id: xmlId, xsd_id: xsdId }),
      }),
    ),
  );
}

export function excelReportUrl(validationId: string): string {
  return `${API_BASE}/validate/${validationId}/excel`;
}

// --- FundsXML releases (GitHub) ------------------------------------------

export interface FundsXmlAsset {
  filename: string;
  download_url: string;
  size: number;
  content_type: string | null;
}

export interface FundsXmlRelease {
  tag_name: string;
  name: string | null;
  published_at: string;
  prerelease: boolean;
  html_url: string;
  assets: FundsXmlAsset[];
}

export interface FundsXmlReleasesResponse {
  releases: FundsXmlRelease[];
  cached_at: string;
  ttl_seconds: number;
}

export async function listFundsXmlReleases(): Promise<FundsXmlReleasesResponse> {
  return handle<FundsXmlReleasesResponse>(
    await fetch(`${API_BASE}/fundsxml/releases`),
  );
}

export async function loadXsdFromRelease(
  tagName: string,
  mainFilename: string,
): Promise<XsdInfo> {
  return rememberXsd(async () =>
    handle<XsdInfo>(
      await fetch(
        `${API_BASE}/fundsxml/releases/${encodeURIComponent(tagName)}/load`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ main_filename: mainFilename }),
        },
      ),
    ),
  );
}

// --- Feedback & health ----------------------------------------------------

export interface FeedbackPayload {
  message: string;
  email?: string;
  page?: string;
  xml_name?: string;
  xsd_name?: string;
  error_detail?: string;
  /** Honeypot; always empty for real users. */
  website?: string;
}

export async function sendFeedback(payload: FeedbackPayload): Promise<void> {
  const response = await fetch(`${API_BASE}/feedback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      // ignore
    }
    throw new ApiError(detail, response.status);
  }
}

export interface HealthResponse {
  status: string;
  version: string;
}

export async function fetchHealth(): Promise<HealthResponse> {
  return handle<HealthResponse>(await fetch(`${API_BASE}/health`));
}
