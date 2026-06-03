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
import type { Asset, CustomField } from '../types/asset';
import type { DataloggerTemperatureLevel, DataloggerTemperatureLog } from '../types/datalogger';

type FilterKey = 'all' | 'missing' | 'alerts' | 'today';

const QUICK_TEMPS = [-25, -18, 0, 2, 5, 8, 20];

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

function temperatureLevel(asset: Asset, log: DataloggerTemperatureLog | null): DataloggerTemperatureLevel {
  if (isWeekend() && !(log && isToday(log.measuredAt))) return 'not_required';
  if (!log) return 'missing';
  const min = customFieldNumber(asset, ['min', 'minimum', 'min teplota', 'dolni limit']);
  const max = customFieldNumber(asset, ['max', 'maximum', 'max teplota', 'horni limit']);
  if ((min !== null && log.temperatureC < min) || (max !== null && log.temperatureC > max)) return 'critical';
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
  const [assets, setAssets] = useState<Asset[]>([]);
  const [logs, setLogs] = useState<DataloggerTemperatureLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [activeAsset, setActiveAsset] = useState<Asset | null>(null);

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
              className="h-12 w-full bg-transparent text-base font-semibold text-slate-950 outline-none placeholder:text-slate-500"
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
          <div className="vik-card flex items-center gap-2 p-4 text-sm font-bold text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            Načítám datalogery...
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
            const level = temperatureLevel(asset, latest);
            return (
              <DataloggerCard
                key={asset.id}
                asset={asset}
                latest={latest}
                level={level}
                canWrite={canWrite}
                onLog={() => setActiveAsset(asset)}
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
  level,
  canWrite,
  onLog,
}: {
  asset: Asset;
  latest: DataloggerTemperatureLog | null;
  level: DataloggerTemperatureLevel;
  canWrite: boolean;
  onLog: () => void;
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
            {latest ? formatDateTime(latest.measuredAt) : level === 'not_required' ? 'víkend bez obsluhy' : 'bez zápisu'}
          </div>
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

      {latest?.note && (
        <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
          {latest.note}
        </div>
      )}

      <button
        type="button"
        disabled={!canWrite}
        onClick={onLog}
        className="vik-button vik-button-primary mt-4 w-full"
      >
        <ClipboardList className="h-4 w-4" />
        Zapsat denní teplotu
      </button>
      {!canWrite && (
        <div className="mt-2 text-center text-xs font-semibold text-slate-500">
          Nemáš oprávnění k zápisu teplot dataloggerů.
        </div>
      )}
    </article>
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
  const [measuredAt, setMeasuredAt] = useState(toDateTimeLocal(new Date()));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const value = Number(temperature.replace(',', '.'));
    if (!Number.isFinite(value)) {
      showToast('Zadej platnou teplotu.', 'error');
      return;
    }
    const humidityValue = humidity.trim() ? Number(humidity.replace(',', '.')) : undefined;
    if (humidityValue !== undefined && (!Number.isFinite(humidityValue) || humidityValue < 0 || humidityValue > 100)) {
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
        humidityPct: humidityValue,
        measuredAt: fromDateTimeLocal(measuredAt),
        roomName: roomLabel(asset),
        note: note.trim(),
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-3 sm:items-center">
      <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-black uppercase tracking-widest text-cyan-700">Denní měření</div>
            <h2 className="mt-1 text-2xl font-black text-slate-950">Zapsat teplotu</h2>
            <p className="text-sm font-semibold text-slate-600">{asset.name} · {placeLabel(asset)}</p>
          </div>
          <button type="button" onClick={onClose} className="vik-button h-11 w-11 p-0" aria-label="Zavřít">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-black text-slate-800">Teplota</span>
            <input
              value={temperature}
              onChange={(event) => setTemperature(event.target.value)}
              inputMode="decimal"
              placeholder="např. 5,2"
              className="vik-input text-2xl font-black"
              autoFocus
            />
          </label>

          <label className="block">
            <span className="mb-1 flex items-center gap-1 text-sm font-black text-slate-800">
              <Droplets className="h-4 w-4 text-cyan-700" />
              Vlhkost
            </span>
            <input
              value={humidity}
              onChange={(event) => setHumidity(event.target.value)}
              inputMode="decimal"
              placeholder="volitelně, např. 55"
              className="vik-input text-xl font-black"
            />
            <div className="mt-3 rounded-2xl border border-cyan-100 bg-cyan-50/60 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-xs font-black uppercase tracking-wide text-cyan-800">Posuvník vlhkosti</span>
                <span className="rounded-full bg-white px-2.5 py-1 text-sm font-black text-cyan-800">
                  {humidity.trim() ? `${humidity.replace('.', ',')} %` : 'nezadáno'}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={humidity.trim() ? Math.max(0, Math.min(100, Number(humidity.replace(',', '.')) || 0)) : 50}
                onChange={(event) => setHumidity(event.target.value)}
                className="w-full accent-cyan-700"
                aria-label="Vlhkost v procentech"
              />
              <div className="mt-2 grid grid-cols-5 gap-1.5">
                {[40, 50, 60, 70, 80].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setHumidity(String(value))}
                    className={`min-h-9 rounded-xl border px-2 text-xs font-black ${
                      humidity === String(value)
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

          <div>
            <div className="mb-2 text-sm font-black text-slate-800">Rychlé hodnoty</div>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              {QUICK_TEMPS.map((temp) => (
                <button
                  key={temp}
                  type="button"
                  onClick={() => setTemperature(String(temp))}
                  className={`min-h-11 rounded-xl border px-2 text-sm font-black ${
                    temperature === String(temp)
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-slate-50 text-slate-700'
                  }`}
                >
                  {temp} °C
                </button>
              ))}
            </div>
          </div>

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
            className="vik-button vik-button-primary min-h-12 w-full"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
            Uložit denní teplotu
          </button>
        </div>
      </div>
    </div>
  );
}
