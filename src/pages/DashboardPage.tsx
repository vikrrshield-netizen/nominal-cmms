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
  Lightbulb, Package, Trash2, Bot,
} from 'lucide-react';
import { createTask } from '../services/taskService';
import BottomSheet, { FormField, SubmitButton } from '../components/ui/BottomSheet';

// ═══════════════════════════════════════════════════════
// FIREBASE HOOKS (LIVE DATA) — zachováno beze změn
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
// KIOSK DASHBOARD (OPERATOR role) — zachováno beze změn
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
            <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/25">
              <Settings className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Nominální<span className="text-blue-400">CMMS</span></h1>
              <p className="text-slate-400 text-sm flex items-center gap-2">
                <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                Kiosek – Velín extruze
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
              <p className="text-red-300/70 text-lg">Stroj nefunguje? Hlásí chyba?</p>
            </div>
          </button>

          <button onClick={() => navigate('/inspection')}
            className="flex-1 min-h-[120px] bg-gradient-to-br from-emerald-500/20 to-teal-600/10 backdrop-blur-xl rounded-3xl border border-emerald-500/30 p-8 flex items-center gap-6 hover:from-emerald-500/30 hover:to-teal-600/20 transition-all active:scale-[0.98]">
            <div className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/30 flex-shrink-0">
              <ClipboardCheck className="w-10 h-10 text-white" />
            </div>
            <div className="text-left">
              <h2 className="text-2xl font-bold text-white mb-1">Kontrola budov</h2>
              <p className="text-emerald-300/70 text-lg">Denní obchůzka a kontroly</p>
            </div>
          </button>

          <button onClick={() => navigate('/map')}
            className="flex-1 min-h-[120px] bg-gradient-to-br from-blue-500/20 to-indigo-600/10 backdrop-blur-xl rounded-3xl border border-blue-500/30 p-8 flex items-center gap-6 hover:from-blue-500/30 hover:to-indigo-600/20 transition-all active:scale-[0.98]">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30 flex-shrink-0">
              <Map className="w-10 h-10 text-white" />
            </div>
            <div className="text-left">
              <h2 className="text-2xl font-bold text-white mb-1">Mapa strojů</h2>
              <p className="text-blue-300/70 text-lg">{stats.totalAssets} zařízení • {stats.operationalAssets} v provozu</p>
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
// CONSTANTS
// ═══════════════════════════════════════════════════════

const BUILDINGS = [
  { id: 'A', name: 'Administrativa', icon: '🏢' },
  { id: 'B', name: 'Výroba', icon: '🏭' },
  { id: 'C', name: 'Sklad', icon: '📦' },
  { id: 'D', name: 'Dílna', icon: '🔧' },
  { id: 'E', name: 'Expedice', icon: '🚛' },
  { id: 'L', name: 'Loupárna', icon: '🌾' },
];

const PRIORITY_BORDER: Record<string, string> = {
  P1: 'border-l-red-500',
  P2: 'border-l-orange-400',
  P3: 'border-l-blue-400',
  P4: 'border-l-gray-500',
};

// ═══════════════════════════════════════════════════════
// QUICK ACTIONS GRID — Dashboard rychlé akce
// ═══════════════════════════════════════════════════════

function QuickActionsGrid() {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const [activeModal, setActiveModal] = useState<'idea' | 'request' | 'waste' | null>(null);
  const [formText, setFormText] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [requestType, setRequestType] = useState('tool');
  const [wasteType, setWasteType] = useState('plevy');
  const [saving, setSaving] = useState(false);

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
        await createTask({
          ...baseTask,
          title: formText.trim(),
          type: 'improvement',
        });
      } else if (activeModal === 'request') {
        const labels: Record<string, string> = {
          tool: 'Chybí nářadí',
          clothing: 'Chybí pracovní oděv',
          material: 'Chybí materiál',
        };
        await createTask({
          ...baseTask,
          title: `${labels[requestType]}: ${formText.trim()}`,
          type: 'preventive',
          priority: 'P3',
        });
      } else if (activeModal === 'waste') {
        const labels: Record<string, string> = {
          plevy: 'Vyvézt vůz (plevy)',
          popelnice: 'Plná popelnice',
          kontejner: 'Plný kontejner',
        };
        await createTask({
          ...baseTask,
          title: labels[wasteType] + (formText.trim() ? ` — ${formText.trim()}` : ''),
          type: 'corrective',
          priority: 'P2',
        });
      }

      setActiveModal(null);
      setFormText('');
      setIsAnonymous(false);
    } catch (err) {
      console.error('[QuickAction]', err);
    }
    setSaving(false);
  };

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {/* Nápad / Schránka důvěry */}
        <button
          onClick={() => setActiveModal('idea')}
          className="p-4 bg-purple-500/10 border border-purple-500/25 rounded-2xl text-left hover:bg-purple-500/20 transition active:scale-[0.97] min-h-[90px]"
        >
          <Lightbulb className="w-7 h-7 text-purple-400 mb-2" />
          <div className="text-sm font-bold text-white">Nápad</div>
          <div className="text-[10px] text-purple-400/70 mt-0.5">Schránka důvěry</div>
        </button>

        {/* Požadavky */}
        <button
          onClick={() => setActiveModal('request')}
          className="p-4 bg-blue-500/10 border border-blue-500/25 rounded-2xl text-left hover:bg-blue-500/20 transition active:scale-[0.97] min-h-[90px]"
        >
          <Package className="w-7 h-7 text-blue-400 mb-2" />
          <div className="text-sm font-bold text-white">Požadavky</div>
          <div className="text-[10px] text-blue-400/70 mt-0.5">Nářadí, materiál</div>
        </button>

        {/* Odpad / Plevy */}
        <button
          onClick={() => setActiveModal('waste')}
          className="p-4 bg-amber-500/10 border border-amber-500/25 rounded-2xl text-left hover:bg-amber-500/20 transition active:scale-[0.97] min-h-[90px]"
        >
          <Trash2 className="w-7 h-7 text-amber-400 mb-2" />
          <div className="text-sm font-bold text-white">Odpad</div>
          <div className="text-[10px] text-amber-400/70 mt-0.5">Plevy, popelnice</div>
        </button>

        {/* AI Asistent */}
        <button
          onClick={() => navigate('/ai')}
          className="p-4 bg-emerald-500/10 border border-emerald-500/25 rounded-2xl text-left hover:bg-emerald-500/20 transition active:scale-[0.97] min-h-[90px]"
        >
          <Bot className="w-7 h-7 text-emerald-400 mb-2" />
          <div className="text-sm font-bold text-white">Nominal AI</div>
          <div className="text-[10px] text-emerald-400/70 mt-0.5">Asistent údržby</div>
        </button>
      </div>

      {/* ── MODAL: Nápad ── */}
      <BottomSheet title="💡 Nápad / Schránka důvěry" isOpen={activeModal === 'idea'} onClose={() => setActiveModal(null)}>
        <div className="mb-3 flex items-center gap-3 p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl">
          <input
            type="checkbox"
            checked={isAnonymous}
            onChange={(e) => setIsAnonymous(e.target.checked)}
            className="w-5 h-5 accent-purple-500"
          />
          <span className="text-sm text-purple-300">Poslat anonymně</span>
        </div>
        <FormField label="Váš nápad nebo zpráva" value={formText} onChange={setFormText} type="textarea" placeholder="Co byste chtěli zlepšit?" required />
        <SubmitButton label="Odeslat" onClick={handleSubmit} loading={saving} color="orange" />
      </BottomSheet>

      {/* ── MODAL: Požadavky ── */}
      <BottomSheet title="📦 Nový požadavek" isOpen={activeModal === 'request'} onClose={() => setActiveModal(null)}>
        <FormField
          label="Typ požadavku"
          value={requestType}
          onChange={setRequestType}
          type="select"
          options={[
            { value: 'tool', label: '🔧 Chybí nářadí' },
            { value: 'clothing', label: '👕 Chybí pracovní oděv' },
            { value: 'material', label: '📦 Chybí materiál' },
          ]}
        />
        <FormField label="Upřesnění" value={formText} onChange={setFormText} placeholder="Co přesně potřebujete?" required />
        <SubmitButton label="Odeslat požadavek" onClick={handleSubmit} loading={saving} color="orange" />
      </BottomSheet>

      {/* ── MODAL: Odpad ── */}
      <BottomSheet title="🚜 Odpad / Plevy" isOpen={activeModal === 'waste'} onClose={() => setActiveModal(null)}>
        <FormField
          label="Typ"
          value={wasteType}
          onChange={setWasteType}
          type="select"
          options={[
            { value: 'plevy', label: '🌾 Vyvézt vůz (plevy)' },
            { value: 'popelnice', label: '🗑️ Plná popelnice' },
            { value: 'kontejner', label: '📦 Plný kontejner' },
          ]}
        />
        <FormField label="Poznámka (volitelné)" value={formText} onChange={setFormText} placeholder="Lokace, poznámka..." />
        <SubmitButton label="Nahlásit" onClick={handleSubmit} loading={saving} color="orange" />
      </BottomSheet>
    </>
  );
}

// ═══════════════════════════════════════════════════════
// FULL DASHBOARD — layout "Velín"
// ═══════════════════════════════════════════════════════

function FullDashboard() {
  const navigate = useNavigate();
  const { user, logout } = useAuthContext();
  const stats = useDashboardStats();

  // Hooks pro stat karty (LIVE Firestore)
  const fleet = useFleet();
  const waste = useWaste();
  const inventory = useInventory();
  const louparna = useLouparna();
  const revisions = useRevisions();
  const inspections = useInspections();

  // Hodiny
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  // Dnešní úkoly pro kalendář
  const [todayTasks, setTodayTasks] = useState<any[]>([]);
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'tasks'),
      (snap) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const filtered = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as any))
          .filter((t) => {
            if (t.isDone || t.status === 'done' || t.status === 'completed') return false;
            if (!t.scheduledDate) return false;
            const sd = t.scheduledDate.toDate ? t.scheduledDate.toDate() : new Date(t.scheduledDate);
            return sd >= today && sd < tomorrow;
          });
        setTodayTasks(filtered);
      },
      () => setTodayTasks([])
    );
    return () => unsub();
  }, []);

  const greeting = () => {
    const h = time.getHours();
    if (h < 12) return 'Dobré ráno';
    if (h < 18) return 'Dobré odpoledne';
    return 'Dobrý večer';
  };

  const userName = user?.displayName?.split(' ')[0] || 'uživateli';
  const lowStockCount = inventory.stats.low + inventory.stats.critical + inventory.stats.out;

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="max-w-7xl mx-auto px-4 pt-4 pb-12">

        {/* HEADER */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-widest">NOMINAL CMMS</div>
            <h1 className="text-xl font-bold text-white mt-1">{greeting()}, {userName}</h1>
            <div className="text-xs text-slate-500 mt-1">
              {time.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>
          <button
            onClick={() => logout()}
            className="w-11 h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>

        {/* LOADING */}
        {stats.loading && (
          <div className="flex items-center gap-2 mb-4 text-slate-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Načítám data...
          </div>
        )}

        {/* 1. QUICK ACTION — NAHLÁSIT PORUCHU */}
        <button
          onClick={() => navigate('/kiosk')}
          className="w-full bg-red-600 hover:bg-red-500 text-white rounded-2xl p-5 cursor-pointer flex items-center gap-4 transition-all active:scale-[0.98] mb-6"
        >
          <AlertTriangle className="w-8 h-8 flex-shrink-0" />
          <span className="text-2xl font-bold">NAHLÁSIT PORUCHU</span>
        </button>

        {/* 2. QUICK ACTIONS GRID */}
        <QuickActionsGrid />

        {/* 3. HLAVNÍ GRID — Mapa + Kalendář */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">

          {/* A) MAPA AREÁLU */}
          <div
            onClick={() => navigate('/map')}
            className="lg:col-span-2 min-h-[300px] bg-slate-800/60 rounded-2xl p-4 border border-slate-700/50 cursor-pointer hover:bg-slate-700/60 transition-all"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Mapa areálu</h2>
              <span className="text-sm text-slate-400">{stats.totalAssets} zařízení</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {BUILDINGS.map((b) => (
                <div key={b.id} className="bg-slate-700/50 rounded-xl p-3 text-center hover:bg-slate-600/50 transition">
                  <div className="text-2xl mb-1">{b.icon}</div>
                  <div className="text-lg font-bold text-white">{b.id}</div>
                  <div className="text-xs text-slate-400">{b.name}</div>
                </div>
              ))}
            </div>
          </div>

          {/* B) KALENDÁŘ — Dnes */}
          <div className="lg:col-span-1 min-h-[300px] bg-slate-800/60 rounded-2xl p-4 border border-slate-700/50 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Dnes</h2>
              <span className="text-sm text-slate-400">
                {time.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' })}
              </span>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto">
              {todayTasks.length === 0 ? (
                <div className="text-sm text-slate-500 text-center py-8">
                  Žádné naplánované úkoly na dnes
                </div>
              ) : (
                todayTasks.map((task) => (
                  <div
                    key={task.id}
                    className={`border-l-4 ${PRIORITY_BORDER[task.priority] || 'border-l-gray-500'} bg-slate-700/30 rounded-lg p-3`}
                  >
                    <div className="text-sm font-medium text-white">{task.title}</div>
                    {task.assetName && (
                      <div className="text-xs text-slate-400 mt-1">{task.assetName}</div>
                    )}
                  </div>
                ))
              )}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); navigate('/calendar'); }}
              className="mt-3 w-full py-2.5 rounded-xl bg-slate-700/50 text-sm text-slate-300 hover:bg-slate-600/50 transition cursor-pointer"
            >
              Celý týden
            </button>
          </div>
        </div>

        {/* 3. STAT KARTY */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">

          {/* a) Úkoly */}
          <div
            onClick={() => navigate('/tasks')}
            className="min-h-[100px] bg-slate-800/60 rounded-2xl p-4 border border-slate-700/50 cursor-pointer hover:bg-slate-700/60 transition"
          >
            <div className="text-xs text-slate-500 mb-1">Úkoly</div>
            <div className="text-3xl font-bold text-white">{stats.openTasks}</div>
            <div className="text-xs text-slate-500 mt-1">otevřených</div>
            <div className="flex gap-1 mt-2 flex-wrap">
              {stats.criticalTasks > 0 && (
                <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full font-bold">
                  P1: {stats.criticalTasks}
                </span>
              )}
              {stats.urgentTasks > 0 && (
                <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full font-bold">
                  P2: {stats.urgentTasks}
                </span>
              )}
            </div>
          </div>

          {/* b) Revize */}
          <div
            onClick={() => navigate('/revisions')}
            className="min-h-[100px] bg-slate-800/60 rounded-2xl p-4 border border-slate-700/50 cursor-pointer hover:bg-slate-700/60 transition"
          >
            <div className="text-xs text-slate-500 mb-2">Revize</div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-emerald-400 font-bold">{revisions.stats.valid}</span>
                <span className="text-slate-500 text-xs">platné</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-amber-400 font-bold">{revisions.stats.expiring}</span>
                <span className="text-slate-500 text-xs">končí</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-red-400 font-bold">{revisions.stats.expired}</span>
                <span className="text-slate-500 text-xs">prošlé</span>
              </div>
            </div>
          </div>

          {/* c) Sklad */}
          <div
            onClick={() => navigate('/inventory')}
            className="min-h-[100px] bg-slate-800/60 rounded-2xl p-4 border border-slate-700/50 cursor-pointer hover:bg-slate-700/60 transition"
          >
            <div className="text-xs text-slate-500 mb-1">Sklad ND</div>
            <div className={`text-3xl font-bold ${lowStockCount > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {lowStockCount}
            </div>
            <div className={`text-xs mt-1 ${lowStockCount > 0 ? 'text-red-400' : 'text-slate-500'}`}>
              {lowStockCount > 0 ? 'pod limitem' : 'vše OK'}
            </div>
          </div>

          {/* d) Odpady */}
          <div
            onClick={() => navigate('/waste')}
            className="min-h-[100px] bg-slate-800/60 rounded-2xl p-4 border border-slate-700/50 cursor-pointer hover:bg-slate-700/60 transition"
          >
            <div className="text-xs text-slate-500 mb-2">Odpady</div>
            <div className="flex items-center gap-3 mt-2">
              <div className="flex flex-col items-center">
                <div className="w-4 h-4 rounded-full bg-emerald-500" />
                <span className="text-xs text-white font-bold mt-1">{waste.stats.green}</span>
              </div>
              <div className="flex flex-col items-center">
                <div className="w-4 h-4 rounded-full bg-amber-500" />
                <span className="text-xs text-white font-bold mt-1">{waste.stats.yellow}</span>
              </div>
              <div className="flex flex-col items-center">
                <div className="w-4 h-4 rounded-full bg-red-500" />
                <span className="text-xs text-white font-bold mt-1">{waste.stats.red}</span>
              </div>
            </div>
          </div>

          {/* e) Vozidla */}
          <div
            onClick={() => navigate('/fleet')}
            className="min-h-[100px] bg-slate-800/60 rounded-2xl p-4 border border-slate-700/50 cursor-pointer hover:bg-slate-700/60 transition"
          >
            <div className="text-xs text-slate-500 mb-1">Vozidla</div>
            <div className="text-3xl font-bold text-white">{fleet.stats.available}</div>
            <div className="text-xs text-slate-500 mt-1">
              volných / {fleet.stats.total} celkem
            </div>
          </div>

          {/* f) Loupárna */}
          <div
            onClick={() => navigate('/louparna')}
            className="min-h-[100px] bg-slate-800/60 rounded-2xl p-4 border border-slate-700/50 cursor-pointer hover:bg-slate-700/60 transition"
          >
            <div className="text-xs text-slate-500 mb-1">Loupárna</div>
            <div className="text-3xl font-bold text-white">{louparna.productionStats.avgYield}%</div>
            <div className="text-xs text-slate-500 mt-1">výtěžnost</div>
            {louparna.currentBatch && (
              <span className="inline-block mt-1 text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-bold animate-pulse">
                BĚŽÍ
              </span>
            )}
          </div>

          {/* g) Kontrola budovy */}
          <div
            onClick={() => navigate('/inspections')}
            className="min-h-[100px] bg-slate-800/60 rounded-2xl p-4 border border-slate-700/50 cursor-pointer hover:bg-slate-700/60 transition"
          >
            <div className="text-xs text-slate-500 mb-1">Kontrola budovy</div>
            <div className="text-3xl font-bold text-white">
              {inspections.stats.percentDone}%
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {inspections.stats.ok + inspections.stats.defect}/{inspections.stats.total} bodů
            </div>
            {inspections.stats.defect > 0 && (
              <span className="inline-block mt-1 text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full font-bold">
                {inspections.stats.defect} závad
              </span>
            )}
          </div>
        </div>

      </div>
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
