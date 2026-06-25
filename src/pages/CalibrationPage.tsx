// src/pages/CalibrationPage.tsx
// VIKRR — Asset Shield — „Kalibrace měřidel". Audit-registr měřidel (teploměry, váhy, vlhkoměry…).
// Měřidlo = zařízení z kartotéky (typ/název obsahuje měřidlo/teploměr/váha… nebo má kalibrační akci).
// Kalibrace = asset.event (eventType 'calibration') s intervalem + termínem. Hlídá propadnutí platnosti.
// Žádný nový datový model, žádná změna pravidel — stejný motor jako klimatizace.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Ruler, Loader2, Check, Plus, Paperclip } from 'lucide-react';
import { useAuthContext } from '../context/AuthContext';
import { assetService } from '../services/assetService';
import { showToast } from '../components/ui/Toast';
import type { Asset, AssetEvent } from '../types/asset';

type Tone = 'ok' | 'warn' | 'crit' | 'none';
const TONE: Record<Tone, { dot: string; text: string; soft: string }> = {
  ok: { dot: '#22c55e', text: '#16a34a', soft: '#dcfce7' },
  warn: { dot: '#eab308', text: '#d97706', soft: '#fef3c7' },
  crit: { dot: '#ef4444', text: '#dc2626', soft: '#fee2e2' },
  none: { dot: '#cbd5e1', text: '#64748b', soft: '#f1f5f9' },
};

const CALIB_INTERVAL_DAYS = 365;

const newId = (): string => {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  return 'evt_' + (g.crypto?.randomUUID ? g.crypto.randomUUID() : Math.random().toString(36).slice(2));
};
const todayIso = () => new Date().toISOString().slice(0, 10);
const addDaysIso = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
const daysUntil = (iso?: string): number | null => {
  if (!iso) return null;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  return Math.ceil((t.getTime() - Date.now()) / 86400000);
};
const fmtCz = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' });
};
const norm = (s: unknown) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Měřidla poznáme podle běžných názvů/typů, nebo když už mají kalibrační akci.
const INSTRUMENT_RE = /(meridl|kalibr|teplom|vlhkom|manometr|tlakom|posuvn\w* ?(meritk|mer)|mikrometr|\bvah|luxmet|ph[ -]?met|hlukom|zavazi)/;
const calibEvent = (a: Asset): AssetEvent | undefined =>
  (a.events ?? []).find((e) => e.eventType === 'calibration' || norm(e.name).includes('kalibr'));
const isInstrument = (a: Asset): boolean =>
  !!calibEvent(a) || INSTRUMENT_RE.test(norm(`${a.name} ${a.entityType} ${a.category} ${a.code}`));

const calibTone = (ev?: AssetEvent): Tone => {
  if (!ev) return 'none';
  const d = daysUntil(ev.nextDate);
  if (d == null) return 'none';
  if (d < 0) return 'crit';
  if (d <= 30) return 'warn';
  return 'ok';
};
const calibLabel = (ev?: AssetEvent): string => {
  if (!ev) return 'kalibrace nenastavena';
  const d = daysUntil(ev.nextDate);
  if (d == null) return 'termín nezadán';
  if (d < 0) return `PROPADLÁ · termín byl ${fmtCz(ev.nextDate)}`;
  return `platná · příště ${fmtCz(ev.nextDate)}`;
};
const intervalLabel = (days?: number): string => {
  if (!days) return '';
  if (days >= 365) return `á ${Math.round(days / 365)} rok${Math.round(days / 365) > 1 ? 'y' : ''}`;
  return `á ${Math.round(days / 30)} měs.`;
};

export default function CalibrationPage() {
  const { user, hasPermission } = useAuthContext();
  const tenantId = user?.tenantId ?? 'main_firm';
  const canEdit = hasPermission('asset.update');
  const navigate = useNavigate();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    assetService
      .getAll(tenantId)
      .then((a) => setAssets(a))
      .catch((err) => console.error('[Kalibrace] load error:', err))
      .finally(() => setLoading(false));
  }, [tenantId]);
  useEffect(() => { load(); }, [load]);

  const units = useMemo(() => assets.filter(isInstrument), [assets]);
  const stats = useMemo(() => {
    let ok = 0, warn = 0, crit = 0, none = 0;
    for (const u of units) {
      const t = calibTone(calibEvent(u));
      if (t === 'ok') ok++; else if (t === 'warn') warn++; else if (t === 'crit') crit++; else none++;
    }
    return { total: units.length, ok, warn, crit, none };
  }, [units]);

  const persist = async (asset: Asset, events: AssetEvent[], msg: string) => {
    setSaving(asset.id);
    try {
      await assetService.update(tenantId, asset.id, { events });
      load();
      showToast(msg, 'success');
    } catch (err) {
      console.error('[Kalibrace] save error:', err);
      showToast('Uložení selhalo', 'error');
    } finally {
      setSaving(null);
    }
  };

  const markCalibrated = (asset: Asset, ev: AssetEvent) => {
    const events = (asset.events ?? []).map((e) =>
      e.id === ev.id
        ? { ...e, lastDate: todayIso(), nextDate: addDaysIso(e.frequencyDays || CALIB_INTERVAL_DAYS) }
        : e,
    );
    persist(asset, events, 'Kalibrace zapsána');
  };

  const setupCalibration = (asset: Asset) => {
    const events = asset.events ?? [];
    const next: AssetEvent[] = [
      ...events,
      { id: newId(), name: 'Kalibrace', eventType: 'calibration', frequencyDays: CALIB_INTERVAL_DAYS, nextDate: addDaysIso(CALIB_INTERVAL_DAYS) },
    ];
    persist(asset, next, 'Kalibrace nastavena');
  };

  return (
    <div className="px-4 py-6 md:px-8 max-w-6xl mx-auto pb-24">
      <div className="flex items-center gap-3 mb-5">
        <button type="button" onClick={() => navigate(-1)} className="min-h-11 min-w-11 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-slate-700">
          <ArrowLeft size={20} />
        </button>
        <Ruler className="text-emerald-700 flex-shrink-0" size={24} />
        <div className="min-w-0">
          <h1 className="text-xl font-black text-slate-900">Kalibrace měřidel</h1>
          <p className="text-[13px] text-slate-500">Platnost kalibrací a hlídání propadnutí (pro audit).</p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap mb-5">
        <div className="flex-1 min-w-[74px] rounded-xl border border-slate-200 bg-white px-3 py-2"><div className="text-lg font-black text-slate-900">{stats.total}</div><div className="text-[11px] text-slate-500">měřidel</div></div>
        <div className="flex-1 min-w-[74px] rounded-xl bg-green-50 px-3 py-2"><div className="text-lg font-black text-green-700">{stats.ok}</div><div className="text-[11px] text-green-700">platných</div></div>
        <div className="flex-1 min-w-[74px] rounded-xl bg-amber-50 px-3 py-2"><div className="text-lg font-black text-amber-700">{stats.warn}</div><div className="text-[11px] text-amber-700">blíží se</div></div>
        <div className="flex-1 min-w-[74px] rounded-xl bg-red-50 px-3 py-2"><div className="text-lg font-black text-red-700">{stats.crit}</div><div className="text-[11px] text-red-700">propadlých</div></div>
        {stats.none > 0 && <div className="flex-1 min-w-[74px] rounded-xl bg-slate-50 px-3 py-2"><div className="text-lg font-black text-slate-500">{stats.none}</div><div className="text-[11px] text-slate-500">bez kalibrace</div></div>}
      </div>

      <div className="flex items-center justify-between gap-2 mb-3">
        <p className="text-sm font-semibold text-slate-600">Měřidla a platnost jejich kalibrace.</p>
        {canEdit && (
          <button type="button" onClick={() => navigate('/kartoteka')} className="flex items-center gap-1.5 text-sm font-bold text-emerald-700">
            <Plus size={16} /> přidat měřidlo
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500 py-10 justify-center"><Loader2 className="animate-spin" size={18} /> Načítám měřidla…</div>
      ) : units.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600">
          Zatím tu nejsou měřidla. Přidej v kartotéce zařízení (typ „Měřidlo" nebo název „Teploměr / Váha / Vlhkoměr…") a objeví se tady.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {units.map((unit) => {
            const ev = calibEvent(unit);
            const tone = calibTone(ev);
            const place = [unit.buildingId ? `Budova ${unit.buildingId}` : '', unit.areaName || unit.location, unit.code]
              .filter(Boolean)
              .join(' · ');
            return (
              <div key={unit.id} className="rounded-2xl border border-slate-200 bg-white p-4" style={{ borderLeft: `3px solid ${TONE[tone].dot}` }}>
                <button type="button" onClick={() => navigate(`/asset/${unit.id}`)} className="block text-left text-[15px] font-black text-slate-900 truncate hover:text-emerald-700 w-full">{unit.name}</button>
                <div className="text-xs text-slate-500 truncate mb-2">{place}{ev?.frequencyDays ? ` · Kalibrace ${intervalLabel(ev.frequencyDays)}` : ''}</div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-md" style={{ background: TONE[tone].soft, color: TONE[tone].text }}>{calibLabel(ev)}</span>
                  {ev && <span className="text-[11px] text-slate-400 flex items-center gap-1 ml-auto"><Paperclip size={12} /> certifikát</span>}
                </div>

                {canEdit && (
                  ev ? (
                    <button type="button" disabled={saving === unit.id} onClick={() => markCalibrated(unit, ev)} className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] font-bold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2">
                      <Check size={15} /> zapsat kalibraci
                    </button>
                  ) : (
                    <button type="button" disabled={saving === unit.id} onClick={() => setupCalibration(unit)} className="mt-3 w-full rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-[13px] font-bold text-emerald-700 disabled:opacity-50">
                      Nastavit kalibraci (á 1 rok)
                    </button>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-5 text-[12px] text-slate-400">Další krok: nahrát ke kalibraci certifikát (PDF/foto). Zatím se hlídá interval a platnost.</p>
    </div>
  );
}
