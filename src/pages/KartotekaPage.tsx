import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, Search, Upload } from 'lucide-react';
import { useAuthContext } from '../context/AuthContext';
import { assetService } from '../services/assetService';
import { importAssets } from '../utils/importers/importAssets';
import type { Asset } from '../types/asset';
import AssetTreeNode from '../components/AssetTreeNode';
import ImportModal from '../components/ui/ImportModal';
import './KartotekaPage.css';

type FilterKey = 'all' | 'broken' | 'maintenance' | 'stopped' | 'operational';

function collectAncestorIds(assetId: string, allAssets: Asset[]): string[] {
  const ids: string[] = [];
  let current = allAssets.find((a) => a.id === assetId);
  while (current?.parentId) {
    ids.push(current.parentId);
    current = allAssets.find((a) => a.id === current!.parentId);
  }
  return ids;
}

export default function KartotekaPage() {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const tenantId = user?.tenantId ?? '';

  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    assetService
      .getAll(tenantId)
      .then((data) => {
        if (!cancelled) setAssets(data);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [tenantId]);

  // Reload assets after import
  const reloadAssets = () => {
    if (!tenantId) return;
    setLoading(true);
    assetService.getAll(tenantId)
      .then(setAssets)
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  };

  // Handle Excel import via ImportModal
  const handleImport = async (rows: Record<string, unknown>[]) => {
    const result = await importAssets(rows, tenantId);
    // Reload tree after successful import
    if (result.imported > 0) {
      reloadAssets();
    }
    return result;
  };

  const counts = useMemo(() => ({
    total: assets.length,
    operational: assets.filter((a) => a.status === 'operational').length,
    maintenance: assets.filter((a) => a.status === 'maintenance').length,
    broken: assets.filter((a) => a.status === 'broken').length,
    stopped: assets.filter((a) => a.status === 'stopped').length,
  }), [assets]);

  const { visibleAssets, visibleIds } = useMemo(() => {
    let matching = assets;

    if (search.trim()) {
      const q = search.toLowerCase();
      matching = matching.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.entityType.toLowerCase().includes(q)
      );
    }

    if (filter !== 'all') {
      matching = matching.filter((a) => a.status === filter);
    }

    if (search.trim() || filter !== 'all') {
      const idSet = new Set<string>();
      for (const a of matching) {
        idSet.add(a.id);
        for (const ancestorId of collectAncestorIds(a.id, assets)) {
          idSet.add(ancestorId);
        }
      }
      return {
        visibleAssets: assets.filter((a) => idSet.has(a.id)),
        visibleIds: idSet,
      };
    }

    return { visibleAssets: assets, visibleIds: null };
  }, [assets, search, filter]);

  const rootAssets = useMemo(
    () =>
      visibleAssets
        .filter((a) => a.parentId === null)
        .sort((a, b) => a.name.localeCompare(b.name, 'cs')),
    [visibleAssets]
  );

  const handleSelect = (asset: Asset) => {
    navigate(`/asset/${asset.id}`);
  };

  const filters: { key: FilterKey; label: string }[] = [
    { key: 'all', label: 'Vše' },
    { key: 'broken', label: '❌ Poruchy' },
    { key: 'maintenance', label: '🔧 Údržba' },
    { key: 'stopped', label: '⏸️ Zastaveno' },
    { key: 'operational', label: '✅ OK' },
  ];

  return (
    <div className="kartoteka-page">
      <div className="k-header">
        <button className="k-back-btn" onClick={() => navigate('/')}>
          <ArrowLeft size={20} />
        </button>
        <Building2 size={22} style={{ color: '#3b82f6' }} />
        <span className="k-title">Mapa areálu</span>
        <button className="k-import-btn" onClick={() => setShowImport(true)}>
          <Upload size={16} />
          <span>Import</span>
        </button>
      </div>

      <div className="k-summary">
        <span className="k-stat">
          Celkem <span className="k-stat-count">{counts.total}</span>
        </span>
        <span className="k-stat">
          <span style={{ color: '#22c55e' }}>●</span>
          <span className="k-stat-count">{counts.operational}</span>
        </span>
        <span className="k-stat">
          <span style={{ color: '#eab308' }}>●</span>
          <span className="k-stat-count">{counts.maintenance}</span>
        </span>
        <span className="k-stat">
          <span style={{ color: '#ef4444' }}>●</span>
          <span className="k-stat-count">{counts.broken}</span>
        </span>
        <span className="k-stat">
          <span style={{ color: '#6b7280' }}>●</span>
          <span className="k-stat-count">{counts.stopped}</span>
        </span>
      </div>

      <div className="k-search">
        <input
          type="text"
          placeholder="Hledat podle názvu nebo typu…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="k-filters">
        {filters.map((f) => (
          <button
            key={f.key}
            className={`filter-chip${filter === f.key ? ' active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="k-loading">
          <div className="k-spinner" />
          <span>Načítám kartotéku…</span>
        </div>
      )}

      {error && <div className="k-error">{error}</div>}

      {!loading && !error && assets.length === 0 && (
        <div className="k-empty">
          <Building2 size={48} />
          <span>Žádné záznamy v kartotéce</span>
        </div>
      )}

      {!loading && !error && assets.length > 0 && (
        <div className="k-tree">
          {rootAssets.length === 0 && (search || filter !== 'all') ? (
            <div className="k-empty">
              <Search size={32} />
              <span>Žádné výsledky</span>
            </div>
          ) : (
            rootAssets.map((asset) => (
              <AssetTreeNode
                key={asset.id}
                asset={asset}
                allAssets={visibleIds ? visibleAssets : assets}
                depth={0}
                onSelect={handleSelect}
              />
            ))
          )}
        </div>
      )}

      {/* Excel Import Modal */}
      {showImport && (
        <ImportModal
          title="Import zařízení z Excelu"
          onClose={() => setShowImport(false)}
          onImport={handleImport}
        />
      )}
    </div>
  );
}
