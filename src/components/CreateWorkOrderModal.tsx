import { useState } from 'react';
import { X } from 'lucide-react';
import { useAuthContext } from '../context/AuthContext';
import { SAMPLE_ASSETS } from '../data/sampleAssets';
import { addWorkOrder } from '../services/workOrderService';
import type { WOPriority, WOType } from '../types/workOrder';
import { WO_PRIORITY_CONFIG, WO_TYPE_CONFIG } from '../types/workOrder';

interface CreateWorkOrderModalProps {
  onClose: () => void;
  preselectedAssetId?: string;
}

const priorityClass: Record<WOPriority, string> = {
  P1: 'bg-red-50 border-red-200 text-red-700',
  P2: 'bg-orange-50 border-orange-200 text-orange-700',
  P3: 'bg-sky-50 border-sky-200 text-sky-700',
  P4: 'bg-stone-100 border-stone-200 text-slate-700',
};

const CreateWorkOrderModal = ({ onClose, preselectedAssetId }: CreateWorkOrderModalProps) => {
  const { user } = useAuthContext();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<WOType>('breakdown');
  const [priority, setPriority] = useState<WOPriority>('P2');
  const [selectedAssetId, setSelectedAssetId] = useState(preselectedAssetId || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('Zadej název');
      return;
    }
    if (!selectedAssetId) {
      setError('Vyber stroj');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const asset = SAMPLE_ASSETS.find((a) => a.id === selectedAssetId);

      await addWorkOrder({
        title: title.trim(),
        description: description.trim(),
        type,
        priority,
        assetId: selectedAssetId,
        roomId: asset?.roomId || '',
        buildingId: asset?.buildingId || '',
        reportedBy: user?.id || '',
        reportedByName: user?.displayName || 'Neznámý',
      });

      onClose();
    } catch (err) {
      setError('Nepodařilo se vytvořit úkol');
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl border border-stone-200 bg-white text-slate-950 shadow-2xl sm:max-w-lg sm:rounded-3xl">
        <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-stone-200 sm:hidden" />
        <div className="sticky top-0 flex items-center justify-between border-b border-stone-200 bg-white px-5 py-4">
          <h2 className="text-lg font-black text-slate-950">Nová porucha</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-slate-500 transition hover:bg-stone-200 active:scale-90"
            aria-label="Zavřít"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3">
              <p className="text-sm font-semibold text-red-700">{error}</p>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-600">Typ</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(WO_TYPE_CONFIG) as [WOType, { label: string; icon: string }][]).map(([key, config]) => (
                <button
                  type="button"
                  key={key}
                  onClick={() => setType(key)}
                  className={`rounded-xl border-2 p-3 text-left transition-all ${
                    type === key
                      ? 'border-emerald-600 bg-emerald-50 text-slate-950'
                      : 'border-stone-200 bg-white text-slate-600 hover:border-emerald-200'
                  }`}
                >
                  <span className="text-sm font-bold">{config.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-600">Priorita</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(WO_PRIORITY_CONFIG) as [WOPriority, { label: string; color: string; description: string }][]).map(([key, config]) => (
                <button
                  type="button"
                  key={key}
                  onClick={() => setPriority(key)}
                  className={`rounded-xl border-2 p-3 text-left transition-all ${
                    priority === key
                      ? priorityClass[key]
                      : 'border-stone-200 bg-white text-slate-600 hover:border-orange-200'
                  }`}
                >
                  <div className="text-sm font-bold">{config.label}</div>
                  <div className="text-xs opacity-70">{config.description}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-600">Stroj</label>
            <select
              value={selectedAssetId}
              onChange={(event) => setSelectedAssetId(event.target.value)}
              className="w-full rounded-xl border-2 border-stone-200 bg-stone-50 px-4 py-3 text-slate-950 outline-none focus:border-emerald-600"
            >
              <option value="">Vyber stroj...</option>
              {SAMPLE_ASSETS.map((asset) => (
                <option key={asset.id} value={asset.id}>{asset.name} ({asset.code})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-600">Název</label>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Krátký popis problému..."
              className="w-full rounded-xl border-2 border-stone-200 bg-stone-50 px-4 py-3 text-slate-950 placeholder-slate-500 outline-none focus:border-emerald-600"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-600">Popis (volitelný)</label>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Podrobný popis..."
              rows={3}
              className="w-full resize-none rounded-xl border-2 border-stone-200 bg-stone-50 px-4 py-3 text-slate-950 placeholder-slate-500 outline-none focus:border-emerald-600"
            />
          </div>
        </div>

        <div className="sticky bottom-0 flex flex-col-reverse gap-3 border-t border-stone-200 bg-white px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="min-h-12 rounded-xl border border-stone-200 bg-stone-50 px-5 py-3 font-bold text-slate-700 transition hover:bg-white active:scale-[0.98] disabled:opacity-50 sm:flex-1"
          >
            Zrušit
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="min-h-12 rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white shadow-[0_4px_0_#134E3A] transition hover:bg-emerald-600 active:translate-y-1 active:shadow-none disabled:opacity-50 sm:flex-1"
          >
            {isSubmitting ? 'Ukládám...' : 'Vytvořit'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateWorkOrderModal;
