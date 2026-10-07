import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import { COARSE_POINTER_QUERY, useMediaQuery } from "../lib/useMediaQuery";
import { ApiError } from "../api/client";
import { FundsXmlReleases } from "./FundsXmlReleases";
import { XSD_VIEWER_URL } from "../lib/links";

type Mode = "file" | "text" | "url" | "releases";

const MODE_LABEL: Record<Mode, string> = {
  file: "File",
  text: "Paste",
  url: "URL",
  releases: "FundsXML Releases",
};

/** Matches the opening tag of an XML Schema document (any prefix), close
 * enough to the XMLSchema namespace declaration to avoid false positives on
 * an instance document that merely has a <schema> element. */
const SCHEMA_ROOT_RE = /<(?:[\w.-]+:)?schema[\s>][\s\S]{0,400}XMLSchema/;

/** True when the input is an XML Schema rather than an instance document.
 * Used only by the XML panel, to explain the mix-up instead of failing with a
 * validation error further down. */
function looksLikeSchema(filename?: string, text?: string): boolean {
  if (filename && /\.xsd(\?|#|$)/i.test(filename)) return true;
  return !!text && SCHEMA_ROOT_RE.test(text.slice(0, 1024));
}

interface SourceLoaderProps {
  title: string;
  accept: string;
  placeholder: string;
  status: string | null;
  onFile: (files: File[], mainFilename?: string) => Promise<void>;
  onText: (content: string) => Promise<void>;
  onUrl: (url: string) => Promise<void>;
  // When set, several files (a schema with the files it imports) or a ZIP of
  // them may be loaded; if the server cannot tell which schema is the main
  // one, the user picks it from the candidates it returns.
  multiple?: boolean;
  // When set, a "Releases" tab lets the user load a schema from a published
  // FundsXML GitHub release.
  onRelease?: (tagName: string, filename: string) => Promise<void>;
  // Tab to open on first render (defaults to "file").
  defaultMode?: Mode;
  // Greys the panel out; the loaders stay visible so the feature is
  // discoverable, but cannot be used yet.
  disabled?: boolean;
  disabledHint?: string;
  // One-click example document, offered under the drop zone.
  onSample?: () => Promise<void>;
  sampleLabel?: string;
  // Reject XML Schema input with an explanation instead of uploading it.
  rejectSchemaInput?: boolean;
  // Rendered after the "✓ <status>" line (e.g. how the schema was found).
  statusNote?: ReactNode;
  // When set, an ✕ button next to the status line unloads the current input.
  onClear?: () => void;
}

/** A single load surface (file / paste / URL) for either XML or XSD input. */
function SourceLoader({
  title,
  accept,
  placeholder,
  status,
  onFile,
  onText,
  onUrl,
  multiple,
  onRelease,
  defaultMode = "file",
  disabled,
  disabledHint,
  onSample,
  sampleLabel,
  rejectSchemaInput,
  statusNote,
  onClear,
}: SourceLoaderProps) {
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schemaMixUp, setSchemaMixUp] = useState(false);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [choice, setChoice] = useState<{ files: File[]; candidates: string[]; main: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  // Finger input has no drag-and-drop; say so instead of inviting a drop.
  const coarsePointer = useMediaQuery(COARSE_POINTER_QUERY);
  const fileInput = useRef<HTMLInputElement | null>(null);

  // A document may also be loaded from outside this panel (the empty-state
  // example button, the xsd-viewer handoff). Drop a stale mix-up warning once
  // something did load, so it cannot outlive the input it was about.
  useEffect(() => {
    if (status) setSchemaMixUp(false);
  }, [status]);

  const run = useCallback(async (fn: () => Promise<void>) => {
    setError(null);
    setSchemaMixUp(false);
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  /** Run `fn`, unless the input is an XML Schema and this panel wants XML. */
  const guarded = useCallback(
    (fn: () => Promise<void>, filename?: string, content?: string) => {
      if (rejectSchemaInput && looksLikeSchema(filename, content)) {
        setError(null);
        setSchemaMixUp(true);
        return;
      }
      void run(fn);
    },
    [rejectSchemaInput, run],
  );

  /** Load the picked files; a server that cannot tell the main schema apart
   * answers with candidates, which become a choice instead of an error. */
  const loadFiles = useCallback(
    (files: File[], mainFilename?: string) => {
      if (files.length === 0) return;
      if (!mainFilename) setChoice(null);
      guarded(async () => {
        try {
          await onFile(files, mainFilename);
          setChoice(null);
        } catch (err) {
          if (!(err instanceof ApiError) || !err.candidates?.length) throw err;
          setChoice({ files, candidates: err.candidates, main: err.candidates[0] });
        }
      }, files[0].name);
    },
    [guarded, onFile],
  );

  return (
    <div
      className={clsx("panel rounded-lg p-3 flex-1 min-w-0", disabled && "opacity-60")}
      aria-disabled={disabled || undefined}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-sm font-semibold shrink-0">{title}</h3>
        <div className="flex gap-1 overflow-x-auto" role="tablist">
          {(["file", "text", "url", ...(onRelease ? ["releases"] : [])] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              disabled={disabled}
              className={clsx(
                "shrink-0 whitespace-nowrap px-2 py-0.5 touch:py-1.5 text-xs font-medium rounded disabled:cursor-not-allowed",
                mode === m
                  ? "bg-accent text-white dark:bg-accent-dark dark:text-slate-950"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300",
              )}
              onClick={() => setMode(m)}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
      </div>

      <div className={clsx(disabled && "pointer-events-none select-none")}>
        {mode === "file" && (
          <div
            className={clsx(
              "rounded border border-dashed border-slate-300 dark:border-slate-700 p-4 text-center text-sm transition-colors",
              dragOver && "border-accent bg-blue-50/60 dark:bg-blue-950/20",
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const dropped = Array.from(e.dataTransfer.files ?? []);
              loadFiles(multiple ? dropped : dropped.slice(0, 1));
            }}
          >
            <input
              ref={fileInput}
              type="file"
              accept={accept}
              multiple={multiple}
              className="hidden"
              onChange={(e) => {
                loadFiles(Array.from(e.target.files ?? []));
                // Let the same selection be picked again after an error.
                e.target.value = "";
              }}
            />
            <p className="mb-2 text-slate-600 dark:text-slate-400">
              {coarsePointer
                ? `Choose ${multiple ? "one or more files" : "a file"} to load.`
                : `Drop ${multiple ? "files" : "a file"} here or choose ${multiple ? "them" : "one"}`}
            </p>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || disabled}
              onClick={() => fileInput.current?.click()}
            >
              {multiple ? "Choose files…" : "Choose file…"}
            </button>
            {onSample && (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                or{" "}
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-accent disabled:no-underline"
                  disabled={busy || disabled}
                  onClick={() => void run(onSample)}
                >
                  {sampleLabel ?? "load an example"}
                </button>
              </p>
            )}
            {multiple && !choice && (
              <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
                Schema split over several files? Select them all together, or load one ZIP.
              </p>
            )}
            {choice && (
              <div className="mt-3 text-left text-xs">
                <label className="block text-slate-600 dark:text-slate-300">
                  Which one is the main schema?
                  <select
                    className="mt-1 w-full font-mono text-xs px-2 py-1 touch:py-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    value={choice.main}
                    onChange={(e) => setChoice({ ...choice, main: e.target.value })}
                  >
                    {choice.candidates.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={() => loadFiles(choice.files, choice.main)}
                  >
                    Load
                  </button>
                  <button type="button" className="btn" disabled={busy} onClick={() => setChoice(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {mode === "text" && (
          <div>
            <textarea
              className="w-full h-28 font-mono text-xs p-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
              placeholder={placeholder}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-primary mt-2"
              disabled={busy || disabled || !text.trim()}
              onClick={() => guarded(() => onText(text), undefined, text)}
            >
              Load
            </button>
          </div>
        )}

        {mode === "url" && (
          <div>
            <input
              type="url"
              placeholder="https://…"
              className="w-full font-mono text-xs px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-primary mt-2"
              disabled={busy || disabled || !url.trim()}
              onClick={() => guarded(() => onUrl(url.trim()), url.trim())}
            >
              Load
            </button>
          </div>
        )}

        {mode === "releases" && onRelease && (
          <FundsXmlReleases
            busy={busy}
            onSelect={(tag, filename) => void run(() => onRelease(tag, filename))}
          />
        )}
      </div>

      {disabled && disabledHint && (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{disabledHint}</p>
      )}
      {!disabled && busy && <p className="mt-2 text-xs text-slate-500">Loading…</p>}
      {!disabled && schemaMixUp && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400" role="alert">
          That&rsquo;s an XML Schema, not an XML document. Load it under{" "}
          <strong>XSD schema</strong> to validate a document against it — or open it in the{" "}
          <a
            className="underline underline-offset-2"
            href={XSD_VIEWER_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            XSD Viewer ↗
          </a>{" "}
          to visualise the schema itself.
        </p>
      )}
      {!disabled && error && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
      {!disabled && !error && !schemaMixUp && !busy && status && (
        <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 flex-wrap">
          <span>✓ {status}</span>
          {statusNote}
          {onClear && (
            <button
              type="button"
              className="text-slate-400 hover:text-red-600 dark:hover:text-red-400"
              onClick={onClear}
              title="Unload"
              aria-label={`Unload ${status}`}
            >
              ✕
            </button>
          )}
        </p>
      )}
    </div>
  );
}

interface UploaderProps {
  xmlStatus: string | null;
  xsdStatus: string | null;
  onXmlFile: (f: File) => Promise<void>;
  onXmlText: (c: string) => Promise<void>;
  onXmlUrl: (u: string) => Promise<void>;
  onXmlSample: () => Promise<void>;
  onXsdFiles: (files: File[], mainFilename?: string) => Promise<void>;
  onXsdText: (c: string) => Promise<void>;
  onXsdUrl: (u: string) => Promise<void>;
  onXsdRelease: (tagName: string, filename: string) => Promise<void>;
  onXsdClear: () => void;
  // Initial tab for the XSD loader (e.g. "releases" on the /fundsxml route).
  defaultXsdMode?: Mode;
  // The schema is only meaningful for a loaded document, so the XSD loader
  // stays inert until there is one.
  xsdDisabled?: boolean;
  xsdStatusNote?: ReactNode;
}

export function Uploader(props: UploaderProps) {
  return (
    <div className="flex flex-col md:flex-row gap-3">
      <SourceLoader
        title="XML data"
        accept=".xml,application/xml,text/xml"
        placeholder="<FundsXML4>…"
        status={props.xmlStatus}
        onFile={(files) => props.onXmlFile(files[0])}
        onText={props.onXmlText}
        onUrl={props.onXmlUrl}
        onSample={props.onXmlSample}
        sampleLabel="load a FundsXML example"
        rejectSchemaInput
      />
      <SourceLoader
        title="XSD schema"
        accept=".xsd,.zip,application/zip,application/xml"
        placeholder="<xs:schema>…"
        status={props.xsdStatus}
        onFile={props.onXsdFiles}
        onText={props.onXsdText}
        onUrl={props.onXsdUrl}
        onRelease={props.onXsdRelease}
        onClear={props.xsdStatus ? props.onXsdClear : undefined}
        defaultMode={props.defaultXsdMode}
        disabled={props.xsdDisabled}
        disabledHint="Load an XML file first — a schema is only used to validate it."
        statusNote={props.xsdStatusNote}
        multiple
      />
    </div>
  );
}
