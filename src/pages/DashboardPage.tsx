// src/pages/DashboardPage.tsx
// VIKRR — Asset Shield — Dashboard (refactored: widget system)

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthContext } from '../context/AuthContext';
import { useFleet } from '../hooks/useFleet';
import { useWaste } from '../hooks/useWaste';
import { useInventory } from '../hooks/useInventory';
import { useLouparna } from '../hooks/useLouparna';
import { useRevisions } from '../hooks/useRevisions';
import { useInspections } from '../hooks/useInspections';
import { useDashboardConfig } from '../hooks/useDashboardConfig';
import {
  Settings, AlertTriangle, LogOut, Loader2, ClipboardCheck, Map,
  Edit3, LayoutGrid, Sparkles,
} from 'lucide-react';
import appConfig from '../appConfig';
import { DEFAULT_ENABLED_MODULES, MODULE_DEFINITIONS } from '../types/user';
import type { UserRole } from '../types/user';
import { SANDBOX_STATS, initSandboxMockData } from '../lib/sandboxDb';
import { showToast } from '../components/ui/Toast';

// Dashboard components
import DashboardGrid from '../components/dashboard/DashboardGrid';
import FaultReportModal from '../components/dashboard/FaultReportModal';
import IdeaModal from '../components/dashboard/IdeaModal';
import RequestModal from '../components/dashboard/RequestModal';
import WasteModal from '../components/dashboard/WasteModal';
import AiModal from '../components/dashboard/AiModal';

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
            className="flex-shrink-0 w-[140px] bg-gradient-to-br from-orange-500/15 to-amber-500/10 border border-orange-500/25 rounded-xl p-3 flex flex-col gap-1"
          >
            <span className="text-[10px] text-orange-400/70 font-bold">{t.time}</span>
            <span className="text-xs font-semibold text-white leading-tight line-clamp-2">{t.title}</span>
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
  { condition: (s: { criticalTasks: number }) => s.criticalTasks > 0, tip: 'Máte P1 havárii — ověřte dostupnost náhradních dílů ve skladu.', color: 'from-red-500/15 to-rose-500/10', border: 'border-red-500/25' },
  { condition: (s: { breakdownAssets: number }) => s.breakdownAssets > 1, tip: 'Více strojů mimo provoz — zvažte prioritizaci dle dopadu na výrobu.', color: 'from-orange-500/15 to-amber-500/10', border: 'border-orange-500/25' },
  { condition: (s: { maintenanceAssets: number }) => s.maintenanceAssets > 2, tip: 'Několik strojů v servisu — zkontrolujte, zda nechybí naplánované revize.', color: 'from-amber-500/15 to-yellow-500/10', border: 'border-amber-500/25' },
  { condition: (s: { openTasks: number }) => s.openTasks > 20, tip: 'Vysoký počet otevřených úkolů — prioritizujte backlog a uzavřete staré záznamy.', color: 'from-blue-500/15 to-sky-500/10', border: 'border-blue-500/25' },
  { condition: (s: { inProgress: number }) => s.inProgress > 5, tip: 'Mnoho paralelních úkolů — lepší dokončit rozpracované než začínat nové.', color: 'from-violet-500/15 to-purple-500/10', border: 'border-violet-500/25' },
  { condition: () => true, tip: 'Pravidelná preventivní údržba snižuje výskyt havárií až o 40%.', color: 'from-emerald-500/15 to-teal-500/10', border: 'border-emerald-500/25' },
];

function AiTipCard({ stats }: { stats: { criticalTasks: number; breakdownAssets: number; maintenanceAssets: number; openTasks: number; inProgress: number } }) {
  const tip = AI_TIPS.find((t) => t.condition(stats)) || AI_TIPS[AI_TIPS.length - 1];
  return (
    <div className={`my-2 bg-gradient-to-r ${tip.color} border ${tip.border} rounded-xl p-3 flex items-start gap-2.5`}>
      <Sparkles className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
      <div>
        <div className="text-[10px] text-amber-400/70 font-bold uppercase tracking-wider mb-0.5">AI Tip</div>
        <div className="text-xs text-white/90 leading-relaxed">{tip.tip}</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// FIREBASE HOOKS (LIVE DATA)
// ═══════════════════════════════════════════════════════

function useDashboardStats() {
  const [stats, setStats] = useState({
    openTasks: 0, criticalTasks: 0, urgentTasks: 0, newReports: 0,
    totalAssets: 0, operationalAssets: 0, maintenanceAssets: 0, breakdownAssets: 0,
    upcomingRevisions: 0, inProgress: 0, loading: true,
  });

  useEffect(() => {
    const unsubs: (() => void)[] = [];

    const tq = query(collection(db, 'tasks'), where('status', 'in', ['backlog', 'planned', 'in_progress', 'paused']));
    unsubs.push(onSnapshot(tq, (snap) => {
      let c = 0, u = 0, b = 0, ip = 0;
      snap.docs.forEach((d) => {
        const data = d.data();
        if (data.priority === 'P1') c++;
        if (data.priority === 'P2') u++;
        if (data.status === 'backlog') b++;
        if (data.status === 'in_progress') ip++;
      });
      setStats((p) => ({ ...p, openTasks: snap.size, criticalTasks: c, urgentTasks: u, newReports: b, inProgress: ip, loading: false }));
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
    const rq = query(collection(db, 'revisions'), where('nextRevisionAt', '<=', in30));
    unsubs.push(onSnapshot(rq, (snap) => {
      setStats((p) => ({ ...p, upcomingRevisions: snap.size }));
    }, (err) => console.error('[Dashboard] revisions error:', err)));

    return () => unsubs.forEach((u) => u());
  }, []);

  return stats;
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
              <h1 className="text-2xl font-black tracking-tight text-white">{appConfig.BRAND_NAME}</h1>
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
            <Loader2 className="w-5 h-5 animate-spin" /><span className="text-sm">Nacitam data...</span>
          </div>
        )}

        <section className="px-6 flex-1 flex flex-col gap-5">
          <button onClick={() => navigate('/tasks?new=1')}
            className="flex-1 min-h-[140px] bg-gradient-to-br from-red-500/30 to-rose-600/20 backdrop-blur-xl rounded-3xl border-2 border-red-500/40 p-8 flex items-center gap-6 hover:from-red-500/40 hover:to-rose-600/30 transition-all active:scale-[0.98] shadow-xl shadow-red-500/10">
            <div className="w-20 h-20 bg-gradient-to-br from-red-500 to-rose-600 rounded-2xl flex items-center justify-center shadow-lg shadow-red-500/40 flex-shrink-0">
              <AlertTriangle className="w-10 h-10 text-white" />
            </div>
            <div className="text-left">
              <h2 className="text-2xl font-bold text-white mb-1">Nahlasit chybu</h2>
              <p className="text-red-300/70 text-lg">Stroj nefunguje?</p>
            </div>
          </button>

          <button onClick={() => navigate('/inspection')}
            className="flex-1 min-h-[120px] bg-gradient-to-br from-emerald-500/20 to-teal-600/10 backdrop-blur-xl rounded-3xl border border-emerald-500/30 p-8 flex items-center gap-6 hover:from-emerald-500/30 hover:to-teal-600/20 transition-all active:scale-[0.98]">
            <div className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/30 flex-shrink-0">
              <ClipboardCheck className="w-10 h-10 text-white" />
            </div>
            <div className="text-left">
              <h2 className="text-2xl font-bold text-white mb-1">Kontrola budov</h2>
              <p className="text-emerald-300/70 text-lg">Denni obchuzka</p>
            </div>
          </button>

          <button onClick={() => navigate('/map')}
            className="flex-1 min-h-[120px] bg-gradient-to-br from-blue-500/20 to-indigo-600/10 backdrop-blur-xl rounded-3xl border border-blue-500/30 p-8 flex items-center gap-6 hover:from-blue-500/30 hover:to-indigo-600/20 transition-all active:scale-[0.98]">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30 flex-shrink-0">
              <Map className="w-10 h-10 text-white" />
            </div>
            <div className="text-left">
              <h2 className="text-2xl font-bold text-white mb-1">Mapa stroju</h2>
              <p className="text-blue-300/70 text-lg">{stats.totalAssets} zarizeni</p>
            </div>
          </button>
        </section>

        <footer className="px-6 py-6 mt-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 text-center border border-white/10">
              <div className="text-2xl font-bold text-orange-400">{stats.openTasks}</div>
              <div className="text-xs text-slate-400 mt-1">Otevrene ukoly</div>
            </div>
            <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 text-center border border-white/10">
              <div className="text-2xl font-bold text-emerald-400">{stats.operationalAssets}</div>
              <div className="text-xs text-slate-400 mt-1">Stroje OK</div>
            </div>
            <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 text-center border border-white/10">
              <div className="text-2xl font-bold text-red-400">{stats.criticalTasks}</div>
              <div className="text-xs text-slate-400 mt-1">Havarie</div>
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
  const { user, logout, isSandbox } = useAuthContext();
  const rawStats = useDashboardStats();

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
  const { widgets, loading: configLoading, updateWidgets } = useDashboardConfig(
    user?.id,
    user?.role ?? 'VYROBA'
  );

  // Live data hooks
  const fleet = useFleet();
  const waste = useWaste();
  const inventory = useInventory();
  const louparna = useLouparna();
  const revisions = useRevisions();
  const inspections = useInspections();

  // Clock
  const [time, setTime] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setTime(new Date()), 60000); return () => clearInterval(t); }, []);

  // Edit mode
  const [isEditing, setIsEditing] = useState(false);

  // Quick action modals
  const [activeModal, setActiveModal] = useState<'idea' | 'request' | 'waste' | 'ai' | 'fault' | null>(null);

  // HUD filter state
  const [showHudFilter, setShowHudFilter] = useState(false);
  const [hudFilterBuilding, setHudFilterBuilding] = useState('ALL');
  const [hudFilterStatus, setHudFilterStatus] = useState('ALL');
  const [hudFilterSeverity, setHudFilterSeverity] = useState('ALL');

  // Tile data (defensive — all hook data accessed safely)
  const invStats = inventory?.stats ?? { low: 0, critical: 0, out: 0 };
  const lowStockCount = (invStats.low ?? 0) + (invStats.critical ?? 0) + (invStats.out ?? 0);
  const revStats = revisions?.stats ?? { expiring: 0, expired: 0, valid: 0 };
  const fleetStats = fleet?.stats ?? { available: 0, total: 0 };
  const wasteStats = waste?.stats ?? { red: 0, green: 0 };
  const loupStats = louparna?.productionStats ?? { avgYield: 0 };
  const inspStats = inspections?.stats ?? { percentDone: 0, ok: 0, defect: 0, total: 0 };

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
      case 'waste': return { value: String(wasteStats.red ?? 0), subtext: `${wasteStats.green ?? 0} OK` };
      case 'fleet': return { value: String(fleetStats.available ?? 0), subtext: `z ${fleetStats.total ?? 0} vozidel` };
      case 'louparna': return { value: `${loupStats.avgYield ?? 0}%`, subtext: louparna?.currentBatch ? 'AKTIVNI' : 'výtěžnost' };
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
      tasks: '/tasks', map: '/map', revisions: '/revisions',
      inventory: '/inventory', waste: '/waste', fleet: '/fleet', louparna: '/louparna',
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
  const isAdmin = (['MAJITEL', 'VEDENI', 'SUPERADMIN', 'UDRZBA'] as string[]).includes(user?.role || '');

  // Feature flags — filter widgets by enabled modules for current role
  // Sandbox mode bypasses tenant restrictions: all modules enabled
  const FULL_WIDTH_IDS = ['semaphore', 'hud', 'top5', 'lemon'];
  const enabledModules = useMemo(() => {
    if (isSandbox) {
      return MODULE_DEFINITIONS.map(m => m.id);
    }
    const role = user?.role || 'VYROBA';
    // Try tenant-level modules from localStorage (synced by useTenantSettings)
    try {
      const tenantRaw = localStorage.getItem('nominal-tenant-modules');
      if (tenantRaw) {
        const tenantConfig = JSON.parse(tenantRaw) as Record<string, string[]>;
        const tenantId = (user as any)?.tenantId || 'main_firm';
        if (tenantConfig[tenantId]) return tenantConfig[tenantId];
      }
    } catch { /* ignore */ }
    // Fallback: role-level defaults
    try {
      const raw = localStorage.getItem('nominal-enabled-modules');
      if (raw) {
        const config = JSON.parse(raw) as Record<string, string[]>;
        if (config[role]) return config[role];
      }
    } catch { /* ignore */ }
    return DEFAULT_ENABLED_MODULES[role as UserRole] ?? [];
  }, [user?.role, isSandbox]);

  const filteredWidgets = useMemo(() => {
    return widgets.filter(w => {
      if (FULL_WIDTH_IDS.includes(w.widgetId)) return true;
      return enabledModules.includes(w.widgetId);
    });
  }, [widgets, enabledModules]);

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="max-w-4xl mx-auto px-3 pt-4 pb-24">

        {/* HEADER */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">{appConfig.APP_NAME}</div>
            <h1 className="text-xl font-bold text-white mt-0.5">{greeting()}, {userName}</h1>
            <div className="text-xs text-slate-500 mt-0.5">
              {time.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsEditing(!isEditing)}
              title="Upravit rozvržení dlaždic"
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition ${
                isEditing
                  ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/25'
                  : 'bg-white/10 border border-white/15 text-white hover:bg-white/15'
              }`}
            >
              {isEditing ? <LayoutGrid className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
              {isEditing ? 'Hotovo' : 'Upravit'}
            </button>
            <button
              onClick={() => logout()}
              className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition"
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

        {/* HUD FILTER PANEL */}
        {isAdmin && !isEditing && showHudFilter && (
          <div className="bg-slate-800/80 rounded-2xl p-4 border border-orange-500/20 mb-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Filtry</span>
              <button
                onClick={() => { setHudFilterBuilding('ALL'); setHudFilterStatus('ALL'); setHudFilterSeverity('ALL'); }}
                className="text-[10px] text-orange-400 hover:text-orange-300 font-semibold"
              >
                Resetovat
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-slate-500 uppercase font-bold block mb-1">Budova</label>
                <select
                  value={hudFilterBuilding}
                  onChange={(e) => setHudFilterBuilding(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-orange-500/50"
                >
                  <option value="ALL">Vše</option>
                  {['A', 'B', 'C', 'D', 'E', 'L'].map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase font-bold block mb-1">Stav</label>
                <select
                  value={hudFilterStatus}
                  onChange={(e) => setHudFilterStatus(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-orange-500/50"
                >
                  <option value="ALL">Vše</option>
                  <option value="backlog">Backlog</option>
                  <option value="planned">Plánováno</option>
                  <option value="in_progress">Probíhá</option>
                  <option value="paused">Pozastaveno</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase font-bold block mb-1">Závažnost</label>
                <select
                  value={hudFilterSeverity}
                  onChange={(e) => setHudFilterSeverity(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-orange-500/50"
                >
                  <option value="ALL">Vše</option>
                  <option value="P1">P1 — Havárie</option>
                  <option value="P2">P2 — Urgentní</option>
                  <option value="P3">P3 — Běžná</option>
                  <option value="P4">P4 — Nápad</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* DASHBOARD GRID */}
        {!configLoading && filteredWidgets.length > 0 && (
          <DashboardGrid
            widgets={filteredWidgets}
            isEditing={isEditing}
            onConfigChange={updateWidgets}
            semaphoreStats={{
              breakdownAssets: stats.breakdownAssets,
              criticalTasks: stats.criticalTasks,
              maintenanceAssets: stats.maintenanceAssets,
            }}
            wasteRed={wasteStats.red ?? 0}
            onFilterToggle={() => setShowHudFilter(!showHudFilter)}
            hasActiveFilter={hudFilterBuilding !== 'ALL' || hudFilterStatus !== 'ALL' || hudFilterSeverity !== 'ALL'}
            getTileData={getTileData}
            onTileClick={handleTileClick}
            isAdmin={isAdmin}
            afterTopSlot={<>
              <AiTipCard stats={stats} />
              <ReminderStrip tasks={recurringToday} onNavigate={() => navigate('/schedules')} />
            </>}
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
      <WasteModal
        isOpen={activeModal === 'waste'}
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
