// src/pages/TasksPage.tsx
// NOMINAL CMMS — Úkoly (responsive grid: 1col mobil, 2col tablet, 3col PC)

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
} from 'lucide-react';
import { useReports } from '../hooks/useReports';

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

const STATUS_BADGES: Record<string, { label: string; bg: string; text: string }> = {
  backlog:      { label: 'Nový',         bg: 'bg-red-500/20',     text: 'text-red-400' },
  planned:      { label: 'Plánovaný',    bg: 'bg-blue-500/20',    text: 'text-blue-400' },
  in_progress:  { label: 'V řešení',     bg: 'bg-amber-500/20',   text: 'text-amber-400' },
  paused:       { label: 'Čeká na díl',  bg: 'bg-cyan-500/20',    text: 'text-cyan-400' },
  completed:    { label: 'Hotovo',        bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
  done:         { label: 'Hotovo',        bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
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
// TAB FILTER TYPE
// ═══════════════════════════════════════════════════
type FilterTab = 'mine' | 'active' | 'done';

const TAB_OPTIONS: { key: FilterTab; label: string; color: string }[] = [
  { key: 'active', label: 'Aktivní', color: '#fbbf24' },
  { key: 'mine', label: 'Moje úkoly', color: '#f97316' },
  { key: 'done', label: 'Hotovo', color: '#34d399' },
];

// ═══════════════════════════════════════════════════
// TABLE ROW
// ═══════════════════════════════════════════════════
function TaskRow({ task, onClick, onEdit, onDelete }: { task: Task; onClick: () => void; onEdit: () => void; onDelete: () => void }) {
  const pc = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.P3;
  const sb = STATUS_BADGES[task.status] || STATUS_BADGES.backlog;
  const assignee = task.assignedToName || task.assignedTo || '—';

  return (
    <tr
      onClick={onClick}
      className="border-t border-white/5 hover:bg-white/[0.04] cursor-pointer transition-colors active:bg-white/[0.08]"
    >
      {/* Kdo */}
      <td className="px-2 py-2 sm:px-3 sm:py-3 w-[44px] sm:w-[100px]">
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
            <span className="text-[9px] sm:text-[10px] font-bold text-slate-300">
              {assignee !== '—' ? assignee.split(' ').filter(Boolean).map(w => w[0] || '').join('').slice(0, 2) || '?' : '?'}
            </span>
          </div>
          <span className="text-[12px] text-slate-300 truncate hidden sm:block max-w-[80px]">{assignee}</span>
        </div>
      </td>

      {/* Co */}
      <td className="px-2 py-2 sm:px-3 sm:py-3">
        <div className="flex items-center gap-1.5">
          <span
            className="text-[9px] font-bold px-1 py-0.5 rounded flex-shrink-0"
            style={{ background: `${pc.color}20`, color: pc.color }}
          >
            {task.priority}
          </span>
          <span className="text-[13px] font-medium text-white truncate">{task.title}</span>
        </div>
        {task.assetName && (
          <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1">
            <Wrench className="w-3 h-3" /> {task.assetName}
          </div>
        )}
      </td>

      {/* Termín */}
      <td className="px-2 py-2 sm:px-3 sm:py-3 text-[11px] text-slate-500 whitespace-nowrap w-[50px] sm:w-[70px]">
        {timeAgo(task.createdAt)}
      </td>

      {/* Status */}
      <td className="px-2 py-2 sm:px-3 sm:py-3 w-[70px] sm:w-[100px]">
        <span className={`text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-lg whitespace-nowrap ${sb.bg} ${sb.text}`}>
          {sb.label}
        </span>
      </td>

      {/* Akce */}
      <td className="px-1 py-2 sm:px-2 w-[56px]">
        <div className="flex items-center gap-0.5">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-500 hover:text-amber-400 transition"
            title="Upravit"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-500 hover:text-red-400 transition"
            title="Smazat"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ═══════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════
export default function TasksPage() {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const { tasks, loading } = useTasks();
  const { exportXLSX } = useReports();

  const [showNewTask, setShowNewTask] = useState(false);
  const [completingTask, setCompletingTask] = useState<Task | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [filterTab, setFilterTab] = useState<FilterTab>('active');
  const [filterPriority, setFilterPriority] = useState<string | null>(null);

  // Form state with draft persistence
  const [form, setForm, clearDraft] = useFormDraft('new_task', {
    title: '',
    description: '',
    priority: 'P3',
    assignee: '',
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
          <button
            onClick={() => exportXLSX('tasks', filteredTasks, { filename: `NOMINAL_ukoly_${new Date().toISOString().slice(0, 10)}.xlsx` })}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition"
            title="Export XLSX"
          >
            <Download className="w-5 h-5 text-slate-400" />
          </button>
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

        {/* Priority chips */}
        <div className="flex gap-1.5 mb-4 overflow-x-auto">
          <FilterChip label="Vše" active={!filterPriority} onClick={() => setFilterPriority(null)} color="#94a3b8" />
          <FilterChip label="P1" active={filterPriority === 'P1'} onClick={() => setFilterPriority(filterPriority === 'P1' ? null : 'P1')} color="#f87171" />
          <FilterChip label="P2" active={filterPriority === 'P2'} onClick={() => setFilterPriority(filterPriority === 'P2' ? null : 'P2')} color="#fbbf24" />
          <FilterChip label="P3" active={filterPriority === 'P3'} onClick={() => setFilterPriority(filterPriority === 'P3' ? null : 'P3')} color="#60a5fa" />
          <FilterChip label="P4" active={filterPriority === 'P4'} onClick={() => setFilterPriority(filterPriority === 'P4' ? null : 'P4')} color="#94a3b8" />
        </div>

        {/* ═══ TABLE ═══ */}
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
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-800/60">
                  <th className="text-left px-3 py-2.5 text-[11px] text-slate-500 uppercase tracking-wider font-semibold">Kdo</th>
                  <th className="text-left px-3 py-2.5 text-[11px] text-slate-500 uppercase tracking-wider font-semibold">Co</th>
                  <th className="text-left px-3 py-2.5 text-[11px] text-slate-500 uppercase tracking-wider font-semibold">Termín</th>
                  <th className="text-left px-3 py-2.5 text-[11px] text-slate-500 uppercase tracking-wider font-semibold">Status</th>
                  <th className="w-[36px]"></th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map((task) => (
                  <TaskRow key={task.id} task={task} onClick={() => setCompletingTask(task)} onEdit={() => setEditingTask(task)} onDelete={async () => {
                    if (window.confirm(`Smazat úkol "${task.title}"?`)) {
                      await deleteDoc(doc(db, 'tasks', task.id));
                    }
                  }} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* FAB */}
      <FAB icon={<Plus className="w-6 h-6" />} label="Nový úkol" onClick={() => setShowNewTask(true)} />

      {/* New Task Modal */}
      <BottomSheet title="Nový úkol" isOpen={showNewTask} onClose={() => setShowNewTask(false)}>
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
            { value: 'P1', label: 'P1 — Havárie' },
            { value: 'P2', label: 'P2 — Tento týden' },
            { value: 'P3', label: 'P3 — Běžná' },
            { value: 'P4', label: 'P4 — Nápad' },
          ]}
        />
        <SubmitButton label="Vytvořit úkol" onClick={handleCreateTask} loading={saving} />
      </BottomSheet>

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
      });
    } catch (err) {
      console.error('[TasksPage] Edit save failed:', err);
    }
    setSaving(false);
  };

  return (
    <BottomSheet title="Upravit úkol" isOpen onClose={onClose}>
      <FormField label="Název" value={title} onChange={setTitle} required />
      <FormField label="Popis" value={description} onChange={setDescription} type="textarea" />
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
          { value: 'completed', label: 'Hotovo' },
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
      <SubmitButton label={saving ? 'Ukládám...' : 'Uložit změny'} onClick={handleSave} loading={saving} />
    </BottomSheet>
  );
}
