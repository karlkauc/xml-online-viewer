import { useCallback, useRef, useState } from "react";
import clsx from "clsx";
import { ApiError } from "../api/client";
import { FundsXmlReleases } from "./FundsXmlReleases";

type Mode = "file" | "text" | "url" | "releases";

const MODE_LABEL: Record<Mode, string> = {
  file: "File",
  text: "Paste",
  url: "URL",
  releases: "Releases",
};

interface SourceLoaderProps {
  title: string;
  accept: string;
  placeholder: string;
  status: string | null;
  onFile: (file: File, mainFilename?: string) => Promise<void>;
  onText: (content: string) => Promise<void>;
  onUrl: (url: string) => Promise<void>;
  // When set, a ZIP may contain several schemas; an optional input lets the
  // user name the main file if it cannot be auto-detected.
  showMainFilename?: boolean;
  // When set, a "Releases" tab lets the user load a schema from a published
  // FundsXML GitHub release.
  onRelease?: (tagName: string, filename: string) => Promise<void>;
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
  showMainFilename,
  onRelease,
}: SourceLoaderProps) {
  const [mode, setMode] = useState<Mode>("file");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [mainFilename, setMainFilename] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const main = () => mainFilename.trim() || undefined;

  const run = useCallback(async (fn: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className="panel rounded-lg p-3 flex-1 min-w-0">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <div className="flex gap-1" role="tablist">
          {(["file", "text", "url", ...(onRelease ? ["releases"] : [])] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              className={clsx(
                "px-2 py-0.5 text-xs font-medium rounded",
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
            const f = e.dataTransfer.files?.[0];
            if (f) void run(() => onFile(f, main()));
          }}
        >
          <input
            ref={fileInput}
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void run(() => onFile(f, main()));
            }}
          />
          <p className="mb-2 text-slate-600 dark:text-slate-400">
            Drop a file here or choose one
          </p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            Choose file…
          </button>
          {showMainFilename && (
            <label className="block mt-3 text-[11px] text-slate-500 dark:text-slate-400">
              ZIP with multiple XSDs? The main schema is auto-detected — or
              specify it here:
              <input
                type="text"
                placeholder="e.g. FundsXML4.xsd"
                className="mt-1 w-full font-mono text-xs px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                value={mainFilename}
                onChange={(e) => setMainFilename(e.target.value)}
              />
            </label>
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
            disabled={busy || !text.trim()}
            onClick={() => void run(() => onText(text))}
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
            disabled={busy || !url.trim()}
            onClick={() => void run(() => onUrl(url.trim()))}
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

      {busy && <p className="mt-2 text-xs text-slate-500">Loading…</p>}
      {error && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
      {!error && !busy && status && (
        <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">✓ {status}</p>
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
  onXsdFile: (f: File, mainFilename?: string) => Promise<void>;
  onXsdText: (c: string) => Promise<void>;
  onXsdUrl: (u: string) => Promise<void>;
  onXsdRelease: (tagName: string, filename: string) => Promise<void>;
}

export function Uploader(props: UploaderProps) {
  return (
    <div className="flex flex-col md:flex-row gap-3">
      <SourceLoader
        title="XML data"
        accept=".xml,application/xml,text/xml"
        placeholder="<FundsXML4>…"
        status={props.xmlStatus}
        onFile={props.onXmlFile}
        onText={props.onXmlText}
        onUrl={props.onXmlUrl}
      />
      <SourceLoader
        title="XSD schema"
        accept=".xsd,.zip,application/zip,application/xml"
        placeholder="<xs:schema>…"
        status={props.xsdStatus}
        onFile={props.onXsdFile}
        onText={props.onXsdText}
        onUrl={props.onXsdUrl}
        onRelease={props.onXsdRelease}
        showMainFilename
      />
    </div>
  );
}
