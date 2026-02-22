import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, Search, Upload, Plus, X } from 'lucide-react';
import { useAuthContext } from '../context/AuthContext';
import { assetService } from '../services/assetService';
import { importAssets } from '../utils/importers/importAssets';
import type { Asset, AssetStatus, AssetCriticality } from '../types/asset';
import { ASSET_STATUS_CONFIG, CRITICALITY_CONFIG } from '../types/asset';
import { showToast } from '../components/ui/Toast';
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
  const tenantId = user?.tenantId ?? 'main_firm';

  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [showImport, setShowImport] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    entityType: '',
    code: '',
    status: 'operational' as AssetStatus,
    criticality: 'medium' as AssetCriticality,
    parentId: '' as string,
  });

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

  // Handle manual asset creation
  const handleCreate = async () => {
    if (!createForm.name.trim() || !tenantId) return;
    setCreateSaving(true);
    try {
      await assetService.add(tenantId, {
        tenantId,
        name: createForm.name.trim(),
        entityType: createForm.entityType.trim() || 'Zařízení',
        code: createForm.code.trim() || null,
        status: createForm.status,
        criticality: createForm.criticality,
        parentId: createForm.parentId || null,
      } as Omit<Asset, 'id'>);
      showToast('Zařízení vytvořeno', 'success');
      setShowCreate(false);
      setCreateForm({ name: '', entityType: '', code: '', status: 'operational', criticality: 'medium', parentId: '' });
      reloadAssets();
    } catch (err) {
      console.error('[Kartoteka] create error:', err);
      showToast('Chyba při vytváření', 'error');
    }
    setCreateSaving(false);
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
        <button className="k-add-btn" onClick={() => setShowCreate(true)}>
          <Plus size={18} />
        </button>
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

      {/* Create Asset Modal */}
      {showCreate && (
        <div className="k-modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="k-modal" onClick={(e) => e.stopPropagation()}>
            {/* Modal header */}
            <div className="k-modal-header">
              <h2 className="k-modal-title">Nové zařízení</h2>
              <button className="k-modal-close" onClick={() => setShowCreate(false)}>
                <X size={20} />
              </button>
            </div>

            {/* Form body */}
            <div className="k-modal-body">
              {/* Název — required */}
              <label className="k-field">
                <span className="k-label">Název *</span>
                <input
                  className="k-input"
                  type="text"
                  placeholder="např. Extruder 1"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  autoFocus
                />
              </label>

              {/* Typ entity */}
              <label className="k-field">
                <span className="k-label">Typ entity</span>
                <input
                  className="k-input"
                  type="text"
                  placeholder="např. Stroj, Linka, Budova…"
                  value={createForm.entityType}
                  onChange={(e) => setCreateForm({ ...createForm, entityType: e.target.value })}
                />
              </label>

              {/* Kód */}
              <label className="k-field">
                <span className="k-label">Kód</span>
                <input
                  className="k-input"
                  type="text"
                  placeholder="např. EXT-001"
                  value={createForm.code}
                  onChange={(e) => setCreateForm({ ...createForm, code: e.target.value })}
                />
              </label>

              {/* Status + Criticality row */}
              <div className="k-row">
                <label className="k-field">
                  <span className="k-label">Stav</span>
                  <select
                    className="k-input"
                    value={createForm.status}
                    onChange={(e) => setCreateForm({ ...createForm, status: e.target.value as AssetStatus })}
                  >
                    {(Object.keys(ASSET_STATUS_CONFIG) as AssetStatus[]).map((s) => (
                      <option key={s} value={s}>{ASSET_STATUS_CONFIG[s].label}</option>
                    ))}
                  </select>
                </label>
                <label className="k-field">
                  <span className="k-label">Kritičnost</span>
                  <select
                    className="k-input"
                    value={createForm.criticality}
                    onChange={(e) => setCreateForm({ ...createForm, criticality: e.target.value as AssetCriticality })}
                  >
                    {(Object.keys(CRITICALITY_CONFIG) as AssetCriticality[]).map((c) => (
                      <option key={c} value={c}>{CRITICALITY_CONFIG[c].label}</option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Parent select */}
              <label className="k-field">
                <span className="k-label">Nadřazený prvek</span>
                <select
                  className="k-input"
                  value={createForm.parentId}
                  onChange={(e) => setCreateForm({ ...createForm, parentId: e.target.value })}
                >
                  <option value="">— Kořenový prvek —</option>
                  {assets
                    .sort((a, b) => a.name.localeCompare(b.name, 'cs'))
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}{a.entityType ? ` (${a.entityType})` : ''}
                      </option>
                    ))}
                </select>
              </label>
            </div>

            {/* Footer */}
            <div className="k-modal-footer">
              <button className="k-btn-cancel" onClick={() => setShowCreate(false)}>
                Zrušit
              </button>
              <button
                className="k-btn-save"
                onClick={handleCreate}
                disabled={!createForm.name.trim() || createSaving}
              >
                {createSaving ? 'Ukládám…' : 'Vytvořit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
