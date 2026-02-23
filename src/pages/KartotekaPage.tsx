// src/pages/KartotekaPage.tsx
// VIKRR Asset Shield — Kartotéka (asset tree with grid cards)
// Root items = large cards in grid (MapPage style)
// Children = indented collapsible list under each card

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Building2, Search, Upload, Plus, X,
  ChevronRight, ChevronDown, FileText, Loader2, Pencil, Trash2,
} from 'lucide-react';
import { useAuthContext } from '../context/AuthContext';
import { assetService } from '../services/assetService';
import { importAssets } from '../utils/importers/importAssets';
import type { Asset, AssetStatus, AssetCriticality } from '../types/asset';
import { ASSET_STATUS_CONFIG, CRITICALITY_CONFIG } from '../types/asset';
import { showToast } from '../components/ui/Toast';
import ImportModal from '../components/ui/ImportModal';
import './KartotekaPage.css';

// ── Status colors ────────────────────────────────────────────────
const STATUS_HEX: Record<string, string> = {
  operational: '#22c55e',
  maintenance: '#eab308',
  broken:      '#ef4444',
  stopped:     '#6b7280',
};

const STATUS_DOT: Record<string, string> = {
  operational: 'bg-emerald-400',
  maintenance: 'bg-amber-400 animate-pulse',
  broken:      'bg-red-400 animate-pulse',
  stopped:     'bg-slate-400',
};

// ── Entity type → color mapping (for root cards) ─────────────────
const ENTITY_COLORS: Record<string, string> = {
  'Budova':    '#6366f1',
  'Areál':     '#8b5cf6',
  'Hala':      '#f97316',
  'Linka':     '#10b981',
  'Dílna':     '#0ea5e9',
  'Sklad':     '#eab308',
  'Kancelář':  '#a855f7',
};

function getEntityColor(entityType: string): string {
  return ENTITY_COLORS[entityType] || '#3b82f6';
}

// ── Helpers ──────────────────────────────────────────────────────
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

/** Count descendants recursively, grouped by status */
function countDescendants(parentId: string, allAssets: Asset[]) {
  let total = 0, broken = 0, maintenance = 0, operational = 0, stopped = 0;
  const children = allAssets.filter((a) => a.parentId === parentId);
  for (const c of children) {
    total++;
    if (c.status === 'broken') broken++;
    else if (c.status === 'maintenance') maintenance++;
    else if (c.status === 'stopped') stopped++;
    else operational++;
    const sub = countDescendants(c.id, allAssets);
    total += sub.total;
    broken += sub.broken;
    maintenance += sub.maintenance;
    operational += sub.operational;
    stopped += sub.stopped;
  }
  return { total, broken, maintenance, operational, stopped };
}

/** Get worst status from descendants */
function worstStatus(parentId: string, allAssets: Asset[]): AssetStatus {
  const c = countDescendants(parentId, allAssets);
  if (c.broken > 0) return 'broken';
  if (c.maintenance > 0) return 'maintenance';
  if (c.stopped > 0) return 'stopped';
  return 'operational';
}

// ═══════════════════════════════════════════════════════════════════
// CHILD TREE NODE — recursive list item for non-root assets
// ═══════════════════════════════════════════════════════════════════
interface TreeNodeProps {
  asset: Asset;
  allAssets: Asset[];
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onDetail: (asset: Asset) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (asset: Asset) => void;
}

function TreeNode({ asset, allAssets, depth, expanded, onToggle, onDetail, onAddChild, onDelete }: TreeNodeProps) {
  const children = allAssets
    .filter((a) => a.parentId === asset.id)
    .sort((a, b) => a.name.localeCompare(b.name, 'cs'));
  const hasChildren = children.length > 0;
  const isExpanded = expanded.has(asset.id);
  const statusColor = STATUS_HEX[asset.status] || '#6b7280';
  const desc = countDescendants(asset.id, allAssets);

  return (
    <div className="k-tree-node">
      {/* Row */}
      <div className="k-tree-row" style={{ paddingLeft: `${depth * 24 + 12}px` }}>
        {/* Expand/collapse button */}
        {hasChildren ? (
          <button className="k-tree-expand" onClick={() => onToggle(asset.id)}>
            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        ) : (
          <span className="k-tree-expand-placeholder" />
        )}

        {/* Status dot */}
        <span className="k-tree-dot" style={{ backgroundColor: statusColor }} />

        {/* Asset name */}
        <span className="k-tree-name">{asset.name}</span>

        {/* Entity type badge */}
        {asset.entityType && (
          <span className="k-tree-badge">{asset.entityType}</span>
        )}

        {/* Descendant issue counts */}
        {hasChildren && (desc.broken > 0 || desc.maintenance > 0) && (
          <span className="k-tree-issues">
            {desc.broken > 0 && <span style={{ color: '#ef4444' }}>{desc.broken}✕</span>}
            {desc.maintenance > 0 && <span style={{ color: '#eab308' }}>{desc.maintenance}⚠</span>}
          </span>
        )}

        {/* Child count */}
        {hasChildren && (
          <span className="k-tree-childcount">{children.length}</span>
        )}

        {/* Action: Edit (navigate to detail) */}
        <button
          className="k-tree-action k-tree-action-edit"
          onClick={(e) => { e.stopPropagation(); onDetail(asset); }}
          title="Upravit"
        >
          <Pencil size={14} />
        </button>

        {/* Action: Add child */}
        <button
          className="k-tree-action k-tree-action-add"
          onClick={(e) => { e.stopPropagation(); onAddChild(asset.id); }}
          title="Přidat potomka"
        >
          <Plus size={14} />
        </button>

        {/* Action: Open detail (Rodný list) */}
        <button
          className="k-tree-action k-tree-action-detail"
          onClick={(e) => { e.stopPropagation(); onDetail(asset); }}
          title="Rodný list"
        >
          <FileText size={14} />
        </button>

        {/* Action: Delete */}
        <button
          className="k-tree-action k-tree-action-delete"
          onClick={(e) => { e.stopPropagation(); onDelete(asset); }}
          title="Smazat"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Children (recursive) */}
      {isExpanded && hasChildren && (
        <div className="k-tree-children">
          {children.map((child) => (
            <TreeNode
              key={child.id}
              asset={child}
              allAssets={allAssets}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              onDetail={onDetail}
              onAddChild={onAddChild}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ROOT CARD — large card for top-level items (MapPage style)
// ═══════════════════════════════════════════════════════════════════
interface RootCardProps {
  asset: Asset;
  allAssets: Asset[];
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onDetail: (asset: Asset) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (asset: Asset) => void;
}

function RootCard({ asset, allAssets, expanded, onToggle, onDetail, onAddChild, onDelete }: RootCardProps) {
  const color = getEntityColor(asset.entityType);
  const children = allAssets
    .filter((a) => a.parentId === asset.id)
    .sort((a, b) => a.name.localeCompare(b.name, 'cs'));
  const hasChildren = children.length > 0;
  const isExpanded = expanded.has(asset.id);
  const desc = countDescendants(asset.id, allAssets);
  const ws = worstStatus(asset.id, allAssets);
  const dotClass = STATUS_DOT[asset.status] || 'bg-slate-400';

  return (
    <div className="k-root-wrapper">
      {/* Card */}
      <div
        className="k-root-card"
        onClick={() => onDetail(asset)}
        style={{
          background: `linear-gradient(145deg, ${color}12, ${color}04)`,
          borderColor: `${color}25`,
          cursor: 'pointer',
        }}
      >
        {/* Status dot (top-right) */}
        <div className={`k-root-status-dot ${dotClass}`} />

        {/* Top row: icon + info + actions */}
        <div className="k-root-top">
          {/* Icon box */}
          <div
            className="k-root-icon"
            style={{ background: `${color}20`, color }}
          >
            {asset.name.charAt(0).toUpperCase()}
          </div>

          {/* Info */}
          <div className="k-root-info">
            <span className="k-root-name">{asset.name}</span>
            {asset.entityType && (
              <span className="k-root-type">{asset.entityType}</span>
            )}
            {asset.code && (
              <span className="k-root-code">{asset.code}</span>
            )}
          </div>

          {/* Actions cluster */}
          <div className="k-root-actions">
            <button
              className="k-root-action-btn"
              onClick={(e) => { e.stopPropagation(); onDetail(asset); }}
              title="Upravit"
              style={{ color: '#f59e0b', borderColor: '#f59e0b30' }}
            >
              <Pencil size={16} />
            </button>
            <button
              className="k-root-action-btn"
              onClick={(e) => { e.stopPropagation(); onAddChild(asset.id); }}
              title="Přidat potomka"
              style={{ color: '#22c55e', borderColor: '#22c55e30' }}
            >
              <Plus size={16} />
            </button>
            <button
              className="k-root-action-btn"
              onClick={(e) => { e.stopPropagation(); onDetail(asset); }}
              title="Rodný list"
              style={{ color: '#3b82f6', borderColor: '#3b82f630' }}
            >
              <FileText size={16} />
            </button>
            <button
              className="k-root-action-btn"
              onClick={(e) => { e.stopPropagation(); onDelete(asset); }}
              title="Smazat"
              style={{ color: '#ef4444', borderColor: '#ef444430' }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {/* Bottom stats row */}
        <div className="k-root-stats">
          <span className="k-root-stat">
            {desc.total} položek
          </span>
          {desc.operational > 0 && (
            <span className="k-root-stat">
              <span style={{ color: '#22c55e' }}>●</span> {desc.operational}
            </span>
          )}
          {desc.maintenance > 0 && (
            <span className="k-root-stat">
              <span style={{ color: '#eab308' }}>●</span> {desc.maintenance}
            </span>
          )}
          {desc.broken > 0 && (
            <span className="k-root-stat k-root-stat-alert">
              <span style={{ color: '#ef4444' }}>●</span> {desc.broken}
            </span>
          )}
          {desc.stopped > 0 && (
            <span className="k-root-stat">
              <span style={{ color: '#6b7280' }}>●</span> {desc.stopped}
            </span>
          )}
        </div>

        {/* Expand toggle bar */}
        {hasChildren && (
          <button className="k-root-expand" onClick={(e) => { e.stopPropagation(); onToggle(asset.id); }}>
            {isExpanded ? (
              <>
                <ChevronDown size={16} />
                <span>Skrýt ({children.length})</span>
              </>
            ) : (
              <>
                <ChevronRight size={16} />
                <span>Zobrazit ({children.length})</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Expanded children list */}
      {isExpanded && hasChildren && (
        <div className="k-root-children">
          {children.map((child) => (
            <TreeNode
              key={child.id}
              asset={child}
              allAssets={allAssets}
              depth={0}
              expanded={expanded}
              onToggle={onToggle}
              onDetail={onDetail}
              onAddChild={onAddChild}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN PAGE COMPONENT
// ═══════════════════════════════════════════════════════════════════
export default function KartotekaPage() {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const tenantId = user?.tenantId ?? 'main_firm';

  // ── Data state ───
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── UI state ───
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showImport, setShowImport] = useState(false);

  // ── Delete state ───
  const [deleteTarget, setDeleteTarget] = useState<Asset | null>(null);

  // ── Create modal state ───
  const [showCreate, setShowCreate] = useState(false);
  const [createParentId, setCreateParentId] = useState<string | null>(null);
  const [createSaving, setCreateSaving] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    entityType: '',
    code: '',
    status: 'operational' as AssetStatus,
    criticality: 'medium' as AssetCriticality,
  });

  // ── Load assets ───
  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    assetService.getAll(tenantId)
      .then((data) => { if (!cancelled) setAssets(data); })
      .catch((err) => { if (!cancelled) setError(String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId]);

  const reloadAssets = useCallback(() => {
    if (!tenantId) return;
    assetService.getAll(tenantId)
      .then(setAssets)
      .catch((err) => setError(String(err)));
  }, [tenantId]);

  // ── Excel import handler ───
  const handleImport = async (rows: Record<string, unknown>[]) => {
    const result = await importAssets(rows, tenantId);
    if (result.imported > 0) reloadAssets();
    return result;
  };

  // ── Create asset handler ───
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
        parentId: createParentId,
      } as Omit<Asset, 'id'>);
      const parentName = createParentId
        ? assets.find((a) => a.id === createParentId)?.name
        : null;
      showToast(
        parentName
          ? `Vytvořeno pod "${parentName}"`
          : 'Kořenový prvek vytvořen',
        'success'
      );
      setShowCreate(false);
      resetCreateForm();
      reloadAssets();
      // Auto-expand parent so user sees the new child
      if (createParentId) {
        setExpanded((prev) => new Set([...prev, createParentId]));
      }
    } catch (err) {
      console.error('[Kartoteka] create error:', err);
      showToast('Chyba při vytváření', 'error');
    }
    setCreateSaving(false);
  };

  const resetCreateForm = () => {
    setCreateForm({
      name: '', entityType: '', code: '',
      status: 'operational', criticality: 'medium',
    });
    setCreateParentId(null);
  };

  const openCreateModal = (parentId: string | null) => {
    resetCreateForm();           // FIRST: reset form (sets parentId=null)
    setCreateParentId(parentId); // THEN: set correct parentId
    setShowCreate(true);
  };

  // ── Delete handler ───
  const handleDelete = useCallback((asset: Asset) => {
    const childCount = assets.filter((a) => a.parentId === asset.id).length;
    if (childCount > 0) {
      showToast(`Nelze smazat — má ${childCount} potomků. Nejdřív smaž potomky.`, 'error');
      return;
    }
    setDeleteTarget(asset);
  }, [assets]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget || !tenantId) return;
    try {
      await assetService.delete(tenantId, deleteTarget.id);
      showToast(`Smazáno: ${deleteTarget.name}`, 'success');
      setDeleteTarget(null);
      reloadAssets();
    } catch (err) {
      console.error('[Kartoteka] delete error:', err);
      showToast('Chyba při mazání', 'error');
    }
  }, [deleteTarget, tenantId, reloadAssets]);

  // ── Toggle expand/collapse ───
  const handleToggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ── Navigate to detail ───
  const handleDetail = useCallback((asset: Asset) => {
    navigate(`/asset/${asset.id}`);
  }, [navigate]);

  // ── Counts ───
  const counts = useMemo(() => ({
    total: assets.length,
    operational: assets.filter((a) => a.status === 'operational').length,
    maintenance: assets.filter((a) => a.status === 'maintenance').length,
    broken:      assets.filter((a) => a.status === 'broken').length,
    stopped:     assets.filter((a) => a.status === 'stopped').length,
  }), [assets]);

  // ── Filtering (search + status) ───
  const { visibleAssets } = useMemo(() => {
    let matching = assets;

    if (search.trim()) {
      const q = search.toLowerCase();
      matching = matching.filter(
        (a) => a.name.toLowerCase().includes(q) ||
               a.entityType.toLowerCase().includes(q) ||
               (a.code && a.code.toLowerCase().includes(q))
      );
    }

    if (filter !== 'all') {
      matching = matching.filter((a) => a.status === filter);
    }

    // Include ancestors so tree stays intact
    if (search.trim() || filter !== 'all') {
      const idSet = new Set<string>();
      for (const a of matching) {
        idSet.add(a.id);
        for (const ancestorId of collectAncestorIds(a.id, assets)) {
          idSet.add(ancestorId);
        }
      }
      return { visibleAssets: assets.filter((a) => idSet.has(a.id)) };
    }

    return { visibleAssets: assets };
  }, [assets, search, filter]);

  const rootAssets = useMemo(
    () => visibleAssets
      .filter((a) => a.parentId === null)
      .sort((a, b) => a.name.localeCompare(b.name, 'cs')),
    [visibleAssets]
  );

  // ── Auto-expand when filtering ───
  useEffect(() => {
    if (search.trim() || filter !== 'all') {
      const allIds = new Set(visibleAssets.map((a) => a.id));
      setExpanded(allIds);
    }
  }, [search, filter, visibleAssets]);

  // ── Filter config ───
  const filters: { key: FilterKey; label: string }[] = [
    { key: 'all',         label: 'Vše' },
    { key: 'broken',      label: '❌ Poruchy' },
    { key: 'maintenance', label: '🔧 Údržba' },
    { key: 'stopped',     label: '⏸️ Zastaveno' },
    { key: 'operational', label: '✅ OK' },
  ];

  // ── Determine parent name for modal title ───
  const createParentName = createParentId
    ? assets.find((a) => a.id === createParentId)?.name ?? ''
    : '';

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="kartoteka-page">
      {/* ── Header ── */}
      <div className="k-header">
        <button className="k-back-btn" onClick={() => navigate('/')}>
          <ArrowLeft size={20} />
        </button>
        <Building2 size={22} style={{ color: '#3b82f6' }} />
        <span className="k-title">Kartotéka</span>

        {/* Add root asset */}
        <button
          className="k-add-btn"
          onClick={() => openCreateModal(null)}
          title="Přidat kořenový prvek"
        >
          <Plus size={18} />
        </button>

        {/* Import */}
        <button className="k-import-btn" onClick={() => setShowImport(true)}>
          <Upload size={16} />
          <span>Import</span>
        </button>
      </div>

      {/* ── Status summary bar ── */}
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

      {/* ── Search ── */}
      <div className="k-search">
        <div className="k-search-wrap">
          <Search size={18} className="k-search-icon" />
          <input
            type="text"
            placeholder="Hledat podle názvu, typu nebo kódu…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="k-search-clear" onClick={() => setSearch('')}>
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* ── Filter chips ── */}
      <div className="k-filters">
        {filters.map((f) => (
          <button
            key={f.key}
            className={`filter-chip${filter === f.key ? ' active' : ''}`}
            onClick={() => setFilter(f.key === filter ? 'all' : f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Loading state ── */}
      {loading && (
        <div className="k-loading">
          <Loader2 size={32} className="k-spin" />
          <span>Načítám kartotéku…</span>
        </div>
      )}

      {/* ── Error state ── */}
      {error && <div className="k-error">{error}</div>}

      {/* ── Empty state ── */}
      {!loading && !error && assets.length === 0 && (
        <div className="k-empty">
          <Building2 size={48} />
          <span>Žádné záznamy v kartotéce</span>
          <button className="k-empty-action" onClick={() => openCreateModal(null)}>
            <Plus size={16} /> Přidat první položku
          </button>
        </div>
      )}

      {/* ── Main content: root card grid + tree ── */}
      {!loading && !error && assets.length > 0 && (
        <div className="k-content">
          {rootAssets.length === 0 && (search || filter !== 'all') ? (
            <div className="k-empty">
              <Search size={32} />
              <span>Žádné výsledky</span>
            </div>
          ) : (
            <div className="k-grid">
              {rootAssets.map((asset) => (
                <RootCard
                  key={asset.id}
                  asset={asset}
                  allAssets={visibleAssets}
                  expanded={expanded}
                  onToggle={handleToggle}
                  onDetail={handleDetail}
                  onAddChild={openCreateModal}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Excel Import Modal ── */}
      {showImport && (
        <ImportModal
          title="Import zařízení z Excelu"
          onClose={() => setShowImport(false)}
          onImport={handleImport}
        />
      )}

      {/* ── Delete Confirm Modal ── */}
      {deleteTarget && (
        <div className="k-modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="k-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <div className="k-modal-header">
              <h2 className="k-modal-title">🗑️ Smazat položku?</h2>
              <button className="k-modal-close" onClick={() => setDeleteTarget(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="k-modal-body">
              <p style={{ color: '#94a3b8', fontSize: '0.9rem', lineHeight: 1.5, margin: 0 }}>
                Opravdu chcete smazat <strong style={{ color: '#f1f5f9' }}>{deleteTarget.name}</strong>?
                Tato akce je nevratná.
              </p>
            </div>
            <div className="k-modal-footer">
              <button className="k-btn-cancel" onClick={() => setDeleteTarget(null)}>
                Zrušit
              </button>
              <button
                className="k-btn-save"
                style={{ background: '#ef4444' }}
                onClick={confirmDelete}
              >
                Smazat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create Asset Modal ── */}
      {showCreate && (
        <div className="k-modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="k-modal" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="k-modal-header">
              <h2 className="k-modal-title">
                {createParentId
                  ? `Nová položka pod "${createParentName}"`
                  : 'Nový kořenový prvek'}
              </h2>
              <button className="k-modal-close" onClick={() => setShowCreate(false)}>
                <X size={20} />
              </button>
            </div>

            {/* Form body */}
            <div className="k-modal-body">
              <label className="k-field">
                <span className="k-label">Název *</span>
                <input
                  className="k-input"
                  type="text"
                  placeholder="např. Výrobní hala D"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  autoFocus
                />
              </label>

              <label className="k-field">
                <span className="k-label">Typ entity</span>
                <input
                  className="k-input"
                  type="text"
                  placeholder="např. Budova, Linka, Stroj…"
                  value={createForm.entityType}
                  onChange={(e) => setCreateForm({ ...createForm, entityType: e.target.value })}
                />
              </label>

              <label className="k-field">
                <span className="k-label">Kód</span>
                <input
                  className="k-input"
                  type="text"
                  placeholder="např. HAL-D"
                  value={createForm.code}
                  onChange={(e) => setCreateForm({ ...createForm, code: e.target.value })}
                />
              </label>

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
