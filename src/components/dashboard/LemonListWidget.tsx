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
    <div className="bg-white rounded-2xl p-4 border border-slate-700/50 mb-4">
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
            className="flex items-center gap-3 p-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 transition cursor-pointer"
            onClick={() => navigate(`/asset/${entry.assetId}`)}
          >
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold ${
              idx === 0 ? 'bg-red-500/20 text-red-700' :
              idx === 1 ? 'bg-orange-500/20 text-orange-700' :
              'bg-amber-500/20 text-amber-700'
            }`}>
              {idx + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium text-slate-900 truncate">{entry.assetName}</div>
              <div className="text-[10px] text-slate-500">
                {entry.mtbfHours > 0 ? `Doba bez poruchy: ${entry.mtbfHours}h` : 'Doba bez poruchy: N/A'}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className={`text-lg font-bold ${entry.issueCount >= 3 ? 'text-red-700' : 'text-amber-700'}`}>
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
