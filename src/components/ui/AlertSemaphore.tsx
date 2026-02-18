// src/components/ui/AlertSemaphore.tsx
// VIKRR — Asset Shield — Semafor upozornění
// P1=havárie (červená), P2=tento týden (žlutá), nová hlášení (modrá)

import { CheckCircle, ChevronRight } from 'lucide-react';

interface AlertSemaphoreProps {
  p1Count: number;
  p2Count: number;
  newReports: number;
  onClick?: () => void;
}

export default function AlertSemaphore({ p1Count, p2Count, newReports, onClick }: AlertSemaphoreProps) {
  const hasP1 = p1Count > 0;
  const hasP2 = p2Count > 0;
  const hasNew = newReports > 0;
  const allClear = !hasP1 && !hasP2 && !hasNew;

  if (allClear) {
    return (
      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 flex items-center gap-4">
        <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/30">
          <CheckCircle className="w-6 h-6 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-emerald-400">✓ Vše v pořádku</h2>
          <p className="text-sm text-emerald-300/60">Žádné aktivní poruchy</p>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`
        w-full rounded-2xl p-4 transition-all active:scale-[0.98]
        ${hasP1 ? 'bg-red-500/15 border-2 border-red-500/60' :
          hasP2 ? 'bg-amber-500/15 border-2 border-amber-500/40' :
          'bg-blue-500/10 border border-blue-500/30'}
      `}
    >
      <div className="flex items-center gap-4">
        {/* Semaphore dots */}
        <div className="flex flex-col gap-1.5">
          <SemaphoreDot count={p1Count} active={hasP1} color="red" />
          <SemaphoreDot count={p2Count} active={hasP2} color="amber" />
          <SemaphoreDot count={newReports} active={hasNew} color="blue" />
        </div>

        {/* Labels */}
        <div className="flex-1 text-left">
          {hasP1 && (
            <div className="mb-1">
              <span className="text-xl font-bold text-red-400">⚠️ {p1Count} HAVÁRIE</span>
              <span className="text-red-300/60 text-sm ml-2">— řešit!</span>
            </div>
          )}
          {hasP2 && (
            <div className="mb-1">
              <span className="text-lg font-bold text-amber-400">🔧 {p2Count} závad</span>
              <span className="text-amber-300/60 text-sm ml-2">— dnes</span>
            </div>
          )}
          {hasNew && (
            <div>
              <span className="text-base font-medium text-blue-400">📋 {newReports} hlášení</span>
              <span className="text-blue-300/60 text-sm ml-2">— nové</span>
            </div>
          )}
        </div>

        <ChevronRight className={`w-6 h-6 flex-shrink-0 ${
          hasP1 ? 'text-red-400' : hasP2 ? 'text-amber-400' : 'text-blue-400'
        }`} />
      </div>
    </button>
  );
}

function SemaphoreDot({ count, active, color }: { count: number; active: boolean; color: 'red' | 'amber' | 'blue' }) {
  const activeClass =
    color === 'red' ? 'bg-red-500 border-red-400 text-white shadow-lg shadow-red-500/50' :
    color === 'amber' ? 'bg-amber-500 border-amber-400 text-white shadow-lg shadow-amber-500/50' :
    'bg-blue-500 border-blue-400 text-white shadow-lg shadow-blue-500/50';

  const inactiveClass =
    color === 'red' ? 'bg-red-900/20 border-red-900/30 text-red-900/40' :
    color === 'amber' ? 'bg-amber-900/20 border-amber-900/30 text-amber-900/40' :
    'bg-blue-900/20 border-blue-900/30 text-blue-900/40';

  return (
    <div className={`
      w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold text-sm
      ${active ? activeClass : inactiveClass}
      ${active && color === 'red' ? 'animate-pulse' : ''}
    `}>
      {count}
    </div>
  );
}
