// src/components/gearbox/GearboxProblemModal.tsx
// VIKRSHIELD — Sdílený modal pro nahlášení problému / poruchy / podezření u převodovky.
// Používá se v GearboxesPage i AssetCardPage. Vytváří úkol přes createTask (ne work log).

import { useState } from 'react';
import { AlertTriangle, Loader2, Send, X } from 'lucide-react';
import { createTask } from '../../services/taskService';
import { showToast } from '../ui/Toast';
import type { Asset } from '../../types/asset';

type ProblemUser = { id?: string; uid?: string; displayName?: string } | null | undefined;

const GEARBOX_ISSUES: Array<{ id: string; label: string }> = [
  { id: 'noise', label: 'Neobvyklý zvuk' },
  { id: 'vibration', label: 'Vibrace' },
  { id: 'leak', label: 'Únik oleje' },
  { id: 'overheating', label: 'Přehřívání' },
  { id: 'other', label: 'Jiný problém' },
];

export default function GearboxProblemModal({ asset, user, onClose, onSaved }: {
  asset: Asset;
  user: ProblemUser;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [option, setOption] = useState('');
  const [priority, setPriority] = useState<'P1' | 'P2'>('P2');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    const trimmed = note.trim();
    if (saving || !option) return;
    if (option === 'Jiný problém' && !trimmed) {
      showToast('Popište prosím problém.', 'error');
      return;
    }
    setSaving(true);
    try {
      const description = [
        'Nahlášeno přes kartu převodovky.',
        `Problém: ${option}.`,
        asset.currentExtruderName ? `Extruder: ${asset.currentExtruderName}.` : '',
        trimmed ? `Poznámka: ${trimmed}.` : '',
      ].filter(Boolean).join(' ');

      await createTask({
        title: `Převodovka ${asset.name}: ${option}`,
        description,
        type: 'corrective',
        priority,
        source: 'web',
        sourceRefType: 'asset',
        sourceRefId: asset.id,
        assetId: asset.id,
        assetName: asset.name,
        buildingId: asset.buildingId,
        createdById: user?.id || user?.uid || 'unknown',
        createdByName: user?.displayName || 'Neznámý',
      });

      showToast('Problém s převodovkou nahlášen', 'success');
      onSaved();
    } catch (error) {
      console.error('[GearboxProblemModal] create task failed:', error);
      showToast('Hlášení se nepodařilo odeslat', 'error');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#fbf9f4]/35 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-[var(--vik-border)] bg-white text-slate-950 shadow-2xl sm:max-w-lg sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[var(--vik-border)] bg-white p-4">
          <div className="min-w-0">
            <div className="text-xs font-bold uppercase tracking-widest text-red-700">Nahlásit problém</div>
            <h3 className="mt-1 truncate text-lg font-black text-slate-950">{asset.name}</h3>
            <div className="text-sm text-slate-600">{asset.currentExtruderName || asset.location || 'Sklad ND'}</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-[var(--vik-border)] bg-[var(--vik-surface-2)] p-2 text-slate-600 hover:bg-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div>
            <div className="mb-2 text-sm font-black text-slate-950">Závažnost</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPriority('P2')}
                className={`min-h-12 rounded-xl border px-3 text-sm font-black ${
                  priority === 'P2' ? 'border-amber-300 bg-amber-100 text-amber-800' : 'border-[var(--vik-border)] bg-[var(--vik-surface-2)] text-slate-700'
                }`}
              >
                Závada / podezření (P2)
              </button>
              <button
                type="button"
                onClick={() => setPriority('P1')}
                className={`min-h-12 rounded-xl border px-3 text-sm font-black ${
                  priority === 'P1' ? 'border-red-300 bg-red-100 text-red-800' : 'border-[var(--vik-border)] bg-[var(--vik-surface-2)] text-slate-700'
                }`}
              >
                Porucha / havárie (P1)
              </button>
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm font-black text-slate-950">Co se děje</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {GEARBOX_ISSUES.map((issue) => (
                <button
                  key={issue.id}
                  type="button"
                  onClick={() => setOption(issue.label)}
                  className={`min-h-12 rounded-xl border px-3 text-sm font-black ${
                    option === issue.label ? 'border-red-300 bg-red-100 text-red-800' : 'border-[var(--vik-border)] bg-[var(--vik-surface-2)] text-slate-700'
                  }`}
                >
                  {issue.label}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-black text-slate-950">
              {option === 'Jiný problém' ? 'Popište problém' : 'Poznámka (volitelně)'}
            </span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Co se děje s převodovkou?"
              className="h-28 w-full resize-none rounded-xl border border-[var(--vik-border)] bg-[var(--vik-surface-2)] p-4 text-base text-slate-950 outline-none focus:border-red-400"
            />
          </label>

          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={saving || !option || (option === 'Jiný problém' && !note.trim())}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-base font-black text-white active:scale-[0.99] disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            Odeslat hlášení
          </button>

          <div className="flex items-start gap-2 text-xs text-slate-600">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            Vytvoří se úkol pro údržbu. Oprava se zapisuje zvlášť přes „Oprava / úprava“.
          </div>
        </div>
      </div>
    </div>
  );
}
