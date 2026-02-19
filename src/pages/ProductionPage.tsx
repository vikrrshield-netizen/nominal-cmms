// src/pages/ProductionPage.tsx
// Nominal CMMS — Production Planning: Extrusion & Packaging

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, addDoc, updateDoc, doc, onSnapshot,
  orderBy, query, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthContext } from '../context/AuthContext';
import {
  ArrowLeft, Loader2, Plus, X, Play, Square, Clock,
  Package, Cog, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import { showToast } from '../components/ui/Toast';
import MicButton from '../components/ui/MicButton';

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

type ActiveTab = 'extrusion' | 'packaging';

// -- Extrusion --
type ExtrusionStatus = 'planned' | 'running' | 'done';
interface ExtrusionBatch {
  id: string;
  batchId: string;
  rawMaterial: string;
  targetWeight: number;
  machineId: string;
  machineName: string;
  status: ExtrusionStatus;
  shiftLog: string;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  createdById: string;
  createdByName: string;
}

// -- Packaging --
type PackagingStatus = 'planned' | 'running' | 'done';
interface PackagingOrder {
  id: string;
  productId: string;
  packagingType: string;
  palletCount: number;
  lineId: string;
  lineName: string;
  deadline: string;
  status: PackagingStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  createdById: string;
  createdByName: string;
}

// -- Asset (for machine/line picker) --
interface SimpleAsset { id: string; name: string; code?: string; }

// ═══════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════

const STATUS_CFG: Record<string, { label: string; dot: string; bg: string; text: string }> = {
  planned: { label: 'Plánováno', dot: 'bg-blue-400',    bg: 'bg-blue-500/15',    text: 'text-blue-400' },
  running: { label: 'Probíhá',  dot: 'bg-amber-400 animate-pulse', bg: 'bg-amber-500/15', text: 'text-amber-400' },
  done:    { label: 'Hotovo',   dot: 'bg-emerald-400',  bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
};

const RAW_MATERIALS = [
  'Pšeničná mouka', 'Kukuřičný grít', 'Rýžová mouka',
  'Bramborový škrob', 'Směs A (standard)', 'Směs B (bezlepek)',
];

const PACKAGING_TYPES = [
  'Sáček 100g', 'Sáček 250g', 'Sáček 500g',
  'Krabice 1kg', 'Multipack 6ks', 'Big Bag 25kg',
];

// ═══════════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════════

function useExtrusionBatches() {
  const [batches, setBatches] = useState<ExtrusionBatch[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const q = query(collection(db, 'production_extrusion'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setBatches(snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          batchId: data.batchId || '',
          rawMaterial: data.rawMaterial || '',
          targetWeight: data.targetWeight || 0,
          machineId: data.machineId || '',
          machineName: data.machineName || '',
          status: data.status || 'planned',
          shiftLog: data.shiftLog || '',
          startedAt: data.startedAt instanceof Timestamp ? data.startedAt.toDate() : null,
          completedAt: data.completedAt instanceof Timestamp ? data.completedAt.toDate() : null,
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
          createdById: data.createdById || '',
          createdByName: data.createdByName || '',
        };
      }));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);
  return { batches, loading };
}

function usePackagingOrders() {
  const [orders, setOrders] = useState<PackagingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const q = query(collection(db, 'production_packaging'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setOrders(snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          productId: data.productId || '',
          packagingType: data.packagingType || '',
          palletCount: data.palletCount || 0,
          lineId: data.lineId || '',
          lineName: data.lineName || '',
          deadline: data.deadline || '',
          status: data.status || 'planned',
          startedAt: data.startedAt instanceof Timestamp ? data.startedAt.toDate() : null,
          completedAt: data.completedAt instanceof Timestamp ? data.completedAt.toDate() : null,
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
          createdById: data.createdById || '',
          createdByName: data.createdByName || '',
        };
      }));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);
  return { orders, loading };
}

function useAssetsPicker(category?: string) {
  const [assets, setAssets] = useState<SimpleAsset[]>([]);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'assets'), (snap) => {
      let all = snap.docs.map(d => ({
        id: d.id,
        name: d.data().name || '',
        code: d.data().code || '',
        category: d.data().category || '',
      }));
      if (category) all = all.filter(a => a.category === category);
      setAssets(all.sort((a, b) => a.name.localeCompare(b.name, 'cs')));
    });
    return () => unsub();
  }, [category]);
  return assets;
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function generateBatchId(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const seq = String(Math.floor(Math.random() * 900) + 100);
  return `EX-${y}${m}${d}-${seq}`;
}

function generateProductId(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const seq = String(Math.floor(Math.random() * 900) + 100);
  return `PK-${y}${m}${d}-${seq}`;
}

function formatDuration(start: Date | null, end: Date | null): string {
  if (!start) return '—';
  const to = end || new Date();
  const mins = Math.floor((to.getTime() - start.getTime()) / 60000);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rm = mins % 60;
  return `${hrs}h ${rm}m`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function ProductionPage() {
  const navigate = useNavigate();
  const { user, hasPermission } = useAuthContext();
  const canManage = hasPermission('production.manage');

  const [activeTab, setActiveTab] = useState<ActiveTab>('extrusion');

  // Extrusion
  const { batches, loading: loadingBatches } = useExtrusionBatches();
  const [showNewBatch, setShowNewBatch] = useState(false);
  const [batchForm, setBatchForm] = useState({ rawMaterial: '', targetWeight: '', machineId: '', machineName: '' });
  const [batchSaving, setBatchSaving] = useState(false);
  const [shiftLogId, setShiftLogId] = useState<string | null>(null);
  const [shiftLogText, setShiftLogText] = useState('');

  // Packaging
  const { orders, loading: loadingOrders } = usePackagingOrders();
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [orderForm, setOrderForm] = useState({ packagingType: '', palletCount: '', lineId: '', lineName: '', deadline: '' });
  const [orderSaving, setOrderSaving] = useState(false);

  // Machine filter for extrusion
  const [machineFilter, setMachineFilter] = useState<string>('ALL');

  // Asset pickers
  const extruderAssets = useAssetsPicker('extruder');
  const packagingAssets = useAssetsPicker('packaging');
  // Fallback: all assets if categories are empty
  const allAssets = useAssetsPicker();
  const extruderOptions = extruderAssets.length > 0 ? extruderAssets : allAssets;
  const packagingOptions = packagingAssets.length > 0 ? packagingAssets : allAssets;

  // Stats
  const extrusionStats = useMemo(() => ({
    total: batches.length,
    planned: batches.filter(b => b.status === 'planned').length,
    running: batches.filter(b => b.status === 'running').length,
    done: batches.filter(b => b.status === 'done').length,
  }), [batches]);

  const packagingStats = useMemo(() => ({
    total: orders.length,
    planned: orders.filter(o => o.status === 'planned').length,
    running: orders.filter(o => o.status === 'running').length,
    done: orders.filter(o => o.status === 'done').length,
  }), [orders]);

  // ── Extrusion actions ──
  const createBatch = async () => {
    if (!batchForm.rawMaterial || !batchForm.targetWeight) return;
    setBatchSaving(true);
    try {
      await addDoc(collection(db, 'production_extrusion'), {
        batchId: generateBatchId(),
        rawMaterial: batchForm.rawMaterial,
        targetWeight: Number(batchForm.targetWeight),
        machineId: batchForm.machineId,
        machineName: batchForm.machineName,
        status: 'planned',
        shiftLog: '',
        startedAt: null,
        completedAt: null,
        createdAt: serverTimestamp(),
        createdById: user?.uid || user?.id || '',
        createdByName: user?.displayName || 'Neznámý',
      });
      setShowNewBatch(false);
      setBatchForm({ rawMaterial: '', targetWeight: '', machineId: '', machineName: '' });
      showToast('Dávka vytvořena', 'success');
    } catch { showToast('Chyba při vytváření', 'error'); }
    setBatchSaving(false);
  };

  const startBatch = async (id: string) => {
    await updateDoc(doc(db, 'production_extrusion', id), { status: 'running', startedAt: serverTimestamp() });
    showToast('Extruze spuštěna', 'success');
  };

  const stopBatch = async (id: string) => {
    await updateDoc(doc(db, 'production_extrusion', id), { status: 'done', completedAt: serverTimestamp() });
    showToast('Extruze dokončena', 'success');
  };

  const saveShiftLog = async () => {
    if (!shiftLogId || !shiftLogText.trim()) return;
    await updateDoc(doc(db, 'production_extrusion', shiftLogId), { shiftLog: shiftLogText.trim() });
    setShiftLogId(null);
    setShiftLogText('');
    showToast('Směnový záznam uložen', 'success');
  };

  // ── Packaging actions ──
  const createOrder = async () => {
    if (!orderForm.packagingType || !orderForm.palletCount) return;
    setOrderSaving(true);
    try {
      await addDoc(collection(db, 'production_packaging'), {
        productId: generateProductId(),
        packagingType: orderForm.packagingType,
        palletCount: Number(orderForm.palletCount),
        lineId: orderForm.lineId,
        lineName: orderForm.lineName,
        deadline: orderForm.deadline,
        status: 'planned',
        startedAt: null,
        completedAt: null,
        createdAt: serverTimestamp(),
        createdById: user?.uid || user?.id || '',
        createdByName: user?.displayName || 'Neznámý',
      });
      setShowNewOrder(false);
      setOrderForm({ packagingType: '', palletCount: '', lineId: '', lineName: '', deadline: '' });
      showToast('Balicí zakázka vytvořena', 'success');
    } catch { showToast('Chyba při vytváření', 'error'); }
    setOrderSaving(false);
  };

  const startOrder = async (id: string) => {
    await updateDoc(doc(db, 'production_packaging', id), { status: 'running', startedAt: serverTimestamp() });
    showToast('Balení spuštěno', 'success');
  };

  const stopOrder = async (id: string) => {
    await updateDoc(doc(db, 'production_packaging', id), { status: 'done', completedAt: serverTimestamp() });
    showToast('Balení dokončeno', 'success');
  };

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  const loading = activeTab === 'extrusion' ? loadingBatches : loadingOrders;
  const stats = activeTab === 'extrusion' ? extrusionStats : packagingStats;

  return (
    <div className="min-h-screen bg-slate-900 pb-24">
      {/* Header */}
      <div className="bg-slate-800/80 backdrop-blur-sm border-b border-slate-700/50 px-4 py-4 sticky top-0 z-20">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition">
              <ArrowLeft className="w-5 h-5 text-slate-400" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-white">Výroba</h1>
              <p className="text-xs text-slate-500">Plánování extruze & balení</p>
            </div>
          </div>
          {canManage && (
            <button
              onClick={() => activeTab === 'extrusion' ? setShowNewBatch(true) : setShowNewOrder(true)}
              className="px-3 py-2 bg-orange-600 text-white text-sm font-semibold rounded-xl hover:bg-orange-500 transition flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">{activeTab === 'extrusion' ? 'Nová dávka' : 'Nová zakázka'}</span>
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white/5 p-1 rounded-xl">
          {[
            { id: 'extrusion' as const, label: 'Extrudovna', icon: Cog, count: extrusionStats.running },
            { id: 'packaging' as const, label: 'Balení', icon: Package, count: packagingStats.running },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition ${
                activeTab === tab.id ? 'bg-white text-slate-900' : 'text-slate-400 hover:text-white'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {tab.count > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  activeTab === tab.id ? 'bg-amber-200 text-amber-800' : 'bg-amber-500/20 text-amber-400'
                }`}>
                  {tab.count} ▶
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Stats bar */}
      <div className="max-w-2xl mx-auto px-4 pt-4">
        <div className="grid grid-cols-4 gap-1.5 mb-4">
          {[
            { value: stats.total, label: 'Celkem', color: '#94a3b8' },
            { value: stats.planned, label: 'Plánováno', color: '#60a5fa' },
            { value: stats.running, label: 'Probíhá', color: '#fbbf24' },
            { value: stats.done, label: 'Hotovo', color: '#34d399' },
          ].map(s => (
            <div key={s.label} className="text-center py-2 px-1 rounded-xl" style={{ background: `${s.color}10`, border: `1px solid ${s.color}15` }}>
              <div className="text-lg font-bold" style={{ color: s.color }}>{s.value}</div>
              <div className="text-[10px] text-slate-500">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Machine filter (extrusion only) */}
      {activeTab === 'extrusion' && (
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1">
            <button
              onClick={() => setMachineFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                machineFilter === 'ALL' ? 'bg-white text-slate-900' : 'bg-white/5 text-slate-400'
              }`}
            >
              Všechny stroje
            </button>
            {extruderOptions.map(a => (
              <button
                key={a.id}
                onClick={() => setMachineFilter(a.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                  machineFilter === a.id ? 'bg-white text-slate-900' : 'bg-white/5 text-slate-400'
                }`}
              >
                {a.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 space-y-3">
        {loading && (
          <div className="flex items-center justify-center py-16 text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Načítám...
          </div>
        )}

        {/* ═══ EXTRUSION TAB ═══ */}
        {activeTab === 'extrusion' && !loadingBatches && (() => {
          const filtered = machineFilter === 'ALL' ? batches : batches.filter(b => b.machineId === machineFilter);
          return (
          <>
            {filtered.length === 0 && (
              <EmptyBlock icon={<Cog className="w-14 h-14 text-slate-600" />} text={machineFilter === 'ALL' ? 'Žádné dávky' : 'Žádné dávky pro tento stroj'} sub="Vytvořte první extruzní dávku" />
            )}
            {filtered.map(batch => {
              const st = STATUS_CFG[batch.status];
              return (
                <div key={batch.id} className={`bg-slate-800/60 rounded-2xl border ${
                  batch.status === 'running' ? 'border-amber-500/30 ring-1 ring-amber-500/20' :
                  batch.status === 'done' ? 'border-emerald-500/20 opacity-70' : 'border-slate-700/40'
                } overflow-hidden`}>
                  {/* Card header */}
                  <div className={`px-4 py-2.5 ${st.bg} flex items-center justify-between`}>
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${st.dot}`} />
                      <span className={`text-xs font-bold ${st.text}`}>{st.label}</span>
                      <span className="text-xs text-slate-500 font-mono">{batch.batchId}</span>
                    </div>
                    {batch.status === 'running' && (
                      <span className="flex items-center gap-1 text-xs text-amber-400 font-semibold">
                        <Clock className="w-3 h-3" />
                        {formatDuration(batch.startedAt, null)}
                      </span>
                    )}
                    {batch.status === 'done' && batch.startedAt && (
                      <span className="flex items-center gap-1 text-xs text-emerald-400">
                        <CheckCircle2 className="w-3 h-3" />
                        {formatDuration(batch.startedAt, batch.completedAt)}
                      </span>
                    )}
                  </div>

                  {/* Card body */}
                  <div className="px-4 py-3">
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase">Surovina</div>
                        <div className="text-sm font-medium text-white">{batch.rawMaterial}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase">Hmotnost</div>
                        <div className="text-sm font-medium text-white">{batch.targetWeight} kg</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase">Stroj</div>
                        <div className="text-sm font-medium text-white">{batch.machineName || '—'}</div>
                      </div>
                    </div>

                    {/* Shift log */}
                    {batch.shiftLog && (
                      <div className="bg-slate-700/30 rounded-xl p-2.5 mb-3">
                        <div className="text-[10px] text-slate-500 uppercase mb-1">Směnový záznam</div>
                        <p className="text-xs text-slate-300 whitespace-pre-wrap">{batch.shiftLog}</p>
                      </div>
                    )}

                    {/* Actions */}
                    {canManage && (
                      <div className="flex gap-2">
                        {batch.status === 'planned' && (
                          <button onClick={() => startBatch(batch.id)}
                            className="flex-1 py-2.5 bg-amber-500/15 border border-amber-500/30 text-amber-400 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-amber-500/25 transition active:scale-[0.97]">
                            <Play className="w-3.5 h-3.5" /> Start
                          </button>
                        )}
                        {batch.status === 'running' && (
                          <button onClick={() => stopBatch(batch.id)}
                            className="flex-1 py-2.5 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-emerald-500/25 transition active:scale-[0.97]">
                            <Square className="w-3.5 h-3.5" /> Dokončit
                          </button>
                        )}
                        {batch.status !== 'done' && (
                          <button onClick={() => { setShiftLogId(batch.id); setShiftLogText(batch.shiftLog || ''); }}
                            className="py-2.5 px-3 bg-white/5 border border-white/10 text-slate-400 rounded-xl text-xs font-semibold hover:text-white transition">
                            Záznam
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="px-4 pb-3 flex items-center gap-2 text-[11px] text-slate-500">
                    <span>{batch.createdByName}</span>
                    <span>·</span>
                    <span>{formatDate(batch.createdAt)}</span>
                  </div>
                </div>
              );
            })}
          </>
          );
        })()}

        {/* ═══ PACKAGING TAB ═══ */}
        {activeTab === 'packaging' && !loadingOrders && (
          <>
            {orders.length === 0 && (
              <EmptyBlock icon={<Package className="w-14 h-14 text-slate-600" />} text="Žádné zakázky" sub="Vytvořte první balicí zakázku" />
            )}
            {orders.map(order => {
              const st = STATUS_CFG[order.status];
              const isOverdue = order.deadline && new Date(order.deadline) < new Date() && order.status !== 'done';
              return (
                <div key={order.id} className={`bg-slate-800/60 rounded-2xl border ${
                  isOverdue ? 'border-red-500/30 ring-1 ring-red-500/20' :
                  order.status === 'running' ? 'border-amber-500/30 ring-1 ring-amber-500/20' :
                  order.status === 'done' ? 'border-emerald-500/20 opacity-70' : 'border-slate-700/40'
                } overflow-hidden`}>
                  {/* Card header */}
                  <div className={`px-4 py-2.5 ${isOverdue ? 'bg-red-500/15' : st.bg} flex items-center justify-between`}>
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${isOverdue ? 'bg-red-400 animate-pulse' : st.dot}`} />
                      <span className={`text-xs font-bold ${isOverdue ? 'text-red-400' : st.text}`}>
                        {isOverdue ? 'Po termínu!' : st.label}
                      </span>
                      <span className="text-xs text-slate-500 font-mono">{order.productId}</span>
                    </div>
                    {order.status === 'running' && (
                      <span className="flex items-center gap-1 text-xs text-amber-400 font-semibold">
                        <Clock className="w-3 h-3" />
                        {formatDuration(order.startedAt, null)}
                      </span>
                    )}
                    {order.status === 'done' && order.startedAt && (
                      <span className="flex items-center gap-1 text-xs text-emerald-400">
                        <CheckCircle2 className="w-3 h-3" />
                        {formatDuration(order.startedAt, order.completedAt)}
                      </span>
                    )}
                  </div>

                  {/* Card body */}
                  <div className="px-4 py-3">
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase">Balení</div>
                        <div className="text-sm font-medium text-white">{order.packagingType}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase">Palet</div>
                        <div className="text-sm font-medium text-white">{order.palletCount}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase">Linka</div>
                        <div className="text-sm font-medium text-white">{order.lineName || '—'}</div>
                      </div>
                    </div>

                    {order.deadline && (
                      <div className={`flex items-center gap-1.5 mb-3 text-xs font-medium ${isOverdue ? 'text-red-400' : 'text-slate-400'}`}>
                        {isOverdue && <AlertTriangle className="w-3.5 h-3.5" />}
                        <Clock className="w-3.5 h-3.5" />
                        Deadline: {new Date(order.deadline).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    )}

                    {/* Actions */}
                    {canManage && (
                      <div className="flex gap-2">
                        {order.status === 'planned' && (
                          <button onClick={() => startOrder(order.id)}
                            className="flex-1 py-2.5 bg-amber-500/15 border border-amber-500/30 text-amber-400 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-amber-500/25 transition active:scale-[0.97]">
                            <Play className="w-3.5 h-3.5" /> Start
                          </button>
                        )}
                        {order.status === 'running' && (
                          <button onClick={() => stopOrder(order.id)}
                            className="flex-1 py-2.5 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-emerald-500/25 transition active:scale-[0.97]">
                            <Square className="w-3.5 h-3.5" /> Dokončit
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="px-4 pb-3 flex items-center gap-2 text-[11px] text-slate-500">
                    <span>{order.createdByName}</span>
                    <span>·</span>
                    <span>{formatDate(order.createdAt)}</span>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* ═══ NEW EXTRUSION BATCH MODAL ═══ */}
      {showNewBatch && (
        <ModalShell title="Nová extruzní dávka" icon={<Cog className="w-5 h-5 text-orange-400" />} onClose={() => setShowNewBatch(false)}>
          <div className="space-y-4">
            <Field label="Surovina">
              <select value={batchForm.rawMaterial} onChange={e => setBatchForm(p => ({ ...p, rawMaterial: e.target.value }))}
                className={SEL_CLS} style={{ appearance: 'auto' }}>
                <option value="" className="bg-slate-800">— vybrat —</option>
                {RAW_MATERIALS.map(m => <option key={m} value={m} className="bg-slate-800">{m}</option>)}
              </select>
            </Field>
            <Field label="Cílová hmotnost (kg)">
              <input type="number" min="0" value={batchForm.targetWeight}
                onChange={e => setBatchForm(p => ({ ...p, targetWeight: e.target.value }))}
                placeholder="500" className={INP_CLS} />
            </Field>
            <Field label="Extruder">
              <select value={batchForm.machineId} onChange={e => {
                const asset = extruderOptions.find(a => a.id === e.target.value);
                setBatchForm(p => ({ ...p, machineId: e.target.value, machineName: asset?.name || '' }));
              }} className={SEL_CLS} style={{ appearance: 'auto' }}>
                <option value="" className="bg-slate-800">— vybrat stroj —</option>
                {extruderOptions.map(a => <option key={a.id} value={a.id} className="bg-slate-800">{a.name}{a.code ? ` (${a.code})` : ''}</option>)}
              </select>
            </Field>
            <button onClick={createBatch} disabled={!batchForm.rawMaterial || !batchForm.targetWeight || batchSaving}
              className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-2xl font-bold disabled:opacity-50 flex items-center justify-center gap-2 transition active:scale-[0.98]">
              {batchSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
              {batchSaving ? 'Ukládám...' : 'Vytvořit dávku'}
            </button>
          </div>
        </ModalShell>
      )}

      {/* ═══ NEW PACKAGING ORDER MODAL ═══ */}
      {showNewOrder && (
        <ModalShell title="Nová balicí zakázka" icon={<Package className="w-5 h-5 text-blue-400" />} onClose={() => setShowNewOrder(false)}>
          <div className="space-y-4">
            <Field label="Typ balení">
              <select value={orderForm.packagingType} onChange={e => setOrderForm(p => ({ ...p, packagingType: e.target.value }))}
                className={SEL_CLS} style={{ appearance: 'auto' }}>
                <option value="" className="bg-slate-800">— vybrat —</option>
                {PACKAGING_TYPES.map(t => <option key={t} value={t} className="bg-slate-800">{t}</option>)}
              </select>
            </Field>
            <Field label="Počet palet">
              <input type="number" min="1" value={orderForm.palletCount}
                onChange={e => setOrderForm(p => ({ ...p, palletCount: e.target.value }))}
                placeholder="10" className={INP_CLS} />
            </Field>
            <Field label="Balicí linka">
              <select value={orderForm.lineId} onChange={e => {
                const asset = packagingOptions.find(a => a.id === e.target.value);
                setOrderForm(p => ({ ...p, lineId: e.target.value, lineName: asset?.name || '' }));
              }} className={SEL_CLS} style={{ appearance: 'auto' }}>
                <option value="" className="bg-slate-800">— vybrat linku —</option>
                {packagingOptions.map(a => <option key={a.id} value={a.id} className="bg-slate-800">{a.name}{a.code ? ` (${a.code})` : ''}</option>)}
              </select>
            </Field>
            <Field label="Deadline">
              <input type="date" value={orderForm.deadline}
                onChange={e => setOrderForm(p => ({ ...p, deadline: e.target.value }))}
                className={INP_CLS} />
            </Field>
            <button onClick={createOrder} disabled={!orderForm.packagingType || !orderForm.palletCount || orderSaving}
              className="w-full py-3.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-2xl font-bold disabled:opacity-50 flex items-center justify-center gap-2 transition active:scale-[0.98]">
              {orderSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
              {orderSaving ? 'Ukládám...' : 'Vytvořit zakázku'}
            </button>
          </div>
        </ModalShell>
      )}

      {/* ═══ SHIFT LOG MODAL ═══ */}
      {shiftLogId && (
        <ModalShell title="Směnový záznam" icon={<Clock className="w-5 h-5 text-slate-400" />} onClose={() => setShiftLogId(null)}>
          <div className="space-y-4">
            <div className="flex gap-2 items-start">
              <textarea
                value={shiftLogText}
                onChange={e => setShiftLogText(e.target.value)}
                placeholder="Poznámky k extruzi — teplota, vlhkost, problémy..."
                rows={5}
                autoFocus
                className={INP_CLS + ' resize-none'}
              />
              <div className="pt-2">
                <MicButton onTranscript={t => setShiftLogText(prev => prev ? prev + ' ' + t : t)} />
              </div>
            </div>
            <button onClick={saveShiftLog} disabled={!shiftLogText.trim()}
              className="w-full py-3.5 bg-gradient-to-r from-slate-500 to-slate-600 text-white rounded-2xl font-bold disabled:opacity-50 flex items-center justify-center gap-2 transition active:scale-[0.98]">
              Uložit záznam
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SHARED UI HELPERS
// ═══════════════════════════════════════════════════════════════════

const INP_CLS = 'w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-orange-500/50 transition';
const SEL_CLS = INP_CLS;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm text-slate-400 font-medium mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function EmptyBlock({ icon, text, sub }: { icon: React.ReactNode; text: string; sub: string }) {
  return (
    <div className="text-center py-16">
      {icon}
      <h3 className="text-lg font-bold text-white mt-3 mb-1">{text}</h3>
      <p className="text-slate-500 text-sm">{sub}</p>
    </div>
  );
}

function ModalShell({ title, icon, onClose, children }: {
  title: string; icon: React.ReactNode; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[9999] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-slate-800 rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-white/10"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            {icon}
            <h2 className="text-xl font-bold text-white">{title}</h2>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
