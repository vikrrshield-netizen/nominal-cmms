import { useState, useEffect } from 'react';
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
import {
  Settings, AlertTriangle, LogOut, Loader2, ClipboardCheck, Map,
  X, Edit3, LayoutGrid, Play, CheckCircle2, Sparkles, Send,
} from 'lucide-react';
import { createTask, startTask, completeTask, subscribeToActiveTasks } from '../services/taskService';
import appConfig from '../appConfig';
import type { TaskDoc } from '../types/firestore';
import BottomSheet, { FormField, SubmitButton } from '../components/ui/BottomSheet';
import { useStats } from '../hooks/useStats';
import type { LemonEntry } from '../hooks/useStats';

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
// KIOSK DASHBOARD (OPERATOR role)
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
// TILE DEFINITIONS
// ═══════════════════════════════════════════════════════

interface TileDef {
  id: string;
  icon: string;
  label: string;
  gradient: string;
}

const TILE_DEFS: TileDef[] = [
  { id: 'fault',       icon: '🚨', label: 'Nahlásit poruchu', gradient: 'from-red-500 to-rose-600' },
  { id: 'tasks',       icon: '📋', label: 'Úkoly',            gradient: 'from-orange-500 to-amber-600' },
  { id: 'map',         icon: '🗺️', label: 'Mapa areálu',      gradient: 'from-blue-500 to-indigo-600' },
  { id: 'revisions',   icon: '🔍', label: 'Revize',           gradient: 'from-purple-500 to-violet-600' },
  { id: 'inventory',   icon: '📦', label: 'Sklad ND',         gradient: 'from-emerald-500 to-teal-600' },
  { id: 'waste',       icon: '♻️', label: 'Odpady',            gradient: 'from-yellow-500 to-amber-600' },
  { id: 'fleet',       icon: '🚗', label: 'Vozidla',          gradient: 'from-cyan-500 to-blue-600' },
  { id: 'louparna',    icon: '🌾', label: 'Loupárna',         gradient: 'from-lime-500 to-green-600' },
  { id: 'inspections', icon: '✅', label: 'Kontroly',         gradient: 'from-teal-500 to-emerald-600' },
  { id: 'calendar',    icon: '📅', label: 'Kalendář',         gradient: 'from-indigo-500 to-purple-600' },
  { id: 'ai',          icon: '🤖', label: 'VIKRR AI',          gradient: 'from-pink-500 to-rose-600' },
  { id: 'reports',     icon: '📊', label: 'Reporty',          gradient: 'from-slate-500 to-gray-600' },
  { id: 'idea',        icon: '💡', label: 'Nápad',            gradient: 'from-violet-500 to-purple-600' },
  { id: 'request',     icon: '🔧', label: 'Požadavky',        gradient: 'from-sky-500 to-blue-600' },
  { id: 'admin',       icon: '⚙️', label: 'Administrace',     gradient: 'from-gray-500 to-slate-600' },
];

const DEFAULT_ORDER = TILE_DEFS.map(t => t.id);

// ═══════════════════════════════════════════════════════
// DASHBOARD CONFIG (localStorage)
// ═══════════════════════════════════════════════════════

interface DashConfig {
  tileOrder: string[];
  hiddenTiles: string[];
}

function loadDashConfig(): DashConfig {
  try {
    const raw = localStorage.getItem('vikrr-dash-v1');
    if (raw) {
      const parsed = JSON.parse(raw);
      const tileOrder = Array.isArray(parsed?.tileOrder) ? parsed.tileOrder : [];
      const hiddenTiles = Array.isArray(parsed?.hiddenTiles) ? parsed.hiddenTiles : [];
      const allIds = new Set(DEFAULT_ORDER);
      const existing = new Set([...tileOrder, ...hiddenTiles]);
      const missing = DEFAULT_ORDER.filter(id => !existing.has(id));
      return {
        tileOrder: [...tileOrder.filter((id: string) => allIds.has(id)), ...missing],
        hiddenTiles: hiddenTiles.filter((id: string) => allIds.has(id)),
      };
    }
  } catch { /* ignore */ }
  return { tileOrder: [...DEFAULT_ORDER], hiddenTiles: [] };
}

function saveDashConfig(c: DashConfig) {
  localStorage.setItem('vikrr-dash-v1', JSON.stringify(c));
}

// ═══════════════════════════════════════════════════════
// JIGGLE CSS
// ═══════════════════════════════════════════════════════

const JIGGLE_CSS = `
@keyframes nominalJiggle {
  0%, 100% { transform: rotate(-0.7deg) scale(1); }
  25% { transform: rotate(0.7deg) scale(1.01); }
  50% { transform: rotate(-0.5deg) scale(1); }
  75% { transform: rotate(0.5deg) scale(0.99); }
}
.tile-jiggle { animation: nominalJiggle 0.3s ease-in-out infinite; }
.tile-jiggle:nth-child(2n) { animation-delay: 0.05s; }
.tile-jiggle:nth-child(3n) { animation-delay: 0.1s; }
`;

// ═══════════════════════════════════════════════════════
// SEMAPHORE WIDGET — Critical machines, Active incidents, Waste
// ═══════════════════════════════════════════════════════

function SemaphoreWidget({ stats, wasteRed }: {
  stats: { breakdownAssets: number; criticalTasks: number; maintenanceAssets: number };
  wasteRed: number;
}) {
  const criticalTotal = stats.breakdownAssets + stats.criticalTasks;
  const items = [
    {
      label: 'Kritické',
      value: criticalTotal,
      color: criticalTotal > 0 ? 'bg-red-500' : 'bg-emerald-500',
      textColor: criticalTotal > 0 ? 'text-red-400' : 'text-emerald-400',
      bgColor: criticalTotal > 0 ? 'bg-red-500/10 border-red-500/30' : 'bg-emerald-500/10 border-emerald-500/30',
    },
    {
      label: 'Údržba',
      value: stats.maintenanceAssets,
      color: stats.maintenanceAssets > 0 ? 'bg-amber-500' : 'bg-emerald-500',
      textColor: stats.maintenanceAssets > 0 ? 'text-amber-400' : 'text-emerald-400',
      bgColor: stats.maintenanceAssets > 0 ? 'bg-amber-500/10 border-amber-500/30' : 'bg-emerald-500/10 border-emerald-500/30',
    },
    {
      label: 'Odpady',
      value: wasteRed,
      color: wasteRed > 0 ? 'bg-orange-500' : 'bg-emerald-500',
      textColor: wasteRed > 0 ? 'text-orange-400' : 'text-emerald-400',
      bgColor: wasteRed > 0 ? 'bg-orange-500/10 border-orange-500/30' : 'bg-emerald-500/10 border-emerald-500/30',
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-1 mb-4">
      {items.map((item) => (
        <div key={item.label} className={`rounded-xl p-1 border ${item.bgColor} text-center`}>
          <div className="flex items-center justify-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${item.color} ${item.value > 0 ? 'animate-pulse' : ''}`} />
            <span className={`text-lg font-bold leading-none ${item.textColor}`}>{item.value}</span>
          </div>
          <div className="text-[9px] text-slate-500 mt-0.5">{item.label}</div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// TOP 5 TASKS WIDGET — Interactive daily tasks
// ═══════════════════════════════════════════════════════

function Top5TasksWidget() {
  const [tasks, setTasks] = useState<TaskDoc[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const unsub = subscribeToActiveTasks((allTasks) => {
      // Top 5 sorted by priority then date
      const sorted = allTasks
        .sort((a, b) => {
          const pOrder: Record<string, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };
          return (pOrder[a.priority] ?? 9) - (pOrder[b.priority] ?? 9);
        })
        .slice(0, 5);
      setTasks(sorted);
    });
    return () => unsub();
  }, []);

  const handleStart = async (taskId: string) => {
    setActionLoading(taskId);
    try { await startTask(taskId); } catch (e) { console.error(e); }
    setActionLoading(null);
  };

  const handleComplete = async (taskId: string) => {
    setActionLoading(taskId);
    try { await completeTask(taskId); } catch (e) { console.error(e); }
    setActionLoading(null);
  };

  const PRIORITY_COLORS: Record<string, string> = {
    P1: 'bg-red-500',
    P2: 'bg-orange-500',
    P3: 'bg-blue-500',
    P4: 'bg-slate-500',
  };

  const STATUS_LABELS: Record<string, string> = {
    backlog: 'Backlog',
    planned: 'Plánováno',
    in_progress: 'Probíhá',
    paused: 'Pozastaveno',
  };

  if (tasks.length === 0) {
    return (
      <div className="bg-slate-800/60 rounded-2xl p-4 border border-slate-700/50 mb-4">
        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Top úkoly</h2>
        <div className="text-center py-4 text-slate-600 text-sm">Žádné aktivní úkoly</div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/60 rounded-2xl p-4 border border-slate-700/50 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Top 5 úkolů</h2>
        <button onClick={() => navigate('/tasks')} className="text-[11px] text-orange-400 hover:text-orange-300 font-semibold">
          Vše →
        </button>
      </div>
      <div className="space-y-2">
        {tasks.map((task) => (
          <div key={task.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition">
            <div className={`w-2 h-8 rounded-full flex-shrink-0 ${PRIORITY_COLORS[task.priority] || 'bg-slate-500'}`} />
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium text-white truncate">{task.title}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-slate-500 font-mono">{task.code}</span>
                <span className="text-[10px] text-slate-600">•</span>
                <span className="text-[10px] text-slate-500">{STATUS_LABELS[task.status] || task.status}</span>
              </div>
            </div>
            <div className="flex gap-1.5 flex-shrink-0">
              {(task.status === 'backlog' || task.status === 'planned') && (
                <button
                  onClick={() => handleStart(task.id)}
                  disabled={actionLoading === task.id}
                  className="px-2.5 py-1.5 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-400 text-[11px] font-semibold hover:bg-blue-500/25 transition flex items-center gap-1"
                >
                  {actionLoading === task.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                  Přebrat
                </button>
              )}
              {task.status === 'in_progress' && (
                <button
                  onClick={() => handleComplete(task.id)}
                  disabled={actionLoading === task.id}
                  className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[11px] font-semibold hover:bg-emerald-500/25 transition flex items-center gap-1"
                >
                  {actionLoading === task.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                  Dokončit
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// OPERATIONAL HUD — MTTR, MTBF, Work Type Distribution
// ═══════════════════════════════════════════════════════

function OperationalHUD() {
  const stats = useStats();

  if (stats.loading) return null;

  const formatDuration = (minutes: number): string => {
    if (minutes <= 0) return '—';
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h < 24) return `${h}h ${m}m`;
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h`;
  };

  const workTypes = Object.entries(stats.workTypeDistribution)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  const totalForBar = workTypes.reduce((s, [, v]) => s + v, 0) || 1;

  const WORK_COLORS: Record<string, string> = {
    'Údržba': 'bg-blue-500',
    'Projekt/Milan': 'bg-purple-500',
    'Revize': 'bg-amber-500',
    'Sanitace': 'bg-emerald-500',
    'Nespecifikováno': 'bg-slate-500',
  };

  return (
    <div className="bg-slate-800/60 rounded-2xl p-4 border border-slate-700/50 mb-4">
      <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Operational HUD</h2>

      {/* KPI Row */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <div className="bg-white/[0.03] rounded-xl p-2.5 text-center border border-white/[0.06]">
          <div className="text-lg font-bold text-blue-400">{stats.activeTickets}</div>
          <div className="text-[9px] text-slate-500">Aktivní</div>
        </div>
        <div className="bg-white/[0.03] rounded-xl p-2.5 text-center border border-white/[0.06]">
          <div className={`text-lg font-bold ${stats.criticalTickets > 0 ? 'text-red-400 animate-pulse' : 'text-emerald-400'}`}>{stats.criticalTickets}</div>
          <div className="text-[9px] text-slate-500">P1 Kritické</div>
        </div>
        <div className="bg-white/[0.03] rounded-xl p-2.5 text-center border border-white/[0.06]">
          <div className="text-lg font-bold text-amber-400">{formatDuration(stats.mttrMinutes)}</div>
          <div className="text-[9px] text-slate-500">MTTR</div>
        </div>
        <div className="bg-white/[0.03] rounded-xl p-2.5 text-center border border-white/[0.06]">
          <div className="text-lg font-bold text-cyan-400">{formatDuration(stats.totalLaborMinutes)}</div>
          <div className="text-[9px] text-slate-500">Celkem práce</div>
        </div>
      </div>

      {/* Work Type Distribution Bar */}
      {workTypes.length > 0 && (
        <div>
          <div className="text-[10px] text-slate-500 uppercase font-bold mb-1.5">Typ práce</div>
          <div className="h-3 flex rounded-full overflow-hidden mb-2">
            {workTypes.map(([type, count]) => (
              <div
                key={type}
                className={`${WORK_COLORS[type] || 'bg-slate-600'} transition-all`}
                style={{ width: `${(count / totalForBar) * 100}%` }}
                title={`${type}: ${count}`}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {workTypes.map(([type, count]) => (
              <div key={type} className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${WORK_COLORS[type] || 'bg-slate-600'}`} />
                <span className="text-[10px] text-slate-400">{type} ({count})</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// LEMON LIST — Top 5 worst assets (most P1/P2 issues)
// ═══════════════════════════════════════════════════════

function LemonListWidget() {
  const stats = useStats();
  const navigate = useNavigate();

  if (stats.loading || stats.lemonList.length === 0) return null;

  return (
    <div className="bg-slate-800/60 rounded-2xl p-4 border border-slate-700/50 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
          <span>🍋</span> Lemon List
        </h2>
        <span className="text-[10px] text-slate-600">posledních 30 dní</span>
      </div>
      <div className="space-y-2">
        {stats.lemonList.map((entry: LemonEntry, idx: number) => (
          <div
            key={entry.assetId}
            className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition cursor-pointer"
            onClick={() => navigate(`/asset/${entry.assetId}`)}
          >
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold ${
              idx === 0 ? 'bg-red-500/20 text-red-400' :
              idx === 1 ? 'bg-orange-500/20 text-orange-400' :
              'bg-amber-500/20 text-amber-400'
            }`}>
              {idx + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium text-white truncate">{entry.assetName}</div>
              <div className="text-[10px] text-slate-500">
                {entry.mtbfHours > 0 ? `MTBF: ${entry.mtbfHours}h` : 'MTBF: N/A'}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className={`text-lg font-bold ${entry.issueCount >= 3 ? 'text-red-400' : 'text-amber-400'}`}>
                {entry.issueCount}
              </div>
              <div className="text-[9px] text-slate-500">problémů</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// FULL DASHBOARD — 3-column Icon Tile Grid
// ═══════════════════════════════════════════════════════

function FullDashboard() {
  const navigate = useNavigate();
  const { user, logout } = useAuthContext();
  const stats = useDashboardStats();

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

  // Tile order + hidden (persisted)
  const [config, setConfig] = useState<DashConfig>(() => loadDashConfig());

  // Quick action modals
  const [activeModal, setActiveModal] = useState<'idea' | 'request' | 'waste' | 'ai' | null>(null);
  const [aiQuery, setAiQuery] = useState('');
  const [formText, setFormText] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [requestType, setRequestType] = useState('tool');
  const [wasteType, setWasteType] = useState('plevy');
  const [saving, setSaving] = useState(false);

  // Move tile (stable reorder — no drag & drop)
  const moveTile = (fromIdx: number, toIdx: number) => {
    const visibleIds = config.tileOrder.filter(id => !config.hiddenTiles.includes(id));
    if (toIdx < 0 || toIdx >= visibleIds.length) return;
    const updated = [...visibleIds];
    const [moved] = updated.splice(fromIdx, 1);
    updated.splice(toIdx, 0, moved);
    const newConfig: DashConfig = {
      tileOrder: [...updated, ...config.hiddenTiles],
      hiddenTiles: config.hiddenTiles,
    };
    setConfig(newConfig);
    saveDashConfig(newConfig);
  };

  // Remove / Restore tiles
  const removeTile = (id: string) => {
    const newConfig: DashConfig = {
      tileOrder: config.tileOrder.filter(t => t !== id),
      hiddenTiles: [...config.hiddenTiles, id],
    };
    setConfig(newConfig);
    saveDashConfig(newConfig);
  };

  const restoreTile = (id: string) => {
    const newConfig: DashConfig = {
      tileOrder: [...config.tileOrder, id],
      hiddenTiles: config.hiddenTiles.filter(t => t !== id),
    };
    setConfig(newConfig);
    saveDashConfig(newConfig);
  };

  // Visible & hidden tile defs
  const visibleTiles = config.tileOrder
    .filter(id => !config.hiddenTiles.includes(id))
    .map(id => TILE_DEFS.find(t => t.id === id))
    .filter((t): t is TileDef => !!t);

  const hiddenTileDefs = config.hiddenTiles
    .map(id => TILE_DEFS.find(t => t.id === id))
    .filter((t): t is TileDef => !!t);

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
      case 'idea': return { subtext: 'Schránka důvěry' };
      case 'request': return { subtext: 'Nářadí, materiál' };
      case 'admin': return { subtext: 'Uživatelé, role' };
      default: return {};
    }
  };

  // Tile click
  const handleTileClick = (tile: TileDef) => {
    if (isEditing) return;
    const routes: Record<string, string> = {
      fault: '/kiosk', tasks: '/tasks', map: '/map', revisions: '/revisions',
      inventory: '/inventory', waste: '/waste', fleet: '/fleet', louparna: '/louparna',
      inspections: '/inspections', calendar: '/calendar', reports: '/reports', admin: '/admin',
    };
    if (routes[tile.id]) { navigate(routes[tile.id]); return; }
    if (tile.id === 'ai') { setActiveModal('ai'); setAiQuery(''); return; }
    if (tile.id === 'idea') setActiveModal('idea');
    else if (tile.id === 'request') setActiveModal('request');
  };

  // Modal submit
  const handleSubmit = async () => {
    if (!formText.trim() && activeModal !== 'waste') return;
    setSaving(true);
    try {
      const baseTask = {
        createdById: isAnonymous ? 'anonymous' : (user?.id || 'unknown'),
        createdByName: isAnonymous ? 'Anonymní' : (user?.displayName || 'Neznámý'),
        source: 'web' as const,
        priority: 'P3' as const,
      };
      if (activeModal === 'idea') {
        await createTask({ ...baseTask, title: formText.trim(), type: 'improvement' });
      } else if (activeModal === 'request') {
        const labels: Record<string, string> = { tool: 'Chybí nářadí', clothing: 'Chybí pracovní oděv', material: 'Chybí materiál' };
        await createTask({ ...baseTask, title: `${labels[requestType]}: ${formText.trim()}`, type: 'preventive', priority: 'P3' });
      } else if (activeModal === 'waste') {
        const labels: Record<string, string> = { plevy: 'Vyvézt vůz (plevy)', popelnice: 'Plná popelnice', kontejner: 'Plný kontejner' };
        await createTask({ ...baseTask, title: labels[wasteType] + (formText.trim() ? ` — ${formText.trim()}` : ''), type: 'corrective', priority: 'P2' });
      }
      setActiveModal(null);
      setFormText('');
      setIsAnonymous(false);
    } catch (err) {
      console.error('[QuickAction]', err);
    }
    setSaving(false);
  };

  const greeting = () => {
    const h = time.getHours();
    if (h < 12) return 'Dobré ráno';
    if (h < 18) return 'Dobré odpoledne';
    return 'Dobrý večer';
  };

  const userName = user?.displayName?.split(' ')[0] || 'uživateli';
  const isAdmin = (['MAJITEL', 'VEDENI', 'SUPERADMIN', 'UDRZBA'] as string[]).includes(user?.role || '');

  return (
    <div className="min-h-screen bg-slate-900">
      <style>{JIGGLE_CSS}</style>
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
              title="Upravit rozvržení dlaždic (drag & drop)"
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
        {stats.loading && (
          <div className="flex items-center gap-2 mb-4 text-slate-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Načítám data...
          </div>
        )}

        {/* SEMAPHORE + TOP 5 TASKS — admin only */}
        {isAdmin && !isEditing && (
          <>
            <SemaphoreWidget
              stats={{
                breakdownAssets: stats.breakdownAssets,
                criticalTasks: stats.criticalTasks,
                maintenanceAssets: stats.maintenanceAssets,
              }}
              wasteRed={wasteStats.red ?? 0}
            />
            <OperationalHUD />
            <Top5TasksWidget />
            <LemonListWidget />
          </>
        )}

        {/* ═══ TILE GRID — 3 columns ═══ */}
        <div className="grid grid-cols-3 gap-2.5">
          {visibleTiles.map((tile, idx) => {
            const data = getTileData(tile.id);
            return (
              <div
                key={tile.id}
                onClick={() => handleTileClick(tile)}
                className={`
                  relative p-3.5 rounded-2xl bg-gradient-to-br ${tile.gradient}
                  cursor-pointer transition-all min-h-[110px] flex flex-col justify-between
                  shadow-lg shadow-black/20 border border-white/10
                  ${isEditing ? 'tile-jiggle' : 'hover:scale-[1.03] active:scale-[0.95]'}
                `}
              >
                {/* Edit mode: Remove + Move buttons */}
                {isEditing && (
                  <div className="absolute -top-1.5 left-0 right-0 flex items-center justify-between z-10 px-0.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); removeTile(tile.id); }}
                      className="w-6 h-6 bg-slate-800 border-2 border-slate-600 rounded-full flex items-center justify-center hover:bg-red-600 hover:border-red-500 transition"
                    >
                      <X className="w-3.5 h-3.5 text-white" />
                    </button>
                    <div className="flex gap-1">
                      {idx > 0 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); moveTile(idx, idx - 1); }}
                          className="w-6 h-6 bg-slate-800/90 border border-slate-600 rounded-full flex items-center justify-center text-white text-[10px] font-bold hover:bg-blue-600 hover:border-blue-500 transition"
                        >◀</button>
                      )}
                      {idx < visibleTiles.length - 1 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); moveTile(idx, idx + 1); }}
                          className="w-6 h-6 bg-slate-800/90 border border-slate-600 rounded-full flex items-center justify-center text-white text-[10px] font-bold hover:bg-blue-600 hover:border-blue-500 transition"
                        >▶</button>
                      )}
                    </div>
                  </div>
                )}

                {/* Badge */}
                {!isEditing && data.badge != null && data.badge > 0 && (
                  <div className="absolute top-2 right-2 bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center shadow-md">
                    {data.badge}
                  </div>
                )}

                {/* Icon */}
                <span className="text-3xl drop-shadow-md">{tile.icon}</span>

                {/* Content */}
                <div>
                  <div className="text-[12px] font-bold text-white/90 leading-tight">{tile.label}</div>
                  {data.value != null && (
                    <div className="text-2xl font-extrabold text-white mt-0.5 leading-none">{data.value}</div>
                  )}
                  {data.subtext != null && (
                    <div className="text-[10px] text-white/60 mt-0.5">{data.subtext}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ═══ LIBRARY — Hidden tiles ═══ */}
        {isEditing && (
          <div className="mt-5">
            <div className="text-[11px] text-slate-500 uppercase tracking-wider font-bold mb-2 flex items-center gap-2">
              <LayoutGrid className="w-3.5 h-3.5" />
              Knihovna ({hiddenTileDefs.length})
            </div>
            {hiddenTileDefs.length === 0 ? (
              <div className="text-sm text-slate-600 text-center py-4 bg-white/[0.02] rounded-xl border border-dashed border-slate-700/50">
                Všechny dlaždice jsou zobrazeny
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2.5">
                {hiddenTileDefs.map(tile => (
                  <button
                    key={tile.id}
                    onClick={() => restoreTile(tile.id)}
                    className="p-3.5 rounded-2xl border-2 border-dashed border-slate-700/50 text-center opacity-50 hover:opacity-100 hover:border-orange-500/40 transition min-h-[90px] flex flex-col items-center justify-center gap-1"
                  >
                    <span className="text-2xl">{tile.icon}</span>
                    <div className="text-[11px] text-slate-400 font-medium">{tile.label}</div>
                    <div className="text-[10px] text-emerald-400 font-bold">+ Přidat</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ MODALS (centered) ═══ */}
      <BottomSheet title="💡 Nápad / Schránka důvěry" isOpen={activeModal === 'idea'} onClose={() => setActiveModal(null)}>
        <div className="mb-3 flex items-center gap-3 p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl">
          <input type="checkbox" checked={isAnonymous} onChange={(e) => setIsAnonymous(e.target.checked)} className="w-5 h-5 accent-purple-500" />
          <span className="text-sm text-purple-300">Poslat anonymně</span>
        </div>
        <FormField label="Váš nápad nebo zpráva" value={formText} onChange={setFormText} type="textarea" placeholder="Co byste chtěli zlepšit?" required />
        <SubmitButton label="Odeslat" onClick={handleSubmit} loading={saving} color="orange" />
      </BottomSheet>

      <BottomSheet title="📦 Nový požadavek" isOpen={activeModal === 'request'} onClose={() => setActiveModal(null)}>
        <FormField label="Typ požadavku" value={requestType} onChange={setRequestType} type="select"
          options={[
            { value: 'tool', label: '🔧 Chybí nářadí' },
            { value: 'clothing', label: '👕 Chybí pracovní oděv' },
            { value: 'material', label: '📦 Chybí materiál' },
          ]}
        />
        <FormField label="Upřesnění" value={formText} onChange={setFormText} placeholder="Co přesně potřebujete?" required />
        <SubmitButton label="Odeslat požadavek" onClick={handleSubmit} loading={saving} color="orange" />
      </BottomSheet>

      <BottomSheet title="🚜 Odpad / Plevy" isOpen={activeModal === 'waste'} onClose={() => setActiveModal(null)}>
        <FormField label="Typ" value={wasteType} onChange={setWasteType} type="select"
          options={[
            { value: 'plevy', label: '🌾 Vyvézt vůz (plevy)' },
            { value: 'popelnice', label: '🗑️ Plná popelnice' },
            { value: 'kontejner', label: '📦 Plný kontejner' },
          ]}
        />
        <FormField label="Poznámka (volitelné)" value={formText} onChange={setFormText} placeholder="Lokace, poznámka..." />
        <SubmitButton label="Nahlásit" onClick={handleSubmit} loading={saving} color="orange" />
      </BottomSheet>

      {/* AI ASSISTANT PLACEHOLDER */}
      <BottomSheet title={`${appConfig.APP_NAME_SHORT} AI`} isOpen={activeModal === 'ai'} onClose={() => setActiveModal(null)}>
        <div className="flex items-center gap-3 p-4 mb-4 bg-gradient-to-r from-pink-500/10 to-purple-500/10 border border-pink-500/20 rounded-2xl">
          <Sparkles className="w-6 h-6 text-pink-400 flex-shrink-0" />
          <div>
            <div className="text-sm font-semibold text-white">AI Asistent údržby</div>
            <div className="text-xs text-slate-400 mt-0.5">Zeptej se na cokoliv — historii oprav, doporučení, analýzu poruch...</div>
          </div>
        </div>
        <div className="relative mb-4">
          <textarea
            value={aiQuery}
            onChange={(e) => setAiQuery(e.target.value)}
            placeholder="Na co se chceš zeptat? Např. Kolikrát se rozbil balicí stroj letos?"
            rows={3}
            className="w-full px-4 py-3 pr-12 rounded-xl bg-white/5 border border-white/10 text-white text-[15px] placeholder-slate-600 focus:outline-none focus:border-pink-500/50 transition resize-none min-h-[48px]"
          />
          <button
            disabled={!aiQuery.trim()}
            className="absolute right-3 bottom-3 w-8 h-8 rounded-lg bg-gradient-to-r from-pink-500 to-purple-600 flex items-center justify-center text-white disabled:opacity-30 transition hover:opacity-90"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 text-center">
          <Sparkles className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <div className="text-sm text-slate-500 font-medium">Připravujeme</div>
          <div className="text-xs text-slate-600 mt-1">AI analýza bude dostupná v další verzi</div>
        </div>
      </BottomSheet>
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
