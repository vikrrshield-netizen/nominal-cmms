// src/pages/DashboardPage.tsx
// VIKRR — Asset Shield — Dashboard (refactored: widget system)

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthContext } from '../context/AuthContext';
import { useFleet } from '../hooks/useFleet';
import { useInventory } from '../hooks/useInventory';
import { useRevisions } from '../hooks/useRevisions';
import { useInspections } from '../hooks/useInspections';
import { useDashboardConfig } from '../hooks/useDashboardConfig';
import {
  Settings, AlertTriangle, Bell, LogOut, Loader2, ClipboardCheck,
  Sparkles, Wrench, BarChart3,
  Clock, FileText, PlusCircle, Search, ShieldCheck, X, User, MapPin,
  Calendar, Building2, Package, Wind, Cog, Thermometer, Monitor, Factory, FlaskConical,
} from 'lucide-react';
import appConfig from '../appConfig';
import { DEFAULT_ENABLED_MODULES, MODULE_DEFINITIONS } from '../types/user';
import type { UserRole } from '../types/user';
import type { WidgetInstance } from '../types/dashboard';
import type { Asset } from '../types/asset';
import type { GearboxTemperatureLog } from '../types/gearbox';
import { getWidgetDef } from '../config/widgetRegistry';
import { SANDBOX_STATS, initSandboxMockData } from '../lib/sandboxDb';
import { showToast } from '../components/ui/Toast';
import type { VacationPlan, VacationPlanKind } from '../types/vacation';
import { assetService } from '../services/assetService';
import { getGearboxStatus, isGearboxAsset, setGearboxStockStatus } from '../services/gearboxService';

// Dashboard components
import FaultReportModal from '../components/dashboard/FaultReportModal';
import IdeaModal from '../components/dashboard/IdeaModal';
import RequestModal from '../components/dashboard/RequestModal';
import AiModal from '../components/dashboard/AiModal';
import GearboxProblemModal from '../components/gearbox/GearboxProblemModal';
import GearboxRepairModal from '../components/gearbox/GearboxRepairModal';

function asDate(value: any): Date | null {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  if (value instanceof Date) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isToday(value: any): boolean {
  const date = asDate(value);
  if (!date) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}

function isBeforeToday(value: any): boolean {
  const date = asDate(value);
  if (!date) return false;
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return date < todayStart;
}

function isDateInRange(date: Date, startValue: any, endValue: any): boolean {
  const start = asDate(startValue);
  const end = asDate(endValue);
  if (!start || !end) return false;
  const current = new Date(date);
  current.setHours(12, 0, 0, 0);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return current >= start && current <= end;
}

function isWithinNextDays(startValue: any, endValue: any, days: number): boolean {
  const start = asDate(startValue);
  const end = asDate(endValue);
  if (!start || !end) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const limit = new Date(today);
  limit.setDate(limit.getDate() + days);
  limit.setHours(23, 59, 59, 999);
  end.setHours(23, 59, 59, 999);
  return end >= today && start <= limit;
}

function formatVacationDate(value: any): string {
  const date = asDate(value);
  return date ? date.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' }) : '?';
}

function absenceKindLabel(kind?: VacationPlanKind): string {
  const labels: Record<VacationPlanKind, string> = {
    vacation: 'Dovolená',
    doctor: 'Lékař',
    sick: 'Nemoc',
    training: 'Školení',
    other: 'Ostatní',
  };
  return labels[kind || 'vacation'];
}

const DASH_PANEL = 'vik-card';
const DASH_PANEL_HOVER = 'hover:border-emerald-200 hover:bg-emerald-50/40 transition active:scale-[0.98]';
const DASH_ICON_BOX = 'w-10 h-10 rounded-xl bg-white border border-[var(--vik-border)] flex items-center justify-center flex-shrink-0';

// ═══════════════════════════════════════════════════════
// REMINDER STRIP — recurring tasks active today
// ═══════════════════════════════════════════════════════

interface RecurringTask { id: string; title: string; daysOfWeek: number[]; time: string; active: boolean; }

function useRecurringToday() {
  const [tasks, setTasks] = useState<RecurringTask[]>([]);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'recurring_tasks'), (snap) => {
      const today = new Date().getDay();
      setTasks(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as RecurringTask))
          .filter((t) => t.active && t.daysOfWeek?.includes(today))
          .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
      );
    });
    return () => unsub();
  }, []);
  return tasks;
}

function ReminderStrip({ tasks, onNavigate }: { tasks: RecurringTask[]; onNavigate: () => void }) {
  if (tasks.length === 0) return null;
  return (
    <div className="my-3">
      <div className="flex items-center justify-between mb-1.5 px-0.5">
        <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Dnešní rozvrh</span>
        <button onClick={onNavigate} className="text-[10px] text-orange-400 hover:underline font-semibold">Spravovat →</button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {tasks.map((t) => (
          <div
            key={t.id}
            className={`flex-shrink-0 w-[140px] ${DASH_PANEL} p-3 flex flex-col gap-1`}
          >
            <span className="text-[10px] text-amber-300 font-bold">{t.time}</span>
            <span className="text-xs font-semibold text-slate-950 leading-tight line-clamp-2">{t.title}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// AI TIP CARD — optimization tips based on stats
// ═══════════════════════════════════════════════════════

const AI_TIPS = [
  { condition: (s: { criticalTasks: number }) => s.criticalTasks > 0, tip: 'Máte P1 havárii - ověřte dostupnost náhradních dílů ve skladu.', color: 'from-red-500/15 to-rose-500/10', border: 'border-red-500/25' },
  { condition: (s: { breakdownAssets: number }) => s.breakdownAssets > 1, tip: 'Více strojů mimo provoz - zvažte prioritizaci dle dopadu na výrobu.', color: 'from-orange-500/15 to-amber-500/10', border: 'border-orange-500/25' },
  { condition: (s: { maintenanceAssets: number }) => s.maintenanceAssets > 2, tip: 'Několik strojů v servisu - zkontrolujte, zda nechybí naplánované revize.', color: 'from-amber-500/15 to-yellow-500/10', border: 'border-amber-500/25' },
  { condition: (s: { openTasks: number }) => s.openTasks > 20, tip: 'Vysoký počet otevřených úkolů - prioritizujte backlog a uzavřete staré záznamy.', color: 'from-blue-500/15 to-sky-500/10', border: 'border-blue-500/25' },
  { condition: (s: { inProgress: number }) => s.inProgress > 5, tip: 'Mnoho paralelních úkolů - lepší dokončit rozpracované než začínat nové.', color: 'from-violet-500/15 to-purple-500/10', border: 'border-violet-500/25' },
  { condition: () => true, tip: 'Pravidelná preventivní údržba snižuje výskyt havárií až o 40 %.', color: 'from-emerald-500/15 to-teal-500/10', border: 'border-emerald-500/25' },
];

function AiTipCard({ stats }: { stats: { criticalTasks: number; breakdownAssets: number; maintenanceAssets: number; openTasks: number; inProgress: number } }) {
  const tip = AI_TIPS.find((t) => t.condition(stats)) || AI_TIPS[AI_TIPS.length - 1];
  return (
    <div className={`my-2 ${DASH_PANEL} p-3 flex items-start gap-2.5`}>
      <div className={DASH_ICON_BOX}>
        <Sparkles className="w-4 h-4 text-amber-300" />
      </div>
      <div>
        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-0.5">Doporučení</div>
        <div className="text-xs text-slate-700 leading-relaxed">{tip.tip}</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// FIREBASE HOOKS (LIVE DATA)
// ═══════════════════════════════════════════════════════

interface DailyOperationsProps {
  openTasks: number;
  criticalTasks: number;
  overdueTasks: number;
  todayLogs: number;
  todayMinutes: number;
  todayDefects: number;
  onNavigate: (path: string) => void;
}

function DailyOperations({ openTasks, criticalTasks, overdueTasks, todayLogs, todayMinutes, todayDefects, onNavigate }: DailyOperationsProps) {
  const cards = [
    { label: 'Otevřené úkoly', value: openTasks, detail: criticalTasks ? `${criticalTasks} P1` : 'bez havárie', path: '/tasks', icon: Wrench, tone: 'text-amber-600' },
    { label: 'Po termínu', value: overdueTasks, detail: overdueTasks ? 'řešit jako první' : 'nic po termínu', path: '/tasks', icon: Clock, tone: 'text-red-600' },
    { label: 'Deník prací', value: todayLogs, detail: todayMinutes ? `${Math.round(todayMinutes / 60 * 10) / 10} h práce` : 'zatím bez zápisu', path: '/work-diary', icon: FileText, tone: 'text-emerald-700' },
    { label: 'Závady dnes', value: todayDefects, detail: todayDefects ? 'z kontrol' : 'bez závad', path: '/inspections', icon: AlertTriangle, tone: 'text-orange-600' },
  ];

  return (
    <section className="mb-5">
      <div className="mb-3">
        <div className="text-[10px] text-emerald-700 uppercase tracking-widest font-bold">Dnešní provoz</div>
        <h2 className="text-lg font-black text-slate-950 mt-0.5">Co je potřeba hlídat dnes</h2>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(({ label, value, detail, path, icon: Icon, tone }) => (
          <button key={label} type="button" onClick={() => onNavigate(path)}
            className={`${DASH_PANEL} ${DASH_PANEL_HOVER} p-4 text-left min-h-[116px]`}>
            <div className="flex items-center justify-between gap-2">
              <div className={DASH_ICON_BOX}>
                <Icon className={`w-5 h-5 ${tone}`} />
              </div>
              <div className={`text-2xl font-bold ${tone}`}>{value}</div>
            </div>
            <div className="text-sm font-black text-slate-950 mt-3">{label}</div>
            <div className="text-xs font-semibold text-slate-500 mt-1">{detail}</div>
          </button>
        ))}
      </div>
    </section>
  );
}

function QuickActions({ onNavigate }: { onNavigate: (path: string) => void }) {
  const actions = [
    { label: 'Zapsat práci', detail: 'deník údržby', path: '/work-diary?new=1', icon: FileText, tone: 'text-white', primaryClass: 'bg-emerald-700 border-emerald-700 hover:bg-emerald-600', iconClass: 'bg-emerald-900/35 border-emerald-300/40', primary: true },
    { label: 'Nahlásit poruchu', detail: 'rychlá závada', path: 'fault', icon: AlertTriangle, tone: 'text-red-700', primaryClass: 'bg-white border-red-200 hover:bg-red-50 text-slate-950', iconClass: 'bg-red-50 border-red-100', primary: true },
    { label: 'Nový úkol', detail: 'naplánovat práci', path: '/tasks?new=1', icon: PlusCircle, tone: 'text-amber-600' },
    { label: 'Kontroly', detail: 'obchůzky a závady', path: '/inspections', icon: ClipboardCheck, tone: 'text-sky-600' },
    { label: 'Najít zařízení', detail: 'kartotéka a historie', path: '/kartoteka', icon: Search, tone: 'text-violet-600' },
    { label: 'Report zařízení', detail: 'podklady pro audit', path: '/reports', icon: BarChart3, tone: 'text-cyan-600' },
  ];
  const primaryActions = actions.filter((action) => action.primary);
  const secondaryActions = [
    { label: 'Kiosk', detail: 'režim pro obsluhu', path: '/kiosk', icon: Monitor, tone: 'text-emerald-700' },
    ...actions.filter((action) => !action.primary),
  ];

  return (
    <section className="mb-5">
      <div className="mb-3">
        <div className="text-[10px] text-sky-700 uppercase tracking-widest font-bold">Rychlé akce</div>
        <h2 className="text-lg font-black text-slate-950 mt-0.5">Nejčastější práce na telefonu</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {primaryActions.map(({ label, detail, path, icon: Icon, tone, primaryClass, iconClass }) => (
          <button key={label} type="button" onClick={() => onNavigate(path)}
            className={`min-h-[92px] rounded-2xl border shadow-sm shadow-stone-200/70 p-4 text-left flex items-center gap-4 active:scale-[0.98] transition ${primaryClass}`}>
            <span className={`w-12 h-12 rounded-xl border flex items-center justify-center flex-shrink-0 ${iconClass}`}>
              <Icon className={`w-6 h-6 ${tone}`} />
            </span>
            <span className="min-w-0">
              <span className="block text-base font-black leading-tight">{label}</span>
              <span className="block text-sm font-semibold opacity-80 mt-1">{detail}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mt-2.5">
        {secondaryActions.map(({ label, detail, path, icon: Icon, tone }) => (
          <button key={label} type="button" onClick={() => onNavigate(path)}
            className={`min-h-[62px] ${DASH_PANEL} ${DASH_PANEL_HOVER} p-3 text-left flex items-center gap-3`}>
            <span className={DASH_ICON_BOX}>
              <Icon className={`w-5 h-5 ${tone}`} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-black text-slate-950 truncate">{label}</span>
              <span className="block text-xs font-semibold text-slate-500 truncate">{detail}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

// České skloňování: 1 zpráva / 2–4 zprávy / 5+ a 0 zpráv
function czNewMessages(n: number): string {
  if (n === 1) return '1 nová zpráva';
  if (n >= 2 && n <= 4) return `${n} nové zprávy`;
  return `${n} nových zpráv`;
}

function ModuleShortcuts({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { canViewSecretBox, hasPermission, user } = useAuthContext();
  const [trustboxNew, setTrustboxNew] = useState(0);

  useEffect(() => {
    if (!canViewSecretBox) { setTrustboxNew(0); return; }
    const inbox = query(collection(db, 'trustbox'), where('status', '==', 'new'));
    const unsub = onSnapshot(inbox, (snap) => setTrustboxNew(snap.size), () => setTrustboxNew(0));
    return () => unsub();
  }, [canViewSecretBox]);

  const canAny = (permissions: string[]) => permissions.some((permission) => hasPermission(permission));

  const modules = [
    { label: 'Kartotéka', detail: 'budovy, místnosti, zařízení', path: '/kartoteka', icon: Building2, tone: 'text-sky-600', permissions: ['asset.read'] },
    { label: 'Úkoly', detail: 'otevřená práce', path: '/tasks', icon: Wrench, tone: 'text-amber-600', permissions: ['wo.read', 'wo.create', 'wo.update'] },
    { label: 'Deník prací', detail: 'hotové zápisy', path: '/work-diary', icon: FileText, tone: 'text-emerald-700', permissions: ['wo.read', 'wo.create', 'wo.update'] },
    { label: 'Kontroly', detail: 'plány a závady', path: '/inspections', icon: ClipboardCheck, tone: 'text-cyan-600', permissions: ['asset.read', 'weekly.modify'] },
    { label: 'Reporty', detail: 'audit a historie', path: '/reports', icon: BarChart3, tone: 'text-violet-600', permissions: ['report.read', 'audit.read'] },
    { label: 'Kalendář', detail: 'plán a dovolené', path: '/calendar', icon: Calendar, tone: 'text-indigo-600', permissions: ['wo.read', 'schedule.manage'] },
    { label: 'Sklad ND', detail: 'díly a převodovky', path: '/inventory', icon: Package, tone: 'text-orange-600', permissions: ['inv.consume', 'inv.restock', 'inv.manage', 'inv.order', 'report.read'] },
    { label: 'Převodovky', detail: 'umístění a teploty', path: '/gearboxes', icon: Cog, tone: 'text-violet-600', permissions: ['gearbox.temperature.write', 'gearbox.manage', 'asset.update', 'asset.read'] },
    { label: 'Datalogery', detail: 'denní teploty skladu', path: '/dataloggers', icon: Thermometer, tone: 'text-cyan-700', permissions: ['datalogger.read', 'datalogger.temperature.write', 'datalogger.manage'] },
    { label: 'Suroviny', detail: 'šarže, alergeny, dodavatelé', path: '/materials', icon: Package, tone: 'text-emerald-700', permissions: ['production.read', 'production.manage', 'report.read'] },
    { label: 'Výrobky', detail: 'receptury a šarže', path: '/products', icon: Factory, tone: 'text-emerald-700', permissions: ['production.read', 'production.manage', 'report.read'] },
    { label: 'Vzduchotechnika', detail: 'filtry a výměny', path: '/hvac', icon: Wind, tone: 'text-sky-600', permissions: ['hvac.read', 'hvac.manage'] },
    ...(user?.role === 'SUPERADMIN'
      ? [{ label: 'Výroba', detail: 'plán extrudoven', path: '/production', icon: Factory, tone: 'text-emerald-700', permissions: ['preview.superadmin'] }]
      : []),
    { label: 'Administrace', detail: 'uživatelé a práva', path: '/admin', icon: Settings, tone: 'text-slate-600', permissions: ['admin.view', 'admin.manage', 'user.manage'] },
    ...(user?.role === 'SUPERADMIN'
      ? [{ label: 'Testovací stránky', detail: 'preview před produkcí', path: '/preview', icon: FlaskConical, tone: 'text-emerald-700', permissions: ['admin.manage'] }]
      : []),
    ...(canViewSecretBox
      ? [{ label: 'Schránka důvěry', detail: trustboxNew > 0 ? czNewMessages(trustboxNew) : 'anonymní zprávy', path: '/trustbox', icon: ShieldCheck, tone: 'text-purple-600', badge: trustboxNew, permissions: ['secretbox.view'] }]
      : []),
  ].filter((mod) => canAny(mod.permissions));

  return (
    <section className="mb-5">
      <div className="flex items-end justify-between gap-3 mb-3">
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Moduly</div>
          <h2 className="text-lg font-black text-slate-950 mt-0.5">Kam chceš pokračovat</h2>
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {modules.map((mod) => {
          const { label, detail, path, icon: Icon, tone } = mod;
          const badge = (mod as { badge?: number }).badge ?? 0;
          return (
          <button
            key={path}
            type="button"
            onClick={() => onNavigate(path)}
            className={`${DASH_PANEL} ${DASH_PANEL_HOVER} relative min-h-[82px] p-3 text-left flex items-center gap-3`}
          >
            <span className={DASH_ICON_BOX}>
              <Icon className={`w-5 h-5 ${tone}`} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-black text-slate-950 truncate">{label}</span>
              <span className="block text-xs font-semibold text-slate-500 mt-0.5 leading-snug">{detail}</span>
            </span>
            {badge > 0 && (
              <span className="absolute right-2 top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-black text-white">
                {badge}
              </span>
            )}
          </button>
          );
        })}
      </div>
    </section>
  );
}

function dashboardGearboxDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'object' && value && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate();
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function dashboardGearboxTemp(asset: Asset) {
  const value = typeof asset.lastTemperatureC === 'number' ? asset.lastTemperatureC : null;
  const warning = asset.gearboxWarningTemperatureC ?? 70;
  const critical = asset.gearboxCriticalTemperatureC ?? 85;
  const measuredAt = dashboardGearboxDate(asset.lastTemperatureAt);
  const ageDays = measuredAt ? Math.floor((Date.now() - measuredAt.getTime()) / (1000 * 60 * 60 * 24)) : null;

  if (value === null) {
    return { label: 'bez měření', value, measuredAt, alert: true, tone: 'text-red-700' };
  }
  if (value >= critical) {
    return { label: `${value} °C`, value, measuredAt, alert: true, tone: 'text-red-700' };
  }
  if (value >= warning || (ageDays !== null && ageDays >= 5)) {
    return { label: `${value} °C`, value, measuredAt, alert: ageDays === null || ageDays >= 7 || value >= warning, tone: 'text-amber-700' };
  }
  return { label: `${value} °C`, value, measuredAt, alert: false, tone: 'text-emerald-700' };
}

function dashboardGearboxShortDate(value: unknown): string {
  const date = dashboardGearboxDate(value);
  if (!date) return 'bez data';
  return date.toLocaleString('cs-CZ', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function dashboardGearboxStatus(status: ReturnType<typeof getGearboxStatus>) {
  if (status === 'installed') {
    return {
      label: 'V provozu',
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    };
  }
  if (status === 'service') {
    return {
      label: 'V opravě',
      tone: 'border-amber-200 bg-amber-50 text-amber-700',
    };
  }
  return {
    label: 'Ve skladu',
    tone: 'border-sky-200 bg-sky-50 text-sky-700',
  };
}

function useGearboxDashboard(tenantId: string) {
  const [items, setItems] = useState<Asset[]>([]);
  const [temperatureLogs, setTemperatureLogs] = useState<GearboxTemperatureLog[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let alive = true;
    assetService.getAll(tenantId)
      .then((assets) => {
        if (alive) setItems(assets.filter((asset) => isGearboxAsset(asset)));
      })
      .catch((err) => console.warn('[Dashboard] gearboxes error:', err));
    return () => { alive = false; };
  }, [tenantId, refreshKey]);

  useEffect(() => {
    const logsQuery = query(collection(db, 'gearbox_temperature_logs'), orderBy('measuredAt', 'desc'), limit(240));
    return onSnapshot(
      logsQuery,
      (snap) => {
        setTemperatureLogs(snap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        } as GearboxTemperatureLog)).filter((log) => log.tenantId === tenantId || !log.tenantId));
      },
      (err) => {
        console.warn('[Dashboard] gearbox temperature logs error:', err);
        setTemperatureLogs([]);
      },
    );
  }, [tenantId]);

  return useMemo(() => {
    const rows = items.map((asset) => {
      const status = getGearboxStatus(asset);
      const temp = dashboardGearboxTemp(asset);
      const statusInfo = dashboardGearboxStatus(status);
      return {
        id: asset.id,
        asset,
        name: asset.name,
        location: asset.currentExtruderName || (status === 'service' ? 'Servis' : asset.location || 'Sklad ND'),
        status,
        statusInfo,
        temp,
        temperatureLogs: temperatureLogs.filter((log) => log.gearboxId === asset.id).slice(0, 12),
      };
    });
    return {
      total: rows.length,
      installed: rows.filter((item) => item.status === 'installed').length,
      stock: rows.filter((item) => item.status === 'in_stock').length,
      service: rows.filter((item) => item.status === 'service').length,
      alerts: rows.filter((item) => item.temp.alert).length,
      rows: rows.sort((a, b) => {
        const order = { installed: 0, in_stock: 1, service: 2 } as const;
        return order[a.status] - order[b.status] || a.name.localeCompare(b.name, 'cs');
      }),
      refresh: () => setRefreshKey((value) => value + 1),
    };
  }, [items, temperatureLogs]);
}

function DashboardGearboxTrend({ logs }: { logs: GearboxTemperatureLog[] }) {
  const points = logs
    .filter((log) => typeof log.temperatureC === 'number' && dashboardGearboxDate(log.measuredAt))
    .slice(0, 8)
    .reverse();

  if (points.length < 2) {
    return (
      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500">
        Trend bude vidět po dalším zápisu.
      </div>
    );
  }

  const values = points.map((log) => log.temperatureC);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(1, max - min);
  const polyline = points.map((log, index) => {
    const x = points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
    const y = 34 - ((log.temperatureC - min) / spread) * 24;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
  const first = points[0];
  const latest = points[points.length - 1];

  return (
    <div className="mt-3 rounded-xl border border-cyan-100 bg-cyan-50/55 px-3 py-2">
      <div className="mb-1 flex items-center justify-between gap-2 text-xs font-black text-slate-700">
        <span className="inline-flex items-center gap-1">
          <Thermometer className="h-3.5 w-3.5 text-cyan-700" />
          Trend teplot
        </span>
        <span className="text-cyan-800">{first.temperatureC} °C → {latest.temperatureC} °C</span>
      </div>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-10 w-full overflow-visible">
        <line x1="0" y1="34" x2="100" y2="34" className="stroke-slate-300" strokeWidth="1" />
        <line x1="0" y1="10" x2="100" y2="10" className="stroke-cyan-100" strokeWidth="1" />
        <polyline points={polyline} fill="none" className="stroke-cyan-600" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((log, index) => {
          const x = points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
          const y = 34 - ((log.temperatureC - min) / spread) * 24;
          return <circle key={`${log.id}-${index}`} cx={x} cy={y} r="2" className="fill-cyan-700" />;
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[11px] font-semibold text-slate-500">
        <span>{dashboardGearboxShortDate(first.measuredAt)}</span>
        <span>{dashboardGearboxShortDate(latest.measuredAt)}</span>
      </div>
    </div>
  );
}

function GearboxDashboardWidget({
  data,
  onNavigate,
  user,
  tenantId,
  canWriteTemp,
  canReportProblem,
  canLogRepair,
}: {
  data: ReturnType<typeof useGearboxDashboard>;
  onNavigate: (path: string) => void;
  user: { id?: string; uid?: string; displayName?: string; tenantId?: string } | null | undefined;
  tenantId: string;
  canWriteTemp: boolean;
  canReportProblem: boolean;
  canLogRepair: boolean;
}) {
  const [problemAsset, setProblemAsset] = useState<Asset | null>(null);
  const [repairAsset, setRepairAsset] = useState<Asset | null>(null);
  const [savingStatusId, setSavingStatusId] = useState('');

  const handleStatusChange = async (asset: Asset, status: 'in_stock' | 'service') => {
    if (savingStatusId) return;
    setSavingStatusId(asset.id);
    try {
      await setGearboxStockStatus({ tenantId, gearbox: asset, status, user });
      data.refresh();
      showToast(status === 'service' ? 'Převodovka přesunuta do servisu' : 'Převodovka přesunuta do skladu', 'success');
    } catch (err) {
      console.error('[Dashboard] gearbox status change failed:', err);
      showToast('Stav převodovky se nepodařilo uložit', 'error');
    } finally {
      setSavingStatusId('');
    }
  };

  if (!data.total) return null;

  return (
    <section className={`mb-5 ${DASH_PANEL} p-4`}>
      <button
        type="button"
        onClick={() => onNavigate('/gearboxes')}
        className="flex w-full items-start justify-between gap-3 text-left transition hover:opacity-90 active:scale-[0.99]"
      >
        <div className="flex min-w-0 items-start gap-3">
          <div className={DASH_ICON_BOX}>
            <Cog className="h-5 w-5 text-violet-600" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-black text-slate-950">Převodovky</div>
            <div className="mt-1 text-sm font-semibold text-slate-500">
              {data.installed} v provozu · {data.stock} sklad · {data.service} servis
            </div>
          </div>
        </div>
        {data.alerts > 0 && (
          <span className="shrink-0 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-black text-red-700">
            {data.alerts} upozornění
          </span>
        )}
      </button>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {data.rows.slice(0, 6).map((item) => (
          <div
            key={item.id}
            className={`rounded-2xl border p-3 shadow-sm ${
              item.status === 'in_stock'
                ? 'border-sky-200 bg-sky-50/80'
                : item.status === 'service'
                  ? 'border-amber-200 bg-amber-50/75'
                  : 'border-[var(--vik-border)] bg-[var(--vik-surface-2)]'
            }`}
          >
            <button
              type="button"
              onClick={() => onNavigate('/gearboxes')}
              className="min-h-[48px] w-full text-left transition hover:opacity-90 active:scale-[0.99]"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-black text-slate-950">{item.name}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold text-slate-500">{item.location}</span>
                    <span className={`rounded-full border px-2 py-1 text-xs font-black ${item.statusInfo.tone}`}>
                      {item.statusInfo.label}
                    </span>
                  </div>
                </div>
                <div className={`shrink-0 text-sm font-black ${
                  item.temp.tone.includes('red')
                    ? 'text-red-700'
                    : item.temp.tone.includes('amber')
                      ? 'text-amber-700'
                      : 'text-emerald-700'
                }`}>{item.temp.label}</div>
              </div>
              <div className="mt-2 text-xs font-bold text-slate-500">
                {item.temp.measuredAt ? `Naposledy ${dashboardGearboxShortDate(item.temp.measuredAt)}` : 'Teplota zatím bez zápisu'}
              </div>
            </button>
            <DashboardGearboxTrend logs={item.temperatureLogs} />
            <div className="mt-2 flex flex-wrap gap-2">
              {canLogRepair && (
                <div className="grid w-full grid-cols-3 gap-1 rounded-lg border border-[var(--vik-border)] bg-white p-1">
                  <button
                    type="button"
                    onClick={() => onNavigate(`/asset/${item.id}?action=assign`)}
                    className={`min-h-9 rounded-md px-2 text-[11px] font-black transition active:scale-[0.98] ${
                      item.status === 'installed' ? 'bg-emerald-100 text-emerald-800' : 'text-slate-600 hover:bg-[var(--vik-surface-2)]'
                    }`}
                  >
                    Extruder
                  </button>
                  <button
                    type="button"
                    disabled={savingStatusId === item.id || item.status === 'in_stock'}
                    onClick={() => handleStatusChange(item.asset, 'in_stock')}
                    className={`min-h-9 rounded-md px-2 text-[11px] font-black transition disabled:opacity-45 active:scale-[0.98] ${
                      item.status === 'in_stock' ? 'bg-sky-100 text-sky-800' : 'text-slate-600 hover:bg-[var(--vik-surface-2)]'
                    }`}
                  >
                    {savingStatusId === item.id && item.status !== 'in_stock' ? '...' : 'Sklad'}
                  </button>
                  <button
                    type="button"
                    disabled={savingStatusId === item.id || item.status === 'service'}
                    onClick={() => handleStatusChange(item.asset, 'service')}
                    className={`min-h-9 rounded-md px-2 text-[11px] font-black transition disabled:opacity-45 active:scale-[0.98] ${
                      item.status === 'service' ? 'bg-amber-100 text-amber-800' : 'text-slate-600 hover:bg-[var(--vik-surface-2)]'
                    }`}
                  >
                    {savingStatusId === item.id && item.status !== 'service' ? '...' : 'Servis'}
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={() => onNavigate(`/asset/${item.id}`)}
                className="min-h-[44px] flex-1 rounded-lg border border-slate-200 bg-white px-2 text-xs font-black text-slate-700 transition hover:bg-slate-50 active:scale-[0.98]"
              >
                <FileText className="mr-1 inline h-4 w-4" />
                Karta
              </button>
              {canWriteTemp && (
                <button
                  type="button"
                  onClick={() => onNavigate(`/asset/${item.id}?action=temp`)}
                  className="min-h-[44px] flex-1 rounded-lg border border-sky-200 bg-sky-50 px-2 text-xs font-black text-sky-700 transition hover:bg-sky-100 active:scale-[0.98]"
                >
                  Teplota
                </button>
              )}
              {canReportProblem && (
                <button
                  type="button"
                  onClick={() => setProblemAsset(item.asset)}
                  className="min-h-[44px] flex-1 rounded-lg border border-red-200 bg-red-50 px-2 text-xs font-black text-red-700 transition hover:bg-red-100 active:scale-[0.98]"
                >
                  Nahlásit problém
                </button>
              )}
              {canLogRepair && (
                <button
                  type="button"
                  onClick={() => setRepairAsset(item.asset)}
                  className="min-h-[44px] flex-1 rounded-lg border border-amber-200 bg-amber-50 px-2 text-xs font-black text-amber-700 transition hover:bg-amber-100 active:scale-[0.98]"
                >
                  Oprava / úprava
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {problemAsset && (
        <GearboxProblemModal
          asset={problemAsset}
          user={user}
          onClose={() => setProblemAsset(null)}
          onSaved={() => setProblemAsset(null)}
        />
      )}
      {repairAsset && (
        <GearboxRepairModal
          asset={repairAsset}
          user={user}
          onClose={() => setRepairAsset(null)}
          onSaved={() => setRepairAsset(null)}
        />
      )}
    </section>
  );
}

function OptionalActivityPanel({
  todayItems,
  weekItems,
  onNavigate,
}: {
  todayItems: ActivityTimelineItem[];
  weekItems: ActivityTimelineItem[];
  onNavigate: (path: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const count = todayItems.length || weekItems.length;

  return (
    <section className="mb-5">
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        className={`${DASH_PANEL} ${DASH_PANEL_HOVER} w-full min-h-[58px] px-4 py-3 text-left flex items-center justify-between gap-3`}
      >
        <span className="flex items-center gap-3 min-w-0">
          <span className={DASH_ICON_BOX}>
            <Clock className="w-5 h-5 text-sky-600" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-black text-slate-950">Přehled aktivit</span>
            <span className="block text-xs font-semibold text-slate-500">
              {count ? `${count} záznamů k rychlému nahlédnutí` : 'zatím bez dnešních aktivit'}
            </span>
          </span>
        </span>
        <span className="text-xs font-bold text-sky-700 whitespace-nowrap">
          {visible ? 'Skrýt' : 'Zobrazit'}
        </span>
      </button>

      {visible && (
        <div className="mt-3">
          <ActivityTimeline
            todayItems={todayItems}
            weekItems={weekItems}
            onNavigate={onNavigate}
          />
        </div>
      )}
    </section>
  );
}

function AuditReadiness({ todayLogs, openTasks, todayDefects, onNavigate }: { todayLogs: number; openTasks: number; todayDefects: number; onNavigate: (path: string) => void }) {
  return (
    <section className={`mb-5 ${DASH_PANEL} p-4`}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={DASH_ICON_BOX}>
          <ShieldCheck className="w-5 h-5 text-emerald-700" />
          </div>
          <div>
            <div className="text-sm font-black text-slate-950">Auditní jistota</div>
            <div className="text-xs font-semibold text-slate-500 mt-1">
              Dnes je {todayLogs} zápisů v deníku. Otevřených úkolů: {openTasks}. Závady dnes: {todayDefects}.
            </div>
          </div>
        </div>
        <button type="button" onClick={() => onNavigate('/reports')}
          className="px-4 py-2 rounded-xl bg-emerald-700 border border-emerald-700 text-white hover:bg-emerald-600 text-sm font-bold active:scale-95 transition">
          Otevřít reporty
        </button>
      </div>
    </section>
  );
}

function SecondaryModules({
  widgets,
  getTileData,
  onTileClick,
}: {
  widgets: WidgetInstance[];
  getTileData: (id: string) => { value?: string; subtext?: string; badge?: number };
  onTileClick: (tileId: string) => void;
}) {
  const primaryIds = new Set(['fault', 'tasks', 'map', 'inspections', 'reports']);
  const hiddenIds = new Set(['semaphore', 'top5', 'lemon']);
  const modules = widgets
    .filter((widget) => widget.visible && !primaryIds.has(widget.widgetId) && !hiddenIds.has(widget.widgetId))
    .sort((a, b) => a.position - b.position)
    .map((widget) => ({ widget, def: getWidgetDef(widget.widgetId), data: getTileData(widget.widgetId) }))
    .filter((item) => item.def && (item.def.type === 'tile' || item.def.type === 'action'));

  if (modules.length === 0) return null;

  return (
    <section className="mb-5">
      <div className="flex items-end justify-between gap-3 mb-3">
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Ostatní moduly</div>
          <h2 className="text-lg font-black text-slate-950 mt-0.5">Méně časté vstupy</h2>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {modules.map(({ widget, def, data }) => (
          <button
            key={widget.widgetId}
            type="button"
            onClick={() => onTileClick(widget.widgetId)}
            className={`min-h-[64px] ${DASH_PANEL} ${DASH_PANEL_HOVER} p-3 text-left flex items-center gap-3`}
          >
            <span className={`${DASH_ICON_BOX} text-lg`}>
              {def?.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-black text-slate-950 truncate">{def?.label}</span>
              <span className="block text-xs font-semibold text-slate-500 truncate">
                {data.value ? `${data.value} · ${data.subtext || ''}` : data.subtext || 'Otevřít modul'}
              </span>
            </span>
            {data.badge != null && data.badge > 0 && (
              <span className="min-w-6 h-6 px-2 rounded-full bg-red-50 border border-red-200 text-red-700 text-xs font-bold flex items-center justify-center">
                {data.badge}
              </span>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}

function useDashboardStats() {
  const [stats, setStats] = useState({
    openTasks: 0, criticalTasks: 0, urgentTasks: 0, newReports: 0,
    totalAssets: 0, operationalAssets: 0, maintenanceAssets: 0, breakdownAssets: 0,
    upcomingRevisions: 0, inProgress: 0, overdueTasks: 0, newKioskTasks: 0, loading: true,
  });

  useEffect(() => {
    const unsubs: (() => void)[] = [];

    const tq = query(collection(db, 'tasks'), where('status', 'in', ['backlog', 'planned', 'in_progress', 'paused']));
    unsubs.push(onSnapshot(tq, (snap) => {
      let c = 0, u = 0, b = 0, ip = 0, overdue = 0, kiosk = 0;
      snap.docs.forEach((d) => {
        const data = d.data();
        if (data.priority === 'P1') c++;
        if (data.priority === 'P2') u++;
        if (data.status === 'backlog') b++;
        if (data.status === 'backlog' && data.source === 'kiosk') kiosk++;
        if (data.status === 'in_progress') ip++;
        if (isBeforeToday(data.dueDate || data.plannedDate)) overdue++;
      });
      setStats((p) => ({ ...p, openTasks: snap.size, criticalTasks: c, urgentTasks: u, newReports: b, inProgress: ip, overdueTasks: overdue, newKioskTasks: kiosk, loading: false }));
    }, () => setStats((p) => ({ ...p, loading: false }))));

    const aq = query(collection(db, 'assets'));
    unsubs.push(onSnapshot(aq, (snap) => {
      let op = 0, mt = 0, bd = 0;
      snap.docs.forEach((d) => {
        const s = d.data().status;
        if (s === 'operational') op++;
        else if (s === 'maintenance') mt++;
        else if (s === 'breakdown') bd++;
      });
      setStats((p) => ({ ...p, totalAssets: snap.size, operationalAssets: op, maintenanceAssets: mt, breakdownAssets: bd }));
    }, (err) => console.error('[Dashboard] assets error:', err)));

    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    unsubs.push(onSnapshot(collection(db, 'revisions'), (snap) => {
      let upcoming = 0;
      snap.docs.forEach((d) => {
        const data = d.data();
        if (data.isDeleted) return;
        const nextRevision = asDate(data.nextRevisionDate || data.nextRevisionAt);
        if (nextRevision && nextRevision <= in30) upcoming++;
      });
      setStats((p) => ({ ...p, upcomingRevisions: upcoming }));
    }, (err) => console.error('[Dashboard] revisions error:', err)));

    return () => unsubs.forEach((u) => u());
  }, []);

  return stats;
}

function useTodayOperations() {
  const [ops, setOps] = useState({
    todayLogs: 0,
    todayMinutes: 0,
    todayDefects: 0,
  });

  useEffect(() => {
    const unsubs: (() => void)[] = [];

    unsubs.push(onSnapshot(collection(db, 'workLogs'), (snap) => {
      let count = 0;
      let minutes = 0;
      snap.docs.forEach((docSnap) => {
        const data = docSnap.data();
        if (!isToday(data.performedAt || data.createdAt)) return;
        count++;
        minutes += Math.round((data.hoursWorked || 0) * 60);
      });
      setOps((prev) => ({ ...prev, todayLogs: count, todayMinutes: minutes }));
    }, (err) => console.error('[Dashboard] workLogs error:', err)));

    unsubs.push(onSnapshot(collection(db, 'inspection_logs'), (snap) => {
      let defects = 0;
      snap.docs.forEach((docSnap) => {
        const data = docSnap.data();
        if (!isToday(data.completedAt || data.timestamp)) return;
        if (data.status === 'defect' || data.defectNote || (data.issueCount || 0) > 0) defects++;
      });
      setOps((prev) => ({ ...prev, todayDefects: defects }));
    }, (err) => console.error('[Dashboard] inspection_logs error:', err)));

    return () => unsubs.forEach((unsub) => unsub());
  }, []);

  return ops;
}

function useVacationAlerts(tenantId: string) {
  const [vacations, setVacations] = useState<VacationPlan[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'vacation_plans'), (snap) => {
      const items = snap.docs
        .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as VacationPlan))
        .filter((item) => !item.tenantId || item.tenantId === tenantId)
        .filter((item) => item.status !== 'cancelled')
        .filter((item) => isWithinNextDays(item.startDate, item.endDate, 14))
        .sort((a, b) => (asDate(a.startDate)?.getTime() || 0) - (asDate(b.startDate)?.getTime() || 0));
      setVacations(items);
    }, (err) => console.error('[Dashboard] vacation_plans error:', err));
    return () => unsub();
  }, [tenantId]);

  const today = new Date();
  const todayVacations = vacations.filter((item) => isDateInRange(today, item.startDate, item.endDate));
  const upcomingVacations = vacations.filter((item) => !isDateInRange(today, item.startDate, item.endDate)).slice(0, 5);

  return { todayVacations, upcomingVacations };
}

function VacationNotice({ todayVacations, upcomingVacations, onNavigate }: {
  todayVacations: VacationPlan[];
  upcomingVacations: VacationPlan[];
  onNavigate: (path: string) => void;
}) {
  if (todayVacations.length === 0 && upcomingVacations.length === 0) return null;

  return (
    <section className={`mb-5 ${DASH_PANEL} p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className={DASH_ICON_BOX}>
            <Calendar className="w-5 h-5 text-emerald-700" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] text-emerald-700 uppercase tracking-widest font-bold">Dovolené</div>
            <h2 className="text-base font-black text-slate-950 mt-0.5">
              {todayVacations.length > 0
                ? `Dnes mimo práci: ${todayVacations.map((item) => `${item.workerName} (${absenceKindLabel(item.kind)})`).join(', ')}`
                : 'Nadcházející absence'}
            </h2>
            {upcomingVacations.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {upcomingVacations.map((item) => (
                  <span key={item.id} className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
                    {absenceKindLabel(item.kind)} · {item.workerName}: {formatVacationDate(item.startDate)}-{formatVacationDate(item.endDate)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('/calendar')}
          className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-white"
        >
          Kalendář
        </button>
      </div>
    </section>
  );
}

function OperationalAlerts({
  newKioskTasks,
  criticalTasks,
  overdueTasks,
  expiredRevisions,
  expiringRevisions,
  lowStockCount,
  todayDefects,
  todayAbsences,
  onNavigate,
}: {
  newKioskTasks: number;
  criticalTasks: number;
  overdueTasks: number;
  expiredRevisions: number;
  expiringRevisions: number;
  lowStockCount: number;
  todayDefects: number;
  todayAbsences: number;
  onNavigate: (path: string) => void;
}) {
  const alerts = [
    newKioskTasks > 0 ? { label: 'Nové z kiosku', value: newKioskTasks, detail: 'hlášení od obsluhy', path: '/tasks?source=kiosk', icon: Bell, tone: 'text-red-700', border: 'border-red-200 bg-red-50' } : null,
    criticalTasks > 0 ? { label: 'P1 úkoly', value: criticalTasks, detail: 'řešit hned', path: '/tasks', icon: AlertTriangle, tone: 'text-red-700', border: 'border-red-200 bg-red-50' } : null,
    overdueTasks > 0 ? { label: 'Po termínu', value: overdueTasks, detail: 'otevřené práce', path: '/tasks', icon: Clock, tone: 'text-orange-700', border: 'border-orange-200 bg-orange-50' } : null,
    expiredRevisions > 0 ? { label: 'Prošlé revize', value: expiredRevisions, detail: 'auditní riziko', path: '/revisions', icon: ShieldCheck, tone: 'text-red-700', border: 'border-red-200 bg-red-50' } : null,
    expiredRevisions === 0 && expiringRevisions > 0 ? { label: 'Blížící revize', value: expiringRevisions, detail: 'naplánovat', path: '/revisions', icon: ShieldCheck, tone: 'text-amber-700', border: 'border-amber-200 bg-amber-50' } : null,
    lowStockCount > 0 ? { label: 'Sklad pod limitem', value: lowStockCount, detail: 'zkontrolovat ND', path: '/inventory', icon: Package, tone: 'text-amber-700', border: 'border-amber-200 bg-amber-50' } : null,
    todayDefects > 0 ? { label: 'Závady dnes', value: todayDefects, detail: 'z kontrol', path: '/inspections', icon: ClipboardCheck, tone: 'text-sky-700', border: 'border-sky-200 bg-sky-50' } : null,
    todayAbsences > 0 ? { label: 'Dnes mimo práci', value: todayAbsences, detail: 'dovolená/nemoc', path: '/calendar', icon: Calendar, tone: 'text-emerald-700', border: 'border-emerald-200 bg-emerald-50' } : null,
  ].filter(Boolean) as Array<{
    label: string;
    value: number;
    detail: string;
    path: string;
    icon: typeof AlertTriangle;
    tone: string;
    border: string;
  }>;

  if (alerts.length === 0) return null;

  return (
    <section className="mb-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] text-red-600 uppercase tracking-widest font-bold">Upozornění</div>
          <h2 className="text-lg font-black text-slate-950 mt-0.5">Co nečeká</h2>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('/notifications')}
          className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-stone-50"
        >
          Vše
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {alerts.slice(0, 6).map(({ label, value, detail, path, icon: Icon, tone, border }) => (
          <button
            key={label}
            type="button"
            onClick={() => onNavigate(path)}
            className={`min-h-[72px] rounded-xl border p-3 text-left flex items-center gap-3 active:scale-[0.98] transition ${border}`}
          >
            <span className={DASH_ICON_BOX}>
              <Icon className={`w-5 h-5 ${tone}`} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-black text-slate-950 truncate">{label}</span>
              <span className="block text-xs font-semibold text-slate-600 truncate">{detail}</span>
            </span>
            <span className={`text-xl font-black ${tone}`}>{value}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

type ActivityKind = 'work' | 'task' | 'inspection' | 'gearbox';

interface ActivityTimelineItem {
  id: string;
  sourceId: string;
  kind: ActivityKind;
  date: Date;
  title: string;
  detail: string;
  person: string;
  path: string;
  building?: string;
  room?: string;
  assetName?: string;
  status?: string;
  description?: string;
  photos?: string[];
  related?: string[];
}

function isWithinLastDays(date: Date, days: number): boolean {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return date >= start;
}

function compactParts(parts: Array<string | number | null | undefined>): string {
  return parts
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' · ');
}

function nameList(value: unknown): string {
  return Array.isArray(value) ? value.map((name) => String(name).trim()).filter(Boolean).join(', ') : '';
}

function useActivityTimeline() {
  const [workItems, setWorkItems] = useState<ActivityTimelineItem[]>([]);
  const [taskItems, setTaskItems] = useState<ActivityTimelineItem[]>([]);
  const [inspectionItems, setInspectionItems] = useState<ActivityTimelineItem[]>([]);
  const [gearboxItems, setGearboxItems] = useState<ActivityTimelineItem[]>([]);

  useEffect(() => {
    const unsubs: (() => void)[] = [];

    unsubs.push(onSnapshot(collection(db, 'workLogs'), (snap) => {
      const items = snap.docs
        .map((docSnap) => {
          const data = docSnap.data();
          const date = asDate(data.performedAt || data.createdAt);
          if (!date || !isWithinLastDays(date, 7)) return null;
          return {
            id: `work-${docSnap.id}`,
            sourceId: docSnap.id,
            kind: 'work' as const,
            date,
            title: data.taskTitle || data.assetName || 'Zápis práce',
            detail: compactParts([data.location, data.assetName, data.content]).slice(0, 180),
            person: nameList(data.workerNames) || data.userName || 'Neznámý',
            path: data.taskId ? `/tasks?task=${data.taskId}` : '/work-diary',
            building: data.buildingName || data.buildingId,
            room: data.roomName || data.location,
            assetName: data.assetName,
            status: data.workType || data.type,
            description: data.content,
            photos: Array.isArray(data.photoUrls) ? data.photoUrls : Array.isArray(data.photos) ? data.photos : [],
            related: [data.taskId ? `Úkol ${data.taskId}` : '', data.assetId ? `Karta zařízení ${data.assetId}` : ''].filter(Boolean),
          };
        })
        .filter(Boolean) as ActivityTimelineItem[];
      setWorkItems(items);
    }, (err) => console.error('[Dashboard] activity workLogs error:', err)));

    unsubs.push(onSnapshot(collection(db, 'tasks'), (snap) => {
      const items = snap.docs
        .map((docSnap) => {
          const data = docSnap.data();
          const date = asDate(data.completedAt || data.updatedAt || data.createdAt);
          if (!date || !isWithinLastDays(date, 7)) return null;
          const done = data.status === 'completed' || data.status === 'done' || data.isDone;
          return {
            id: `task-${docSnap.id}`,
            sourceId: docSnap.id,
            kind: 'task' as const,
            date,
            title: done ? `Hotovo: ${data.title || 'úkol'}` : `Úkol: ${data.title || 'bez názvu'}`,
            detail: compactParts([data.assetName, data.priority, data.status]),
            person: nameList(data.completedByNames) || data.completedBy || nameList(data.assignedWorkerNames) || data.assignedToName || 'Neznámý',
            path: `/tasks?task=${docSnap.id}`,
            building: data.buildingName || data.buildingId,
            room: data.roomName || data.location,
            assetName: data.assetName,
            status: compactParts([data.priority, data.status]),
            description: data.description || data.note || data.content,
            photos: Array.isArray(data.photoUrls) ? data.photoUrls : [],
            related: [data.assetId ? `Karta zařízení ${data.assetId}` : '', data.sourceRefId ? `Zdroj ${data.sourceRefId}` : ''].filter(Boolean),
          };
        })
        .filter(Boolean) as ActivityTimelineItem[];
      setTaskItems(items);
    }, (err) => console.error('[Dashboard] activity tasks error:', err)));

    unsubs.push(onSnapshot(collection(db, 'inspection_logs'), (snap) => {
      const items = snap.docs
        .map((docSnap) => {
          const data = docSnap.data();
          const date = asDate(data.completedAt || data.updatedAt || data.createdAt || data.timestamp);
          if (!date || !isWithinLastDays(date, 7)) return null;
          return {
            id: `inspection-${docSnap.id}`,
            sourceId: docSnap.id,
            kind: 'inspection' as const,
            date,
            title: data.defectNote ? 'Závada z kontroly' : 'Kontrola',
            detail: compactParts([data.buildingName || data.buildingId, data.roomName, data.assetName, data.defectNote || data.note]),
            person: data.inspectorName || data.completedBy || data.createdByName || 'Neznámý',
            path: '/inspections',
            building: data.buildingName || data.buildingId,
            room: data.roomName,
            assetName: data.assetName,
            status: data.status,
            description: data.defectNote || data.inspectionNote || data.note || data.checkPoints,
            photos: Array.isArray(data.photoUrls) ? data.photoUrls : Array.isArray(data.photos) ? data.photos : [],
            related: [data.taskId ? `Úkol ${data.taskId}` : '', data.sourceAssetId ? `Karta zařízení ${data.sourceAssetId}` : ''].filter(Boolean),
          };
        })
        .filter(Boolean) as ActivityTimelineItem[];
      setInspectionItems(items);
    }, (err) => console.error('[Dashboard] activity inspection_logs error:', err)));

    unsubs.push(onSnapshot(collection(db, 'gearbox_temperature_logs'), (snap) => {
      const items = snap.docs
        .map((docSnap) => {
          const data = docSnap.data();
          const date = asDate(data.measuredAt || data.createdAt);
          if (!date || !isWithinLastDays(date, 7)) return null;
          return {
            id: `gearbox-${docSnap.id}`,
            sourceId: docSnap.id,
            kind: 'gearbox' as const,
            date,
            title: `Teplota převodovky${data.temperatureC != null ? ` ${data.temperatureC} °C` : ''}`,
            detail: compactParts([data.gearboxName, data.extruderName, data.note]),
            person: data.measuredByName || data.createdByName || 'Neznámý',
            path: data.gearboxId ? `/asset/${data.gearboxId}` : '/reports',
            building: data.buildingName || data.buildingId,
            room: data.roomName,
            assetName: compactParts([data.gearboxName, data.extruderName]),
            status: data.temperatureC != null ? `${data.temperatureC} °C` : undefined,
            description: data.note,
            photos: Array.isArray(data.photoUrls) ? data.photoUrls : data.photoUrl ? [data.photoUrl] : [],
            related: [data.gearboxId ? `Převodovka ${data.gearboxId}` : '', data.extruderId ? `Extruder ${data.extruderId}` : ''].filter(Boolean),
          };
        })
        .filter(Boolean) as ActivityTimelineItem[];
      setGearboxItems(items);
    }, (err) => console.error('[Dashboard] activity gearbox logs error:', err)));

    return () => unsubs.forEach((unsub) => unsub());
  }, []);

  const weekItems = useMemo(
    () => [...workItems, ...taskItems, ...inspectionItems, ...gearboxItems].sort((a, b) => b.date.getTime() - a.date.getTime()),
    [workItems, taskItems, inspectionItems, gearboxItems]
  );

  const todayItems = useMemo(
    () => weekItems.filter((item) => isToday(item.date)),
    [weekItems]
  );

  return { todayItems, weekItems };
}

function ActivityDetailCard({ item, onClose, onContinue, onEdit }: {
  item: ActivityTimelineItem;
  onClose: () => void;
  onContinue: () => void;
  onEdit: () => void;
}) {
  const kindLabel: Record<ActivityKind, string> = {
    work: 'Deník údržby',
    task: 'Úkol',
    inspection: 'Kontrola',
    gearbox: 'Převodovka',
  };
  const rows = [
    ['Typ záznamu', kindLabel[item.kind]],
    ['Čas', item.date.toLocaleString('cs-CZ', { dateStyle: 'medium', timeStyle: 'short' })],
    ['Pracovník', item.person],
    ['Budova', item.building],
    ['Místnost', item.room],
    ['Zařízení / věc', item.assetName],
    ['Stav', item.status],
  ].filter(([, value]) => String(value || '').trim());

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/35 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <section
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-stone-200 bg-white text-slate-950 shadow-2xl sm:max-w-2xl sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-stone-200 bg-white/95 p-4 backdrop-blur">
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-sky-700">Detail záznamu</div>
            <h3 className="mt-1 text-lg font-black text-slate-950">{item.title}</h3>
          </div>
          <button type="button" onClick={onClose} className="min-h-11 min-w-11 rounded-xl border border-stone-200 bg-stone-50 p-2 text-slate-600 hover:bg-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {rows.map(([label, value]) => (
              <div key={label} className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
                <div className="mt-1 text-sm font-black text-slate-950">{value}</div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              <FileText className="h-4 w-4" />
              Popis
            </div>
            <p className="whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-700">
              {item.description || item.detail || 'Bez podrobnějšího popisu.'}
            </p>
          </div>

          {item.photos && item.photos.length > 0 && (
            <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">Fotky</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {item.photos.slice(0, 6).map((photo) => (
                  <img key={photo} src={photo} alt="" className="aspect-video rounded-lg object-cover" />
                ))}
              </div>
            </div>
          )}

          {item.related && item.related.length > 0 && (
            <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">Navázané záznamy</div>
              <div className="flex flex-wrap gap-2">
                {item.related.map((related) => (
                  <span key={related} className="rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-bold text-sky-700">
                    {related}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 text-xs font-semibold text-slate-600">
            <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3">
              <User className="h-4 w-4 text-slate-500" />
              Osoba
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3">
              <MapPin className="h-4 w-4 text-slate-500" />
              Místo
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3">
              <Clock className="h-4 w-4 text-slate-500" />
              Historie
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 grid grid-cols-2 gap-2 border-t border-stone-200 bg-white/95 p-4 backdrop-blur">
          <button type="button" onClick={onContinue} className="min-h-11 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white active:scale-[0.99] hover:bg-emerald-600">
            Pokračovat
          </button>
          <button type="button" onClick={onEdit} className="min-h-11 rounded-xl border border-stone-200 bg-stone-50 px-4 text-sm font-bold text-slate-700 active:scale-[0.99] hover:bg-white">
            Upravit
          </button>
        </div>
      </section>
    </div>
  );
}

function ActivityTimeline({ todayItems, weekItems, onNavigate }: {
  todayItems: ActivityTimelineItem[];
  weekItems: ActivityTimelineItem[];
  onNavigate: (path: string) => void;
}) {
  const [range, setRange] = useState<'today' | 'week'>('today');
  const [expanded, setExpanded] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ActivityTimelineItem | null>(null);
  const items = range === 'today' ? todayItems : weekItems;
  const withMode = (path: string, mode: string) => `${path}${path.includes('?') ? '&' : '?'}${mode}=1`;
  const grouped = useMemo(() => {
    const groups: Array<{ key: string; label: string; items: ActivityTimelineItem[] }> = [];
    const index = new globalThis.Map<string, { key: string; label: string; items: ActivityTimelineItem[] }>();
    items.forEach((item) => {
      const day = item.date.toLocaleDateString('cs-CZ', { weekday: 'short', day: '2-digit', month: '2-digit' });
      const hour = item.date.toLocaleTimeString('cs-CZ', { hour: '2-digit' });
      const key = `${day}-${hour}`;
      if (!index.has(key)) {
        const group = { key, label: range === 'today' ? `${hour}:00` : `${day} ${hour}:00`, items: [] };
        index.set(key, group);
        groups.push(group);
      }
      index.get(key)?.items.push(item);
    });
    return groups;
  }, [items, range]);
  const visibleGroups = useMemo(() => {
    if (expanded) return grouped;
    let shown = 0;
    const limited: typeof grouped = [];
    for (const group of grouped) {
      if (shown >= 4) break;
      const remaining = 4 - shown;
      const groupItems = group.items.slice(0, remaining);
      if (groupItems.length > 0) {
        limited.push({ ...group, items: groupItems });
        shown += groupItems.length;
      }
    }
    return limited;
  }, [expanded, grouped]);

  const kindClass: Record<ActivityKind, string> = {
    work: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    task: 'bg-amber-50 border-amber-200 text-amber-700',
    inspection: 'bg-sky-50 border-sky-200 text-sky-700',
    gearbox: 'bg-violet-50 border-violet-200 text-violet-700',
  };

  const kindLabel: Record<ActivityKind, string> = {
    work: 'Deník',
    task: 'Úkol',
    inspection: 'Kontrola',
    gearbox: 'Převodovka',
  };

  return (
    <section className={`${DASH_PANEL} mb-5 p-4`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-[10px] text-sky-700 uppercase tracking-widest font-black">Přehled aktivit</div>
          <h2 className="text-lg font-black text-slate-950 mt-0.5">Co se dělalo</h2>
          <p className="text-xs font-semibold text-slate-500 mt-1">Rychlý pohled pro údržbu a výrobu bez otevírání detailů.</p>
        </div>
        <div className="flex rounded-xl bg-stone-100 border border-stone-200 p-1">
          <button type="button" onClick={() => { setRange('today'); setExpanded(false); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${range === 'today' ? 'bg-emerald-700 text-white' : 'text-slate-600'}`}>
            Dnes
          </button>
          <button type="button" onClick={() => { setRange('week'); setExpanded(false); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${range === 'week' ? 'bg-emerald-700 text-white' : 'text-slate-600'}`}>
            7 dní
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50 p-4 text-sm font-semibold text-slate-500">
          Zatím tu není žádná aktivita v tomto období.
        </div>
      ) : (
        <div className="space-y-4">
          {visibleGroups.map((group) => (
            <div key={group.key} className="grid grid-cols-[58px_1fr] gap-3">
              <div className="text-xs font-bold text-slate-500 pt-2">{group.label}</div>
              <div className="space-y-2 border-l border-stone-200 pl-3">
                {group.items.slice(0, 8).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedItem(item)}
                    className="w-full rounded-xl bg-stone-50 border border-stone-200 p-3 text-left active:scale-[0.99] hover:bg-white transition"
                  >
                    <div className="flex items-start gap-2">
                      <span className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold ${kindClass[item.kind]}`}>
                        {kindLabel[item.kind]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-black text-slate-950 leading-tight">{item.title}</div>
                        {item.detail && <div className="text-xs font-semibold text-slate-500 mt-1 line-clamp-2">{item.detail}</div>}
                        <div className="text-[11px] font-semibold text-slate-500 mt-1">
                          {item.date.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })} · {item.person}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {items.length > 4 && (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="w-full min-h-10 rounded-xl border border-stone-200 bg-white text-sm font-bold text-sky-700 active:scale-[0.99] hover:bg-sky-50"
            >
              {expanded ? 'Sbalit aktivity' : `Zobrazit vše (${items.length})`}
            </button>
          )}
        </div>
      )}
      {selectedItem && (
        <ActivityDetailCard
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onContinue={() => {
            const path = selectedItem.path;
            setSelectedItem(null);
            onNavigate(path);
          }}
          onEdit={() => {
            const path = withMode(selectedItem.path, 'edit');
            setSelectedItem(null);
            onNavigate(path);
          }}
        />
      )}
    </section>
  );
}

// ═══════════════════════════════════════════════════════
// KIOSK DASHBOARD (OPERATOR role) — unchanged
// ═══════════════════════════════════════════════════════

function KioskDashboard() {
  const navigate = useNavigate();
  const { logout } = useAuthContext();
  const stats = useDashboardStats();

  return (
    <div className="min-h-screen bg-[#0f172a] flex flex-col">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[300px] h-[300px] md:w-[500px] md:h-[500px] bg-blue-500/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[300px] h-[300px] md:w-[500px] md:h-[500px] bg-purple-500/20 rounded-full blur-[120px]" />
      </div>
      <div className="relative z-10 flex flex-col min-h-screen">
        <header className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-[#1e3a5f] to-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/25">
              <Settings className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{appConfig.BRAND_NAME}</h1>
              <p className="text-slate-400 text-sm flex items-center gap-2">
                <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                Kiosek
              </p>
            </div>
          </div>
          <button onClick={() => logout()} className="p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition">
            <LogOut className="w-5 h-5 text-slate-400" />
          </button>
        </header>

        {stats.loading && (
          <div className="px-6 mb-6 flex items-center gap-3 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" /><span className="text-sm">Načítám data...</span>
          </div>
        )}

        <section className="px-6 flex-1 flex flex-col gap-5">
          <button onClick={() => navigate('/tasks?new=1')}
            className="flex-1 min-h-[140px] bg-gradient-to-br from-red-500/30 to-rose-600/20 backdrop-blur-xl rounded-3xl border-2 border-red-500/40 p-8 flex items-center gap-6 hover:from-red-500/40 hover:to-rose-600/30 transition-all active:scale-[0.98] shadow-xl shadow-red-500/10">
            <div className="w-20 h-20 bg-gradient-to-br from-red-500 to-rose-600 rounded-2xl flex items-center justify-center shadow-lg shadow-red-500/40 flex-shrink-0">
              <AlertTriangle className="w-10 h-10 text-white" />
            </div>
            <div className="text-left">
              <h2 className="text-2xl font-bold text-white mb-1">Nahlásit chybu</h2>
              <p className="text-red-300/70 text-lg">Stroj nefunguje?</p>
            </div>
          </button>

          <button onClick={() => navigate('/inspections')}
            className="flex-1 min-h-[120px] bg-gradient-to-br from-emerald-500/20 to-teal-600/10 backdrop-blur-xl rounded-3xl border border-emerald-500/30 p-8 flex items-center gap-6 hover:from-emerald-500/30 hover:to-teal-600/20 transition-all active:scale-[0.98]">
            <div className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/30 flex-shrink-0">
              <ClipboardCheck className="w-10 h-10 text-white" />
            </div>
            <div className="text-left">
              <h2 className="text-2xl font-bold text-white mb-1">Kontroly</h2>
              <p className="text-emerald-300/70 text-lg">Denní obchůzka</p>
            </div>
          </button>

          <button onClick={() => navigate('/kartoteka')}
            className="flex-1 min-h-[120px] bg-gradient-to-br from-blue-500/20 to-indigo-600/10 backdrop-blur-xl rounded-3xl border border-blue-500/30 p-8 flex items-center gap-6 hover:from-blue-500/30 hover:to-indigo-600/20 transition-all active:scale-[0.98]">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30 flex-shrink-0">
              <Wrench className="w-10 h-10 text-white" />
            </div>
            <div className="text-left">
              <h2 className="text-2xl font-bold text-white mb-1">Kartotéka</h2>
              <p className="text-blue-300/70 text-lg">{stats.totalAssets} zařízení</p>
            </div>
          </button>
        </section>

        <footer className="px-6 py-6 mt-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 text-center border border-white/10">
              <div className="text-2xl font-bold text-orange-400">{stats.openTasks}</div>
              <div className="text-xs text-slate-400 mt-1">Otevřené úkoly</div>
            </div>
            <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 text-center border border-white/10">
              <div className="text-2xl font-bold text-emerald-400">{stats.operationalAssets}</div>
              <div className="text-xs text-slate-400 mt-1">Stroje OK</div>
            </div>
            <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 text-center border border-white/10">
              <div className="text-2xl font-bold text-red-400">{stats.criticalTasks}</div>
              <div className="text-xs text-slate-400 mt-1">Havárie</div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// FULL DASHBOARD — Widget Grid System
// ═══════════════════════════════════════════════════════

function FullDashboard() {
  const navigate = useNavigate();
  const { user, logout, isSandbox, hasPermission } = useAuthContext();
  const rawStats = useDashboardStats();
  const todayOps = useTodayOperations();
  const activity = useActivityTimeline();
  const tenantId = (user as any)?.tenantId || 'main_firm';
  const vacationAlerts = useVacationAlerts(tenantId);
  const gearboxDashboard = useGearboxDashboard(tenantId);

  // Sandbox: override stats with mock data + show welcome toast
  const stats = isSandbox ? { ...SANDBOX_STATS } : rawStats;
  useEffect(() => {
    if (isSandbox) {
      initSandboxMockData();
      showToast('REŽIM UČNĚ: Změny se ukládají pouze dočasně.', 'success');
    }
  }, [isSandbox]);

  // Recurring tasks for today's reminder strip
  const recurringToday = useRecurringToday();

  // Widget config (Firestore + localStorage + role defaults)
  const { widgets, loading: configLoading } = useDashboardConfig(
    user?.id,
    user?.role ?? 'VYROBA'
  );

  // Live data hooks
  const fleet = useFleet();
  const inventory = useInventory();
  const revisions = useRevisions();
  const inspections = useInspections();

  // Clock
  const [time, setTime] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setTime(new Date()), 60000); return () => clearInterval(t); }, []);

  // Quick action modals
  const [activeModal, setActiveModal] = useState<'idea' | 'request' | 'ai' | 'fault' | null>(null);

  // Tile data (defensive — all hook data accessed safely)
  const invStats = inventory?.stats ?? { low: 0, critical: 0, out: 0 };
  const lowStockCount = (invStats.low ?? 0) + (invStats.critical ?? 0) + (invStats.out ?? 0);
  const revStats = revisions?.stats ?? { expiring: 0, expired: 0, valid: 0 };
  const fleetStats = fleet?.stats ?? { available: 0, total: 0 };
  const inspStats = inspections?.stats ?? { percentDone: 0, ok: 0, defect: 0, total: 0 };
  const dashboardAlertCount = (stats.criticalTasks || 0)
    + ((stats as any).overdueTasks || 0)
    + (revStats.expired ?? 0)
    + (invStats.critical ?? 0)
    + (invStats.out ?? 0)
    + todayOps.todayDefects
    + vacationAlerts.todayVacations.length;

  const getTileData = (id: string): { value?: string; subtext?: string; badge?: number } => {
    switch (id) {
      case 'fault': return { subtext: 'Rychlé hlášení' };
      case 'tasks': return { value: String(stats.openTasks || 0), subtext: 'otevřených', badge: stats.criticalTasks > 0 ? stats.criticalTasks : undefined };
      case 'map': return { value: String(stats.totalAssets || 0), subtext: 'zařízení' };
      case 'revisions': return {
        value: String((revStats.expiring ?? 0) + (revStats.expired ?? 0)),
        subtext: `${revStats.valid ?? 0} platných`,
        badge: (revStats.expired ?? 0) > 0 ? revStats.expired : undefined,
      };
      case 'inventory': return {
        value: String(lowStockCount),
        subtext: lowStockCount > 0 ? 'pod limitem' : 'vše OK',
        badge: (invStats.out ?? 0) > 0 ? invStats.out : undefined,
      };
      case 'fleet': return { value: String(fleetStats.available ?? 0), subtext: `z ${fleetStats.total ?? 0} vozidel` };
      case 'hvac': return { subtext: 'filtry a výměny' };
      case 'dataloggers': return { subtext: 'denní teploty' };
      case 'inspections': return {
        value: `${inspStats.percentDone ?? 0}%`,
        subtext: `${(inspStats.ok ?? 0) + (inspStats.defect ?? 0)}/${inspStats.total ?? 0}`,
        badge: (inspStats.defect ?? 0) > 0 ? inspStats.defect : undefined,
      };
      case 'calendar': return { subtext: time.toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' }) };
      case 'ai': return { subtext: 'Asistent údržby' };
      case 'reports': return { subtext: 'Statistiky' };
      case 'idea': return { subtext: 'Zlepšení & nápady' };
      case 'request': return { subtext: 'Nářadí, materiál' };
      case 'noticeboard': return { subtext: 'Týmové zprávy' };
      case 'academy': return { subtext: 'Příručka & logika' };
      case 'admin': return { subtext: 'Uživatelé, role' };
      default: return {};
    }
  };

  // Tile click → navigate or open modal
  const handleTileClick = (tileId: string) => {
    const routes: Record<string, string> = {
      tasks: '/tasks', map: '/kartoteka', revisions: '/revisions',
      inventory: '/inventory', fleet: '/fleet', hvac: '/hvac', dataloggers: '/dataloggers',
      inspections: '/inspections', calendar: '/calendar', reports: '/reports', admin: '/admin',
      noticeboard: '/noticeboard', academy: '/academy',
      production: '/production', warehouse: '/warehouse', shifts: '/shifts',
    };
    if (routes[tileId]) { navigate(routes[tileId]); return; }
    if (tileId === 'ai') { setActiveModal('ai'); return; }
    if (tileId === 'fault') { setActiveModal('fault'); return; }
    if (tileId === 'idea') { setActiveModal('idea'); return; }
    if (tileId === 'request') { setActiveModal('request'); return; }
  };

  const greeting = () => {
    const h = time.getHours();
    if (h < 12) return 'Dobré ráno';
    if (h < 18) return 'Dobré odpoledne';
    return 'Dobrý večer';
  };

  const userName = user?.displayName?.split(' ')[0] || 'uživateli';

  // Feature flags — filter widgets by enabled modules for current role
  // Sandbox mode bypasses tenant restrictions: all modules enabled
  const FULL_WIDTH_IDS = useMemo(() => ['semaphore', 'top5', 'lemon'], []);
  const RETIRED_MODULE_IDS = useMemo(() => [
    'waste',
    'louparna',
    'map',
    'ai',
    'idea',
    'request',
    'noticeboard',
    'academy',
    'production',
    'warehouse',
    'shifts',
  ], []);
  const enabledModules = useMemo(() => {
    if (isSandbox) {
      return MODULE_DEFINITIONS.map(m => m.id).filter(id => !RETIRED_MODULE_IDS.includes(id));
    }
    const role = user?.role || 'VYROBA';
    // Try tenant-level modules from localStorage (synced by useTenantSettings)
    try {
      const tenantRaw = localStorage.getItem('nominal-tenant-modules');
      if (tenantRaw) {
        const tenantConfig = JSON.parse(tenantRaw) as Record<string, string[]>;
        const tenantId = (user as any)?.tenantId || 'main_firm';
        if (tenantConfig[tenantId]) return tenantConfig[tenantId].filter(id => !RETIRED_MODULE_IDS.includes(id));
      }
    } catch { /* ignore */ }
    // Fallback: role-level defaults
    try {
      const raw = localStorage.getItem('nominal-enabled-modules');
      if (raw) {
        const config = JSON.parse(raw) as Record<string, string[]>;
        if (config[role]) return config[role].filter(id => !RETIRED_MODULE_IDS.includes(id));
      }
    } catch { /* ignore */ }
    return (DEFAULT_ENABLED_MODULES[role as UserRole] ?? []).filter(id => !RETIRED_MODULE_IDS.includes(id));
  }, [user, isSandbox, RETIRED_MODULE_IDS]);

  const filteredWidgets = useMemo(() => {
    return widgets.filter(w => {
      if (RETIRED_MODULE_IDS.includes(w.widgetId)) return false;
      if (FULL_WIDTH_IDS.includes(w.widgetId)) return true;
      return enabledModules.includes(w.widgetId);
    });
  }, [widgets, enabledModules, FULL_WIDTH_IDS, RETIRED_MODULE_IDS]);

  return (
    <div className="dashboard-daylight min-h-screen bg-[#f1ece3] text-slate-950">
      <div className="max-w-6xl mx-auto px-3 pt-4 pb-24">

        {/* HEADER */}
        <div className="flex items-center justify-between mb-5 rounded-2xl border border-stone-200 bg-white px-4 py-3 shadow-sm shadow-stone-200/70">
          <div>
            <div className="text-[10px] text-emerald-700 uppercase tracking-widest font-bold">{appConfig.APP_NAME}</div>
            <h1 className="text-xl font-black text-slate-950 mt-0.5">{greeting()}, {userName}</h1>
            <div className="text-xs text-slate-500 mt-0.5">
              {time.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/notifications')}
              className="relative w-10 h-10 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-center text-slate-600 hover:text-emerald-700 transition"
              aria-label="Upozornění"
            >
              <Bell className="w-4 h-4" />
              {dashboardAlertCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-500 text-[10px] font-black text-white flex items-center justify-center">
                  {dashboardAlertCount > 9 ? '9+' : dashboardAlertCount}
                </span>
              )}
            </button>
            <button
              onClick={() => logout()}
              className="w-10 h-10 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-center text-slate-600 hover:text-red-700 transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* LOADING */}
        {(stats.loading || configLoading) && (
          <div className="flex items-center gap-2 mb-4 text-slate-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Načítám data...
          </div>
        )}

        <QuickActions onNavigate={(path) => {
          if (path === 'fault') {
            setActiveModal('fault');
            return;
          }
          navigate(path);
        }} />

        <OperationalAlerts
          newKioskTasks={(stats as any).newKioskTasks || 0}
          criticalTasks={stats.criticalTasks || 0}
          overdueTasks={(stats as any).overdueTasks || 0}
          expiredRevisions={revStats.expired ?? 0}
          expiringRevisions={revStats.expiring ?? 0}
          lowStockCount={lowStockCount}
          todayDefects={todayOps.todayDefects}
          todayAbsences={vacationAlerts.todayVacations.length}
          onNavigate={navigate}
        />

        <DailyOperations
          openTasks={stats.openTasks || 0}
          criticalTasks={stats.criticalTasks || 0}
          overdueTasks={(stats as any).overdueTasks || 0}
          todayLogs={todayOps.todayLogs}
          todayMinutes={todayOps.todayMinutes}
          todayDefects={todayOps.todayDefects}
          onNavigate={navigate}
        />

        <GearboxDashboardWidget
          data={gearboxDashboard}
          onNavigate={navigate}
          user={user as any}
          tenantId={tenantId}
          canWriteTemp={hasPermission('gearbox.temperature.write') || hasPermission('asset.update')}
          canReportProblem={hasPermission('wo.create')}
          canLogRepair={hasPermission('asset.update')}
        />

        <VacationNotice
          todayVacations={vacationAlerts.todayVacations}
          upcomingVacations={vacationAlerts.upcomingVacations}
          onNavigate={navigate}
        />

        <ModuleShortcuts onNavigate={navigate} />

        <OptionalActivityPanel
          todayItems={activity.todayItems}
          weekItems={activity.weekItems}
          onNavigate={navigate}
        />

        <AuditReadiness
          todayLogs={todayOps.todayLogs}
          openTasks={stats.openTasks || 0}
          todayDefects={todayOps.todayDefects}
          onNavigate={navigate}
        />

        <AiTipCard stats={stats} />
        <ReminderStrip tasks={recurringToday} onNavigate={() => navigate('/schedules')} />

        {!configLoading && filteredWidgets.length > 0 && (
          <SecondaryModules
            widgets={filteredWidgets}
            getTileData={getTileData}
            onTileClick={handleTileClick}
          />
        )}
      </div>

      {/* ACTION MODALS */}
      <FaultReportModal
        isOpen={activeModal === 'fault'}
        onClose={() => setActiveModal(null)}
        userId={user?.id || 'unknown'}
        userName={user?.displayName || 'Neznámý'}
      />
      <IdeaModal
        isOpen={activeModal === 'idea'}
        onClose={() => setActiveModal(null)}
        userId={user?.id || 'unknown'}
        userName={user?.displayName || 'Neznámý'}
      />
      <RequestModal
        isOpen={activeModal === 'request'}
        onClose={() => setActiveModal(null)}
        userId={user?.id || 'unknown'}
        userName={user?.displayName || 'Neznámý'}
      />
      <AiModal
        isOpen={activeModal === 'ai'}
        onClose={() => setActiveModal(null)}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════

export default function DashboardPage() {
  const { user } = useAuthContext();
  if (user?.role === 'OPERATOR') return <KioskDashboard />;
  return <FullDashboard />;
}
