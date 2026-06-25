// src/components/audit/LogWorkSheet.tsx
// VIKRR — Asset Shield — Sdílený panel „Zápis práce".
// Otevře se po kliknutí na „hotovo / zapsat" u kontroly (kalibrace, klimatizace, sklo, detektor).
// Zaznamená co/kdo/kdy → volající uloží do Deníku (workLogs) + posune termín. Auditní stopa.

import { useState } from 'react';
import BottomSheet from '../ui/BottomSheet';

export interface WorkEntry { content: string; worker: string; performedAt: string }

export default function LogWorkSheet({
  subtitle,
  defaultWorker,
  saving,
  onClose,
  onSubmit,
}: {
  subtitle: string;
  defaultWorker: string;
  saving?: boolean;
  onClose: () => void;
  onSubmit: (entry: WorkEntry) => void;
}) {
  const [content, setContent] = useState('');
  const [worker, setWorker] = useState(defaultWorker);
  const [performedAt, setPerformedAt] = useState(() => new Date().toISOString().slice(0, 10));

  return (
    <BottomSheet title="Zápis práce" isOpen onClose={onClose}>
      <div className="space-y-4 p-1">
        <div className="text-[13px] font-semibold text-slate-500">{subtitle}</div>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-600">Co bylo uděláno / výsledek</span>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            placeholder="např. zkalibrováno, odchylka 0,2 °C, certifikát č. 2026-014…"
            className="vik-input w-full resize-none"
          />
        </label>

        <div className="flex gap-3">
          <label className="block flex-1">
            <span className="mb-1.5 block text-sm font-medium text-slate-600">Provedl(a)</span>
            <input value={worker} onChange={(e) => setWorker(e.target.value)} className="vik-input w-full" />
          </label>
          <label className="block flex-1">
            <span className="mb-1.5 block text-sm font-medium text-slate-600">Datum</span>
            <input type="date" value={performedAt} onChange={(e) => setPerformedAt(e.target.value)} className="vik-input w-full" />
          </label>
        </div>

        <div className="flex gap-2 pt-1">
          <button type="button" className="vik-button flex-1" onClick={onClose}>Zrušit</button>
          <button
            type="button"
            disabled={saving}
            onClick={() => onSubmit({ content: content.trim(), worker: worker.trim() || defaultWorker, performedAt })}
            className="flex-[2] rounded-xl bg-emerald-600 py-2.5 font-bold text-white disabled:opacity-50"
          >
            {saving ? 'Ukládám…' : 'Zapsat práci'}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
