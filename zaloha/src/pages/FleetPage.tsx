// src/pages/FleetPage.tsx
// NOMINAL CMMS — Vozový park (Firestore LIVE)

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import { useFleet, TYPE_CONFIG, STATUS_CONFIG } from '../hooks/useFleet';
import type { FleetVehicle, VehicleType, VehicleStatus } from '../hooks/useFleet';
import { Breadcrumb, UserBadge } from '../components/ui';
import {
  Car, Fuel, Clock, Calendar, MapPin, ChevronRight, Plus, X,
  Wrench, AlertTriangle, CheckCircle2, Loader2, Battery, Key,
} from 'lucide-react';
import { Timestamp } from 'firebase/firestore';

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

function formatDate(ts: Timestamp | null | undefined): string {
  if (!ts) return '—';
  return ts.toDate().toLocaleDateString('cs-CZ');
}

function daysUntil(ts: Timestamp | null | undefined): number | null {
  if (!ts) return null;
  return Math.round((ts.toDate().getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

// ═══════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════

export default function FleetPage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuthContext();
  const { vehicles, loading, stats, stkWarnings, serviceWarnings, updateStatus, updateCounter, updateFuel } = useFleet();

  // State
  const [filterType, setFilterType] = useState<VehicleType | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<VehicleStatus | 'all'>('all');
  const [selectedVehicle, setSelectedVehicle] = useState<FleetVehicle | null>(null);

  // Permissions
  const canManage = hasPermission('fleet.edit') || hasPermission('fleet.assign');

  // ─────────────────────────────────────────
  // FILTERING
  // ─────────────────────────────────────────
  const filteredVehicles = vehicles.filter(v => {
    if (filterType !== 'all' && v.type !== filterType) return false;
    if (filterStatus !== 'all' && v.status !== filterStatus) return false;
    return true;
  });

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
      {/* STK / Service Warnings */}
      {(stkWarnings.length > 0 || serviceWarnings.length > 0) && (
        <div className="bg-amber-500 text-white px-4 py-3">
          {stkWarnings.map(v => (
            <div key={v.id} className="flex items-center gap-2 text-sm">
              <AlertTriangle className="w-4 h-4" />
              <span><b>{v.name}</b> — STK do {daysUntil(v.stkExpiry)} dní ({formatDate(v.stkExpiry)})</span>
            </div>
          ))}
          {serviceWarnings.map(v => (
            <div key={v.id} className="flex items-center gap-2 text-sm">
              <Wrench className="w-4 h-4" />
              <span><b>{v.name}</b> — servis za {(v.nextServiceMth || 0) - (v.currentMth || 0)} Mth</span>
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b px-4 py-4">
        <Breadcrumb items={[
          { label: 'Dashboard', onClick: () => navigate('/') },
          { label: 'Vozový park' },
        ]} />
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-slate-800">Vozový park</h1>
          {canManage && (
            <button className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-blue-700">
              <Plus className="w-5 h-5" />
              <span className="hidden sm:inline">Přidat</span>
            </button>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-2">
          <StatBox icon="🚗" label="Celkem" value={stats.total}
            active={filterStatus === 'all'} onClick={() => setFilterStatus('all')} />
          <StatBox icon="✅" label="Volné" value={stats.available} color="text-emerald-600"
            active={filterStatus === 'available'} onClick={() => setFilterStatus('available')} />
          <StatBox icon="🔄" label="V provozu" value={stats.inUse} color="text-blue-600"
            active={filterStatus === 'in_use'} onClick={() => setFilterStatus('in_use')} />
          <StatBox icon="⚠️" label="Problémy" value={stats.issues} color="text-amber-600"
            active={filterStatus === 'maintenance'} onClick={() => setFilterStatus('maintenance')} />
        </div>

        {/* Type Filter */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition ${
              filterType === 'all' ? 'bg-slate-800 text-white' : 'bg-white border text-slate-600'
            }`}
          >
            Vše
          </button>
          {(Object.entries(TYPE_CONFIG) as [VehicleType, { label: string; icon: string }][]).map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => setFilterType(key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition flex items-center gap-1 ${
                filterType === key ? 'bg-slate-800 text-white' : 'bg-white border text-slate-600'
              }`}
            >
              <span>{cfg.icon}</span>
              <span>{cfg.label}</span>
            </button>
          ))}
        </div>

        {/* Vehicles Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredVehicles.map((vehicle) => (
            <VehicleCard
              key={vehicle.id}
              vehicle={vehicle}
              onClick={() => setSelectedVehicle(vehicle)}
            />
          ))}
        </div>

        {filteredVehicles.length === 0 && (
          <div className="text-center py-12">
            <p className="text-4xl mb-4">🚗</p>
            <h3 className="text-lg font-bold text-slate-800 mb-2">Žádná vozidla</h3>
            <p className="text-slate-500">Změňte filtr</p>
          </div>
        )}
      </div>

      {/* Vehicle Detail Modal */}
      {selectedVehicle && (
        <VehicleDetailModal
          vehicle={selectedVehicle}
          onClose={() => setSelectedVehicle(null)}
          canManage={canManage}
          onUpdateStatus={updateStatus}
          onUpdateCounter={updateCounter}
          onUpdateFuel={updateFuel}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════

function StatBox({ icon, label, value, color = 'text-slate-800', active, onClick }: {
  icon: string; label: string; value: number; color?: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`bg-white p-3 rounded-xl border-2 text-center transition ${
        active ? 'border-blue-500' : 'border-transparent'
      }`}
    >
      <div className="text-lg mb-1">{icon}</div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </button>
  );
}

function VehicleCard({ vehicle, onClick }: { vehicle: FleetVehicle; onClick: () => void }) {
  const typeCfg = TYPE_CONFIG[vehicle.type] || TYPE_CONFIG.car;
  const statusCfg = STATUS_CONFIG[vehicle.status] || STATUS_CONFIG.available;

  return (
    <button
      onClick={onClick}
      className="bg-white p-4 rounded-xl border shadow-sm text-left hover:shadow-md transition flex gap-4"
    >
      {/* Icon */}
      <div className="w-14 h-14 rounded-xl bg-slate-100 flex items-center justify-center text-3xl flex-shrink-0">
        {typeCfg.icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${statusCfg.bgColor} text-white`}>
            {statusCfg.label}
          </span>
          {vehicle.licensePlate && (
            <span className="font-mono text-xs text-slate-400">{vehicle.licensePlate}</span>
          )}
        </div>
        <h4 className="font-bold text-slate-800 truncate">{vehicle.name}</h4>

        <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
          {vehicle.currentMth != null && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {vehicle.currentMth} Mth
            </span>
          )}
          {vehicle.currentKm != null && (
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {vehicle.currentKm.toLocaleString('cs-CZ')} km
            </span>
          )}
          {vehicle.fuelLevel != null && (
            <span className="flex items-center gap-1">
              <Fuel className="w-3 h-3" />
              {vehicle.fuelLevel}%
            </span>
          )}
          {vehicle.batteryLevel != null && (
            <span className="flex items-center gap-1">
              <Battery className="w-3 h-3" />
              {vehicle.batteryLevel}%
            </span>
          )}
        </div>

        {/* Assigned */}
        {vehicle.assignedUserName && vehicle.assignedUserName !== 'Pool (sdílený)' && (
          <div className="flex items-center gap-2 mt-2">
            <UserBadge name={vehicle.assignedUserName} color="#0ea5e9" size="sm" />
            <span className="text-xs text-slate-600">{vehicle.assignedUserName}</span>
          </div>
        )}

        {/* Keys location */}
        {vehicle.keysLocation && (
          <div className="flex items-center gap-1 mt-1 text-xs text-slate-400">
            <Key className="w-3 h-3" />
            {vehicle.keysLocation}
          </div>
        )}
      </div>

      <ChevronRight className="w-5 h-5 text-slate-300 flex-shrink-0 self-center" />
    </button>
  );
}

function VehicleDetailModal({ vehicle, onClose, canManage, onUpdateStatus, onUpdateCounter: _onUpdateCounter, onUpdateFuel: _onUpdateFuel }: {
  vehicle: FleetVehicle;
  onClose: () => void;
  canManage: boolean;
  onUpdateStatus: (id: string, status: VehicleStatus) => Promise<void>;
  onUpdateCounter: (id: string, field: 'currentMth' | 'currentKm', value: number) => Promise<void>;
  onUpdateFuel: (id: string, level: number) => Promise<void>;
}) {
  const typeCfg = TYPE_CONFIG[vehicle.type] || TYPE_CONFIG.car;
  const statusCfg = STATUS_CONFIG[vehicle.status] || STATUS_CONFIG.available;
  const [saving, setSaving] = useState(false);

  const handleAction = async (action: () => Promise<void>) => {
    setSaving(true);
    try { await action(); onClose(); }
    catch (err: any) { alert(err.message); }
    setSaving(false);
  };

  const stkDays = daysUntil(vehicle.stkExpiry);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-t-3xl md:rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{typeCfg.icon}</span>
            <div>
              <span className={`px-2 py-0.5 rounded text-xs font-bold ${statusCfg.bgColor} text-white`}>
                {statusCfg.label}
              </span>
              {vehicle.licensePlate && (
                <span className="ml-2 font-mono text-sm text-slate-500">{vehicle.licensePlate}</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <h2 className="text-xl font-bold text-slate-800">{vehicle.name}</h2>

          {/* Counters */}
          <div className="grid grid-cols-2 gap-3">
            {vehicle.currentMth != null && (
              <div className="bg-blue-50 p-4 rounded-xl text-center">
                <Clock className="w-6 h-6 text-blue-500 mx-auto mb-2" />
                <div className="text-2xl font-bold text-blue-700">{vehicle.currentMth}</div>
                <div className="text-xs text-blue-600">Motohodiny</div>
                {vehicle.nextServiceMth && (
                  <div className="text-xs text-blue-400 mt-1">
                    Servis: {vehicle.nextServiceMth} Mth
                    {vehicle.currentMth >= vehicle.nextServiceMth && (
                      <span className="text-red-500 font-bold"> ⚠️ PŘEKROČENO</span>
                    )}
                  </div>
                )}
              </div>
            )}
            {vehicle.currentKm != null && (
              <div className="bg-blue-50 p-4 rounded-xl text-center">
                <MapPin className="w-6 h-6 text-blue-500 mx-auto mb-2" />
                <div className="text-2xl font-bold text-blue-700">{vehicle.currentKm.toLocaleString('cs-CZ')}</div>
                <div className="text-xs text-blue-600">Kilometry</div>
              </div>
            )}
            {vehicle.fuelLevel != null && (
              <div className={`p-4 rounded-xl text-center ${
                vehicle.fuelLevel < 25 ? 'bg-red-50' : vehicle.fuelLevel < 50 ? 'bg-amber-50' : 'bg-emerald-50'
              }`}>
                <Fuel className={`w-6 h-6 mx-auto mb-2 ${
                  vehicle.fuelLevel < 25 ? 'text-red-500' : vehicle.fuelLevel < 50 ? 'text-amber-500' : 'text-emerald-500'
                }`} />
                <div className={`text-2xl font-bold ${
                  vehicle.fuelLevel < 25 ? 'text-red-700' : vehicle.fuelLevel < 50 ? 'text-amber-700' : 'text-emerald-700'
                }`}>{vehicle.fuelLevel}%</div>
                <div className="text-xs text-slate-600">Palivo</div>
              </div>
            )}
            {vehicle.batteryLevel != null && (
              <div className={`p-4 rounded-xl text-center ${
                vehicle.batteryLevel < 25 ? 'bg-red-50' : vehicle.batteryLevel < 50 ? 'bg-amber-50' : 'bg-emerald-50'
              }`}>
                <Battery className={`w-6 h-6 mx-auto mb-2 ${
                  vehicle.batteryLevel < 25 ? 'text-red-500' : vehicle.batteryLevel < 50 ? 'text-amber-500' : 'text-emerald-500'
                }`} />
                <div className={`text-2xl font-bold ${
                  vehicle.batteryLevel < 25 ? 'text-red-700' : vehicle.batteryLevel < 50 ? 'text-amber-700' : 'text-emerald-700'
                }`}>{vehicle.batteryLevel}%</div>
                <div className="text-xs text-slate-600">Baterie</div>
              </div>
            )}
          </div>

          {/* STK & Insurance */}
          {(vehicle.stkExpiry || vehicle.insuranceExpiry) && (
            <div className="grid grid-cols-2 gap-3">
              {vehicle.stkExpiry && (
                <div className={`p-3 rounded-xl ${
                  stkDays != null && stkDays <= 30 ? 'bg-red-50 border border-red-200' :
                  stkDays != null && stkDays <= 60 ? 'bg-amber-50 border border-amber-200' :
                  'bg-slate-50'
                }`}>
                  <div className="text-xs text-slate-500 mb-1">STK do</div>
                  <div className="font-medium flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-blue-500" />
                    {formatDate(vehicle.stkExpiry)}
                  </div>
                  {stkDays != null && stkDays <= 60 && (
                    <div className="text-xs text-amber-600 mt-1">({stkDays} dní)</div>
                  )}
                </div>
              )}
              {vehicle.insuranceExpiry && (
                <div className="bg-slate-50 p-3 rounded-xl">
                  <div className="text-xs text-slate-500 mb-1">Pojištění do</div>
                  <div className="font-medium flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    {formatDate(vehicle.insuranceExpiry)}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Keys & Assigned */}
          <div className="grid grid-cols-1 gap-3">
            {vehicle.keysLocation && (
              <div className="bg-slate-50 p-3 rounded-xl">
                <div className="text-xs text-slate-500 mb-1">Klíče</div>
                <div className="font-medium flex items-center gap-2">
                  <Key className="w-4 h-4 text-slate-400" />
                  {vehicle.keysLocation}
                </div>
              </div>
            )}
            {vehicle.assignedUserName && (
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-xl">
                <div className="text-sm text-blue-700">Přiřazeno:</div>
                <div className="flex items-center gap-2">
                  <UserBadge name={vehicle.assignedUserName} color="#0ea5e9" size="sm" />
                  <span className="font-medium text-blue-800">{vehicle.assignedUserName}</span>
                </div>
              </div>
            )}
          </div>

          {/* Service History */}
          {vehicle.serviceHistory && vehicle.serviceHistory.length > 0 && (
            <div>
              <div className="text-sm font-bold text-slate-500 uppercase mb-2">Historie servisů</div>
              <div className="space-y-2">
                {vehicle.serviceHistory.slice(0, 5).map((s, i) => (
                  <div key={i} className="bg-slate-50 p-3 rounded-xl text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium">{s.type}</span>
                      <span className="text-slate-500">{s.date && typeof s.date.toDate === 'function' ? s.date.toDate().toLocaleDateString('cs-CZ') : '—'}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">{s.description}</div>
                    <div className="flex justify-between mt-1 text-xs text-slate-400">
                      <span>{s.performedBy}</span>
                      {s.cost > 0 && <span>{s.cost.toLocaleString('cs-CZ')} Kč</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          {canManage && (
            <div className="flex gap-2 pt-2">
              {vehicle.status === 'available' && (
                <button
                  disabled={saving}
                  onClick={() => handleAction(() => onUpdateStatus(vehicle.id, 'in_use'))}
                  className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Car className="w-5 h-5" />}
                  Přiřadit
                </button>
              )}
              {vehicle.status === 'in_use' && (
                <button
                  disabled={saving}
                  onClick={() => handleAction(() => onUpdateStatus(vehicle.id, 'available'))}
                  className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                  Vrátit
                </button>
              )}
              <button
                disabled={saving}
                onClick={() => handleAction(() => onUpdateStatus(vehicle.id, 'maintenance'))}
                className="flex-1 py-3 bg-amber-500 text-white rounded-xl font-bold hover:bg-amber-600 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Wrench className="w-5 h-5" />
                Servis
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
