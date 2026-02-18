// src/pages/CalendarPage.tsx
// VIKRR — Asset Shield — Týdenní plán (Firestore LIVE)
// Flexibilní kalendář — upravuje se denně dle situace

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, onSnapshot, doc, updateDoc, Timestamp
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthContext } from '../context/AuthContext';
import {
  Calendar, ChevronLeft, ChevronRight, Plus,
  Clock, Wrench, AlertTriangle, CheckCircle2,
  X, User, ArrowLeft, Loader2, Inbox
} from 'lucide-react';

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════

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
  estimatedMinutes?: number;
  scheduledDate?: any; // Firestore Timestamp or null
  createdAt?: any;
  completedAt?: any;
  completedBy?: string;
  updatedAt?: any;
  updatedBy?: string;
}

// ═══════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════

const DAY_NAMES = ['Neděle', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota'];
const DAY_SHORTS = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];

const PRIORITY_CONFIG: Record<string, { color: string; bg: string; border: string }> = {
  P1: { color: '#f87171', bg: 'bg-red-500/12', border: 'border-red-500/35' },
  P2: { color: '#fbbf24', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
  P3: { color: '#60a5fa', bg: 'bg-blue-500/8', border: 'border-blue-500/20' },
  P4: { color: '#94a3b8', bg: 'bg-slate-500/8', border: 'border-slate-500/20' },
};

// ═══════════════════════════════════════════
// WEEK HELPERS
// ═══════════════════════════════════════════

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekDays(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function getISOWeekNumber(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function formatDate(d: Date): string {
  return `${d.getDate()}.${d.getMonth() + 1}.`;
}

function formatMinutes(mins: number): string {
  if (!mins) return '';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function toDate(val: any): Date | null {
  if (!val) return null;
  if (val.toDate) return val.toDate();
  if (val instanceof Date) return val;
  return new Date(val);
}

// ═══════════════════════════════════════════
// HOOK — všechny nesmazané tasky
// ═══════════════════════════════════════════

function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'tasks'),
      (snap) => {
        const all = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Task))
          .filter((t) => !((t as any).isDeleted));
        setTasks(all);
        setLoading(false);
      },
      (err) => {
        console.error('[Calendar] Firestore error:', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  return { tasks, loading };
}

// ═══════════════════════════════════════════
// TASK CARD (dark theme)
// ═══════════════════════════════════════════

function CalendarTaskCard({
  task,
  onUnschedule,
  onComplete,
}: {
  task: Task;
  onUnschedule?: () => void;
  onComplete?: () => void;
}) {
  const pc = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.P3;

  return (
    <div className={`p-2.5 rounded-xl border ${pc.bg} ${pc.border} flex items-start gap-2`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {task.priority === 'P1' ? (
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: pc.color }} />
          ) : (
            <Wrench className="w-3.5 h-3.5 flex-shrink-0" style={{ color: pc.color }} />
          )}
          <span
            className="text-[10px] font-bold px-1 py-0.5 rounded"
            style={{ background: `${pc.color}20`, color: pc.color }}
          >
            {task.priority}
          </span>
          <span className="text-[13px] font-medium text-white truncate">{task.title}</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-slate-500">
          {task.estimatedMinutes && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatMinutes(task.estimatedMinutes)}
            </span>
          )}
          {task.assetName && (
            <span className="flex items-center gap-1">
              <Wrench className="w-3 h-3" />
              {task.assetName}
            </span>
          )}
          {task.assignedToName && (
            <span className="flex items-center gap-1">
              <User className="w-3 h-3" />
              {task.assignedToName}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1 flex-shrink-0">
        {onComplete && (
          <button
            onClick={onComplete}
            className="p-1 rounded hover:bg-emerald-500/20 text-slate-500 hover:text-emerald-400 transition"
            title="Dokončit"
          >
            <CheckCircle2 className="w-4 h-4" />
          </button>
        )}
        {onUnschedule && (
          <button
            onClick={onUnschedule}
            className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-red-400 transition"
            title="Odebrat z plánu"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// BACKLOG PANEL
// ═══════════════════════════════════════════

function BacklogPanel({
  tasks,
  isOpen,
  onClose,
  onSchedule,
  weekDays,
}: {
  tasks: Task[];
  isOpen: boolean;
  onClose: () => void;
  onSchedule: (taskId: string, date: Date) => void;
  weekDays: Date[];
}) {
  const [selectedDay, setSelectedDay] = useState<number>(1); // default pondělí

  if (!isOpen) return null;

  const sorted = [...tasks].sort((a, b) => {
    const order: Record<string, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };
    return (order[a.priority] ?? 9) - (order[b.priority] ?? 9);
  });

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div
        className="bg-slate-800 rounded-t-3xl md:rounded-3xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Inbox className="w-5 h-5 text-blue-400" />
            Backlog ({sorted.length})
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Day selector */}
        <div className="px-4 pt-3 pb-2">
          <div className="text-xs text-slate-500 mb-2">Naplánovat na:</div>
          <div className="flex gap-1.5">
            {weekDays.slice(1, 6).map((day, i) => {
              const dayIndex = i + 1;
              const isToday = isSameDay(day, new Date());
              return (
                <button
                  key={dayIndex}
                  onClick={() => setSelectedDay(dayIndex)}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold transition ${
                    selectedDay === dayIndex
                      ? 'bg-blue-600 text-white'
                      : isToday
                      ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                      : 'bg-white/5 text-slate-400 hover:bg-white/10'
                  }`}
                >
                  {DAY_SHORTS[day.getDay()]} {day.getDate()}.
                </button>
              );
            })}
          </div>
        </div>

        {/* Task list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {sorted.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-emerald-500" />
              <p className="text-sm">Backlog je prázdný!</p>
            </div>
          ) : (
            sorted.map((task) => {
              const pc = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.P3;
              return (
                <button
                  key={task.id}
                  onClick={() => onSchedule(task.id, weekDays[selectedDay])}
                  className={`w-full p-3 rounded-xl border text-left transition active:scale-[0.97] ${pc.bg} ${pc.border} hover:ring-1 hover:ring-blue-500/50`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="text-[10px] font-bold px-1 py-0.5 rounded"
                      style={{ background: `${pc.color}20`, color: pc.color }}
                    >
                      {task.priority}
                    </span>
                    <span className="text-[13px] font-medium text-white truncate">{task.title}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-slate-500">
                    {task.estimatedMinutes && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatMinutes(task.estimatedMinutes)}
                      </span>
                    )}
                    {task.assetName && (
                      <span className="flex items-center gap-1">
                        <Wrench className="w-3 h-3" />
                        {task.assetName}
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════

export default function CalendarPage() {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const { tasks, loading } = useTasks();

  // Current week state
  const [currentMonday, setCurrentMonday] = useState(() => getMonday(new Date()));
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const [showBacklog, setShowBacklog] = useState(false);

  const weekDays = useMemo(() => getWeekDays(currentMonday), [currentMonday]);
  const weekNumber = getISOWeekNumber(currentMonday);
  const today = new Date();

  // Split tasks
  const openTasks = tasks.filter(
    (t) => t.status !== 'done' && t.status !== 'completed'
  );

  const backlogTasks = openTasks.filter((t) => {
    const sd = toDate(t.scheduledDate);
    return !sd;
  });

  const scheduledTasks = openTasks.filter((t) => {
    const sd = toDate(t.scheduledDate);
    return sd !== null;
  });

  // Tasks for each day of the week
  const getTasksForDay = (date: Date): Task[] => {
    return scheduledTasks
      .filter((t) => {
        const sd = toDate(t.scheduledDate);
        return sd && isSameDay(sd, date);
      })
      .sort((a, b) => {
        const order: Record<string, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };
        return (order[a.priority] ?? 9) - (order[b.priority] ?? 9);
      });
  };

  // Week stats
  const weekTasks = weekDays.flatMap((d) => getTasksForDay(d));
  const weekMinutes = weekTasks.reduce((sum, t) => sum + (t.estimatedMinutes || 0), 0);

  // ─────────────────────────────────────────
  // ACTIONS
  // ─────────────────────────────────────────

  const handleSchedule = async (taskId: string, date: Date) => {
    try {
      await updateDoc(doc(db, 'tasks', taskId), {
        scheduledDate: Timestamp.fromDate(date),
        updatedAt: Timestamp.now(),
        updatedBy: user?.uid || '',
      });
    } catch (err) {
      console.error('Schedule failed:', err);
    }
    setShowBacklog(false);
  };

  const handleUnschedule = async (taskId: string) => {
    try {
      await updateDoc(doc(db, 'tasks', taskId), {
        scheduledDate: null,
        updatedAt: Timestamp.now(),
        updatedBy: user?.uid || '',
      });
    } catch (err) {
      console.error('Unschedule failed:', err);
    }
  };

  const handleComplete = async (taskId: string) => {
    try {
      await updateDoc(doc(db, 'tasks', taskId), {
        status: 'done',
        completedAt: Timestamp.now(),
        completedBy: user?.displayName || 'Unknown',
        updatedAt: Timestamp.now(),
        updatedBy: user?.uid || '',
      });
    } catch (err) {
      console.error('Complete failed:', err);
    }
  };

  const handlePrevWeek = () => {
    const prev = new Date(currentMonday);
    prev.setDate(prev.getDate() - 7);
    setCurrentMonday(prev);
    setExpandedDay(null);
  };

  const handleNextWeek = () => {
    const next = new Date(currentMonday);
    next.setDate(next.getDate() + 7);
    setCurrentMonday(next);
    setExpandedDay(null);
  };

  const handleToday = () => {
    setCurrentMonday(getMonday(new Date()));
    setExpandedDay(null);
  };

  const isThisWeek = isSameDay(currentMonday, getMonday(new Date()));

  // ─────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────

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
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-400" />
              Týdenní plán
            </h1>
            <p className="text-xs text-slate-500">
              {weekTasks.length} naplánováno · {backlogTasks.length} v backlogu
            </p>
          </div>
          {loading && <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />}
        </div>

        {/* Week Navigation */}
        <div className="bg-white/[0.03] backdrop-blur-sm rounded-2xl border border-white/[0.06] p-4 mb-4">
          <div className="flex items-center justify-between">
            <button
              onClick={handlePrevWeek}
              className="p-2 rounded-lg hover:bg-white/10 text-slate-400 transition"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="text-center">
              <div className="text-lg font-bold text-white">
                Týden {weekNumber} / {currentMonday.getFullYear()}
              </div>
              <div className="text-sm text-slate-500">
                {formatDate(weekDays[0])} – {formatDate(weekDays[6])}
              </div>
              {isThisWeek ? (
                <span className="inline-block mt-1 px-2 py-0.5 bg-blue-500/15 text-blue-400 text-[10px] font-medium rounded-full border border-blue-500/30">
                  Aktuální týden
                </span>
              ) : (
                <button
                  onClick={handleToday}
                  className="inline-block mt-1 px-2 py-0.5 bg-white/5 text-slate-400 text-[10px] font-medium rounded-full hover:text-white transition"
                >
                  Zpět na dnes
                </button>
              )}
            </div>
            <button
              onClick={handleNextWeek}
              className="p-2 rounded-lg hover:bg-white/10 text-slate-400 transition"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Stats */}
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="bg-white/5 p-2.5 rounded-xl text-center">
              <div className="text-lg font-bold text-white">{weekTasks.length}</div>
              <div className="text-[10px] text-slate-500">Naplánováno</div>
            </div>
            <div className="bg-white/5 p-2.5 rounded-xl text-center">
              <div className="text-lg font-bold text-white">{formatMinutes(weekMinutes) || '0h'}</div>
              <div className="text-[10px] text-slate-500">Celkem</div>
            </div>
            <button
              onClick={() => setShowBacklog(true)}
              className="bg-blue-500/10 border border-blue-500/20 p-2.5 rounded-xl text-center hover:bg-blue-500/15 transition"
            >
              <div className="text-lg font-bold text-blue-400">{backlogTasks.length}</div>
              <div className="text-[10px] text-blue-400/70">V backlogu →</div>
            </button>
          </div>
        </div>

        {/* Days */}
        <div className="space-y-2">
          {weekDays.slice(1, 6).map((date, _i) => {
            const dayIndex = date.getDay(); // 1-5 (Po-Pá)
            const dayTasks = getTasksForDay(date);
            const dayMinutes = dayTasks.reduce((s, t) => s + (t.estimatedMinutes || 0), 0);
            const isToday = isSameDay(date, today);
            const isPast = date < today && !isToday;
            const isExpanded = expandedDay === dayIndex;

            return (
              <div
                key={dayIndex}
                className={`bg-white/[0.03] backdrop-blur-sm rounded-2xl border overflow-hidden transition ${
                  isToday
                    ? 'border-blue-500/40 ring-1 ring-blue-500/20'
                    : 'border-white/[0.06]'
                } ${isPast ? 'opacity-60' : ''}`}
              >
                {/* Day header */}
                <button
                  onClick={() => setExpandedDay(isExpanded ? null : dayIndex)}
                  className="w-full p-3 flex items-center justify-between hover:bg-white/[0.02] transition"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
                        isToday
                          ? 'bg-blue-600 text-white'
                          : 'bg-white/5 text-slate-400 border border-white/10'
                      }`}
                    >
                      {date.getDate()}
                    </div>
                    <div className="text-left">
                      <div className="font-medium text-white text-sm">{DAY_NAMES[dayIndex]}</div>
                      <div className="text-[11px] text-slate-500">
                        {dayTasks.length} úkolů{dayMinutes > 0 ? ` · ${formatMinutes(dayMinutes)}` : ''}
                      </div>
                    </div>
                  </div>

                  {/* Priority dots */}
                  <div className="flex items-center gap-1.5">
                    {dayTasks.some((t) => t.priority === 'P1') && (
                      <span className="w-2 h-2 rounded-full bg-red-500" />
                    )}
                    {dayTasks.some((t) => t.priority === 'P2') && (
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                    )}
                    <ChevronLeft
                      className={`w-4 h-4 text-slate-500 transition ${
                        isExpanded ? '-rotate-90' : 'rotate-180'
                      }`}
                    />
                  </div>
                </button>

                {/* Expanded tasks */}
                {isExpanded && (
                  <div className="px-3 pb-3 border-t border-white/[0.06] pt-2 space-y-2">
                    {dayTasks.length === 0 ? (
                      <div className="text-center py-4 text-slate-500 text-sm">
                        Žádné úkoly na tento den
                      </div>
                    ) : (
                      dayTasks.map((task) => (
                        <CalendarTaskCard
                          key={task.id}
                          task={task}
                          onUnschedule={() => handleUnschedule(task.id)}
                          onComplete={() => handleComplete(task.id)}
                        />
                      ))
                    )}
                    <button
                      onClick={() => setShowBacklog(true)}
                      className="w-full py-2 border border-dashed border-white/10 rounded-xl text-slate-500 text-sm font-medium hover:border-blue-500/30 hover:text-blue-400 transition flex items-center justify-center gap-2"
                    >
                      <Plus className="w-4 h-4" /> Přidat z backlogu
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* Weekend */}
          {(() => {
            const satTasks = getTasksForDay(weekDays[6]);
            const sunTasks = getTasksForDay(weekDays[0]);
            const weekendCount = satTasks.length + sunTasks.length;
            return (
              <div className="bg-white/[0.02] rounded-2xl border border-white/[0.04] p-3">
                <div className="flex items-center justify-between text-slate-600">
                  <span className="text-sm">Víkend (So–Ne)</span>
                  <span className="text-xs">
                    {weekendCount > 0 ? `${weekendCount} úkolů` : 'Žádné úkoly'}
                  </span>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Backlog Modal */}
      <BacklogPanel
        tasks={backlogTasks}
        isOpen={showBacklog}
        onClose={() => setShowBacklog(false)}
        onSchedule={handleSchedule}
        weekDays={weekDays}
      />
    </div>
  );
}
