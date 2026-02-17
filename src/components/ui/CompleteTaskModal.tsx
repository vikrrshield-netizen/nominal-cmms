// src/components/ui/CompleteTaskModal.tsx
// NOMINAL CMMS — Povinná pole při dokončení úkolu
// Technik MUSÍ vyplnit popis řešení, volitelně čas

import { useState } from 'react';
import { CheckCircle2, X, Loader2, Clock, FileText } from 'lucide-react';

interface CompleteTaskModalProps {
  taskTitle: string;
  onConfirm: (data: { resolution: string; durationMinutes: number | null }) => Promise<void>;
  onClose: () => void;
}

export default function CompleteTaskModal({ taskTitle, onConfirm, onClose }: CompleteTaskModalProps) {
  const [resolution, setResolution] = useState('');
  const [duration, setDuration] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isValid = resolution.trim().length >= 5;

  const handleSubmit = async () => {
    if (!isValid) {
      setError('Popis řešení musí mít alespoň 5 znaků');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await onConfirm({
        resolution: resolution.trim(),
        durationMinutes: duration ? Number(duration) : null,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Nepodařilo se dokončit úkol');
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-end md:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 rounded-t-3xl md:rounded-3xl w-full max-w-lg border border-slate-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold text-white">Dokončit úkol</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-700 text-slate-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Task title */}
          <div className="bg-slate-700/50 rounded-xl p-3">
            <div className="text-sm text-slate-400">Úkol:</div>
            <div className="text-white font-medium">{taskTitle}</div>
          </div>

          {/* Resolution — POVINNÉ */}
          <div>
            <label className="text-sm text-slate-400 mb-1.5 flex items-center gap-2">
              <FileText className="w-4 h-4" />
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
              className={`w-full bg-slate-700 text-white p-3 rounded-xl border outline-none resize-none ${
                error && !isValid
                  ? 'border-red-500 focus:border-red-400'
                  : 'border-slate-600 focus:border-emerald-500'
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

          {/* Duration — VOLITELNÉ */}
          <div>
            <label className="text-sm text-slate-400 mb-1.5 flex items-center gap-2">
              <Clock className="w-4 h-4" />
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
              className="w-full bg-slate-700 text-white p-3 rounded-xl border border-slate-600 focus:border-blue-500 outline-none"
            />
            {duration && Number(duration) > 0 && (
              <span className="text-xs text-slate-500 mt-1 block">
                = {Math.floor(Number(duration) / 60)}h {Number(duration) % 60}min
              </span>
            )}
          </div>

          {/* Error */}
          {error && isValid && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold disabled:opacity-50 flex items-center justify-center gap-2 transition"
          >
            {saving ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <CheckCircle2 className="w-5 h-5" />
            )}
            {saving ? 'Ukládám...' : 'Dokončit a uzavřít'}
          </button>
        </div>
      </div>
    </div>
  );
}
