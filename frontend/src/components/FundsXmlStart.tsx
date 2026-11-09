import { useRef, useState } from "react";
import { ApiError } from "../api/client";

interface Props {
  // Main file of the release schema the route auto-loaded, once it is there.
  schema: string | null;
  onFile: (file: File) => Promise<void>;
}

/**
 * Empty state of the /fundsxml landing route. Visitors arrive from fundsxml.org
 * with a file to check; the schema is already being loaded for them, so the one
 * thing left to do is pick that file — offered right here, not only in the
 * loader panel above.
 */
export function FundsXmlStart({ schema, onFile }: Props) {
  const input = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (file: File | undefined) => {
    if (!file) return;
    if (/\.xsd$/i.test(file.name)) {
      setError("That is a schema. The FundsXML schema is already loaded — choose the FundsXML document to check.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onFile(file);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h2 className="text-xl font-semibold mb-2">Validate a FundsXML file</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4" role="status">
        {schema ? (
          <>
            ✓ Schema <strong className="font-mono text-xs">{schema}</strong> is loaded. Choose your
            FundsXML file and every error is listed with its line — your file is not stored.
          </>
        ) : (
          <>Loading the latest FundsXML schema… choose your FundsXML file meanwhile.</>
        )}
      </p>
      <input
        ref={input}
        type="file"
        accept=".xml,application/xml,text/xml"
        className="hidden"
        onChange={(e) => {
          void load(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <p className="mb-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {busy ? "Loading…" : "Choose your FundsXML file…"}
        </button>
      </p>
      {error && (
        <p className="mb-2 text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
        Another schema version? Pick it under <strong>FundsXML Releases</strong> in the XSD panel above.
      </p>
    </>
  );
}
