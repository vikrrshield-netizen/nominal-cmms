// src/components/dashboard/OperationalHUD.tsx
// VIKRR — Asset Shield — MTTR, MTBF, Work Type Distribution

import { Filter } from 'lucide-react';
import { useStats } from '../../hooks/useStats';

interface OperationalHUDProps {
  onFilterToggle: () => void;
  hasActiveFilter: boolean;
}

export default function OperationalHUD({ onFilterToggle, hasActiveFilter }: OperationalHUDProps) {
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
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Provozní přehled</h2>
        <button
          onClick={onFilterToggle}
          className={`p-1.5 rounded-lg transition ${hasActiveFilter ? 'bg-orange-500/20 text-orange-400' : 'bg-white/5 text-slate-500 hover:text-white'}`}
          title="Filtrovat"
        >
          <Filter className="w-4 h-4" />
        </button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
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
          <div className="text-[9px] text-slate-500">Prům. doba opravy</div>
        </div>
        <div className="bg-white/[0.03] rounded-xl p-2.5 text-center border border-white/[0.06]">
          <div className="text-lg font-bold text-cyan-400">{formatDuration(stats.totalLaborMinutes)}</div>
          <div className="text-[9px] text-slate-500">Celkem práce</div>
        </div>
      </div>

      {/* Work Type Distribution Bar */}
      {workTypes.length > 0 && (
        <div>
          <div className="text-[10px] text-slate-500 uppercase font-bold mb-1.5">Typ práce (Alibi)</div>
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
