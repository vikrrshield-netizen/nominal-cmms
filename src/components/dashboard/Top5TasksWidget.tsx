// src/components/dashboard/Top5TasksWidget.tsx
// VIKRR — Asset Shield — Top 5 active tasks with quick actions

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Play, CheckCircle2 } from 'lucide-react';
import { startTask, completeTask, subscribeToActiveTasks } from '../../services/taskService';
import type { TaskDoc } from '../../types/firestore';

export default function Top5TasksWidget() {
  const [tasks, setTasks] = useState<TaskDoc[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const unsub = subscribeToActiveTasks((allTasks) => {
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
