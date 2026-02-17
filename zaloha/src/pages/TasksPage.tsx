// src/pages/TasksPage.tsx
// NOMINAL CMMS — Úkoly (responsive grid: 1col mobil, 2col tablet, 3col PC)

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, doc, updateDoc, addDoc, Timestamp, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthContext } from '../context/AuthContext';
import { useFormDraft } from '../hooks/useFormDraft';
import CompleteTaskModal from '../components/ui/CompleteTaskModal';
import {
  Wrench,
  AlertTriangle,
  CheckCircle,
  Plus,
  ArrowLeft,
  Loader2,
  Inbox,
  User,
} from 'lucide-react';

import FAB from '../components/ui/FAB';
import EmptyState from '../components/ui/EmptyState';
import BottomSheet, { FormField, SubmitButton } from '../components/ui/BottomSheet';

// ═══════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════
interface Task {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  assignedTo?: string;
  assignedToName?: string;
  assetId?: string;
  assetName?: string;
  createdAt?: any;
  completedAt?: any;
  completedBy?: string;
  isDone?: boolean;
  resolution?: string;
  durationMinutes?: number;
}

// ═══════════════════════════════════════════════════
// PRIORITY CONFIG
// ═══════════════════════════════════════════════════
const PRIORITY_CONFIG: Record<string, { bg: string; border: string; color: string; label: string; textClass: string; borderLeft: string }> = {
  P1: { bg: 'bg-red-500/12', border: 'border-red-500/35', color: '#f87171', label: 'P1 — Havárie', textClass: 'text-red-400', borderLeft: 'border-l-4 border-l-red-500' },
  P2: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', color: '#fbbf24', label: 'P2 — Tento týden', textClass: 'text-amber-400', borderLeft: 'border-l-4 border-l-orange-400' },
  P3: { bg: 'bg-blue-500/8', border: 'border-blue-500/20', color: '#60a5fa', label: 'P3 — Běžná', textClass: 'text-blue-400', borderLeft: 'border-l-4 border-l-blue-400' },
  P4: { bg: 'bg-slate-500/8', border: 'border-slate-500/20', color: '#94a3b8', label: 'P4 — Nápad', textClass: 'text-slate-400', borderLeft: 'border-l-4 border-l-gray-500' },
};

// ═══════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════
function timeAgo(date: any): string {
  if (!date) return '';
  const d = date.toDate ? date.toDate() : new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'právě teď';
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

// ═══════════════════════════════════════════════════
// TASK CARD — responsive
// ═══════════════════════════════════════════════════
function TaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const pc = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.P3;
  const assignee = task.assignedToName || task.assignedTo;

  return (
    <button
      onClick={onClick}
      className={`w-full flex flex-col p-3 rounded-2xl border text-left transition-all duration-200 active:scale-[0.97] hover:scale-[1.01] hover:shadow-lg hover:shadow-black/20 cursor-pointer ${pc.bg} ${pc.border} ${pc.borderLeft}`}
    >
      {/* Header: icon + priority */}
      <div className="flex items-center justify-between mb-2 w-full">
        <div className="flex items-center gap-2">
          {task.priority === 'P1' ? (
            <AlertTriangle className="w-4 h-4" style={{ color: pc.color }} />
          ) : (
            <Wrench className="w-4 h-4" style={{ color: pc.color }} />
          )}
          <span className="text-sm font-bold px-1.5 py-0.5 rounded-md" style={{ background: `${pc.color}20`, color: pc.color }}>
            {task.priority}
          </span>
        </div>
        <span className="text-xs text-slate-500">{timeAgo(task.createdAt)}</span>
      </div>

      {/* Title */}
      <div className="text-lg font-bold text-white leading-tight mb-1.5 line-clamp-2">
        {task.title}
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-3 text-sm text-slate-500">
        {task.assetName && (
          <span className="flex items-center gap-1 truncate">
            <Wrench className="w-3 h-3" /> {task.assetName}
          </span>
        )}
        {assignee && (
          <span className="flex items-center gap-1 truncate">
            <User className="w-3 h-3" /> {assignee}
          </span>
        )}
      </div>

      {/* Resolution (if done) */}
      {task.isDone && task.resolution && (
        <div className="mt-3 p-2 bg-emerald-900/20 border border-emerald-500/30 rounded-lg text-emerald-200 text-sm">
          <strong>Řešení:</strong> {task.resolution}
          {task.durationMinutes && <span className="ml-2 opacity-75">({task.durationMinutes} min)</span>}
        </div>
      )}
    </button>
  );
}

function DoneCard({ task }: { task: Task }) {
  return (
    <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-emerald-500/8 border border-emerald-500/15 opacity-60 pointer-events-none">
      <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-slate-300 truncate">{task.title}</div>
        {task.resolution && (
          <div className="text-xs text-slate-400 truncate">Řešení: {task.resolution}</div>
        )}
        <div className="text-xs text-slate-500">
          {task.completedBy && `${task.completedBy} · `}
          {task.durationMinutes && `${task.durationMinutes} min · `}
          {timeAgo(task.completedAt)}
        </div>
      </div>
      <span className="text-emerald-400 text-xs flex-shrink-0">✓ Uzavřeno</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// SUMMARY BAR
// ═══════════════════════════════════════════════════
function TaskSummary({ tasks }: { tasks: Task[] }) {
  const open = tasks.filter((t) => t.status !== 'done' && t.status !== 'completed');
  const p1 = open.filter((t) => t.priority === 'P1').length;
  const p2 = open.filter((t) => t.priority === 'P2').length;
  const p3 = open.filter((t) => t.priority === 'P3').length;
  const done = tasks.filter((t) => t.status === 'done' || t.status === 'completed').length;

  return (
    <div className="grid grid-cols-4 gap-1.5 mb-4">
      {[
        { value: p1, label: 'Havárie', color: '#f87171' },
        { value: p2, label: 'Tento týden', color: '#fbbf24' },
        { value: p3, label: 'Běžné', color: '#60a5fa' },
        { value: done, label: 'Hotovo', color: '#34d399' },
      ].map((s) => (
        <div
          key={s.label}
          className="text-center py-2 px-1 rounded-xl"
          style={{ background: `${s.color}10`, border: `1px solid ${s.color}15` }}
        >
          <div className="text-lg font-bold" style={{ color: s.color }}>{s.value}</div>
          <div className="text-[10px] text-slate-500">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════
function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'tasks'),
      (snap) => {
        setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Task)));
        setLoading(false);
      },
      (err) => {
        console.error('[TasksPage] Firestore error:', err);
        setTasks([]);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  return { tasks, loading };
}

// ═══════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════
export default function TasksPage() {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const { tasks, loading } = useTasks();

  const [showNewTask, setShowNewTask] = useState(false);
  const [completingTask, setCompletingTask] = useState<Task | null>(null);
  const [filterPriority, setFilterPriority] = useState<string | null>(null);

  // Form state with draft persistence
  const [form, setForm, clearDraft] = useFormDraft('new_task', {
    title: '',
    description: '',
    priority: 'P3',
    assignee: '',
  });
  const [saving, setSaving] = useState(false);

  // Split & sort
  const openTasks = tasks
    .filter((t) => t.status !== 'done' && t.status !== 'completed')
    .filter((t) => !filterPriority || t.priority === filterPriority)
    .sort((a, b) => {
      const order: Record<string, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };
      return (order[a.priority] ?? 9) - (order[b.priority] ?? 9);
    });

  const doneTasks = tasks
    .filter((t) => t.status === 'done' || t.status === 'completed')
    .slice(0, 20);

  const handleCreateTask = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'tasks'), {
        title: form.title.trim(),
        description: form.description.trim(),
        status: 'open',
        priority: form.priority || 'P3',
        assignedTo: form.assignee || null,
        assignedToName: form.assignee || null,
        isDone: false,
        createdAt: Timestamp.now(),
        updatedAt: serverTimestamp(),
        createdBy: user?.displayName || 'Unknown',
      });
      setShowNewTask(false);
      clearDraft();
    } catch (err) {
      console.error('Create task failed:', err);
    }
    setSaving(false);
  };

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="max-w-5xl mx-auto px-3 pt-4 pb-24">

        {/* Header */}
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => navigate('/')}
            className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center text-slate-400 hover:text-white transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white">Úkoly</h1>
            <p className="text-xs text-slate-500">
              {openTasks.length} otevřených · {doneTasks.length} hotových
            </p>
          </div>
          {loading && <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />}
        </div>

        {/* Summary */}
        <TaskSummary tasks={tasks} />

        {/* Priority filter */}
        <div className="flex gap-1.5 mb-4 overflow-x-auto">
          <FilterChip label="Vše" active={!filterPriority} onClick={() => setFilterPriority(null)} color="#94a3b8" />
          <FilterChip label="P1" active={filterPriority === 'P1'} onClick={() => setFilterPriority(filterPriority === 'P1' ? null : 'P1')} color="#f87171" />
          <FilterChip label="P2" active={filterPriority === 'P2'} onClick={() => setFilterPriority(filterPriority === 'P2' ? null : 'P2')} color="#fbbf24" />
          <FilterChip label="P3" active={filterPriority === 'P3'} onClick={() => setFilterPriority(filterPriority === 'P3' ? null : 'P3')} color="#60a5fa" />
          <FilterChip label="P4" active={filterPriority === 'P4'} onClick={() => setFilterPriority(filterPriority === 'P4' ? null : 'P4')} color="#94a3b8" />
        </div>

        {/* === RESPONSIVE GRID === */}
        {/* 1 col mobile · 2 col tablet · 3 col desktop */}

        <h3 className="text-[11px] font-semibold text-red-400 uppercase tracking-widest mb-2">
          K vyřešení ({openTasks.length})
        </h3>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Načítám...
          </div>
        ) : openTasks.length === 0 ? (
          <EmptyState
            icon={<Inbox className="w-12 h-12" />}
            title={filterPriority ? `Žádné ${filterPriority} úkoly` : 'Žádné otevřené úkoly'}
            subtitle={filterPriority ? 'Zkus jiný filtr' : 'Vše hotovo!'}
            actionLabel="Nový úkol"
            onAction={() => setShowNewTask(true)}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-6">
            {openTasks.map((task) => (
              <TaskCard key={task.id} task={task} onClick={() => setCompletingTask(task)} />
            ))}
          </div>
        )}

        {/* Done section */}
        {doneTasks.length > 0 && (
          <>
            <h3 className="text-[11px] font-semibold text-emerald-400 uppercase tracking-widest mb-2 mt-2">
              Hotovo ({doneTasks.length})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
              {doneTasks.map((task) => (
                <DoneCard key={task.id} task={task} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* FAB */}
      <FAB icon={<Plus className="w-6 h-6" />} label="Nový úkol" onClick={() => setShowNewTask(true)} />

      {/* New Task Modal */}
      <BottomSheet title="➕ Nový úkol" isOpen={showNewTask} onClose={() => setShowNewTask(false)}>
        <FormField label="Název" value={form.title} onChange={(v) => setForm(prev => ({ ...prev, title: v }))} placeholder="Co je potřeba udělat?" required />
        <FormField label="Popis" value={form.description} onChange={(v) => setForm(prev => ({ ...prev, description: v }))} type="textarea" placeholder="Podrobnosti..." />
        <FormField
          label="Přiřadit"
          value={form.assignee}
          onChange={(v) => setForm(prev => ({ ...prev, assignee: v }))}
          type="select"
          options={[
            { value: 'Zdeněk Mička', label: 'Zdeněk Mička' },
            { value: 'Petr Volf', label: 'Petr Volf' },
            { value: 'Filip Novák', label: 'Filip Novák' },
            { value: 'Vilém', label: 'Vilém' },
          ]}
        />
        <FormField
          label="Priorita"
          value={form.priority}
          onChange={(v) => setForm(prev => ({ ...prev, priority: v }))}
          type="select"
          required
          options={[
            { value: 'P1', label: '🔴 P1 — Havárie' },
            { value: 'P2', label: '🟡 P2 — Tento týden' },
            { value: 'P3', label: '🔵 P3 — Běžná' },
            { value: 'P4', label: '⚪ P4 — Nápad' },
          ]}
        />
        <SubmitButton label="Vytvořit úkol" onClick={handleCreateTask} loading={saving} />
      </BottomSheet>

      {/* Complete Task Modal — mandatory fields */}
      {completingTask && (
        <CompleteTaskModal
          taskTitle={completingTask.title}
          onConfirm={async (data) => {
            await updateDoc(doc(db, 'tasks', completingTask.id), {
              status: 'done',
              isDone: true,
              resolution: data.resolution,
              durationMinutes: data.durationMinutes,
              completedAt: serverTimestamp(),
              completedBy: user?.displayName || 'Neznámý',
              updatedAt: serverTimestamp(),
            });
            setCompletingTask(null);
          }}
          onClose={() => setCompletingTask(null)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// FILTER CHIP
// ═══════════════════════════════════════════════════
function FilterChip({ label, active, onClick, color }: { label: string; active: boolean; onClick: () => void; color: string }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all active:scale-95 flex-shrink-0"
      style={{
        background: active ? `${color}25` : 'rgba(255,255,255,0.05)',
        border: `1px solid ${active ? color + '50' : 'rgba(255,255,255,0.08)'}`,
        color: active ? color : '#64748b',
      }}
    >
      {label}
    </button>
  );
}
