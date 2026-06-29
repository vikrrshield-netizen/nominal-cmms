// src/pages/InventoryPage.tsx
// VIKRR — Asset Shield — Sklad ND (Firestore LIVE)

import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import { useInventory } from '../hooks/useInventory';
import { Breadcrumb } from '../components/ui';
import {
  Search, Plus, QrCode, Truck, X,
  CheckCircle2, TrendingDown, TrendingUp, Loader2,
  Download, Trash2, Upload, Cog, Printer, PackageCheck, ChevronRight,
  Circle, Droplet, Filter, Link2, Package, Zap, AlertTriangle, MapPin,
} from 'lucide-react';
import { useReports } from '../hooks/useReports';
import { doc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import ImportModal from '../components/ui/ImportModal';
import { importInventory, type InventoryImportRow } from '../utils/importers/importInventory';
import { assetService } from '../services/assetService';
import { getGearboxStatusLabel, isGearboxAsset } from '../services/gearboxService';
import type { Asset } from '../types/asset';
import type { InventoryItem, ItemCategory, NewInventoryItemInput } from '../types/inventory';

// ═══════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════

type StockStatus = 'ok' | 'low' | 'critical' | 'out';

const CATEGORIES = [
  { id: 'bearings', label: 'Ložiska', icon: Cog },
  { id: 'belts', label: 'Řemeny', icon: Link2 },
  { id: 'seals', label: 'Těsnění', icon: Circle },
  { id: 'oils', label: 'Oleje', icon: Droplet },
  { id: 'filters', label: 'Filtry', icon: Filter },
  { id: 'electrical', label: 'Elektro', icon: Zap },
  { id: 'other', label: 'Ostatní', icon: Package },
];

const STATUS_CONFIG: Record<StockStatus, { label: string; color: string; bgColor: string }> = {
  ok: { label: 'OK', color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
  low: { label: 'Nízký', color: 'text-amber-700', bgColor: 'bg-amber-50' },
  critical: { label: 'Kritický', color: 'text-orange-700', bgColor: 'bg-orange-50' },
  out: { label: 'Bez zásoby', color: 'text-red-600', bgColor: 'bg-red-50' },
};

// ═══════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════

function qrPayloadForItem(item: InventoryItem): string {
  return `${window.location.origin}/inventory?item=${encodeURIComponent(item.id)}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function findInventoryItemByScan(rawValue: string, items: InventoryItem[]): InventoryItem | null {
  const value = rawValue.trim();
  if (!value) return null;

  let candidates = [value];
  try {
    const url = new URL(value);
    const itemParam = url.searchParams.get('item');
    if (itemParam) candidates.push(itemParam);
  } catch {
    // QR can contain a plain sklad code instead of a URL.
  }

  candidates = candidates.map((candidate) => decodeURIComponent(candidate).trim().toLowerCase());
  return items.find((item) => {
    const values = [
      item.id,
      item.code,
      item.qrCode,
      item.name,
      `vikrshield:inventory:${item.id}`,
    ].filter(Boolean).map((entry) => String(entry).trim().toLowerCase());
    return candidates.some((candidate) => values.includes(candidate));
  }) || null;
}

function printInventoryLabels(items: InventoryItem[]) {
  if (items.length === 0) {
    alert('Není co tisknout.');
    return;
  }

  const printWindow = window.open('', '_blank', 'width=900,height=700');
  if (!printWindow) {
    alert('Prohlížeč zablokoval tiskové okno.');
    return;
  }

  const labels = items.map((item) => {
    const payload = qrPayloadForItem(item);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(payload)}`;
    return `
      <section class="label">
        <img src="${qrUrl}" alt="QR ${escapeHtml(item.code || item.name)}" />
        <div class="text">
          <strong>${escapeHtml(item.name || 'Skladová položka')}</strong>
          <span>Kód: ${escapeHtml(item.code || item.id)}</span>
          <span>Umístění: ${escapeHtml(item.location || '-')}</span>
          <span>Min: ${escapeHtml(String(item.minQuantity ?? 0))} ${escapeHtml(item.unit || 'ks')}</span>
        </div>
      </section>
    `;
  }).join('');

  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>QR štítky skladu</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: Arial, sans-serif; margin: 16px; color: #0f172a; }
          .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
          .label { border: 1px solid #cbd5e1; border-radius: 10px; padding: 10px; min-height: 130px; display: flex; gap: 10px; align-items: center; break-inside: avoid; }
          img { width: 92px; height: 92px; flex: 0 0 auto; }
          strong { display: block; font-size: 15px; margin-bottom: 6px; }
          span { display: block; font-size: 12px; line-height: 1.35; color: #334155; }
          @media print {
            body { margin: 8mm; }
            .label { page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <h1>QR štítky skladu</h1>
        <div class="grid">${labels}</div>
        <script>
          window.addEventListener('load', () => setTimeout(() => window.print(), 500));
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

function getGearboxTemperatureBadge(asset: Asset): { label: string; className: string } {
  const value = typeof asset.lastTemperatureC === 'number' ? asset.lastTemperatureC : null;
  const warning = asset.gearboxWarningTemperatureC ?? 70;
  const critical = asset.gearboxCriticalTemperatureC ?? 85;
  if (value == null) return { label: 'Bez měření teploty', className: 'bg-slate-100 text-slate-700 border-slate-200' };
  if (value >= critical) return { label: `${value} °C - kritická`, className: 'bg-red-50 text-red-700 border-red-200' };
  if (value >= warning) return { label: `${value} °C - varování`, className: 'bg-amber-50 text-amber-700 border-amber-200' };
  return { label: `${value} °C - OK`, className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
}

function formatGearboxDate(value?: string | null): string {
  if (!value) return 'Bez záznamu';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Bez záznamu';
  return date.toLocaleDateString('cs-CZ');
}

export default function InventoryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user, hasPermission } = useAuthContext();
  const { items, loading, stats, issueItem, receiveItem, createItem } = useInventory();
  const { exportXLSX } = useReports();

  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>(searchParams.get('category') || 'all');
  const [filterStatus, setFilterStatus] = useState<StockStatus | 'all'>('all');
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [showOrderModal, setShowOrderModal] = useState(searchParams.get('order') === '1');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [inventoryMode, setInventoryMode] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);

  // Permissions
  const canManage = hasPermission('inv.consume') || hasPermission('inv.restock') || hasPermission('inv.manage');
  const canOrder = hasPermission('inv.order') || hasPermission('inv.manage');
  const tenantId = user?.tenantId || 'main_firm';
  const currentInventoryPath = `${location.pathname}${location.search}`;

  useEffect(() => {
    assetService.getAll(tenantId)
      .then(setAssets)
      .catch((err) => console.warn('[Inventory] asset list:', err));
  }, [tenantId]);

  useEffect(() => {
    const itemId = searchParams.get('item');
    if (!itemId || items.length === 0 || selectedItem) return;
    const found = findInventoryItemByScan(itemId, items);
    if (found) setSelectedItem(found);
  }, [items, searchParams, selectedItem]);

  useEffect(() => {
    if (!selectedItem) return;
    const fresh = items.find((item) => item.id === selectedItem.id);
    if (fresh && fresh !== selectedItem) setSelectedItem(fresh);
  }, [items, selectedItem]);

  // ─────────────────────────────────────────
  // FILTERING
  // ─────────────────────────────────────────
  const filteredItems = items.filter(item => {
    if (filterCategory !== 'all' && item.category !== filterCategory) return false;
    if (filterStatus !== 'all' && item.status !== filterStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!(item.name || '').toLowerCase().includes(q) && !(item.code || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const stockGearboxes = assets
    .filter((asset) => isGearboxAsset(asset))
    .filter((asset) => !asset.isDeleted)
    .filter((asset) => !asset.currentExtruderId && asset.gearboxStatus !== 'installed')
    .filter((asset) => {
      if (filterCategory !== 'all' && filterCategory !== 'gearboxes') return false;
      if (filterStatus !== 'all') return false;
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return [asset.name, asset.code, asset.location, asset.gearboxStatus]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'cs'));

  const alertCount = stats.critical + stats.out;

  // ─────────────────────────────────────────
  // LOADING
  // ─────────────────────────────────────────
  if (loading) {
    return (
      <div className="vik-page min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-700" />
      </div>
    );
  }

  // ─────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────
  return (
    <div className="vik-page min-h-screen pb-24">
      {/* Header */}
      <div className="vik-page-header px-4 py-4">
        <Breadcrumb items={[
          { label: 'Dashboard', onClick: () => navigate('/') },
          { label: 'Sklad' },
        ]} />
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Sklad ND</h1>
              <p className="text-sm font-medium text-slate-600">Náhradní díly</p>
            </div>
            {alertCount > 0 && (
              <span className="inline-flex items-center gap-1 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                <AlertTriangle className="w-3 h-3" /> {alertCount}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => exportXLSX('inventory', items, { filename: `NOMINAL_sklad_${new Date().toISOString().slice(0, 10)}.xlsx` })}
              className="min-h-12 bg-white text-slate-700 px-3 py-3 rounded-lg font-medium flex items-center gap-2 hover:bg-slate-50 border border-slate-200"
              title="Export XLSX"
            >
              <Download className="w-5 h-5" />
              <span className="hidden sm:inline">Export</span>
            </button>
            {canManage && (
              <button
                onClick={() => setShowImportModal(true)}
                className="min-h-12 bg-white border border-stone-200 text-slate-700 px-3 py-3 rounded-lg font-medium flex items-center gap-2 hover:bg-stone-50"
                title="Import z Excelu"
              >
                <Upload className="w-5 h-5" />
                <span className="hidden sm:inline">Import</span>
              </button>
            )}
            {canOrder && (
              <button
                onClick={() => setShowOrderModal(true)}
                className="min-h-12 bg-emerald-600 text-white px-3 py-3 rounded-lg font-medium flex items-center gap-2 hover:bg-emerald-700"
              >
                <Truck className="w-5 h-5" />
                <span className="hidden sm:inline">Objednat</span>
              </button>
            )}
            {canManage && (
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="min-h-12 bg-emerald-700 text-white px-3 py-3 rounded-lg font-medium flex items-center gap-2 hover:bg-emerald-800"
                title="Přidat položku"
                aria-label="Přidat položku"
              >
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
            className={`bg-white p-3 rounded-xl border text-center ${filterStatus === 'all' ? 'border-emerald-600' : 'border-slate-200'}`}
          >
            <div className="text-2xl font-bold text-slate-800">{stats.total}</div>
            <div className="text-sm text-slate-600">Celkem</div>
          </button>
          <button
            onClick={() => setFilterStatus('low')}
            className={`bg-white p-3 rounded-xl border text-center ${filterStatus === 'low' ? 'border-amber-500' : ''}`}
          >
            <div className="text-2xl font-bold text-amber-600">{stats.low}</div>
            <div className="text-sm text-slate-600">Nízký</div>
          </button>
          <button
            onClick={() => setFilterStatus('critical')}
            className={`bg-white p-3 rounded-xl border text-center ${filterStatus === 'critical' ? 'border-orange-500' : ''}`}
          >
            <div className="text-2xl font-bold text-orange-600">{stats.critical}</div>
            <div className="text-sm text-slate-600">Kritický</div>
          </button>
          <button
            onClick={() => setFilterStatus('out')}
            className={`bg-white p-3 rounded-xl border text-center ${filterStatus === 'out' ? 'border-red-500' : ''}`}
          >
            <div className="text-2xl font-bold text-red-600">{stats.out}</div>
            <div className="text-sm text-slate-600">Bez zásoby</div>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setShowScanner(true)}
            className="min-h-12 rounded-xl bg-white px-4 py-3 text-slate-900 font-bold flex items-center justify-center gap-2 hover:bg-white"
          >
            <QrCode className="w-5 h-5" />
            Skenovat QR
          </button>
          <button
            type="button"
            onClick={() => setInventoryMode((value) => !value)}
            className={`min-h-12 rounded-xl px-4 py-3 font-bold flex items-center justify-center gap-2 border ${
              inventoryMode ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-700 border-slate-200'
            }`}
          >
            <PackageCheck className="w-5 h-5" />
            {inventoryMode ? 'Inventura zapnuta' : 'Inventura'}
          </button>
          <button
            type="button"
            onClick={() => printInventoryLabels(filteredItems as InventoryItem[])}
            className="min-h-12 rounded-xl bg-white px-4 py-3 text-slate-700 font-bold flex items-center justify-center gap-2 border border-slate-200 hover:bg-slate-50"
          >
            <Printer className="w-5 h-5" />
            Tisk QR
          </button>
        </div>

        {inventoryMode && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            Režim inventury je zapnutý. Otevři položku, zadej skutečný počet kusů a potvrď rozdíl.
          </div>
        )}

        {/* Search */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Hledat díl (kód, název)..."
              className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:border-emerald-600 outline-none bg-white text-slate-950"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowScanner(true)}
            className="p-3 min-h-12 min-w-12 border rounded-xl hover:bg-slate-50"
            title="Skenovat QR kód"
            aria-label="Skenovat QR kód"
          >
            <QrCode className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Categories */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setFilterCategory('all')}
            className={`min-h-12 px-3 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition ${
              filterCategory === 'all' ? 'bg-emerald-700 text-white' : 'bg-white border text-slate-600'
            }`}
          >
            Vše
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setFilterCategory(cat.id)}
              className={`min-h-12 px-3 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition flex items-center gap-1 ${
                filterCategory === cat.id ? 'bg-emerald-700 text-white' : 'bg-white border text-slate-600'
              }`}
            >
              <cat.icon className="w-4 h-4" />
              <span>{cat.label}</span>
            </button>
          ))}
          <button
            onClick={() => setFilterCategory('gearboxes')}
            className={`min-h-12 px-3 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition flex items-center gap-1 ${
              filterCategory === 'gearboxes' ? 'bg-emerald-700 text-white' : 'bg-white border text-slate-600'
            }`}
          >
            <Cog className="w-4 h-4" />
            <span>Převodovky</span>
          </button>
        </div>

        {stockGearboxes.length > 0 && (
          <section className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-violet-950">Převodovky ve skladu</h2>
                <p className="text-sm text-violet-700">
                  Konkrétní převodovky z kartotéky, které nejsou namontované na extruderu.
                </p>
              </div>
              <span className="rounded-full bg-violet-600 px-3 py-1 text-sm font-bold text-white">{stockGearboxes.length}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {stockGearboxes.map((gearbox) => {
                const tempBadge = getGearboxTemperatureBadge(gearbox);
                return (
                  <button
                    key={gearbox.id}
                    type="button"
                    onClick={() => navigate(`/asset/${gearbox.id}`, { state: { from: currentInventoryPath } })}
                    className="w-full rounded-2xl border border-violet-200 bg-white p-4 text-left shadow-sm transition hover:border-violet-400"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                        <Cog className="h-6 w-6" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-base font-black text-slate-900">{gearbox.name}</h3>
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
                            {getGearboxStatusLabel(gearbox)}
                          </span>
                        </div>
                        <div className="mt-1 text-sm text-slate-600">
                          {gearbox.code || 'Bez kódu'} | {gearbox.location || 'Sklad ND'}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${tempBadge.className}`}>
                            {tempBadge.label}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-600">
                            Poslední zápis: {formatGearboxDate(gearbox.lastTemperatureAt)}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-violet-700" />
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Items Grid */}
        {filteredItems.length === 0 && stockGearboxes.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            Žádné položky
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredItems.map((item) => {
              const statusCfg = STATUS_CONFIG[item.status as StockStatus] || STATUS_CONFIG.ok;
              const category = CATEGORIES.find(c => c.id === item.category);

              return (
                <div
                  key={item.id}
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden"
                >
                  {/* CLICKABLE BODY */}
                  <button
                    onClick={() => setSelectedItem(item)}
                    className="w-full p-4 text-left hover:bg-emerald-50/40 transition flex items-center gap-3"
                  >
                    <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                      {category?.icon ? <category.icon className="w-5 h-5 text-slate-600" /> : <Package className="w-5 h-5 text-slate-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-sm font-semibold text-slate-500">{item.code}</span>
                        <span className={`px-2 py-1 rounded-md text-xs font-bold ${statusCfg.bgColor} ${statusCfg.color}`}>
                          {statusCfg.label}
                        </span>
                      </div>
                      <h4 className="font-medium text-slate-950 truncate">{item.name}</h4>
                      <div className="text-sm text-slate-600 mt-1 flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" /> {item.location}
                      </div>
                    </div>
                    <div className={`text-right ${statusCfg.color}`}>
                      <div className="text-xl font-bold">{item.quantity}</div>
                      <div className="text-sm font-semibold">{item.unit}</div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-500 shrink-0" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Item Detail Modal */}
      {selectedItem && (
        <ItemDetailModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          canManage={canManage}
          onIssue={issueItem}
          onReceive={receiveItem}
          assets={assets}
          onOpenAsset={(assetId) => navigate(`/asset/${assetId}`, { state: { from: currentInventoryPath } })}
          inventoryMode={inventoryMode}
        />
      )}

      {showScanner && (
        <QrScannerModal
          items={items as InventoryItem[]}
          onClose={() => setShowScanner(false)}
          onSelect={(item) => {
            setSelectedItem(item);
            setShowScanner(false);
          }}
        />
      )}

      {/* Order Modal */}
      {showOrderModal && (
        <OrderModal
          items={items.filter(i => i.status !== 'ok')}
          onClose={() => setShowOrderModal(false)}
        />
      )}

      {/* Import Modal */}
      {showImportModal && (
        <ImportModal
          title="Import skladu z Excelu"
          onClose={() => setShowImportModal(false)}
          onImport={async (rows) => {
            const result = await importInventory(rows as unknown as InventoryImportRow[]);
            return { imported: result.imported, failed: result.failed, errors: result.errors };
          }}
        />
      )}

      {/* Create Item Modal */}
      {showCreateModal && (
        <CreateItemModal
          onClose={() => setShowCreateModal(false)}
          onCreate={createItem}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// CREATE ITEM MODAL
// ═══════════════════════════════════════════

function CreateItemModal({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (data: NewInventoryItemInput) => Promise<string>;
}) {
  const [form, setForm] = useState({
    name: '',
    code: '',
    category: CATEGORIES[0].id,
    quantity: '',
    unit: 'ks',
    minQuantity: '',
    location: '',
    supplier: '',
    unitPrice: '',
    currency: 'Kč',
    note: '',
  });
  const [saving, setSaving] = useState(false);

  const update = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    const name = form.name.trim();
    const code = form.code.trim().toUpperCase();
    const location = form.location.trim();
    const unit = form.unit.trim();
    const quantity = Number(form.quantity);
    const minQuantity = Number(form.minQuantity);

    if (!name) { alert('Zadej název položky.'); return; }
    if (!code) { alert('Zadej kód položky.'); return; }
    if (!form.category) { alert('Vyber kategorii.'); return; }
    if (!unit) { alert('Zadej jednotku.'); return; }
    if (!location) { alert('Zadej umístění.'); return; }
    if (form.quantity === '' || !Number.isFinite(quantity) || quantity < 0) {
      alert('Množství musí být číslo větší nebo rovno 0.');
      return;
    }
    if (form.minQuantity === '' || !Number.isFinite(minQuantity) || minQuantity < 0) {
      alert('Minimum musí být číslo větší nebo rovno 0.');
      return;
    }

    let unitPrice: number | undefined;
    if (form.unitPrice.trim() !== '') {
      const parsed = Number(form.unitPrice);
      if (!Number.isFinite(parsed) || parsed < 0) {
        alert('Cena za kus musí být číslo větší nebo rovno 0.');
        return;
      }
      unitPrice = parsed;
    }

    setSaving(true);
    try {
      await onCreate({
        name,
        code,
        category: form.category as ItemCategory,
        quantity,
        unit,
        minQuantity,
        location,
        ...(form.supplier.trim() && { supplier: form.supplier.trim() }),
        ...(unitPrice != null && { unitPrice }),
        ...(form.currency.trim() && { currency: form.currency.trim() }),
        ...(form.note.trim() && { note: form.note.trim() }),
      });
      onClose();
    } catch (err: unknown) {
      alert((err as Error).message || 'Položku se nepodařilo uložit.');
    }
    setSaving(false);
  };

  const inputClass = 'w-full p-3 border border-slate-200 rounded-xl focus:border-emerald-600 outline-none bg-white text-slate-950';
  const labelClass = 'block text-sm font-medium text-slate-700 mb-1';

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-t-3xl md:rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-slate-900">Nová skladová položka</h2>
          </div>
          <button onClick={onClose} className="p-3 min-h-12 min-w-12 rounded-lg hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className={labelClass}>Název <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="Např. Ložisko 6205-2RS"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Kód <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={form.code}
                onChange={(e) => update('code', e.target.value)}
                placeholder="LOZ-6205"
                className={`${inputClass} font-mono uppercase`}
              />
            </div>
            <div>
              <label className={labelClass}>Kategorie <span className="text-red-500">*</span></label>
              <select
                value={form.category}
                onChange={(e) => update('category', e.target.value)}
                className={inputClass}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>Množství <span className="text-red-500">*</span></label>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                value={form.quantity}
                onChange={(e) => update('quantity', e.target.value)}
                placeholder="0"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Jednotka <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={form.unit}
                onChange={(e) => update('unit', e.target.value)}
                placeholder="ks"
                className={inputClass}
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass}>Minimum <span className="text-red-500">*</span></label>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                value={form.minQuantity}
                onChange={(e) => update('minQuantity', e.target.value)}
                placeholder="0"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Umístění <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.location}
              onChange={(e) => update('location', e.target.value)}
              placeholder="E-Regál 3-Pozice B"
              className={inputClass}
            />
          </div>

          <div className="border-t pt-4 space-y-4">
            <div className="text-sm font-medium text-slate-500">Volitelné údaje</div>

            <div>
              <label className={labelClass}>Dodavatel</label>
              <input
                type="text"
                value={form.supplier}
                onChange={(e) => update('supplier', e.target.value)}
                placeholder="Název dodavatele"
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Cena za kus</label>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={form.unitPrice}
                  onChange={(e) => update('unitPrice', e.target.value)}
                  placeholder="0"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Měna</label>
                <input
                  type="text"
                  value={form.currency}
                  onChange={(e) => update('currency', e.target.value)}
                  placeholder="Kč"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Poznámka</label>
              <textarea
                value={form.note}
                onChange={(e) => update('note', e.target.value)}
                placeholder="Doplňující informace"
                rows={2}
                className={`${inputClass} resize-none`}
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 min-h-12 py-3 bg-slate-100 text-slate-600 rounded-xl font-medium"
            >
              Zrušit
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="flex-1 min-h-12 py-3 bg-emerald-600 text-white rounded-xl font-bold disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-emerald-700"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Vytvořit položku
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// ITEM DETAIL MODAL
// ═══════════════════════════════════════════

function ItemDetailModal({ item, onClose, canManage, onIssue, onReceive, assets, onOpenAsset, inventoryMode }: {
  item: any;
  onClose: () => void;
  canManage: boolean;
  onIssue: (id: string, qty: number, note?: string) => Promise<any>;
  onReceive: (id: string, qty: number, opts?: any) => Promise<any>;
  assets: Asset[];
  onOpenAsset: (assetId: string) => void;
  inventoryMode: boolean;
}) {
  const [adjustMode, setAdjustMode] = useState<'add' | 'remove' | null>(null);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [countedQuantity, setCountedQuantity] = useState('');
  const [saving, setSaving] = useState(false);

  const statusCfg = STATUS_CONFIG[item.status as StockStatus] || STATUS_CONFIG.ok;
  const category = CATEGORIES.find(c => c.id === item.category);
  const linkedAssetId = item.assetId || item.compatibleAssetIds?.find((id: string) => assets.some((asset) => asset.id === id && isGearboxAsset(asset)));
  const linkedGearbox = linkedAssetId ? assets.find((asset) => asset.id === linkedAssetId) : undefined;
  const isGearboxItem = item.category === 'gearboxes' || Boolean(linkedGearbox) || isGearboxAsset({ name: item.name, code: item.code, entityType: item.category });

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
    } catch (err: unknown) {
      alert((err as Error).message);
    }
    setSaving(false);
  };

  const handleInventoryCount = async () => {
    if (countedQuantity === '') return;
    const actual = Number(countedQuantity);
    if (!Number.isFinite(actual) || actual < 0) {
      alert('Zadej platný skutečný počet.');
      return;
    }

    const current = Number(item.quantity || 0);
    const diff = actual - current;
    if (diff === 0) {
      alert('Skutečný počet sedí se stavem v systému.');
      return;
    }

    setSaving(true);
    try {
      if (diff > 0) {
        await onReceive(item.id, diff, { note: `Inventura: skutečný stav ${actual} ${item.unit}` });
      } else {
        await onIssue(item.id, Math.abs(diff), `Inventura: skutečný stav ${actual} ${item.unit}`);
      }
      setCountedQuantity('');
    } catch (err: unknown) {
      alert((err as Error).message);
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-t-3xl md:rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {category?.icon ? <category.icon className="h-6 w-6 text-slate-600" /> : null}
            <span className="font-mono text-base font-semibold text-slate-700">{item.code}</span>
          </div>
          <button onClick={onClose} className="p-3 min-h-12 min-w-12 rounded-lg hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <h2 className="text-xl font-bold text-slate-800">{item.name}</h2>

          {/* Quantity Display */}
          <div className="bg-slate-50 p-6 rounded-xl text-center">
            <div className={`text-5xl font-bold mb-1 ${statusCfg.color}`}>{item.quantity}</div>
            <div className="text-slate-500">{item.unit}</div>
            <div className="mt-2 text-base">
              Min: <span className="font-medium">{item.minQuantity}</span>
              {item.maxQuantity && <> / Max: <span className="font-medium">{item.maxQuantity}</span></>}
            </div>
          </div>

          <button
            type="button"
            onClick={() => printInventoryLabels([item as InventoryItem])}
            className="w-full min-h-12 rounded-xl border border-slate-200 bg-white px-4 py-3 font-bold text-slate-700 flex items-center justify-center gap-2 hover:bg-slate-50"
          >
            <Printer className="w-5 h-5" />
            Vytisknout QR štítek
          </button>

          {canManage && inventoryMode && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-3">
              <div>
                <div className="text-sm font-bold text-emerald-900">Inventura položky</div>
                <div className="text-sm text-emerald-700">
                  Stav v systému: {item.quantity} {item.unit}. Zadej skutečný počet na regálu.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  value={countedQuantity}
                  onChange={(e) => setCountedQuantity(e.target.value)}
                  placeholder="Skutečný počet"
                  className="flex-1 p-3 border border-emerald-200 rounded-xl focus:border-emerald-500 outline-none"
                />
                <span className="text-emerald-900 font-bold">{item.unit}</span>
              </div>
              {countedQuantity !== '' && Number.isFinite(Number(countedQuantity)) && (
                <div className="text-sm text-emerald-900">
                  Rozdíl: <span className="font-bold">{Number(countedQuantity) - Number(item.quantity || 0)}</span> {item.unit}
                </div>
              )}
              <button
                type="button"
                onClick={handleInventoryCount}
                disabled={saving || countedQuantity === ''}
                className="w-full min-h-12 rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Uložit skutečný stav
              </button>
            </div>
          )}

          {/* Info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 p-3 rounded-xl">
              <div className="text-sm text-slate-500 mb-1">Umístění</div>
              <div className="font-medium flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-slate-400" /> {item.location}</div>
            </div>
            {item.unitPrice && (
              <div className="bg-slate-50 p-3 rounded-xl">
                <div className="text-sm text-slate-500 mb-1">Cena/ks</div>
                <div className="font-medium">{item.unitPrice} {item.currency || 'Kč'}</div>
              </div>
            )}
            {item.supplier && (
              <div className="bg-slate-50 p-3 rounded-xl col-span-2">
                <div className="text-sm text-slate-500 mb-1">Dodavatel</div>
                <div className="font-medium">{item.supplier}</div>
              </div>
            )}
          </div>

          {/* Filter spec */}
          {item.filterSpec && (
            <div className="bg-blue-50 p-3 rounded-xl">
              <div className="text-sm text-blue-600 mb-1">VZT Filtr</div>
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

          {isGearboxItem && (
            <div className="bg-violet-50 border border-violet-100 p-3 rounded-xl">
              <div className="text-sm font-bold text-violet-800 mb-1">Převodovka</div>
              <div className="text-sm text-violet-700 mb-3">
                Sklad drží zásobu. Historie, teploty, fotky a přiřazení k extruderu jsou na kartě převodovky.
              </div>
              {linkedGearbox ? (
                <button
                  type="button"
                  onClick={() => onOpenAsset(linkedGearbox.id)}
                  className="w-full min-h-12 py-3 bg-violet-600 text-white rounded-xl font-medium hover:bg-violet-700 flex items-center justify-center gap-2"
                >
                  <Cog className="w-4 h-4" />
                  Otevřít kartu převodovky
                </button>
              ) : (
                <div className="text-sm text-violet-700">
                  Tato skladová položka zatím nemá připojenou kartu v kartotéce.
                </div>
              )}
            </div>
          )}

          {/* Delete */}
          {canManage && (
            <button
              onClick={async () => {
                if (window.confirm(`Opravdu smazat "${item.name}"?`)) {
                  await deleteDoc(doc(db, 'inventory', item.id));
                  onClose();
                }
              }}
              className="w-full min-h-12 py-3 bg-red-50 text-red-600 rounded-xl font-medium hover:bg-red-100 flex items-center justify-center gap-2 border border-red-200"
            >
              <Trash2 className="w-4 h-4" />
              Smazat položku
            </button>
          )}

          {/* Adjust Quantity */}
          {canManage && (
            <div className="border-t pt-4">
              <div className="text-sm font-medium text-slate-700 mb-3">Pohyb na skladě</div>
              {!adjustMode ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => setAdjustMode('add')}
                    className="flex-1 min-h-12 py-3 bg-emerald-100 text-emerald-700 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-emerald-200"
                  >
                    <TrendingUp className="w-5 h-5" />
                    Příjem
                  </button>
                  <button
                    onClick={() => setAdjustMode('remove')}
                    className="flex-1 min-h-12 py-3 bg-red-100 text-red-700 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-red-200"
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
                      className="flex-1 p-3 border border-slate-200 rounded-xl focus:border-emerald-600 outline-none bg-white text-slate-950"
                      autoFocus
                    />
                    <span className="text-slate-500">{item.unit}</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setAdjustMode(null); setAdjustAmount(''); }}
                      className="flex-1 min-h-12 py-3 bg-slate-100 text-slate-600 rounded-xl font-medium"
                    >
                      Zrušit
                    </button>
                    <button
                      onClick={handleAdjust}
                      disabled={!adjustAmount || saving}
                      className="flex-1 min-h-12 py-3 bg-emerald-600 text-white rounded-xl font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                      Zapsat
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

function QrScannerModal({ items, onClose, onSelect }: {
  items: InventoryItem[];
  onClose: () => void;
  onSelect: (item: InventoryItem) => void;
}) {
  const [manualCode, setManualCode] = useState('');
  const [message, setMessage] = useState('Namiř kameru na QR štítek skladové položky.');

  useEffect(() => {
    let scanner: { render: (success: (decodedText: string) => void, error?: () => void) => void; clear: () => Promise<void> } | null = null;
    let cancelled = false;

    import('html5-qrcode')
      .then(({ Html5QrcodeScanner }) => {
        if (cancelled) return;
        scanner = new Html5QrcodeScanner(
          'inventory-qr-reader',
          { fps: 10, qrbox: { width: 240, height: 240 }, rememberLastUsedCamera: true },
          false
        );
        scanner.render((decodedText: string) => {
          const found = findInventoryItemByScan(decodedText, items);
          if (found) {
            onSelect(found);
          } else {
            setMessage('QR kód se nenašel ve skladu. Zkus zadat kód ručně.');
          }
        });
      })
      .catch(() => setMessage('Kameru se nepodařilo spustit. Zadej kód ručně.'));

    return () => {
      cancelled = true;
      scanner?.clear().catch(() => undefined);
    };
  }, [items, onSelect]);

  const handleManualSearch = () => {
    const found = findInventoryItemByScan(manualCode, items);
    if (found) {
      onSelect(found);
      return;
    }
    setMessage('Položka podle zadaného kódu nebyla nalezena.');
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-t-3xl md:rounded-3xl w-full max-w-lg max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-slate-700" />
            <h2 className="text-lg font-bold text-slate-900">Skenovat sklad</h2>
          </div>
          <button onClick={onClose} className="min-h-12 min-w-12 p-2 rounded-lg hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-sm text-slate-600">{message}</p>
          <div id="inventory-qr-reader" className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50" />

          <div className="rounded-xl border border-slate-200 p-3 space-y-2">
            <div className="text-sm font-bold text-slate-700">Ruční zadání</div>
            <div className="flex gap-2">
              <input
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="Kód položky nebo název"
                className="flex-1 p-3 border border-slate-200 rounded-xl focus:border-emerald-600 outline-none bg-white text-slate-950"
              />
              <button
                type="button"
                onClick={handleManualSearch}
                className="min-h-12 rounded-xl bg-emerald-600 px-4 font-bold text-white"
              >
                Najít
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

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
          <button onClick={onClose} className="p-3 min-h-12 min-w-12 rounded-lg hover:bg-slate-100">
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
              <p className="text-sm text-slate-600">
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
                      {selected.has(item.id) && <CheckCircle2 className="w-4 h-4 text-slate-900" />}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">{item.name}</div>
                      <div className="text-sm text-slate-500">{item.code}</div>
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
                className="w-full min-h-12 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
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
