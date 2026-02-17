// src/pages/WastePage.tsx
// NOMINAL CMMS — Odpadové hospodářství (Firestore LIVE, semafor)

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import { useWaste, WASTE_CONFIG, FILL_CONFIG } from '../hooks/useWaste';
import type { WasteContainer, FillLevel } from '../hooks/useWaste';
import { Breadcrumb } from '../components/ui';
import {
  Recycle, Calendar, Bell, CheckCircle2, AlertTriangle,
  Truck, X, Loader2, Edit2,
} from 'lucide-react';

// ═══════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════

export default function WastePage() {
  const navigate = useNavigate();
  const { hasPermission: _hp } = useAuthContext();
  const {
    containers, loading, stats, shouldNotify,
    getNextPickup, updateFillLevel, markEmptied, formatDay,
  } = useWaste();

  // State
  const [showNotification, setShowNotification] = useState(true);
  const [selectedContainer, setSelectedContainer] = useState<WasteContainer | null>(null);

  const nextPickup = getNextPickup();

  // ─────────────────────────────────────────
  // LOADING
  // ─────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // ─────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Notification Banner */}
      {shouldNotify && showNotification && (
        <div className="bg-amber-500 text-white px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5 animate-bounce" />
            <div>
              <div className="font-bold">Připravit popelnice!</div>
              <div className="text-sm opacity-90">Zítra svoz — zkontrolujte kontejnery</div>
            </div>
          </div>
          <button onClick={() => setShowNotification(false)} className="p-1 rounded hover:bg-white/20">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b px-4 py-4">
        <Breadcrumb items={[
          { label: 'Dashboard', onClick: () => navigate('/') },
          { label: 'Odpady' },
        ]} />
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Recycle className="w-6 h-6 text-emerald-600" />
            Odpadové hospodářství
          </h1>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Semafor Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl text-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <div className="text-2xl font-bold text-emerald-700">{stats.green}</div>
            <div className="text-xs text-emerald-600">V pořádku</div>
          </div>
          <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl text-center">
            <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
            <div className="text-2xl font-bold text-amber-700">{stats.yellow}</div>
            <div className="text-xs text-amber-600">Pozor</div>
          </div>
          <div className="bg-red-50 border border-red-200 p-4 rounded-xl text-center">
            <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-2 animate-pulse" />
            <div className="text-2xl font-bold text-red-700">{stats.red}</div>
            <div className="text-xs text-red-600">Plné</div>
          </div>
        </div>

        {/* Next Pickup */}
        {nextPickup && nextPickup.schedule && (
          <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <Truck className="w-6 h-6 text-blue-600" />
              </div>
              <div className="flex-1">
                <div className="text-sm text-blue-600">Příští svoz</div>
                <div className="font-bold text-blue-800">
                  {WASTE_CONFIG[nextPickup.type]?.icon} {WASTE_CONFIG[nextPickup.type]?.label || nextPickup.type}
                </div>
                <div className="text-xs text-blue-600">
                  {formatDay(nextPickup.schedule.dayOfWeek)} • {nextPickup.schedule.company}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Containers */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-slate-500 uppercase">Kontejnery</h3>

          {containers.map(container => {
            const wasteCfg = WASTE_CONFIG[container.type] || { label: container.type, icon: '🗑️', color: 'bg-gray-500' };
            const fillCfg = FILL_CONFIG[container.fillLevel] || FILL_CONFIG.green;
            const percent = fillCfg.percent;

            return (
              <button
                key={container.id}
                onClick={() => setSelectedContainer(container)}
                className="w-full bg-white p-4 rounded-xl border shadow-sm text-left hover:shadow-md transition"
              >
                <div className="flex items-center gap-4">
                  {/* Icon */}
                  <div className={`w-12 h-12 rounded-xl ${wasteCfg.color} flex items-center justify-center text-2xl`}>
                    {wasteCfg.icon}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-800">{container.name}</div>
                    <div className="text-xs text-slate-500">{container.location}</div>
                    {container.schedule && container.schedule.dayOfWeek > 0 && (
                      <div className="text-xs text-slate-400 mt-0.5">
                        Svoz: {formatDay(container.schedule.dayOfWeek)} • {container.schedule.company}
                      </div>
                    )}
                  </div>

                  {/* Fill Level Bar */}
                  <div className="w-20 md:w-24">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-bold ${fillCfg.color}`}>
                        {fillCfg.label}
                      </span>
                    </div>
                    <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          container.fillLevel === 'red' ? 'bg-red-500' :
                          container.fillLevel === 'yellow' ? 'bg-amber-500' :
                          'bg-emerald-500'
                        }`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>

                  <Edit2 className="w-4 h-4 text-slate-400 flex-shrink-0" />
                </div>
              </button>
            );
          })}
        </div>

        {/* Schedule Overview */}
        <div className="bg-white rounded-xl border p-4">
          <h3 className="text-sm font-bold text-slate-500 uppercase mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Harmonogram svozů
          </h3>
          <div className="space-y-2">
            {containers
              .filter(c => c.schedule && c.schedule.dayOfWeek > 0)
              .sort((a, b) => a.schedule.dayOfWeek - b.schedule.dayOfWeek)
              .map(container => {
                const wasteCfg = WASTE_CONFIG[container.type] || { label: container.type, icon: '🗑️' };
                return (
                  <div key={container.id} className="flex items-center gap-3 p-2 bg-slate-50 rounded-lg">
                    <span className="text-xl">{wasteCfg.icon}</span>
                    <div className="flex-1">
                      <div className="font-medium text-sm">{container.name}</div>
                      <div className="text-xs text-slate-500">{container.schedule.company}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium text-sm">{formatDay(container.schedule.dayOfWeek)}</div>
                      <div className="text-xs text-slate-500">{container.schedule.notifyTime || '—'}</div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {/* Container Detail Modal */}
      {selectedContainer && (
        <ContainerModal
          container={selectedContainer}
          onClose={() => setSelectedContainer(null)}
          onUpdateFill={updateFillLevel}
          onMarkEmptied={markEmptied}
          formatDay={formatDay}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// CONTAINER MODAL
// ═══════════════════════════════════════════

function ContainerModal({ container, onClose, onUpdateFill, onMarkEmptied, formatDay }: {
  container: WasteContainer;
  onClose: () => void;
  onUpdateFill: (id: string, level: FillLevel) => Promise<void>;
  onMarkEmptied: (id: string) => Promise<void>;
  formatDay: (day: number) => string;
}) {
  const wasteCfg = WASTE_CONFIG[container.type] || { label: container.type, icon: '🗑️', color: 'bg-gray-500' };
  const fillCfg = FILL_CONFIG[container.fillLevel] || FILL_CONFIG.green;
  const [saving, setSaving] = useState(false);

  const handleMarkEmpty = async () => {
    setSaving(true);
    try {
      await onMarkEmptied(container.id);
      onClose();
    } catch (err: unknown) { alert((err as Error).message); }
    setSaving(false);
  };

  const handleSetLevel = async (level: FillLevel) => {
    setSaving(true);
    try {
      await onUpdateFill(container.id, level);
      onClose();
    } catch (err: unknown) { alert((err as Error).message); }
    setSaving(false);
  };

  const lastEmptied = container.lastEmptiedAt && typeof container.lastEmptiedAt.toDate === 'function'
    ? container.lastEmptiedAt.toDate().toLocaleDateString('cs-CZ')
    : null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-t-3xl md:rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{wasteCfg.icon}</span>
            <span className={`px-2 py-1 rounded-lg text-sm font-bold ${fillCfg.bgColor} ${fillCfg.color}`}>
              {fillCfg.label}
            </span>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <h2 className="text-xl font-bold text-slate-800">{container.name}</h2>

          {/* Semafor buttons */}
          <div className="bg-slate-50 p-6 rounded-xl text-center">
            <div className="text-sm text-slate-500 mb-4">Nastavit stav naplnění</div>
            <div className="flex gap-3 justify-center">
              <button
                disabled={saving}
                onClick={() => handleSetLevel('green')}
                className={`w-20 h-20 rounded-2xl flex flex-col items-center justify-center gap-1 transition border-2 ${
                  container.fillLevel === 'green' ? 'border-emerald-500 bg-emerald-100' : 'border-transparent bg-emerald-50 hover:bg-emerald-100'
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-emerald-500" />
                <span className="text-xs font-bold text-emerald-700">OK</span>
              </button>
              <button
                disabled={saving}
                onClick={() => handleSetLevel('yellow')}
                className={`w-20 h-20 rounded-2xl flex flex-col items-center justify-center gap-1 transition border-2 ${
                  container.fillLevel === 'yellow' ? 'border-amber-500 bg-amber-100' : 'border-transparent bg-amber-50 hover:bg-amber-100'
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-amber-500" />
                <span className="text-xs font-bold text-amber-700">Pozor</span>
              </button>
              <button
                disabled={saving}
                onClick={() => handleSetLevel('red')}
                className={`w-20 h-20 rounded-2xl flex flex-col items-center justify-center gap-1 transition border-2 ${
                  container.fillLevel === 'red' ? 'border-red-500 bg-red-100' : 'border-transparent bg-red-50 hover:bg-red-100'
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-red-500" />
                <span className="text-xs font-bold text-red-700">Plný</span>
              </button>
            </div>
          </div>

          {/* Info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 p-3 rounded-xl">
              <div className="text-xs text-slate-500 mb-1">Umístění</div>
              <div className="font-medium">{container.location}</div>
            </div>
            <div className="bg-slate-50 p-3 rounded-xl">
              <div className="text-xs text-slate-500 mb-1">Typ odpadu</div>
              <div className="font-medium">{wasteCfg.label}</div>
            </div>
            {lastEmptied && (
              <div className="bg-slate-50 p-3 rounded-xl">
                <div className="text-xs text-slate-500 mb-1">Poslední vývoz</div>
                <div className="font-medium">{lastEmptied}</div>
              </div>
            )}
            {container.schedule && (
              <div className="bg-slate-50 p-3 rounded-xl">
                <div className="text-xs text-slate-500 mb-1">Svoz</div>
                <div className="font-medium">
                  {container.schedule.dayOfWeek > 0
                    ? `${formatDay(container.schedule.dayOfWeek)} • ${container.schedule.company}`
                    : `Na obj. • ${container.schedule.company}`
                  }
                </div>
              </div>
            )}
          </div>

          {/* Mark empty */}
          <button
            onClick={handleMarkEmpty}
            disabled={saving}
            className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
            Označit jako vyvezený
          </button>
        </div>
      </div>
    </div>
  );
}
