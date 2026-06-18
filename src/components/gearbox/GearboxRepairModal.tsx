// src/components/gearbox/GearboxRepairModal.tsx
// VIKRSHIELD — Sdílený modal pro zápis opravy / úpravy / kontroly převodovky.
// Používá se v GearboxesPage i AssetCardPage. Zapisuje work log přes addWorkLog.

import { useState } from 'react';
import { Loader2, Wrench } from 'lucide-react';
import { addWorkLog } from '../../services/workLogService';
import { showToast } from '../ui/Toast';
import BottomSheet from '../ui/BottomSheet';
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
          `${typeLabel}: ${asset.name}`,
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
    <BottomSheet title="Zápis do historie" isOpen onClose={onClose}>
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <span className="font-black text-slate-950">{asset.name}</span>
            <span className="text-slate-600"> · {asset.currentExtruderName || asset.location || 'Sklad ND'}</span>
          </div>
          <div>
            <div className="mb-2 text-sm font-black text-slate-950">Typ záznamu</div>
            <div className="grid grid-cols-3 gap-2">
              {repairOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setType(option.id)}
                  className={`min-h-12 rounded-xl border px-3 text-sm font-black ${
                    type === option.id
                      ? 'border-amber-300 bg-amber-100 text-amber-800'
                      : 'border-[var(--vik-border)] bg-[var(--vik-surface-2)] text-slate-700'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-black text-slate-950">Datum a čas</span>
            <input
              type="datetime-local"
              value={performedAt}
              onChange={(event) => setPerformedAt(event.target.value)}
              className="w-full rounded-xl border border-[var(--vik-border)] bg-[var(--vik-surface-2)] px-4 py-3 text-base text-slate-950 outline-none focus:border-amber-400"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-black text-slate-950">Co bylo provedeno</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Popis opravy / úpravy / kontroly zařízení"
              className="h-32 w-full resize-none rounded-xl border border-[var(--vik-border)] bg-[var(--vik-surface-2)] p-4 text-base text-slate-950 outline-none focus:border-amber-400"
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
    </BottomSheet>
  );
}
