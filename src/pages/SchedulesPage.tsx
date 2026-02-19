// src/pages/SchedulesPage.tsx
// VIKRR — Asset Shield — Správa opakovaných úkolů (recurring_tasks CRUD)

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthContext } from '../context/AuthContext';
import {
  ArrowLeft, Plus, Loader2, Pencil, Trash2, Clock, CalendarDays, ToggleLeft, ToggleRight,
} from 'lucide-react';
import BottomSheet, { FormField, FormFooter } from '../components/ui/BottomSheet';
import EmptyState from '../components/ui/EmptyState';
import FAB from '../components/ui/FAB';

// ═══════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════
interface RecurringTask {
  id: string;
  title: string;
  daysOfWeek: number[];
  time: string;
  active: boolean;
  createdAt?: any;
}

const DAY_LABELS = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];
const DAY_LABELS_FULL = ['Neděle', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota'];

// ═══════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════
function useRecurringTasks() {
  const [tasks, setTasks] = useState<RecurringTask[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'recurring_tasks'), (snap) => {
      setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() } as RecurringTask)).sort((a, b) => a.title.localeCompare(b.title)));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);
  return { tasks, loading };
}

// ═══════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════
export default function SchedulesPage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuthContext();
  const { tasks, loading } = useRecurringTasks();

  const canManage = hasPermission('schedule.manage');

  // Modal state
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<RecurringTask | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<RecurringTask | null>(null);

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formTime, setFormTime] = useState('08:00');
  const [formDays, setFormDays] = useState<number[]>([1, 2, 3, 4, 5]); // Mon-Fri default
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setFormTitle(''); setFormTime('08:00'); setFormDays([1, 2, 3, 4, 5]);
    setEditingTask(null);
  };

  const openAdd = () => { resetForm(); setShowForm(true); };

  const openEdit = (task: RecurringTask) => {
    setFormTitle(task.title);
    setFormTime(task.time);
    setFormDays([...task.daysOfWeek]);
    setEditingTask(task);
    setShowForm(true);
  };

  const toggleDay = (day: number) => {
    setFormDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort());
  };

  const handleSave = async () => {
    if (!formTitle.trim() || formDays.length === 0) return;
    setSaving(true);
    try {
      const data = {
        title: formTitle.trim(),
        daysOfWeek: formDays,
        time: formTime,
        active: editingTask ? editingTask.active : true,
      };
      if (editingTask) {
        await updateDoc(doc(db, 'recurring_tasks', editingTask.id), data);
      } else {
        await addDoc(collection(db, 'recurring_tasks'), { ...data, createdAt: Timestamp.now() });
      }
      setShowForm(false);
      resetForm();
    } catch (err) {
      console.error('[Schedules] Save failed:', err);
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    await deleteDoc(doc(db, 'recurring_tasks', confirmDelete.id));
    setConfirmDelete(null);
  };

  const toggleActive = async (task: RecurringTask) => {
    await updateDoc(doc(db, 'recurring_tasks', task.id), { active: !task.active });
  };

  const today = new Date().getDay();

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="max-w-4xl mx-auto px-3 pt-4 pb-24">

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate('/')} className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center text-slate-400 hover:text-white transition">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-orange-400" />
              Opakované úkoly
            </h1>
            <p className="text-xs text-slate-500">{tasks.filter((t) => t.active).length} aktivních · {tasks.length} celkem</p>
          </div>
          {loading && <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />}
        </div>

        {/* Today indicator */}
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl px-4 py-2.5 mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-orange-400" />
          <span className="text-sm text-orange-400 font-medium">Dnes: {DAY_LABELS_FULL[today]}</span>
          <span className="text-xs text-orange-400/60 ml-auto">
            {tasks.filter((t) => t.active && t.daysOfWeek.includes(today)).length} úkolů dnes
          </span>
        </div>

        {/* Task list */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Načítám...
          </div>
        ) : tasks.length === 0 ? (
          <EmptyState
            icon={<CalendarDays className="w-12 h-12" />}
            title="Žádné opakované úkoly"
            subtitle="Vytvořte první rozvrh"
            actionLabel="Přidat úkol"
            onAction={openAdd}
          />
        ) : (
          <div className="space-y-2.5">
            {tasks.map((task) => {
              const isToday = task.daysOfWeek.includes(today);
              return (
                <div
                  key={task.id}
                  className={`rounded-2xl border p-4 transition ${
                    !task.active
                      ? 'bg-slate-800/30 border-slate-700/20 opacity-50'
                      : isToday
                        ? 'bg-orange-500/8 border-orange-500/25'
                        : 'bg-slate-800/50 border-slate-700/30'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Toggle */}
                    {canManage && (
                      <button onClick={() => toggleActive(task)} className="flex-shrink-0">
                        {task.active
                          ? <ToggleRight className="w-7 h-7 text-emerald-400" />
                          : <ToggleLeft className="w-7 h-7 text-slate-600" />
                        }
                      </button>
                    )}

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <h3 className="text-sm font-semibold text-white truncate">{task.title}</h3>
                        {isToday && task.active && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400 flex-shrink-0">DNES</span>
                        )}
                      </div>
                      {/* Day chips */}
                      <div className="flex items-center gap-1">
                        {DAY_LABELS.map((lbl, idx) => (
                          <span
                            key={idx}
                            className={`text-[10px] font-bold w-6 h-6 rounded-md flex items-center justify-center ${
                              task.daysOfWeek.includes(idx)
                                ? idx === today && task.active
                                  ? 'bg-orange-500 text-white'
                                  : 'bg-slate-600 text-white'
                                : 'bg-white/5 text-slate-600'
                            }`}
                          >
                            {lbl}
                          </span>
                        ))}
                        <span className="text-xs text-slate-500 ml-2 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {task.time}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    {canManage && (
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={() => openEdit(task)} className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-slate-500 hover:text-blue-400 transition">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setConfirmDelete(task)} className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-slate-500 hover:text-red-400 transition">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* FAB */}
      {canManage && <FAB icon={<Plus className="w-6 h-6" />} label="Nový rozvrh" onClick={openAdd} />}

      {/* Add/Edit Modal */}
      <BottomSheet title={editingTask ? '✏️ Upravit rozvrh' : '➕ Nový opakovaný úkol'} isOpen={showForm} onClose={() => { setShowForm(false); resetForm(); }}>
        <FormField label="Název úkolu" value={formTitle} onChange={setFormTitle} placeholder="Např. Vývoz popelnic" required />
        <FormField label="Čas (HH:MM)" value={formTime} onChange={setFormTime} placeholder="08:00" />

        {/* Day selector */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-400 mb-2">Dny v týdnu</label>
          <div className="flex gap-1.5">
            {DAY_LABELS.map((lbl, idx) => (
              <button
                key={idx}
                onClick={() => toggleDay(idx)}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition ${
                  formDays.includes(idx)
                    ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                    : 'bg-white/5 text-slate-600 border border-white/10'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <button onClick={() => setFormDays([1, 2, 3, 4, 5])} className="text-[10px] text-blue-400 hover:underline">Po-Pá</button>
            <button onClick={() => setFormDays([0, 1, 2, 3, 4, 5, 6])} className="text-[10px] text-blue-400 hover:underline">Každý den</button>
            <button onClick={() => setFormDays([])} className="text-[10px] text-slate-500 hover:underline">Vymazat</button>
          </div>
        </div>

        <FormFooter
          onCancel={() => { setShowForm(false); resetForm(); }}
          onSubmit={handleSave}
          submitLabel={editingTask ? 'Uložit změny' : 'Vytvořit rozvrh'}
          loading={saving}
          disabled={!formTitle.trim() || formDays.length === 0}
        />
      </BottomSheet>

      {/* Delete confirm */}
      <BottomSheet title="🗑 Smazat opakovaný úkol?" isOpen={!!confirmDelete} onClose={() => setConfirmDelete(null)}>
        {confirmDelete && (
          <>
            <div className="bg-red-500/10 rounded-xl p-4 mb-4 border border-red-500/20">
              <p className="text-sm text-white font-semibold">{confirmDelete.title}</p>
              <p className="text-xs text-slate-400 mt-1">{confirmDelete.daysOfWeek.map((d) => DAY_LABELS[d]).join(', ')} · {confirmDelete.time}</p>
              <p className="text-xs text-red-400 mt-2">Tato akce je nevratná!</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setConfirmDelete(null)} className="py-3 rounded-xl bg-white/5 border border-white/10 text-slate-400 text-sm font-semibold active:scale-95 transition">
                Zrušit
              </button>
              <button onClick={handleDelete} className="py-3 rounded-xl bg-red-500 text-white text-sm font-semibold active:scale-95 transition shadow-lg shadow-red-500/30">
                Smazat
              </button>
            </div>
          </>
        )}
      </BottomSheet>
    </div>
  );
}
