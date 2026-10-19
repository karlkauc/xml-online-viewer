import { useEffect, useState } from "react";
import clsx from "clsx";
import { ApiError, downloadSharedReportExcel } from "../api/client";
import { decodeReport, type SharedReport } from "../lib/reportLink";
import type { Severity } from "../types/model";
import { FamilyFooter } from "./FamilyFooter";
import { ThemeToggle } from "./ThemeToggle";

const SEVERITY_CLASS: Record<Severity, string> = {
  fatal: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  error: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
};

/** /report#… — a validation result shared as a link (lib/reportLink.ts); read-only, no document. */
export function ReportView() {
  const [report, setReport] = useState<SharedReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    decodeReport(window.location.hash)
      .then(setReport)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const excel = async () => {
    if (!report) return;
    setBusy(true);
    try {
      await downloadSharedReportExcel({ xml_filename: report.xmlFilename, xsd_filename: report.xsdFilename, is_valid: report.isValid, errors: report.errors });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <header className="flex items-center justify-between gap-2 px-3 md:px-4 py-2 md:py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
        <a href="/" className="text-base md:text-lg font-semibold">
          XML Online Viewer
        </a>
        <ThemeToggle />
      </header>
      <main className="max-w-4xl mx-auto px-4 py-6">
        <h1 className="text-xl font-semibold">Shared validation report</h1>
        {error && (
          <p className="mt-4 text-sm text-red-700 dark:text-red-400" role="alert">
            {error}
          </p>
        )}
        {report && (
          <>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 break-all">
              <span className="font-mono">{report.xmlFilename || "document"}</span> validated against{" "}
              <span className="font-mono">{report.xsdFilename || "schema"}</span>. The link contains only the error list, not the document.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span
                className={clsx(
                  "chip",
                  report.isValid
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                    : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
                )}
              >
                {report.isValid ? "Valid" : `${report.errors.length}${report.truncated ? "+" : ""} errors`}
              </span>
              {report.errors.length > 0 && (
                <button type="button" className="btn" disabled={busy} onClick={() => void excel()}>
                  {busy ? "Preparing…" : "⬇ Excel report"}
                </button>
              )}
              <a className="btn btn-primary" href="/">
                Validate a file yourself
              </a>
            </div>
            {report.truncated && (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">Only the first {report.errors.length} errors fit into the link.</p>
            )}
            <ul className="mt-4 divide-y divide-slate-100 dark:divide-slate-800 border-y border-slate-100 dark:border-slate-800">
              {report.errors.map((err, i) => (
                <li key={i} className="py-2 text-sm">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={clsx("chip", SEVERITY_CLASS[err.severity])}>{err.severity}</span>
                    {err.line != null && (
                      <span className="font-mono text-xs text-slate-400">
                        Line {err.line}
                        {err.column ? `:${err.column}` : ""}
                      </span>
                    )}
                    {err.help_slug && (
                      <a className="ml-auto text-xs text-accent hover:underline" href={`/errors/${err.help_slug}`} target="_blank" rel="noopener noreferrer">
                        What does this mean?
                      </a>
                    )}
                  </div>
                  <p className="text-slate-700 dark:text-slate-300 break-words">{err.message}</p>
                  {err.path && <p className="font-mono text-[11px] text-slate-400 break-all mt-0.5">{err.path}</p>}
                </li>
              ))}
            </ul>
          </>
        )}
        <FamilyFooter className="mt-8 text-xs text-slate-500 dark:text-slate-400" />
      </main>
    </div>
  );
}
