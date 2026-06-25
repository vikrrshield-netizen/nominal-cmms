import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, limit, onSnapshot, orderBy, query, Timestamp } from 'firebase/firestore';
import {
  ArrowLeft,
  ChevronDown,
  CheckCircle2,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  ExternalLink,
  Filter,
  Package,
  Search,
  ShoppingCart,
  Wind,
  X,
} from 'lucide-react';
import { db } from '../lib/firebase';
import { useAuthContext } from '../context/AuthContext';
import { useEmployeeNames, MAINTENANCE_EMPLOYEE_ROLES } from '../hooks/useEmployeeDirectory';
import { addWorkLog, subscribeToRecentWorkLogs } from '../services/workLogService';
import { showToast } from '../components/ui/Toast';
import KlimatizaceSection from '../components/hvac/KlimatizaceSection';
import type { Asset, CustomField } from '../types/asset';
import type { InventoryItem } from '../types/inventory';
import type { WorkLog } from '../types/workLog';

interface PrefilterRecord {
  id: string;
  assetId?: string;
  assetName?: string;
  buildingId?: string;
  roomName?: string;
  changedAt?: Date;
  changedById?: string;
  changedByName?: string;
  notes?: string;
  createdAt?: Date;
}

function normalize(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isHvacAsset(asset: Asset) {
  const text = normalize(`${asset.name} ${asset.code} ${asset.entityType} ${asset.category} ${asset.location} ${asset.areaName} ${asset.notes}`);
  return text.includes('vzduchotechnika')
    || text.includes('vzt')
    || text.includes('ventilace')
    || text.includes('vetrani')
    || text.includes('klima')
    || text.includes('filtr')
    || text.includes('air handling')
    || asset.category === 'hvac';
}

function isPrefilterHvacAsset(asset: Asset) {
  const text = normalize(`${asset.name} ${asset.code} ${asset.entityType} ${asset.category} ${asset.location} ${asset.areaName} ${asset.notes}`);
  return text.includes('predfiltr');
}

function isExtrusionHvacAsset(asset: Asset) {
  const text = normalize(`${asset.name} ${asset.code} ${asset.entityType} ${asset.category} ${asset.location} ${asset.areaName} ${asset.notes}`);
  return text.includes('extrudovna') || text.includes('extruder');
}

function isFilterItem(item: InventoryItem) {
  const text = normalize(`${item.name} ${item.code} ${item.category} ${item.location} ${item.filterSpec?.dimensions} ${item.filterSpec?.typeCode} ${item.filterSpec?.filterClass}`);
  return item.category === 'filters'
    || text.includes('filtr')
    || text.includes('vzt')
    || text.includes('vzduchotechnika');
}

function isHvacExchangeLog(log: WorkLog) {
  const text = normalize(`${log.workType} ${log.content} ${log.taskTitle} ${log.assetName}`);
  return text.includes('vymena filtru')
    || text.includes('vymena vzt')
    || text.includes('filtr')
    || text.includes('vzduchotechnika')
    || text.includes('vzt');
}

function placeLabel(asset: Asset) {
  return [asset.buildingId ? `Budova ${asset.buildingId}` : '', asset.floor, asset.areaName || asset.location]
    .filter(Boolean)
    .join(' | ') || 'Umístění není vyplněné';
}

function customField(asset: Asset, keys: string[]) {
  const fields = asset.customFields || [];
  const normalizedKeys = keys.map(normalize);
  const found = fields.find((field: CustomField) => {
    const label = normalize(`${field.key} ${field.label}`);
    return normalizedKeys.some((key) => label.includes(key));
  });
  return found?.value ? String(found.value) : '';
}

function asDate(value: WorkLog['createdAt'] | WorkLog['performedAt']) {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  const date = new Date(value as any);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function asTime(value: WorkLog['createdAt'] | WorkLog['performedAt']) {
  return asDate(value)?.getTime() || 0;
}

function formatDate(value: WorkLog['createdAt'] | WorkLog['performedAt']) {
  const date = asDate(value);
  if (!date) return 'Bez data';
  return new Intl.DateTimeFormat('cs-CZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function toDateTimeLocal(date: Date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function firestoreDate(value: unknown) {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  const date = new Date(value as any);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function prefilterToWorkLog(record: PrefilterRecord): WorkLog {
  const location = [record.buildingId ? `Budova ${record.buildingId}` : '', record.roomName].filter(Boolean).join(' | ');
  return {
    id: `prefilter-${record.id}`,
    userId: record.changedById || 'kiosk',
    userName: record.changedByName || 'Kiosk',
    workerNames: record.changedByName ? [record.changedByName] : undefined,
    type: 'maintenance',
    workType: 'Výměna předfiltru',
    content: [
      'Výměna předfiltru potvrzena z kiosku.',
      record.assetName ? `Zařízení: ${record.assetName}` : '',
      location ? `Umístění: ${location}` : '',
      record.notes ? `Poznámka: ${record.notes}` : '',
    ].filter(Boolean).join('\n'),
    assetId: record.assetId,
    assetName: record.assetName,
    location: location || undefined,
    performedAt: record.changedAt,
    createdAt: record.createdAt || record.changedAt || new Date(),
    auditReady: true,
  };
}

function dedupeLogs(logs: WorkLog[]) {
  const byKey = new Map<string, WorkLog>();
  for (const log of logs) {
    const key = [
      log.assetId || normalize(log.assetName),
      asTime(log.performedAt || log.createdAt),
      normalize(log.workType || log.content).slice(0, 40),
    ].join('|');
    if (!byKey.has(key)) byKey.set(key, log);
  }
  return [...byKey.values()];
}

export default function HvacPage() {
  const navigate = useNavigate();
  const { user, hasPermission } = useAuthContext();
  const employeeNames = useEmployeeNames({ tenantId: user?.tenantId, roles: MAINTENANCE_EMPLOYEE_ROLES });
  const [assets, setAssets] = useState<Asset[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [workLogs, setWorkLogs] = useState<WorkLog[]>([]);
  const [prefilterLogs, setPrefilterLogs] = useState<WorkLog[]>([]);
  const [search, setSearch] = useState('');
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [exchangeAsset, setExchangeAsset] = useState<Asset | null>(null);
  const [exchangeDateTime, setExchangeDateTime] = useState(toDateTimeLocal(new Date()));
  const [exchangeWorker, setExchangeWorker] = useState(user?.displayName || '');
  const [exchangeNote, setExchangeNote] = useState('');
  const [savingExchange, setSavingExchange] = useState(false);
  const [showPrefilters, setShowPrefilters] = useState(false);
  const [view, setView] = useState<'vzt' | 'klimatizace'>('vzt');
  const canWriteHvacExchange = hasPermission('hvac.manage') || hasPermission('wo.create') || hasPermission('wo.update');

  useEffect(() => {
    if (!exchangeWorker && user?.displayName) setExchangeWorker(user.displayName);
  }, [exchangeWorker, user?.displayName]);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'assets'),
      (snapshot) => setAssets(snapshot.docs.map((document) => ({ id: document.id, ...document.data() } as Asset))),
      () => setAssets([]),
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'inventory'),
      (snapshot) => setInventory(snapshot.docs.map((document) => ({ id: document.id, ...document.data() } as InventoryItem))),
      () => setInventory([]),
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => subscribeToRecentWorkLogs(setWorkLogs, 500), []);

  useEffect(() => {
    const prefilterQuery = query(collection(db, 'prefilters'), orderBy('createdAt', 'desc'), limit(300));
    return onSnapshot(
      prefilterQuery,
      (snapshot) => {
        setPrefilterLogs(snapshot.docs.map((document) => {
          const data = document.data();
          return prefilterToWorkLog({
            id: document.id,
            assetId: data.assetId,
            assetName: data.assetName,
            buildingId: data.buildingId,
            roomName: data.roomName,
            changedAt: firestoreDate(data.changedAt),
            changedById: data.changedById,
            changedByName: data.changedByName,
            notes: data.notes,
            createdAt: firestoreDate(data.createdAt),
          });
        }));
      },
      () => setPrefilterLogs([]),
    );
  }, []);

  const allHvacSourceLogs = useMemo(() => dedupeLogs([...workLogs, ...prefilterLogs]), [prefilterLogs, workLogs]);

  const hvacAssets = useMemo(() => {
    const query = normalize(search);
    return assets
      .filter((asset) => !asset.isDeleted)
      .filter((asset) => asset.tenantId === user?.tenantId || !asset.tenantId || !user?.tenantId)
      .filter(isHvacAsset)
      .filter((asset) => {
        if (!query) return true;
        return normalize(`${asset.name} ${asset.code} ${placeLabel(asset)} ${asset.status}`).includes(query);
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'cs'));
  }, [assets, search, user?.tenantId]);

  const filterItems = useMemo(() => (
    inventory
      .filter((item) => !item.isDeleted)
      .filter(isFilterItem)
      .sort((a, b) => a.name.localeCompare(b.name, 'cs'))
  ), [inventory]);

  const lowFilterItems = filterItems.filter((item) => item.quantity <= item.minQuantity);
  const hvacAssetIds = useMemo(() => new Set(hvacAssets.map((asset) => asset.id)), [hvacAssets]);
  const hvacAssetNames = useMemo(() => new Set(hvacAssets.map((asset) => normalize(asset.name))), [hvacAssets]);
  const prefilterAssets = useMemo(() => hvacAssets.filter(isPrefilterHvacAsset), [hvacAssets]);
  const extrusionHvacAssets = useMemo(() => hvacAssets.filter((asset) => !isPrefilterHvacAsset(asset) && isExtrusionHvacAsset(asset)), [hvacAssets]);
  const otherHvacAssets = useMemo(() => hvacAssets.filter((asset) => !isPrefilterHvacAsset(asset) && !isExtrusionHvacAsset(asset)), [hvacAssets]);

  const recentHvacLogs = useMemo(() => (
    allHvacSourceLogs
      .filter((log) => {
        if (log.assetId && hvacAssetIds.has(log.assetId)) return true;
        if (log.assetName && hvacAssetNames.has(normalize(log.assetName))) return true;
        return isHvacExchangeLog(log);
      })
      .sort((a, b) => Math.max(asTime(b.performedAt), asTime(b.createdAt)) - Math.max(asTime(a.performedAt), asTime(a.createdAt)))
      .slice(0, 10)
  ), [allHvacSourceLogs, hvacAssetIds, hvacAssetNames]);

  const filtersForAsset = (asset: Asset) => filterItems.filter((item) => (
    item.assetId === asset.id
    || item.compatibleAssetIds?.includes(asset.id)
    || item.compatibleAssetNames?.some((name) => normalize(name) === normalize(asset.name))
    || normalize(item.name).includes(normalize(asset.name))
  ));

  const logsForAsset = (asset: Asset) => allHvacSourceLogs
    .filter((log) => (
      log.assetId === asset.id
      || normalize(log.assetName) === normalize(asset.name)
    ))
    .filter(isHvacExchangeLog)
    .sort((a, b) => Math.max(asTime(b.performedAt), asTime(b.createdAt)) - Math.max(asTime(a.performedAt), asTime(a.createdAt)));

  const lastExchangeForAsset = (asset: Asset) => logsForAsset(asset)[0];

  const renderCompactCard = (asset: Asset) => {
    const linkedFilters = filtersForAsset(asset);
    const dimension = customField(asset, ['rozmer filtru', 'rozmery filtru', 'filter size', 'filtr']);
    const pieces = customField(asset, ['pocet filtru', 'pocet kusu', 'kusy']);
    const lastExchange = lastExchangeForAsset(asset);

    return (
      <article key={asset.id} className="card-b p-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
            <Wind className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-black text-slate-900">{asset.name}</h2>
            <p className="truncate text-sm font-semibold text-slate-600">{asset.code || 'Bez kódu'} | {placeLabel(asset)}</p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-xl bg-slate-50 p-2">
            <div className="font-bold uppercase text-slate-500">Výměna</div>
            <div className="mt-1 font-black text-slate-900">{lastExchange ? formatDate(lastExchange.performedAt || lastExchange.createdAt) : 'Bez zápisu'}</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-2">
            <div className="font-bold uppercase text-slate-500">Filtr</div>
            <div className="mt-1 font-black text-slate-900">{linkedFilters[0]?.filterSpec?.dimensions || dimension || pieces || 'Doplnit'}</div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <button type="button" onClick={() => setSelectedAsset(asset)} className="min-h-11 rounded-xl bg-blue-600 px-2 text-sm font-bold text-white">
            Detail
          </button>
          <button
            type="button"
            onClick={() => openExchange(asset)}
            disabled={!canWriteHvacExchange}
            className="min-h-11 rounded-xl bg-emerald-600 px-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
          >
            Výměna
          </button>
          <button type="button" onClick={() => navigate(`/inventory?asset=${asset.id}&category=filters`)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-2 text-sm font-bold text-slate-700">
            Sklad
          </button>
        </div>
      </article>
    );
  };

  const renderPrefilterRow = (asset: Asset) => {
    const lastExchange = lastExchangeForAsset(asset);
    const dimension = customField(asset, ['rozmer filtru', 'rozmery filtru', 'filter size', 'filtr']);

    return (
      <div key={asset.id} className="grid gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="min-w-0">
          <div className="truncate text-base font-black text-slate-900">{asset.name}</div>
          <div className="mt-1 grid gap-1 text-sm font-bold text-slate-600 sm:grid-cols-2">
            <span className="truncate">{asset.code || 'Bez kódu'} | {placeLabel(asset)}</span>
            <span className="truncate">Výměna: {lastExchange ? formatDate(lastExchange.performedAt || lastExchange.createdAt) : 'bez zápisu'}</span>
          </div>
          <div className="mt-1 text-sm font-bold text-blue-700">Filtr: {dimension || 'doplnit rozměr / počet'}</div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:w-56">
          <button
            type="button"
            onClick={() => openExchange(asset)}
            disabled={!canWriteHvacExchange}
            className="min-h-10 rounded-xl bg-emerald-600 px-2 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
          >
            Výměna
          </button>
          <button type="button" onClick={() => setSelectedAsset(asset)} className="min-h-10 rounded-xl border border-slate-200 bg-white px-2 text-sm font-black text-slate-700">
            Detail
          </button>
        </div>
      </div>
    );
  };

  const openExchange = (asset: Asset) => {
    setExchangeAsset(asset);
    setExchangeDateTime(toDateTimeLocal(new Date()));
    setExchangeWorker(user?.displayName || employeeNames[0] || '');
    setExchangeNote('');
  };

  const saveExchange = async () => {
    if (!exchangeAsset) return;
    if (!canWriteHvacExchange) {
      showToast('Tvoje role nemá právo zapisovat výměny VZT.', 'error');
      return;
    }
    const worker = exchangeWorker.trim();
    if (!worker) {
      showToast('Vyber nebo napiš pracovníka.', 'error');
      return;
    }

    setSavingExchange(true);
    try {
      const performedAt = exchangeDateTime ? new Date(exchangeDateTime) : new Date();
      const note = exchangeNote.trim();
      const content = [
        'Výměna filtru VZT potvrzena.',
        `Zařízení: ${exchangeAsset.name}`,
        `Umístění: ${placeLabel(exchangeAsset)}`,
        note ? `Poznámka: ${note}` : '',
      ].filter(Boolean).join('\n');

      await addWorkLog({
        userId: user?.id || user?.uid || 'unknown',
        userName: worker,
        workerNames: [worker],
        type: 'maintenance',
        workType: 'Výměna filtru VZT',
        content,
        assetId: exchangeAsset.id,
        assetName: exchangeAsset.name,
        location: placeLabel(exchangeAsset),
        performedAt,
        auditReady: true,
      });

      showToast('Výměna filtru je zapsaná.', 'success');
      setExchangeAsset(null);
      setSelectedAsset(exchangeAsset);
    } catch (error) {
      console.error('[HVAC] save exchange failed:', error);
      showToast('Výměnu se nepodařilo uložit.', 'error');
    } finally {
      setSavingExchange(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 pb-24 text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-slate-100/95 px-4 py-3">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <button onClick={() => navigate(-1)} className="min-h-12 min-w-12 rounded-xl border border-slate-200 bg-white p-3 text-slate-700">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
            <Wind className="h-7 w-7" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-black text-slate-900">Vzduchotechnika</h1>
            <p className="text-sm font-semibold text-slate-600">Výměny filtrů, sklad a historie VZT</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-4">
        <div className="flex gap-2">
          <button type="button" onClick={() => setView('vzt')} className={`px-4 py-2 rounded-xl text-sm font-bold transition ${view === 'vzt' ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>Filtry / VZT</button>
          <button type="button" onClick={() => setView('klimatizace')} className={`px-4 py-2 rounded-xl text-sm font-bold transition ${view === 'klimatizace' ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>Klimatizace</button>
        </div>
        {view === 'klimatizace' && <KlimatizaceSection />}
        {view === 'vzt' && (<>
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className="card-b p-3">
            <div className="text-xl font-black text-slate-900">{hvacAssets.length}</div>
            <div className="text-sm font-bold text-slate-500">Karty VZT</div>
          </div>
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3">
            <div className="text-xl font-black text-blue-700">{filterItems.length}</div>
            <div className="text-sm font-bold text-blue-700">Filtry sklad</div>
          </div>
          <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3">
            <div className="text-xl font-black text-amber-700">{lowFilterItems.length}</div>
            <div className="text-sm font-bold text-amber-700">Pod limitem</div>
          </div>
        </section>

        <label className="relative block">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Hledat jednotku, filtr, místnost nebo budovu..."
            className="min-h-14 w-full rounded-2xl border-2 border-slate-200 bg-white py-4 pl-12 pr-4 text-base text-slate-900 outline-none focus:border-emerald-600"
          />
        </label>

        <section className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_360px]">
          <div className="space-y-3">
            {extrusionHvacAssets.length > 0 && (
              <section className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-black text-slate-900">VZT extrudovny</h2>
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-bold text-blue-700">{extrusionHvacAssets.length}</span>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {extrusionHvacAssets.map(renderCompactCard)}
                </div>
              </section>
            )}

            {prefilterAssets.length > 0 && (
              <section className="rounded-2xl border border-blue-100 bg-blue-50 p-3">
                <button
                  type="button"
                  onClick={() => setShowPrefilters((value) => !value)}
                  className="flex min-h-12 w-full items-center justify-between gap-3 text-left"
                >
                  <span>
                    <span className="block text-lg font-black text-slate-900">Předfiltry extruderů</span>
                    <span className="block text-sm font-bold text-blue-700">{prefilterAssets.length} karet v jednom bloku</span>
                  </span>
                  {showPrefilters ? <ChevronUp className="h-5 w-5 text-blue-700" /> : <ChevronDown className="h-5 w-5 text-blue-700" />}
                </button>
                {showPrefilters && (
                  <div className="mt-3 space-y-2">
                    {prefilterAssets.map(renderPrefilterRow)}
                  </div>
                )}
              </section>
            )}

            {otherHvacAssets.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-lg font-black text-slate-900">Ostatní VZT</h2>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {otherHvacAssets.map(renderCompactCard)}
                </div>
              </section>
            )}

            {hvacAssets.length === 0 && (
              <div className="card-b p-8 text-center text-slate-600">
                V kartotéce zatím není vzduchotechnika. Přidej kartu s typem Vzduchotechnika, VZT nebo Filtr.
              </div>
            )}
          </div>

          <aside className="space-y-3">
            <div className="card-b p-4">
              <div className="mb-3 flex items-center gap-2">
                <Package className="h-5 w-5 text-amber-700" />
                <h2 className="font-black text-slate-900">Filtry k objednání</h2>
              </div>
              <div className="space-y-2">
                {lowFilterItems.slice(0, 6).map((item) => (
                  <div key={item.id} className="rounded-xl bg-slate-50 p-3 text-sm">
                    <div className="font-black text-slate-900">{item.name}</div>
                    <div className="font-semibold text-slate-600">{item.filterSpec?.dimensions || item.code} | {item.quantity}/{item.minQuantity} {item.unit}</div>
                  </div>
                ))}
                {lowFilterItems.length === 0 && <div className="text-sm font-semibold text-slate-600">Žádný filtr není pod limitem.</div>}
              </div>
              <button type="button" onClick={() => navigate('/inventory?category=filters')} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-3 font-bold text-white">
                <ShoppingCart className="h-4 w-4" /> Otevřít sklad
              </button>
            </div>

            <div className="card-b p-4">
              <div className="mb-3 flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-blue-700" />
                <h2 className="font-black text-slate-900">Poslední výměny</h2>
              </div>
              <div className="space-y-2">
                {recentHvacLogs.map((log) => (
                  <button
                    key={log.id}
                    type="button"
                    onClick={() => {
                      const asset = log.assetId ? hvacAssets.find((item) => item.id === log.assetId) : hvacAssets.find((item) => normalize(item.name) === normalize(log.assetName));
                      if (asset) setSelectedAsset(asset);
                    }}
                    className="min-h-16 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-left text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-semibold text-slate-600">
                        <Filter className="h-4 w-4" />
                        <span>{formatDate(log.performedAt || log.createdAt)}</span>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
                    </div>
                    <div className="mt-1 line-clamp-2 font-black text-slate-900">{log.assetName || log.taskTitle || 'Zápis VZT'}</div>
                    <div className="mt-1 line-clamp-2 font-semibold text-slate-600">{log.content}</div>
                  </button>
                ))}
                {recentHvacLogs.length === 0 && <div className="text-sm font-semibold text-slate-600">Zatím tu není výměna filtru.</div>}
              </div>
            </div>
          </aside>
        </section>
        </>)}
      </main>

      {selectedAsset && (
        <HvacDetailModal
          asset={selectedAsset}
          filters={filtersForAsset(selectedAsset)}
          logs={logsForAsset(selectedAsset)}
          canWriteExchange={canWriteHvacExchange}
          onClose={() => setSelectedAsset(null)}
          onExchange={() => openExchange(selectedAsset)}
          onOpenAssetCard={() => navigate(`/asset/${selectedAsset.id}`, { state: { from: '/hvac', backStack: ['/hvac'] } })}
        />
      )}

      {exchangeAsset && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-slate-200 bg-white p-4 shadow-2xl sm:rounded-3xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-slate-900">Výměna filtru</h2>
                <p className="mt-1 text-sm font-semibold text-slate-600">{exchangeAsset.name} | {placeLabel(exchangeAsset)}</p>
              </div>
              <button type="button" onClick={() => setExchangeAsset(null)} className="min-h-12 min-w-12 rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="text-sm font-bold text-slate-600">Datum a čas výměny</span>
                <input
                  type="datetime-local"
                  value={exchangeDateTime}
                  onChange={(event) => setExchangeDateTime(event.target.value)}
                  className="mt-2 min-h-12 w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-3 text-slate-900 outline-none focus:border-emerald-600"
                />
              </label>

              <label className="block">
                <span className="text-sm font-bold text-slate-600">Pracovník</span>
                <input
                  value={exchangeWorker}
                  onChange={(event) => setExchangeWorker(event.target.value)}
                  list="hvac-workers"
                  placeholder="Kdo výměnu provedl"
                  className="mt-2 min-h-12 w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-3 text-slate-900 outline-none focus:border-emerald-600"
                />
                <datalist id="hvac-workers">
                  {employeeNames.map((name) => <option key={name} value={name} />)}
                </datalist>
              </label>

              <label className="block">
                <span className="text-sm font-bold text-slate-600">Poznámka (nepovinná)</span>
                <textarea
                  value={exchangeNote}
                  onChange={(event) => setExchangeNote(event.target.value)}
                  placeholder="Např. filtr zanesený, objednat další kusy..."
                  className="mt-2 min-h-24 w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-3 text-slate-900 outline-none focus:border-emerald-600"
                />
              </label>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setExchangeAsset(null)} className="min-h-12 rounded-xl border border-slate-200 bg-slate-50 px-4 font-bold text-slate-700">
                Zrušit
              </button>
              <button type="button" onClick={saveExchange} disabled={savingExchange} className="min-h-12 rounded-xl bg-emerald-600 px-4 font-bold text-white disabled:opacity-60">
                {savingExchange ? 'Ukládám...' : 'Potvrdit výměnu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function HvacDetailModal({
  asset,
  filters,
  logs,
  canWriteExchange,
  onClose,
  onExchange,
  onOpenAssetCard,
}: {
  asset: Asset;
  filters: InventoryItem[];
  logs: WorkLog[];
  canWriteExchange: boolean;
  onClose: () => void;
  onExchange: () => void;
  onOpenAssetCard: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl border border-slate-200 bg-white p-4 shadow-2xl sm:rounded-3xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-black uppercase text-blue-700">
              <Wind className="h-4 w-4" /> Detail VZT
            </div>
            <h2 className="truncate text-2xl font-black text-slate-900">{asset.name}</h2>
            <p className="mt-1 text-sm font-semibold text-slate-600">{asset.code || 'Bez kódu'} | {placeLabel(asset)}</p>
          </div>
          <button type="button" onClick={onClose} className="min-h-12 min-w-12 rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onExchange}
            disabled={!canWriteExchange}
            className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 font-black text-white disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
          >
            <CheckCircle2 className="h-5 w-5" /> Potvrdit výměnu
          </button>
          <button type="button" onClick={onOpenAssetCard} className="flex min-h-14 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 font-bold text-slate-700">
            <ExternalLink className="h-5 w-5" /> Karta v kartotéce
          </button>
        </div>

        <section className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="font-black text-slate-900">Filtry / skladová vazba</h3>
          <div className="mt-3 space-y-2">
            {filters.length > 0 ? filters.slice(0, 6).map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                <div className="font-black text-slate-900">{item.name}</div>
                <div className="mt-1 font-semibold text-slate-600">
                  {item.filterSpec?.dimensions || item.code || 'bez rozměru'} | sklad: {item.quantity} {item.unit} | minimum: {item.minQuantity}
                </div>
              </div>
            )) : (
              <div className="text-sm font-semibold text-slate-600">Zatím tu není připojený filtr ze skladu.</div>
            )}
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="font-black text-slate-900">Historie výměn</h3>
          <div className="mt-3 space-y-2">
            {logs.length > 0 ? logs.slice(0, 12).map((log) => (
              <div key={log.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-black text-slate-900">{formatDate(log.performedAt || log.createdAt)}</div>
                  <div className="font-semibold text-slate-600">{log.userName}</div>
                </div>
                <div className="mt-2 whitespace-pre-line font-semibold text-slate-600">{log.content}</div>
              </div>
            )) : (
              <div className="text-sm font-semibold text-slate-600">Zatím tu není zapsaná výměna filtru.</div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}



