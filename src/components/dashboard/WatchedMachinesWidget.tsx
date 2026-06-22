// src/components/dashboard/WatchedMachinesWidget.tsx
// VIKRR — Asset Shield — Dashboard blok „Sledované stroje".
// Ukazuje stroje, které si uživatel označil hvězdičkou (na obrazovce Stroje / na kartě).
// Sledování je v localStorage (useWatchedAssets) — žádná Firestore změna.

import { useEffect, useMemo, useState } from 'react';
import { Star, X, Loader2, Gauge } from 'lucide-react';
import { useAuthContext } from '../../context/AuthContext';
import { assetService } from '../../services/assetService';
import type { Asset } from '../../types/asset';
import {
  type MonitoringStatus,
  machineMonitoringStatus,
  machineCondition,
  conditionTone,
} from '../../types/monitoring';
import { useWatchedAssets } from '../../hooks/useWatchedAssets';

const TONE: Record<MonitoringStatus, { dot: string; text: string; soft: string }> = {
  ok: { dot: '#22c55e', text: '#16a34a', soft: '#f0fdf4' },
  warn: { dot: '#eab308', text: '#d97706', soft: '#fffbeb' },
  crit: { dot: '#ef4444', text: '#dc2626', soft: '#fef2f2' },
};

export default function WatchedMachinesWidget({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { user } = useAuthContext();
  const tenantId = user?.tenantId ?? 'main_firm';
  const { watchedIds, toggle } = useWatchedAssets();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    assetService
      .getAll(tenantId)
      .then((a) => { if (alive) setAssets(a); })
      .catch((err) => console.error('[Sledované] load error:', err))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [tenantId]);

  const watched = useMemo(
    () => watchedIds.map((id) => assets.find((a) => a.id === id)).filter(Boolean) as Asset[],
    [watchedIds, assets],
  );

  return (
    <div className="rounded-2xl border border-[#e2d8c9] bg-white p-4">
      <div className="flex items-center gap-2 mb-3">
        <Star size={16} className="text-amber-500" />
        <h3 className="text-[13px] font-black text-slate-900">Sledované stroje</h3>
        {watched.length > 0 && <span className="text-[12px] text-slate-400">{watched.length}</span>}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 py-3 text-[13px]"><Loader2 className="animate-spin" size={16} /> Načítám…</div>
      ) : watched.length === 0 ? (
        <div className="text-[13px] text-slate-500 flex items-start gap-2">
          <Gauge size={16} className="text-slate-300 mt-0.5 flex-shrink-0" />
          <span>Zatím nic. Na obrazovce <span className="font-semibold text-slate-700">Stroje</span> klikni u stroje na <span className="font-semibold text-amber-600">hvězdičku</span> a objeví se tady.</span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {watched.map((m) => {
            const status = machineMonitoringStatus(m.components);
            const cond = machineCondition(m.components);
            const condTone = conditionTone(cond);
            return (
              <div
                key={m.id}
                role="button"
                tabIndex={0}
                onClick={() => onNavigate(`/asset/${m.id}`)}
                className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 cursor-pointer hover:bg-white hover:border-emerald-200 transition"
              >
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: TONE[status].dot, flexShrink: 0 }} />
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-semibold text-slate-800 truncate">{m.name}</span>
                  <span className="block text-[11px] text-slate-400 truncate">{[m.entityType || m.category, m.location].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="text-[13px] font-bold flex-shrink-0" style={{ color: TONE[condTone].text }}>{cond} %</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggle(m.id); }}
                  aria-label="Odebrat ze sledování"
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition flex-shrink-0"
                >
                  <X size={15} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
