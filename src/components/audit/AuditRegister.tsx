// src/components/audit/AuditRegister.tsx
// VIKRR — Asset Shield — Sdílený „audit registr". Jeden motor pro registry, kde se hlídají
// periodické kontroly/testy na zařízeních (sklo a křehký plast, detektory cizích těles, …).
// Položka = zařízení z kartotéky (rozpozná `detect`). Kontroly = asset.events (interval + termín)
// se stavem v pořádku / blíží se / po termínu. „Nastavit" naseeduje konfigurované akce.
// Žádný nový datový model, žádná změna pravidel — stejný motor jako Klimatizace a Kalibrace.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Check, Plus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuthContext } from '../../context/AuthContext';
import { assetService } from '../../services/assetService';
import { showToast } from '../ui/Toast';
import type { Asset, AssetEvent } from '../../types/asset';

export interface RegisterEventDef { name: string; eventType: string; frequencyDays: number }
export interface AuditRegisterConfig {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  itemNoun: string;          // „prvek", „detektor"
  emptyHint: string;         // text prázdného stavu
  events: RegisterEventDef[]; // co se na položce hlídá (a seeduje)
  doneLabel?: string;        // text potvrzovacího tlačítka (default „zapsat provedení")
}

type Tone = 'ok' | 'warn' | 'crit' | 'none';
const RANK: Record<Tone, number> = { none: 0, ok: 1, warn: 2, crit: 3 };
const TONE: Record<Tone, { dot: string; text: string; soft: string }> = {
  ok: { dot: '#22c55e', text: '#16a34a', soft: '#dcfce7' },
  warn: { dot: '#eab308', text: '#d97706', soft: '#fef3c7' },
  crit: { dot: '#ef4444', text: '#dc2626', soft: '#fee2e2' },
  none: { dot: '#cbd5e1', text: '#64748b', soft: '#f1f5f9' },
};

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
export const auditNorm = (s: unknown) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const intervalLabel = (days?: number): string => {
  if (!days) return '';
  if (days >= 365) { const y = Math.round(days / 365); return `á ${y} rok${y > 1 ? 'y' : ''}`; }
  if (days >= 30) return `á ${Math.round(days / 30)} měs.`;
  return `á ${days} dní`;
};
const eventTone = (e: AssetEvent): Tone => {
  const d = daysUntil(e.nextDate);
  if (d == null) return 'none';
  if (d < 0) return 'crit';
  if (d <= 30) return 'warn';
  return 'ok';
};
const eventLabel = (e: AssetEvent): string => {
  const d = daysUntil(e.nextDate);
  if (d == null) return 'termín nezadán';
  if (d < 0) return `po termínu (${fmtCz(e.nextDate)})`;
  return `příště ${fmtCz(e.nextDate)}`;
};

export default function AuditRegister({ config, detect }: { config: AuditRegisterConfig; detect: (a: Asset) => boolean }) {
  const { user, hasPermission } = useAuthContext();
  const tenantId = user?.tenantId ?? 'main_firm';
  const canEdit = hasPermission('asset.update');
  const navigate = useNavigate();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const configNames = useMemo(() => config.events.map((e) => auditNorm(e.name)), [config.events]);
  const configTypes = useMemo(() => config.events.map((e) => auditNorm(e.eventType)), [config.events]);

  const load = useCallback(() => {
    setLoading(true);
    assetService
      .getAll(tenantId)
      .then((a) => setAssets(a))
      .catch((err) => console.error('[AuditRegister] load error:', err))
      .finally(() => setLoading(false));
  }, [tenantId]);
  useEffect(() => { load(); }, [load]);

  const units = useMemo(() => assets.filter(detect), [assets, detect]);
  const registerEvents = useCallback(
    (a: Asset): AssetEvent[] =>
      (a.events ?? []).filter((e) => configTypes.includes(auditNorm(e.eventType)) || configNames.includes(auditNorm(e.name))),
    [configTypes, configNames],
  );
  const unitTone = useCallback(
    (a: Asset): Tone => registerEvents(a).reduce<Tone>((acc, e) => (RANK[eventTone(e)] > RANK[acc] ? eventTone(e) : acc), 'none'),
    [registerEvents],
  );

  const stats = useMemo(() => {
    let ok = 0, warn = 0, crit = 0, none = 0;
    for (const u of units) {
      const t = unitTone(u);
      if (t === 'ok') ok++; else if (t === 'warn') warn++; else if (t === 'crit') crit++; else none++;
    }
    return { total: units.length, ok, warn, crit, none };
  }, [units, unitTone]);

  const persist = async (asset: Asset, events: AssetEvent[], msg: string) => {
    setSaving(asset.id);
    try {
      await assetService.update(tenantId, asset.id, { events });
      load();
      showToast(msg, 'success');
    } catch (err) {
      console.error('[AuditRegister] save error:', err);
      showToast('Uložení selhalo', 'error');
    } finally {
      setSaving(null);
    }
  };

  const markDone = (asset: Asset, ev: AssetEvent) => {
    const def = config.events.find((d) => auditNorm(d.eventType) === auditNorm(ev.eventType) || auditNorm(d.name) === auditNorm(ev.name));
    const freq = ev.frequencyDays || def?.frequencyDays || 365;
    const events = (asset.events ?? []).map((e) => (e.id === ev.id ? { ...e, lastDate: todayIso(), nextDate: addDaysIso(freq) } : e));
    persist(asset, events, `${ev.name}: zapsáno`);
  };

  const setupEvents = (asset: Asset) => {
    const existing = asset.events ?? [];
    const toAdd: AssetEvent[] = config.events
      .filter((d) => !existing.some((e) => auditNorm(e.eventType) === auditNorm(d.eventType) || auditNorm(e.name) === auditNorm(d.name)))
      .map((d) => ({ id: newId(), name: d.name, eventType: d.eventType, frequencyDays: d.frequencyDays, nextDate: addDaysIso(d.frequencyDays) }));
    persist(asset, [...existing, ...toAdd], 'Hlídání nastaveno');
  };

  const Icon = config.icon;
  const doneLabel = config.doneLabel ?? 'zapsat provedení';

  return (
    <div className="px-4 py-6 md:px-8 max-w-6xl mx-auto pb-24">
      <div className="flex items-center gap-3 mb-5">
        <button type="button" onClick={() => navigate(-1)} className="min-h-11 min-w-11 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-slate-700">
          <ArrowLeft size={20} />
        </button>
        <Icon className="text-emerald-700 flex-shrink-0" size={24} />
        <div className="min-w-0">
          <h1 className="text-xl font-black text-slate-900">{config.title}</h1>
          <p className="text-[13px] text-slate-500">{config.subtitle}</p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap mb-5">
        <div className="flex-1 min-w-[74px] rounded-xl border border-slate-200 bg-white px-3 py-2"><div className="text-lg font-black text-slate-900">{stats.total}</div><div className="text-[11px] text-slate-500">celkem</div></div>
        <div className="flex-1 min-w-[74px] rounded-xl bg-green-50 px-3 py-2"><div className="text-lg font-black text-green-700">{stats.ok}</div><div className="text-[11px] text-green-700">v pořádku</div></div>
        <div className="flex-1 min-w-[74px] rounded-xl bg-amber-50 px-3 py-2"><div className="text-lg font-black text-amber-700">{stats.warn}</div><div className="text-[11px] text-amber-700">blíží se</div></div>
        <div className="flex-1 min-w-[74px] rounded-xl bg-red-50 px-3 py-2"><div className="text-lg font-black text-red-700">{stats.crit}</div><div className="text-[11px] text-red-700">po termínu</div></div>
        {stats.none > 0 && <div className="flex-1 min-w-[74px] rounded-xl bg-slate-50 px-3 py-2"><div className="text-lg font-black text-slate-500">{stats.none}</div><div className="text-[11px] text-slate-500">bez hlídání</div></div>}
      </div>

      <div className="flex items-center justify-between gap-2 mb-3">
        <p className="text-sm font-semibold text-slate-600">Položky a jejich kontroly.</p>
        {canEdit && (
          <button type="button" onClick={() => navigate('/kartoteka')} className="flex items-center gap-1.5 text-sm font-bold text-emerald-700">
            <Plus size={16} /> přidat {config.itemNoun}
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500 py-10 justify-center"><Loader2 className="animate-spin" size={18} /> Načítám…</div>
      ) : units.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600">{config.emptyHint}</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {units.map((unit) => {
            const evs = registerEvents(unit);
            const place = [unit.buildingId ? `Budova ${unit.buildingId}` : '', unit.areaName || unit.location, unit.code].filter(Boolean).join(' · ');
            const worst = unitTone(unit);
            return (
              <div key={unit.id} className="rounded-2xl border border-slate-200 bg-white p-4" style={{ borderLeft: `3px solid ${TONE[worst].dot}` }}>
                <button type="button" onClick={() => navigate(`/asset/${unit.id}`)} className="block text-left text-[15px] font-black text-slate-900 truncate hover:text-emerald-700 w-full">{unit.name}</button>
                {place && <div className="text-xs text-slate-500 truncate mb-1">{place}</div>}

                {evs.length === 0 ? (
                  <div className="mt-2">
                    <p className="text-[13px] text-slate-500 mb-2">Hlídání zatím není nastavené.</p>
                    {canEdit && (
                      <button type="button" disabled={saving === unit.id} onClick={() => setupEvents(unit)} className="w-full rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-[13px] font-bold text-emerald-700 disabled:opacity-50">
                        Nastavit hlídání ({config.events.map((e) => e.name.toLowerCase()).join(' · ')})
                      </button>
                    )}
                  </div>
                ) : (
                  <div>
                    {evs.map((ev) => {
                      const tone = eventTone(ev);
                      return (
                        <div key={ev.id} className="flex items-center gap-2 py-2 border-t border-slate-100">
                          <span className="flex-1 min-w-0 text-[13px] text-slate-800 truncate">
                            {ev.name}
                            {ev.frequencyDays ? <span className="text-slate-400"> · {intervalLabel(ev.frequencyDays)}</span> : null}
                          </span>
                          <span className="text-[11px] font-bold flex-shrink-0 px-2 py-0.5 rounded-md" style={{ background: TONE[tone].soft, color: TONE[tone].text }}>{eventLabel(ev)}</span>
                          {canEdit && (
                            <button type="button" disabled={saving === unit.id} onClick={() => markDone(unit, ev)} title={doneLabel} className="flex-shrink-0 w-8 h-8 rounded-lg bg-slate-100 hover:bg-emerald-100 text-slate-500 hover:text-emerald-700 flex items-center justify-center disabled:opacity-50">
                              <Check size={15} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-5 text-[12px] text-slate-400">Stav: zelená = v pořádku, oranžová = blíží se termín, červená = po termínu (auditor uvidí). „{doneLabel}" posune termín o interval dál.</p>
    </div>
  );
}
