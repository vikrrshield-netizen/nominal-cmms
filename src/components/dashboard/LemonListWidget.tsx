// src/components/dashboard/LemonListWidget.tsx
// VIKRR — Asset Shield — Top 5 worst assets (most P1/P2 issues)

import { useNavigate } from 'react-router-dom';
import { useStats } from '../../hooks/useStats';
import type { LemonEntry } from '../../hooks/useStats';

export default function LemonListWidget() {
  const stats = useStats();
  const navigate = useNavigate();

  if (stats.loading || stats.lemonList.length === 0) return null;

  return (
    <div className="bg-slate-800/60 rounded-2xl p-4 border border-slate-700/50 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
          <span>🍋</span> Lemon List
        </h2>
        <span className="text-[10px] text-slate-600">posledních 30 dní</span>
      </div>
      <div className="space-y-2">
        {stats.lemonList.map((entry: LemonEntry, idx: number) => (
          <div
            key={entry.assetId}
            className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition cursor-pointer"
            onClick={() => navigate(`/asset/${entry.assetId}`)}
          >
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold ${
              idx === 0 ? 'bg-red-500/20 text-red-400' :
              idx === 1 ? 'bg-orange-500/20 text-orange-400' :
              'bg-amber-500/20 text-amber-400'
            }`}>
              {idx + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium text-white truncate">{entry.assetName}</div>
              <div className="text-[10px] text-slate-500">
                {entry.mtbfHours > 0 ? `Doba bez poruchy: ${entry.mtbfHours}h` : 'Doba bez poruchy: N/A'}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className={`text-lg font-bold ${entry.issueCount >= 3 ? 'text-red-400' : 'text-amber-400'}`}>
                {entry.issueCount}
              </div>
              <div className="text-[9px] text-slate-500">problémů</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
