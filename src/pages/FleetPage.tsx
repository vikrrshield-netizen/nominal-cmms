// src/pages/FleetPage.tsx
// NOMINAL CMMS — Vozový park (DEMO SPRINT — všechno v jednom)

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot, doc, getDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthContext } from '../context/AuthContext';
import { useEntityLogs } from '../hooks/useEntityLogs';
import {
  EntityCardCompact,
  computeEntityStatus, getFieldSemaphore,
  type Entity, type Blueprint, type EntityLogEntry,
} from '../components/EntityCard';
import {
  ArrowLeft, X, Loader2, Car, Send, Clock, Plus,
  AlertTriangle, CheckCircle2, Pencil, Droplets, Printer, PlusCircle, Save,
  Download, Trash2, Upload,
} from 'lucide-react';
import { useReports } from '../hooks/useReports';
import ImportModal from '../components/ui/ImportModal';
import BottomSheet, { FormField, FormFooter } from '../components/ui/BottomSheet';

// ═══════════════════════════════════════════
// TOAST SYSTEM
// ═══════════════════════════════════════════

let toastId = 0;
interface ToastItem { id: number; text: string; type: 'success' | 'info' | 'error' }

function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const show = useCallback((text: string, type: ToastItem['type'] = 'success') => {
    const id = ++toastId;
    setToasts((p) => [...p, { id, text, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3000);
  }, []);
  return { toasts, show };
}

function ToastContainer({ toasts }: { toasts: ToastItem[] }) {
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[999] flex flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className={`px-6 py-3 rounded-2xl text-sm font-bold shadow-2xl animate-bounce ${
          t.type === 'success' ? 'bg-emerald-500 text-white' :
          t.type === 'error' ? 'bg-red-500 text-white' :
          'bg-blue-500 text-white'
        }`}>
          {t.type === 'success' ? '✅ ' : t.type === 'error' ? '❌ ' : 'ℹ️ '}{t.text}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════

function useEntities(type: string) {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const q = query(collection(db, 'entities'), where('type', '==', type), where('isDeleted', '==', false));
    const unsub = onSnapshot(q, (snap) => {
      setEntities(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Entity)));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [type]);
  return { entities, loading };
}

function useBlueprint(id: string | null) {
  const [bp, setBp] = useState<Blueprint | null>(null);
  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, 'blueprints', id)).then((s) => { if (s.exists()) setBp({ id: s.id, ...s.data() } as Blueprint); });
  }, [id]);
  return bp;
}

// ═══════════════════════════════════════════
// PDF EXPORT
// ═══════════════════════════════════════════

function printVehicleReport(entity: Entity, blueprint: Blueprint | null, logs: EntityLogEntry[]) {
  const w = window.open('', '_blank');
  if (!w) return;

  const fieldsHtml = (blueprint?.fields || [])
    .filter((f) => f.type !== 'photo' && entity.data?.[f.key] !== undefined && entity.data?.[f.key] !== '')
    .map((f) => `<tr><td style="padding:8px;border:1px solid #ddd;font-weight:600;background:#f8f9fa;">${f.label}</td><td style="padding:8px;border:1px solid #ddd;">${entity.data?.[f.key] ?? ''}${f.unit ? ' ' + f.unit : ''}</td></tr>`)
    .join('');

  const logsHtml = logs.slice(0, 20).map((l) => {
    const date = l.createdAt?.toDate ? l.createdAt.toDate().toLocaleDateString('cs-CZ') : '—';
    const typeLabel = l.type === 'handover' ? 'Předání' : l.type === 'maintenance' ? 'Servis' : l.type === 'inspection' ? 'Kontrola' : 'Poznámka';
    return `<tr><td style="padding:6px;border:1px solid #ddd;">${date}</td><td style="padding:6px;border:1px solid #ddd;">${l.userInitials}</td><td style="padding:6px;border:1px solid #ddd;">${typeLabel}</td><td style="padding:6px;border:1px solid #ddd;">${l.text}</td></tr>`;
  }).join('');

  w.document.write(`<!DOCTYPE html><html><head><title>${entity.name} — Report</title>
<style>body{font-family:Arial,sans-serif;margin:40px;color:#333}h1{color:#1e293b;border-bottom:3px solid #3b82f6;padding-bottom:10px}h2{color:#475569;margin-top:30px}table{width:100%;border-collapse:collapse;margin-top:10px}.logo{display:flex;align-items:center;gap:12px;margin-bottom:20px}.logo-box{width:48px;height:48px;background:linear-gradient(135deg,#3b82f6,#6366f1);border-radius:12px;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:20px}.meta{color:#64748b;font-size:13px;margin-top:4px}@media print{body{margin:20px}}</style></head><body>
<div class="logo"><div class="logo-box">N</div><div><div style="font-size:18px;font-weight:bold">NOMINAL CMMS</div><div class="meta">Vozový park — Karta vozidla</div></div></div>
<h1>${entity.name}</h1>
<p class="meta">Kód: ${entity.code} &nbsp;|&nbsp; Vytištěno: ${new Date().toLocaleDateString('cs-CZ')} ${new Date().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}</p>
<h2>Technické údaje</h2>
<table>${fieldsHtml}</table>
${logs.length > 0 ? `<h2>Historie (posledních ${Math.min(logs.length, 20)} záznamů)</h2>
<table><tr style="background:#1e293b;color:white"><th style="padding:8px;text-align:left">Datum</th><th style="padding:8px;text-align:left">Kdo</th><th style="padding:8px;text-align:left">Typ</th><th style="padding:8px;text-align:left">Popis</th></tr>${logsHtml}</table>` : ''}
<script>setTimeout(()=>window.print(),300)</script></body></html>`);
  w.document.close();
}

// ═══════════════════════════════════════════
// SEMAPHORE PANEL
// ═══════════════════════════════════════════

function SemaphorePanel({ entities, blueprint }: { entities: Entity[]; blueprint: Blueprint | null }) {
  const counts = useMemo(() => {
    let green = 0, yellow = 0, red = 0;
    for (const e of entities) {
      const s = computeEntityStatus(e, blueprint);
      if (s === 'red') red++; else if (s === 'yellow') yellow++; else green++;
    }
    return { green, yellow, red };
  }, [entities, blueprint]);

  const stkField = blueprint?.fields.find((f) => f.key === 'stk_date');
  const stkBreakdown = useMemo(() => {
    if (!stkField) return { ok: 0, warning: 0, expired: 0 };
    let ok = 0, warning = 0, expired = 0;
    for (const e of entities) {
      const sem = getFieldSemaphore(stkField, e.data?.stk_date);
      if (sem === 'red') expired++; else if (sem === 'yellow') warning++; else if (sem === 'green') ok++;
    }
    return { ok, warning, expired };
  }, [entities, stkField]);

  return (
    <div className="bg-slate-800/60 backdrop-blur-sm rounded-2xl p-4 border border-slate-700/50">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-slate-400 uppercase">Stav flotily</h2>
        <span className="text-xs text-slate-500">{entities.length} vozidel</span>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-emerald-500/10 rounded-xl p-3 text-center">
          <div className="w-6 h-6 rounded-full bg-emerald-500 mx-auto mb-2" />
          <div className="text-2xl font-bold text-emerald-400">{counts.green}</div>
          <div className="text-xs text-slate-500">OK</div>
        </div>
        <div className="bg-amber-500/10 rounded-xl p-3 text-center">
          <div className="w-6 h-6 rounded-full bg-amber-500 mx-auto mb-2" />
          <div className="text-2xl font-bold text-amber-400">{counts.yellow}</div>
          <div className="text-xs text-slate-500">Pozor</div>
        </div>
        <div className="bg-red-500/10 rounded-xl p-3 text-center">
          <div className="w-6 h-6 rounded-full bg-red-500 mx-auto mb-2" />
          <div className="text-2xl font-bold text-red-400">{counts.red}</div>
          <div className="text-xs text-slate-500">Kritické</div>
        </div>
      </div>
      <div className="flex items-center gap-4 text-xs text-slate-400">
        <span className="font-medium text-slate-500">STK:</span>
        <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />{stkBreakdown.ok} platné</span>
        <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-amber-400" />{stkBreakdown.warning} končí</span>
        <span className="flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5 text-red-400" />{stkBreakdown.expired} prošlé</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// ADD VEHICLE MODAL
// ═══════════════════════════════════════════

function AddVehicleModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: (name: string) => void }) {
  const { user } = useAuthContext();
  const [name, setName] = useState('');
  const [spz, setSpz] = useState('');
  const [stkDate, setStkDate] = useState('');
  const [fuel, setFuel] = useState('Nafta');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const vehicleName = name.trim();
      const vehicleCode = spz.trim().replace(/\s+/g, '-').toUpperCase() || vehicleName.substring(0, 3).toUpperCase() + '-NEW';

      await addDoc(collection(db, 'entities'), {
        parentId: 'entity_fleet',
        type: 'vehicle',
        blueprintId: 'blueprint_vehicle',
        name: vehicleName,
        code: vehicleCode,
        status: 'operational',
        data: {
          registration: spz.trim() || 'bez SPZ',
          stk_date: stkDate || '',
          insurance_date: '',
          oil_hours: 0,
          oil_limit: 500,
          oil_type: '',
          tachometer: 0,
          fuel_type: fuel,
          year: new Date().getFullYear(),
          keys_location: '',
          assigned_to: user?.displayName || '',
        },
        tags: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: user?.id || 'unknown',
        isDeleted: false,
      });

      await addDoc(collection(db, 'fleet'), {
        name: vehicleName,
        type: 'car' as const,
        status: 'available',
        assignedUserName: user?.displayName || 'Pool (sdílený)',
        licensePlate: spz.trim() || null,
        stkExpiry: null,
        insuranceExpiry: null,
        keysLocation: '',
        currentMth: 0,
        currentKm: 0,
        fuelLevel: 100,
        serviceHistory: [],
        isDeleted: false,
        updatedAt: serverTimestamp(),
      });

      onSuccess(vehicleName);
    } catch (err: unknown) {
      alert('Chyba: ' + ((err as Error).message || err));
    }
    setSaving(false);
  };

  return (
    <BottomSheet title="Přidat vozidlo" isOpen onClose={onClose}>
      <FormField label="Název vozidla" value={name} onChange={setName} placeholder="Např. Toyota Hilux" required autoFocus />
      <FormField label="SPZ" value={spz} onChange={setSpz} placeholder="1J5 1234" />
      <FormField label="STK platnost" value={stkDate} onChange={setStkDate} type="date" />
      <FormField
        label="Palivo"
        value={fuel}
        onChange={setFuel}
        type="chips"
        options={[
          { value: 'Nafta', label: 'Nafta' },
          { value: 'Benzín', label: 'Benzín' },
          { value: 'Elektro', label: 'Elektro' },
          { value: 'LPG', label: 'LPG' },
        ]}
      />
      <FormFooter
        onCancel={onClose}
        onSubmit={handleSave}
        submitLabel="Uložit vozidlo"
        loading={saving}
        disabled={!name.trim()}
        color="blue"
      />
    </BottomSheet>
  );
}

// ═══════════════════════════════════════════
// VEHICLE DETAIL MODAL (vše v jednom)
// ═══════════════════════════════════════════

function VehicleDetailModal({ entity, blueprint, onClose, toast }: {
  entity: Entity; blueprint: Blueprint | null; onClose: () => void;
  toast: (text: string, type?: ToastItem['type']) => void;
}) {
  const navigate = useNavigate();
  const { logs, loading: logsLoading, addLog } = useEntityLogs(entity.id);
  const [showHandover, setShowHandover] = useState(false);
  const [saving, setSaving] = useState(false);

  // EDIT MODE — inline editing fields
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  // DYNAMIC FIELDS (local only — demo)
  const [customFields, setCustomFields] = useState<{ key: string; value: string }[]>([]);
  const [showAddField, setShowAddField] = useState(false);
  const [newFieldKey, setNewFieldKey] = useState('');
  const [newFieldValue, setNewFieldValue] = useState('');

  const startEdit = (fieldKey: string, currentValue: string) => {
    setEditingField(fieldKey);
    setEditValue(currentValue || '');
  };

  const saveEdit = async (fieldKey: string) => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'entities', entity.id), {
        [`data.${fieldKey}`]: editValue,
        updatedAt: serverTimestamp(),
      });
      toast(`${fieldKey === 'stk_date' ? 'STK' : fieldKey} aktualizováno`);
      setEditingField(null);
    } catch (err: unknown) {
      toast('Chyba: ' + ((err as Error).message || err), 'error');
    }
    setSaving(false);
  };

  // OIL RESET
  const handleOilReset = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'entities', entity.id), {
        'data.oil_hours': 0,
        updatedAt: serverTimestamp(),
      });
      await addLog('maintenance', `Výměna oleje — reset motohodin na 0. Typ: ${entity.data?.oil_type || 'neuvedeno'}.`, { oil_reset: true });
      toast('Olej vyměněn — Mth reset na 0');
    } catch (err: unknown) {
      toast('Chyba: ' + ((err as Error).message || err), 'error');
    }
    setSaving(false);
  };

  // HANDOVER
  const handleHandover = async (data: { tachometer: string; condition: string; note: string }) => {
    setSaving(true);
    try {
      const text = [
        'Předání vozidla.',
        data.tachometer ? `Stav: ${data.tachometer}.` : '',
        `Vizuální stav: ${data.condition === 'ok' ? 'OK' : data.condition === 'minor' ? 'drobné závady' : 'POŠKOZENO'}.`,
        data.note || '',
      ].filter(Boolean).join(' ');
      await addLog('handover', text, { tachometer: data.tachometer ? Number(data.tachometer) : undefined, condition: data.condition });
      if (data.tachometer) {
        await updateDoc(doc(db, 'entities', entity.id), {
          'data.tachometer': Number(data.tachometer),
          updatedAt: serverTimestamp(),
        });
      }
      toast('Vozidlo předáno');
      setShowHandover(false);
    } catch (err: unknown) {
      toast('Chyba: ' + ((err as Error).message || err), 'error');
    }
    setSaving(false);
  };

  // ADD CUSTOM FIELD
  const handleAddField = () => {
    if (!newFieldKey.trim()) return;
    setCustomFields((p) => [...p, { key: newFieldKey.trim(), value: newFieldValue.trim() }]);
    toast(`Parametr "${newFieldKey.trim()}" přidán`, 'info');
    setNewFieldKey('');
    setNewFieldValue('');
    setShowAddField(false);
  };

  const logEntries: EntityLogEntry[] = logs.map((l) => ({
    id: l.id, entityId: l.entityId, userId: l.userId, userInitials: l.userInitials,
    type: l.type, text: l.text, data: l.data, createdAt: l.createdAt,
  }));

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="bg-slate-900 rounded-t-3xl md:rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-slate-700/50" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur-sm border-b border-slate-700/50 p-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <Car className="w-5 h-5 text-blue-400" />
            <span className="font-bold text-white">{entity.name}</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => printVehicleReport(entity, blueprint, logEntries)} className="p-2 rounded-lg hover:bg-slate-800 min-w-[44px] min-h-[44px] flex items-center justify-center" title="Tisk reportu">
              <Printer className="w-5 h-5 text-slate-400" />
            </button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-800 min-w-[44px] min-h-[44px] flex items-center justify-center">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Breadcrumbs + header */}
          <div className="flex items-center text-sm text-slate-500 gap-1">
            <button onClick={() => { onClose(); navigate('/'); }} className="hover:text-blue-400">Dashboard</button>
            <span className="text-slate-600">/</span>
            <button onClick={onClose} className="hover:text-blue-400">Vozový park</button>
            <span className="text-slate-600">/</span>
            <span className="text-white font-medium">{entity.name}</span>
          </div>

          {/* Entity header */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#3b82f630' }}>
              <Car className="w-8 h-8 text-blue-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-white">{entity.name}</h2>
              <div className="text-sm text-slate-500 font-mono">{entity.code}</div>
              {entity.data?.assigned_to && <div className="text-sm text-blue-400 mt-1">→ {entity.data.assigned_to}</div>}
            </div>
          </div>

          {/* RODNÝ LIST — s editací */}
          {blueprint && (
            <div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/30">
              <h3 className="text-xs text-slate-500 uppercase font-bold mb-3">Rodný list</h3>
              <div className="grid grid-cols-2 gap-3">
                {blueprint.fields
                  .filter((f) => f.type !== 'photo' && entity.data?.[f.key] !== undefined && entity.data?.[f.key] !== '')
                  .map((f) => {
                    const val = entity.data?.[f.key];
                    const sem = getFieldSemaphore(f, val);
                    const isEditing = editingField === f.key;
                    const SEMAPHORE_TEXT: Record<string, string> = { green: 'text-emerald-400', yellow: 'text-amber-400', red: 'text-red-400', gray: 'text-slate-400' };
                    const daysLeft = f.type === 'date' && val ? Math.round((new Date(val).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;

                    return (
                      <div key={f.key} className="bg-slate-700/30 rounded-xl p-3 relative group">
                        <div className="flex items-center gap-1.5 mb-1">
                          {sem !== 'gray' && <span className={`w-2.5 h-2.5 rounded-full ${sem === 'green' ? 'bg-emerald-500' : sem === 'yellow' ? 'bg-amber-500' : sem === 'red' ? 'bg-red-500' : 'bg-slate-600'}`} />}
                          <span className="text-xs text-slate-500">{f.label}</span>
                          {/* EDIT BUTTON */}
                          {(f.key === 'stk_date' || f.key === 'insurance_date' || f.key === 'tachometer' || f.key === 'oil_type' || f.key === 'registration' || f.key === 'assigned_to' || f.key === 'keys_location') && !isEditing && (
                            <button onClick={() => startEdit(f.key, String(val))} className="ml-auto opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-600 transition">
                              <Pencil className="w-3 h-3 text-slate-400" />
                            </button>
                          )}
                        </div>
                        {isEditing ? (
                          <div className="flex gap-1">
                            <input
                              type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'}
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              autoFocus
                              className="flex-1 p-1.5 bg-slate-600/50 border border-blue-500 rounded-lg text-sm text-white outline-none min-h-[36px]"
                            />
                            <button onClick={() => saveEdit(f.key)} disabled={saving}
                              className="p-1.5 bg-blue-600 rounded-lg hover:bg-blue-500 min-w-[36px] min-h-[36px] flex items-center justify-center">
                              <Save className="w-4 h-4 text-white" />
                            </button>
                            <button onClick={() => setEditingField(null)}
                              className="p-1.5 bg-slate-600 rounded-lg hover:bg-slate-500 min-w-[36px] min-h-[36px] flex items-center justify-center">
                              <X className="w-4 h-4 text-slate-300" />
                            </button>
                          </div>
                        ) : (
                          <div className={`text-sm font-medium ${SEMAPHORE_TEXT[sem] || 'text-white'}`}>
                            {f.type === 'date' ? (
                              <>
                                {val ? new Date(val).toLocaleDateString('cs-CZ') : '—'}
                                {daysLeft !== null && !isNaN(daysLeft) && (
                                  <span className="ml-1 text-xs opacity-75">
                                    ({daysLeft < 0 ? `${Math.abs(daysLeft)}d po!` : `za ${daysLeft}d`})
                                  </span>
                                )}
                              </>
                            ) : f.type === 'number' && f.unit
                              ? `${Number(val).toLocaleString('cs-CZ')} ${f.unit}`
                              : String(val)
                            }
                          </div>
                        )}
                      </div>
                    );
                  })}

                {/* CUSTOM FIELDS (lokální demo) */}
                {customFields.map((cf, i) => (
                  <div key={`custom-${i}`} className="bg-purple-500/10 rounded-xl p-3 border border-purple-500/20">
                    <div className="text-xs text-purple-400 mb-1 flex items-center gap-1">
                      <PlusCircle className="w-3 h-3" />{cf.key}
                    </div>
                    <div className="text-sm font-medium text-purple-300">{cf.value || '—'}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ACTION BUTTONS */}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={handleOilReset} disabled={saving}
              className="py-3 bg-amber-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-amber-500 transition active:scale-[0.97] min-h-[48px] disabled:opacity-50">
              <Droplets className="w-5 h-5" />
              Výměna oleje
            </button>
            <button onClick={() => setShowHandover(true)} disabled={saving}
              className="py-3 bg-blue-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-500 transition active:scale-[0.97] min-h-[48px] disabled:opacity-50">
              <Send className="w-5 h-5" />
              Předat
            </button>
            <button onClick={() => printVehicleReport(entity, blueprint, logEntries)}
              className="py-3 bg-slate-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-600 transition active:scale-[0.97] min-h-[48px]">
              <Printer className="w-5 h-5" />
              Tisk reportu
            </button>
            <button onClick={() => setShowAddField(true)}
              className="py-3 bg-purple-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-purple-500 transition active:scale-[0.97] min-h-[48px]">
              <PlusCircle className="w-5 h-5" />
              Přidat parametr
            </button>
          </div>

          {/* ADD FIELD FORM */}
          {showAddField && (
            <div className="bg-purple-500/10 rounded-2xl p-4 border border-purple-500/20 space-y-3">
              <h3 className="text-sm font-bold text-purple-400">Nový parametr</h3>
              <input value={newFieldKey} onChange={(e) => setNewFieldKey(e.target.value)} placeholder="Název (např. Barva)"
                className="w-full p-2.5 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-500 outline-none text-sm min-h-[44px]" autoFocus />
              <input value={newFieldValue} onChange={(e) => setNewFieldValue(e.target.value)} placeholder="Hodnota (např. Modrá metalíza)"
                className="w-full p-2.5 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-500 outline-none text-sm min-h-[44px]" />
              <div className="flex gap-2">
                <button onClick={() => setShowAddField(false)} className="flex-1 py-2.5 bg-slate-700 text-slate-300 rounded-xl text-sm min-h-[44px]">Zrušit</button>
                <button onClick={handleAddField} disabled={!newFieldKey.trim()} className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl font-bold text-sm disabled:opacity-50 min-h-[44px]">Přidat</button>
              </div>
            </div>
          )}

          {/* HANDOVER FORM */}
          {showHandover && (
            <HandoverForm entity={entity} onSubmit={handleHandover} onCancel={() => setShowHandover(false)} />
          )}

          {/* LOGS */}
          {logsLoading && (
            <div className="flex items-center justify-center py-4 gap-2 text-slate-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />Načítám historii...
            </div>
          )}
          {logEntries.length > 0 && (
            <div>
              <h3 className="text-xs text-slate-500 uppercase font-bold mb-3">Historie ({logEntries.length})</h3>
              <div className="space-y-2">
                {logEntries.map((log) => {
                  const time = log.createdAt?.toDate ? log.createdAt.toDate().toLocaleDateString('cs-CZ') + ' ' + log.createdAt.toDate().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }) : '—';
                  return (
                    <div key={log.id} className="bg-slate-700/30 rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-7 h-7 rounded-full bg-slate-600 flex items-center justify-center text-[10px] text-white font-bold flex-shrink-0">{log.userInitials}</div>
                        <span className="text-xs text-slate-500">{time}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          log.type === 'handover' ? 'bg-blue-500/20 text-blue-400' :
                          log.type === 'maintenance' ? 'bg-amber-500/20 text-amber-400' :
                          log.type === 'inspection' ? 'bg-emerald-500/20 text-emerald-400' :
                          'bg-slate-500/20 text-slate-400'
                        }`}>
                          {log.type === 'handover' ? 'Předání' : log.type === 'maintenance' ? 'Servis' : log.type === 'inspection' ? 'Kontrola' : 'Poznámka'}
                        </span>
                      </div>
                      <div className="text-sm text-slate-300 ml-9">{log.text}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Delete */}
          <button
            onClick={async () => {
              if (window.confirm(`Opravdu smazat ${entity.name}?`)) {
                await deleteDoc(doc(db, 'entities', entity.id));
                toast(`${entity.name} smazáno`, 'info');
                onClose();
              }
            }}
            className="w-full py-3 bg-red-500/10 text-red-400 rounded-xl font-bold hover:bg-red-500/20 flex items-center justify-center gap-2 border border-red-500/20"
          >
            <Trash2 className="w-5 h-5" />
            Smazat vozidlo
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// HANDOVER FORM
// ═══════════════════════════════════════════

function HandoverForm({ entity, onSubmit, onCancel }: {
  entity: Entity;
  onSubmit: (data: { tachometer: string; condition: string; note: string }) => void;
  onCancel: () => void;
}) {
  const [tachometer, setTachometer] = useState(entity.data?.tachometer ? String(entity.data.tachometer) : '');
  const [condition, setCondition] = useState<'ok' | 'minor' | 'damage'>('ok');
  const [note, setNote] = useState('');

  return (
    <div className="bg-blue-500/5 rounded-2xl p-4 border border-blue-500/20 space-y-3">
      <h3 className="text-sm font-bold text-blue-400">Předání vozidla</h3>
      <input type="number" value={tachometer} onChange={(e) => setTachometer(e.target.value)} placeholder="Tachometr / Motohodiny"
        className="w-full p-3 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-500 outline-none focus:border-blue-500 min-h-[48px]" />
      <div className="grid grid-cols-3 gap-2">
        {([
          { id: 'ok' as const, label: 'OK ✅', c: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
          { id: 'minor' as const, label: 'Drobné ⚠️', c: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
          { id: 'damage' as const, label: 'Poškození 🔴', c: 'bg-red-500/20 text-red-400 border-red-500/30' },
        ]).map((c) => (
          <button key={c.id} onClick={() => setCondition(c.id)}
            className={`py-2.5 rounded-xl text-xs font-medium border transition min-h-[44px] ${condition === c.id ? c.c : 'bg-slate-700/30 text-slate-400 border-slate-600/30'}`}>{c.label}</button>
        ))}
      </div>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Poznámka..." rows={2}
        className="w-full p-3 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-500 outline-none resize-none min-h-[48px]" />
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 py-3 bg-slate-700 text-slate-300 rounded-xl font-medium min-h-[48px]">Zrušit</button>
        <button onClick={() => onSubmit({ tachometer, condition, note })} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold min-h-[48px]"><Send className="w-4 h-4 inline mr-1" />Předat</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// FLEET PAGE — MAIN
// ═══════════════════════════════════════════

export default function FleetPage() {
  const navigate = useNavigate();
  const { entities, loading } = useEntities('vehicle');
  const blueprint = useBlueprint('blueprint_vehicle');
  const { exportXLSX } = useReports();
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const { toasts, show: toast } = useToast();

  const sortedEntities = useMemo(() => {
    if (!blueprint) return entities;
    return [...entities].sort((a, b) => {
      const sa = computeEntityStatus(a, blueprint);
      const sb = computeEntityStatus(b, blueprint);
      const order: Record<string, number> = { red: 0, yellow: 1, green: 2, gray: 3 };
      const diff = (order[sa] || 3) - (order[sb] || 3);
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name);
    });
  }, [entities, blueprint]);

  if (loading) {
    return <div className="min-h-screen bg-slate-900 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-400" /></div>;
  }

  return (
    <div className="min-h-screen bg-slate-900 pb-24">
      {/* Header */}
      <div className="bg-slate-800/60 border-b border-slate-700/50 px-4 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} className="p-2 rounded-xl hover:bg-slate-700/50 transition min-w-[44px] min-h-[44px] flex items-center justify-center">
              <ArrowLeft className="w-5 h-5 text-slate-400" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-white">Vozový park</h1>
              <div className="text-xs text-slate-500">{entities.length} vozidel</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => {
              const data = entities.map(e => ({ name: e.name, code: e.code, status: e.status, ...e.data }));
              exportXLSX('fleet', data, { filename: `NOMINAL_fleet_${new Date().toISOString().slice(0, 10)}.xlsx` });
            }}
              className="p-3 bg-slate-700 rounded-xl hover:bg-slate-600 transition min-w-[48px] min-h-[48px] flex items-center justify-center"
              title="Export XLSX">
              <Download className="w-5 h-5 text-white" />
            </button>
            <button onClick={() => setShowImportModal(true)}
              className="p-3 bg-indigo-600 rounded-xl hover:bg-indigo-500 transition min-w-[48px] min-h-[48px] flex items-center justify-center"
              title="Import z Excelu">
              <Upload className="w-5 h-5 text-white" />
            </button>
            <button onClick={() => setShowAddModal(true)}
              className="p-3 bg-blue-600 rounded-xl hover:bg-blue-500 transition active:scale-[0.95] min-w-[48px] min-h-[48px] flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Plus className="w-6 h-6 text-white" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 pt-4 space-y-4">
        {entities.length > 0 && <SemaphorePanel entities={entities} blueprint={blueprint} />}

        {sortedEntities.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sortedEntities.map((entity) => (
              <div key={entity.id} className="flex flex-col">
                <EntityCardCompact entity={entity} blueprint={blueprint} onClick={() => setSelectedEntity(entity)} />
                {/* ACTION FOOTER */}
                <div className="bg-slate-800/60 -mt-3 pt-5 pb-2.5 px-4 rounded-b-2xl border border-t-0 border-slate-700/50 flex items-center justify-end gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); setSelectedEntity(entity); }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition flex items-center gap-1.5 min-h-[32px]"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Upravit
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`Opravdu smazat ${entity.name}?`)) {
                        deleteDoc(doc(db, 'entities', entity.id));
                        toast(`${entity.name} smazáno`, 'info');
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/10 text-red-400 hover:bg-red-500/20 transition flex items-center gap-1.5 min-h-[32px]"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Smazat
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <Car className="w-16 h-16 text-slate-700 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-400 mb-2">Žádná vozidla</h3>
            <button onClick={() => setShowAddModal(true)} className="mt-4 px-6 py-3 bg-blue-600 text-white rounded-xl font-bold flex items-center gap-2 mx-auto">
              <Plus className="w-5 h-5" />Přidat první vozidlo
            </button>
          </div>
        )}
      </div>

      {/* Modals */}
      {selectedEntity && <VehicleDetailModal entity={selectedEntity} blueprint={blueprint} onClose={() => setSelectedEntity(null)} toast={toast} />}
      {showAddModal && <AddVehicleModal onClose={() => setShowAddModal(false)} onSuccess={(name) => { setShowAddModal(false); toast(`${name} přidáno do flotily`); }} />}
      {showImportModal && (
        <ImportModal
          title="Import vozidel z Excelu"
          onClose={() => setShowImportModal(false)}
          onImport={async (rows) => {
            const BATCH_SIZE = 500;
            let imported = 0;
            let failed = 0;
            const errors: string[] = [];
            for (let i = 0; i < rows.length; i += BATCH_SIZE) {
              const chunk = rows.slice(i, i + BATCH_SIZE);
              const batch = writeBatch(db);
              for (const row of chunk) {
                try {
                  const name = String(row.name || row.nazev || '');
                  if (!name) { failed++; continue; }
                  const ref = doc(collection(db, 'entities'));
                  batch.set(ref, {
                    parentId: 'entity_fleet', type: 'vehicle', blueprintId: 'blueprint_vehicle',
                    name, code: String(row.code || row.spz || name.substring(0, 3).toUpperCase()),
                    status: 'operational',
                    data: {
                      registration: String(row.spz || row.registration || ''),
                      stk_date: String(row.stk_date || row.stk || ''),
                      fuel_type: String(row.fuel_type || row.palivo || 'Nafta'),
                      year: Number(row.year || row.rok || new Date().getFullYear()),
                      tachometer: Number(row.tachometer || row.km || 0),
                      oil_hours: 0, oil_limit: 500, oil_type: '', insurance_date: '', keys_location: '',
                      assigned_to: String(row.assigned_to || row.ridic || ''),
                    },
                    tags: [], createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
                    createdBy: 'import', isDeleted: false,
                  });
                  imported++;
                } catch (err) { failed++; errors.push(`Chyba: ${(err as Error).message}`); }
              }
              try { await batch.commit(); } catch (err) { failed += chunk.length; imported -= chunk.length; errors.push(`Batch selhal: ${(err as Error).message}`); }
            }
            if (imported > 0) toast(`${imported} vozidel importováno`);
            return { imported, failed, errors };
          }}
        />
      )}

      {/* Toast */}
      <ToastContainer toasts={toasts} />
    </div>
  );
}
