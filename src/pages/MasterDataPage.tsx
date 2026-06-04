import { useEffect, useMemo, useState } from 'react';
import { collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc, writeBatch, type Timestamp } from 'firebase/firestore';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, ClipboardList, Factory, Leaf, Package, Save, Search, ShieldCheck } from 'lucide-react';
import { useAuthContext } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { MATERIAL_SEED, PRODUCT_SEED, materialBatch, productBatch } from '../data/productionMasterSeed';
import { showToast } from '../components/ui/Toast';
import type { GearboxTemperatureLog } from '../types/gearbox';

type Tab = 'materials' | 'products';
type ApprovalStatus = 'pending' | 'approved' | 'conditional' | 'blocked';

interface MasterBase {
  id: string;
  number: string;
  nkCode: string;
  name: string;
  note?: string;
  allergens?: string[];
  active?: boolean;
  usageCount?: number;
  lastUsedAt?: Timestamp | Date | string | null;
  createdAt?: Timestamp | Date | string | null;
  updatedAt?: Timestamp | Date | string | null;
}

interface MaterialDoc extends MasterBase {
  supplier?: string;
  approvalStatus?: ApprovalStatus;
  storageConditions?: string;
  unit?: string;
}

interface ProductDoc extends MasterBase {
  customer?: string;
  specificationVersion?: string;
  shelfLife?: string;
  packaging?: string;
  bomMaterialIds?: string[];
}

const PANEL = 'rounded-2xl border border-[#ded6c8] bg-white shadow-sm';
const INPUT = 'w-full rounded-xl border border-[#ded6c8] bg-[#fbf9f4] px-3 py-2.5 text-sm font-semibold text-slate-950 outline-none placeholder:text-slate-400 focus:border-emerald-600';
const BUTTON_PRIMARY = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-black text-white hover:bg-emerald-600 disabled:opacity-50';
const BUTTON_SECONDARY = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#ded6c8] bg-white px-4 py-2.5 text-sm font-black text-slate-800 hover:bg-[#fbf9f4]';

function asDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'object' && value && 'toDate' in value && typeof (value as { toDate: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(value: unknown): string {
  const date = asDate(value);
  if (!date) return 'bez použití';
  return date.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(value: unknown): string {
  const date = asDate(value);
  if (!date) return 'bez data';
  return date.toLocaleString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function splitList(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function seedId(kind: 'material' | 'product', nkCode: string) {
  return `${kind}-${nkCode.toLowerCase()}`;
}

function sortByUseThenName<T extends MasterBase>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const usage = (b.usageCount || 0) - (a.usageCount || 0);
    if (usage !== 0) return usage;
    const lastA = asDate(a.lastUsedAt)?.getTime() || 0;
    const lastB = asDate(b.lastUsedAt)?.getTime() || 0;
    if (lastA !== lastB) return lastB - lastA;
    return a.name.localeCompare(b.name, 'cs');
  });
}

function useMasterData(canManage: boolean, user: ReturnType<typeof useAuthContext>['user']) {
  const [materials, setMaterials] = useState<MaterialDoc[]>([]);
  const [products, setProducts] = useState<ProductDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let materialsReady = false;
    let productsReady = false;
    const done = () => {
      if (materialsReady && productsReady) setLoading(false);
    };

    const seedBase = {
      active: true,
      allergens: [],
      usageCount: 0,
      lastUsedAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdById: user?.uid || user?.id || '',
      createdByName: user?.displayName || 'System',
    };

    const unsubMaterials = onSnapshot(collection(db, 'materials'), (snap) => {
      if (snap.empty && canManage) {
        const batch = writeBatch(db);
        MATERIAL_SEED.forEach((item) => {
          batch.set(doc(db, 'materials', seedId('material', item.nkCode)), {
            ...seedBase,
            number: item.number,
            nkCode: item.nkCode,
            name: item.name,
            note: item.note || '',
            approvalStatus: 'pending',
            supplier: '',
            storageConditions: '',
            unit: '',
            source: 'seed:Cisla_sarze_suroviny_NK.xlsx',
          });
        });
        void batch.commit().catch((err) => console.warn('[MasterData] material seed failed:', err));
      }

      setMaterials(snap.docs.map((item) => ({ id: item.id, ...item.data() } as MaterialDoc)));
      materialsReady = true;
      done();
    }, () => {
      materialsReady = true;
      done();
    });

    const unsubProducts = onSnapshot(collection(db, 'products'), (snap) => {
      if (snap.empty && canManage) {
        const batch = writeBatch(db);
        PRODUCT_SEED.forEach((item) => {
          batch.set(doc(db, 'products', seedId('product', item.nkCode)), {
            ...seedBase,
            number: item.number,
            nkCode: item.nkCode,
            name: item.name,
            note: item.note || '',
            specificationVersion: '',
            shelfLife: '',
            packaging: '',
            customer: '',
            bomMaterialIds: [],
            source: 'seed:Cisla_sarze_NK.xlsx',
          });
        });
        void batch.commit().catch((err) => console.warn('[MasterData] product seed failed:', err));
      }

      setProducts(snap.docs.map((item) => ({ id: item.id, ...item.data() } as ProductDoc)));
      productsReady = true;
      done();
    }, () => {
      productsReady = true;
      done();
    });

    return () => {
      unsubMaterials();
      unsubProducts();
    };
  }, [canManage, user?.displayName, user?.id, user?.uid]);

  return { materials, products, loading };
}

function useGearboxTemperatureHistory() {
  const [logs, setLogs] = useState<GearboxTemperatureLog[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'gearbox_temperature_logs'), orderBy('measuredAt', 'desc'), limit(500));
    return onSnapshot(
      q,
      (snap) => setLogs(snap.docs.map((item) => ({ id: item.id, ...item.data() } as GearboxTemperatureLog))),
      () => setLogs([]),
    );
  }, []);

  return logs;
}

function MasterCard({
  item,
  selected,
  onSelect,
}: {
  item: MasterBase;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-2xl border p-3 text-left transition ${
        selected ? 'border-emerald-600 bg-emerald-50' : 'border-[#ded6c8] bg-white hover:bg-[#fbf9f4]'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-700">{item.nkCode}</span>
            <span className="text-xs font-bold text-slate-500">č. {item.number}</span>
            {item.active !== false && <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700">aktivní</span>}
          </div>
          <div className="mt-2 line-clamp-2 text-base font-black text-slate-950">{item.name}</div>
          <div className="mt-2 text-xs font-semibold text-slate-500">
            Použití: {item.usageCount || 0} · naposledy {formatDate(item.lastUsedAt)}
          </div>
        </div>
        <ClipboardList className="mt-1 h-5 w-5 shrink-0 text-emerald-700" />
      </div>
    </button>
  );
}

function DetailPanel({
  tab,
  item,
  canManage,
  materials,
  temperatureLogs,
}: {
  tab: Tab;
  item: MaterialDoc | ProductDoc | null;
  canManage: boolean;
  materials: MaterialDoc[];
  temperatureLogs: GearboxTemperatureLog[];
}) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [batchDate, setBatchDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [batchSuffix, setBatchSuffix] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!item) return;
    setForm({
      allergens: (item.allergens || []).join(', '),
      note: item.note || '',
      active: item.active === false ? 'false' : 'true',
      supplier: (item as MaterialDoc).supplier || '',
      approvalStatus: (item as MaterialDoc).approvalStatus || 'pending',
      storageConditions: (item as MaterialDoc).storageConditions || '',
      unit: (item as MaterialDoc).unit || '',
      customer: (item as ProductDoc).customer || '',
      specificationVersion: (item as ProductDoc).specificationVersion || '',
      shelfLife: (item as ProductDoc).shelfLife || '',
      packaging: (item as ProductDoc).packaging || '',
      bomMaterialIds: ((item as ProductDoc).bomMaterialIds || []).join(','),
    });
  }, [item]);

  if (!item) {
    return (
      <aside className={`${PANEL} p-5`}>
        <div className="flex h-full min-h-56 flex-col items-center justify-center text-center">
          <ShieldCheck className="h-10 w-10 text-slate-300" />
          <div className="mt-3 text-lg font-black text-slate-950">Vyber kartu</div>
          <div className="mt-1 text-sm font-semibold text-slate-500">Rodný list zobrazí auditní údaje, šarži a compliance pole.</div>
        </div>
      </aside>
    );
  }

  const selectedDate = new Date(`${batchDate}T00:00:00`);
  const batchValue = tab === 'materials'
    ? materialBatch(item.number, selectedDate, batchSuffix)
    : productBatch(item.number, selectedDate);
  const relatedTemperatureLogs = temperatureLogs
    .filter((log) => tab === 'materials' ? log.materialId === item.id : log.productId === item.id)
    .slice(0, 12);

  const save = async () => {
    if (!canManage || !item) return;
    setSaving(true);
    try {
      const collectionName = tab === 'materials' ? 'materials' : 'products';
      const payload: Record<string, unknown> = {
        allergens: splitList(form.allergens || ''),
        note: form.note || '',
        active: form.active !== 'false',
        updatedAt: serverTimestamp(),
      };

      if (tab === 'materials') {
        payload.supplier = form.supplier || '';
        payload.approvalStatus = form.approvalStatus || 'pending';
        payload.storageConditions = form.storageConditions || '';
        payload.unit = form.unit || '';
      } else {
        payload.customer = form.customer || '';
        payload.specificationVersion = form.specificationVersion || '';
        payload.shelfLife = form.shelfLife || '';
        payload.packaging = form.packaging || '';
        payload.bomMaterialIds = splitList(form.bomMaterialIds || '');
      }

      await updateDoc(doc(db, collectionName, item.id), payload);
      showToast('Rodný list uložen', 'success');
    } catch (err) {
      console.error('[MasterData] save:', err);
      showToast('Rodný list se nepodařilo uložit', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <aside className={`${PANEL} p-5`}>
      <div className="flex flex-col gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">{item.nkCode}</span>
            <span className="text-xs font-bold text-slate-500">č. {item.number}</span>
          </div>
          <h2 className="mt-2 text-xl font-black text-slate-950">{item.name}</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">Rodný list · použití {item.usageCount || 0} · {formatDate(item.lastUsedAt)}</p>
        </div>

        <section className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
          <div className="flex items-center gap-2 text-sm font-black text-emerald-800">
            <CheckCircle2 className="h-4 w-4" />
            Návrh šarže
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label>
              <span className="mb-1 block text-xs font-black uppercase text-slate-500">{tab === 'materials' ? 'Datum naskladnění' : 'Datum zahájení výroby'}</span>
              <input type="date" value={batchDate} onChange={(e) => setBatchDate(e.target.value)} className={INPUT} />
            </label>
            {tab === 'materials' && (
              <label>
                <span className="mb-1 block text-xs font-black uppercase text-slate-500">Přípona expirace</span>
                <input value={batchSuffix} onChange={(e) => setBatchSuffix(e.target.value.toUpperCase().slice(0, 2))} placeholder="A / B / C" className={INPUT} />
              </label>
            )}
          </div>
          <div className="mt-3 rounded-xl bg-white px-3 py-2 text-lg font-black text-emerald-900">{batchValue}</div>
        </section>

        <section className="grid grid-cols-1 gap-3">
          <label>
            <span className="mb-1 block text-xs font-black uppercase text-slate-500">Alergeny</span>
            <input value={form.allergens || ''} onChange={(e) => setForm((p) => ({ ...p, allergens: e.target.value }))} placeholder="např. sója, mléko, vejce" className={INPUT} disabled={!canManage} />
          </label>

          {tab === 'materials' ? (
            <>
              <label>
                <span className="mb-1 block text-xs font-black uppercase text-slate-500">Dodavatel</span>
                <input value={form.supplier || ''} onChange={(e) => setForm((p) => ({ ...p, supplier: e.target.value }))} className={INPUT} disabled={!canManage} />
              </label>
              <label>
                <span className="mb-1 block text-xs font-black uppercase text-slate-500">Schválení dodavatele</span>
                <select value={form.approvalStatus || 'pending'} onChange={(e) => setForm((p) => ({ ...p, approvalStatus: e.target.value }))} className={INPUT} disabled={!canManage}>
                  <option value="pending">Doplnit / čeká na schválení</option>
                  <option value="approved">Schváleno</option>
                  <option value="conditional">Podmíněně</option>
                  <option value="blocked">Blokováno</option>
                </select>
              </label>
              <label>
                <span className="mb-1 block text-xs font-black uppercase text-slate-500">Skladovací podmínky</span>
                <input value={form.storageConditions || ''} onChange={(e) => setForm((p) => ({ ...p, storageConditions: e.target.value }))} className={INPUT} disabled={!canManage} />
              </label>
              <label>
                <span className="mb-1 block text-xs font-black uppercase text-slate-500">Jednotka</span>
                <input value={form.unit || ''} onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))} placeholder="kg, ks, balení..." className={INPUT} disabled={!canManage} />
              </label>
            </>
          ) : (
            <>
              <label>
                <span className="mb-1 block text-xs font-black uppercase text-slate-500">BOM suroviny</span>
                <select
                  multiple
                  value={splitList(form.bomMaterialIds || '')}
                  onChange={(e) => setForm((p) => ({ ...p, bomMaterialIds: Array.from(e.target.selectedOptions).map((option) => option.value).join(',') }))}
                  className={`${INPUT} min-h-32`}
                  disabled={!canManage}
                >
                  {sortByUseThenName(materials).map((material) => (
                    <option key={material.id} value={material.id}>{material.nkCode} · {material.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mb-1 block text-xs font-black uppercase text-slate-500">Specifikace / verze</span>
                <input value={form.specificationVersion || ''} onChange={(e) => setForm((p) => ({ ...p, specificationVersion: e.target.value }))} className={INPUT} disabled={!canManage} />
              </label>
              <label>
                <span className="mb-1 block text-xs font-black uppercase text-slate-500">Shelf-life</span>
                <input value={form.shelfLife || ''} onChange={(e) => setForm((p) => ({ ...p, shelfLife: e.target.value }))} className={INPUT} disabled={!canManage} />
              </label>
              <label>
                <span className="mb-1 block text-xs font-black uppercase text-slate-500">Balení</span>
                <input value={form.packaging || ''} onChange={(e) => setForm((p) => ({ ...p, packaging: e.target.value }))} className={INPUT} disabled={!canManage} />
              </label>
              <label>
                <span className="mb-1 block text-xs font-black uppercase text-slate-500">Zákazník</span>
                <input value={form.customer || ''} onChange={(e) => setForm((p) => ({ ...p, customer: e.target.value }))} className={INPUT} disabled={!canManage} />
              </label>
            </>
          )}

          <label>
            <span className="mb-1 block text-xs font-black uppercase text-slate-500">Poznámka</span>
            <textarea value={form.note || ''} onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))} className={`${INPUT} min-h-24 resize-y`} disabled={!canManage} />
          </label>
        </section>

        <section className="rounded-2xl border border-sky-100 bg-sky-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-black text-sky-900">Historie teplot</div>
              <div className="mt-1 text-xs font-semibold text-sky-700">Posledni záznamy navázané na tuto kartu</div>
            </div>
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-sky-800">{relatedTemperatureLogs.length}</span>
          </div>
          {relatedTemperatureLogs.length === 0 ? (
            <div className="mt-3 rounded-xl bg-white px-3 py-3 text-sm font-semibold text-slate-500">
              Zatím není žádný záznam teploty pro tuto kartu.
            </div>
          ) : (
            <div className="mt-3 grid gap-2">
              {relatedTemperatureLogs.map((log) => (
                <div key={log.id} className="rounded-xl bg-white px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-black text-slate-950">
                      {log.temperatureC} °C
                      {typeof log.motorLoadAmps === 'number' && <span className="ml-2 text-sky-700">{log.motorLoadAmps} A</span>}
                    </div>
                    <div className="text-xs font-bold text-slate-500">{formatDateTime(log.measuredAt)}</div>
                  </div>
                  <div className="mt-1 text-xs font-semibold text-slate-500">
                    {log.gearboxName || 'Převodovka'} · {log.extruderName || 'bez extruderu'}
                    {tab === 'materials' && log.materialBatch ? ` · ${log.materialBatch}` : ''}
                    {tab === 'products' && log.productBatch ? ` · ${log.productBatch}` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {canManage && (
          <button type="button" onClick={save} disabled={saving} className={BUTTON_PRIMARY}>
            <Save className="h-4 w-4" />
            {saving ? 'Ukládám...' : 'Uložit rodný list'}
          </button>
        )}
      </div>
    </aside>
  );
}

export default function MasterDataPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, hasPermission } = useAuthContext();
  const canManage = hasPermission('production.manage');
  const canRead = canManage || hasPermission('report.read') || hasPermission('production.read');
  const initialTab: Tab = location.pathname.includes('products') ? 'products' : 'materials';
  const [tab, setTab] = useState<Tab>(initialTab);
  const [search, setSearch] = useState('');
  const { materials, products, loading } = useMasterData(canManage, user);
  const temperatureLogs = useGearboxTemperatureHistory();
  const [selectedId, setSelectedId] = useState('');

  const activeItems = tab === 'materials' ? materials : products;
  const sortedItems = useMemo(() => sortByUseThenName(activeItems), [activeItems]);
  const filteredItems = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return sortedItems;
    return sortedItems.filter((item) => `${item.nkCode} ${item.number} ${item.name}`.toLowerCase().includes(needle));
  }, [search, sortedItems]);
  const selectedItem = activeItems.find((item) => item.id === selectedId) || filteredItems[0] || null;

  useEffect(() => {
    setSelectedId('');
  }, [tab]);

  const switchTab = (next: Tab) => {
    setTab(next);
    navigate(next === 'materials' ? '/materials' : '/products', { replace: true });
  };

  if (!canRead) {
    return (
      <div className="min-h-screen bg-[#f1ece3] p-6">
        <div className={`${PANEL} mx-auto max-w-xl p-6`}>
          <h1 className="text-2xl font-black text-slate-950">Bez oprávnění</h1>
          <p className="mt-2 text-sm font-semibold text-slate-600">Karty surovin a výrobků vidí výroba nebo audit/report.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f1ece3] text-slate-950">
      <header className="sticky top-0 z-20 border-b border-[#ded6c8] bg-[#f1ece3]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-4">
          <button type="button" onClick={() => navigate('/')} className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#ded6c8] bg-white text-slate-700">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            {tab === 'materials' ? <Leaf className="h-6 w-6" /> : <Package className="h-6 w-6" />}
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-black leading-tight">Suroviny a výrobky</h1>
            <p className="truncate text-sm font-semibold text-slate-500">Master data, šarže, alergeny a traceabilita</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5">
        <div className="mb-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => switchTab('materials')} className={tab === 'materials' ? BUTTON_PRIMARY : BUTTON_SECONDARY}>
            <Leaf className="h-4 w-4" />
            Suroviny ({materials.length || MATERIAL_SEED.length})
          </button>
          <button type="button" onClick={() => switchTab('products')} className={tab === 'products' ? BUTTON_PRIMARY : BUTTON_SECONDARY}>
            <Factory className="h-4 w-4" />
            Výrobky ({products.length || PRODUCT_SEED.length})
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
          <section className={`${PANEL} p-4`}>
            <div className="mb-4 flex items-center gap-2 rounded-2xl border border-[#ded6c8] bg-[#fbf9f4] px-3 py-2.5">
              <Search className="h-5 w-5 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Hledat NK kód, číslo nebo název..." className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400" />
            </div>

            {loading ? (
              <div className="py-16 text-center text-sm font-bold text-slate-500">Načítám master data...</div>
            ) : (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                {filteredItems.map((item) => (
                  <MasterCard
                    key={item.id}
                    item={item}
                    selected={selectedItem?.id === item.id}
                    onSelect={() => setSelectedId(item.id)}
                  />
                ))}
              </div>
            )}
          </section>

          <DetailPanel
            tab={tab}
            item={selectedItem as MaterialDoc | ProductDoc | null}
            canManage={canManage}
            materials={materials}
            temperatureLogs={temperatureLogs}
          />
        </div>
      </main>
    </div>
  );
}
