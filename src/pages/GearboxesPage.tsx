import { useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Cog,
  ExternalLink,
  FileText,
  Loader2,
  MapPin,
  Package,
  Search,
  Thermometer,
  Wrench,
} from 'lucide-react';
import { useAuthContext } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { assetService } from '../services/assetService';
import { getGearboxStatus, getGearboxStatusLabel, isGearboxAsset, setGearboxStockStatus } from '../services/gearboxService';
import { subscribeToRecentWorkLogs } from '../services/workLogService';
import type { Asset } from '../types/asset';
import type { GearboxStatus, GearboxTemperatureLog } from '../types/gearbox';
import type { WorkLog } from '../types/workLog';
import { showToast } from '../components/ui/Toast';
import GearboxRepairModal from '../components/gearbox/GearboxRepairModal';
import GearboxProblemModal from '../components/gearbox/GearboxProblemModal';

type GearboxFilter = 'all' | GearboxStatus | 'alerts';
type TemperatureLevel = 'ok' | 'warning' | 'critical' | 'missing' | 'stale';

const PANEL = 'rounded-2xl border border-slate-200 bg-white shadow-sm';
const BUTTON = 'min-h-12 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition active:scale-[0.98] hover:bg-slate-50';

// Akcenty pro trendové grafy
const TEMP_ACCENT: TrendAccent = { hex: '#0891b2', box: 'border-cyan-200 bg-cyan-50', text: 'text-cyan-700', icon: 'text-cyan-600' };
const LOAD_ACCENT: TrendAccent = { hex: '#d97706', box: 'border-amber-200 bg-amber-50', text: 'text-amber-700', icon: 'text-amber-600' };

interface TrendAccent {
  hex: string;
  box: string;
  text: string;
  icon: string;
}

interface TrendPoint {
  value: number;
  date: Date | null;
  id: string;
}

function asDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'object' && value && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate();
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value: unknown): string {
  const date = asDate(value);
  if (!date) return 'bez data';
  return date.toLocaleString('cs-CZ', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function daysSince(value: unknown): number | null {
  const date = asDate(value);
  if (!date) return null;
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

function motorLoadAmps(log: GearboxTemperatureLog): number | null {
  if (typeof log.motorLoadAmps === 'number') return log.motorLoadAmps;
  const legacy = (log as { motorLoadPercent?: unknown }).motorLoadPercent;
  return typeof legacy === 'number' ? legacy : null;
}

function temperatureInfo(asset: Asset): {
  level: TemperatureLevel;
  label: string;
  value: string;
  tone: string;
} {
  const value = typeof asset.lastTemperatureC === 'number' ? asset.lastTemperatureC : null;
  const age = daysSince(asset.lastTemperatureAt);
  const warning = asset.gearboxWarningTemperatureC ?? 70;
  const critical = asset.gearboxCriticalTemperatureC ?? 85;

  if (value === null) {
    return {
      level: 'missing',
      label: 'Chybí měření',
      value: 'bez teploty',
      tone: 'border-red-200 bg-red-50 text-red-700',
    };
  }

  if (value >= critical) {
    return {
      level: 'critical',
      label: 'Kritická teplota',
      value: `${value} °C`,
      tone: 'border-red-200 bg-red-50 text-red-700',
    };
  }

  if (value >= warning) {
    return {
      level: 'warning',
      label: 'Varování',
      value: `${value} °C`,
      tone: 'border-amber-200 bg-amber-50 text-amber-700',
    };
  }

  if (age !== null && age >= 7) {
    return {
      level: 'stale',
      label: 'Staré měření',
      value: `${value} °C`,
      tone: 'border-amber-200 bg-amber-50 text-amber-700',
    };
  }

  return {
    level: 'ok',
    label: age !== null && age >= 5 ? 'Brzy zapsat' : 'Aktuální',
    value: `${value} °C`,
    tone: age !== null && age >= 5
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : 'border-emerald-200 bg-emerald-50 text-emerald-700',
  };
}

function gearboxLocation(asset: Asset): string {
  if (asset.currentExtruderName) return asset.currentExtruderName;
  if (getGearboxStatus(asset) === 'service') return 'Servis';
  return asset.location || 'Sklad ND';
}

function normalize(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function relatedLogsForGearbox(asset: Asset, logs: WorkLog[]) {
  const assetName = normalize(asset.name);
  return logs
    .filter((log) => {
      if (log.assetId === asset.id || log.relatedAssetId === asset.id) return true;
      const logAssetName = normalize(log.assetName);
      return assetName.length > 3 && logAssetName.includes(assetName);
    })
    .slice(0, 4);
}

function isFaultLikeLog(log: WorkLog): boolean {
  const text = normalize([log.type, log.workType, log.content].join(' '));
  return log.type === 'repair'
    || text.includes('porucha')
    || text.includes('zavada')
    || text.includes('oprava')
    || text.includes('tesneni')
    || text.includes('lozisko');
}

function statusClass(status: GearboxStatus) {
  if (status === 'installed') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'service') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-sky-200 bg-sky-50 text-sky-700';
}

function statusHint(asset: Asset): string {
  const status = getGearboxStatus(asset);
  if (status === 'installed') return `V provozu na ${asset.currentExtruderName || 'extruderu'}`;
  if (status === 'service') return 'Náhradní kus není připravený, je v opravě';
  return 'Náhradní kus ve skladu, připravený podle posledního stavu';
}

export default function GearboxesPage() {
  const navigate = useNavigate();
  const { user, hasPermission } = useAuthContext();
  const canLogRepair = hasPermission('asset.update');
  const canReportProblem = hasPermission('wo.create');
  const tenantId = user?.tenantId || 'main_firm';
  const [assets, setAssets] = useState<Asset[]>([]);
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [temperatureLogs, setTemperatureLogs] = useState<GearboxTemperatureLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<GearboxFilter>('all');
  const [savingStatusId, setSavingStatusId] = useState('');
  const [repairAsset, setRepairAsset] = useState<Asset | null>(null);
  const [problemAsset, setProblemAsset] = useState<Asset | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    assetService.getAll(tenantId)
      .then((items) => {
        if (alive) setAssets(items);
      })
      .catch((error) => console.error('[GearboxesPage] assets error:', error))
      .finally(() => {
        if (alive) setLoading(false);
      });

    const unsub = subscribeToRecentWorkLogs(setLogs, 500);
    return () => {
      alive = false;
      unsub();
    };
  }, [tenantId]);

  useEffect(() => {
    const temperatureQuery = query(
      collection(db, 'gearbox_temperature_logs'),
      orderBy('measuredAt', 'desc'),
      limit(300)
    );
    return onSnapshot(
      temperatureQuery,
      (snapshot) => {
        setTemperatureLogs(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as GearboxTemperatureLog)));
      },
      (error) => {
        console.error('[GearboxesPage] temperature logs error:', error);
        setTemperatureLogs([]);
      }
    );
  }, []);

  const gearboxes = useMemo(
    () => assets.filter((asset) => isGearboxAsset(asset)),
    [assets]
  );

  const stats = useMemo(() => {
    const installed = gearboxes.filter((asset) => getGearboxStatus(asset) === 'installed').length;
    const inStock = gearboxes.filter((asset) => getGearboxStatus(asset) === 'in_stock').length;
    const service = gearboxes.filter((asset) => getGearboxStatus(asset) === 'service').length;
    const alerts = gearboxes.filter((asset) => {
      const temp = temperatureInfo(asset);
      return ['warning', 'critical', 'missing', 'stale'].includes(temp.level);
    }).length;
    return { total: gearboxes.length, installed, inStock, service, alerts };
  }, [gearboxes]);

  const filteredGearboxes = useMemo(() => {
    const needle = normalize(search);
    return gearboxes
      .filter((asset) => {
        if (filter === 'alerts') {
          const level = temperatureInfo(asset).level;
          if (!['warning', 'critical', 'missing', 'stale'].includes(level)) return false;
        } else if (filter !== 'all' && getGearboxStatus(asset) !== filter) {
          return false;
        }
        if (!needle) return true;
        return normalize([
          asset.name,
          asset.code,
          asset.location,
          asset.currentExtruderName,
          asset.notes,
        ].join(' ')).includes(needle);
      })
      .sort((a, b) => {
        const order: Record<GearboxStatus, number> = { installed: 0, in_stock: 1, service: 2 };
        return order[getGearboxStatus(a)] - order[getGearboxStatus(b)]
          || a.name.localeCompare(b.name, 'cs');
      });
  }, [filter, gearboxes, search]);

  const temperatureLogsByGearbox = useMemo(() => {
    const grouped = new Map<string, GearboxTemperatureLog[]>();
    temperatureLogs.forEach((log) => {
      if (log.tenantId && tenantId && log.tenantId !== tenantId) return;
      const items = grouped.get(log.gearboxId) || [];
      items.push(log);
      grouped.set(log.gearboxId, items);
    });
    return grouped;
  }, [temperatureLogs, tenantId]);

  const filters: Array<{ id: GearboxFilter; label: string; count: number }> = [
    { id: 'all', label: 'Vše', count: stats.total },
    { id: 'installed', label: 'Namontované', count: stats.installed },
    { id: 'in_stock', label: 'Sklad', count: stats.inStock },
    { id: 'service', label: 'Servis', count: stats.service },
    { id: 'alerts', label: 'Upozornění', count: stats.alerts },
  ];

  const handleStockStatusChange = async (asset: Asset, status: Extract<GearboxStatus, 'in_stock' | 'service'>) => {
    if (savingStatusId) return;
    setSavingStatusId(asset.id);
    try {
      await setGearboxStockStatus({ tenantId, gearbox: asset, status, user });
      setAssets((current) => current.map((item) => (
        item.id === asset.id
          ? {
              ...item,
              gearboxStatus: status,
              currentExtruderId: null,
              currentExtruderName: null,
              location: status === 'service' ? 'Servis' : 'Sklad ND',
              updatedAt: new Date().toISOString(),
            }
          : item
      )));
      showToast(status === 'service' ? 'Převodovka označena jako v opravě' : 'Převodovka označena jako připravená ve skladu', 'success');
    } catch (error) {
      console.error('[GearboxesPage] status change failed:', error);
      showToast('Stav převodovky se nepodařilo uložit', 'error');
    } finally {
      setSavingStatusId('');
    }
  };

  return (
    <div className="vik-page min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-5 pb-24">
        <header className="mb-5 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
              aria-label="Zpět"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <div className="text-xs font-bold uppercase tracking-widest text-violet-600">Modul údržby</div>
              <h1 className="truncate text-2xl font-black text-slate-900">Převodovky</h1>
              <p className="mt-1 text-sm text-slate-500">
                Kde jsou namontované, poslední teploty, poruchy a stav náhradních kusů.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/kartoteka')}
            className={`${BUTTON} hidden sm:inline-flex items-center gap-2`}
          >
            <Cog className="h-4 w-4 text-violet-600" />
            Kartotéka
          </button>
        </header>

        <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard label="Celkem" value={stats.total} icon={Cog} tone="text-violet-600" />
          <StatCard label="V provozu" value={stats.installed} icon={CheckCircle2} tone="text-emerald-600" />
          <StatCard label="Ve skladu" value={stats.inStock} icon={Package} tone="text-sky-600" />
          <StatCard label="V servisu" value={stats.service} icon={Wrench} tone="text-amber-600" />
          <StatCard label="Upozornění" value={stats.alerts} icon={AlertTriangle} tone="text-red-600" />
        </section>

        <section className={`${PANEL} mb-4 p-3`}>
          <div className="mb-3 flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 bg-[#fbf9f4] px-3">
            <Search className="h-5 w-5 shrink-0 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Hledat převodovku, extruder, kód..."
              className="h-12 w-full bg-transparent text-base font-semibold text-slate-900 outline-none placeholder:text-slate-400"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {filters.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={`min-h-12 shrink-0 rounded-xl border px-4 text-sm font-bold transition ${
                  filter === item.id
                    ? 'border-violet-300 bg-violet-50 text-violet-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {item.label} <span className="opacity-60">({item.count})</span>
              </button>
            ))}
          </div>
        </section>

        {loading && (
          <div className="flex items-center gap-2 text-sm font-bold text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Načítám převodovky...
          </div>
        )}

        {!loading && filteredGearboxes.length === 0 && (
          <div className={`${PANEL} p-6 text-center`}>
            <Cog className="mx-auto h-9 w-9 text-slate-400" />
            <h2 className="mt-3 text-lg font-black text-slate-900">Nic nenalezeno</h2>
            <p className="mt-1 text-sm text-slate-500">
              Zkontroluj filtr nebo vytvoř převodovku v kartotéce.
            </p>
          </div>
        )}

        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {filteredGearboxes.map((asset) => (
            <GearboxCard
              key={asset.id}
              asset={asset}
              logs={relatedLogsForGearbox(asset, logs)}
              temperatureLogs={temperatureLogsByGearbox.get(asset.id) || []}
              onOpen={() => navigate(`/asset/${asset.id}`, { state: { from: '/gearboxes' } })}
              onWorkLog={() => navigate('/work-diary?new=1')}
              canRepair={canLogRepair}
              onRepair={() => setRepairAsset(asset)}
              canReport={canReportProblem}
              onReport={() => setProblemAsset(asset)}
              savingStatus={savingStatusId === asset.id}
              onSetStockStatus={(status) => handleStockStatusChange(asset, status)}
            />
          ))}
        </div>
      </div>

      {repairAsset && (
        <GearboxRepairModal
          asset={repairAsset}
          user={user}
          onClose={() => setRepairAsset(null)}
          onSaved={() => setRepairAsset(null)}
        />
      )}

      {problemAsset && (
        <GearboxProblemModal
          asset={problemAsset}
          user={user}
          onClose={() => setProblemAsset(null)}
          onSaved={() => setProblemAsset(null)}
        />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof Cog;
  tone: string;
}) {
  return (
    <div className={`${PANEL} p-4`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
          <Icon className={`h-5 w-5 ${tone}`} />
        </div>
        <div className={`text-2xl font-black ${tone}`}>{value}</div>
      </div>
      <div className="mt-3 text-sm font-bold text-slate-600">{label}</div>
    </div>
  );
}

function GearboxCard({
  asset,
  logs,
  temperatureLogs,
  onOpen,
  onWorkLog,
  canRepair,
  onRepair,
  canReport,
  onReport,
  savingStatus,
  onSetStockStatus,
}: {
  asset: Asset;
  logs: WorkLog[];
  temperatureLogs: GearboxTemperatureLog[];
  onOpen: () => void;
  onWorkLog: () => void;
  canRepair: boolean;
  onRepair: () => void;
  canReport: boolean;
  onReport: () => void;
  savingStatus: boolean;
  onSetStockStatus: (status: Extract<GearboxStatus, 'in_stock' | 'service'>) => void;
}) {
  const status = getGearboxStatus(asset);
  const temp = temperatureInfo(asset);
  const faultCount = logs.filter(isFaultLikeLog).length + (asset.repairLog?.length || 0);
  const canSetStockStatus = true;
  const [open, setOpen] = useState(false);

  return (
    <article className={`${PANEL} overflow-hidden`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-violet-200 bg-violet-50">
            <Cog className="h-6 w-6 text-violet-600" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="min-w-0 truncate text-lg font-black text-slate-900">{asset.name}</h2>
              <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${statusClass(status)}`}>
                {getGearboxStatusLabel(asset)}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-4 w-4 text-slate-400" />
                {gearboxLocation(asset)}
              </span>
              <span className="font-mono text-slate-500">{asset.code || 'bez kódu'}</span>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <InfoBlock
            icon={Thermometer}
            label={temp.label}
            value={temp.value}
            tone={temp.tone}
            detail={asset.lastTemperatureAt ? `Naposledy ${formatDateTime(asset.lastTemperatureAt)}` : 'Zatím bez zápisu'}
          />
          <InfoBlock
            icon={Activity}
            label="Historie poruch"
            value={`${faultCount}`}
            tone={faultCount > 0 ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}
            detail={faultCount > 0 ? 'záznamy k prověření' : 'bez poruch v přehledu'}
          />
          <InfoBlock
            icon={status === 'installed' ? CheckCircle2 : status === 'service' ? Wrench : Package}
            label="Stav"
            value={status === 'installed' ? 'V provozu' : status === 'service' ? 'Oprava' : 'Náhradní'}
            tone={statusClass(status)}
            detail={statusHint(asset)}
          />
        </div>

        <MiniSparkline logs={temperatureLogs} accentHex={TEMP_ACCENT.hex} />

        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={onOpen} className={`${BUTTON} flex-1 min-w-[120px] inline-flex items-center justify-center gap-2`}>
            <ExternalLink className="h-4 w-4 text-violet-600" />
            Karta
          </button>
          <button type="button" onClick={onWorkLog} className={`${BUTTON} flex-1 min-w-[120px] inline-flex items-center justify-center gap-2`}>
            <FileText className="h-4 w-4 text-emerald-600" />
            Zapsat
          </button>
          {canReport && (
            <button type="button" onClick={onReport} className={`${BUTTON} flex-1 min-w-[120px] inline-flex items-center justify-center gap-2`}>
              <AlertTriangle className="h-4 w-4 text-red-600" />
              Nahlásit
            </button>
          )}
          {canRepair && (
            <button type="button" onClick={onRepair} className={`${BUTTON} flex-1 min-w-[120px] inline-flex items-center justify-center gap-2`}>
              <Wrench className="h-4 w-4 text-amber-600" />
              Oprava
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 py-2 text-xs font-bold text-slate-600 transition hover:bg-stone-100"
        >
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {open ? 'Skrýt detail' : 'Detail — grafy, stav, zápisy'}
        </button>

        {open && (
          <div>
            <TemperatureTrend logs={temperatureLogs} asset={asset} />
            <MotorLoadTrend logs={temperatureLogs} />

        {canSetStockStatus && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-black text-slate-900">Aktuální stav převodovky</div>
              <div className={`rounded-full border px-2.5 py-1 text-xs font-black ${statusClass(status)}`}>
                {status === 'service'
                  ? 'Je v servisu'
                  : status === 'in_stock'
                    ? 'Je ve skladu'
                    : 'Namontovaná'}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                disabled={savingStatus || status === 'in_stock'}
                onClick={() => onSetStockStatus('in_stock')}
                aria-pressed={status === 'in_stock'}
                className={`min-h-12 rounded-xl border px-3 text-sm font-black transition active:scale-[0.98] ${
                  status === 'in_stock'
                    ? 'border-emerald-300 bg-emerald-100 text-emerald-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                } ${savingStatus && status !== 'in_stock' ? 'opacity-60' : ''}`}
              >
                {savingStatus && status !== 'in_stock' ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : null}
                {status === 'in_stock' ? 'Ve skladu' : 'Přesunout do skladu'}
              </button>
              <button
                type="button"
                disabled={savingStatus || status === 'service'}
                onClick={() => onSetStockStatus('service')}
                aria-pressed={status === 'service'}
                className={`min-h-12 rounded-xl border px-3 text-sm font-black transition active:scale-[0.98] ${
                  status === 'service'
                    ? 'border-amber-300 bg-amber-100 text-amber-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                } ${savingStatus && status !== 'service' ? 'opacity-60' : ''}`}
              >
                {savingStatus && status !== 'service' ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : null}
                {status === 'service' ? 'V servisu' : 'Dát do servisu'}
              </button>
            </div>
          </div>
        )}

        {logs.length > 0 && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-black text-slate-900">
              <Clock className="h-4 w-4 text-slate-400" />
              Poslední zápisy
            </div>
            <div className="space-y-2">
              {logs.slice(0, 3).map((log) => (
                <div key={log.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-sm font-bold text-slate-900">
                      {log.assetName || asset.name}
                    </div>
                    <div className="shrink-0 text-xs font-semibold text-slate-500">
                      {formatDateTime(log.performedAt || log.createdAt)}
                    </div>
                  </div>
                  <div className="mt-1 line-clamp-2 text-sm text-slate-600">
                    {log.content || log.workType || 'Zápis bez popisu'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
          </div>
        )}
      </div>
    </article>
  );
}

function MiniSparkline({ logs, accentHex }: { logs: GearboxTemperatureLog[]; accentHex: string }) {
  const vals = logs
    .filter((log) => typeof log.temperatureC === 'number')
    .slice(0, 14)
    .reverse()
    .map((log) => log.temperatureC as number);
  if (vals.length < 2) return null;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const spread = Math.max(1, max - min);
  const pts = vals.map((v, i) => `${((i / (vals.length - 1)) * 100).toFixed(1)},${(22 - ((v - min) / spread) * 18).toFixed(1)}`).join(' ');
  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="mt-3 h-8 w-full">
      <polyline points={pts} fill="none" stroke={accentHex} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function TemperatureTrend({ logs, asset }: { logs: GearboxTemperatureLog[]; asset: Asset }) {
  const points: TrendPoint[] = logs
    .filter((log) => typeof log.temperatureC === 'number' && asDate(log.measuredAt))
    .slice(0, 12)
    .reverse()
    .map((log) => ({ value: log.temperatureC as number, date: asDate(log.measuredAt), id: log.id || `${log.gearboxId}-${String(log.measuredAt)}` }));

  return (
    <TrendChart
      title="Trend teplot"
      icon={Thermometer}
      unit="°C"
      accent={TEMP_ACCENT}
      points={points}
      warn={asset.gearboxWarningTemperatureC ?? 70}
      crit={asset.gearboxCriticalTemperatureC ?? 85}
      emptyText="Trend bude vidět po dalším zápisu."
    />
  );
}

function MotorLoadTrend({ logs }: { logs: GearboxTemperatureLog[] }) {
  const points: TrendPoint[] = logs
    .filter((log) => motorLoadAmps(log) !== null && asDate(log.measuredAt))
    .slice(0, 12)
    .reverse()
    .map((log) => ({ value: motorLoadAmps(log) as number, date: asDate(log.measuredAt), id: log.id || `${log.gearboxId}-load-${String(log.measuredAt)}` }));

  if (points.length === 0) return null;

  return (
    <div className="mt-3">
      <TrendChart
        title="Trend zátěže motoru"
        icon={Activity}
        unit="A"
        accent={LOAD_ACCENT}
        points={points}
        emptyText="Trend bude vidět po dalším zápisu se zátěží."
      />
    </div>
  );
}

function TrendChart({
  title,
  icon: Icon,
  unit,
  accent,
  points,
  emptyText,
  warn,
  crit,
}: {
  title: string;
  icon: typeof Thermometer;
  unit: string;
  accent: TrendAccent;
  points: TrendPoint[];
  emptyText: string;
  warn?: number;
  crit?: number;
}) {
  const gradientId = useMemo(() => `trend-grad-${Math.random().toString(36).slice(2, 9)}`, []);

  if (points.length < 2) {
    return (
      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-2 text-sm font-black text-slate-900">
          <Icon className={`h-4 w-4 ${accent.icon}`} />
          {title}
        </div>
        <div className="mt-2 text-sm font-semibold text-slate-500">{emptyText}</div>
      </div>
    );
  }

  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  // doména zahrne i prahy, aby čáry výstrahy/kritická byly v grafu vidět
  const domLo = Math.min(min, ...(typeof warn === 'number' ? [warn] : []));
  const domHi = Math.max(max, ...(typeof crit === 'number' ? [crit] : []), ...(typeof warn === 'number' ? [warn] : []));
  const pad = Math.max(1, (domHi - domLo) * 0.12);
  const lo = domLo - pad;
  const hi = domHi + pad;
  const spread = Math.max(1, hi - lo);
  const yOf = (v: number) => 46 - ((v - lo) / spread) * 36;

  const coords = points.map((point, index) => {
    const x = points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
    return { x, y: yOf(point.value) };
  });

  const polyline = coords.map((c) => `${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(' ');
  const areaPath = `M ${coords[0].x.toFixed(2)},52 L ${coords.map((c) => `${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(' L ')} L ${coords[coords.length - 1].x.toFixed(2)},52 Z`;

  const latest = points[points.length - 1];
  const first = points[0];
  const lastCoord = coords[coords.length - 1];

  return (
    <div className={`mt-4 rounded-xl border ${accent.box} p-3`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-black text-slate-900">
          <Icon className={`h-4 w-4 ${accent.icon}`} />
          {title}
        </div>
        <div className="text-xs font-bold text-slate-500">
          min {min} · max {max} {unit}
          {typeof warn === 'number' && typeof crit === 'number' && (
            <span className="ml-1 text-slate-400">· limit {warn}/{crit}</span>
          )}
        </div>
      </div>

      <svg viewBox="0 0 100 56" preserveAspectRatio="none" className="h-36 w-full overflow-visible sm:h-44">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent.hex} stopOpacity="0.28" />
            <stop offset="100%" stopColor={accent.hex} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[10, 28, 46].map((y) => (
          <line key={y} x1="0" y1={y} x2="100" y2={y} className="stroke-slate-200" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}
        {typeof crit === 'number' && (
          <line x1="0" y1={yOf(crit)} x2="100" y2={yOf(crit)} stroke="#dc2626" strokeWidth="1" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
        )}
        {typeof warn === 'number' && (
          <line x1="0" y1={yOf(warn)} x2="100" y2={yOf(warn)} stroke="#e0982a" strokeWidth="1" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
        )}
        <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
        <polyline
          points={polyline}
          fill="none"
          stroke={accent.hex}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* zvýraznění posledního zápisu */}
        <line
          x1={lastCoord.x.toFixed(2)}
          y1="52"
          x2={lastCoord.x.toFixed(2)}
          y2={lastCoord.y.toFixed(2)}
          stroke={accent.hex}
          strokeWidth="1.5"
          strokeDasharray="3 3"
          strokeOpacity="0.6"
          vectorEffect="non-scaling-stroke"
        />
        <circle cx={lastCoord.x.toFixed(2)} cy={lastCoord.y.toFixed(2)} r="3.6" fill="#ffffff" stroke={accent.hex} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      </svg>

      <div className="mt-1 flex justify-between text-xs font-semibold text-slate-400">
        <span>{formatDateTime(first.date)}</span>
        <span>{formatDateTime(latest.date)}</span>
      </div>

      {/* Poslední zápis – výrazně */}
      <div className={`mt-2 flex items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2 ${accent.box}`}>
        <div>
          <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">Poslední zápis</div>
          <div className="text-sm font-semibold text-slate-600">{formatDateTime(latest.date)}</div>
        </div>
        <div className={`text-2xl font-black ${accent.text}`}>
          {latest.value} {unit}
        </div>
      </div>
    </div>
  );
}

function InfoBlock({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: typeof Thermometer;
  label: string;
  value: string;
  detail: string;
  tone: string;
}) {
  return (
    <div className={`rounded-xl border p-3 ${tone}`}>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4" />
        <div className="text-xs font-black uppercase tracking-wide">{label}</div>
      </div>
      <div className="mt-2 text-lg font-black">{value}</div>
      <div className="mt-1 text-sm font-semibold">{detail}</div>
    </div>
  );
}
