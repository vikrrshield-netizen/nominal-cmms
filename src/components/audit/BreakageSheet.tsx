// src/components/audit/BreakageSheet.tsx
// VIKRR — Asset Shield — Panel „Záznam rozbití" (sklo / křehký plast; IFS/BRCGS 4.9).
// Auditní záznam incidentu: co se rozbilo, kdy, kdo řešil, co se stalo a jaká opatření
// proběhla. Volající uloží do Deníku (workLogs) — žádný nový datový model ani rules.

import { useMemo, useState } from 'react';
import BottomSheet from '../ui/BottomSheet';
import type { Asset } from '../../types/asset';

export interface BreakageEntry {
  assetId?: string;
  assetName: string;
  when: Date;
  solver: string;
  description: string;
  measures: string[];
}

// Opatření podle auditní praxe (IFS/BRC breakage procedure) — zaškrtává se, co proběhlo.
export const BREAKAGE_MEASURES = [
  'úklid střepů proveden',
  'okolní produkt zkontrolován',
  'produkt zablokován / zlikvidován',
  'prvek vyměněn / opraven',
  'výroba zastavena',
] as const;

const OTHER = '__other__';

// datetime-local chce lokální čas bez zóny (YYYY-MM-DDTHH:mm).
const nowLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

export default function BreakageSheet({
  items,
  defaultSolver,
  saving,
  onClose,
  onSubmit,
}: {
  items: Asset[];
  defaultSolver: string;
  saving?: boolean;
  onClose: () => void;
  onSubmit: (entry: BreakageEntry) => void;
}) {
  const [picked, setPicked] = useState<string>(items[0]?.id ?? OTHER);
  const [customName, setCustomName] = useState('');
  const [when, setWhen] = useState(nowLocal);
  const [solver, setSolver] = useState(defaultSolver);
  const [description, setDescription] = useState('');
  const [measures, setMeasures] = useState<Set<string>>(new Set());

  const pickedAsset = useMemo(() => items.find((a) => a.id === picked), [items, picked]);
  const assetName = picked === OTHER ? customName.trim() : (pickedAsset?.name ?? '');
  const canSave = !!assetName && !!description.trim();

  const toggle = (m: string) =>
    setMeasures((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m); else next.add(m);
      return next;
    });

  return (
    <BottomSheet title="Záznam rozbití" isOpen onClose={onClose}>
      <div className="space-y-4 p-1">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-600">Co se rozbilo</span>
          <select value={picked} onChange={(e) => setPicked(e.target.value)} className="vik-input w-full">
            {items.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}{a.buildingId ? ` · Budova ${a.buildingId}` : ''}
              </option>
            ))}
            <option value={OTHER}>Jiné (napíšu ručně)…</option>
          </select>
        </label>
        {picked === OTHER && (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-600">Název prvku</span>
            <input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="např. sklenice ve svačinárně" className="vik-input w-full" />
          </label>
        )}

        <div className="flex gap-3">
          <label className="block flex-1">
            <span className="mb-1.5 block text-sm font-medium text-slate-600">Kdy</span>
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="vik-input w-full" />
          </label>
          <label className="block flex-1">
            <span className="mb-1.5 block text-sm font-medium text-slate-600">Řešil(a)</span>
            <input value={solver} onChange={(e) => setSolver(e.target.value)} className="vik-input w-full" />
          </label>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-600">Co se stalo</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="např. prasklý průzor při čištění, střepy zůstaly v rámu…"
            className="vik-input w-full resize-none"
          />
        </label>

        <div>
          <span className="mb-1.5 block text-sm font-medium text-slate-600">Opatření (zaškrtni, co proběhlo)</span>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {BREAKAGE_MEASURES.map((m) => (
              <label key={m} className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-700 has-[:checked]:border-red-300 has-[:checked]:bg-red-50">
                <input type="checkbox" checked={measures.has(m)} onChange={() => toggle(m)} className="h-4 w-4 accent-red-600" />
                {m}
              </label>
            ))}
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button type="button" className="vik-button flex-1" onClick={onClose}>Zrušit</button>
          <button
            type="button"
            disabled={saving || !canSave}
            onClick={() =>
              onSubmit({
                assetId: picked === OTHER ? undefined : picked,
                assetName,
                when: new Date(when),
                solver: solver.trim() || defaultSolver,
                description: description.trim(),
                measures: [...measures],
              })
            }
            className="flex-[2] rounded-xl bg-red-600 py-2.5 font-bold text-white disabled:opacity-50"
          >
            {saving ? 'Ukládám…' : 'Zapsat rozbití'}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
