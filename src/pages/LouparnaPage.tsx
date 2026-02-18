// src/pages/LouparnaPage.tsx
// NOMINAL CMMS — Loupárna (Budova L) — Firestore LIVE
// Sila + Výroba + Plevy + Stanice

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import {
  useLouparna, MACHINE_STATUS_CONFIG,
  getSiloLevelColor, formatTs,
} from '../hooks/useLouparna';
import type {
  Silo, ProductionBatch, WasteTicket, LouparnaMachine, MachineStatus,
} from '../hooks/useLouparna';
import {
  ArrowLeft, Cylinder, Wheat, CheckCircle2,
  Edit3, Save, X, Thermometer, Calendar,
  Factory, Truck, Package, Loader2,
  BarChart3, Trash2,
} from 'lucide-react';

// ═══════════════════════════════════════════
// MATERIALS LIST
// ═══════════════════════════════════════════

const MATERIALS = [
  'Pohanka', 'Proso', 'Čirok', 'Pšenice', 'Žito',
  'Oves', 'Ječmen', 'Kukuřice', 'Rýže', 'Prázdné',
];

// ═══════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════

export default function LouparnaPage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuthContext();
  const {
    silos, batches, wasteTickets, machines, loading,
    currentBatch, completedBatches, pendingWaste, productionStats,
    updateSilo, markSiloCleaned, completeBatch, confirmPlevyPickup,
    updateMachineStatus,
  } = useLouparna();

  // UI state
  const [editingSilo, setEditingSilo] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Silo>>({});
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [showPickupModal, setShowPickupModal] = useState<WasteTicket | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'production' | 'waste'>('overview');

  const canEdit = hasPermission('assets.edit');

  // Silo edit
  const handleEditSilo = (silo: Silo) => {
    setEditingSilo(silo.id);
    setEditForm({ ...silo });
  };

  const handleSaveSilo = async () => {
    if (!editingSilo) return;
    await updateSilo(editingSilo, {
      currentLevel: editForm.currentLevel,
      material: editForm.material,
      materialCode: editForm.materialCode,
      temperature: editForm.temperature,
      notes: editForm.notes,
    });
    setEditingSilo(null);
    setEditForm({});
  };

  // ─────────────────────────────────────────
  // LOADING
  // ─────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
      </div>
    );
  }

  // ─────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-900 text-white pb-24">
      {/* Pending waste alert */}
      {pendingWaste.length > 0 && (
        <div className="bg-amber-600 text-white px-4 py-3 flex items-center gap-3">
          <Truck className="w-5 h-5 animate-bounce" />
          <div>
            <div className="font-bold">{pendingWaste.length} odvoz plev čeká!</div>
            <div className="text-sm opacity-90">
              Celkem {productionStats.pendingWasteKg} kg
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 px-4 py-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/map')}
            className="p-2 hover:bg-slate-700 rounded-lg transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Wheat className="w-6 h-6 text-amber-400" />
              Loupárna (Budova L)
            </h1>
            <p className="text-sm text-slate-400">
              Sila • Loupací linka • Čištění obilí
            </p>
          </div>
          {currentBatch && (
            <div className="bg-emerald-500/20 border border-emerald-500/50 px-3 py-1 rounded-full">
              <span className="text-emerald-400 text-sm font-bold">● BĚŽÍ</span>
            </div>
          )}
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-slate-800 border-b border-slate-700 flex">
        {[
          { id: 'overview' as const, label: 'Přehled', icon: BarChart3 },
          { id: 'production' as const, label: `Výroba (${batches.length})`, icon: Factory },
          { id: 'waste' as const, label: `Plevy (${pendingWaste.length})`, icon: Trash2 },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-3 text-sm font-medium text-center border-b-2 transition flex items-center justify-center gap-2 ${
              activeTab === tab.id
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-6">
        {/* ═══ TAB: PŘEHLED ═══ */}
        {activeTab === 'overview' && (
          <>
            {/* Production Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard
                icon="📦" label="Výroba celkem"
                value={`${(productionStats.totalOutputKg / 1000).toFixed(1)} t`}
                color="text-emerald-400"
              />
              <StatCard
                icon="🌿" label="Plevy celkem"
                value={`${(productionStats.totalWasteKg / 1000).toFixed(1)} t`}
                color="text-amber-400"
              />
              <StatCard
                icon="📊" label="Výtěžnost"
                value={`${productionStats.avgYield}%`}
                color="text-blue-400"
              />
              <StatCard
                icon="🔄" label="Šarží"
                value={String(productionStats.batchCount)}
                color="text-purple-400"
              />
            </div>

            {/* SILA */}
            <section>
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Cylinder className="w-5 h-5 text-blue-400" />
                Sila (4× 50t)
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {silos.map((silo) => (
                  <SiloCard
                    key={silo.id}
                    silo={silo}
                    isEditing={editingSilo === silo.id}
                    editForm={editForm}
                    canEdit={canEdit}
                    onEdit={() => handleEditSilo(silo)}
                    onSave={handleSaveSilo}
                    onCancel={() => { setEditingSilo(null); setEditForm({}); }}
                    onFormChange={(data) => setEditForm({ ...editForm, ...data })}
                    onClean={() => markSiloCleaned(silo.id)}
                  />
                ))}
              </div>
            </section>

            {/* VÝROBNÍ STANICE */}
            <section>
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Factory className="w-5 h-5 text-emerald-400" />
                Výrobní stanice
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {machines.map((machine) => (
                  <MachineCard
                    key={machine.id}
                    machine={machine}
                    currentBatch={currentBatch}
                    canEdit={canEdit}
                    onStatusChange={(status) => updateMachineStatus(machine.id, status)}
                    onCompleteBatch={() => setShowCompleteModal(true)}
                  />
                ))}
              </div>
            </section>
          </>
        )}

        {/* ═══ TAB: VÝROBA ═══ */}
        {activeTab === 'production' && (
          <section>
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Package className="w-5 h-5 text-emerald-400" />
              Výrobní šarže (Vyloupané)
            </h2>

            {/* Running batch highlight */}
            {currentBatch && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="font-bold text-emerald-400">PROBÍHÁ</span>
                  </div>
                  <span className="font-mono text-slate-400">{currentBatch.batchCode}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-800/50 p-3 rounded-lg">
                    <div className="text-xs text-slate-500">Surovina</div>
                    <div className="font-medium">{currentBatch.material}</div>
                  </div>
                  <div className="bg-slate-800/50 p-3 rounded-lg">
                    <div className="text-xs text-slate-500">Vstup</div>
                    <div className="font-medium">{currentBatch.inputKg.toLocaleString('cs-CZ')} kg</div>
                  </div>
                </div>
                {canEdit && (
                  <button
                    onClick={() => setShowCompleteModal(true)}
                    className="mt-3 w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    Dokončit šarži
                  </button>
                )}
              </div>
            )}

            {/* Completed batches */}
            <div className="space-y-3">
              {completedBatches.map((batch) => (
                <div
                  key={batch.id}
                  className="bg-slate-800 rounded-xl border border-slate-700 p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-mono text-sm text-slate-400">{batch.batchCode}</span>
                    <span className="text-xs text-slate-500">{formatTs(batch.completedAt)}</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div>
                      <span className="text-slate-500">Surovina: </span>
                      <span className="font-medium text-amber-400">{batch.material}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Vstup: </span>
                      <span className="font-medium">{batch.inputKg.toLocaleString('cs-CZ')} kg</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Výstup: </span>
                      <span className="font-bold text-emerald-400">
                        {(batch.outputKg || 0).toLocaleString('cs-CZ')} kg
                      </span>
                      {batch.outputKs && (
                        <span className="text-slate-500 ml-1">({batch.outputKs} ks)</span>
                      )}
                    </div>
                    <div>
                      <span className="text-slate-500">Plevy: </span>
                      <span className="text-amber-400">{(batch.wasteKg || 0).toLocaleString('cs-CZ')} kg</span>
                    </div>
                  </div>
                  {/* Yield bar */}
                  <div className="mt-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-500">Výtěžnost</span>
                      <span className={`font-bold ${
                        (batch.yieldPercent || 0) >= 85 ? 'text-emerald-400' :
                        (batch.yieldPercent || 0) >= 80 ? 'text-amber-400' : 'text-red-400'
                      }`}>{batch.yieldPercent}%</span>
                    </div>
                    <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          (batch.yieldPercent || 0) >= 85 ? 'bg-emerald-500' :
                          (batch.yieldPercent || 0) >= 80 ? 'bg-amber-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${batch.yieldPercent || 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {completedBatches.length === 0 && (
              <div className="text-center py-12">
                <Package className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-500">Žádné dokončené šarže</p>
              </div>
            )}
          </section>
        )}

        {/* ═══ TAB: PLEVY ═══ */}
        {activeTab === 'waste' && (
          <section>
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-amber-400" />
              Plevy — Specifický odpad Loupárny
            </h2>

            {/* Pending tickets */}
            {pendingWaste.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-bold text-amber-400 uppercase mb-3">
                  ⚠️ Čeká na odvoz ({pendingWaste.length})
                </h3>
                <div className="space-y-3">
                  {pendingWaste.map((ticket) => (
                    <div
                      key={ticket.id}
                      className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono text-sm text-slate-400">{ticket.batchCode}</span>
                        <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                          ČEKÁ
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-2xl font-bold text-amber-400">{ticket.weightKg} kg</div>
                          <div className="text-xs text-slate-500">
                            Požadavek: {formatTs(ticket.requestedAt)}
                          </div>
                        </div>
                        {canEdit && (
                          <button
                            onClick={() => setShowPickupModal(ticket)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl font-bold flex items-center gap-2"
                          >
                            <Truck className="w-5 h-5" />
                            Odvezeno
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Completed tickets */}
            <h3 className="text-sm font-bold text-slate-500 uppercase mb-3">
              Historie odvozů
            </h3>
            <div className="space-y-2">
              {wasteTickets
                .filter((t) => t.status === 'completed')
                .map((ticket) => (
                  <div
                    key={ticket.id}
                    className="bg-slate-800 rounded-xl border border-slate-700 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-mono text-xs text-slate-500">{ticket.batchCode}</span>
                        <div className="font-medium">{ticket.weightKg} kg plev</div>
                      </div>
                      <div className="text-right text-sm">
                        <div className="text-slate-400">{ticket.pickedUpBy}</div>
                        <div className="text-xs text-slate-500">
                          {ticket.vehicleUsed} • {formatTs(ticket.pickedUpAt)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
            </div>

            {wasteTickets.length === 0 && (
              <div className="text-center py-12">
                <Trash2 className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-500">Žádné záznamy o plevách</p>
              </div>
            )}
          </section>
        )}
      </div>

      {/* Complete Batch Modal */}
      {showCompleteModal && currentBatch && (
        <CompleteBatchModal
          batch={currentBatch}
          onClose={() => setShowCompleteModal(false)}
          onComplete={completeBatch}
        />
      )}

      {/* Pickup Confirm Modal */}
      {showPickupModal && (
        <PickupModal
          ticket={showPickupModal}
          onClose={() => setShowPickupModal(null)}
          onConfirm={confirmPlevyPickup}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════

function StatCard({ icon, label, value, color }: {
  icon: string; label: string; value: string; color: string;
}) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 text-center">
      <div className="text-2xl mb-1">{icon}</div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function SiloCard({ silo, isEditing, editForm, canEdit, onEdit, onSave, onCancel, onFormChange, onClean: _onClean }: {
  silo: Silo;
  isEditing: boolean;
  editForm: Partial<Silo>;
  canEdit: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onFormChange: (data: Partial<Silo>) => void;
  onClean: () => void;
}) {
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      {/* Visual silo */}
      <div className="relative h-32 md:h-40 bg-slate-700 flex items-end justify-center p-2">
        <div className="relative w-20 h-32 bg-slate-600 rounded-t-full overflow-hidden border-2 border-slate-500">
          <div
            className={`absolute bottom-0 left-0 right-0 transition-all ${getSiloLevelColor(silo.currentLevel)}`}
            style={{ height: `${silo.currentLevel}%` }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-2xl font-bold text-white drop-shadow-lg">
              {silo.currentLevel}%
            </span>
          </div>
        </div>
        {canEdit && !isEditing && (
          <button
            onClick={onEdit}
            className="absolute top-2 right-2 p-1.5 bg-slate-600 hover:bg-slate-500 rounded-lg transition"
          >
            <Edit3 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <h3 className="font-bold text-center mb-2">{silo.name}</h3>

        {isEditing ? (
          <div className="space-y-2">
            <div>
              <label className="text-xs text-slate-400">Stav (%)</label>
              <input
                type="number" min="0" max="100"
                value={editForm.currentLevel || 0}
                onChange={(e) => onFormChange({ currentLevel: Number(e.target.value) })}
                className="w-full bg-slate-700 rounded px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400">Surovina</label>
              <select
                value={editForm.material || ''}
                onChange={(e) => onFormChange({ material: e.target.value })}
                className="w-full bg-slate-700 rounded px-2 py-1 text-sm"
              >
                {MATERIALS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400">Poznámka</label>
              <input
                type="text"
                value={editForm.notes || ''}
                onChange={(e) => onFormChange({ notes: e.target.value })}
                className="w-full bg-slate-700 rounded px-2 py-1 text-sm"
                placeholder="Poznámka..."
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={onSave} className="flex-1 bg-emerald-600 hover:bg-emerald-500 py-1.5 rounded text-sm font-medium flex items-center justify-center gap-1">
                <Save className="w-4 h-4" /> Uložit
              </button>
              <button onClick={onCancel} className="flex-1 bg-slate-600 hover:bg-slate-500 py-1.5 rounded text-sm font-medium flex items-center justify-center gap-1">
                <X className="w-4 h-4" /> Zrušit
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-1 text-sm">
            <div className="flex items-center gap-2 justify-center">
              <Wheat className="w-4 h-4 text-amber-400" />
              <span className="font-medium">{silo.material}</span>
            </div>
            {silo.temperature != null && (
              <div className="flex items-center gap-2 justify-center text-slate-400">
                <Thermometer className="w-3 h-3" />
                <span>{silo.temperature}°C</span>
              </div>
            )}
            {silo.lastFilledAt && (
              <div className="text-xs text-slate-500 text-center">
                Naplněno: {formatTs(silo.lastFilledAt)}
              </div>
            )}
            {silo.lastCleanedAt && (
              <div className="text-xs text-slate-500 text-center">
                Čištěno: {formatTs(silo.lastCleanedAt)}
              </div>
            )}
            {silo.notes && (
              <div className="text-xs text-amber-400 text-center mt-2">
                ⚠️ {silo.notes}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MachineCard({ machine, currentBatch, canEdit, onStatusChange, onCompleteBatch }: {
  machine: LouparnaMachine;
  currentBatch: ProductionBatch | null;
  canEdit: boolean;
  onStatusChange: (status: MachineStatus) => void;
  onCompleteBatch: () => void;
}) {
  const config = MACHINE_STATUS_CONFIG[machine.status];
  const isRunning = machine.status === 'running';

  const cycleStatus = () => {
    const next: Record<MachineStatus, MachineStatus> = {
      running: 'stopped', stopped: 'cleaning', cleaning: 'running', maintenance: 'stopped',
    };
    onStatusChange(next[machine.status]);
  };

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-lg">{machine.name}</h3>
        <button
          onClick={canEdit ? cycleStatus : undefined}
          disabled={!canEdit}
          className={`px-3 py-1.5 rounded-full text-sm font-medium flex items-center gap-2 ${config.color} ${
            canEdit ? 'cursor-pointer' : 'cursor-default'
          }`}
        >
          {isRunning && <span className="w-2 h-2 bg-white rounded-full animate-pulse" />}
          {config.label}
        </button>
      </div>

      {isRunning && currentBatch && machine.currentBatchCode && (
        <div className="bg-slate-700/50 rounded-lg p-3 mb-3">
          <div className="flex items-center gap-2 text-sm text-slate-300 mb-1">
            <Truck className="w-4 h-4 text-blue-400" />
            Šarže: <strong>{machine.currentBatchCode}</strong>
          </div>
          <div className="text-xs text-slate-500">
            {currentBatch.material} • {currentBatch.inputKg.toLocaleString('cs-CZ')} kg vstup
          </div>
          {canEdit && (
            <button
              onClick={onCompleteBatch}
              className="mt-2 w-full py-2 bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 rounded-lg text-sm font-medium hover:bg-emerald-600/30"
            >
              ✓ Dokončit šarži
            </button>
          )}
        </div>
      )}

      {machine.lastMaintenanceAt && (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Calendar className="w-4 h-4" />
          Údržba: {formatTs(machine.lastMaintenanceAt)}
        </div>
      )}
      {machine.notes && (
        <div className="mt-2 text-sm text-amber-400">📝 {machine.notes}</div>
      )}
    </div>
  );
}

function CompleteBatchModal({ batch, onClose, onComplete }: {
  batch: ProductionBatch;
  onClose: () => void;
  onComplete: (id: string, data: { outputKg: number; outputKs: number; wasteKg: number }) => Promise<void>;
}) {
  const [outputKg, setOutputKg] = useState('');
  const [outputKs, setOutputKs] = useState('');
  const [wasteKg, setWasteKg] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!outputKg || !wasteKg) return;
    setSaving(true);
    try {
      await onComplete(batch.id, {
        outputKg: Number(outputKg),
        outputKs: Number(outputKs) || 0,
        wasteKg: Number(wasteKg),
      });
      onClose();
    } catch (err: any) { alert(err.message); }
    setSaving(false);
  };

  // Auto-calculate waste
  const autoWaste = outputKg ? batch.inputKg - Number(outputKg) : null;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end md:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-800 rounded-t-3xl md:rounded-3xl w-full max-w-lg border border-slate-700" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold">Dokončit šarži</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="bg-slate-700/50 rounded-xl p-3">
            <div className="text-sm text-slate-400">Šarže: <span className="font-mono text-white">{batch.batchCode}</span></div>
            <div className="text-sm text-slate-400">
              Surovina: <span className="text-amber-400 font-medium">{batch.material}</span> •
              Vstup: <span className="text-white font-medium">{batch.inputKg.toLocaleString('cs-CZ')} kg</span>
            </div>
          </div>

          <div>
            <label className="text-sm text-slate-400 mb-1 block">Výstup — vyloupané (kg)</label>
            <input
              type="number"
              value={outputKg}
              onChange={(e) => {
                setOutputKg(e.target.value);
                if (e.target.value && !wasteKg) {
                  setWasteKg(String(batch.inputKg - Number(e.target.value)));
                }
              }}
              placeholder={`Max ${batch.inputKg} kg`}
              className="w-full bg-slate-700 text-white p-3 rounded-xl border border-slate-600 focus:border-emerald-500 outline-none"
              autoFocus
            />
          </div>

          <div>
            <label className="text-sm text-slate-400 mb-1 block">Počet balení (ks)</label>
            <input
              type="number"
              value={outputKs}
              onChange={(e) => setOutputKs(e.target.value)}
              placeholder="Volitelné"
              className="w-full bg-slate-700 text-white p-3 rounded-xl border border-slate-600 focus:border-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="text-sm text-slate-400 mb-1 block">
              Plevy — odpad (kg)
              {autoWaste != null && autoWaste > 0 && !wasteKg && (
                <span className="text-amber-400 ml-2">≈ {autoWaste} kg</span>
              )}
            </label>
            <input
              type="number"
              value={wasteKg}
              onChange={(e) => setWasteKg(e.target.value)}
              placeholder={autoWaste != null ? String(autoWaste) : ''}
              className="w-full bg-slate-700 text-white p-3 rounded-xl border border-slate-600 focus:border-amber-500 outline-none"
            />
          </div>

          {outputKg && (
            <div className="bg-slate-700/50 rounded-xl p-3 text-center">
              <span className="text-slate-400">Výtěžnost: </span>
              <span className={`text-xl font-bold ${
                Math.round(Number(outputKg) / batch.inputKg * 100) >= 85 ? 'text-emerald-400' : 'text-amber-400'
              }`}>
                {Math.round(Number(outputKg) / batch.inputKg * 100)}%
              </span>
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={!outputKg || !wasteKg || saving}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
            Dokončit a zapsat
          </button>
        </div>
      </div>
    </div>
  );
}

function PickupModal({ ticket, onClose, onConfirm }: {
  ticket: WasteTicket;
  onClose: () => void;
  onConfirm: (id: string, vehicle: string, note?: string) => Promise<void>;
}) {
  const [vehicle, setVehicle] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const VEHICLES = ['JCB 3CX', 'VZV Linde H30', 'VZV Jungheinrich', 'New Holland T4.75', 'Jiný'];

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end md:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-800 rounded-t-3xl md:rounded-3xl w-full max-w-lg border border-slate-700" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold">Potvrdit odvoz plev</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="bg-amber-500/10 rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-amber-400">{ticket.weightKg} kg</div>
            <div className="text-sm text-slate-400">plev ze šarže {ticket.batchCode}</div>
          </div>

          <div>
            <label className="text-sm text-slate-400 mb-2 block">Čím odvezeno?</label>
            <div className="grid grid-cols-2 gap-2">
              {VEHICLES.map((v) => (
                <button
                  key={v}
                  onClick={() => setVehicle(v)}
                  className={`p-3 rounded-xl text-sm font-medium transition ${
                    vehicle === v ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm text-slate-400 mb-1 block">Kam (volitelné)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Poznámka k vývozu"
              className="w-full bg-slate-700 text-white p-3 rounded-xl border border-slate-600 outline-none"
            />
          </div>

          <button
            onClick={async () => {
              if (!vehicle) return;
              setSaving(true);
              try {
                await onConfirm(ticket.id, vehicle, note || undefined);
                onClose();
              } catch (err: any) { alert(err.message); }
              setSaving(false);
            }}
            disabled={!vehicle || saving}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Truck className="w-5 h-5" />}
            Potvrdit odvoz
          </button>
        </div>
      </div>
    </div>
  );
}
