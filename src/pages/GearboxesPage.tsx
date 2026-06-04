import { useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
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

const PANEL = 'rounded-2xl border border-white/10 bg-white/[0.04] shadow-sm shadow-black/20';
const BUTTON = 'min-h-12 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-bold text-white transition active:scale-[0.98] hover:bg-white/[0.1]';

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
      tone: 'border-red-400/30 bg-red-500/20 text-red-200',
    };
  }

  if (value >= critical) {
    return {
      level: 'critical',
      label: 'Kritická teplota',
      value: `${value} °C`,
      tone: 'border-red-400/35 bg-red-500/20 text-red-200',
    };
  }

  if (value >= warning) {
    return {
      level: 'warning',
      label: 'Varování',
      value: `${value} °C`,
      tone: 'border-amber-400/35 bg-amber-500/20 text-amber-200',
    };
  }

  if (age !== null && age >= 7) {
    return {
      level: 'stale',
      label: 'Staré měření',
      value: `${value} °C`,
      tone: 'border-amber-400/35 bg-amber-500/20 text-amber-200',
    };
  }

  return {
    level: 'ok',
    label: age !== null && age >= 5 ? 'Brzy zapsat' : 'Aktuální',
    value: `${value} °C`,
    tone: age !== null && age >= 5
      ? 'border-amber-400/35 bg-amber-500/20 text-amber-200'
      : 'border-emerald-400/30 bg-emerald-500/20 text-emerald-200',
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
    .replace(/[\u0300-\u036f]/g, '');
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
  if (status === 'installed') return 'border-emerald-400/30 bg-emerald-500/20 text-emerald-200';
  if (status === 'service') return 'border-amber-400/35 bg-amber-500/20 text-amber-200';
  return 'border-sky-400/30 bg-sky-500/20 text-sky-200';
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
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-6xl px-4 py-5 pb-24">
        <header className="mb-5 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-slate-200 transition hover:bg-white/[0.1]"
              aria-label="Zpět"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <div className="text-xs font-bold uppercase tracking-widest text-violet-300">Modul údržby</div>
              <h1 className="truncate text-2xl font-black">Převodovky</h1>
              <p className="mt-1 text-sm text-slate-300">
                Kde jsou namontované, poslední teploty, poruchy a stav náhradních kusů.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/kartoteka')}
            className={`${BUTTON} hidden sm:inline-flex items-center gap-2`}
          >
            <Cog className="h-4 w-4 text-violet-300" />
            Kartotéka
          </button>
        </header>

        <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard label="Celkem" value={stats.total} icon={Cog} tone="text-violet-300" />
          <StatCard label="V provozu" value={stats.installed} icon={CheckCircle2} tone="text-emerald-300" />
          <StatCard label="Ve skladu" value={stats.inStock} icon={Package} tone="text-sky-300" />
          <StatCard label="V servisu" value={stats.service} icon={Wrench} tone="text-amber-300" />
          <StatCard label="Upozornění" value={stats.alerts} icon={AlertTriangle} tone="text-red-300" />
        </section>

        <section className={`${PANEL} mb-4 p-3`}>
          <div className="mb-3 flex min-h-12 items-center gap-3 rounded-xl border border-white/10 bg-slate-950/60 px-3">
            <Search className="h-5 w-5 shrink-0 text-slate-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Hledat převodovku, extruder, kód..."
              className="h-12 w-full bg-transparent text-base font-semibold text-white outline-none placeholder:text-slate-500"
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
                    ? 'border-violet-400/60 bg-violet-500/20 text-white'
                    : 'border-white/10 bg-white/[0.04] text-slate-300'
                }`}
              >
                {item.label} <span className="text-slate-300">({item.count})</span>
              </button>
            ))}
          </div>
        </section>

        {loading && (
          <div className="flex items-center gap-2 text-sm font-bold text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Načítám převodovky...
          </div>
        )}

        {!loading && filteredGearboxes.length === 0 && (
          <div className={`${PANEL} p-6 text-center`}>
            <Cog className="mx-auto h-9 w-9 text-slate-500" />
            <h2 className="mt-3 text-lg font-black">Nic nenalezeno</h2>
            <p className="mt-1 text-sm text-slate-400">
              Zkontroluj filtr nebo vytvoř převodovku v kartotéce.
            </p>
          </div>
        )}

        <div className="grid gap-3 lg:grid-cols-2">
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
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-slate-900">
          <Icon className={`h-5 w-5 ${tone}`} />
        </div>
        <div className={`text-2xl font-black ${tone}`}>{value}</div>
      </div>
      <div className="mt-3 text-sm font-bold text-slate-200">{label}</div>
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

  return (
    <article className={`${PANEL} overflow-hidden`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-violet-400/35 bg-violet-500/20">
            <Cog className="h-6 w-6 text-violet-200" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="min-w-0 truncate text-lg font-black text-white">{asset.name}</h2>
              <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${statusClass(status)}`}>
                {getGearboxStatusLabel(asset)}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-300">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-4 w-4 text-slate-500" />
                {gearboxLocation(asset)}
              </span>
              <span className="font-mono text-slate-300">{asset.code || 'bez kódu'}</span>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <InfoBlock
            icon={Thermometer}
            label={temp.label}
            value={temp.value}
            tone={temp.tone}
            detail={asset.lastTemperatureAt ? `Naposledy ${formatDateTime(asset.lastTemperatureAt)}` : 'Zatim bez zapisu'}
          />
          <InfoBlock
            icon={Activity}
            label="Historie poruch"
            value={`${faultCount}`}
            tone={faultCount > 0 ? 'border-amber-400/30 bg-amber-500/20 text-amber-200' : 'border-emerald-400/30 bg-emerald-500/20 text-emerald-200'}
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

        <TemperatureTrend logs={temperatureLogs} />
        <MotorLoadTrend logs={temperatureLogs} />

        {canSetStockStatus && (
          <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/45 p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-black text-white">Aktuální stav převodovky</div>
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
                    ? 'border-emerald-300/60 bg-emerald-500/25 text-emerald-50'
                    : 'border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]'
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
                    ? 'border-amber-300/60 bg-amber-500/25 text-amber-50'
                    : 'border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]'
                } ${savingStatus && status !== 'service' ? 'opacity-60' : ''}`}
              >
                {savingStatus && status !== 'service' ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : null}
                {status === 'service' ? 'V servisu' : 'Dát do servisu'}
              </button>
            </div>
          </div>
        )}

        {logs.length > 0 && (
          <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/45 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-black text-white">
              <Clock className="h-4 w-4 text-slate-400" />
              Poslední zápisy
            </div>
            <div className="space-y-2">
              {logs.slice(0, 3).map((log) => (
                <div key={log.id} className="rounded-lg bg-white/[0.04] px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-sm font-bold text-white">
                      {log.assetName || asset.name}
                    </div>
                    <div className="shrink-0 text-xs font-semibold text-slate-300">
                      {formatDateTime(log.performedAt || log.createdAt)}
                    </div>
                  </div>
                  <div className="mt-1 line-clamp-2 text-sm text-slate-300">
                    {log.content || log.workType || 'Zápis bez popisu'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={onOpen} className={`${BUTTON} inline-flex items-center justify-center gap-2`}>
            <ExternalLink className="h-4 w-4 text-violet-300" />
            Karta
          </button>
          <button type="button" onClick={onWorkLog} className={`${BUTTON} inline-flex items-center justify-center gap-2`}>
            <FileText className="h-4 w-4 text-emerald-300" />
            Zapsat práci
          </button>
        </div>

        {canReport && (
          <button
            type="button"
            onClick={onReport}
            className={`${BUTTON} mt-2 inline-flex w-full items-center justify-center gap-2`}
          >
            <AlertTriangle className="h-4 w-4 text-red-300" />
            Nahlásit problém
          </button>
        )}

        {canRepair && (
          <button
            type="button"
            onClick={onRepair}
            className={`${BUTTON} mt-2 inline-flex w-full items-center justify-center gap-2`}
          >
            <Wrench className="h-4 w-4 text-amber-300" />
            Oprava / úprava
          </button>
        )}
      </div>
    </article>
  );
}

function TemperatureTrend({ logs }: { logs: GearboxTemperatureLog[] }) {
  const points = logs
    .filter((log) => typeof log.temperatureC === 'number' && asDate(log.measuredAt))
    .slice(0, 12)
    .reverse();

  if (points.length < 2) {
    return (
      <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/45 p-3">
        <div className="flex items-center gap-2 text-sm font-black text-white">
          <Thermometer className="h-4 w-4 text-cyan-300" />
          Trend teplot
        </div>
        <div className="mt-2 text-sm font-semibold text-slate-400">Trend bude videt po dalsim zapisu.</div>
      </div>
    );
  }

  const values = points.map((log) => log.temperatureC);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(1, max - min);
  const polyline = points.map((log, index) => {
    const x = points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
    const y = 46 - ((log.temperatureC - min) / spread) * 36;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
  const latest = points[points.length - 1];
  const first = points[0];

  return (
    <div className="mt-4 rounded-xl border border-cyan-400/20 bg-slate-950/45 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-black text-white">
          <Thermometer className="h-4 w-4 text-cyan-300" />
          Trend teplot
        </div>
        <div className="text-xs font-bold text-slate-300">
          {first.temperatureC} °C {'->'} {latest.temperatureC} °C
        </div>
      </div>
      <svg viewBox="0 0 100 52" preserveAspectRatio="none" className="h-16 w-full overflow-visible">
        <line x1="0" y1="46" x2="100" y2="46" className="stroke-slate-700" strokeWidth="1" />
        <line x1="0" y1="10" x2="100" y2="10" className="stroke-slate-800" strokeWidth="1" />
        <polyline points={polyline} fill="none" className="stroke-cyan-300" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((log, index) => {
          const x = points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
          const y = 46 - ((log.temperatureC - min) / spread) * 36;
          return <circle key={`${log.id}-${index}`} cx={x} cy={y} r="2.2" className="fill-cyan-200" />;
        })}
      </svg>
      <div className="mt-1 flex justify-between text-xs font-semibold text-slate-400">
        <span>{formatDateTime(first.measuredAt)}</span>
        <span>{formatDateTime(latest.measuredAt)}</span>
      </div>
    </div>
  );
}

function MotorLoadTrend({ logs }: { logs: GearboxTemperatureLog[] }) {
  const points = logs
    .filter((log) => typeof log.motorLoadPercent === 'number' && asDate(log.measuredAt))
    .slice(0, 12)
    .reverse();

  if (points.length === 0) return null;

  if (points.length < 2) {
    return (
      <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/45 p-3">
        <div className="flex items-center gap-2 text-sm font-black text-white">
          <Activity className="h-4 w-4 text-amber-300" />
          Trend zátěže motoru
        </div>
        <div className="mt-2 text-sm font-semibold text-slate-400">Trend bude vidět po dalším zápisu se zátěží.</div>
      </div>
    );
  }

  const values = points.map((log) => log.motorLoadPercent ?? 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(1, max - min);
  const polyline = points.map((log, index) => {
    const x = points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
    const y = 46 - (((log.motorLoadPercent ?? 0) - min) / spread) * 36;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
  const latest = points[points.length - 1];
  const first = points[0];

  return (
    <div className="mt-3 rounded-xl border border-amber-400/20 bg-slate-950/45 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-black text-white">
          <Activity className="h-4 w-4 text-amber-300" />
          Trend zátěže motoru
        </div>
        <div className="text-xs font-bold text-slate-300">
          {first.motorLoadPercent} % {'->'} {latest.motorLoadPercent} %
        </div>
      </div>
      <svg viewBox="0 0 100 52" preserveAspectRatio="none" className="h-16 w-full overflow-visible">
        <line x1="0" y1="46" x2="100" y2="46" className="stroke-slate-700" strokeWidth="1" />
        <line x1="0" y1="10" x2="100" y2="10" className="stroke-slate-800" strokeWidth="1" />
        <polyline points={polyline} fill="none" className="stroke-amber-300" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((log, index) => {
          const x = points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
          const y = 46 - (((log.motorLoadPercent ?? 0) - min) / spread) * 36;
          return <circle key={`${log.id}-load-${index}`} cx={x} cy={y} r="2.2" className="fill-amber-200" />;
        })}
      </svg>
      <div className="mt-1 flex justify-between text-xs font-semibold text-slate-400">
        <span>{formatDateTime(first.measuredAt)}</span>
        <span>{formatDateTime(latest.measuredAt)}</span>
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
