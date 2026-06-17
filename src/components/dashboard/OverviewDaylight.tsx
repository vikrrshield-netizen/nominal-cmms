// src/components/dashboard/OverviewDaylight.tsx
// Přehled „Denní provoz" (směr B) — KLIDNÁ verze: 4 KPI + 2 sloupce
// (vlevo „Dnes řešit" prioritní fronta, vpravo stav strojů + sloučená upozornění).
// Méně dlaždic, větší písmo, víc vzduchu. Pouze prezentace dat (žádná logika/auth) — data v props.

import type { ReactNode } from 'react';
import { AlertTriangle, ClipboardList, Activity, Package, ChevronRight } from 'lucide-react';

export interface OverviewTask {
  id: string;
  title: string;
  priority: string; // P1..P4
  asset?: string;
  assigneeInitial?: string | null;
}
export interface OverviewMember {
  name: string;
  initial: string;
  off?: boolean;
}
export interface OverviewRevision {
  label: string;
  due: string;
  status: 'valid' | 'expiring' | 'expired';
}
export interface OverviewStockItem {
  name: string;
  qty: number;
  min: number;
}

export interface OverviewDaylightProps {
  alarmCount: number;
  alarmDetail: string;
  kpi: {
    openTasks: number; p1: number; p2: number;
    operational: number; total: number; breakdown: number;
    revisionsSoon: number; lowStock: number;
  };
  priorityTasks: OverviewTask[];
  machineStatus: { operational: number; maintenance: number; breakdown: number };
  team?: OverviewMember[];
  revisions: OverviewRevision[];
  lowStockItems: OverviewStockItem[];
  gearbox?: { installed: number; stock: number; service: number };
  onNavigate: (path: string) => void;
  onResolveAlarm: () => void;
  quickActions?: ReactNode;   // ponecháno kvůli kompatibilitě volání (nepoužito v klidné verzi)
}

const PRI = {
  P1: { fg: 'text-red-700', bg: 'bg-red-50' },
  P2: { fg: 'text-amber-700', bg: 'bg-amber-50' },
  P3: { fg: 'text-blue-700', bg: 'bg-blue-50' },
  P4: { fg: 'text-slate-600', bg: 'bg-slate-100' },
} as const;

function Donut({ operational, maintenance, breakdown }: { operational: number; maintenance: number; breakdown: number }) {
  const total = Math.max(1, operational + maintenance + breakdown);
  const r = 36, cx = 46, circ = 2 * Math.PI * r;
  const segs: [string, number][] = [['#2e9e74', operational], ['#e8932b', maintenance], ['#d7503a', breakdown]];
  let off = 0;
  return (
    <svg width="92" height="92" viewBox="0 0 92 92" aria-hidden="true">
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="#efe9de" strokeWidth="11" />
      {segs.map(([col, v], i) => {
        const len = (v / total) * circ;
        const el = (
          <circle key={i} cx={cx} cy={cx} r={r} fill="none" stroke={col} strokeWidth="11"
            strokeDasharray={`${len} ${circ - len}`} strokeDashoffset={-off}
            transform={`rotate(-90 ${cx} ${cx})`} strokeLinecap="round" />
        );
        off += len;
        return el;
      })}
      <text x={cx} y={cx - 1} textAnchor="middle" fontSize="22" fontWeight="800" fill="#1b2620">{operational + maintenance + breakdown}</text>
      <text x={cx} y={cx + 14} textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#97a096" letterSpacing="1">STROJŮ</text>
    </svg>
  );
}

const CARD = 'rounded-2xl border border-stone-200 bg-white p-5 shadow-sm shadow-stone-200/70';
const EYEBROW = 'text-[11px] font-bold uppercase tracking-wide text-slate-400';

export default function OverviewDaylight({
  alarmCount, alarmDetail, kpi, priorityTasks, machineStatus, revisions, lowStockItems,
  onNavigate, onResolveAlarm,
}: OverviewDaylightProps) {
  const kpiCards = [
    { label: 'Otevřené úkoly', value: kpi.openTasks, sub: `${kpi.p1}× P1 · ${kpi.p2}× P2`, icon: ClipboardList, box: 'bg-stone-100 text-slate-600', path: '/tasks' },
    { label: 'K řešení hned', value: kpi.p1, sub: 'havárie P1', icon: AlertTriangle, box: 'bg-red-50 text-red-600', path: '/tasks' },
    { label: 'Revize končí', value: kpi.revisionsSoon, sub: 'do 30 dní', icon: Activity, box: 'bg-amber-50 text-amber-700', path: '/revisions' },
    { label: 'Sklad pod min.', value: kpi.lowStock, sub: 'náhradní díly', icon: Package, box: 'bg-amber-50 text-amber-700', path: '/inventory' },
  ];

  return (
    <div className="space-y-4">
      {/* Pruh havárií (jen když nějaká je) */}
      {alarmCount > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50/70 px-4 py-3">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-700"><AlertTriangle className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-black text-red-700">{alarmCount}× havárie P1 čeká na řešení</div>
            {alarmDetail && <div className="truncate text-xs font-semibold text-slate-600">{alarmDetail}</div>}
          </div>
          <button onClick={onResolveAlarm} className="flex-shrink-0 rounded-xl bg-red-600 px-4 py-2 text-sm font-black text-white active:scale-[0.98]">Řešit teď</button>
        </div>
      )}

      {/* 4 KPI */}
      <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-4">
        {kpiCards.map((c) => (
          <button key={c.label} type="button" onClick={() => onNavigate(c.path)} className={`${CARD} text-left transition hover:border-emerald-200 hover:bg-emerald-50/30 active:scale-[0.98]`}>
            <div className="flex items-center justify-between">
              <span className={EYEBROW}>{c.label}</span>
              <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${c.box}`}><c.icon className="h-4 w-4" /></span>
            </div>
            <div className="mt-2 text-3xl font-black text-slate-950 leading-none">{c.value}</div>
            <div className="mt-1 text-[13px] font-semibold text-slate-400">{c.sub}</div>
          </button>
        ))}
      </div>

      {/* 2 sloupce: práce | stav+upozornění (přizpůsobí se ŠÍŘCE panelu přes @container) */}
      <div className="grid gap-4 @2xl:grid-cols-[1.7fr_1fr] @2xl:items-start">

        {/* Levý sloupec — Dnes řešit (prioritní fronta) */}
        <div className={CARD}>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-base font-black text-slate-950">Dnes řešit</span>
            <button type="button" onClick={() => onNavigate('/tasks')} className="flex items-center gap-1 text-xs font-bold text-emerald-700">Všechny úkoly <ChevronRight className="h-3.5 w-3.5" /></button>
          </div>
          {priorityTasks.length === 0 ? (
            <div className="py-10 text-center text-sm font-semibold text-slate-400">Žádné otevřené úkoly 🎉</div>
          ) : priorityTasks.map((t) => {
            const p = PRI[t.priority as keyof typeof PRI] || PRI.P4;
            return (
              <button key={t.id} type="button" onClick={() => onNavigate('/tasks')} className="flex w-full items-center gap-3 border-t border-stone-100 py-3 text-left first:border-t-0">
                <span className={`flex-shrink-0 rounded-md px-2 py-1 text-[11px] font-black ${p.bg} ${p.fg}`}>{t.priority}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900">{t.title}</span>
                  {t.asset && <span className="block truncate text-xs text-slate-400">{t.asset}</span>}
                </span>
                {t.assigneeInitial ? (
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-bold text-white">{t.assigneeInitial}</span>
                ) : (
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-stone-300" />
                )}
              </button>
            );
          })}
        </div>

        {/* Pravý sloupec — Stav strojů + Upozornění */}
        <div className="space-y-4">
          <div className={CARD}>
            <div className="mb-3 text-base font-black text-slate-950">Stav strojů</div>
            <div className="flex items-center gap-4">
              <Donut operational={machineStatus.operational} maintenance={machineStatus.maintenance} breakdown={machineStatus.breakdown} />
              <div className="flex-1 text-[13px]">
                {[['Provoz', machineStatus.operational, '#2e9e74'], ['Údržba', machineStatus.maintenance, '#e8932b'], ['Porucha', machineStatus.breakdown, '#d7503a']].map(([l, v, c]) => (
                  <div key={l as string} className="mb-1.5 flex items-center gap-2 last:mb-0">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: c as string }} />
                    <span className="flex-1 text-slate-600">{l}</span>
                    <b className="text-slate-900">{v}</b>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={CARD}>
            <div className="mb-1 text-base font-black text-slate-950">Upozornění</div>
            {revisions.length === 0 && lowStockItems.length === 0 ? (
              <div className="py-6 text-center text-sm font-semibold text-slate-400">Nic naléhavého 👍</div>
            ) : (
              <>
                {revisions.map((r, i) => (
                  <button key={`rev-${i}`} type="button" onClick={() => onNavigate('/revisions')} className="flex w-full items-center gap-2.5 border-t border-stone-100 py-2.5 text-left text-[13px] first:border-t-0">
                    <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${r.status === 'expired' ? 'bg-red-500' : r.status === 'expiring' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                    <span className="min-w-0 flex-1 truncate text-slate-700">{r.label}</span>
                    <b className={r.status === 'expired' ? 'text-red-600' : r.status === 'expiring' ? 'text-amber-700' : 'text-slate-500'}>{r.due}</b>
                  </button>
                ))}
                {lowStockItems.map((p, i) => (
                  <button key={`stk-${i}`} type="button" onClick={() => onNavigate('/inventory')} className="flex w-full items-center gap-2.5 border-t border-stone-100 py-2.5 text-left text-[13px] first:border-t-0">
                    <Package className={`h-4 w-4 flex-shrink-0 ${p.qty === 0 ? 'text-red-600' : 'text-amber-600'}`} />
                    <span className="min-w-0 flex-1 truncate text-slate-700">{p.name}</span>
                    <b className={p.qty === 0 ? 'text-red-600' : 'text-amber-700'}>{p.qty}/{p.min}</b>
                  </button>
                ))}
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
