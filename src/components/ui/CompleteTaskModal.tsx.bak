// src/components/ui/CompleteTaskModal.tsx
// VIKRR — Asset Shield — Povinná pole při dokončení úkolu
// Technik MUSÍ vyplnit popis řešení, volitelně čas

import { useState } from 'react';
import { Clock, FileText } from 'lucide-react';
import BottomSheet, { FormField, FormFooter } from './BottomSheet';

const ASSIGNEE_OPTIONS = [
  { value: 'Filip Novák', label: 'Filip Novák (interní)' },
  { value: 'Zdeněk Mička', label: 'Zdeněk Mička (interní)' },
  { value: 'Petr Volf', label: 'Petr Volf (interní)' },
  { value: 'Údržba (tým)', label: 'Údržba — tým (interní)' },
  { value: 'Externí firma', label: 'Externí firma' },
];

const WORK_TYPE_OPTIONS = [
  { value: 'udrzba', label: 'Údržba' },
  { value: 'projekt_milan', label: 'Projekt/Milan' },
  { value: 'revize', label: 'Revize' },
  { value: 'sanitace', label: 'Sanitace' },
];

interface CompleteTaskModalProps {
  taskTitle: string;
  onConfirm: (data: { resolution: string; durationMinutes: number | null; completedByName: string; workType: string }) => Promise<void>;
  onClose: () => void;
}

export default function CompleteTaskModal({ taskTitle, onConfirm, onClose }: CompleteTaskModalProps) {
  const [resolution, setResolution] = useState('');
  const [duration, setDuration] = useState('');
  const [assignee, setAssignee] = useState('');
  const [workType, setWorkType] = useState('');
  const [pin, setPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isValid = resolution.trim().length >= 5 && pin.length === 4 && assignee !== '' && workType !== '';

  const handleSubmit = async () => {
    if (resolution.trim().length < 5) {
      setError('Popis řešení musí mít alespoň 5 znaků');
      return;
    }
    if (!assignee) {
      setError('Vyber kdo úkol provedl');
      return;
    }
    if (!workType) {
      setError('Vyber typ práce');
      return;
    }
    if (pin.length !== 4) {
      setError('Zadej 4místný PIN pro potvrzení');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await onConfirm({
        resolution: resolution.trim(),
        durationMinutes: duration ? Number(duration) : null,
        completedByName: assignee,
        workType,
      });
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message || 'Nepodařilo se dokončit úkol');
      setSaving(false);
    }
  };

  return (
    <BottomSheet title="Dokončit úkol" isOpen onClose={onClose}>
      {/* Task title */}
      <div className="bg-slate-700/50 rounded-xl p-3 mb-4">
        <div className="text-sm text-slate-400">Úkol:</div>
        <div className="text-white font-medium">{taskTitle}</div>
      </div>

      {/* Resolution — POVINNÉ (custom kvůli character counter) */}
      <div className="mb-4">
        <label className="block text-sm text-slate-400 font-medium mb-1.5">
          <FileText className="w-4 h-4 inline mr-1" />
          Popis řešení <span className="text-red-400">*</span>
        </label>
        <textarea
          value={resolution}
          onChange={(e) => {
            setResolution(e.target.value);
            if (e.target.value.trim().length >= 5) setError('');
          }}
          placeholder="Co jste udělali? Jaký díl jste vyměnili? Co bylo příčinou?"
          rows={3}
          autoFocus
          className={`w-full px-4 py-3 rounded-xl bg-white/5 border text-white text-[15px] placeholder-slate-600 focus:outline-none transition resize-none min-h-[48px] ${
            error && !isValid
              ? 'border-red-500 focus:border-red-400'
              : 'border-white/10 focus:border-orange-500/50'
          }`}
        />
        <div className="flex justify-between mt-1">
          {error && !isValid ? (
            <span className="text-xs text-red-400">{error}</span>
          ) : (
            <span className="text-xs text-slate-500">Min. 5 znaků</span>
          )}
          <span className={`text-xs ${resolution.trim().length >= 5 ? 'text-emerald-400' : 'text-slate-500'}`}>
            {resolution.trim().length}/5
          </span>
        </div>
      </div>

      {/* Assignee */}
      <FormField
        label="Provedl"
        value={assignee}
        onChange={setAssignee}
        type="select"
        required
        options={ASSIGNEE_OPTIONS}
      />

      {/* Work Type */}
      <FormField
        label="Typ práce"
        value={workType}
        onChange={setWorkType}
        type="select"
        required
        options={WORK_TYPE_OPTIONS}
      />

      {/* Duration */}
      <div className="mb-4">
        <label className="block text-sm text-slate-400 font-medium mb-1.5">
          <Clock className="w-4 h-4 inline mr-1" />
          Čas práce v minutách <span className="text-slate-600">(volitelné)</span>
        </label>
        <input
          type="number"
          inputMode="numeric"
          min="0"
          max="480"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          placeholder="Např. 45"
          className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-[15px] placeholder-slate-600 focus:outline-none focus:border-orange-500/50 transition min-h-[48px]"
        />
        {duration && Number(duration) > 0 && (
          <span className="text-xs text-slate-500 mt-1 block">
            = {Math.floor(Number(duration) / 60)}h {Number(duration) % 60}min
          </span>
        )}
      </div>

      {/* PIN Verification */}
      <div className="mb-4">
        <label className="block text-sm text-slate-400 font-medium mb-1.5">
          PIN pro potvrzení <span className="text-red-400">*</span>
        </label>
        <input
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          placeholder="4 číslice"
          className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-[15px] placeholder-slate-600 focus:outline-none focus:border-orange-500/50 transition text-center text-2xl tracking-[0.5em] font-mono min-h-[48px]"
        />
        <span className="text-[11px] text-slate-600 mt-1 block">Potvrzuji dokončení zadáním PINu</span>
      </div>

      {/* Error */}
      {error && isValid && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-400 text-sm mb-4">
          {error}
        </div>
      )}

      {/* Footer */}
      <FormFooter
        onCancel={onClose}
        onSubmit={handleSubmit}
        submitLabel="Dokončit a uzavřít"
        loading={saving}
        color="green"
      />
    </BottomSheet>
  );
}
