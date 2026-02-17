import { useState } from 'react';
import { useAuthContext } from '../context/AuthContext';
import { SAMPLE_ASSETS } from '../data/sampleAssets';
import { addWorkOrder } from '../services/workOrderService';
import type { WOPriority, WOType } from '../types/workOrder';
import { WO_PRIORITY_CONFIG, WO_TYPE_CONFIG } from '../types/workOrder';

interface CreateWorkOrderModalProps {
  onClose: () => void;
  preselectedAssetId?: string;
}

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
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-slate-900 w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-slate-900 border-b border-slate-700 px-4 py-3 flex items-center justify-between">
          <h2 className="text-white font-bold text-lg">🔧 Nová porucha</h2>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-4">
          {error && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-3">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-slate-400 text-sm mb-1">Typ</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(WO_TYPE_CONFIG) as [WOType, { label: string; icon: string }][]).map(([key, config]) => (
                <button
                  key={key}
                  onClick={() => setType(key)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    type === key
                      ? 'bg-green-500/20 border-green-500 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  <span className="text-xl mr-2">{config.icon}</span>
                  <span className="text-sm">{config.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-slate-400 text-sm mb-1">Priorita</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(WO_PRIORITY_CONFIG) as [WOPriority, { label: string; color: string; description: string }][]).map(([key, config]) => (
                <button
                  key={key}
                  onClick={() => setPriority(key)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    priority === key
                      ? `${config.color} border-transparent text-white`
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  <div className="font-medium text-sm">{config.label}</div>
                  <div className="text-xs opacity-70">{config.description}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-slate-400 text-sm mb-1">Stroj</label>
            <select
              value={selectedAssetId}
              onChange={(e) => setSelectedAssetId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-green-500"
            >
              <option value="">Vyber stroj...</option>
              {SAMPLE_ASSETS.map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.code})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-400 text-sm mb-1">Název</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Krátký popis problému..."
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-green-500"
            />
          </div>

          <div>
            <label className="block text-slate-400 text-sm mb-1">Popis (volitelné)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Podrobný popis..."
              rows={3}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-green-500 resize-none"
            />
          </div>
        </div>

        <div className="sticky bottom-0 bg-slate-900 border-t border-slate-700 p-4 flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1 bg-green-500 hover:bg-green-600 disabled:bg-green-500/50 text-white py-3 rounded-xl font-semibold transition-colors"
          >
            {isSubmitting ? 'Ukládám...' : 'Vytvořit'}
          </button>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-xl font-semibold transition-colors"
          >
            Zrušit
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateWorkOrderModal;
