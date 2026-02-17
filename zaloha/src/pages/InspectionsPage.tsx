// src/pages/InspectionsPage.tsx
// NOMINAL CMMS — Kontrolní body budovy (měsíční checklist)
// Digitalizace formuláře "Kontrola budovy C,D"

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, AlertTriangle, Building2,
  ChevronDown, ChevronRight, X, Loader2, ClipboardCheck
} from 'lucide-react';
import { useInspections } from '../hooks/useInspections';
import type { InspectionLog } from '../hooks/useInspections';

// ═══════════════════════════════════════
// STATUS CONFIG
// ═══════════════════════════════════════

const STATUS = {
  ok: { label: 'OK', icon: '✅', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  defect: { label: 'Závada', icon: '⚠️', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
  pending: { label: 'Čeká', icon: '⏳', color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/30' },
};

// ═══════════════════════════════════════
// PAGE
// ═══════════════════════════════════════

export default function InspectionsPage() {
  const navigate = useNavigate();
  const { loading, stats, grouped, markOk, markDefect, markPending, currentMonth } = useInspections();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [activeLog, setActiveLog] = useState<InspectionLog | null>(null);
  const [defectNote, setDefectNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'ok' | 'defect'>('all');

  // Toggle group
  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Format month
  const monthLabel = new Date(currentMonth + '-01').toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' });

  // Filtered logs per group
  const filteredGrouped = Object.entries(grouped).reduce((acc, [key, items]) => {
    const filtered = filter === 'all' ? items : items.filter((l) => l.status === filter);
    if (filtered.length > 0) acc[key] = filtered;
    return acc;
  }, {} as Record<string, InspectionLog[]>);

  // Handle OK
  const handleOk = async (log: InspectionLog) => {
    setSaving(true);
    try {
      await markOk(log.id);
    } catch (err) {
      alert('Chyba při ukládání');
    }
    setSaving(false);
  };

  // Handle Defect
  const handleDefect = async () => {
    if (!activeLog || defectNote.trim().length < 3) return;
    setSaving(true);
    try {
      await markDefect(activeLog.id, defectNote.trim());
      setActiveLog(null);
      setDefectNote('');
    } catch (err) {
      alert('Chyba při ukládání');
    }
    setSaving(false);
  };

  // Handle Reset
  const handleReset = async (log: InspectionLog) => {
    await markPending(log.id);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white pb-24">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-slate-800">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <ClipboardCheck className="w-6 h-6 text-blue-400" />
              Kontrola budovy
            </h1>
            <p className="text-sm text-slate-400 capitalize">{monthLabel}</p>
          </div>
          {/* Progress badge */}
          <div className="text-right">
            <div className="text-2xl font-bold text-blue-400">{stats.percentDone}%</div>
            <div className="text-xs text-slate-400">{stats.ok + stats.defect}/{stats.total}</div>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-4 py-3">
        <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full flex">
            <div
              className="bg-emerald-500 transition-all duration-500"
              style={{ width: `${stats.total > 0 ? (stats.ok / stats.total) * 100 : 0}%` }}
            />
            <div
              className="bg-amber-500 transition-all duration-500"
              style={{ width: `${stats.total > 0 ? (stats.defect / stats.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 px-4 mb-4">
        <button
          onClick={() => setFilter(filter === 'ok' ? 'all' : 'ok')}
          className={`p-3 rounded-xl text-center transition ${
            filter === 'ok' ? 'bg-emerald-600 ring-2 ring-emerald-400' : 'bg-slate-800/60'
          }`}
        >
          <div className="text-2xl font-bold text-emerald-400">{stats.ok}</div>
          <div className="text-xs text-slate-300">OK</div>
        </button>
        <button
          onClick={() => setFilter(filter === 'defect' ? 'all' : 'defect')}
          className={`p-3 rounded-xl text-center transition ${
            filter === 'defect' ? 'bg-amber-600 ring-2 ring-amber-400' : 'bg-slate-800/60'
          }`}
        >
          <div className="text-2xl font-bold text-amber-400">{stats.defect}</div>
          <div className="text-xs text-slate-300">Závady</div>
        </button>
        <button
          onClick={() => setFilter(filter === 'pending' ? 'all' : 'pending')}
          className={`p-3 rounded-xl text-center transition ${
            filter === 'pending' ? 'bg-slate-600 ring-2 ring-slate-400' : 'bg-slate-800/60'
          }`}
        >
          <div className="text-2xl font-bold text-slate-300">{stats.pending}</div>
          <div className="text-xs text-slate-300">Čeká</div>
        </button>
      </div>

      {/* Grouped checklist */}
      <div className="px-4 space-y-3">
        {Object.entries(filteredGrouped).map(([groupKey, items]) => {
          const isExpanded = expandedGroups[groupKey] !== false; // default expanded
          const groupDone = items.filter((l) => l.status !== 'pending').length;

          return (
            <div key={groupKey} className="bg-slate-800/40 rounded-2xl border border-slate-700/50 overflow-hidden">
              {/* Group header */}
              <button
                onClick={() => toggleGroup(groupKey)}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-700/30 transition"
              >
                <div className="flex items-center gap-3">
                  <Building2 className="w-5 h-5 text-blue-400" />
                  <span className="font-bold text-lg">{groupKey}</span>
                  <span className="text-sm text-slate-400">
                    {groupDone}/{items.length}
                  </span>
                </div>
                {isExpanded ? (
                  <ChevronDown className="w-5 h-5 text-slate-400" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-slate-400" />
                )}
              </button>

              {/* Items */}
              {isExpanded && (
                <div className="border-t border-slate-700/50">
                  {items.map((log) => (
                    <InspectionItem
                      key={log.id}
                      log={log}
                      onOk={() => handleOk(log)}
                      onDefect={() => {
                        setActiveLog(log);
                        setDefectNote(log.defectNote || '');
                      }}
                      onReset={() => handleReset(log)}
                      saving={saving}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {Object.keys(filteredGrouped).length === 0 && (
        <div className="text-center py-12 text-slate-500">
          <ClipboardCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Žádné záznamy pro tento filtr</p>
        </div>
      )}

      {/* Defect Modal */}
      {activeLog && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end md:items-center justify-center p-4" onClick={() => setActiveLog(null)}>
          <div
            className="bg-slate-800 rounded-t-3xl md:rounded-3xl w-full max-w-lg border border-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <h2 className="text-lg font-bold">Zapsat závadu</h2>
              </div>
              <button onClick={() => setActiveLog(null)} className="p-2 rounded-lg hover:bg-slate-700">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="bg-slate-700/50 rounded-xl p-3">
                <div className="text-sm text-slate-400">{activeLog.roomCode}</div>
                <div className="text-white font-bold">{activeLog.roomName}</div>
                <div className="text-xs text-slate-500 mt-1">{activeLog.checkPoints}</div>
              </div>
              <div>
                <label className="text-sm text-slate-400 mb-1.5 block">
                  Popis závady <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={defectNote}
                  onChange={(e) => setDefectNote(e.target.value)}
                  placeholder="Co je špatně? Např. prasklá hadice u okna..."
                  rows={3}
                  autoFocus
                  className="w-full bg-slate-700 text-white p-3 rounded-xl border border-slate-600 focus:border-amber-500 outline-none resize-none"
                />
              </div>
              <button
                onClick={handleDefect}
                disabled={saving || defectNote.trim().length < 3}
                className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold disabled:opacity-50 flex items-center justify-center gap-2 transition"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <AlertTriangle className="w-5 h-5" />}
                {saving ? 'Ukládám...' : 'Zapsat závadu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════
// INSPECTION ITEM COMPONENT
// ═══════════════════════════════════════

function InspectionItem({
  log,
  onOk,
  onDefect,
  onReset,
  saving,
}: {
  log: InspectionLog;
  onOk: () => void;
  onDefect: () => void;
  onReset: () => void;
  saving: boolean;
}) {
  const st = STATUS[log.status];

  return (
    <div className={`flex items-stretch border-b border-slate-700/30 last:border-b-0 ${
      log.status === 'pending' ? '' : 'opacity-80'
    }`}>
      {/* Status stripe */}
      <div className={`w-1.5 ${
        log.status === 'ok' ? 'bg-emerald-500' : log.status === 'defect' ? 'bg-amber-500' : 'bg-slate-600'
      }`} />

      {/* Content */}
      <div className="flex-1 p-3 min-w-0">
        <div className="flex items-start gap-2">
          <span className="text-lg">{st.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="font-bold text-base">{log.roomName}</span>
              {log.roomCode && (
                <span className="text-xs text-slate-500 font-mono">{log.roomCode}</span>
              )}
            </div>
            <p className="text-sm text-slate-400 mt-0.5 line-clamp-2">{log.checkPoints}</p>
            {log.status === 'defect' && log.defectNote && (
              <div className="mt-2 p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-200 text-sm">
                ⚠️ {log.defectNote}
              </div>
            )}
            {log.completedBy && (
              <p className="text-xs text-slate-500 mt-1">
                {log.completedBy} • {log.completedAt?.toDate?.()?.toLocaleDateString('cs-CZ') || ''}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col justify-center gap-1 p-2">
        {log.status === 'pending' ? (
          <>
            <button
              onClick={onOk}
              disabled={saving}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg font-bold transition disabled:opacity-50"
            >
              ✓ OK
            </button>
            <button
              onClick={onDefect}
              disabled={saving}
              className="px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm rounded-lg font-bold transition disabled:opacity-50"
            >
              ✗ Závada
            </button>
          </>
        ) : (
          <button
            onClick={onReset}
            className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg transition"
          >
            ↩ Zpět
          </button>
        )}
      </div>
    </div>
  );
}
