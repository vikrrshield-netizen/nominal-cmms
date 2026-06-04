import { useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, writeBatch, type Timestamp } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, ClipboardList, Download, Factory, FileText, Leaf, Package, Plus, Printer, Save, Search, ShieldCheck, Trash2, Upload, X } from 'lucide-react';
import { useAuthContext } from '../context/AuthContext';
import { db, storage } from '../lib/firebase';
import { MATERIAL_SEED, PRODUCT_SEED, materialBatch, productBatch } from '../data/productionMasterSeed';
import { showToast } from '../components/ui/Toast';
import type { GearboxTemperatureLog } from '../types/gearbox';

type Tab = 'materials' | 'products';
type ApprovalStatus = 'pending' | 'approved' | 'conditional' | 'blocked';

interface MasterAttachment {
  name: string;
  url: string;
  path?: string;
  contentType?: string;
  uploadedAt?: Timestamp | Date | string | null;
  uploadedBy?: string;
  uploadedById?: string;
}

interface ProductRecipeItem {
  materialId: string;
  materialName: string;
  ratio: number;
}

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
  attachments?: MasterAttachment[];
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
  recipe?: ProductRecipeItem[];
  targetMotorLoadAmps?: number | null;
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

function collectionForTab(tab: Tab) {
  return tab === 'materials' ? 'materials' : 'products';
}

function seedId(kind: 'material' | 'product', nkCode: string) {
  return `${kind}-${nkCode.toLowerCase()}`;
}

function sanitizeFileName(name: string) {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120) || 'document';
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function csvCell(value: unknown) {
  const text = String(value ?? '').replace(/\r?\n/g, ' ');
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadTextFile(filename: string, content: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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
            attachments: [],
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
            recipe: [],
            targetMotorLoadAmps: null,
            attachments: [],
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
  user,
  materials,
  temperatureLogs,
  onDelete,
}: {
  tab: Tab;
  item: MaterialDoc | ProductDoc | null;
  canManage: boolean;
  user: ReturnType<typeof useAuthContext>['user'];
  materials: MaterialDoc[];
  temperatureLogs: GearboxTemperatureLog[];
  onDelete: (item: MaterialDoc | ProductDoc) => Promise<void>;
}) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [batchDate, setBatchDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [batchSuffix, setBatchSuffix] = useState('');
  const [recipe, setRecipe] = useState<ProductRecipeItem[]>([]);
  const [uploading, setUploading] = useState(false);
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
      targetMotorLoadAmps: typeof (item as ProductDoc).targetMotorLoadAmps === 'number' ? String((item as ProductDoc).targetMotorLoadAmps) : '',
    });
    const product = item as ProductDoc;
    if (product.recipe?.length) {
      setRecipe(product.recipe);
    } else {
      setRecipe((product.bomMaterialIds || []).map((materialId) => {
        const material = materials.find((entry) => entry.id === materialId);
        return {
          materialId,
          materialName: material?.name || materialId,
          ratio: 0,
        };
      }));
    }
  }, [item, materials]);

  if (!item) {
    return (
      <aside className={`${PANEL} p-5 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto`}>
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

  const addRecipeRow = () => {
    setRecipe((prev) => [...prev, { materialId: '', materialName: '', ratio: 0 }]);
  };

  const updateRecipeRow = (index: number, patch: Partial<ProductRecipeItem>) => {
    setRecipe((prev) => prev.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      const next = { ...row, ...patch };
      if (patch.materialId) {
        const material = materials.find((entry) => entry.id === patch.materialId);
        next.materialName = material?.name || patch.materialId;
      }
      return next;
    }));
  };

  const removeRecipeRow = (index: number) => {
    setRecipe((prev) => prev.filter((_, rowIndex) => rowIndex !== index));
  };

  const uploadAttachment = async (file: File | null) => {
    if (!file || !canManage || !item) return;
    setUploading(true);
    try {
      const collectionName = collectionForTab(tab);
      const path = `${collectionName}/${item.id}/docs/${Date.now()}_${sanitizeFileName(file.name)}`;
      const snap = await uploadBytes(ref(storage, path), file, { contentType: file.type || undefined });
      const url = await getDownloadURL(snap.ref);
      const attachment: MasterAttachment = {
        name: file.name,
        url,
        path,
        contentType: file.type || '',
        uploadedAt: new Date().toISOString(),
        uploadedBy: user?.displayName || 'Neznámý uživatel',
        uploadedById: user?.uid || user?.id || '',
      };
      await updateDoc(doc(db, collectionName, item.id), {
        attachments: [...(item.attachments || []), attachment],
        updatedAt: serverTimestamp(),
      });
      showToast('Dokument nahrán', 'success');
    } catch (err) {
      console.error('[MasterData] upload attachment:', err);
      showToast('Dokument se nepodařilo nahrát', 'error');
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = async (index: number) => {
    if (!canManage || !item) return;
    const nextAttachments = (item.attachments || []).filter((_, itemIndex) => itemIndex !== index);
    try {
      await updateDoc(doc(db, collectionForTab(tab), item.id), {
        attachments: nextAttachments,
        updatedAt: serverTimestamp(),
      });
      showToast('Dokument odebrán z karty', 'success');
    } catch (err) {
      console.error('[MasterData] remove attachment:', err);
      showToast('Dokument se nepodařilo odebrat', 'error');
    }
  };

  const printCard = () => {
    const win = window.open('', '_blank', 'width=900,height=1000');
    if (!win) {
      showToast('Prohlížeč zablokoval tiskové okno', 'error');
      return;
    }
    const attachmentsHtml = (item.attachments || [])
      .map((attachment) => `<li>${escapeHtml(attachment.name)} (${escapeHtml(formatDateTime(attachment.uploadedAt))})</li>`)
      .join('');
    const recipeHtml = tab === 'products'
      ? recipe.map((row) => `<li>${escapeHtml(row.materialName || row.materialId)}: ${escapeHtml(row.ratio)} dílů</li>`).join('')
      : '';
    const tempHtml = relatedTemperatureLogs
      .map((log) => `<tr><td>${escapeHtml(formatDateTime(log.measuredAt))}</td><td>${escapeHtml(log.gearboxName || '')}</td><td>${escapeHtml(log.extruderName || '')}</td><td>${escapeHtml(log.temperatureC)} °C</td><td>${escapeHtml(typeof log.motorLoadAmps === 'number' ? `${log.motorLoadAmps} A` : '')}</td></tr>`)
      .join('');
    win.document.write(`
      <!doctype html>
      <html lang="cs">
        <head>
          <meta charset="utf-8" />
          <title>Rodný list ${escapeHtml(item.nkCode)}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 32px; color: #0f172a; }
            h1 { margin: 0 0 4px; font-size: 26px; }
            h2 { margin-top: 24px; font-size: 16px; border-bottom: 1px solid #ddd; padding-bottom: 6px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            td, th { border: 1px solid #ddd; padding: 8px; text-align: left; vertical-align: top; }
            .meta { color: #475569; font-weight: 700; }
            @media print { button { display: none; } }
          </style>
        </head>
        <body>
          <button onclick="window.print()">Tisk</button>
          <h1>${escapeHtml(item.name)}</h1>
          <div class="meta">${escapeHtml(item.nkCode)} · č. ${escapeHtml(item.number)} · ${tab === 'materials' ? 'Surovina' : 'Výrobek'}</div>
          <h2>Identifikace</h2>
          <table>
            <tr><th>Alergeny</th><td>${escapeHtml((item.allergens || []).join(', ') || 'neuvedeno')}</td></tr>
            <tr><th>Stav</th><td>${item.active === false ? 'Neaktivní' : 'Aktivní'}</td></tr>
            <tr><th>Poznámka</th><td>${escapeHtml(form.note || item.note || '')}</td></tr>
            ${tab === 'products' ? `<tr><th>Cílová zátěž</th><td>${escapeHtml(form.targetMotorLoadAmps || '')} A</td></tr>` : ''}
          </table>
          ${recipeHtml ? `<h2>Receptura</h2><ul>${recipeHtml}</ul>` : ''}
          <h2>Dokumenty</h2>
          ${attachmentsHtml ? `<ul>${attachmentsHtml}</ul>` : '<p>Bez dokumentů.</p>'}
          <h2>Historie teplot</h2>
          <table>
            <thead><tr><th>Datum</th><th>Převodovka</th><th>Extruder</th><th>Teplota</th><th>Zátěž</th></tr></thead>
            <tbody>${tempHtml || '<tr><td colspan="5">Bez záznamů.</td></tr>'}</tbody>
          </table>
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
  };

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
        const cleanRecipe = recipe
          .filter((row) => row.materialId)
          .map((row) => {
            const material = materials.find((entry) => entry.id === row.materialId);
            return {
              materialId: row.materialId,
              materialName: material?.name || row.materialName || row.materialId,
              ratio: Number(row.ratio) || 0,
            };
          });
        payload.customer = form.customer || '';
        payload.specificationVersion = form.specificationVersion || '';
        payload.shelfLife = form.shelfLife || '';
        payload.packaging = form.packaging || '';
        payload.recipe = cleanRecipe;
        payload.bomMaterialIds = cleanRecipe.map((row) => row.materialId);
        const targetMotorLoadAmps = form.targetMotorLoadAmps.trim() === '' ? null : Number(String(form.targetMotorLoadAmps).replace(',', '.'));
        if (targetMotorLoadAmps !== null && Number.isNaN(targetMotorLoadAmps)) {
          showToast('Cílová zátěž musí být číslo v ampérech', 'error');
          setSaving(false);
          return;
        }
        payload.targetMotorLoadAmps = targetMotorLoadAmps;
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
    <aside className={`${PANEL} p-5 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto`}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">{item.nkCode}</span>
                <span className="text-xs font-bold text-slate-500">č. {item.number}</span>
              </div>
              <h2 className="mt-2 text-xl font-black text-slate-950">{item.name}</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">Rodný list · použití {item.usageCount || 0} · {formatDate(item.lastUsedAt)}</p>
            </div>
            <button type="button" onClick={printCard} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#ded6c8] bg-white text-slate-700 hover:bg-[#fbf9f4]" title="Tisk rodného listu">
              <Printer className="h-4 w-4" />
            </button>
          </div>
          {canManage && (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={save} disabled={saving} className={BUTTON_PRIMARY}>
                <Save className="h-4 w-4" />
                {saving ? 'Ukládám...' : 'Upravit / uložit'}
              </button>
              <button type="button" onClick={() => void onDelete(item)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-black text-red-700 hover:bg-red-100">
                <Trash2 className="h-4 w-4" />
                Smazat
              </button>
            </div>
          )}
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
              <section className="rounded-2xl border border-[#ded6c8] bg-[#fbf9f4] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-black text-slate-950">Receptura</div>
                    <div className="text-xs font-semibold text-slate-500">Surovina + poměr/díly</div>
                  </div>
                  {canManage && (
                    <button type="button" onClick={addRecipeRow} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#ded6c8] bg-white px-3 text-xs font-black text-slate-800">
                      <Plus className="h-4 w-4" />
                      Přidat
                    </button>
                  )}
                </div>
                <div className="mt-3 grid gap-2">
                  {recipe.length === 0 && <div className="rounded-xl bg-white px-3 py-3 text-sm font-semibold text-slate-500">Receptura zatím není vyplněná.</div>}
                  {recipe.map((row, index) => (
                    <div key={`${row.materialId}-${index}`} className="grid grid-cols-[minmax(0,1fr)_90px_40px] gap-2">
                      <select
                        value={row.materialId}
                        onChange={(e) => updateRecipeRow(index, { materialId: e.target.value })}
                        className={INPUT}
                        disabled={!canManage}
                      >
                        <option value="">Vyber surovinu</option>
                        {sortByUseThenName(materials).map((material) => (
                          <option key={material.id} value={material.id}>{material.nkCode} · {material.name}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={row.ratio || ''}
                        onChange={(e) => updateRecipeRow(index, { ratio: Number(e.target.value) })}
                        placeholder="poměr"
                        className={INPUT}
                        disabled={!canManage}
                      />
                      {canManage ? (
                        <button type="button" onClick={() => removeRecipeRow(index)} className="flex h-11 items-center justify-center rounded-xl bg-red-50 text-red-700">
                          <X className="h-4 w-4" />
                        </button>
                      ) : <div />}
                    </div>
                  ))}
                </div>
              </section>
              <label>
                <span className="mb-1 block text-xs font-black uppercase text-slate-500">Cílová zátěž motoru</span>
                <input
                  value={form.targetMotorLoadAmps || ''}
                  onChange={(e) => setForm((p) => ({ ...p, targetMotorLoadAmps: e.target.value.replace(',', '.') }))}
                  inputMode="decimal"
                  placeholder="např. 42,5 A"
                  className={INPUT}
                  disabled={!canManage}
                />
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

        <section className="rounded-2xl border border-[#ded6c8] bg-[#fbf9f4] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-black text-slate-950">Dokumenty</div>
              <div className="mt-1 text-xs font-semibold text-slate-500">Specifikace, COA, certifikáty a auditní přílohy</div>
            </div>
            {canManage && (
              <label className={`${BUTTON_SECONDARY} cursor-pointer`}>
                <Upload className="h-4 w-4" />
                {uploading ? 'Nahrávám...' : 'Nahrát'}
                <input
                  type="file"
                  className="hidden"
                  disabled={uploading}
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    void uploadAttachment(file);
                    event.currentTarget.value = '';
                  }}
                />
              </label>
            )}
          </div>
          {(item.attachments || []).length === 0 ? (
            <div className="mt-3 rounded-xl bg-white px-3 py-3 text-sm font-semibold text-slate-500">Na kartě zatím není žádný dokument.</div>
          ) : (
            <div className="mt-3 grid gap-2">
              {(item.attachments || []).map((attachment, index) => (
                <div key={`${attachment.url}-${index}`} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2">
                  <a href={attachment.url} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 text-sm font-black text-slate-900 hover:text-emerald-700">
                    <FileText className="h-4 w-4 shrink-0 text-emerald-700" />
                    <span className="truncate">{attachment.name}</span>
                  </a>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="hidden text-xs font-semibold text-slate-500 sm:block">{formatDate(attachment.uploadedAt)}</span>
                    {canManage && (
                      <button type="button" onClick={() => void removeAttachment(index)} className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 text-red-700">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
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

      </div>
    </aside>
  );
}

function NewItemModal({
  tab,
  onClose,
  onCreate,
}: {
  tab: Tab;
  onClose: () => void;
  onCreate: (input: { nkCode: string; number: string; name: string }) => Promise<void>;
}) {
  const [nkCode, setNkCode] = useState('');
  const [number, setNumber] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!nkCode.trim() || !number.trim() || !name.trim()) {
      showToast('Vyplň NK kód, číslo a název', 'error');
      return;
    }
    setSaving(true);
    try {
      await onCreate({ nkCode: nkCode.trim().toUpperCase(), number: number.trim(), name: name.trim() });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
      <div className="w-full max-w-lg rounded-3xl border border-[#ded6c8] bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-black text-slate-950">{tab === 'materials' ? 'Nová surovina' : 'Nový výrobek'}</div>
            <div className="mt-1 text-sm font-semibold text-slate-500">Karta se založí jako aktivní a půjde hned doplnit v rodném listu.</div>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-5 grid gap-3">
          <label>
            <span className="mb-1 block text-xs font-black uppercase text-slate-500">NK kód</span>
            <input value={nkCode} onChange={(e) => setNkCode(e.target.value.toUpperCase())} placeholder={tab === 'materials' ? 'NK01' : 'NK001'} className={INPUT} />
          </label>
          <label>
            <span className="mb-1 block text-xs font-black uppercase text-slate-500">Číslo</span>
            <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder={tab === 'materials' ? '01' : '001'} className={INPUT} />
          </label>
          <label>
            <span className="mb-1 block text-xs font-black uppercase text-slate-500">Název</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Název karty" className={INPUT} />
          </label>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} className={BUTTON_SECONDARY}>Zrušit</button>
          <button type="button" onClick={() => void submit()} disabled={saving} className={BUTTON_PRIMARY}>
            <Plus className="h-4 w-4" />
            {saving ? 'Zakládám...' : 'Založit kartu'}
          </button>
        </div>
      </div>
    </div>
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
  const [showCreateModal, setShowCreateModal] = useState(false);

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

  const createItem = async (input: { nkCode: string; number: string; name: string }) => {
    if (!canManage) return;
    const collectionName = collectionForTab(tab);
    const newRef = doc(collection(db, collectionName));
    const basePayload = {
      nkCode: input.nkCode,
      number: input.number,
      name: input.name,
      note: '',
      active: true,
      allergens: [],
      usageCount: 0,
      lastUsedAt: null,
      attachments: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdById: user?.uid || user?.id || '',
      createdByName: user?.displayName || 'Neznámý uživatel',
    };
    const payload = tab === 'materials'
      ? {
          ...basePayload,
          supplier: '',
          approvalStatus: 'pending',
          storageConditions: '',
          unit: '',
        }
      : {
          ...basePayload,
          customer: '',
          specificationVersion: '',
          shelfLife: '',
          packaging: '',
          bomMaterialIds: [],
          recipe: [],
          targetMotorLoadAmps: null,
        };

    await setDoc(newRef, payload);
    setSelectedId(newRef.id);
    setShowCreateModal(false);
    showToast('Karta založena', 'success');
  };

  const deleteItem = async (item: MaterialDoc | ProductDoc) => {
    if (!canManage) return;
    const ok = window.confirm(`Opravdu smazat kartu "${item.name}"?`);
    if (!ok) return;
    await deleteDoc(doc(db, collectionForTab(tab), item.id));
    setSelectedId('');
    showToast('Karta smazána', 'success');
  };

  const exportCsv = () => {
    const rows = filteredItems.map((item) => {
      const base = [
        item.nkCode,
        item.number,
        item.name,
        item.active === false ? 'neaktivní' : 'aktivní',
        (item.allergens || []).join(', '),
        item.usageCount || 0,
        formatDateTime(item.lastUsedAt),
        item.note || '',
      ];
      if (tab === 'materials') {
        const material = item as MaterialDoc;
        return [...base, material.supplier || '', material.approvalStatus || '', material.storageConditions || '', material.unit || '', (material.attachments || []).map((a) => a.name).join('; ')];
      }
      const product = item as ProductDoc;
      return [...base, product.customer || '', product.specificationVersion || '', product.shelfLife || '', product.packaging || '', product.targetMotorLoadAmps ?? '', (product.recipe || []).map((row) => `${row.materialName}:${row.ratio}`).join('; '), (product.attachments || []).map((a) => a.name).join('; ')];
    });
    const headers = tab === 'materials'
      ? ['NK kód', 'Číslo', 'Název', 'Stav', 'Alergeny', 'Použití', 'Naposledy', 'Poznámka', 'Dodavatel', 'Schválení', 'Skladování', 'Jednotka', 'Dokumenty']
      : ['NK kód', 'Číslo', 'Název', 'Stav', 'Alergeny', 'Použití', 'Naposledy', 'Poznámka', 'Zákazník', 'Specifikace', 'Shelf-life', 'Balení', 'Cílová zátěž A', 'Receptura', 'Dokumenty'];
    const csv = `\ufeff${[headers, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n')}`;
    downloadTextFile(`${tab === 'materials' ? 'suroviny' : 'vyrobky'}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
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

        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-bold text-slate-500">
            {filteredItems.length} z {activeItems.length} karet
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={exportCsv} className={BUTTON_SECONDARY}>
              <Download className="h-4 w-4" />
              CSV
            </button>
            {canManage && (
              <button type="button" onClick={() => setShowCreateModal(true)} className={BUTTON_PRIMARY}>
                <Plus className="h-4 w-4" />
                Nová položka
              </button>
            )}
          </div>
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
            user={user}
            materials={materials}
            temperatureLogs={temperatureLogs}
            onDelete={deleteItem}
          />
        </div>
      </main>

      {showCreateModal && (
        <NewItemModal
          tab={tab}
          onClose={() => setShowCreateModal(false)}
          onCreate={createItem}
        />
      )}
    </div>
  );
}
