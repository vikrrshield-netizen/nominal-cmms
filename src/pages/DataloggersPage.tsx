import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Droplets,
  Loader2,
  MapPin,
  Minus,
  Plus,
  Search,
  Thermometer,
  X,
} from 'lucide-react';
import { Timestamp } from 'firebase/firestore';
import { useAuthContext } from '../context/AuthContext';
import { assetService } from '../services/assetService';
import {
  addDataloggerTemperatureLog,
  isDataloggerAsset,
  normalizeDataloggerText,
  subscribeDataloggerTemperatureLogs,
} from '../services/dataloggerService';
import { showToast } from '../components/ui/Toast';
import { Skeleton } from '../components/ui';
import type { Asset, CustomField } from '../types/asset';
import type { DataloggerTemperatureLevel, DataloggerTemperatureLog } from '../types/datalogger';

type FilterKey = 'all' | 'missing' | 'alerts' | 'today';
type RoomOption = {
  id: string;
  label: string;
  name: string;
  buildingId?: string;
  floor?: string;
  parentId?: string | null;
  isAsset: boolean;
};

const QUICK_TEMPS = [-25, -18, 0, 2, 5, 8, 20];

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseDecimalInput(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDecimalInput(value: number, digits = 1): string {
  const rounded = Number(value.toFixed(digits));
  return (Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(digits)).replace('.', ',');
}

function stepDecimalInput(value: string, delta: number, fallback: number, min: number, max: number, digits = 1): string {
  const base = parseDecimalInput(value) ?? fallback;
  return formatDecimalInput(clampNumber(base + delta, min, max), digits);
}

function asDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === 'object' && value && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate();
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function isToday(value: unknown): boolean {
  const date = asDate(value);
  if (!date) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}

function isWeekend(date = new Date()): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function formatDateTime(value: unknown): string {
  const date = asDate(value);
  if (!date) return 'bez data';
  return date.toLocaleString('cs-CZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toDateTimeLocal(date: Date): string {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function fromDateTimeLocal(value: string): Date {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function placeLabel(asset: Asset): string {
  return [asset.buildingId ? `Budova ${asset.buildingId}` : '', asset.floor, asset.areaName || asset.location]
    .filter(Boolean)
    .join(' | ') || 'Umístění není vyplněné';
}

function roomLabel(asset: Asset): string {
  return asset.areaName || asset.roomId || asset.location || '';
}

function isRoomAsset(asset: Asset): boolean {
  const text = normalizeDataloggerText(`${asset.entityType} ${asset.category} ${asset.name}`);
  return text.includes('mistnost') || text.includes('room') || text.includes('prostor');
}

function customFieldText(asset: Asset, keys: string[]): string {
  const normalizedKeys = keys.map(normalizeDataloggerText);
  const field = (asset.customFields || []).find((item: CustomField) => {
    const label = normalizeDataloggerText(`${item.key} ${item.label}`);
    return normalizedKeys.some((key) => label.includes(key));
  });
  return field?.value === undefined || field.value === null ? '' : String(field.value);
}

function customFieldNumber(asset: Asset, keys: string[]): number | null {
  const raw = customFieldText(asset, keys);
  if (!raw) return null;
  const value = Number(raw.replace(',', '.').replace(/[^\d.-]+/g, ''));
  return Number.isFinite(value) ? value : null;
}

function rangeLabel(min: number | null, max: number | null): string {
  if (min !== null && max !== null) return `${min} až ${max} °C`;
  if (min !== null) return `min. ${min} °C`;
  if (max !== null) return `max. ${max} °C`;
  return 'limit není vyplněný';
}

function latestLogFor(asset: Asset, logs: DataloggerTemperatureLog[]): DataloggerTemperatureLog | null {
  return logs.find((log) => log.dataloggerId === asset.id) || null;
}

function logsForAsset(asset: Asset, logs: DataloggerTemperatureLog[], count = 8): DataloggerTemperatureLog[] {
  return logs.filter((log) => log.dataloggerId === asset.id).slice(0, count);
}

function temperatureLevel(asset: Asset, log: DataloggerTemperatureLog | null): DataloggerTemperatureLevel {
  // Překročení limitu má PŘEDNOST i o víkendu — jinak by se přes víkend skryl alarm
  // (poslední páteční hodnota nad limitem) a food-safety riziko by zůstalo neviditelné.
  const min = customFieldNumber(asset, ['min', 'minimum', 'min teplota', 'dolni limit']);
  const max = customFieldNumber(asset, ['max', 'maximum', 'max teplota', 'horni limit']);
  if (log && ((min !== null && log.temperatureC < min) || (max !== null && log.temperatureC > max))) return 'critical';
  if (isWeekend() && !(log && isToday(log.measuredAt))) return 'not_required';
  if (!log) return 'missing';
  if (!isToday(log.measuredAt)) return 'warning';
  return 'ok';
}

function levelTone(level: DataloggerTemperatureLevel): string {
  if (level === 'ok') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (level === 'not_required') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (level === 'critical') return 'border-red-200 bg-red-50 text-red-700';
  if (level === 'warning') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

function levelLabel(level: DataloggerTemperatureLevel): string {
  if (level === 'ok') return 'Dnes zapsáno';
  if (level === 'not_required') return 'Víkend';
  if (level === 'critical') return 'Mimo limit';
  if (level === 'warning') return 'Starý zápis';
  return 'Chybí dnes';
}

export default function DataloggersPage() {
  const navigate = useNavigate();
  const { user, hasPermission } = useAuthContext();
  const tenantId = user?.tenantId || 'main_firm';
  const canWrite = hasPermission('datalogger.temperature.write') || hasPermission('datalogger.manage');
  const canAssignRoom = hasPermission('asset.update');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [logs, setLogs] = useState<DataloggerTemperatureLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [activeAsset, setActiveAsset] = useState<Asset | null>(null);
  const [assignAsset, setAssignAsset] = useState<Asset | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    assetService.getAll(tenantId)
      .then((items) => {
        if (alive) setAssets(items);
      })
      .catch((error) => console.error('[DataloggersPage] assets error:', error))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [tenantId]);

  useEffect(() => subscribeDataloggerTemperatureLogs((items) => setLogs(items)), []);

  const tenantLogs = useMemo(
    () => logs.filter((log) => log.tenantId === tenantId || !log.tenantId),
    [logs, tenantId],
  );

  const dataloggers = useMemo(
    () => assets.filter((asset) => isDataloggerAsset(asset)),
    [assets],
  );

  const roomOptions = useMemo<RoomOption[]>(() => {
    const map = new Map<string, RoomOption>();
    for (const asset of assets) {
      const roomName = isRoomAsset(asset) ? (asset.areaName || asset.name) : asset.areaName;
      if (!roomName) continue;
      const key = `${asset.buildingId || ''}|${asset.floor || ''}|${roomName}`;
      const option: RoomOption = {
        id: isRoomAsset(asset) ? asset.id : `area:${key}`,
        label: [asset.buildingId ? `Budova ${asset.buildingId}` : '', asset.floor, roomName].filter(Boolean).join(' | '),
        name: roomName,
        buildingId: asset.buildingId,
        floor: asset.floor,
        parentId: asset.parentId,
        isAsset: isRoomAsset(asset),
      };
      const existing = map.get(key);
      if (!existing || option.isAsset) map.set(key, option);
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'cs'));
  }, [assets]);

  const stats = useMemo(() => {
    let today = 0;
    let missing = 0;
    let alerts = 0;
    for (const asset of dataloggers) {
      const latest = latestLogFor(asset, tenantLogs);
      const level = temperatureLevel(asset, latest);
      if (latest && isToday(latest.measuredAt)) today += 1;
      if (level === 'missing' || level === 'warning') missing += 1;
      if (level === 'critical') alerts += 1;
    }
    return { total: dataloggers.length, today, missing, alerts };
  }, [dataloggers, tenantLogs]);

  const filteredDataloggers = useMemo(() => {
    const needle = normalizeDataloggerText(search);
    return dataloggers
      .filter((asset) => {
        const latest = latestLogFor(asset, tenantLogs);
        const level = temperatureLevel(asset, latest);
        if (filter === 'missing' && !(level === 'missing' || level === 'warning')) return false;
        if (filter === 'alerts' && level !== 'critical') return false;
        if (filter === 'today' && !(latest && isToday(latest.measuredAt))) return false;
        if (!needle) return true;
        return normalizeDataloggerText([
          asset.name,
          asset.code,
          asset.location,
          asset.areaName,
          asset.buildingId,
          asset.notes,
        ].join(' ')).includes(needle);
      })
      .sort((a, b) => {
        const order: Record<DataloggerTemperatureLevel, number> = { critical: 0, missing: 1, warning: 2, not_required: 3, ok: 4 };
        const levelA = temperatureLevel(a, latestLogFor(a, tenantLogs));
        const levelB = temperatureLevel(b, latestLogFor(b, tenantLogs));
        return order[levelA] - order[levelB] || a.name.localeCompare(b.name, 'cs');
      });
  }, [dataloggers, filter, search, tenantLogs]);

  const filters: Array<{ id: FilterKey; label: string; count: number }> = [
    { id: 'all', label: 'Vše', count: stats.total },
    { id: 'missing', label: 'Chybí', count: stats.missing },
    { id: 'alerts', label: 'Mimo limit', count: stats.alerts },
    { id: 'today', label: 'Dnes', count: stats.today },
  ];

  return (
    <div className="vik-page">
      <header className="vik-page-header sticky top-0 z-30">
        <div className="vik-page-shell flex items-center justify-between gap-3 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => navigate(-1)} className="vik-button h-12 w-12 p-0" aria-label="Zpět">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-100 bg-cyan-50 text-cyan-700">
              <Thermometer className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-black text-slate-950">Datalogery</h1>
              <p className="text-sm font-semibold text-slate-600">Denní zápis teplot pro sklad a audit</p>
            </div>
          </div>
        </div>
      </header>

      <main className="vik-page-shell space-y-4 py-4 pb-24">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Datalogery" value={stats.total} icon={Thermometer} tone="text-cyan-700" />
          <StatCard label="Dnes zapsáno" value={stats.today} icon={CheckCircle2} tone="text-emerald-700" />
          <StatCard label="Chybí dnes" value={stats.missing} icon={CalendarClock} tone="text-amber-700" />
          <StatCard label="Mimo limit" value={stats.alerts} icon={AlertTriangle} tone="text-red-700" />
        </section>

        {isWeekend() && (
          <section className="vik-card border-blue-100 bg-blue-50 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-white text-blue-700">
                <CalendarClock className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-black text-blue-900">Víkendový režim</div>
                <p className="mt-1 text-sm font-semibold text-blue-800">
                  Ruční zápisy nejsou o víkendu vyžadované, pokud ve skladu není obsluha. Systém nevytváří falešné záznamy.
                </p>
              </div>
            </div>
          </section>
        )}

        <section className="vik-card p-3">
          <div className="mb-3 flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3">
            <Search className="h-5 w-5 shrink-0 text-slate-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Hledat datalogger, sklad, místnost nebo kód..."
              className="h-12 w-full bg-transparent text-base font-semibold text-slate-950 outline-none placeholder:text-slate-400"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {filters.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={`vik-chip min-h-11 px-4 ${filter === item.id ? 'vik-chip-active' : ''}`}
              >
                {item.label} <span className="text-slate-500">({item.count})</span>
              </button>
            ))}
          </div>
        </section>

        {loading && (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" role="status" aria-busy="true" aria-label="Načítám datalogery…">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="vik-card space-y-3 p-4">
                <div className="flex items-center gap-3">
                  <Skeleton width="w-11" height="h-11" rounded="rounded-2xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton width="w-2/3" height="h-5" />
                    <Skeleton width="w-1/2" height="h-4" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Skeleton height="h-20" rounded="rounded-xl" />
                  <Skeleton height="h-20" rounded="rounded-xl" />
                </div>
                <Skeleton height="h-11" rounded="rounded-xl" />
              </div>
            ))}
          </div>
        )}

        {!loading && dataloggers.length === 0 && (
          <div className="vik-card p-6 text-center">
            <Thermometer className="mx-auto h-9 w-9 text-slate-400" />
            <h2 className="mt-3 text-lg font-black text-slate-950">Zatím tu nejsou datalogery</h2>
            <p className="mx-auto mt-1 max-w-xl text-sm font-semibold text-slate-600">
              V kartotéce založ zařízení s názvem nebo typem “datalogger”, “dataloger”, “logger” nebo “teploměr”.
              Pak se tady automaticky objeví pro denní zápis teplot.
            </p>
          </div>
        )}

        {!loading && filteredDataloggers.length === 0 && dataloggers.length > 0 && (
          <div className="vik-card p-6 text-center text-sm font-bold text-slate-600">
            Žádný datalogger neodpovídá filtru.
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredDataloggers.map((asset) => {
            const latest = latestLogFor(asset, tenantLogs);
            const history = logsForAsset(asset, tenantLogs);
            const level = temperatureLevel(asset, latest);
            return (
              <DataloggerCard
                key={asset.id}
                asset={asset}
                latest={latest}
                history={history}
                level={level}
                canWrite={canWrite}
                canAssignRoom={canAssignRoom}
                onLog={() => setActiveAsset(asset)}
                onAssignRoom={() => setAssignAsset(asset)}
              />
            );
          })}
        </div>
      </main>

      {activeAsset && (
        <TemperatureModal
          asset={activeAsset}
          user={user}
          tenantId={tenantId}
          onClose={() => setActiveAsset(null)}
          onSaved={() => setActiveAsset(null)}
        />
      )}
      {assignAsset && (
        <AssignRoomModal
          asset={assignAsset}
          tenantId={tenantId}
          rooms={roomOptions}
          onClose={() => setAssignAsset(null)}
          onSaved={(updated) => {
            setAssets((current) => current.map((item) => (item.id === updated.id ? updated : item)));
            setAssignAsset(null);
          }}
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
  icon: typeof Thermometer;
  tone: string;
}) {
  return (
    <div className="vik-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white">
          <Icon className={`h-5 w-5 ${tone}`} />
        </div>
        <div className={`text-2xl font-black ${tone}`}>{value}</div>
      </div>
      <div className="mt-3 text-sm font-bold text-slate-700">{label}</div>
    </div>
  );
}

function DataloggerCard({
  asset,
  latest,
  history,
  level,
  canWrite,
  canAssignRoom,
  onLog,
  onAssignRoom,
}: {
  asset: Asset;
  latest: DataloggerTemperatureLog | null;
  history: DataloggerTemperatureLog[];
  level: DataloggerTemperatureLevel;
  canWrite: boolean;
  canAssignRoom: boolean;
  onLog: () => void;
  onAssignRoom: () => void;
}) {
  const min = customFieldNumber(asset, ['min', 'minimum', 'min teplota', 'dolni limit']);
  const max = customFieldNumber(asset, ['max', 'maximum', 'max teplota', 'horni limit']);
  const directRoom = latest?.roomName || roomLabel(asset);

  return (
    <article className="vik-card overflow-hidden p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-100 bg-cyan-50 text-cyan-700">
          <Thermometer className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-black text-slate-950">{asset.name}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-slate-600">
                {asset.buildingId && <span>Budova {asset.buildingId}</span>}
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-4 w-4 text-slate-400" />
                  {directRoom || 'Místnost nedoplněna'}
                </span>
                <span className="font-mono">{asset.code || 'bez kódu'}</span>
              </div>
            </div>
            <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-black ${levelTone(level)}`}>
              {levelLabel(level)}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs font-black uppercase tracking-wide text-slate-500">Poslední teplota</div>
          <div className="mt-2 text-2xl font-black text-slate-950">
            {latest ? `${latest.temperatureC} °C` : '—'}
          </div>
          <div className="mt-1 text-xs font-semibold text-slate-500">
            {latest ? `Naposledy ${formatDateTime(latest.measuredAt)}` : level === 'not_required' ? 'víkend bez obsluhy' : 'bez zápisu'}
          </div>
          {latest?.rawMaterial && (
            <div className="mt-2 truncate text-xs font-black text-emerald-700">
              Surovina: {latest.rawMaterial}
            </div>
          )}
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs font-black uppercase tracking-wide text-slate-500">Vlhkost / limit</div>
          {typeof latest?.humidityPct === 'number' && (
            <div className="mt-2 flex items-center gap-1 text-2xl font-black text-cyan-700">
              <Droplets className="h-5 w-5" />
              {latest.humidityPct} %
            </div>
          )}
          <div className="mt-2 text-base font-black text-slate-950">{rangeLabel(min, max)}</div>
          <div className="mt-1 text-xs font-semibold text-slate-500">
            {customFieldText(asset, ['typ', 'prostor', 'sklad']) || 'dle karty'}
          </div>
        </div>
      </div>

      <MiniTemperatureTrend history={history} />

      {latest?.note && (
        <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
          {latest.note}
        </div>
      )}

      <div className={`mt-4 grid gap-2 ${canAssignRoom ? 'sm:grid-cols-2' : ''}`}>
        <button
          type="button"
          disabled={!canWrite}
          onClick={onLog}
          className="vik-button vik-button-primary w-full"
        >
          <ClipboardList className="h-4 w-4" />
          Zapsat denní teplotu
        </button>
        {canAssignRoom && (
          <button
            type="button"
            onClick={onAssignRoom}
            className="vik-button w-full"
          >
            <MapPin className="h-4 w-4" />
            Přiřadit místnost
          </button>
        )}
      </div>
      {!canWrite && (
        <div className="mt-2 text-center text-xs font-semibold text-slate-500">
          Nemáš oprávnění k zápisu teplot dataloggerů.
        </div>
      )}
    </article>
  );
}

function MiniTemperatureTrend({ history }: { history: DataloggerTemperatureLog[] }) {
  const pointsSource = history
    .filter((log) => Number.isFinite(log.temperatureC))
    .slice(0, 8)
    .reverse();

  if (pointsSource.length < 2) {
    return (
      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500">
        Trend teplot se ukáže po druhém zápisu.
      </div>
    );
  }

  const values = pointsSource.map((log) => log.temperatureC);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const width = 220;
  const height = 56;
  const pad = 8;
  const points = pointsSource.map((log, index) => {
    const x = pad + (index * (width - pad * 2)) / Math.max(1, pointsSource.length - 1);
    const y = height - pad - ((log.temperatureC - min) / span) * (height - pad * 2);
    return { x, y, log };
  });
  const first = pointsSource[0];
  const last = pointsSource[pointsSource.length - 1];

  return (
    <div className="mt-3 rounded-xl border border-cyan-100 bg-cyan-50/60 p-3">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs font-black text-cyan-900">
        <span>Trend teplot</span>
        <span>{first.temperatureC} °C → {last.temperatureC} °C</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-14 w-full overflow-visible" role="img" aria-label="Trend teplot dataloggeru">
        <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="#bae6fd" strokeWidth="2" />
        <polyline
          points={points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')}
          fill="none"
          stroke="#0891b2"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((point, index) => (
          <circle key={`${point.log.id}-${index}`} cx={point.x} cy={point.y} r="4" fill="#0e7490" />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[11px] font-bold text-slate-500">
        <span>{formatDateTime(first.measuredAt)}</span>
        <span>{formatDateTime(last.measuredAt)}</span>
      </div>
    </div>
  );
}

function AssignRoomModal({
  asset,
  tenantId,
  rooms,
  onClose,
  onSaved,
}: {
  asset: Asset;
  tenantId: string;
  rooms: RoomOption[];
  onClose: () => void;
  onSaved: (asset: Asset) => void;
}) {
  const currentRoom = roomLabel(asset);
  const initialRoomId = useMemo(() => {
    const byRoomId = rooms.find((room) => asset.roomId && room.id === asset.roomId);
    if (byRoomId) return byRoomId.id;
    const byName = rooms.find((room) => normalizeDataloggerText(room.name) === normalizeDataloggerText(currentRoom));
    return byName?.id || rooms[0]?.id || '';
  }, [asset.roomId, currentRoom, rooms]);
  const [selectedId, setSelectedId] = useState(initialRoomId);
  const [saving, setSaving] = useState(false);
  const selectedRoom = rooms.find((room) => room.id === selectedId) || null;

  const handleSave = async () => {
    if (!selectedRoom) {
      showToast('Vyber místnost.', 'error');
      return;
    }

    const updateData: Partial<Asset> = {
      parentId: selectedRoom.isAsset ? selectedRoom.id : asset.parentId,
      roomId: selectedRoom.isAsset ? selectedRoom.id : '',
      buildingId: selectedRoom.buildingId || asset.buildingId,
      floor: selectedRoom.floor || asset.floor,
      areaName: selectedRoom.name,
      location: selectedRoom.name,
    };

    setSaving(true);
    try {
      await assetService.update(tenantId, asset.id, updateData);
      showToast('Datalogger přiřazen k místnosti.', 'success');
      onSaved({ ...asset, ...updateData });
    } catch (error) {
      console.error('[DataloggersPage] room assign failed:', error);
      showToast('Místnost se nepodařilo uložit.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/45 p-2 sm:items-center sm:p-3">
      <div className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-3 shadow-2xl sm:p-4">
        <div className="sticky top-0 z-10 -mx-3 -mt-3 mb-3 flex items-start justify-between gap-3 border-b border-slate-100 bg-white/95 px-3 py-3 sm:-mx-4 sm:-mt-4 sm:px-4">
          <div>
            <div className="text-xs font-black uppercase tracking-widest text-cyan-700">Umístění</div>
            <h2 className="mt-1 text-2xl font-black text-slate-950">Přiřadit místnost</h2>
            <p className="text-sm font-semibold text-slate-600">{asset.name}</p>
          </div>
          <button type="button" onClick={onClose} className="vik-button h-11 w-11 p-0" aria-label="Zavřít">
            <X className="h-5 w-5" />
          </button>
        </div>

        {rooms.length === 0 ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
            V kartotéce zatím nejsou místnosti. Nejdřív založ místnost nebo doplň umístění u zařízení.
          </div>
        ) : (
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-black text-slate-800">Místnost</span>
              <select
                value={selectedId}
                onChange={(event) => setSelectedId(event.target.value)}
                className="vik-input font-bold"
                autoFocus
              >
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.label}
                  </option>
                ))}
              </select>
            </label>
            {selectedRoom && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-600">
                Datalogger se bude zobrazovat v místnosti <strong className="text-slate-950">{selectedRoom.name}</strong>.
              </div>
            )}
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="vik-button vik-button-primary min-h-12 w-full"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
              Uložit místnost
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function TemperatureModal({
  asset,
  user,
  tenantId,
  onClose,
  onSaved,
}: {
  asset: Asset;
  user: { uid?: string; id?: string; displayName?: string } | null;
  tenantId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [temperature, setTemperature] = useState('');
  const [humidity, setHumidity] = useState('');
  const [rawMaterial, setRawMaterial] = useState('');
  const [measuredAt, setMeasuredAt] = useState(toDateTimeLocal(new Date()));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const temperatureSliderValue = clampNumber(parseDecimalInput(temperature) ?? 5, -30, 40);
  const humiditySliderValue = clampNumber(parseDecimalInput(humidity) ?? 50, 0, 100);

  const handleSave = async () => {
    const value = parseDecimalInput(temperature);
    if (value === null) {
      showToast('Zadej platnou teplotu.', 'error');
      return;
    }
    const humidityValue = parseDecimalInput(humidity);
    if (humidity.trim() && (humidityValue === null || humidityValue < 0 || humidityValue > 100)) {
      showToast('Vlhkost musí být číslo 0-100 %.', 'error');
      return;
    }

    setSaving(true);
    try {
      await addDataloggerTemperatureLog({
        tenantId,
        datalogger: asset,
        user,
        temperatureC: value,
        humidityPct: humidityValue ?? undefined,
        rawMaterial: rawMaterial.trim(),
        measuredAt: fromDateTimeLocal(measuredAt),
        roomName: roomLabel(asset),
        note: note.trim(),
        source: 'web',
      });
      showToast('Teplota dataloggeru uložena.', 'success');
      onSaved();
    } catch (error) {
      console.error('[DataloggersPage] save failed:', error);
      showToast('Teplotu se nepodařilo uložit.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-hidden bg-black/45 p-2 sm:items-center sm:p-3">
      <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl sm:max-h-[min(760px,calc(100dvh-1.5rem))]">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 p-3 sm:p-4">
          <div>
            <div className="text-xs font-black uppercase tracking-widest text-cyan-700">Denní měření</div>
            <h2 className="mt-1 text-xl font-black text-slate-950 sm:text-2xl">Zapsat teplotu</h2>
            <p className="text-sm font-semibold text-slate-600">{asset.name} · {placeLabel(asset)}</p>
          </div>
          <button type="button" onClick={onClose} className="vik-button h-11 w-11 p-0" aria-label="Zavřít">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto overscroll-contain p-3 sm:space-y-4 sm:p-4">
          <label className="block">
            <span className="mb-1 block text-sm font-black text-slate-800">Teplota</span>
            <input
              value={temperature}
              onChange={(event) => setTemperature(event.target.value.replace('.', ','))}
              inputMode="decimal"
              placeholder="např. 5,2"
              className="vik-input text-xl font-black sm:text-2xl"
              autoFocus
            />
            <div className="mt-2 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-2.5 sm:p-3">
              <div className="mb-2 flex items-center justify-end">
                <span className="rounded-full bg-white px-2.5 py-1 text-sm font-black text-emerald-800">
                  {temperature.trim() ? `${temperature.replace('.', ',')} °C` : 'nezadáno'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTemperature(stepDecimalInput(temperature, -0.1, 5, -30, 40))}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-200 bg-white text-emerald-800"
                  aria-label="Snížit teplotu o 0,1 stupně"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <input
                  type="range"
                  min="-30"
                  max="40"
                  step="0.1"
                  value={temperatureSliderValue}
                  onChange={(event) => setTemperature(formatDecimalInput(Number(event.target.value)))}
                  className="w-full accent-emerald-700"
                  aria-label="Teplota ve stupních Celsia"
                />
                <button
                  type="button"
                  onClick={() => setTemperature(stepDecimalInput(temperature, 0.1, 5, -30, 40))}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-200 bg-white text-emerald-800"
                  aria-label="Zvýšit teplotu o 0,1 stupně"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-1.5 sm:grid-cols-7 sm:gap-2">
                {QUICK_TEMPS.map((temp) => (
                  <button
                    key={temp}
                    type="button"
                    onClick={() => setTemperature(formatDecimalInput(temp))}
                    className={`min-h-9 rounded-xl border px-2 text-xs font-black sm:min-h-10 sm:text-sm ${
                      parseDecimalInput(temperature) === temp
                        ? 'border-emerald-600 bg-emerald-100 text-emerald-800'
                        : 'border-emerald-100 bg-white text-emerald-800'
                    }`}
                  >
                    {temp} °C
                  </button>
                ))}
              </div>
            </div>
          </label>

          <label className="block">
            <span className="mb-1 flex items-center gap-1 text-sm font-black text-slate-800">
              <Droplets className="h-4 w-4 text-cyan-700" />
              Vlhkost
            </span>
            <input
              value={humidity}
              onChange={(event) => setHumidity(event.target.value.replace('.', ','))}
              inputMode="decimal"
              placeholder="volitelně, např. 55"
              className="vik-input text-lg font-black sm:text-xl"
            />
            <div className="mt-2 rounded-2xl border border-cyan-100 bg-cyan-50/60 p-2.5 sm:p-3">
              <div className="mb-2 flex items-center justify-end">
                <span className="rounded-full bg-white px-2.5 py-1 text-sm font-black text-cyan-800">
                  {humidity.trim() ? `${humidity.replace('.', ',')} %` : 'nezadáno'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setHumidity(stepDecimalInput(humidity, -1, 50, 0, 100, 0))}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-200 bg-white text-cyan-800"
                  aria-label="Snížit vlhkost o 1 procento"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={humiditySliderValue}
                  onChange={(event) => setHumidity(formatDecimalInput(Number(event.target.value), 0))}
                  className="w-full accent-cyan-700"
                  aria-label="Vlhkost v procentech"
                />
                <button
                  type="button"
                  onClick={() => setHumidity(stepDecimalInput(humidity, 1, 50, 0, 100, 0))}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-200 bg-white text-cyan-800"
                  aria-label="Zvýšit vlhkost o 1 procento"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 grid grid-cols-5 gap-1.5">
                {[40, 50, 60, 70, 80].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setHumidity(formatDecimalInput(value, 0))}
                    className={`min-h-9 rounded-xl border px-2 text-xs font-black ${
                      parseDecimalInput(humidity) === value
                        ? 'border-cyan-700 bg-cyan-100 text-cyan-800'
                        : 'border-cyan-100 bg-white text-cyan-800'
                    }`}
                  >
                    {value} %
                  </button>
                ))}
              </div>
            </div>
            <span className="mt-1 block text-xs font-semibold text-slate-500">Zadej procenta RH, pokud datalogger vlhkost ukazuje.</span>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-black text-slate-800">Surovina / produkt</span>
            <input
              value={rawMaterial}
              onChange={(event) => setRawMaterial(event.target.value)}
              placeholder="volitelně: mouka, směs, šarže..."
              className="vik-input font-bold"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-black text-slate-800">Datum a čas měření</span>
            <input
              value={measuredAt}
              onChange={(event) => setMeasuredAt(event.target.value)}
              type="datetime-local"
              className="vik-input font-bold"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-black text-slate-800">Poznámka</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              placeholder="volitelné: námraza, otevřené dveře, kontrola OK..."
              className="vik-input min-h-[96px] resize-none"
            />
          </label>

          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="vik-button vik-button-primary sticky bottom-0 z-10 min-h-12 w-full shadow-lg"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
            Uložit denní teplotu
          </button>
        </div>
      </div>
    </div>
  );
}
