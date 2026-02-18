// src/components/ui/ImportModal.tsx
// NOMINAL CMMS — Reusable Excel/CSV import modal
// Drag & drop → parse → preview column mappings → import

import { useState, useRef } from 'react';
import { X, Upload, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { parseExcelFile, type ParseResult } from '../../utils/importers/excelImporter';

interface ImportResult {
  imported: number;
  failed: number;
  errors: string[];
}

interface ImportModalProps {
  title: string;
  onClose: () => void;
  onImport: (rows: Record<string, unknown>[]) => Promise<ImportResult>;
}

export default function ImportModal({ title, onClose, onImport }: ImportModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<ParseResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setParsing(true);
    setError(null);
    try {
      const parsed = await parseExcelFile(file);
      setPreview(parsed);
    } catch (err: unknown) {
      setError((err as Error).message);
    }
    setParsing(false);
  };

  const handleImport = async () => {
    if (!preview) return;
    setImporting(true);
    setError(null);
    try {
      const res = await onImport(preview.rows);
      setResult(res);
    } catch (err: unknown) {
      setError((err as Error).message);
    }
    setImporting(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-t-3xl md:rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold">{title}</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Result screen */}
          {result ? (
            <div className="text-center py-6">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <div className="text-lg font-bold text-slate-800">
                Importováno {result.imported} záznamů
              </div>
              {result.failed > 0 && (
                <div className="text-sm text-red-600 mt-1">{result.failed} chyb</div>
              )}
              {result.errors.length > 0 && (
                <div className="mt-3 text-left bg-red-50 p-3 rounded-xl text-sm text-red-700 max-h-40 overflow-y-auto">
                  {result.errors.map((e, i) => <div key={i}>{e}</div>)}
                </div>
              )}
              <button onClick={onClose} className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-500">
                Zavřít
              </button>
            </div>
          ) : !preview ? (
            /* File upload */
            <>
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                className="border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition"
              >
                {parsing ? (
                  <Loader2 className="w-8 h-8 text-blue-600 mx-auto animate-spin" />
                ) : (
                  <>
                    <Upload className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                    <div className="font-medium text-slate-700">Klikněte nebo přetáhněte soubor</div>
                    <div className="text-sm text-slate-500 mt-1">.xlsx, .xls, .csv</div>
                  </>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              {error && (
                <div className="bg-red-50 text-red-700 p-3 rounded-xl text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />{error}
                </div>
              )}
            </>
          ) : (
            /* Preview + column mappings */
            <>
              <div className="bg-blue-50 p-3 rounded-xl">
                <div className="font-medium text-blue-800">List: {preview.sheetName}</div>
                <div className="text-sm text-blue-600">{preview.rowCount} řádků, {preview.columns.length} sloupců</div>
              </div>

              <div className="space-y-1">
                <div className="text-sm font-medium text-slate-700">Mapování sloupců:</div>
                {preview.mappings.map((m, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm px-3 py-1.5 bg-slate-50 rounded-lg">
                    <span className="text-slate-500 truncate">{m.excelColumn}</span>
                    <span className="text-slate-400">→</span>
                    <span className="font-medium text-slate-800">{m.mappedTo}</span>
                    <span className={`ml-auto text-xs flex-shrink-0 ${
                      m.confidence > 0.7 ? 'text-emerald-600' : m.confidence > 0.3 ? 'text-amber-600' : 'text-slate-400'
                    }`}>
                      {Math.round(m.confidence * 100)}%
                    </span>
                  </div>
                ))}
              </div>

              {error && (
                <div className="bg-red-50 text-red-700 p-3 rounded-xl text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />{error}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => { setPreview(null); setError(null); }}
                  className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-medium"
                >
                  Zpět
                </button>
                <button
                  onClick={handleImport}
                  disabled={importing}
                  className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {importing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                  Importovat ({preview.rowCount})
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
