import { useState } from 'react';
import { SAMPLE_ASSETS } from '../data/sampleAssets';
import { ASSET_STATUS_CONFIG, ASSET_CATEGORY_CONFIG, CRITICALITY_CONFIG } from '../types/asset';
import type { Asset, AssetStatus } from '../types/asset';

interface AssetListProps {
  filterRoomId?: string | null;
  filterBuildingId?: string | null;
  onAssetSelect?: (asset: Omit<Asset, 'createdAt' | 'updatedAt'>) => void;
}

export const AssetList = ({ filterRoomId, filterBuildingId, onAssetSelect }: AssetListProps) => {
  const [statusFilter, setStatusFilter] = useState<AssetStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredAssets = SAMPLE_ASSETS.filter(asset => {
    if (filterRoomId && asset.roomId !== filterRoomId) return false;
    if (filterBuildingId && asset.buildingId !== filterBuildingId) return false;
    if (statusFilter !== 'all' && asset.status !== statusFilter) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        asset.name.toLowerCase().includes(query) ||
        asset.code.toLowerCase().includes(query) ||
        asset.manufacturer?.toLowerCase().includes(query)
      );
    }
    return true;
  });

  const statusCounts = {
    operational: SAMPLE_ASSETS.filter(a => a.status === 'operational').length,
    maintenance: SAMPLE_ASSETS.filter(a => a.status === 'maintenance').length,
    broken: SAMPLE_ASSETS.filter(a => a.status === 'broken').length,
  };

  return (
    <div className="space-y-4">
      {/* Statistiky */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-green-500/20 border border-green-500/50 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-green-400">{statusCounts.operational}</div>
          <div className="text-xs text-green-400/70">V provozu</div>
        </div>
        <div className="bg-amber-500/20 border border-amber-500/50 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-amber-400">{statusCounts.maintenance}</div>
          <div className="text-xs text-amber-400/70">Údržba</div>
        </div>
        <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-red-400">{statusCounts.broken}</div>
          <div className="text-xs text-red-400/70">Porucha</div>
        </div>
      </div>

      {/* Vyhledávání */}
      <div className="relative">
        <input
          type="text"
          placeholder="Hledat stroj..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 pl-10 text-white placeholder-slate-500 focus:outline-none focus:border-green-500"
        />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">🔍</span>
      </div>

      {/* Filtry */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        <button
          onClick={() => setStatusFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-all ${
            statusFilter === 'all' 
              ? 'bg-green-500 text-white' 
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          Vše
        </button>
        {(['operational', 'maintenance', 'broken'] as AssetStatus[]).map(status => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-all flex items-center gap-1 ${
              statusFilter === status 
                ? `${ASSET_STATUS_CONFIG[status].color} text-white` 
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            {ASSET_STATUS_CONFIG[status].icon} {ASSET_STATUS_CONFIG[status].label}
          </button>
        ))}
      </div>

      {/* Seznam strojů */}
      <div className="space-y-2">
        {filteredAssets.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            Žádné stroje nenalezeny
          </div>
        ) : (
          filteredAssets.map((asset) => {
            const statusConfig = ASSET_STATUS_CONFIG[asset.status];
            const categoryConfig = ASSET_CATEGORY_CONFIG[asset.category];
            const criticalityConfig = CRITICALITY_CONFIG[asset.criticality];
            
            return (
              <button
                key={asset.id}
                onClick={() => onAssetSelect?.(asset)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-4 text-left hover:border-slate-600 transition-all active:scale-98"
              >
                <div className="flex items-start gap-3">
                  <div className="text-2xl">{categoryConfig.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-semibold truncate">{asset.name}</span>
                      <span className={`w-2 h-2 rounded-full ${statusConfig.color}`}></span>
                    </div>
                    <div className="text-sm text-slate-400">{asset.code}</div>
                    {asset.manufacturer && (
                      <div className="text-xs text-slate-500 mt-1">
                        {asset.manufacturer} {asset.model}
                      </div>
                    )}
                    {asset.mthCounter !== undefined && (
                      <div className="text-xs text-slate-500 mt-1">
                        ⏱️ {asset.mthCounter.toLocaleString()} Mth
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-xs px-2 py-0.5 rounded ${statusConfig.color} text-white`}>
                      {statusConfig.label}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded ${criticalityConfig.color} text-white`}>
                      {criticalityConfig.label}
                    </span>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};

export default AssetList;
