// src/components/gearbox/GearboxRepairModal.tsx
// VIKRSHIELD — Sdílený modal pro zápis opravy / úpravy / kontroly převodovky.
// Používá se v modulu převodovek. Zapisuje work log přes addWorkLog.

import { useState } from 'react';
import { Loader2, Wrench, X } from 'lucide-react';
import { addWorkLog } from '../../services/workLogService';
import { showToast } from '../ui/Toast';
import type { Asset } from '../../types/asset';

type RepairUser = { id?: string; uid?: string; displayName?: string } | null | undefined;

export default function GearboxRepairModal({ asset, user, onClose, onSaved }: {
  asset: Asset;
  user: RepairUser;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<'repair' | 'adjustment' | 'check'>('repair');
  const [performedAt, setPerformedAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const typeLabel = type === 'repair' ? 'Oprava' : type === 'adjustment' ? 'Úprava' : 'Kontrola';
  const workLogType = type === 'repair' ? 'repair' : type === 'adjustment' ? 'maintenance' : 'inspection';

  const repairOptions: Array<{ id: 'repair' | 'adjustment' | 'check'; label: string }> = [
    { id: 'repair', label: 'Oprava' },
    { id: 'adjustment', label: 'Úprava' },
    { id: 'check', label: 'Kontrola' },
  ];

  const handleSave = async () => {
    const trimmed = note.trim();
    if (saving || !trimmed || !performedAt) return;
    setSaving(true);
    try {
      const location = asset.currentExtruderName || asset.location || undefined;
      await addWorkLog({
        userId: user?.id || user?.uid || 'unknown',
        userName: user?.displayName || 'Neznámý',
        workerNames: user?.displayName ? [user.displayName] : undefined,
        type: workLogType,
        workType: 'gearbox_repair',
        content: [
          `${typeLabel} převodovky: ${asset.name}`,
          asset.currentExtruderName ? `Extruder: ${asset.currentExtruderName}` : '',
          trimmed,
        ].filter(Boolean).join('\n'),
        assetId: asset.id,
        assetName: asset.name,
        location,
        performedAt: new Date(performedAt),
        auditReady: true,
      });
      showToast('Zápis údržby uložen', 'success');
      onSaved();
    } catch (error) {
      console.error('[GearboxRepairModal] repair log failed:', error);
      showToast('Zápis se nepodařilo uložit', 'error');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-white/10 bg-slate-950 text-slate-100 shadow-2xl sm:max-w-lg sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-white/10 bg-slate-950/95 p-4 backdrop-blur">
          <div className="min-w-0">
            <div className="text-xs font-bold uppercase tracking-widest text-amber-300">Oprava / úprava</div>
            <h3 className="mt-1 truncate text-lg font-black text-white">{asset.name}</h3>
            <div className="text-sm text-slate-400">{asset.currentExtruderName || asset.location || 'Sklad ND'}</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-white/10 p-2 text-slate-300 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div>
            <div className="mb-2 text-sm font-black text-white">Typ záznamu</div>
            <div className="grid grid-cols-3 gap-2">
              {repairOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setType(option.id)}
                  className={`min-h-12 rounded-xl border px-3 text-sm font-black ${
                    type === option.id
                      ? 'border-amber-400/60 bg-amber-500/20 text-white'
                      : 'border-white/10 bg-white/[0.04] text-slate-300'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-black text-white">Datum a čas</span>
            <input
              type="datetime-local"
              value={performedAt}
              onChange={(event) => setPerformedAt(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-base text-white outline-none focus:border-amber-400"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-black text-white">Co bylo provedeno</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Popis opravy / úpravy / kontroly převodovky"
              className="h-32 w-full resize-none rounded-xl border border-white/10 bg-slate-900 p-4 text-base text-white outline-none focus:border-amber-400"
            />
          </label>

          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !note.trim() || !performedAt}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 text-base font-black text-white active:scale-[0.99] disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Wrench className="h-5 w-5" />}
            Uložit zápis
          </button>
        </div>
      </div>
    </div>
  );
}
