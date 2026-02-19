// src/pages/TasksPage.tsx
// VIKRR — Asset Shield — Úkoly (responsive grid: 1col mobil, 2col tablet, 3col PC)

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc, Timestamp, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthContext } from '../context/AuthContext';
import { useFormDraft } from '../hooks/useFormDraft';
import CompleteTaskModal from '../components/ui/CompleteTaskModal';
import {
  Wrench,
  Plus,
  ArrowLeft,
  Loader2,
  Inbox,
  Edit2,
  Download,
  Trash2,
  Play,
  CalendarDays,
  PauseCircle,
  CheckCircle2,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import FAB from '../components/ui/FAB';
import EmptyState from '../components/ui/EmptyState';
import BottomSheet, { FormField, FormFooter } from '../components/ui/BottomSheet';
import MicButton from '../components/ui/MicButton';

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
  startedAt?: any;
  plannedDate?: string;
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

const STATUS_BADGES: Record<string, { label: string; bg: string; text: string }> = {
  backlog:      { label: 'Nový',         bg: 'bg-red-500/20',     text: 'text-red-400' },
  planned:      { label: 'Plánovaný',    bg: 'bg-blue-500/20',    text: 'text-blue-400' },
  in_progress:  { label: 'V řešení',     bg: 'bg-amber-500/20',   text: 'text-amber-400' },
  paused:       { label: 'Čeká na díl',  bg: 'bg-cyan-500/20',    text: 'text-cyan-400' },
  completed:    { label: 'Hotovo',        bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
  done:         { label: 'Hotovo',        bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
  deferred:     { label: 'Odloženo',      bg: 'bg-violet-500/20',  text: 'text-violet-400' },
  cancelled:    { label: 'Zrušeno',       bg: 'bg-slate-500/20',   text: 'text-slate-400' },
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
// SUMMARY BAR
// ═══════════════════════════════════════════════════
function TaskSummary({ tasks }: { tasks: Task[] }) {
  const open = tasks.filter((t) => t.status !== 'done' && t.status !== 'completed');
  const p1 = open.filter((t) => t.priority === 'P1').length;
  const p2 = open.filter((t) => t.priority === 'P2').length;
  const inProgress = tasks.filter((t) => t.status === 'in_progress').length;
  const done = tasks.filter((t) => t.status === 'done' || t.status === 'completed').length;

  return (
    <div className="grid grid-cols-5 gap-1.5 mb-4">
      {[
        { value: p1, label: 'Havárie', color: '#f87171' },
        { value: p2, label: 'Tento týden', color: '#fbbf24' },
        { value: inProgress, label: 'V řešení', color: '#f97316' },
        { value: open.length, label: 'Otevřeno', color: '#60a5fa' },
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
// HOOK — Technicians (dispatching)
// ═══════════════════════════════════════════════════
interface Technician { id: string; displayName: string; role: string; }

function useTechnicians() {
  const [techs, setTechs] = useState<Technician[]>([]);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      const DISPATCH_ROLES = ['UDRZBA', 'SKLADNIK', 'SUPERADMIN'];
      setTechs(
        snap.docs
          .map((d) => ({ id: d.id, displayName: d.data().displayName || '?', role: d.data().role || '' }))
          .filter((u) => DISPATCH_ROLES.includes(u.role))
          .sort((a, b) => a.displayName.localeCompare(b.displayName))
      );
    });
    return () => unsub();
  }, []);
  return techs;
}

// ═══════════════════════════════════════════════════
// TAB FILTER TYPE
// ═══════════════════════════════════════════════════
type FilterTab = 'mine' | 'active' | 'done';

const TAB_OPTIONS: { key: FilterTab; label: string; color: string }[] = [
  { key: 'active', label: 'Aktivní', color: '#fbbf24' },
  { key: 'mine', label: 'Moje úkoly', color: '#f97316' },
  { key: 'done', label: 'Hotovo', color: '#34d399' },
];

// ═══════════════════════════════════════════════════
// TASK CARD (standardized)
// ═══════════════════════════════════════════════════
function TaskCard({ task, onClick, onEdit, onDelete }: { task: Task; onClick: () => void; onEdit: () => void; onDelete: () => void }) {
  const pc = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.P3;
  const sb = STATUS_BADGES[task.status] || STATUS_BADGES.backlog;
  const assignee = task.assignedToName || task.assignedTo || '—';
  const initials = assignee !== '—' ? assignee.split(' ').filter(Boolean).map(w => w[0] || '').join('').slice(0, 2) || '?' : '?';
  const isActive = task.status === 'in_progress';

  return (
    <div className={`bg-slate-800/60 backdrop-blur-sm rounded-2xl border flex flex-col overflow-hidden ${pc.borderLeft} ${
      isActive ? 'border-amber-500/50 ring-1 ring-amber-500/30 shadow-lg shadow-amber-500/10' : 'border-slate-700/50'
    }`}>
      {/* Active technician bar */}
      {isActive && assignee !== '—' && (
        <div className="px-4 py-1.5 bg-amber-500/15 border-b border-amber-500/20 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
          <span className="text-xs font-bold text-amber-400">{assignee}</span>
          <span className="text-[10px] text-amber-400/60 ml-auto">právě řeší</span>
        </div>
      )}

      {/* CLICKABLE BODY */}
      <button
        onClick={onClick}
        className="w-full p-4 text-left hover:bg-slate-700/40 transition"
      >
        {/* HEADER: Priority + Status */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded"
              style={{ background: `${pc.color}20`, color: pc.color }}
            >
              {task.priority}
            </span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-lg ${sb.bg} ${sb.text}`}>
              {sb.label}
            </span>
          </div>
          <span className="text-[11px] text-slate-500">{timeAgo(task.createdAt)}</span>
        </div>

        {/* TITLE */}
        <h4 className="text-sm font-semibold text-white mb-2 line-clamp-2">{task.title}</h4>

        {/* BODY: Assignee + Asset */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${isActive ? 'bg-amber-500/30' : 'bg-slate-700'}`}>
              <span className={`text-[8px] font-bold ${isActive ? 'text-amber-300' : 'text-slate-300'}`}>{initials}</span>
            </div>
            <span className={`truncate max-w-[120px] ${isActive ? 'text-amber-400 font-semibold' : 'text-slate-400'}`}>{assignee}</span>
          </div>
          {task.assetName && (
            <div className="flex items-center gap-1 text-slate-500">
              <Wrench className="w-3 h-3" />
              <span className="truncate max-w-[120px]">{task.assetName}</span>
            </div>
          )}
        </div>
      </button>

      {/* ACTION FOOTER */}
      <div className="border-t border-slate-700/30 px-4 py-2.5 flex items-center justify-end gap-2">
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition flex items-center gap-1.5 min-h-[32px]"
        >
          <Edit2 className="w-3.5 h-3.5" />
          Upravit
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/10 text-red-400 hover:bg-red-500/20 transition flex items-center gap-1.5 min-h-[32px]"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Smazat
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════
export default function TasksPage() {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const { tasks, loading } = useTasks();
  const technicians = useTechnicians();
  const [showNewTask, setShowNewTask] = useState(false);
  const [actionsTask, setActionsTask] = useState<Task | null>(null);
  const [completingTask, setCompletingTask] = useState<Task | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [filterTab, setFilterTab] = useState<FilterTab>('active');
  const [filterPriority, setFilterPriority] = useState<string | null>(null);
  const [filterTechnician, setFilterTechnician] = useState<string | null>(null);

  // Form state with draft persistence
  const [form, setForm, clearDraft] = useFormDraft('new_task', {
    title: '',
    description: '',
    priority: 'P3',
    assignee: '',
    workType: '',
  });
  const [saving, setSaving] = useState(false);

  // Counts for tabs
  const activeCount = tasks.filter((t) => t.status !== 'done' && t.status !== 'completed').length;
  const mineCount = tasks.filter((t) =>
    (t.assignedToName === user?.displayName || t.assignedTo === user?.displayName) &&
    t.status !== 'done' && t.status !== 'completed'
  ).length;
  const doneCount = tasks.filter((t) => t.status === 'done' || t.status === 'completed').length;
  const tabCounts: Record<FilterTab, number> = { active: activeCount, mine: mineCount, done: doneCount };

  // Filtered & sorted tasks
  const filteredTasks = (() => {
    let result = [...tasks];

    switch (filterTab) {
      case 'mine':
        result = result.filter((t) =>
          (t.assignedToName === user?.displayName || t.assignedTo === user?.displayName) &&
          t.status !== 'done' && t.status !== 'completed'
        );
        break;
      case 'active':
        result = result.filter((t) => t.status !== 'done' && t.status !== 'completed');
        break;
      case 'done':
        result = result.filter((t) => t.status === 'done' || t.status === 'completed');
        break;
    }

    if (filterPriority) {
      result = result.filter((t) => t.priority === filterPriority);
    }

    if (filterTechnician) {
      result = result.filter((t) => t.assignedToName === filterTechnician || t.assignedTo === filterTechnician);
    }

    const order: Record<string, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };
    return result.sort((a, b) => (order[a.priority] ?? 9) - (order[b.priority] ?? 9));
  })();

  const handleCreateTask = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'tasks'), {
        title: form.title.trim(),
        description: form.description.trim() || '',
        status: 'backlog',
        priority: form.priority || 'P3',
        type: 'corrective',
        source: 'web',
        workType: form.workType || null,
        assigneeId: form.assignee || null,
        assigneeName: form.assignee || null,
        isDone: false,
        createdAt: Timestamp.now(),
        updatedAt: serverTimestamp(),
        createdById: user?.id || 'unknown',
        createdByName: user?.displayName || 'Neznámý',
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
              {activeCount} otevřených · {doneCount} hotových
            </p>
          </div>
          {filterTab === 'done' && (
            <button
              onClick={() => {
                const pdf = new jsPDF();
                pdf.setFontSize(14);
                pdf.text('Nominal CMMS — Dokončené úkoly', 14, 15);
                pdf.setFontSize(9);
                pdf.text(`Export: ${new Date().toLocaleDateString('cs-CZ')}`, 14, 22);
                autoTable(pdf, {
                  startY: 28,
                  head: [['Priorita', 'Název úkolu', 'Zařízení', 'Dokončeno', 'Řešitel']],
                  body: filteredTasks.map(t => [
                    t.priority,
                    t.title,
                    t.assetName || '—',
                    t.completedAt ? (t.completedAt.toDate ? t.completedAt.toDate() : new Date(t.completedAt)).toLocaleDateString('cs-CZ') : '—',
                    t.completedBy || t.assignedToName || '—',
                  ]),
                  styles: { fontSize: 8 },
                  headStyles: { fillColor: [30, 41, 59] },
                });
                pdf.save(`NOMINAL_hotove_${new Date().toISOString().slice(0, 10)}.pdf`);
              }}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition"
              title="Export PDF"
            >
              <Download className="w-5 h-5 text-slate-400" />
            </button>
          )}
          {loading && <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />}
        </div>

        {/* Summary */}
        <TaskSummary tasks={tasks} />

        {/* Tab filters */}
        <div className="flex gap-1 mb-3 border-b border-white/10 pb-2">
          {TAB_OPTIONS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilterTab(tab.key)}
              className={`px-4 py-2 rounded-lg text-[13px] font-semibold transition-all ${
                filterTab === tab.key
                  ? 'bg-orange-500/15 text-orange-400'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {tab.label}
              <span className="ml-1.5 text-[11px] opacity-70">{tabCounts[tab.key]}</span>
            </button>
          ))}
        </div>

        {/* Compact filters — priority + technician in one row */}
        <div className="flex gap-2 mb-4">
          <select
            value={filterPriority || ''}
            onChange={(e) => setFilterPriority(e.target.value || null)}
            className="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold text-slate-300 focus:outline-none focus:border-orange-500/40 transition"
          >
            <option value="">Priorita: Vše</option>
            <option value="P1">P1 — Havárie</option>
            <option value="P2">P2 — Tento týden</option>
            <option value="P3">P3 — Běžná</option>
            <option value="P4">P4 — Nápad</option>
          </select>
          {technicians.length > 0 && (
            <select
              value={filterTechnician || ''}
              onChange={(e) => setFilterTechnician(e.target.value || null)}
              className="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold text-slate-300 focus:outline-none focus:border-orange-500/40 transition"
            >
              <option value="">Technik: Všichni</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.displayName}>{t.displayName}</option>
              ))}
            </select>
          )}
        </div>

        {/* ═══ CARD GRID ═══ */}
        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Načítám...
          </div>
        ) : filteredTasks.length === 0 ? (
          <EmptyState
            icon={<Inbox className="w-12 h-12" />}
            title={filterTab === 'mine' ? 'Žádné přiřazené úkoly' : filterTab === 'done' ? 'Žádné hotové úkoly' : 'Žádné aktivní úkoly'}
            subtitle={filterPriority ? 'Zkus jiný filtr priority' : 'Vše čisté!'}
            actionLabel="Nový úkol"
            onAction={() => setShowNewTask(true)}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredTasks.map((task) => (
              <TaskCard key={task.id} task={task} onClick={() => setActionsTask(task)} onEdit={() => setEditingTask(task)} onDelete={async () => {
                if (window.confirm(`Smazat úkol "${task.title}"?`)) {
                  await deleteDoc(doc(db, 'tasks', task.id));
                }
              }} />
            ))}
          </div>
        )}
      </div>

      {/* FAB */}
      <FAB icon={<Plus className="w-6 h-6" />} label="Nový úkol" onClick={() => setShowNewTask(true)} />

      {/* New Task Modal */}
      <BottomSheet title="Nový úkol" isOpen={showNewTask} onClose={() => setShowNewTask(false)}>
        <FormField label="Název" value={form.title} onChange={(v) => setForm(prev => ({ ...prev, title: v }))} placeholder="Co je potřeba udělat?" required />
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <FormField label="Popis" value={form.description} onChange={(v) => setForm(prev => ({ ...prev, description: v }))} type="textarea" placeholder="Podrobnosti..." />
          </div>
          <div className="mb-4">
            <MicButton onTranscript={(t) => setForm(prev => ({ ...prev, description: prev.description ? prev.description + ' ' + t : t }))} />
          </div>
        </div>
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
          label="Typ práce"
          value={form.workType}
          onChange={(v) => setForm(prev => ({ ...prev, workType: v }))}
          type="select"
          required
          options={[
            { value: 'udrzba', label: 'Údržba' },
            { value: 'projekt_milan', label: 'Projekt/Milan' },
            { value: 'revize', label: 'Revize' },
            { value: 'sanitace', label: 'Sanitace' },
          ]}
        />
        <FormField
          label="Priorita"
          value={form.priority}
          onChange={(v) => setForm(prev => ({ ...prev, priority: v }))}
          type="select"
          required
          options={[
            { value: 'P1', label: 'P1 — Havárie' },
            { value: 'P2', label: 'P2 — Tento týden' },
            { value: 'P3', label: 'P3 — Běžná' },
            { value: 'P4', label: 'P4 — Nápad' },
          ]}
        />
        <FormFooter
          onCancel={() => setShowNewTask(false)}
          onSubmit={handleCreateTask}
          submitLabel="Vytvořit úkol"
          loading={saving}
          disabled={!form.title.trim()}
        />
      </BottomSheet>

      {/* Task Actions Sheet */}
      {actionsTask && (
        <TaskActionsSheet
          task={actionsTask}
          userName={user?.displayName || 'Neznámý'}
          onClose={() => setActionsTask(null)}
          onComplete={() => { setCompletingTask(actionsTask); setActionsTask(null); }}
          onStatusChange={async (updates) => {
            await updateDoc(doc(db, 'tasks', actionsTask.id), {
              ...updates,
              updatedAt: serverTimestamp(),
            });
            setActionsTask(null);
          }}
        />
      )}

      {/* Complete Task Modal */}
      {completingTask && (
        <CompleteTaskModal
          taskTitle={completingTask.title}
          onConfirm={async (data) => {
            await updateDoc(doc(db, 'tasks', completingTask.id), {
              status: 'done',
              isDone: true,
              resolution: data.resolution,
              durationMinutes: data.durationMinutes,
              workType: data.workType || null,
              completedAt: serverTimestamp(),
              completedBy: data.completedByName || user?.displayName || 'Neznámý',
              updatedAt: serverTimestamp(),
            });
            setCompletingTask(null);
          }}
          onClose={() => setCompletingTask(null)}
        />
      )}

      {/* Edit Task Sheet */}
      {editingTask && (
        <EditTaskSheet
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onSave={async (updates) => {
            await updateDoc(doc(db, 'tasks', editingTask.id), {
              ...updates,
              updatedAt: serverTimestamp(),
            });
            setEditingTask(null);
          }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// EDIT TASK SHEET
// ═══════════════════════════════════════════════════
function EditTaskSheet({ task, onClose, onSave }: {
  task: Task;
  onClose: () => void;
  onSave: (updates: Record<string, unknown>) => Promise<void>;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  const [priority, setPriority] = useState(task.priority);
  const [status, setStatus] = useState(task.status);
  const [assignee, setAssignee] = useState(task.assignedToName || task.assignedTo || '');
  const [workType, setWorkType] = useState((task as any).workType || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim(),
        priority,
        status,
        assignedToName: assignee || undefined,
        workType: workType || null,
      });
    } catch (err) {
      console.error('[TasksPage] Edit save failed:', err);
    }
    setSaving(false);
  };

  return (
    <BottomSheet title="Upravit úkol" isOpen onClose={onClose}>
      <FormField label="Název" value={title} onChange={setTitle} required />
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <FormField label="Popis" value={description} onChange={setDescription} type="textarea" />
        </div>
        <div className="mb-4">
          <MicButton onTranscript={(t) => setDescription((prev) => prev ? prev + ' ' + t : t)} />
        </div>
      </div>
      <FormField
        label="Priorita"
        value={priority}
        onChange={setPriority}
        type="select"
        options={[
          { value: 'P1', label: 'P1 — Havárie' },
          { value: 'P2', label: 'P2 — Tento týden' },
          { value: 'P3', label: 'P3 — Běžná' },
          { value: 'P4', label: 'P4 — Nápad' },
        ]}
      />
      <FormField
        label="Status"
        value={status}
        onChange={setStatus}
        type="select"
        options={[
          { value: 'backlog', label: 'Nový' },
          { value: 'planned', label: 'Plánovaný' },
          { value: 'in_progress', label: 'V řešení' },
          { value: 'paused', label: 'Čeká na díl' },
          { value: 'deferred', label: 'Odloženo' },
          { value: 'completed', label: 'Hotovo' },
        ]}
      />
      <FormField
        label="Typ práce"
        value={workType}
        onChange={setWorkType}
        type="select"
        required
        options={[
          { value: 'udrzba', label: 'Údržba' },
          { value: 'projekt_milan', label: 'Projekt/Milan' },
          { value: 'revize', label: 'Revize' },
          { value: 'sanitace', label: 'Sanitace' },
        ]}
      />
      <FormField
        label="Přiřadit"
        value={assignee}
        onChange={setAssignee}
        type="select"
        options={[
          { value: 'Zdeněk Mička', label: 'Zdeněk Mička' },
          { value: 'Petr Volf', label: 'Petr Volf' },
          { value: 'Filip Novák', label: 'Filip Novák' },
          { value: 'Vilém', label: 'Vilém' },
        ]}
      />
      <FormFooter
        onCancel={onClose}
        onSubmit={handleSave}
        submitLabel="Uložit změny"
        loading={saving}
        disabled={!title.trim()}
      />
    </BottomSheet>
  );
}

// ═══════════════════════════════════════════════════
// TASK ACTIONS SHEET (status transitions)
// ═══════════════════════════════════════════════════
function TaskActionsSheet({ task, userName, onClose, onComplete, onStatusChange }: {
  task: Task;
  userName: string;
  onClose: () => void;
  onComplete: () => void;
  onStatusChange: (updates: Record<string, unknown>) => Promise<void>;
}) {
  const [showPlanner, setShowPlanner] = useState(false);
  const [plannedDate, setPlannedDate] = useState('');
  const [saving, setSaving] = useState(false);

  const isDone = task.status === 'done' || task.status === 'completed';
  const isInProgress = task.status === 'in_progress';

  const doAction = async (updates: Record<string, unknown>) => {
    setSaving(true);
    await onStatusChange(updates);
    setSaving(false);
  };

  const sb = STATUS_BADGES[task.status] || STATUS_BADGES.backlog;
  const pc = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.P3;

  return (
    <BottomSheet title="Akce úkolu" isOpen onClose={onClose}>
      {/* Task info */}
      <div className="bg-slate-700/50 rounded-xl p-3.5 mb-5">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${pc.color}20`, color: pc.color }}>
            {task.priority}
          </span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-lg ${sb.bg} ${sb.text}`}>{sb.label}</span>
        </div>
        <div className="text-white font-semibold">{task.title}</div>
        {task.description && <div className="text-xs text-slate-400 mt-1 line-clamp-2">{task.description}</div>}
      </div>

      {/* Date picker (conditionally shown) */}
      {showPlanner && (
        <div className="mb-4 p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
          <label className="block text-sm text-blue-400 font-medium mb-2">
            <CalendarDays className="w-4 h-4 inline mr-1.5" />
            Datum plánování
          </label>
          <input
            type="date"
            value={plannedDate}
            onChange={(e) => setPlannedDate(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-base focus:outline-none focus:border-blue-500/50 transition min-h-[48px]"
          />
          <button
            disabled={!plannedDate || saving}
            onClick={() => doAction({ status: 'planned', plannedDate, updatedBy: userName })}
            className="w-full mt-3 py-3.5 rounded-xl bg-blue-500 text-white font-bold text-base active:scale-[0.97] transition disabled:opacity-40"
          >
            {saving ? 'Ukládám...' : 'Potvrdit plán'}
          </button>
        </div>
      )}

      {/* Action buttons — vertical stack, thumb-friendly */}
      {!isDone && (
        <div className="flex flex-col gap-2.5">
          {/* Přebírám */}
          {!isInProgress && (
            <button
              disabled={saving}
              onClick={() => doAction({ status: 'in_progress', startedAt: serverTimestamp(), assignedToName: userName, updatedBy: userName })}
              className="w-full py-4 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 font-bold text-base flex items-center justify-center gap-2.5 active:scale-[0.97] transition disabled:opacity-40"
            >
              <Play className="w-5 h-5" /> Přebírám
            </button>
          )}

          {/* Naplánovat */}
          {!showPlanner && (
            <button
              onClick={() => setShowPlanner(true)}
              className="w-full py-4 rounded-2xl bg-blue-500/15 border border-blue-500/30 text-blue-400 font-bold text-base flex items-center justify-center gap-2.5 active:scale-[0.97] transition"
            >
              <CalendarDays className="w-5 h-5" /> Naplánovat
            </button>
          )}

          {/* Odložit */}
          <button
            disabled={saving}
            onClick={() => doAction({ status: 'deferred', updatedBy: userName })}
            className="w-full py-4 rounded-2xl bg-violet-500/15 border border-violet-500/30 text-violet-400 font-bold text-base flex items-center justify-center gap-2.5 active:scale-[0.97] transition disabled:opacity-40"
          >
            <PauseCircle className="w-5 h-5" /> Odložit
          </button>

          {/* Dokončit */}
          <button
            onClick={onComplete}
            className="w-full py-4 rounded-2xl bg-emerald-500 text-white font-bold text-base flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-500/25 active:scale-[0.97] transition"
          >
            <CheckCircle2 className="w-5 h-5" /> Dokončit
          </button>
        </div>
      )}

      {isDone && (
        <div className="text-center py-6 text-emerald-400 font-semibold">
          <CheckCircle2 className="w-8 h-8 mx-auto mb-2" />
          Tento úkol je dokončen
        </div>
      )}
    </BottomSheet>
  );
}
