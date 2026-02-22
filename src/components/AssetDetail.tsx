import { ASSET_STATUS_CONFIG, ASSET_CATEGORY_CONFIG, CRITICALITY_CONFIG } from '../types/asset';
import { ROOMS, BUILDINGS } from '../data/factory';
import type { Asset } from '../types/asset';

interface AssetDetailProps {
  asset: Omit<Asset, 'createdAt' | 'updatedAt'>;
  onClose: () => void;
  onReportIssue?: () => void;
}

export const AssetDetail = ({ asset, onClose, onReportIssue }: AssetDetailProps) => {
  const statusConfig = ASSET_STATUS_CONFIG[asset.status];
  const categoryConfig = ASSET_CATEGORY_CONFIG[asset.category || 'other'];
  const criticalityConfig = CRITICALITY_CONFIG[asset.criticality];
  const room = ROOMS.find(r => r.id === asset.roomId);
  const building = BUILDINGS.find(b => b.id === asset.buildingId);

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-slate-900 w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-slate-900 border-b border-slate-700 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{categoryConfig.icon}</span>
            <div>
              <h2 className="text-white font-bold">{asset.name}</h2>
              <p className="text-slate-400 text-sm">{asset.code}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            <span className={`px-3 py-1 rounded-full text-sm text-white ${statusConfig.color}`}>
              {statusConfig.icon} {statusConfig.label}
            </span>
            <span className={`px-3 py-1 rounded-full text-sm text-white ${criticalityConfig.color}`}>
              {criticalityConfig.label}
            </span>
            <span className="px-3 py-1 rounded-full text-sm text-white bg-slate-700">
              {categoryConfig.label}
            </span>
          </div>

          <div className="bg-slate-800 rounded-xl p-4">
            <h3 className="text-white font-semibold mb-2">📍 Umístění</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-slate-400">Budova:</span>
                <span className="text-white ml-2">{building?.name}</span>
              </div>
              <div>
                <span className="text-slate-400">Místnost:</span>
                <span className="text-white ml-2">{room?.name}</span>
              </div>
            </div>
          </div>

          {(asset.manufacturer || asset.model || asset.serialNumber) && (
            <div className="bg-slate-800 rounded-xl p-4">
              <h3 className="text-white font-semibold mb-2">�icing Výrobní údaje</h3>
              <div className="space-y-1 text-sm">
                {asset.manufacturer && (
                  <div>
                    <span className="text-slate-400">Výrobce:</span>
                    <span className="text-white ml-2">{asset.manufacturer}</span>
                  </div>
                )}
                {asset.model && (
                  <div>
                    <span className="text-slate-400">Model:</span>
                    <span className="text-white ml-2">{asset.model}</span>
                  </div>
                )}
                {asset.serialNumber && (
                  <div>
                    <span className="text-slate-400">S/N:</span>
                    <span className="text-white ml-2 font-mono">{asset.serialNumber}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {asset.mthCounter !== undefined && (
            <div className="bg-slate-800 rounded-xl p-4">
              <h3 className="text-white font-semibold mb-2">⏱️ Motohodiny</h3>
              <div className="text-3xl font-bold text-green-400">
                {asset.mthCounter.toLocaleString()} <span className="text-lg text-slate-400">Mth</span>
              </div>
            </div>
          )}

          {asset.notes && (
            <div className="bg-amber-500/20 border border-amber-500/50 rounded-xl p-4">
              <h3 className="text-amber-400 font-semibold mb-1">📝 Poznámka</h3>
              <p className="text-white text-sm">{asset.notes}</p>
            </div>
          )}

          <div className="bg-slate-800 rounded-xl p-4 flex items-center justify-center">
            <div className="text-center">
              <div className="w-24 h-24 bg-white rounded-lg mx-auto mb-2 flex items-center justify-center">
                <span className="text-4xl">📱</span>
              </div>
              <p className="text-slate-400 text-sm">QR kód: {asset.code}</p>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 bg-slate-900 border-t border-slate-700 p-4 flex gap-3">
          <button
            onClick={onReportIssue}
            className="flex-1 bg-red-500 hover:bg-red-600 text-white py-3 rounded-xl font-semibold transition-colors"
          >
            🔧 Nahlásit poruchu
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-xl font-semibold transition-colors"
          >
            Zavřít
          </button>
        </div>
      </div>
    </div>
  );
};

export default AssetDetail;
