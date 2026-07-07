// src/components/kartoteka/AiImportSheet.tsx
// Import kartotéky z Excelu PŘES AI: soubor se přečte v prohlížeči, data dostane
// AI asistent (assistantChat) a sám navrhne strukturu budovy → místnosti → stroje
// (create_asset_tree). Nic se nezapíše bez potvrzení uživatele (Ano/Ne).

import { useMemo, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { FileSpreadsheet, Loader2, Sparkles, Upload } from 'lucide-react';
import { functions } from '../../lib/firebase';
import { parseExcelFile, type ParseResult } from '../../utils/importers/excelImporter';
import { useConfirm } from '../../hooks/useConfirm';
import { showToast } from '../ui/Toast';
import BottomSheet from '../ui/BottomSheet';

type PendingAction = { id: string; type: string; summary: string; danger?: boolean };
type ChatReply = { reply: string; pendingActions?: PendingAction[] };

const MAX_ROWS = 250; // strop dat pro AI (víc řádků → importovat po částech)
const MAX_CELL = 80;

// Excel → jednoduchá textová tabulka (TSV) pro AI.
function toTsv(parsed: ParseResult): { text: string; sent: number; total: number } {
  const clean = (v: unknown) => String(v ?? '').replace(/[\t\r\n]+/g, ' ').trim().slice(0, MAX_CELL);
  const rows = parsed.rows.slice(0, MAX_ROWS);
  const lines = [
    parsed.columns.map(clean).join('\t'),
    ...rows.map((r) => parsed.columns.map((c) => clean(r[c])).join('\t')),
  ];
  return { text: lines.join('\n'), sent: rows.length, total: parsed.rows.length };
}

function buildPrompt(tsv: { text: string; sent: number; total: number }, fileName: string): string {
  return [
    `Posílám data z Excelu „${fileName}" (${tsv.sent} řádků${tsv.total > tsv.sent ? ` z ${tsv.total} — zbytek pošlu v dalším kole` : ''}; první řádek = hlavičky, sloupce oddělené tabulátorem).`,
    'Rozřaď je do struktury BUDOVA → MÍSTNOST → STROJ podle logiky názvů a sloupců (budova/hala/místnost/úsek/umístění apod.) a navrhni založení přes create_asset_tree.',
    'Pravidla: stroje bez jasné místnosti dej přímo do budovy; bez jasné budovy nech jako samostatné stroje a napiš mi to. Vyplň code, manufacturer, model, serialNumber a year, když pro ně data jsou. Zjevné duplicity (stejný kód dvakrát) vynech a zmiň to.',
    'Nakonec stručně shrň, co jsi kam zařadil a čím si nejsi jistý.',
    '',
    tsv.text,
  ].join('\n');
}

interface AiImportSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onImported: () => void; // po úspěšném založení → refresh kartotéky
}

export default function AiImportSheet({ isOpen, onClose, onImported }: AiImportSheetProps) {
  const { ask } = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [busy, setBusy] = useState<'parse' | 'ai' | 'confirm' | null>(null);
  const [reply, setReply] = useState('');
  const [pending, setPending] = useState<PendingAction[]>([]);
  const [error, setError] = useState('');

  const chatCallable = useMemo(
    () => httpsCallable<{ message: string; history: { role: string; content: string }[] }, ChatReply>(functions, 'assistantChat'),
    [],
  );
  const confirmCallable = useMemo(
    () => httpsCallable<{ pendingId: string }, { reply: string }>(functions, 'assistantConfirmAction'),
    [],
  );

  const reset = () => {
    setFileName(''); setParsed(null); setReply(''); setPending([]); setError(''); setBusy(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleClose = () => { if (!busy) { reset(); onClose(); } };

  const handleFile = async (file: File) => {
    setBusy('parse'); setError(''); setReply(''); setPending([]);
    try {
      const p = await parseExcelFile(file);
      if (!p.rows.length) throw new Error('Soubor neobsahuje žádné datové řádky.');
      setParsed(p);
      setFileName(file.name);
    } catch (err) {
      setError((err as Error).message);
      setParsed(null);
    }
    setBusy(null);
  };

  const askAi = async () => {
    if (!parsed) return;
    setBusy('ai'); setError(''); setReply(''); setPending([]);
    try {
      const tsv = toTsv(parsed);
      const res = await chatCallable({ message: buildPrompt(tsv, fileName), history: [] });
      setReply(res.data?.reply || 'Nepřišla odpověď — zkus to znovu.');
      setPending(Array.isArray(res.data?.pendingActions) ? res.data.pendingActions : []);
    } catch (err) {
      console.error('[AI import] chat error:', err);
      setError('AI se nepodařilo zavolat. Zkus to za chvíli znovu.');
    }
    setBusy(null);
  };

  const runPending = async (action: PendingAction) => {
    const ok = await ask({
      title: 'Založit do Kartotéky?',
      message: action.summary || 'Provést tento import?',
      confirmText: 'Ano, založit',
      cancelText: 'Ne',
      danger: !!action.danger,
    });
    if (!ok) return;
    setBusy('confirm');
    try {
      const res = await confirmCallable({ pendingId: action.id });
      showToast(res.data?.reply || '✅ Založeno.', 'success');
      setPending((prev) => prev.filter((p) => p.id !== action.id));
      onImported();
      reset();
      onClose();
    } catch (err) {
      console.error('[AI import] confirm error:', err);
      showToast('Založení se nepovedlo — zkus to znovu.', 'error');
    }
    setBusy(null);
  };

  if (!isOpen) return null;

  return (
    <BottomSheet title="Import s AI" isOpen onClose={handleClose}>
      <div className="space-y-3 p-1">
        <p className="text-[13px] leading-relaxed text-slate-600">
          Vyber Excel (.xlsx/.csv) s libovolnými sloupci. AI sama pozná, co je budova,
          místnost a stroj, a navrhne zařazení. <strong>Nic se nezaloží bez tvého potvrzení.</strong>
        </p>

        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.csv"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
        />
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => fileRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-white px-4 py-4 text-[14px] font-bold text-slate-700 hover:border-emerald-400 disabled:opacity-50"
        >
          {busy === 'parse' ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
          {fileName ? 'Vybrat jiný soubor' : 'Vybrat soubor'}
        </button>

        {parsed && (
          <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] font-semibold text-slate-700">
            <FileSpreadsheet size={18} className="shrink-0 text-emerald-700" />
            <span className="min-w-0 flex-1 truncate">{fileName}</span>
            <span className="shrink-0 text-slate-500">{parsed.rows.length} řádků</span>
          </div>
        )}
        {parsed && parsed.rows.length > MAX_ROWS && (
          <p className="text-[12px] text-amber-700">
            ⚠️ AI dostane prvních {MAX_ROWS} řádků — zbytek naimportuj v dalším kole (rozděl soubor).
          </p>
        )}

        {parsed && !reply && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void askAi()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-[14px] font-bold text-white disabled:opacity-50"
          >
            {busy === 'ai' ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
            {busy === 'ai' ? 'AI přemýšlí…' : 'Nechat AI rozřadit'}
          </button>
        )}

        {reply && (
          <div className="max-h-[40vh] overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[13px] leading-relaxed text-slate-800">
            {reply.replace(/\*\*/g, '')}
          </div>
        )}

        {pending.map((action) => (
          <button
            key={action.id}
            type="button"
            disabled={busy !== null}
            onClick={() => void runPending(action)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-[14px] font-bold text-white disabled:opacity-50"
          >
            {busy === 'confirm' ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
            Potvrdit založení (Ano/Ne)
          </button>
        ))}

        {reply && !pending.length && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void askAi()}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-bold text-slate-700"
          >
            Zkusit znovu
          </button>
        )}

        {error && <p className="text-[13px] font-semibold text-red-700">{error}</p>}
      </div>
    </BottomSheet>
  );
}
