// src/components/EntityModal.tsx
// Jednotný "Pasport" entity
// 4 taby: Rodný list | Návaznosti | Potřeby | Historie
// Funguje pro Building, Room i Asset

import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import appConfig from '../appConfig';
import {
  Building2, Layers, Wrench, Package, ClipboardList, Clock,
  ChevronRight, Edit2, AlertTriangle, Loader2, Save, X, FileText,
  Download, Printer, ArrowLeft,
} from 'lucide-react';

// ═══════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════

export type EntityType = 'building' | 'room' | 'asset';

export interface EntityModalData {
  type: EntityType;
  id: string;
  name: string;
  buildingId: string;
  roomName?: string;
  status?: string;
  code?: string;
  category?: string;
  asset?: MapAsset;
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
  motorHours?: number;
  nextRevision?: string;
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

const BUILDING_OPTIONS = Object.entries(BUILDING_NAMES).map(([k, v]) => ({ value: k, label: `${k} — ${v}` }));
const STATUS_OPTIONS = Object.entries(STATUS_MAP).map(([k, v]) => ({ value: k, label: v.label }));

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
      setAssets(snap.docs.map((d) => ({ id: d.id, ...d.data() } as MapAsset)));
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
// LIVE ASSET HOOK — refresh data after edits
// ═══════════════════════════════════════════════

function useLiveAsset(assetId: string | undefined) {
  const [liveAsset, setLiveAsset] = useState<MapAsset | null>(null);

  useEffect(() => {
    if (!assetId) return;
    const unsub = onSnapshot(doc(db, 'assets', assetId), (snap) => {
      if (snap.exists()) {
        setLiveAsset({ id: snap.id, ...snap.data() } as MapAsset);
      }
    });
    return () => unsub();
  }, [assetId]);

  return liveAsset;
}

// ═══════════════════════════════════════════════
// ENTITY MODAL — MAIN COMPONENT
// ═══════════════════════════════════════════════

export default function EntityModal({ data, breadcrumbs, onClose, onNavigate, onBack }: EntityModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>('passport');
  const [showPdfPreview, setShowPdfPreview] = useState(false);

  // Live asset for real-time edit updates
  const liveAsset = useLiveAsset(data.type === 'asset' ? data.asset?.id : undefined);
  const effectiveData = useMemo(() => {
    if (!liveAsset || data.type !== 'asset') return data;
    return {
      ...data,
      name: liveAsset.name,
      code: liveAsset.code,
      category: liveAsset.category,
      status: liveAsset.status,
      roomName: liveAsset.areaName,
      buildingId: liveAsset.buildingId,
      asset: liveAsset,
    };
  }, [data, liveAsset]);

  const { assets: childAssets, loading: assetsLoading } = useChildAssets(effectiveData);
  const { tasks, loading: tasksLoading } = useEntityTasks(effectiveData);
  const { revisions } = useEntityRevisions(effectiveData);
  const { items: spareParts } = useInventoryForAsset(effectiveData.type === 'asset' ? effectiveData.name : undefined);

  // Grouped rooms for building view
  const rooms = useMemo(() => {
    if (effectiveData.type !== 'building') return [];
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
  }, [effectiveData.type, childAssets]);

  // Active/done tasks
  const activeTasks = tasks.filter((t: any) => t.status !== 'done' && t.status !== 'completed');
  const doneTasks = tasks.filter((t: any) => t.status === 'done' || t.status === 'completed');

  // Icon for entity type
  const TypeIcon = effectiveData.type === 'building' ? Building2 : effectiveData.type === 'room' ? Layers : Wrench;
  const st = STATUS_MAP[effectiveData.status || 'idle'] || STATUS_MAP.idle;

  return (
    <>
      <style>{`
        @keyframes nominalSlideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>

      {/* PDF PREVIEW OVERLAY */}
      {showPdfPreview && (
        <PdfPreviewOverlay
          data={effectiveData}
          activeTasks={activeTasks}
          childAssets={childAssets}
          rooms={rooms}
          st={st}
          onClose={() => setShowPdfPreview(false)}
        />
      )}

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
                    <button onClick={() => onBack()} className="hover:text-blue-400 transition">
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
                  <h2 className="text-lg font-bold text-white">{effectiveData.name}</h2>
                  <div className="flex items-center gap-2 text-xs">
                    {effectiveData.code && <span className="text-slate-500 font-mono">{effectiveData.code}</span>}
                    {effectiveData.status && (
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
                  onClick={() => setShowPdfPreview(true)}
                  className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center text-slate-400 hover:text-white transition"
                  title="PDF pasport"
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
              <TabPassport data={effectiveData} />
            )}
            {activeTab === 'relations' && (
              <TabRelations
                data={effectiveData}
                rooms={rooms}
                childAssets={childAssets}
                spareParts={spareParts}
                loading={assetsLoading}
                onNavigate={onNavigate}
              />
            )}
            {activeTab === 'maintenance' && (
              <TabMaintenance activeTasks={activeTasks} revisions={revisions} loading={tasksLoading} />
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
// PDF PREVIEW OVERLAY (Task #44 fix)
// ═══════════════════════════════════════════════

function PdfPreviewOverlay({ data, activeTasks, childAssets, rooms, st, onClose }: {
  data: EntityModalData;
  activeTasks: any[];
  childAssets: MapAsset[];
  rooms: { name: string; assetCount: number; worstStatus: string }[];
  st: { label: string; dot: string; color: string };
  onClose: () => void;
}) {
  const passportFields = data.type === 'asset' ? [
    { label: 'Kód', value: data.code || '—' },
    { label: 'Budova', value: BUILDING_NAMES[data.buildingId] || data.buildingId },
    { label: 'Místnost', value: data.roomName || '—' },
    { label: 'Kategorie', value: data.category || '—' },
    { label: 'Stav', value: st.label },
    ...(data.asset?.motorHours ? [{ label: 'Motohodiny', value: String(data.asset.motorHours) + ' Mth' }] : []),
    ...(data.asset?.nextRevision ? [{ label: 'Příští revize', value: data.asset.nextRevision }] : []),
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

  const handlePrint = () => {
    const w = window.open('', '_blank');
    if (!w) return;

    const fieldsHtml = passportFields.map(f =>
      `<tr><td style="padding:8px;border:1px solid #ddd;font-weight:600;background:#f8f9fa;width:140px">${f.label}</td><td style="padding:8px;border:1px solid #ddd">${f.value}</td></tr>`
    ).join('');

    const tasksHtml = activeTasks.slice(0, 15).map((t: any) =>
      `<tr><td style="padding:6px;border:1px solid #ddd">${t.priority || '—'}</td><td style="padding:6px;border:1px solid #ddd">${t.title}</td><td style="padding:6px;border:1px solid #ddd">${t.status || '—'}</td></tr>`
    ).join('');

    w.document.write(`<!DOCTYPE html><html><head><title>Pasport — ${data.name}</title>
<style>body{font-family:Arial,sans-serif;margin:40px;color:#333}h1{color:#1e293b;border-bottom:3px solid ${appConfig.PRIMARY_COLOR};padding-bottom:10px}h2{color:#475569;margin-top:30px}table{width:100%;border-collapse:collapse;margin-top:10px}.logo{display:flex;align-items:center;gap:12px;margin-bottom:20px}.logo-box{width:48px;height:48px;background:linear-gradient(135deg,${appConfig.PRIMARY_COLOR},#f59e0b);border-radius:12px;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:20px}.meta{color:#64748b;font-size:13px;margin-top:4px}@media print{body{margin:20px}}</style></head><body>
<div class="logo"><div class="logo-box">${appConfig.LOGO_LETTER}</div><div><div style="font-size:18px;font-weight:bold">${appConfig.APP_NAME}</div><div class="meta">Pasport — ${data.type === 'building' ? 'Budova' : data.type === 'room' ? 'Místnost' : 'Zařízení'}</div></div></div>
<h1>${data.name}</h1>
<p class="meta">Vytištěno: ${new Date().toLocaleDateString('cs-CZ')} ${new Date().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}</p>
<h2>Rodný list</h2><table>${fieldsHtml}</table>
${activeTasks.length > 0 ? `<h2>Otevřené úkoly (${activeTasks.length})</h2><table><tr style="background:#1e293b;color:white"><th style="padding:8px;text-align:left">Priorita</th><th style="padding:8px;text-align:left">Úkol</th><th style="padding:8px;text-align:left">Status</th></tr>${tasksHtml}</table>` : ''}
<script>setTimeout(()=>{window.print();window.close()},400)</script></body></html>`);
    w.document.close();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[10000] bg-slate-900/95 backdrop-blur-lg flex flex-col" onClick={(e) => e.stopPropagation()}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-slate-800/80 flex-shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 border border-white/15 text-white text-sm font-semibold hover:bg-white/15 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Zpět
        </button>
        <span className="text-sm text-slate-400 font-medium">PDF Pasport — {data.name}</span>
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white text-sm font-semibold hover:opacity-90 transition"
        >
          <Printer className="w-4 h-4" />
          Tisk / Stáhnout
        </button>
      </div>

      {/* Preview content */}
      <div className="flex-1 overflow-y-auto p-6 flex justify-center">
        <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl p-8 text-gray-800">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6 pb-4 border-b-2" style={{ borderColor: appConfig.PRIMARY_COLOR }}>
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-xl"
              style={{ background: `linear-gradient(135deg, ${appConfig.PRIMARY_COLOR}, #f59e0b)` }}
            >
              {appConfig.LOGO_LETTER}
            </div>
            <div>
              <div className="text-lg font-bold text-gray-900">{appConfig.APP_NAME}</div>
              <div className="text-sm text-gray-500">
                Pasport — {data.type === 'building' ? 'Budova' : data.type === 'room' ? 'Místnost' : 'Zařízení'}
              </div>
            </div>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-1">{data.name}</h1>
          <p className="text-xs text-gray-500 mb-6">
            Vytištěno: {new Date().toLocaleDateString('cs-CZ')} {new Date().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}
          </p>

          <h2 className="text-sm font-bold text-gray-700 uppercase mb-3">Rodný list</h2>
          <table className="w-full border-collapse mb-6">
            <tbody>
              {passportFields.map((f) => (
                <tr key={f.label}>
                  <td className="px-3 py-2 border border-gray-200 bg-gray-50 font-semibold text-sm w-36">{f.label}</td>
                  <td className="px-3 py-2 border border-gray-200 text-sm">{f.value}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {activeTasks.length > 0 && (
            <>
              <h2 className="text-sm font-bold text-gray-700 uppercase mb-3">Otevřené úkoly ({activeTasks.length})</h2>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-800 text-white">
                    <th className="px-3 py-2 text-left text-xs">Priorita</th>
                    <th className="px-3 py-2 text-left text-xs">Úkol</th>
                    <th className="px-3 py-2 text-left text-xs">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {activeTasks.slice(0, 15).map((t: any) => (
                    <tr key={t.id}>
                      <td className="px-3 py-1.5 border border-gray-200 text-sm">{t.priority || '—'}</td>
                      <td className="px-3 py-1.5 border border-gray-200 text-sm">{t.title}</td>
                      <td className="px-3 py-1.5 border border-gray-200 text-sm">{t.status || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// TAB 1: RODNÝ LIST (Passport) — Full edit form
// ═══════════════════════════════════════════════

function TabPassport({ data }: { data: EntityModalData }) {
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // Edit form state for asset
  const [editName, setEditName] = useState(data.name);
  const [editCode, setEditCode] = useState(data.code || '');
  const [editBuilding, setEditBuilding] = useState(data.buildingId);
  const [editRoom, setEditRoom] = useState(data.roomName || '');
  const [editCategory, setEditCategory] = useState(data.category || '');
  const [editStatus, setEditStatus] = useState(data.status || 'operational');
  const [editMotorHours, setEditMotorHours] = useState(String(data.asset?.motorHours || ''));
  const [editNextRevision, setEditNextRevision] = useState(data.asset?.nextRevision || '');

  // Sync when data changes (from live updates)
  useEffect(() => {
    if (!isEditing) {
      setEditName(data.name);
      setEditCode(data.code || '');
      setEditBuilding(data.buildingId);
      setEditRoom(data.roomName || '');
      setEditCategory(data.category || '');
      setEditStatus(data.status || 'operational');
      setEditMotorHours(String(data.asset?.motorHours || ''));
      setEditNextRevision(data.asset?.nextRevision || '');
    }
  }, [data, isEditing]);

  const handleSave = async () => {
    if (!data.asset) return;
    setSaving(true);
    setSaveMsg('');
    try {
      const updates: Record<string, any> = {
        name: editName.trim(),
        code: editCode.trim() || null,
        buildingId: editBuilding,
        areaName: editRoom.trim() || null,
        category: editCategory.trim() || null,
        status: editStatus,
        updatedAt: serverTimestamp(),
      };
      if (editMotorHours) updates.motorHours = Number(editMotorHours);
      if (editNextRevision) updates.nextRevision = editNextRevision;

      await updateDoc(doc(db, 'assets', data.asset.id), updates);
      setIsEditing(false);
      setSaveMsg('Uloženo');
      setTimeout(() => setSaveMsg(''), 2000);
    } catch (err) {
      console.error('[EntityModal] Save failed:', err);
      setSaveMsg('Chyba při ukládání');
    }
    setSaving(false);
  };

  const fields = data.type === 'asset' ? [
    { key: 'name', label: 'Název', value: data.name },
    { key: 'code', label: 'Inventární kód', value: data.code || '—' },
    { key: 'buildingId', label: 'Budova', value: BUILDING_NAMES[data.buildingId] || data.buildingId },
    { key: 'areaName', label: 'Místnost', value: data.roomName || '—' },
    { key: 'category', label: 'Kategorie', value: data.category || '—' },
    { key: 'status', label: 'Stav', value: STATUS_MAP[data.status || 'idle']?.label || data.status || '—' },
    ...(data.asset?.motorHours ? [{ key: 'motorHours', label: 'Motohodiny', value: `${data.asset.motorHours} Mth` }] : []),
    ...(data.asset?.nextRevision ? [{ key: 'nextRevision', label: 'Příští revize', value: data.asset.nextRevision }] : []),
  ] : data.type === 'room' ? [
    { key: 'name', label: 'Místnost', value: data.name },
    { key: 'building', label: 'Budova', value: BUILDING_NAMES[data.buildingId] || data.buildingId },
    { key: 'code', label: 'Kód', value: `${data.buildingId}-${data.name}` },
  ] : [
    { key: 'name', label: 'Budova', value: data.name },
    { key: 'id', label: 'Kód', value: data.buildingId },
  ];

  // Edit mode — full form
  if (isEditing && data.type === 'asset') {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs text-slate-500 uppercase font-bold">Upravit údaje</h3>
          <button onClick={() => setIsEditing(false)} className="text-xs text-slate-500 hover:text-white transition">Zrušit</button>
        </div>

        {[
          { label: 'Název', value: editName, onChange: setEditName, type: 'text' },
          { label: 'Inventární kód', value: editCode, onChange: setEditCode, type: 'text' },
          { label: 'Místnost', value: editRoom, onChange: setEditRoom, type: 'text' },
          { label: 'Kategorie', value: editCategory, onChange: setEditCategory, type: 'text' },
          { label: 'Motohodiny', value: editMotorHours, onChange: setEditMotorHours, type: 'number' },
          { label: 'Příští revize', value: editNextRevision, onChange: setEditNextRevision, type: 'date' },
        ].map((f) => (
          <div key={f.label} className="mb-3">
            <label className="block text-xs text-slate-500 font-medium mb-1">{f.label}</label>
            <input
              type={f.type}
              value={f.value}
              onChange={(e) => f.onChange(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-orange-500/50 transition min-h-[44px]"
            />
          </div>
        ))}

        {/* Budova — select */}
        <div className="mb-3">
          <label className="block text-xs text-slate-500 font-medium mb-1">Budova</label>
          <select
            value={editBuilding}
            onChange={(e) => setEditBuilding(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-orange-500/50 transition min-h-[44px]"
          >
            {BUILDING_OPTIONS.map((o) => (
              <option key={o.value} value={o.value} className="bg-slate-800">{o.label}</option>
            ))}
          </select>
        </div>

        {/* Stav — select */}
        <div className="mb-3">
          <label className="block text-xs text-slate-500 font-medium mb-1">Stav</label>
          <select
            value={editStatus}
            onChange={(e) => setEditStatus(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-orange-500/50 transition min-h-[44px]"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value} className="bg-slate-800">{o.label}</option>
            ))}
          </select>
        </div>

        {/* Save / Cancel footer */}
        <div className="flex items-center gap-3 pt-3 mt-2 border-t border-white/10">
          <button
            onClick={() => setIsEditing(false)}
            className="flex-1 py-3 rounded-2xl bg-white/5 border border-white/10 text-slate-400 font-semibold text-sm"
          >
            Zrušit
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !editName.trim()}
            className="flex-[2] py-3 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-40"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Ukládám...' : 'Uložit vše'}
          </button>
        </div>
      </div>
    );
  }

  // View mode
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs text-slate-500 uppercase font-bold">Základní údaje</h3>
        {data.type === 'asset' && (
          <button
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500/15 text-orange-400 text-xs font-semibold hover:bg-orange-500/25 transition"
          >
            <Edit2 className="w-3 h-3" />
            Upravit vše
          </button>
        )}
      </div>

      {saveMsg && (
        <div className={`p-2.5 rounded-xl text-sm text-center font-semibold ${
          saveMsg === 'Uloženo' ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400' : 'bg-red-500/20 border border-red-500/30 text-red-400'
        }`}>
          {saveMsg}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {fields.map((f) => (
          <div key={f.key} className="bg-slate-700/30 rounded-xl p-3">
            <div className="text-xs text-slate-500 mb-1">{f.label}</div>
            <div className="text-sm font-medium text-white">{f.value}</div>
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

  if (data.type === 'building') {
    return (
      <div className="space-y-2">
        <h3 className="text-xs text-slate-500 uppercase font-bold mb-2">Místnosti ({rooms.length})</h3>
        {rooms.length === 0 ? (
          <div className="text-sm text-slate-500 text-center py-4">Žádné místnosti</div>
        ) : rooms.map((room) => {
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
        })}
      </div>
    );
  }

  if (data.type === 'room') {
    return (
      <div className="space-y-2">
        <h3 className="text-xs text-slate-500 uppercase font-bold mb-2">Zařízení ({childAssets.length})</h3>
        {childAssets.length === 0 ? (
          <div className="text-sm text-slate-500 text-center py-4">Žádná zařízení</div>
        ) : childAssets.map((asset) => {
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
        })}
      </div>
    );
  }

  // Asset → spare parts
  return (
    <div className="space-y-2">
      <h3 className="text-xs text-slate-500 uppercase font-bold mb-2">Náhradní díly ({spareParts.length})</h3>
      {spareParts.length === 0 ? (
        <div className="text-sm text-slate-500 text-center py-4">Žádné propojené díly ve skladu</div>
      ) : spareParts.map((item: any) => (
        <div key={item.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.08]">
          <div className="w-9 h-9 rounded-lg bg-slate-700/50 flex items-center justify-center flex-shrink-0">
            <Package className="w-4 h-4 text-slate-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-white truncate">{item.name}</div>
            <div className="text-xs text-slate-500 font-mono">{item.code}</div>
          </div>
          <div className="text-right">
            <div className={`text-sm font-bold ${(item.quantity || 0) <= (item.minQuantity || 0) ? 'text-red-400' : 'text-emerald-400'}`}>
              {item.quantity || 0}
            </div>
            <div className="text-[10px] text-slate-500">{item.unit || 'ks'}</div>
          </div>
        </div>
      ))}
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

function TabMaintenance({ activeTasks, revisions, loading }: { activeTasks: any[]; revisions: any[]; loading: boolean }) {
  if (loading) {
    return <div className="flex items-center justify-center py-8 text-slate-500"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Načítám...</div>;
  }

  const upcomingRevisions = revisions.filter((r: any) => {
    const next = r.nextRevisionAt?.toDate?.() || (r.nextRevisionAt ? new Date(r.nextRevisionAt) : null);
    if (!next) return false;
    return Math.round((next.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) <= 90;
  });

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xs text-slate-500 uppercase font-bold mb-2">Otevřené úkoly ({activeTasks.length})</h3>
        {activeTasks.length === 0 ? (
          <div className="text-sm text-slate-500 text-center py-3">Žádné otevřené úkoly</div>
        ) : (
          <div className="space-y-2">
            {activeTasks.slice(0, 10).map((task: any) => {
              const pc = TASK_PRIORITY_COLORS[task.priority] || '#94a3b8';
              const sb = TASK_STATUS_LABELS[task.status] || TASK_STATUS_LABELS.backlog;
              return (
                <div key={task.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.08]">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: `${pc}20`, color: pc }}>{task.priority || 'P3'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">{task.title}</div>
                    {task.assigneeName && <div className="text-xs text-slate-500">{task.assigneeName}</div>}
                  </div>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-lg ${sb.bg} ${sb.text}`}>{sb.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {upcomingRevisions.length > 0 && (
        <div>
          <h3 className="text-xs text-slate-500 uppercase font-bold mb-2">Blížící se revize ({upcomingRevisions.length})</h3>
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
    return <div className="text-sm text-slate-500 text-center py-8">Zatím žádná historie</div>;
  }

  return (
    <div className="space-y-2">
      <h3 className="text-xs text-slate-500 uppercase font-bold mb-2">Dokončené úkoly ({sorted.length})</h3>
      {sorted.slice(0, 20).map((task: any) => {
        const date = task.completedAt?.toDate?.() || task.createdAt?.toDate?.();
        const dateStr = date ? date.toLocaleDateString('cs-CZ') : '—';
        return (
          <div key={task.id} className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.08]">
            <div className="w-2 h-2 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white">{task.title}</div>
              {task.resolution && <div className="text-xs text-slate-400 mt-1">{task.resolution}</div>}
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
