// src/components/hvac/KlimatizaceSection.tsx
// VIKRR — Asset Shield — Záložka „Klimatizace" ve Vzduchotechnice.
// Klimatizace = zařízení z kartotéky (název obsahuje „klimatiz"). Údržba přes asset.events
// (čištění, servis, kontrola chladiva/F-plyn) s termíny a tlačítkem „hotovo". Žádný nový datový model.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Snowflake, Loader2, Check, Plus, Sparkles, Wrench, Droplet, CalendarClock } from 'lucide-react';
import { useAuthContext } from '../../context/AuthContext';
import { assetService } from '../../services/assetService';
import { showToast } from '../ui/Toast';
import { addWorkLog } from '../../services/workLogService';
import LogWorkSheet, { type WorkEntry } from '../audit/LogWorkSheet';
import type { Asset, AssetEvent } from '../../types/asset';

type Tone = 'ok' | 'warn' | 'crit' | 'none';
const TONE: Record<Tone, { dot: string; text: string; soft: string }> = {
  ok: { dot: '#22c55e', text: '#16a34a', soft: '#dcfce7' },
  warn: { dot: '#eab308', text: '#d97706', soft: '#fef3c7' },
  crit: { dot: '#ef4444', text: '#dc2626', soft: '#fee2e2' },
  none: { dot: '#cbd5e1', text: '#64748b', soft: '#f1f5f9' },
};

const DEFAULTS: { name: string; eventType: string; frequencyDays: number }[] = [
  { name: 'Čištění', eventType: 'cleaning', frequencyDays: 90 },
  { name: 'Servis', eventType: 'service', frequencyDays: 365 },
  { name: 'Kontrola chladiva (F-plyn)', eventType: 'refrigerant', frequencyDays: 365 },
];

const newId = (): string => {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  return 'evt_' + (g.crypto?.randomUUID ? g.crypto.randomUUID() : Math.random().toString(36).slice(2));
};
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
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' });
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
  if (d < 0) return 'po termínu';
  return `příště ${fmtCz(e.nextDate)}`;
};
const eventIcon = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes('čišt') || n.includes('cist')) return Sparkles;
  if (n.includes('chladiv') || n.includes('plyn') || n.includes('f-')) return Droplet;
  if (n.includes('servis')) return Wrench;
  return CalendarClock;
};

const isAcUnit = (a: Asset): boolean =>
  `${a.name || ''} ${a.entityType || ''} ${a.category || ''} ${a.code || ''}`.toLowerCase().includes('klimatiz');

export default function KlimatizaceSection() {
  const { user, hasPermission } = useAuthContext();
  const tenantId = user?.tenantId ?? 'main_firm';
  const canEdit = hasPermission('hvac.manage') || hasPermission('asset.update');
  const navigate = useNavigate();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [pending, setPending] = useState<{ asset: Asset; ev: AssetEvent } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    assetService
      .getAll(tenantId)
      .then((a) => setAssets(a))
      .catch((err) => console.error('[Klimatizace] load error:', err))
      .finally(() => setLoading(false));
  }, [tenantId]);
  useEffect(() => { load(); }, [load]);

  const units = useMemo(() => assets.filter(isAcUnit), [assets]);

  const persist = async (asset: Asset, events: AssetEvent[], msg: string) => {
    setSaving(asset.id);
    try {
      await assetService.update(tenantId, asset.id, { events });
      load();
      showToast(msg, 'success');
    } catch (err) {
      console.error('[Klimatizace] save error:', err);
      showToast('Uložení selhalo', 'error');
    } finally {
      setSaving(null);
    }
  };

  const markDone = (asset: Asset, ev: AssetEvent) => setPending({ asset, ev });

  const confirmLog = async (entry: WorkEntry) => {
    if (!pending) return;
    const { asset, ev } = pending;
    const freq = ev.frequencyDays || 365;
    const performed = new Date(entry.performedAt);
    const next = new Date(performed);
    next.setDate(next.getDate() + freq);
    setSaving(asset.id);
    try {
      await addWorkLog({
        userId: user?.id || user?.uid || 'unknown',
        userName: user?.displayName || 'Neznámý',
        workerNames: entry.worker ? [entry.worker] : undefined,
        type: 'maintenance',
        workType: ev.name,
        content: entry.content || `${ev.name} – provedeno`,
        assetId: asset.id,
        assetName: asset.name,
        location: [asset.buildingId ? `Budova ${asset.buildingId}` : '', asset.areaName || asset.location].filter(Boolean).join(' · ') || undefined,
        performedAt: performed,
        auditReady: true,
      });
      const events = (asset.events ?? []).map((e) => (e.id === ev.id ? { ...e, lastDate: entry.performedAt, nextDate: next.toISOString().slice(0, 10) } : e));
      await assetService.update(tenantId, asset.id, { events });
      load();
      showToast('Zapsáno do deníku', 'success');
      setPending(null);
    } catch (err) {
      console.error('[Klimatizace] log error:', err);
      showToast('Uložení selhalo', 'error');
    } finally {
      setSaving(null);
    }
  };

  const seedMaintenance = (asset: Asset) => {
    const existing = asset.events ?? [];
    const toAdd: AssetEvent[] = DEFAULTS.filter(
      (d) => !existing.some((e) => (e.name || '').toLowerCase() === d.name.toLowerCase()),
    ).map((d) => ({ id: newId(), name: d.name, eventType: d.eventType, frequencyDays: d.frequencyDays, nextDate: addDaysIso(d.frequencyDays) }));
    persist(asset, [...existing, ...toAdd], 'Údržba klimatizace nastavena');
  };

  if (loading) {
    return <div className="flex items-center gap-2 text-slate-500 py-10 justify-center"><Loader2 className="animate-spin" size={18} /> Načítám klimatizace…</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-600">Klimatizace a jejich údržba (čištění, servis, kontrola chladiva).</p>
        {canEdit && (
          <button type="button" onClick={() => navigate('/kartoteka')} className="flex items-center gap-1.5 text-sm font-bold text-emerald-700">
            <Plus size={16} /> přidat klimatizaci
          </button>
        )}
      </div>

      {units.length === 0 ? (
        <div className="card-b p-8 text-center text-slate-600">
          Zatím tu není žádná klimatizace. Přidej v kartotéce zařízení s názvem obsahujícím „Klimatizace" a objeví se tady.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {units.map((unit) => {
            const events = unit.events ?? [];
            const worst: Tone = events.reduce<Tone>((acc, e) => {
              const t = eventTone(e);
              const rank: Record<Tone, number> = { none: 0, ok: 1, warn: 2, crit: 3 };
              return rank[t] > rank[acc] ? t : acc;
            }, 'ok');
            const place = [unit.buildingId ? `Budova ${unit.buildingId}` : '', unit.areaName || unit.location, unit.code]
              .filter(Boolean)
              .join(' · ');
            return (
              <div key={unit.id} className="rounded-2xl border border-slate-200 bg-white p-4" style={{ borderLeft: `3px solid ${TONE[worst].dot}` }}>
                <div className="flex items-center gap-2 mb-2">
                  <Snowflake className="text-sky-600 flex-shrink-0" size={20} />
                  <div className="min-w-0">
                    <button type="button" onClick={() => navigate(`/asset/${unit.id}`)} className="block text-left text-[15px] font-black text-slate-900 truncate hover:text-emerald-700">{unit.name}</button>
                    {place && <div className="text-xs text-slate-500 truncate">{place}</div>}
                  </div>
                </div>

                {events.length === 0 ? (
                  <div className="mt-2">
                    <p className="text-[13px] text-slate-500 mb-2">Údržba zatím není nastavená.</p>
                    {canEdit && (
                      <button type="button" disabled={saving === unit.id} onClick={() => seedMaintenance(unit)} className="w-full rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-[13px] font-bold text-emerald-700 disabled:opacity-50">
                        Nastavit údržbu (čištění · servis · chladivo)
                      </button>
                    )}
                  </div>
                ) : (
                  <div>
                    {events.map((ev) => {
                      const tone = eventTone(ev);
                      const Icon = eventIcon(ev.name || '');
                      return (
                        <div key={ev.id} className="flex items-center gap-2 py-2 border-t border-slate-100">
                          <Icon size={16} className="text-slate-500 flex-shrink-0" />
                          <span className="flex-1 min-w-0 text-[13px] text-slate-800 truncate">
                            {ev.name}
                            {ev.frequencyDays ? <span className="text-slate-400"> · á {ev.frequencyDays >= 365 ? `${Math.round(ev.frequencyDays / 365)} r.` : `${Math.round(ev.frequencyDays / 30)} měs.`}</span> : null}
                          </span>
                          <span className="text-[11px] font-bold flex-shrink-0 px-2 py-0.5 rounded-md" style={{ background: TONE[tone].soft, color: TONE[tone].text }}>{eventLabel(ev)}</span>
                          {canEdit && (
                            <button type="button" disabled={saving === unit.id} onClick={() => markDone(unit, ev)} title="Zapsat jako provedené" className="flex-shrink-0 w-7 h-7 rounded-lg bg-slate-100 hover:bg-emerald-100 text-slate-500 hover:text-emerald-700 flex items-center justify-center disabled:opacity-50">
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

      {pending && (
        <LogWorkSheet
          subtitle={`${pending.ev.name} · ${pending.asset.name}`}
          defaultWorker={user?.displayName || ''}
          saving={saving === pending.asset.id}
          onClose={() => setPending(null)}
          onSubmit={confirmLog}
        />
      )}
    </div>
  );
}
