// src/pages/CalendarPage.tsx
// VIKRR — Asset Shield — Týdenní plán (Firestore LIVE)
// Flexibilní kalendář — upravuje se denně dle situace

import { useState, useEffect, useMemo } from 'react';
import {
  addDoc, collection, onSnapshot, doc, updateDoc, Timestamp, query, where
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthContext } from '../context/AuthContext';
import { useBackNavigation } from '../hooks/useBackNavigation';
import { normalizeEmployeeName, useEmployeeNames } from '../hooks/useEmployeeDirectory';
import {
  Calendar, ChevronLeft, ChevronRight, Plus,
  Clock, Wrench, AlertTriangle, CheckCircle2,
  X, User, ArrowLeft, Loader2, Inbox, Users
} from 'lucide-react';
import type { VacationPlan, VacationPlanKind } from '../types/vacation';

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

const OPEN_TASK_STATUSES = ['backlog', 'planned', 'in_progress', 'paused'];

const ABSENCE_KIND_OPTIONS: Array<{ value: VacationPlanKind; label: string }> = [
  { value: 'vacation', label: 'Dovolená' },
  { value: 'doctor', label: 'Lékař' },
  { value: 'sick', label: 'Nemoc' },
  { value: 'training', label: 'Školení' },
  { value: 'other', label: 'Ostatní' },
];

function absenceKindLabel(kind?: VacationPlanKind): string {
  return ABSENCE_KIND_OPTIONS.find((option) => option.value === kind)?.label || 'Dovolená';
}

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

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
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

function formatFullDate(d: Date): string {
  return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' });
}

function dateToInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function inputValueToDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1);
  date.setHours(0, 0, 0, 0);
  return date;
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

function isDateInRange(date: Date, startValue: any, endValue: any): boolean {
  const start = toDate(startValue);
  const end = toDate(endValue);
  if (!start || !end) return false;
  const current = new Date(date);
  current.setHours(12, 0, 0, 0);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return current >= start && current <= end;
}

function vacationSortValue(plan: VacationPlan): number {
  return toDate(plan.startDate)?.getTime() || 0;
}

// ═══════════════════════════════════════════
// HOOK — všechny nesmazané tasky
// ═══════════════════════════════════════════

function useTasks(windowStart: Date, windowEnd: Date) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);

    let scheduledReady = false;
    let backlogReady = false;
    let scheduledItems: Task[] = [];
    let backlogItems: Task[] = [];

    const publish = () => {
      const byId = new Map<string, Task>();
      [...scheduledItems, ...backlogItems].forEach((task) => byId.set(task.id, task));
      setTasks([...byId.values()]);
      if (scheduledReady && backlogReady) setLoading(false);
    };

    const scheduledQuery = query(
      collection(db, 'tasks'),
      where('scheduledDate', '>=', Timestamp.fromDate(windowStart)),
      where('scheduledDate', '<=', Timestamp.fromDate(windowEnd))
    );

    const backlogQuery = query(
      collection(db, 'tasks'),
      where('status', 'in', OPEN_TASK_STATUSES)
    );

    const unsubScheduled = onSnapshot(
      scheduledQuery,
      (snap) => {
        scheduledItems = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Task))
          .filter((t) => !((t as any).isDeleted))
          .filter((t) => t.status !== 'done' && t.status !== 'completed' && t.status !== 'cancelled');
        scheduledReady = true;
        publish();
      },
      (err) => {
        console.error('[Calendar] scheduled tasks error:', err);
        scheduledReady = true;
        publish();
      }
    );

    const unsubBacklog = onSnapshot(
      backlogQuery,
      (snap) => {
        backlogItems = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Task))
          .filter((t) => !((t as any).isDeleted))
          .filter((t) => !toDate(t.scheduledDate));
        backlogReady = true;
        publish();
      },
      (err) => {
        console.error('[Calendar] backlog tasks error:', err);
        backlogReady = true;
        publish();
      }
    );

    return () => {
      unsubScheduled();
      unsubBacklog();
    };
  }, [windowStart, windowEnd]);

  return { tasks, loading };
}

function useVacationPlans(tenantId: string, windowStart: Date, windowEnd: Date) {
  const [vacations, setVacations] = useState<VacationPlan[]>([]);

  useEffect(() => {
    const vacationQuery = query(
      collection(db, 'vacation_plans'),
      where('endDate', '>=', Timestamp.fromDate(windowStart))
    );

    const unsub = onSnapshot(
      vacationQuery,
      (snap) => {
        setVacations(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() } as VacationPlan))
            .filter((item) => !item.tenantId || item.tenantId === tenantId)
            .filter((item) => item.status !== 'cancelled')
            .filter((item) => {
              const start = toDate(item.startDate);
              return Boolean(start && start <= windowEnd);
            })
            .sort((a, b) => vacationSortValue(a) - vacationSortValue(b))
        );
      },
      (err) => console.error('[Calendar] vacation_plans error:', err)
    );
    return () => unsub();
  }, [tenantId, windowStart, windowEnd]);

  return vacations;
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
          <span className="text-[13px] font-medium text-slate-900 truncate">{task.title}</span>
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
            className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-red-400 transition"
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
        className="bg-white rounded-t-3xl md:rounded-3xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Inbox className="w-5 h-5 text-blue-700" />
            Backlog ({sorted.length})
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400">
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
                      ? 'bg-blue-500/15 text-blue-700 border border-blue-500/30'
                      : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
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
                    <span className="text-[13px] font-medium text-slate-900 truncate">{task.title}</span>
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

function VacationCard({ vacation, onCancel }: { vacation: VacationPlan; onCancel?: () => void }) {
  const start = toDate(vacation.startDate);
  const end = toDate(vacation.endDate);
  return (
    <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-2.5">
      <div className="flex items-start gap-2">
        <Users className="w-4 h-4 text-emerald-300 mt-0.5 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-slate-900 truncate">{vacation.workerName}</div>
          <div className="text-[11px] text-emerald-700/80">
            {absenceKindLabel(vacation.kind)} · {start ? formatFullDate(start) : '?'} - {end ? formatFullDate(end) : '?'}
          </div>
          {vacation.note && <div className="text-xs text-slate-600 mt-1 line-clamp-2">{vacation.note}</div>}
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-red-300 transition"
            title="Zrušit dovolenou"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function VacationModal({
  isOpen,
  onClose,
  onSave,
  defaultDate,
  employeeOptions,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (input: { workerName: string; kind: VacationPlanKind; startDate: Date; endDate: Date; note: string }) => Promise<void>;
  defaultDate: Date;
  employeeOptions: string[];
}) {
  const [workerName, setWorkerName] = useState('');
  const [kind, setKind] = useState<VacationPlanKind>('vacation');
  const [startDate, setStartDate] = useState(dateToInputValue(defaultDate));
  const [endDate, setEndDate] = useState(dateToInputValue(defaultDate));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [showEmployeeOptions, setShowEmployeeOptions] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setStartDate(dateToInputValue(defaultDate));
    setEndDate(dateToInputValue(defaultDate));
  }, [defaultDate, isOpen]);

  if (!isOpen) return null;

  const matchedEmployee = employeeOptions.find((name) => normalizeEmployeeName(name) === normalizeEmployeeName(workerName));
  const canSave = Boolean(matchedEmployee && startDate && endDate && !saving);

  const handleSave = async () => {
    const name = workerName.trim();
    if (!name || !matchedEmployee || !startDate || !endDate) return;
    const start = inputValueToDate(startDate);
    const end = inputValueToDate(endDate);
    if (end < start) return;
    setSaving(true);
    await onSave({ workerName: matchedEmployee, kind, startDate: start, endDate: end, note: note.trim() });
    setSaving(false);
    setWorkerName('');
    setNote('');
  };

  const filteredEmployees = employeeOptions
    .filter((name) => name.toLowerCase().includes(workerName.trim().toLowerCase()))
    .slice(0, 8);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl md:rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-300" />
            Naplánovat dovolenou
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <label className="block relative">
            <span className="text-xs font-bold text-slate-400">Kdo bude pryč</span>
            <input
              value={workerName}
              onChange={(e) => {
                setWorkerName(e.target.value);
                setShowEmployeeOptions(true);
              }}
              onFocus={() => setShowEmployeeOptions(true)}
              placeholder="např. Jan Novák"
              className="mt-1 w-full rounded-xl bg-[#fbf9f4] border border-slate-200 px-3 py-3 text-slate-900 outline-none focus:border-emerald-400"
            />
            {showEmployeeOptions && filteredEmployees.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
                {filteredEmployees.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setWorkerName(name);
                      setShowEmployeeOptions(false);
                    }}
                    className="block w-full px-3 py-2 text-left text-sm font-semibold text-slate-100 hover:bg-emerald-500/15"
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
            {workerName.trim() && !matchedEmployee && (
              <div className="mt-1 text-xs text-amber-300">
                Vyber zaměstnance z administrace. Nové jméno se zakládá jen v Administraci.
              </div>
            )}
          </label>

          <label className="block">
            <span className="text-xs font-bold text-slate-400">Typ absence</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as VacationPlanKind)}
              className="mt-1 w-full rounded-xl bg-[#fbf9f4] border border-slate-200 px-3 py-3 text-slate-900 outline-none focus:border-emerald-400"
            >
              {ABSENCE_KIND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-bold text-slate-400">Od</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (endDate < e.target.value) setEndDate(e.target.value);
                }}
                className="mt-1 w-full rounded-xl bg-[#fbf9f4] border border-slate-200 px-3 py-3 text-slate-900 outline-none focus:border-emerald-400"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-slate-400">Do</span>
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 w-full rounded-xl bg-[#fbf9f4] border border-slate-200 px-3 py-3 text-slate-900 outline-none focus:border-emerald-400"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-bold text-slate-400">Poznámka</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="např. náhrada, směna, poznámka pro výrobu..."
              className="mt-1 w-full rounded-xl bg-[#fbf9f4] border border-slate-200 px-3 py-3 text-slate-900 outline-none focus:border-emerald-400"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2 p-4 border-t border-slate-200">
          <button type="button" onClick={onClose} className="min-h-12 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 font-bold">
            Zrušit
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="min-h-12 rounded-xl bg-emerald-500 text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
            Uložit
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CalendarPage() {
  const goBack = useBackNavigation('/');
  const { user } = useAuthContext();
  const tenantId = user?.tenantId ?? 'main_firm';
  const [currentMonday, setCurrentMonday] = useState(() => getMonday(new Date()));
  const weekDays = useMemo(() => getWeekDays(currentMonday), [currentMonday]);
  const weekEnd = useMemo(() => endOfDay(addDays(currentMonday, 6)), [currentMonday]);
  const { tasks, loading } = useTasks(currentMonday, weekEnd);
  const vacations = useVacationPlans(tenantId, currentMonday, weekEnd);
  const employeeOptions = useEmployeeNames({ tenantId });

  // Current week state
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const [showBacklog, setShowBacklog] = useState(false);
  const [showVacationModal, setShowVacationModal] = useState(false);
  const [vacationDefaultDate, setVacationDefaultDate] = useState(new Date());

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

  const getVacationsForDay = (date: Date): VacationPlan[] => {
    return vacations.filter((vacation) => isDateInRange(date, vacation.startDate, vacation.endDate));
  };

  // Week stats
  const weekTasks = weekDays.flatMap((d) => getTasksForDay(d));
  const weekMinutes = weekTasks.reduce((sum, t) => sum + (t.estimatedMinutes || 0), 0);
  const weekVacations = vacations.filter((vacation) => weekDays.some((day) => isDateInRange(day, vacation.startDate, vacation.endDate)));

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
        status: 'completed',
        completedAt: Timestamp.now(),
        completedBy: user?.displayName || 'Unknown',
        updatedAt: Timestamp.now(),
        updatedBy: user?.uid || '',
      });
    } catch (err) {
      console.error('Complete failed:', err);
    }
  };

  const handleSaveVacation = async (input: { workerName: string; kind: VacationPlanKind; startDate: Date; endDate: Date; note: string }) => {
    try {
      await addDoc(collection(db, 'vacation_plans'), {
        tenantId,
        workerName: input.workerName,
        kind: input.kind,
        startDate: Timestamp.fromDate(input.startDate),
        endDate: Timestamp.fromDate(input.endDate),
        note: input.note,
        status: 'planned',
        createdBy: user?.uid || user?.id || '',
        createdByName: user?.displayName || 'Neznámý',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      setShowVacationModal(false);
    } catch (err) {
      console.error('Save vacation failed:', err);
    }
  };

  const handleCancelVacation = async (vacationId: string) => {
    try {
      await updateDoc(doc(db, 'vacation_plans', vacationId), {
        status: 'cancelled',
        updatedAt: Timestamp.now(),
        updatedBy: user?.uid || user?.id || '',
      });
    } catch (err) {
      console.error('Cancel vacation failed:', err);
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
    <div className="min-h-screen bg-[#f1ece3]">
      <div className="max-w-5xl mx-auto px-3 pt-4 pb-24">
        {/* Header */}
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => goBack()}
            className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 hover:text-slate-700 transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-700" />
              Týdenní plán
            </h1>
            <p className="text-xs text-slate-500">
              {weekTasks.length} naplánováno · {backlogTasks.length} v backlogu
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setVacationDefaultDate(new Date());
              setShowVacationModal(true);
            }}
            className="h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 px-3 text-sm font-bold text-emerald-700 flex items-center gap-2"
          >
            <Users className="w-4 h-4" />
            Dovolená
          </button>
          {loading && <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />}
        </div>

        {/* Week Navigation */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-4">
          <div className="flex items-center justify-between">
            <button
              onClick={handlePrevWeek}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="text-center">
              <div className="text-lg font-bold text-slate-900">
                Týden {weekNumber} / {currentMonday.getFullYear()}
              </div>
              <div className="text-sm text-slate-500">
                {formatDate(weekDays[0])} – {formatDate(weekDays[6])}
              </div>
              {isThisWeek ? (
                <span className="inline-block mt-1 px-2 py-0.5 bg-blue-500/15 text-blue-700 text-[10px] font-medium rounded-full border border-blue-500/30">
                  Aktuální týden
                </span>
              ) : (
                <button
                  onClick={handleToday}
                  className="inline-block mt-1 px-2 py-0.5 bg-slate-50 text-slate-400 text-[10px] font-medium rounded-full hover:text-slate-700 transition"
                >
                  Zpět na dnes
                </button>
              )}
            </div>
            <button
              onClick={handleNextWeek}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Stats */}
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="bg-slate-50 p-2.5 rounded-xl text-center">
              <div className="text-lg font-bold text-slate-900">{weekTasks.length}</div>
              <div className="text-[10px] text-slate-500">Naplánováno</div>
            </div>
            <div className="bg-slate-50 p-2.5 rounded-xl text-center">
              <div className="text-lg font-bold text-slate-900">{formatMinutes(weekMinutes) || '0h'}</div>
              <div className="text-[10px] text-slate-500">Celkem</div>
            </div>
            <button
              onClick={() => setShowBacklog(true)}
              className="bg-blue-500/10 border border-blue-500/20 p-2.5 rounded-xl text-center hover:bg-blue-500/15 transition"
            >
              <div className="text-lg font-bold text-blue-700">{backlogTasks.length}</div>
              <div className="text-[10px] text-blue-700/70">V backlogu →</div>
            </button>
            <button
              onClick={() => {
                setVacationDefaultDate(today);
                setShowVacationModal(true);
              }}
              className="bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-xl text-center hover:bg-emerald-500/15 transition"
            >
              <div className="text-lg font-bold text-emerald-300">{weekVacations.length}</div>
              <div className="text-[10px] text-emerald-300/70">Dovolené</div>
            </button>
          </div>
        </div>

        {/* Days */}
        <div className="space-y-2">
          {weekDays.slice(1, 6).map((date, _i) => {
            const dayIndex = date.getDay(); // 1-5 (Po-Pá)
            const dayTasks = getTasksForDay(date);
            const dayVacations = getVacationsForDay(date);
            const dayMinutes = dayTasks.reduce((s, t) => s + (t.estimatedMinutes || 0), 0);
            const isToday = isSameDay(date, today);
            const isPast = date < today && !isToday;
            const isExpanded = expandedDay === dayIndex;

            return (
              <div
                key={dayIndex}
                className={`bg-white rounded-2xl border overflow-hidden transition ${
                  isToday
                    ? 'border-blue-500/40 ring-1 ring-blue-500/20'
                    : 'border-slate-200'
                } ${isPast ? 'opacity-60' : ''}`}
              >
                {/* Day header */}
                <button
                  onClick={() => setExpandedDay(isExpanded ? null : dayIndex)}
                  className="w-full p-3 flex items-center justify-between hover:bg-slate-50 transition"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
                        isToday
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-50 text-slate-400 border border-slate-200'
                      }`}
                    >
                      {date.getDate()}
                    </div>
                    <div className="text-left">
                      <div className="font-medium text-slate-900 text-sm">{DAY_NAMES[dayIndex]}</div>
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
                    {dayVacations.length > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-[10px] font-bold text-emerald-700">
                        {dayVacations.length}
                      </span>
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
                  <div className="px-3 pb-3 border-t border-slate-200 pt-2 space-y-2">
                    {dayVacations.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-[10px] uppercase tracking-wider font-bold text-emerald-300">Dovolená</div>
                        {dayVacations.map((vacation) => (
                          <VacationCard
                            key={vacation.id}
                            vacation={vacation}
                            onCancel={() => handleCancelVacation(vacation.id)}
                          />
                        ))}
                      </div>
                    )}
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
                      className="w-full py-2 border border-dashed border-slate-200 rounded-xl text-slate-500 text-sm font-medium hover:border-blue-500/30 hover:text-blue-700 transition flex items-center justify-center gap-2"
                    >
                      <Plus className="w-4 h-4" /> Přidat z backlogu
                    </button>
                    <button
                      onClick={() => {
                        setVacationDefaultDate(date);
                        setShowVacationModal(true);
                      }}
                      className="w-full py-2 border border-dashed border-emerald-500/20 rounded-xl text-emerald-300 text-sm font-medium hover:border-emerald-500/40 hover:bg-emerald-500/10 transition flex items-center justify-center gap-2"
                    >
                      <Users className="w-4 h-4" /> Naplánovat dovolenou
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
              <div className="bg-slate-50 rounded-2xl border border-slate-200 p-3">
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
      <VacationModal
        isOpen={showVacationModal}
        onClose={() => setShowVacationModal(false)}
        onSave={handleSaveVacation}
        defaultDate={vacationDefaultDate}
        employeeOptions={employeeOptions}
      />
    </div>
  );
}
