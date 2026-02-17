// src/pages/InventoryPage.tsx
// NOMINAL CMMS — Sklad ND (Firestore LIVE)

import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import { useInventory } from '../hooks/useInventory';
import { Breadcrumb } from '../components/ui';
import {
  Search, Plus, QrCode, Truck, X,
  CheckCircle2, TrendingDown, TrendingUp, Loader2, Edit2,
} from 'lucide-react';

// ═══════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════

type StockStatus = 'ok' | 'low' | 'critical' | 'out';

const CATEGORIES = [
  { id: 'bearings', label: 'Ložiska', icon: '⚙️' },
  { id: 'belts', label: 'Řemeny', icon: '🔗' },
  { id: 'seals', label: 'Těsnění', icon: '⭕' },
  { id: 'oils', label: 'Oleje', icon: '🛢️' },
  { id: 'filters', label: 'Filtry', icon: '📲' },
  { id: 'electrical', label: 'Elektro', icon: '⚡' },
  { id: 'other', label: 'Ostatní', icon: '📦' },
];

const STATUS_CONFIG: Record<StockStatus, { label: string; color: string; bgColor: string }> = {
  ok: { label: 'OK', color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
  low: { label: 'Nízký', color: 'text-amber-600', bgColor: 'bg-amber-50' },
  critical: { label: 'Kritický', color: 'text-orange-600', bgColor: 'bg-orange-50' },
  out: { label: 'Vyprodáno', color: 'text-red-600', bgColor: 'bg-red-50' },
};

// ═══════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════

export default function InventoryPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { hasPermission } = useAuthContext();
  const { items, loading, stats, issueItem, receiveItem } = useInventory();

  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<StockStatus | 'all'>('all');
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [showOrderModal, setShowOrderModal] = useState(searchParams.get('order') === '1');

  // Permissions
  const canManage = hasPermission('inventory.issue') || hasPermission('inventory.receive');
  const canOrder = hasPermission('inventory.order');

  // ─────────────────────────────────────────
  // FILTERING
  // ─────────────────────────────────────────
  const filteredItems = items.filter(item => {
    if (filterCategory !== 'all' && item.category !== filterCategory) return false;
    if (filterStatus !== 'all' && item.status !== filterStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!item.name.toLowerCase().includes(q) && !item.code.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const alertCount = stats.critical + stats.out;

  // ─────────────────────────────────────────
  // LOADING
  // ─────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // ─────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b px-4 py-4">
        <Breadcrumb items={[
          { label: 'Dashboard', onClick: () => navigate('/') },
          { label: 'Sklad' },
        ]} />
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-800">Sklad ND</h1>
            {alertCount > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full animate-pulse">
                {alertCount} ⚠️
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {canOrder && (
              <button
                onClick={() => setShowOrderModal(true)}
                className="bg-emerald-600 text-white px-3 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-emerald-700"
              >
                <Truck className="w-5 h-5" />
                <span className="hidden sm:inline">Objednat</span>
              </button>
            )}
            {canManage && (
              <button className="bg-blue-600 text-white px-3 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-blue-700">
                <Plus className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-2">
          <button
            onClick={() => setFilterStatus('all')}
            className={`bg-white p-3 rounded-xl border text-center ${filterStatus === 'all' ? 'border-blue-500' : ''}`}
          >
            <div className="text-2xl font-bold text-slate-800">{stats.total}</div>
            <div className="text-xs text-slate-500">Celkem</div>
          </button>
          <button
            onClick={() => setFilterStatus('low')}
            className={`bg-white p-3 rounded-xl border text-center ${filterStatus === 'low' ? 'border-amber-500' : ''}`}
          >
            <div className="text-2xl font-bold text-amber-600">{stats.low}</div>
            <div className="text-xs text-slate-500">Nízký</div>
          </button>
          <button
            onClick={() => setFilterStatus('critical')}
            className={`bg-white p-3 rounded-xl border text-center ${filterStatus === 'critical' ? 'border-orange-500' : ''}`}
          >
            <div className="text-2xl font-bold text-orange-600">{stats.critical}</div>
            <div className="text-xs text-slate-500">Kritický</div>
          </button>
          <button
            onClick={() => setFilterStatus('out')}
            className={`bg-white p-3 rounded-xl border text-center ${filterStatus === 'out' ? 'border-red-500' : ''}`}
          >
            <div className="text-2xl font-bold text-red-600">{stats.out}</div>
            <div className="text-xs text-slate-500">Vyprodáno</div>
          </button>
        </div>

        {/* Search */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Hledat díl (kód, název)..."
              className="w-full pl-10 pr-4 py-2 border rounded-xl focus:border-blue-500 outline-none"
            />
          </div>
          <button className="p-2 border rounded-xl hover:bg-slate-50">
            <QrCode className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Categories */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setFilterCategory('all')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition ${
              filterCategory === 'all' ? 'bg-slate-800 text-white' : 'bg-white border text-slate-600'
            }`}
          >
            Vše
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setFilterCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition flex items-center gap-1 ${
                filterCategory === cat.id ? 'bg-slate-800 text-white' : 'bg-white border text-slate-600'
              }`}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </div>

        {/* Items List */}
        <div className="bg-white rounded-xl border overflow-hidden">
          {filteredItems.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              Žádné položky
            </div>
          ) : (
            <div className="divide-y">
              {filteredItems.map((item) => {
                const statusCfg = STATUS_CONFIG[item.status as StockStatus] || STATUS_CONFIG.ok;
                const category = CATEGORIES.find(c => c.id === item.category);

                return (
                  <button
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    className="w-full p-4 text-left hover:bg-slate-50 transition flex items-center gap-3"
                  >
                    <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-xl">
                      {category?.icon || '📦'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs text-slate-400">{item.code}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${statusCfg.bgColor} ${statusCfg.color}`}>
                          {statusCfg.label}
                        </span>
                      </div>
                      <h4 className="font-medium text-slate-800 truncate">{item.name}</h4>
                      <div className="text-xs text-slate-500 mt-1">
                        📍 {item.location}
                      </div>
                    </div>
                    <div className={`text-right ${statusCfg.color}`}>
                      <div className="text-xl font-bold">{item.quantity}</div>
                      <div className="text-xs">{item.unit}</div>
                    </div>
                    <Edit2 className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Item Detail Modal */}
      {selectedItem && (
        <ItemDetailModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          canManage={canManage}
          onIssue={issueItem}
          onReceive={receiveItem}
        />
      )}

      {/* Order Modal */}
      {showOrderModal && (
        <OrderModal
          items={items.filter(i => i.status !== 'ok')}
          onClose={() => setShowOrderModal(false)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// ITEM DETAIL MODAL
// ═══════════════════════════════════════════

function ItemDetailModal({ item, onClose, canManage, onIssue, onReceive }: {
  item: any;
  onClose: () => void;
  canManage: boolean;
  onIssue: (id: string, qty: number, note?: string) => Promise<any>;
  onReceive: (id: string, qty: number, opts?: any) => Promise<any>;
}) {
  const [adjustMode, setAdjustMode] = useState<'add' | 'remove' | null>(null);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const statusCfg = STATUS_CONFIG[item.status as StockStatus] || STATUS_CONFIG.ok;
  const category = CATEGORIES.find(c => c.id === item.category);

  const handleAdjust = async () => {
    if (!adjustAmount) return;
    setSaving(true);
    try {
      const amount = Number(adjustAmount);
      if (adjustMode === 'add') {
        await onReceive(item.id, amount, { note: 'Ruční příjem' });
      } else {
        await onIssue(item.id, amount, 'Ruční výdej');
      }
      setAdjustMode(null);
      setAdjustAmount('');
      onClose();
    } catch (err: any) {
      alert(err.message);
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-t-3xl md:rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{category?.icon}</span>
            <span className="font-mono text-sm text-slate-500">{item.code}</span>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <h2 className="text-xl font-bold text-slate-800">{item.name}</h2>

          {/* Quantity Display */}
          <div className="bg-slate-50 p-6 rounded-xl text-center">
            <div className={`text-5xl font-bold mb-1 ${statusCfg.color}`}>{item.quantity}</div>
            <div className="text-slate-500">{item.unit}</div>
            <div className="mt-2 text-sm">
              Min: <span className="font-medium">{item.minQuantity}</span>
              {item.maxQuantity && <> / Max: <span className="font-medium">{item.maxQuantity}</span></>}
            </div>
          </div>

          {/* Info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 p-3 rounded-xl">
              <div className="text-xs text-slate-500 mb-1">Umístění</div>
              <div className="font-medium">📍 {item.location}</div>
            </div>
            {item.unitPrice && (
              <div className="bg-slate-50 p-3 rounded-xl">
                <div className="text-xs text-slate-500 mb-1">Cena/ks</div>
                <div className="font-medium">{item.unitPrice} {item.currency || 'Kč'}</div>
              </div>
            )}
            {item.supplier && (
              <div className="bg-slate-50 p-3 rounded-xl col-span-2">
                <div className="text-xs text-slate-500 mb-1">Dodavatel</div>
                <div className="font-medium">{item.supplier}</div>
              </div>
            )}
          </div>

          {/* Filter spec */}
          {item.filterSpec && (
            <div className="bg-blue-50 p-3 rounded-xl">
              <div className="text-xs text-blue-600 mb-1">VZT Filtr</div>
              <div className="text-sm font-medium text-blue-800">
                {item.filterSpec.dimensions} / {item.filterSpec.filterClass} / {item.filterSpec.typeCode}
              </div>
            </div>
          )}

          {/* Compatible Assets */}
          {item.compatibleAssetNames && item.compatibleAssetNames.length > 0 && (
            <div>
              <div className="text-sm font-medium text-slate-700 mb-2">Kompatibilní stroje</div>
              <div className="flex flex-wrap gap-2">
                {item.compatibleAssetNames.map((asset: string, i: number) => (
                  <span key={i} className="px-2 py-1 bg-blue-50 text-blue-700 rounded-lg text-sm">
                    {asset}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Adjust Quantity */}
          {canManage && (
            <div className="border-t pt-4">
              <div className="text-sm font-medium text-slate-700 mb-3">Upravit množství</div>
              {!adjustMode ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => setAdjustMode('add')}
                    className="flex-1 py-3 bg-emerald-100 text-emerald-700 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-emerald-200"
                  >
                    <TrendingUp className="w-5 h-5" />
                    Příjem
                  </button>
                  <button
                    onClick={() => setAdjustMode('remove')}
                    className="flex-1 py-3 bg-red-100 text-red-700 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-red-200"
                  >
                    <TrendingDown className="w-5 h-5" />
                    Výdej
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 rounded-lg font-medium ${
                      adjustMode === 'add' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {adjustMode === 'add' ? '+' : '-'}
                    </span>
                    <input
                      type="number"
                      value={adjustAmount}
                      onChange={(e) => setAdjustAmount(e.target.value)}
                      placeholder="Množství"
                      className="flex-1 p-3 border rounded-xl focus:border-blue-500 outline-none"
                      autoFocus
                    />
                    <span className="text-slate-500">{item.unit}</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setAdjustMode(null); setAdjustAmount(''); }}
                      className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-xl font-medium"
                    >
                      Zrušit
                    </button>
                    <button
                      onClick={handleAdjust}
                      disabled={!adjustAmount || saving}
                      className="flex-1 py-2 bg-blue-600 text-white rounded-xl font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                      Potvrdit
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// ORDER MODAL
// ═══════════════════════════════════════════

function OrderModal({ items, onClose }: { items: any[]; onClose: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(items.map(i => i.id)));

  const toggleItem = (id: string) => {
    const newSet = new Set(selected);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelected(newSet);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-t-3xl md:rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-bold">Vytvořit objednávku</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          {items.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <p className="text-slate-600">Všechny položky jsou na skladě!</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-500">
                Vyberte položky k objednání ({selected.size} vybráno)
              </p>
              <div className="space-y-2">
                {items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => toggleItem(item.id)}
                    className={`w-full p-3 rounded-xl border-2 text-left transition flex items-center gap-3 ${
                      selected.has(item.id) ? 'border-blue-500 bg-blue-50' : 'border-slate-200'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                      selected.has(item.id) ? 'border-blue-500 bg-blue-500' : 'border-slate-300'
                    }`}>
                      {selected.has(item.id) && <CheckCircle2 className="w-4 h-4 text-white" />}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">{item.name}</div>
                      <div className="text-xs text-slate-500">{item.code}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-red-600 font-bold">{item.quantity}</div>
                      <div className="text-xs text-slate-500">min: {item.minQuantity}</div>
                    </div>
                  </button>
                ))}
              </div>
              <button
                disabled={selected.size === 0}
                className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Truck className="w-5 h-5" />
                Odeslat objednávku ({selected.size})
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
