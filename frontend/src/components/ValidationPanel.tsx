import { useState } from "react";
import clsx from "clsx";
import { ApiError, excelReportUrl, runValidation } from "../api/client";
import { useApp } from "../stores/appStore";
import type { Severity } from "../types/model";

const SEVERITY_CLASS: Record<Severity, string> = {
  fatal: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  error: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
};

export function ValidationPanel() {
  const xmlDoc = useApp((s) => s.xmlDoc);
  const xsdInfo = useApp((s) => s.xsdInfo);
  const validation = useApp((s) => s.validation);
  const setValidation = useApp((s) => s.setValidation);
  const setSelected = useApp((s) => s.setSelected);
  const selectedNodeId = useApp((s) => s.selectedNodeId);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canValidate = !!xmlDoc && !!xsdInfo;

  const validate = async () => {
    if (!xmlDoc || !xsdInfo) return;
    setError(null);
    setBusy(true);
    try {
      const result = await runValidation(xmlDoc.xml_id, xsdInfo.xsd_id);
      setValidation(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Validierung
        </span>
      </div>

      <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 flex-wrap">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!canValidate || busy}
          onClick={() => void validate()}
        >
          {busy ? "Validiere…" : "Validieren"}
        </button>

        {validation && (
          <a
            className="btn"
            href={excelReportUrl(validation.validation_id)}
            download
          >
            ⬇ Excel-Report
          </a>
        )}

        {validation && (
          <span
            className={clsx(
              "chip",
              validation.is_valid
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
            )}
          >
            {validation.is_valid
              ? "Gültig"
              : `${validation.errors.length} Fehler`}
          </span>
        )}
      </div>

      {!canValidate && (
        <p className="p-3 text-sm text-slate-500">
          Lade XML-Daten und ein XSD-Schema, um zu validieren.
        </p>
      )}
      {error && (
        <p className="p-3 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      {validation && (
        <div className="flex-1 min-h-0 overflow-auto">
          {validation.is_valid ? (
            <p className="p-3 text-sm text-emerald-600 dark:text-emerald-400">
              ✓ Das Dokument ist gültig gegen das Schema.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {validation.errors.map((err, i) => (
                <li
                  key={i}
                  className={clsx(
                    "px-3 py-2 text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900",
                    err.node_id &&
                      selectedNodeId === err.node_id &&
                      "bg-blue-50 dark:bg-blue-900/30",
                  )}
                  onClick={() => err.node_id && setSelected(err.node_id)}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={clsx("chip", SEVERITY_CLASS[err.severity])}>
                      {err.severity}
                    </span>
                    {err.line != null && (
                      <span className="font-mono text-xs text-slate-400">
                        Zeile {err.line}
                        {err.column ? `:${err.column}` : ""}
                      </span>
                    )}
                  </div>
                  <p className="text-slate-700 dark:text-slate-300">{err.message}</p>
                  {err.path && (
                    <p className="font-mono text-[11px] text-slate-400 truncate mt-0.5">
                      {err.path}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
