// src/pages/ShiftPlannerPage.tsx
// Nominal CMMS — Shift Planner: Weekly technician assignment

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, doc, setDoc, onSnapshot, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthContext } from '../context/AuthContext';
import {
  ArrowLeft, Loader2, ChevronLeft, ChevronRight,
  Users, Sun, Sunset, Moon, Save,
} from 'lucide-react';
import { showToast } from '../components/ui/Toast';

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

type ShiftType = 'R' | 'O' | 'N' | 'V' | '-';

interface WeekPlan {
  id: string; // format: YYYY-WNN
  weekStart: string; // ISO date of Monday
  assignments: Record<string, Record<string, ShiftType>>; // userId → { 'po': 'R', 'ut': 'O', ... }
  updatedAt: Date;
  updatedByName: string;
}

interface SimpleUser {
  id: string;
  displayName: string;
  role: string;
}

// ═══════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════

const SHIFT_TYPES: Record<ShiftType, { label: string; short: string; color: string; bg: string; icon: typeof Sun }> = {
  'R': { label: 'Ranní',      short: 'R', color: 'text-amber-400',   bg: 'bg-amber-500/20',   icon: Sun },
  'O': { label: 'Odpolední',  short: 'O', color: 'text-blue-400',    bg: 'bg-blue-500/20',    icon: Sunset },
  'N': { label: 'Noční',      short: 'N', color: 'text-indigo-400',  bg: 'bg-indigo-500/20',  icon: Moon },
  'V': { label: 'Volno',      short: 'V', color: 'text-slate-500',   bg: 'bg-slate-500/20',   icon: Users },
  '-': { label: 'Nepřiřazeno', short: '-', color: 'text-slate-600',  bg: 'bg-white/5',        icon: Users },
};

const DAY_KEYS = ['po', 'ut', 'st', 'ct', 'pa', 'so', 'ne'] as const;
const DAY_LABELS = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
const TECH_ROLES = ['UDRZBA', 'VYROBA', 'SKLADNIK', 'SUPERADMIN'];

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function getWeekMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekId(monday: Date): string {
  const y = monday.getFullYear();
  const startOfYear = new Date(y, 0, 1);
  const diff = (monday.getTime() - startOfYear.getTime()) / 86400000;
  const weekNum = Math.ceil((diff + startOfYear.getDay() + 1) / 7);
  return `${y}-W${String(weekNum).padStart(2, '0')}`;
}

function formatWeekRange(monday: Date): string {
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  return `${monday.toLocaleDateString('cs-CZ', opts)} – ${sunday.toLocaleDateString('cs-CZ', opts)}`;
}

// ═══════════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════════

function useTechnicians() {
  const [users, setUsers] = useState<SimpleUser[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(
        snap.docs
          .map(d => ({ id: d.id, displayName: d.data().displayName || '', role: d.data().role || '' }))
          .filter(u => TECH_ROLES.includes(u.role))
          .sort((a, b) => a.displayName.localeCompare(b.displayName, 'cs'))
      );
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);
  return { users, loading };
}

function useWeekPlan(weekId: string) {
  const [plan, setPlan] = useState<WeekPlan | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!weekId) return;
    const unsub = onSnapshot(doc(db, 'shift_plans', weekId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setPlan({
          id: snap.id,
          weekStart: data.weekStart || '',
          assignments: data.assignments || {},
          updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : new Date(),
          updatedByName: data.updatedByName || '',
        });
      } else {
        setPlan(null);
      }
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [weekId]);
  return { plan, loading };
}

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function ShiftPlannerPage() {
  const navigate = useNavigate();
  const { user, hasPermission } = useAuthContext();
  const canView = hasPermission('shifts.view');

  const [currentMonday, setCurrentMonday] = useState(() => getWeekMonday(new Date()));
  const weekId = useMemo(() => getWeekId(currentMonday), [currentMonday]);

  const { users: technicians, loading: loadingUsers } = useTechnicians();
  const { plan, loading: loadingPlan } = useWeekPlan(weekId);

  // Local editable state
  const [assignments, setAssignments] = useState<Record<string, Record<string, ShiftType>>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Sync plan → local state when plan changes
  useEffect(() => {
    setAssignments(plan?.assignments || {});
    setDirty(false);
  }, [plan]);

  const prevWeek = () => {
    const d = new Date(currentMonday);
    d.setDate(d.getDate() - 7);
    setCurrentMonday(d);
  };
  const nextWeek = () => {
    const d = new Date(currentMonday);
    d.setDate(d.getDate() + 7);
    setCurrentMonday(d);
  };
  const goToday = () => setCurrentMonday(getWeekMonday(new Date()));

  const toggleShift = (userId: string, dayKey: string) => {
    const current = assignments[userId]?.[dayKey] || '-';
    const cycle: ShiftType[] = ['-', 'R', 'O', 'N', 'V'];
    const nextIdx = (cycle.indexOf(current) + 1) % cycle.length;
    setAssignments(prev => ({
      ...prev,
      [userId]: { ...prev[userId], [dayKey]: cycle[nextIdx] },
    }));
    setDirty(true);
  };

  const savePlan = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'shift_plans', weekId), {
        weekStart: currentMonday.toISOString().split('T')[0],
        assignments,
        updatedAt: serverTimestamp(),
        updatedById: user?.uid || '',
        updatedByName: user?.displayName || '',
      });
      setDirty(false);
      showToast('Směny uloženy', 'success');
    } catch { showToast('Chyba při ukládání', 'error'); }
    setSaving(false);
  };

  // Stats
  const shiftCounts = useMemo(() => {
    const counts: Record<ShiftType, number> = { R: 0, O: 0, N: 0, V: 0, '-': 0 };
    Object.values(assignments).forEach(days => {
      Object.values(days).forEach(shift => {
        if (counts[shift as ShiftType] !== undefined) counts[shift as ShiftType]++;
      });
    });
    return counts;
  }, [assignments]);

  if (!canView) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
        <div className="bg-red-500/20 border border-red-500/30 rounded-2xl p-8 text-center max-w-md">
          <Users className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Přístup odepřen</h2>
          <p className="text-slate-400 mb-4">Nemáte oprávnění pro Plánování směn</p>
          <button onClick={() => navigate('/')} className="px-6 py-2 bg-slate-700 text-white rounded-xl hover:bg-slate-600">Zpět</button>
        </div>
      </div>
    );
  }

  const loading = loadingUsers || loadingPlan;

  // Determine today's column highlight
  const today = new Date();
  const todayMonday = getWeekMonday(today);
  const isCurrentWeek = todayMonday.getTime() === currentMonday.getTime();
  const todayDayIdx = isCurrentWeek ? (today.getDay() === 0 ? 6 : today.getDay() - 1) : -1;

  return (
    <div className="min-h-screen bg-slate-900 pb-24">
      {/* Header */}
      <div className="bg-slate-800/80 backdrop-blur-sm border-b border-slate-700/50 px-4 py-4 sticky top-0 z-20">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition">
              <ArrowLeft className="w-5 h-5 text-slate-400" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-white">Plánování směn</h1>
              <p className="text-xs text-slate-500">Přiřazení techniků na týden</p>
            </div>
          </div>
          {dirty && (
            <button onClick={savePlan} disabled={saving}
              className="px-3 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-500 transition flex items-center gap-1.5 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Uložit
            </button>
          )}
        </div>

        {/* Week navigation */}
        <div className="flex items-center justify-between bg-white/5 rounded-xl p-2">
          <button onClick={prevWeek} className="p-2 rounded-lg hover:bg-white/10 transition">
            <ChevronLeft className="w-5 h-5 text-slate-400" />
          </button>
          <div className="text-center">
            <div className="text-sm font-bold text-white">{formatWeekRange(currentMonday)}</div>
            <div className="text-[11px] text-slate-500">{weekId}</div>
          </div>
          <button onClick={nextWeek} className="p-2 rounded-lg hover:bg-white/10 transition">
            <ChevronRight className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        {!isCurrentWeek && (
          <button onClick={goToday} className="w-full mt-2 py-1.5 text-xs text-center text-blue-400 hover:text-blue-300 transition">
            Zpět na aktuální týden
          </button>
        )}
      </div>

      {/* Shift legend */}
      <div className="max-w-3xl mx-auto px-4 pt-4">
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {(['R', 'O', 'N', 'V'] as ShiftType[]).map(s => {
            const cfg = SHIFT_TYPES[s];
            return (
              <div key={s} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${cfg.bg} flex-shrink-0`}>
                <cfg.icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label} ({shiftCounts[s]})</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Grid */}
      <div className="max-w-3xl mx-auto px-4">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Načítám...
          </div>
        ) : technicians.length === 0 ? (
          <div className="text-center py-16">
            <Users className="w-14 h-14 text-slate-600 mx-auto" />
            <h3 className="text-lg font-bold text-white mt-3 mb-1">Žádní technici</h3>
            <p className="text-slate-500 text-sm">V systému nejsou uživatelé s rolí Údržba/Výroba</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr>
                  <th className="text-left text-xs text-slate-500 font-semibold pb-2 pr-2 w-[140px]">Technik</th>
                  {DAY_KEYS.map((key, i) => (
                    <th key={key} className={`text-center text-xs font-semibold pb-2 px-1 ${
                      todayDayIdx === i ? 'text-orange-400' : i >= 5 ? 'text-slate-600' : 'text-slate-500'
                    }`}>
                      {DAY_LABELS[i]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {technicians.map(tech => (
                  <tr key={tech.id} className="border-t border-white/5">
                    <td className="py-2 pr-2">
                      <div className="text-sm font-medium text-white truncate max-w-[140px]">{tech.displayName}</div>
                      <div className="text-[10px] text-slate-500">{tech.role}</div>
                    </td>
                    {DAY_KEYS.map((dayKey, dayIdx) => {
                      const shift = assignments[tech.id]?.[dayKey] || '-';
                      const cfg = SHIFT_TYPES[shift];
                      const isToday = todayDayIdx === dayIdx;
                      return (
                        <td key={dayKey} className="py-2 px-1 text-center">
                          <button
                            onClick={() => toggleShift(tech.id, dayKey)}
                            className={`w-full py-2.5 rounded-xl text-sm font-bold transition active:scale-90
                              ${cfg.bg} ${cfg.color}
                              ${isToday ? 'ring-1 ring-orange-500/40' : ''}
                              hover:brightness-125
                            `}
                          >
                            {cfg.short}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Last saved info */}
        {plan && (
          <div className="mt-4 text-center text-[11px] text-slate-600">
            Naposledy uložil: {plan.updatedByName} · {plan.updatedAt.toLocaleString('cs-CZ')}
          </div>
        )}
      </div>
    </div>
  );
}
