// src/pages/WarehousePage.tsx
// Nominal CMMS — Production Warehouse: Příjem, Zásoby, Expedice

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, addDoc, updateDoc, doc, onSnapshot,
  orderBy, query, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthContext } from '../context/AuthContext';
import {
  ArrowLeft, Loader2, Plus, X, Package, TruckIcon,
  Warehouse, CheckCircle2, ArrowDownToLine, Boxes, ArrowUpFromLine,
} from 'lucide-react';
import { showToast } from '../components/ui/Toast';

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

type WarehouseTab = 'prijem' | 'zasoby' | 'expedice';
type ReceiptStatus = 'pending' | 'accepted' | 'rejected';
type ShipmentStatus = 'planned' | 'loading' | 'shipped';

interface WarehouseReceipt {
  id: string;
  materialName: string;
  quantity: number;
  unit: string;
  supplier: string;
  status: ReceiptStatus;
  note: string;
  createdAt: Date;
  createdByName: string;
}

interface WarehouseStock {
  id: string;
  materialName: string;
  quantity: number;
  unit: string;
  category: 'raw' | 'semi' | 'finished';
  location: string;
  minQuantity: number;
  updatedAt: Date;
}

interface WarehouseShipment {
  id: string;
  productName: string;
  palletCount: number;
  destination: string;
  status: ShipmentStatus;
  scheduledDate: string;
  note: string;
  createdAt: Date;
  createdByName: string;
}

// ═══════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════

const RECEIPT_STATUS: Record<ReceiptStatus, { label: string; dot: string; bg: string; text: string }> = {
  pending:  { label: 'Čeká',      dot: 'bg-amber-400',   bg: 'bg-amber-500/15', text: 'text-amber-400' },
  accepted: { label: 'Přijato',   dot: 'bg-emerald-400', bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
  rejected: { label: 'Odmítnuto', dot: 'bg-red-400',     bg: 'bg-red-500/15',   text: 'text-red-400' },
};

const SHIPMENT_STATUS: Record<ShipmentStatus, { label: string; dot: string; bg: string; text: string }> = {
  planned: { label: 'Plánováno', dot: 'bg-blue-400',    bg: 'bg-blue-500/15',    text: 'text-blue-400' },
  loading: { label: 'Nakládka',  dot: 'bg-amber-400 animate-pulse', bg: 'bg-amber-500/15', text: 'text-amber-400' },
  shipped: { label: 'Odesláno',  dot: 'bg-emerald-400', bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
};

const STOCK_CATEGORIES: Record<string, { label: string; color: string }> = {
  raw:      { label: 'Surovina',   color: 'text-amber-400' },
  semi:     { label: 'Polotovar',  color: 'text-blue-400' },
  finished: { label: 'Hotový výr.', color: 'text-emerald-400' },
};

const UNITS = ['kg', 't', 'ks', 'pal', 'bal', 'l'];

// ═══════════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════════

function useReceipts() {
  const [items, setItems] = useState<WarehouseReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const q = query(collection(db, 'warehouse_receipts'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setItems(snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          materialName: data.materialName || '',
          quantity: data.quantity || 0,
          unit: data.unit || 'kg',
          supplier: data.supplier || '',
          status: data.status || 'pending',
          note: data.note || '',
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
          createdByName: data.createdByName || '',
        };
      }));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);
  return { items, loading };
}

function useStock() {
  const [items, setItems] = useState<WarehouseStock[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const q = query(collection(db, 'warehouse_stock'), orderBy('materialName', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setItems(snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          materialName: data.materialName || '',
          quantity: data.quantity || 0,
          unit: data.unit || 'kg',
          category: data.category || 'raw',
          location: data.location || '',
          minQuantity: data.minQuantity || 0,
          updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : new Date(),
        };
      }));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);
  return { items, loading };
}

function useShipments() {
  const [items, setItems] = useState<WarehouseShipment[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const q = query(collection(db, 'warehouse_shipments'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setItems(snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          productName: data.productName || '',
          palletCount: data.palletCount || 0,
          destination: data.destination || '',
          status: data.status || 'planned',
          scheduledDate: data.scheduledDate || '',
          note: data.note || '',
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
          createdByName: data.createdByName || '',
        };
      }));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);
  return { items, loading };
}

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function WarehousePage() {
  const navigate = useNavigate();
  const { user, hasPermission } = useAuthContext();
  const canView = hasPermission('warehouse.view');

  const [activeTab, setActiveTab] = useState<WarehouseTab>('zasoby');

  // Data
  const { items: receipts, loading: loadingR } = useReceipts();
  const { items: stock, loading: loadingS } = useStock();
  const { items: shipments, loading: loadingSh } = useShipments();

  // Modals
  const [showNewReceipt, setShowNewReceipt] = useState(false);
  const [showNewShipment, setShowNewShipment] = useState(false);
  const [showNewStock, setShowNewStock] = useState(false);

  // Forms
  const [receiptForm, setReceiptForm] = useState({ materialName: '', quantity: '', unit: 'kg', supplier: '', note: '' });
  const [stockForm, setStockForm] = useState({ materialName: '', quantity: '', unit: 'kg', category: 'raw' as string, location: '', minQuantity: '' });
  const [shipmentForm, setShipmentForm] = useState({ productName: '', palletCount: '', destination: '', scheduledDate: '', note: '' });
  const [saving, setSaving] = useState(false);

  // Stats
  const stockStats = useMemo(() => ({
    totalRaw: stock.filter(s => s.category === 'raw').reduce((a, s) => a + s.quantity, 0),
    totalFinished: stock.filter(s => s.category === 'finished').reduce((a, s) => a + s.quantity, 0),
    lowStock: stock.filter(s => s.quantity <= s.minQuantity && s.minQuantity > 0).length,
    pendingReceipts: receipts.filter(r => r.status === 'pending').length,
  }), [stock, receipts]);

  if (!canView) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
        <div className="bg-red-500/20 border border-red-500/30 rounded-2xl p-8 text-center max-w-md">
          <Package className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Přístup odepřen</h2>
          <p className="text-slate-400 mb-4">Nemáte oprávnění pro Sklad výroby</p>
          <button onClick={() => navigate('/')} className="px-6 py-2 bg-slate-700 text-white rounded-xl hover:bg-slate-600">Zpět</button>
        </div>
      </div>
    );
  }

  // ── Actions ──
  const createReceipt = async () => {
    if (!receiptForm.materialName || !receiptForm.quantity) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'warehouse_receipts'), {
        ...receiptForm,
        quantity: Number(receiptForm.quantity),
        status: 'pending',
        createdAt: serverTimestamp(),
        createdById: user?.uid || '',
        createdByName: user?.displayName || '',
      });
      setShowNewReceipt(false);
      setReceiptForm({ materialName: '', quantity: '', unit: 'kg', supplier: '', note: '' });
      showToast('Příjem zaznamenán', 'success');
    } catch { showToast('Chyba', 'error'); }
    setSaving(false);
  };

  const acceptReceipt = async (id: string) => {
    await updateDoc(doc(db, 'warehouse_receipts', id), { status: 'accepted' });
    showToast('Příjem schválen', 'success');
  };

  const createStock = async () => {
    if (!stockForm.materialName || !stockForm.quantity) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'warehouse_stock'), {
        ...stockForm,
        quantity: Number(stockForm.quantity),
        minQuantity: Number(stockForm.minQuantity) || 0,
        updatedAt: serverTimestamp(),
      });
      setShowNewStock(false);
      setStockForm({ materialName: '', quantity: '', unit: 'kg', category: 'raw', location: '', minQuantity: '' });
      showToast('Položka skladu přidána', 'success');
    } catch { showToast('Chyba', 'error'); }
    setSaving(false);
  };

  const createShipment = async () => {
    if (!shipmentForm.productName || !shipmentForm.palletCount) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'warehouse_shipments'), {
        ...shipmentForm,
        palletCount: Number(shipmentForm.palletCount),
        status: 'planned',
        createdAt: serverTimestamp(),
        createdById: user?.uid || '',
        createdByName: user?.displayName || '',
      });
      setShowNewShipment(false);
      setShipmentForm({ productName: '', palletCount: '', destination: '', scheduledDate: '', note: '' });
      showToast('Expedice naplánována', 'success');
    } catch { showToast('Chyba', 'error'); }
    setSaving(false);
  };

  const advanceShipment = async (id: string, current: ShipmentStatus) => {
    const next: Record<ShipmentStatus, ShipmentStatus> = { planned: 'loading', loading: 'shipped', shipped: 'shipped' };
    await updateDoc(doc(db, 'warehouse_shipments', id), { status: next[current] });
    showToast(next[current] === 'loading' ? 'Nakládka zahájena' : 'Odesláno', 'success');
  };

  const loading = activeTab === 'prijem' ? loadingR : activeTab === 'zasoby' ? loadingS : loadingSh;

  const TABS: { id: WarehouseTab; label: string; icon: typeof ArrowDownToLine; count: number }[] = [
    { id: 'prijem', label: 'Příjem', icon: ArrowDownToLine, count: stockStats.pendingReceipts },
    { id: 'zasoby', label: 'Zásoby', icon: Boxes, count: stockStats.lowStock },
    { id: 'expedice', label: 'Expedice', icon: ArrowUpFromLine, count: shipments.filter(s => s.status !== 'shipped').length },
  ];

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
              <h1 className="text-lg font-bold text-white">Sklad výroby</h1>
              <p className="text-xs text-slate-500">Příjem, zásoby, expedice</p>
            </div>
          </div>
          <button
            onClick={() => {
              if (activeTab === 'prijem') setShowNewReceipt(true);
              else if (activeTab === 'zasoby') setShowNewStock(true);
              else setShowNewShipment(true);
            }}
            className="px-3 py-2 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-500 transition flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Přidat</span>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white/5 p-1 rounded-xl">
          {TABS.map(tab => (
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
                }`}>{tab.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Stats bar */}
      <div className="max-w-2xl mx-auto px-4 pt-4">
        <div className="grid grid-cols-4 gap-1.5 mb-4">
          {[
            { value: `${stockStats.totalRaw}`, label: 'Suroviny (kg)', color: '#fbbf24' },
            { value: `${stockStats.totalFinished}`, label: 'Hotové (ks)', color: '#34d399' },
            { value: `${stockStats.lowStock}`, label: 'Pod min.', color: '#f87171' },
            { value: `${stockStats.pendingReceipts}`, label: 'Čeká příjem', color: '#60a5fa' },
          ].map(s => (
            <div key={s.label} className="text-center py-2 px-1 rounded-xl" style={{ background: `${s.color}10`, border: `1px solid ${s.color}15` }}>
              <div className="text-lg font-bold" style={{ color: s.color }}>{s.value}</div>
              <div className="text-[10px] text-slate-500">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 space-y-3">
        {loading && (
          <div className="flex items-center justify-center py-16 text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Načítám...
          </div>
        )}

        {/* ═══ PŘÍJEM ═══ */}
        {activeTab === 'prijem' && !loadingR && (
          <>
            {receipts.length === 0 && <EmptyState icon={<ArrowDownToLine className="w-14 h-14 text-slate-600" />} text="Žádné příjmy" sub="Zaznamenejte příjem materiálu" />}
            {receipts.map(r => {
              const st = RECEIPT_STATUS[r.status];
              return (
                <div key={r.id} className="bg-slate-800/60 rounded-2xl border border-slate-700/40 overflow-hidden">
                  <div className={`px-4 py-2.5 ${st.bg} flex items-center justify-between`}>
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${st.dot}`} />
                      <span className={`text-xs font-bold ${st.text}`}>{st.label}</span>
                    </div>
                    <span className="text-[11px] text-slate-500">{r.createdAt.toLocaleDateString('cs-CZ')}</span>
                  </div>
                  <div className="px-4 py-3">
                    <div className="grid grid-cols-3 gap-3 mb-2">
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase">Materiál</div>
                        <div className="text-sm font-medium text-white">{r.materialName}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase">Množství</div>
                        <div className="text-sm font-medium text-white">{r.quantity} {r.unit}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase">Dodavatel</div>
                        <div className="text-sm font-medium text-white">{r.supplier || '—'}</div>
                      </div>
                    </div>
                    {r.note && <p className="text-xs text-slate-400 mb-2">{r.note}</p>}
                    {r.status === 'pending' && (
                      <button onClick={() => acceptReceipt(r.id)}
                        className="w-full py-2.5 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-emerald-500/25 transition">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Potvrdit příjem
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* ═══ ZÁSOBY ═══ */}
        {activeTab === 'zasoby' && !loadingS && (
          <>
            {stock.length === 0 && <EmptyState icon={<Boxes className="w-14 h-14 text-slate-600" />} text="Žádné zásoby" sub="Přidejte položky skladu" />}
            {stock.map(s => {
              const isLow = s.minQuantity > 0 && s.quantity <= s.minQuantity;
              const cat = STOCK_CATEGORIES[s.category] || STOCK_CATEGORIES.raw;
              return (
                <div key={s.id} className={`bg-slate-800/60 rounded-2xl border ${isLow ? 'border-red-500/30 ring-1 ring-red-500/20' : 'border-slate-700/40'} p-4`}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="text-sm font-bold text-white">{s.materialName}</div>
                      <span className={`text-[10px] font-semibold ${cat.color}`}>{cat.label}</span>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-bold ${isLow ? 'text-red-400' : 'text-white'}`}>{s.quantity} {s.unit}</div>
                      {s.minQuantity > 0 && (
                        <div className="text-[10px] text-slate-500">min: {s.minQuantity} {s.unit}</div>
                      )}
                    </div>
                  </div>
                  {s.location && (
                    <div className="text-[11px] text-slate-500 flex items-center gap-1">
                      <Warehouse className="w-3 h-3" /> {s.location}
                    </div>
                  )}
                  {isLow && (
                    <div className="mt-2 px-2 py-1 bg-red-500/10 border border-red-500/20 rounded-lg text-[11px] text-red-400 font-semibold text-center">
                      Pod minimem!
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {/* ═══ EXPEDICE ═══ */}
        {activeTab === 'expedice' && !loadingSh && (
          <>
            {shipments.length === 0 && <EmptyState icon={<TruckIcon className="w-14 h-14 text-slate-600" />} text="Žádné expedice" sub="Naplánujte expedici" />}
            {shipments.map(s => {
              const st = SHIPMENT_STATUS[s.status];
              return (
                <div key={s.id} className={`bg-slate-800/60 rounded-2xl border ${
                  s.status === 'shipped' ? 'border-emerald-500/20 opacity-70' : 'border-slate-700/40'
                } overflow-hidden`}>
                  <div className={`px-4 py-2.5 ${st.bg} flex items-center justify-between`}>
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${st.dot}`} />
                      <span className={`text-xs font-bold ${st.text}`}>{st.label}</span>
                    </div>
                    {s.scheduledDate && <span className="text-[11px] text-slate-500">{new Date(s.scheduledDate).toLocaleDateString('cs-CZ')}</span>}
                  </div>
                  <div className="px-4 py-3">
                    <div className="grid grid-cols-3 gap-3 mb-2">
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase">Produkt</div>
                        <div className="text-sm font-medium text-white">{s.productName}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase">Palet</div>
                        <div className="text-sm font-medium text-white">{s.palletCount}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase">Cíl</div>
                        <div className="text-sm font-medium text-white">{s.destination || '—'}</div>
                      </div>
                    </div>
                    {s.note && <p className="text-xs text-slate-400 mb-2">{s.note}</p>}
                    {s.status !== 'shipped' && (
                      <button onClick={() => advanceShipment(s.id, s.status)}
                        className="w-full py-2.5 bg-blue-500/15 border border-blue-500/30 text-blue-400 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-blue-500/25 transition">
                        {s.status === 'planned' ? <><TruckIcon className="w-3.5 h-3.5" /> Zahájit nakládku</> : <><ArrowUpFromLine className="w-3.5 h-3.5" /> Odeslat</>}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* ═══ NEW RECEIPT MODAL ═══ */}
      {showNewReceipt && (
        <ModalShell title="Nový příjem" icon={<ArrowDownToLine className="w-5 h-5 text-teal-400" />} onClose={() => setShowNewReceipt(false)}>
          <div className="space-y-4">
            <Field label="Materiál">
              <input value={receiptForm.materialName} onChange={e => setReceiptForm(p => ({ ...p, materialName: e.target.value }))}
                placeholder="Pšeničná mouka" className={INP_CLS} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Množství">
                <input type="number" min="0" value={receiptForm.quantity} onChange={e => setReceiptForm(p => ({ ...p, quantity: e.target.value }))}
                  placeholder="500" className={INP_CLS} />
              </Field>
              <Field label="Jednotka">
                <select value={receiptForm.unit} onChange={e => setReceiptForm(p => ({ ...p, unit: e.target.value }))}
                  className={INP_CLS} style={{ appearance: 'auto' }}>
                  {UNITS.map(u => <option key={u} value={u} className="bg-slate-800">{u}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Dodavatel">
              <input value={receiptForm.supplier} onChange={e => setReceiptForm(p => ({ ...p, supplier: e.target.value }))}
                placeholder="Mlýn Kozlov" className={INP_CLS} />
            </Field>
            <Field label="Poznámka">
              <input value={receiptForm.note} onChange={e => setReceiptForm(p => ({ ...p, note: e.target.value }))}
                placeholder="Šarže, kvalita..." className={INP_CLS} />
            </Field>
            <button onClick={createReceipt} disabled={!receiptForm.materialName || !receiptForm.quantity || saving}
              className="w-full py-3.5 bg-gradient-to-r from-teal-500 to-emerald-500 text-white rounded-2xl font-bold disabled:opacity-50 flex items-center justify-center gap-2 transition active:scale-[0.98]">
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
              {saving ? 'Ukládám...' : 'Zaznamenat příjem'}
            </button>
          </div>
        </ModalShell>
      )}

      {/* ═══ NEW STOCK MODAL ═══ */}
      {showNewStock && (
        <ModalShell title="Nová položka skladu" icon={<Boxes className="w-5 h-5 text-blue-400" />} onClose={() => setShowNewStock(false)}>
          <div className="space-y-4">
            <Field label="Název materiálu">
              <input value={stockForm.materialName} onChange={e => setStockForm(p => ({ ...p, materialName: e.target.value }))}
                placeholder="Kukuřičný grít" className={INP_CLS} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Množství">
                <input type="number" min="0" value={stockForm.quantity} onChange={e => setStockForm(p => ({ ...p, quantity: e.target.value }))}
                  className={INP_CLS} />
              </Field>
              <Field label="Jednotka">
                <select value={stockForm.unit} onChange={e => setStockForm(p => ({ ...p, unit: e.target.value }))}
                  className={INP_CLS} style={{ appearance: 'auto' }}>
                  {UNITS.map(u => <option key={u} value={u} className="bg-slate-800">{u}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Kategorie">
              <select value={stockForm.category} onChange={e => setStockForm(p => ({ ...p, category: e.target.value }))}
                className={INP_CLS} style={{ appearance: 'auto' }}>
                {Object.entries(STOCK_CATEGORIES).map(([k, v]) => <option key={k} value={k} className="bg-slate-800">{v.label}</option>)}
              </select>
            </Field>
            <Field label="Umístění">
              <input value={stockForm.location} onChange={e => setStockForm(p => ({ ...p, location: e.target.value }))}
                placeholder="Hala D, regál 3" className={INP_CLS} />
            </Field>
            <Field label="Minimální množství">
              <input type="number" min="0" value={stockForm.minQuantity} onChange={e => setStockForm(p => ({ ...p, minQuantity: e.target.value }))}
                placeholder="100" className={INP_CLS} />
            </Field>
            <button onClick={createStock} disabled={!stockForm.materialName || !stockForm.quantity || saving}
              className="w-full py-3.5 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-2xl font-bold disabled:opacity-50 flex items-center justify-center gap-2 transition active:scale-[0.98]">
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
              {saving ? 'Ukládám...' : 'Přidat do skladu'}
            </button>
          </div>
        </ModalShell>
      )}

      {/* ═══ NEW SHIPMENT MODAL ═══ */}
      {showNewShipment && (
        <ModalShell title="Nová expedice" icon={<TruckIcon className="w-5 h-5 text-blue-400" />} onClose={() => setShowNewShipment(false)}>
          <div className="space-y-4">
            <Field label="Produkt">
              <input value={shipmentForm.productName} onChange={e => setShipmentForm(p => ({ ...p, productName: e.target.value }))}
                placeholder="Tyčinky kukuřičné 250g" className={INP_CLS} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Počet palet">
                <input type="number" min="1" value={shipmentForm.palletCount} onChange={e => setShipmentForm(p => ({ ...p, palletCount: e.target.value }))}
                  className={INP_CLS} />
              </Field>
              <Field label="Datum expedice">
                <input type="date" value={shipmentForm.scheduledDate} onChange={e => setShipmentForm(p => ({ ...p, scheduledDate: e.target.value }))}
                  className={INP_CLS} />
              </Field>
            </div>
            <Field label="Cíl / Odběratel">
              <input value={shipmentForm.destination} onChange={e => setShipmentForm(p => ({ ...p, destination: e.target.value }))}
                placeholder="Makro Praha" className={INP_CLS} />
            </Field>
            <Field label="Poznámka">
              <input value={shipmentForm.note} onChange={e => setShipmentForm(p => ({ ...p, note: e.target.value }))}
                className={INP_CLS} />
            </Field>
            <button onClick={createShipment} disabled={!shipmentForm.productName || !shipmentForm.palletCount || saving}
              className="w-full py-3.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-2xl font-bold disabled:opacity-50 flex items-center justify-center gap-2 transition active:scale-[0.98]">
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
              {saving ? 'Ukládám...' : 'Naplánovat expedici'}
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

const INP_CLS = 'w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-teal-500/50 transition';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-sm text-slate-400 font-medium mb-1.5">{label}</label>{children}</div>;
}

function EmptyState({ icon, text, sub }: { icon: React.ReactNode; text: string; sub: string }) {
  return <div className="text-center py-16">{icon}<h3 className="text-lg font-bold text-white mt-3 mb-1">{text}</h3><p className="text-slate-500 text-sm">{sub}</p></div>;
}

function ModalShell({ title, icon, onClose, children }: { title: string; icon: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[9999] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-slate-800 rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-white/10" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/10">
          <div className="flex items-center gap-2">{icon}<h2 className="text-xl font-bold text-white">{title}</h2></div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
