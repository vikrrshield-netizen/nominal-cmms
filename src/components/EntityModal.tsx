// src/components/EntityModal.tsx
// NOMINAL CMMS — Jednotný "Pasport" entity
// 4 taby: Rodný list | Návaznosti | Potřeby | Historie
// Funguje pro Building, Room i Asset

import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  Building2, Layers, Wrench, Package, ClipboardList, Clock,
  ChevronRight, Edit2, AlertTriangle, Loader2, Save, X, FileText,
  Download,
} from 'lucide-react';

// ═══════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════

export type EntityType = 'building' | 'room' | 'asset';

export interface EntityModalData {
  type: EntityType;
  id: string;               // buildingId ('D'), roomName, or asset.id
  name: string;
  buildingId: string;        // Always set
  roomName?: string;         // Set for room and asset
  status?: string;
  code?: string;
  category?: string;
  asset?: MapAsset;          // Full asset object for asset type
}

export interface MapAsset {
  id: string;
  name: string;
  code?: string;
  status: string;
  buildingId: string;
  areaName?: string;
  category?: string;
  controlPoints?: string[];
}

export interface BreadcrumbItem {
  label: string;
  data?: EntityModalData;
}

interface EntityModalProps {
  data: EntityModalData;
  breadcrumbs: BreadcrumbItem[];
  onClose: () => void;
  onNavigate: (data: EntityModalData, breadcrumb: BreadcrumbItem) => void;
  onBack: () => void;
}

// ═══════════════════════════════════════════════
// STATUS CONFIG
// ═══════════════════════════════════════════════
const STATUS_MAP: Record<string, { label: string; dot: string; color: string }> = {
  operational: { label: 'V provozu', dot: 'bg-emerald-400', color: '#34d399' },
  maintenance: { label: 'Údržba', dot: 'bg-amber-400', color: '#fbbf24' },
  breakdown: { label: 'Porucha', dot: 'bg-red-400', color: '#f87171' },
  sanitation: { label: 'Sanitace', dot: 'bg-blue-400', color: '#60a5fa' },
  idle: { label: 'Nečinný', dot: 'bg-slate-400', color: '#94a3b8' },
  offline: { label: 'Offline', dot: 'bg-slate-600', color: '#475569' },
};

const BUILDING_NAMES: Record<string, string> = {
  A: 'Administrativa', B: 'Spojovací krček', C: 'Zázemí & Vedení',
  D: 'Výrobní hala', E: 'Dílna & Sklad ND', L: 'Loupárna',
};

// ═══════════════════════════════════════════════
// TAB TYPE
// ═══════════════════════════════════════════════
type TabId = 'passport' | 'relations' | 'maintenance' | 'history';

const TABS: { id: TabId; label: string; icon: typeof FileText }[] = [
  { id: 'passport', label: 'Rodný list', icon: FileText },
  { id: 'relations', label: 'Návaznosti', icon: Layers },
  { id: 'maintenance', label: 'Potřeby', icon: ClipboardList },
  { id: 'history', label: 'Historie', icon: Clock },
];

// ═══════════════════════════════════════════════
// HOOKS — Live data for tabs
// ═══════════════════════════════════════════════

function useChildAssets(data: EntityModalData) {
  const [assets, setAssets] = useState<MapAsset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (data.type === 'asset') {
      setAssets([]);
      setLoading(false);
      return;
    }

    const constraints = [where('buildingId', '==', data.buildingId)];
    if (data.type === 'room' && data.roomName) {
      constraints.push(where('areaName', '==', data.roomName));
    }

    const q = query(collection(db, 'assets'), ...constraints);
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as MapAsset));
      if (data.type === 'building') {
        setAssets(items);
      } else {
        setAssets(items);
      }
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [data.type, data.buildingId, data.roomName]);

  return { assets, loading };
}

function useEntityTasks(data: EntityModalData) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let q;
    if (data.type === 'asset' && data.asset) {
      q = query(collection(db, 'tasks'), where('assetId', '==', data.asset.id));
    } else {
      q = query(collection(db, 'tasks'), where('buildingId', '==', data.buildingId));
    }

    const unsub = onSnapshot(q, (snap) => {
      setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [data.type, data.buildingId, data.asset]);

  return { tasks, loading };
}

function useEntityRevisions(data: EntityModalData) {
  const [revisions, setRevisions] = useState<any[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'revisions'), where('buildingId', '==', data.buildingId));
    const unsub = onSnapshot(q, (snap) => {
      setRevisions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [data.buildingId]);

  return { revisions };
}

function useInventoryForAsset(assetName: string | undefined) {
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    if (!assetName) return;
    const unsub = onSnapshot(collection(db, 'inventory'), (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const matching = all.filter((item: any) =>
        item.compatibleAssetNames?.some((name: string) =>
          name.toLowerCase().includes(assetName.toLowerCase())
        )
      );
      setItems(matching);
    });
    return () => unsub();
  }, [assetName]);

  return { items };
}

// ═══════════════════════════════════════════════
// ENTITY MODAL — MAIN COMPONENT
// ═══════════════════════════════════════════════

export default function EntityModal({ data, breadcrumbs, onClose, onNavigate, onBack }: EntityModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>('passport');
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  const { assets: childAssets, loading: assetsLoading } = useChildAssets(data);
  const { tasks, loading: tasksLoading } = useEntityTasks(data);
  const { revisions } = useEntityRevisions(data);
  const { items: spareParts } = useInventoryForAsset(data.type === 'asset' ? data.name : undefined);

  // Grouped rooms for building view
  const rooms = useMemo(() => {
    if (data.type !== 'building') return [];
    const roomMap = new Map<string, MapAsset[]>();
    childAssets.forEach((a) => {
      const key = a.areaName || 'Ostatní';
      if (!roomMap.has(key)) roomMap.set(key, []);
      roomMap.get(key)!.push(a);
    });
    return Array.from(roomMap.entries()).map(([name, roomAssets]) => ({
      name,
      assetCount: roomAssets.length,
      worstStatus: roomAssets.some(a => a.status === 'breakdown') ? 'breakdown'
        : roomAssets.some(a => a.status === 'maintenance') ? 'maintenance' : 'operational',
    })).sort((a, b) => a.name.localeCompare(b.name, 'cs'));
  }, [data.type, childAssets]);

  // Active/done tasks
  const activeTasks = tasks.filter((t: any) => t.status !== 'done' && t.status !== 'completed');
  const doneTasks = tasks.filter((t: any) => t.status === 'done' || t.status === 'completed');

  // Icon for entity type
  const TypeIcon = data.type === 'building' ? Building2 : data.type === 'room' ? Layers : Wrench;
  const st = STATUS_MAP[data.status || 'idle'] || STATUS_MAP.idle;

  // Save inline edit (for asset fields)
  const handleSaveField = async (field: string) => {
    if (!data.asset || !editValue.trim()) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'assets', data.asset.id), {
        [field]: editValue.trim(),
        updatedAt: serverTimestamp(),
      });
      setEditingField(null);
    } catch (err) {
      console.error('[EntityModal] Save failed:', err);
    }
    setSaving(false);
  };

  // PDF export handler
  const handleExportPDF = () => {
    const w = window.open('', '_blank');
    if (!w) return;

    const passportFields = data.type === 'asset' ? [
      { label: 'Kód', value: data.code || '—' },
      { label: 'Budova', value: BUILDING_NAMES[data.buildingId] || data.buildingId },
      { label: 'Místnost', value: data.roomName || '—' },
      { label: 'Kategorie', value: data.category || '—' },
      { label: 'Stav', value: st.label },
    ] : data.type === 'room' ? [
      { label: 'Budova', value: BUILDING_NAMES[data.buildingId] || data.buildingId },
      { label: 'Místnost', value: data.name },
      { label: 'Počet strojů', value: String(childAssets.length) },
    ] : [
      { label: 'Budova', value: data.name },
      { label: 'Kód', value: data.buildingId },
      { label: 'Místností', value: String(rooms.length) },
      { label: 'Celkem strojů', value: String(childAssets.length) },
    ];

    const fieldsHtml = passportFields.map(f =>
      `<tr><td style="padding:8px;border:1px solid #ddd;font-weight:600;background:#f8f9fa;width:140px">${f.label}</td><td style="padding:8px;border:1px solid #ddd">${f.value}</td></tr>`
    ).join('');

    const tasksHtml = activeTasks.slice(0, 15).map((t: any) =>
      `<tr><td style="padding:6px;border:1px solid #ddd">${t.priority || '—'}</td><td style="padding:6px;border:1px solid #ddd">${t.title}</td><td style="padding:6px;border:1px solid #ddd">${t.status || '—'}</td></tr>`
    ).join('');

    w.document.write(`<!DOCTYPE html><html><head><title>Pasport — ${data.name}</title>
<style>body{font-family:Arial,sans-serif;margin:40px;color:#333}h1{color:#1e293b;border-bottom:3px solid #f97316;padding-bottom:10px}h2{color:#475569;margin-top:30px}table{width:100%;border-collapse:collapse;margin-top:10px}.logo{display:flex;align-items:center;gap:12px;margin-bottom:20px}.logo-box{width:48px;height:48px;background:linear-gradient(135deg,#f97316,#f59e0b);border-radius:12px;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:20px}.meta{color:#64748b;font-size:13px;margin-top:4px}@media print{body{margin:20px}}</style></head><body>
<div class="logo"><div class="logo-box">N</div><div><div style="font-size:18px;font-weight:bold">NOMINAL CMMS</div><div class="meta">Pasport — ${data.type === 'building' ? 'Budova' : data.type === 'room' ? 'Místnost' : 'Zařízení'}</div></div></div>
<h1>${data.name}</h1>
<p class="meta">Vytištěno: ${new Date().toLocaleDateString('cs-CZ')} ${new Date().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}</p>
<h2>Rodný list</h2><table>${fieldsHtml}</table>
${activeTasks.length > 0 ? `<h2>Otevřené úkoly (${activeTasks.length})</h2><table><tr style="background:#1e293b;color:white"><th style="padding:8px;text-align:left">Priorita</th><th style="padding:8px;text-align:left">Úkol</th><th style="padding:8px;text-align:left">Status</th></tr>${tasksHtml}</table>` : ''}
<script>setTimeout(()=>window.print(),300)</script></body></html>`);
    w.document.close();
  };

  return (
    <>
      <style>{`
        @keyframes nominalSlideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
      <div
        className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-md flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-2xl max-h-[90vh] bg-slate-800 rounded-3xl overflow-hidden shadow-2xl border border-white/10 flex flex-col"
          style={{ animation: 'nominalSlideUp 0.25s ease-out' }}
        >
          {/* ═══ HEADER ═══ */}
          <div className="px-5 pt-5 pb-3 border-b border-white/10 flex-shrink-0">
            {/* Breadcrumbs */}
            <div className="flex items-center text-xs text-slate-500 mb-2 flex-wrap gap-0.5">
              {breadcrumbs.map((bc, i) => (
                <span key={i} className="flex items-center">
                  {i > 0 && <ChevronRight className="w-3 h-3 mx-0.5 text-slate-600" />}
                  {bc.data ? (
                    <button
                      onClick={() => onBack()}
                      className="hover:text-blue-400 transition"
                    >
                      {bc.label}
                    </button>
                  ) : (
                    <span className="text-slate-400 font-medium">{bc.label}</span>
                  )}
                </span>
              ))}
            </div>

            {/* Title row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                  <TypeIcon className="w-5 h-5 text-orange-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">{data.name}</h2>
                  <div className="flex items-center gap-2 text-xs">
                    {data.code && <span className="text-slate-500 font-mono">{data.code}</span>}
                    {data.status && (
                      <span className="flex items-center gap-1">
                        <span className={`w-2 h-2 rounded-full ${st.dot}`} />
                        <span style={{ color: st.color }}>{st.label}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleExportPDF}
                  className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center text-slate-400 hover:text-white transition"
                  title="Stáhnout PDF pasport"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  onClick={onClose}
                  className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mt-3 -mb-3 overflow-x-auto">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-3 py-2 rounded-t-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition ${
                      isActive
                        ? 'bg-slate-700/60 text-orange-400 border-b-2 border-orange-400'
                        : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ═══ TAB CONTENT ═══ */}
          <div className="flex-1 overflow-y-auto px-5 py-5">
            {activeTab === 'passport' && (
              <TabPassport
                data={data}
                editingField={editingField}
                editValue={editValue}
                saving={saving}
                onStartEdit={(field, value) => { setEditingField(field); setEditValue(value); }}
                onSaveEdit={handleSaveField}
                onCancelEdit={() => setEditingField(null)}
                setEditValue={setEditValue}
              />
            )}

            {activeTab === 'relations' && (
              <TabRelations
                data={data}
                rooms={rooms}
                childAssets={childAssets}
                spareParts={spareParts}
                loading={assetsLoading}
                onNavigate={onNavigate}
              />
            )}

            {activeTab === 'maintenance' && (
              <TabMaintenance
                activeTasks={activeTasks}
                revisions={revisions}
                loading={tasksLoading}
              />
            )}

            {activeTab === 'history' && (
              <TabHistory doneTasks={doneTasks} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════
// TAB 1: RODNÝ LIST (Passport)
// ═══════════════════════════════════════════════

function TabPassport({ data, editingField, editValue, saving, onStartEdit, onSaveEdit, onCancelEdit, setEditValue }: {
  data: EntityModalData;
  editingField: string | null;
  editValue: string;
  saving: boolean;
  onStartEdit: (field: string, value: string) => void;
  onSaveEdit: (field: string) => void;
  onCancelEdit: () => void;
  setEditValue: (v: string) => void;
}) {
  const fields = data.type === 'asset' ? [
    { key: 'name', label: 'Název', value: data.name, editable: true },
    { key: 'code', label: 'Inventární kód', value: data.code || '—', editable: false },
    { key: 'buildingId', label: 'Budova', value: BUILDING_NAMES[data.buildingId] || data.buildingId, editable: false },
    { key: 'areaName', label: 'Místnost', value: data.roomName || '—', editable: false },
    { key: 'category', label: 'Kategorie', value: data.category || '—', editable: true },
    { key: 'status', label: 'Stav', value: STATUS_MAP[data.status || 'idle']?.label || data.status || '—', editable: false },
  ] : data.type === 'room' ? [
    { key: 'name', label: 'Místnost', value: data.name, editable: false },
    { key: 'building', label: 'Budova', value: BUILDING_NAMES[data.buildingId] || data.buildingId, editable: false },
    { key: 'code', label: 'Kód', value: `${data.buildingId}-${data.name}`, editable: false },
  ] : [
    { key: 'name', label: 'Budova', value: data.name, editable: false },
    { key: 'id', label: 'Kód', value: data.buildingId, editable: false },
  ];

  return (
    <div className="space-y-3">
      <h3 className="text-xs text-slate-500 uppercase font-bold mb-2">Základní údaje</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {fields.map((f) => (
          <div key={f.key} className="bg-slate-700/30 rounded-xl p-3 group relative">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-xs text-slate-500">{f.label}</span>
              {f.editable && editingField !== f.key && (
                <button
                  onClick={() => onStartEdit(f.key, f.value)}
                  className="ml-auto opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-600 transition"
                >
                  <Edit2 className="w-3 h-3 text-slate-400" />
                </button>
              )}
            </div>
            {editingField === f.key ? (
              <div className="flex gap-1">
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  autoFocus
                  className="flex-1 p-1.5 bg-slate-600/50 border border-blue-500 rounded-lg text-sm text-white outline-none min-h-[36px]"
                />
                <button
                  onClick={() => onSaveEdit(f.key)}
                  disabled={saving}
                  className="p-1.5 bg-blue-600 rounded-lg hover:bg-blue-500 min-w-[36px] min-h-[36px] flex items-center justify-center"
                >
                  <Save className="w-4 h-4 text-white" />
                </button>
                <button
                  onClick={onCancelEdit}
                  className="p-1.5 bg-slate-600 rounded-lg hover:bg-slate-500 min-w-[36px] min-h-[36px] flex items-center justify-center"
                >
                  <X className="w-4 h-4 text-slate-300" />
                </button>
              </div>
            ) : (
              <div className="text-sm font-medium text-white">{f.value}</div>
            )}
          </div>
        ))}
      </div>

      {/* Control points for assets */}
      {data.type === 'asset' && data.asset?.controlPoints && data.asset.controlPoints.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs text-slate-500 uppercase font-bold mb-2">Kontrolní body</h3>
          <div className="flex flex-wrap gap-1.5">
            {data.asset.controlPoints.map((cp, i) => (
              <span key={i} className="px-2.5 py-1 rounded-lg bg-white/5 text-[12px] text-slate-300 border border-white/10">
                {cp}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// TAB 2: NÁVAZNOSTI (Relations)
// ═══════════════════════════════════════════════

function TabRelations({ data, rooms, childAssets, spareParts, loading, onNavigate }: {
  data: EntityModalData;
  rooms: { name: string; assetCount: number; worstStatus: string }[];
  childAssets: MapAsset[];
  spareParts: any[];
  loading: boolean;
  onNavigate: (data: EntityModalData, breadcrumb: BreadcrumbItem) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Načítám...
      </div>
    );
  }

  // Building → show rooms
  if (data.type === 'building') {
    return (
      <div className="space-y-2">
        <h3 className="text-xs text-slate-500 uppercase font-bold mb-2">
          Místnosti ({rooms.length})
        </h3>
        {rooms.length === 0 ? (
          <div className="text-sm text-slate-500 text-center py-4">Žádné místnosti</div>
        ) : (
          rooms.map((room) => {
            const rst = STATUS_MAP[room.worstStatus] || STATUS_MAP.idle;
            return (
              <button
                key={room.name}
                onClick={() => onNavigate(
                  { type: 'room', id: room.name, name: room.name, buildingId: data.buildingId, roomName: room.name },
                  { label: data.name, data }
                )}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.06] transition text-left"
              >
                <div className="w-9 h-9 rounded-lg bg-slate-700/50 flex items-center justify-center flex-shrink-0">
                  <Layers className="w-4 h-4 text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white">{room.name}</div>
                  <div className="text-xs text-slate-500">{room.assetCount} strojů</div>
                </div>
                <span className={`w-2.5 h-2.5 rounded-full ${rst.dot}`} />
                <ChevronRight className="w-4 h-4 text-slate-600" />
              </button>
            );
          })
        )}
      </div>
    );
  }

  // Room → show assets
  if (data.type === 'room') {
    return (
      <div className="space-y-2">
        <h3 className="text-xs text-slate-500 uppercase font-bold mb-2">
          Zařízení ({childAssets.length})
        </h3>
        {childAssets.length === 0 ? (
          <div className="text-sm text-slate-500 text-center py-4">Žádná zařízení</div>
        ) : (
          childAssets.map((asset) => {
            const ast = STATUS_MAP[asset.status] || STATUS_MAP.idle;
            return (
              <button
                key={asset.id}
                onClick={() => onNavigate(
                  {
                    type: 'asset', id: asset.id, name: asset.name,
                    buildingId: data.buildingId, roomName: data.roomName,
                    status: asset.status, code: asset.code, category: asset.category,
                    asset,
                  },
                  { label: data.name, data }
                )}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.06] transition text-left"
              >
                <div className="w-9 h-9 rounded-lg bg-slate-700/50 flex items-center justify-center flex-shrink-0">
                  <Wrench className="w-4 h-4 text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{asset.name}</div>
                  {asset.code && <div className="text-xs text-slate-500 font-mono">{asset.code}</div>}
                </div>
                <span className={`w-2.5 h-2.5 rounded-full ${ast.dot}`} />
                <ChevronRight className="w-4 h-4 text-slate-600" />
              </button>
            );
          })
        )}
      </div>
    );
  }

  // Asset → show spare parts from inventory
  return (
    <div className="space-y-2">
      <h3 className="text-xs text-slate-500 uppercase font-bold mb-2">
        Náhradní díly ({spareParts.length})
      </h3>
      {spareParts.length === 0 ? (
        <div className="text-sm text-slate-500 text-center py-4">
          Žádné propojené díly ve skladu
        </div>
      ) : (
        spareParts.map((item: any) => (
          <div
            key={item.id}
            className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.08]"
          >
            <div className="w-9 h-9 rounded-lg bg-slate-700/50 flex items-center justify-center flex-shrink-0">
              <Package className="w-4 h-4 text-slate-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-white truncate">{item.name}</div>
              <div className="text-xs text-slate-500 font-mono">{item.code}</div>
            </div>
            <div className="text-right">
              <div className={`text-sm font-bold ${
                (item.quantity || 0) <= (item.minQuantity || 0) ? 'text-red-400' : 'text-emerald-400'
              }`}>
                {item.quantity || 0}
              </div>
              <div className="text-[10px] text-slate-500">{item.unit || 'ks'}</div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// TAB 3: POTŘEBY (Maintenance)
// ═══════════════════════════════════════════════

const TASK_PRIORITY_COLORS: Record<string, string> = {
  P1: '#f87171', P2: '#fbbf24', P3: '#60a5fa', P4: '#94a3b8',
};

const TASK_STATUS_LABELS: Record<string, { label: string; bg: string; text: string }> = {
  backlog: { label: 'Nový', bg: 'bg-red-500/20', text: 'text-red-400' },
  planned: { label: 'Plánovaný', bg: 'bg-blue-500/20', text: 'text-blue-400' },
  in_progress: { label: 'V řešení', bg: 'bg-amber-500/20', text: 'text-amber-400' },
  paused: { label: 'Čeká', bg: 'bg-cyan-500/20', text: 'text-cyan-400' },
};

function TabMaintenance({ activeTasks, revisions, loading }: {
  activeTasks: any[];
  revisions: any[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Načítám...
      </div>
    );
  }

  const upcomingRevisions = revisions.filter((r: any) => {
    const next = r.nextRevisionAt?.toDate?.() || (r.nextRevisionAt ? new Date(r.nextRevisionAt) : null);
    if (!next) return false;
    const days = Math.round((next.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return days <= 90;
  });

  return (
    <div className="space-y-6">
      {/* Active tasks */}
      <div>
        <h3 className="text-xs text-slate-500 uppercase font-bold mb-2">
          Otevřené úkoly ({activeTasks.length})
        </h3>
        {activeTasks.length === 0 ? (
          <div className="text-sm text-slate-500 text-center py-3">Žádné otevřené úkoly</div>
        ) : (
          <div className="space-y-2">
            {activeTasks.slice(0, 10).map((task: any) => {
              const pc = TASK_PRIORITY_COLORS[task.priority] || '#94a3b8';
              const sb = TASK_STATUS_LABELS[task.status] || TASK_STATUS_LABELS.backlog;
              return (
                <div key={task.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.08]">
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                    style={{ background: `${pc}20`, color: pc }}
                  >
                    {task.priority || 'P3'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">{task.title}</div>
                    {task.assigneeName && <div className="text-xs text-slate-500">{task.assigneeName}</div>}
                  </div>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-lg ${sb.bg} ${sb.text}`}>
                    {sb.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Upcoming revisions */}
      {upcomingRevisions.length > 0 && (
        <div>
          <h3 className="text-xs text-slate-500 uppercase font-bold mb-2">
            Blížící se revize ({upcomingRevisions.length})
          </h3>
          <div className="space-y-2">
            {upcomingRevisions.map((rev: any) => {
              const next = rev.nextRevisionAt?.toDate?.() || new Date(rev.nextRevisionAt);
              const days = Math.round((next.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              return (
                <div key={rev.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.08]">
                  <AlertTriangle className={`w-4 h-4 flex-shrink-0 ${days <= 7 ? 'text-red-400' : days <= 30 ? 'text-amber-400' : 'text-blue-400'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">{rev.name}</div>
                    <div className="text-xs text-slate-500">{rev.provider || '—'}</div>
                  </div>
                  <span className={`text-xs font-bold ${days <= 7 ? 'text-red-400' : days <= 30 ? 'text-amber-400' : 'text-blue-400'}`}>
                    {days < 0 ? `${Math.abs(days)}d po!` : `za ${days}d`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// TAB 4: HISTORIE (History)
// ═══════════════════════════════════════════════

function TabHistory({ doneTasks }: { doneTasks: any[] }) {
  const sorted = useMemo(() => {
    return [...doneTasks].sort((a, b) => {
      const aTime = a.completedAt?.toDate?.()?.getTime() || a.createdAt?.toDate?.()?.getTime() || 0;
      const bTime = b.completedAt?.toDate?.()?.getTime() || b.createdAt?.toDate?.()?.getTime() || 0;
      return bTime - aTime;
    });
  }, [doneTasks]);

  if (sorted.length === 0) {
    return (
      <div className="text-sm text-slate-500 text-center py-8">
        Zatím žádná historie
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-xs text-slate-500 uppercase font-bold mb-2">
        Dokončené úkoly ({sorted.length})
      </h3>
      {sorted.slice(0, 20).map((task: any) => {
        const date = task.completedAt?.toDate?.() || task.createdAt?.toDate?.();
        const dateStr = date ? date.toLocaleDateString('cs-CZ') : '—';
        return (
          <div key={task.id} className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.08]">
            <div className="w-2 h-2 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white">{task.title}</div>
              {task.resolution && (
                <div className="text-xs text-slate-400 mt-1">{task.resolution}</div>
              )}
              <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-2">
                <span>{dateStr}</span>
                {task.completedBy && <span>· {task.completedBy}</span>}
                {task.durationMinutes && <span>· {task.durationMinutes} min</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
