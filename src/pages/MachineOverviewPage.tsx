// src/pages/MachineOverviewPage.tsx
// VIKRR — Asset Shield — „Přehled strojů" (velín). Karty strojů s monitoringem (kondice %, stav, veličiny).
// Čte stroje z kartotéky (assety s komponentami) a počítá stav z src/types/monitoring.ts. Pouze čtení.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gauge, Plus, Loader2 } from 'lucide-react';
import { useAuthContext } from '../context/AuthContext';
import { assetService } from '../services/assetService';
import type { Asset } from '../types/asset';
import {
  MONITORING_STATUS_CONFIG,
  type MonitoringStatus,
  machineMonitoringStatus,
  machineCondition,
  conditionTone,
  allParams,
  paramStatus,
} from '../types/monitoring';
import { isLineAsset } from '../lib/lines';
import StrojeLinkyTabs from '../components/StrojeLinkyTabs';

const TONE: Record<MonitoringStatus, { dot: string; text: string; soft: string; border: string }> = {
  ok: { dot: '#22c55e', text: '#16a34a', soft: '#f0fdf4', border: '#bbf7d0' },
  warn: { dot: '#eab308', text: '#d97706', soft: '#fffbeb', border: '#fde68a' },
  crit: { dot: '#ef4444', text: '#dc2626', soft: '#fef2f2', border: '#fecaca' },
};
const RANK: Record<MonitoringStatus, number> = { ok: 0, warn: 1, crit: 2 };

const fmt = (v: number): string => {
  const r = Math.round(v * 100) / 100;
  return Number.isInteger(r) ? String(r) : String(r).replace('.', ',');
};

function daysSinceLastRepair(a: Asset): number | null {
  const dates = (a.repairLog ?? []).map((r) => r.date).filter(Boolean).sort();
  if (!dates.length) return null;
  const last = new Date(dates[dates.length - 1]);
  if (Number.isNaN(last.getTime())) return null;
  const diff = Math.floor((Date.now() - last.getTime()) / 86400000);
  return diff >= 0 ? diff : null;
}

const STATUS_KPI: { key: MonitoringStatus; label: string; hint: string }[] = [
  { key: 'ok', label: 'V provozu', hint: 'stabilní, v limitu' },
  { key: 'warn', label: 'Sledovat', hint: 'blízko limitu' },
  { key: 'crit', label: 'Mimo limit', hint: 'vyžaduje zásah' },
];

export default function MachineOverviewPage() {
  const { user, hasPermission } = useAuthContext();
  const tenantId = user?.tenantId ?? 'main_firm';
  const navigate = useNavigate();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    assetService
      .getAll(tenantId)
      .then((all) => { if (alive) setAssets(all); })
      .catch((err) => console.error('[Velín] load error:', err))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [tenantId]);

  const machines = useMemo(() => assets.filter((a) => (a.components?.length ?? 0) > 0 && !isLineAsset(a)), [assets]);

  const counts = useMemo(() => {
    const c: Record<MonitoringStatus, number> = { ok: 0, warn: 0, crit: 0 };
    let comps = 0;
    for (const m of machines) {
      c[machineMonitoringStatus(m.components)] += 1;
      comps += m.components?.length ?? 0;
    }
    return { ...c, comps, total: machines.length };
  }, [machines]);

  return (
    <div className="px-4 py-6 md:px-8 max-w-6xl mx-auto">
      <StrojeLinkyTabs active="stroje" />
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <Gauge className="text-emerald-700" size={26} />
          <div>
            <h1 className="text-xl font-black text-slate-900">Přehled strojů</h1>
            <p className="text-[13px] text-slate-500">Provozní stav strojů — kondice, stav a hlídané veličiny. Klikni na stroj pro skladbu a nastavení.</p>
          </div>
        </div>
        {hasPermission('asset.create') && (
          <button
            type="button"
            onClick={() => navigate('/kartoteka')}
            className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-[13px] font-bold text-white hover:bg-slate-800 transition flex-shrink-0"
          >
            <Plus size={16} /> Přidat stroj
          </button>
        )}
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {STATUS_KPI.map((k) => (
          <div key={k.key} className="rounded-2xl border border-[#e2d8c9] bg-white p-4">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide" style={{ color: TONE[k.key].text }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: TONE[k.key].dot }} />
              {k.label}
            </div>
            <div className="mt-1 text-3xl font-black text-slate-900">{counts[k.key]}</div>
            <div className="text-[12px] text-slate-400">{k.hint}</div>
          </div>
        ))}
        <div className="rounded-2xl border border-[#e2d8c9] bg-white p-4">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#64748b' }} />
            Strojů celkem
          </div>
          <div className="mt-1 text-3xl font-black text-slate-900">{counts.total}</div>
          <div className="text-[12px] text-slate-400">{counts.comps} komponent</div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 py-12 justify-center">
          <Loader2 className="animate-spin" size={18} /> Načítám stroje…
        </div>
      ) : machines.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#cdbfa8] bg-white/60 p-8 text-center">
          <div className="text-slate-700 font-semibold mb-1">Zatím žádné monitorované stroje</div>
          <div className="text-[13px] text-slate-500 mb-4">Otevři stroj v kartotéce, přidej mu komponenty a hlídané veličiny — objeví se tady.</div>
          <button type="button" onClick={() => navigate('/kartoteka')} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-[13px] font-bold text-white hover:bg-emerald-700 transition">
            Do kartotéky
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {machines.map((m) => {
            const status = machineMonitoringStatus(m.components);
            const cond = machineCondition(m.components);
            const condTone = conditionTone(cond);
            const days = daysSinceLastRepair(m);
            const measured = allParams(m.components)
              .filter((p) => p.value != null)
              .sort((a, b) => RANK[paramStatus(b)] - RANK[paramStatus(a)]);
            const chips = measured.slice(0, 6);
            const extra = measured.length - chips.length;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => navigate(`/asset/${m.id}`)}
                className="text-left rounded-2xl border bg-white p-5 transition hover:shadow-md"
                style={{ borderColor: '#eef2f7', borderLeft: `4px solid ${TONE[status].dot}` }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[17px] font-black text-slate-900 truncate">{m.name}</div>
                    <div className="text-[12px] text-slate-500 truncate">
                      {[m.entityType || m.category, m.location].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <span className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-bold flex-shrink-0" style={{ background: TONE[status].soft, color: TONE[status].text }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: TONE[status].dot }} />
                    {MONITORING_STATUS_CONFIG[status].label}
                  </span>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-slate-400">
                    <span>Kondice stroje</span>
                    <span style={{ color: TONE[condTone].text }}>{cond} %</span>
                  </div>
                  <div className="mt-1.5 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div style={{ width: `${cond}%`, height: '100%', background: TONE[condTone].dot }} />
                  </div>
                </div>

                {days != null && (
                  <div className="mt-3 rounded-xl px-3 py-2 text-[13px] font-semibold" style={{ background: TONE[status].soft, color: TONE[status].text }}>
                    {days} dní bez poruchy
                  </div>
                )}

                {chips.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {chips.map((p) => {
                      const s = paramStatus(p);
                      return (
                        <span key={p.id} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 border border-slate-200 px-2 py-1 text-[12px]">
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: TONE[s].dot }} />
                          <span className="text-slate-500">{p.label}</span>
                          <span className="font-bold text-slate-800" style={{ fontFamily: 'monospace' }}>{fmt(p.value as number)} {p.unit}</span>
                        </span>
                      );
                    })}
                    {extra > 0 && <span className="inline-flex items-center rounded-lg bg-slate-100 px-2 py-1 text-[12px] text-slate-500">+{extra} další</span>}
                  </div>
                )}

                {(m.components?.length ?? 0) > 0 && (
                  <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 pt-3 border-t border-slate-100">
                    {(m.components ?? []).map((comp) => {
                      const cs = allParams([comp]).reduce<MonitoringStatus>((acc, p) => {
                        const s = paramStatus(p);
                        return RANK[s] > RANK[acc] ? s : acc;
                      }, 'ok');
                      return (
                        <span key={comp.id} className="inline-flex items-center gap-1.5 text-[12px] text-slate-600">
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: TONE[cs].dot }} />
                          {comp.name}
                        </span>
                      );
                    })}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
