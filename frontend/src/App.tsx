import { useCallback } from "react";
import {
  uploadXmlFile,
  uploadXmlText,
  uploadXmlUrl,
  uploadXsdFile,
  uploadXsdText,
  uploadXsdUrl,
} from "./api/client";
import { useApp } from "./stores/appStore";
import { Uploader } from "./components/Uploader";
import { XmlTreeView } from "./components/XmlTreeView/XmlTreeView";
import { ValidationPanel } from "./components/ValidationPanel";
import { ThemeToggle } from "./components/ThemeToggle";

export default function App() {
  const xmlDoc = useApp((s) => s.xmlDoc);
  const xsdInfo = useApp((s) => s.xsdInfo);
  const setXml = useApp((s) => s.setXml);
  const setXsd = useApp((s) => s.setXsd);

  const onXmlFile = useCallback(async (f: File) => setXml(await uploadXmlFile(f)), [setXml]);
  const onXmlText = useCallback(async (c: string) => setXml(await uploadXmlText(c)), [setXml]);
  const onXmlUrl = useCallback(async (u: string) => setXml(await uploadXmlUrl(u)), [setXml]);
  const onXsdFile = useCallback(async (f: File) => setXsd(await uploadXsdFile(f)), [setXsd]);
  const onXsdText = useCallback(async (c: string) => setXsd(await uploadXsdText(c)), [setXsd]);
  const onXsdUrl = useCallback(async (u: string) => setXsd(await uploadXsdUrl(u)), [setXsd]);

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-3 px-4 py-2 border-b border-slate-200 dark:border-slate-800">
        <h1 className="text-base font-semibold">FundsXML Online Validator</h1>
        <p className="text-xs text-slate-500 hidden sm:block">
          XML-Daten ansehen · gegen XSD validieren · Fehler als Excel exportieren
        </p>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </header>

      <div className="p-4 border-b border-slate-200 dark:border-slate-800">
        <Uploader
          xmlStatus={xmlDoc ? `${xmlDoc.filename} (${xmlDoc.node_count} Knoten)` : null}
          xsdStatus={xsdInfo ? xsdInfo.main_filename : null}
          onXmlFile={onXmlFile}
          onXmlText={onXmlText}
          onXmlUrl={onXmlUrl}
          onXsdFile={onXsdFile}
          onXsdText={onXsdText}
          onXsdUrl={onXsdUrl}
        />
      </div>

      <main className="flex-1 min-h-0">
        {!xmlDoc ? (
          <div className="h-full flex items-center justify-center text-slate-400 text-sm">
            Lade XML-Daten, um die Baumansicht zu sehen.
          </div>
        ) : (
          <div className="h-full grid grid-cols-1 lg:grid-cols-[1fr_28rem] divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
            <div className="min-h-0 h-full">
              <XmlTreeView />
            </div>
            <div className="min-h-0 h-full">
              <ValidationPanel />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
