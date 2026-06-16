// src/components/ui/ConfirmDeleteModal.tsx
// Nominal CMMS — 3-step delete confirmation with PIN verification

import { useState } from 'react';
import { AlertTriangle, Trash2, Lock, X, Loader2, ShieldAlert } from 'lucide-react';

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  itemName: string;
  itemType?: string;               // e.g. 'místnost', 'zařízení', 'uživatel'
  impactWarning?: string | null;   // If set, shows warning in step 2
  requirePin?: boolean;            // Default true — step 3 PIN entry
  allowArchive?: boolean;          // If true + impactWarning → allow archiving with name confirm
}

export default function ConfirmDeleteModal({
  isOpen,
  onClose,
  onConfirm,
  itemName,
  itemType = 'položku',
  impactWarning,
  requirePin = true,
  allowArchive = false,
}: ConfirmDeleteModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [pin, setPin] = useState('');
  const [nameConfirm, setNameConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setStep(1);
    setPin('');
    setNameConfirm('');
    setDeleting(false);
    setError('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleStep1 = () => {
    // If there's an impact warning, show it in step 2
    if (impactWarning) {
      setStep(2);
    } else if (requirePin) {
      setStep(3);
    } else {
      // No impact, no PIN — just confirm
      handleFinalConfirm();
    }
  };

  const handleStep3 = () => {
    if (pin.length !== 4) {
      setError('Zadejte 4místný PIN');
      return;
    }
    handleFinalConfirm();
  };

  const handleFinalConfirm = async () => {
    setDeleting(true);
    setError('');
    try {
      await onConfirm();
      handleClose();
    } catch (err) {
      setError((err as Error).message || 'Smazání se nezdařilo');
      setDeleting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4" onClick={handleClose}>
      <div
        className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-red-50 p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
              {step === 3 ? <Lock className="w-5 h-5 text-red-600" /> : <Trash2 className="w-5 h-5 text-red-600" />}
            </div>
            <div>
              <h3 className="font-bold text-slate-900">
                {step === 1 && 'Smazat ' + itemType}
                {step === 2 && 'Nelze smazat'}
                {step === 3 && 'Ověření PIN'}
              </h3>
              <p className="text-xs text-red-700">Krok {step} / {requirePin ? 3 : 2}</p>
            </div>
          </div>
          <button onClick={handleClose} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 transition">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* ═══ STEP 1: Confirm intent ═══ */}
          {step === 1 && (
            <>
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                <AlertTriangle className="w-10 h-10 text-red-600 mx-auto mb-2" />
                <p className="text-sm text-slate-700">
                  Opravdu chcete smazat <strong className="text-slate-900">{itemName}</strong>?
                </p>
                <p className="text-xs text-slate-500 mt-1">Tato akce je nevratná.</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleClose}
                  className="flex-1 py-3 border border-slate-200 text-slate-700 rounded-xl font-semibold hover:bg-slate-50 transition"
                >
                  Zrušit
                </button>
                <button
                  onClick={handleStep1}
                  className="flex-1 py-3 bg-red-50 text-red-700 border border-red-200 rounded-xl font-bold hover:bg-red-100 transition flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Pokračovat
                </button>
              </div>
            </>
          )}

          {/* ═══ STEP 2: Impact warning ═══ */}
          {step === 2 && (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                <ShieldAlert className="w-10 h-10 text-amber-600 mx-auto mb-2" />
                <p className="text-sm font-bold text-amber-700 mb-1">
                  {allowArchive ? 'Zařízení obsahuje historii' : 'Nelze smazat — aktivní vazby'}
                </p>
                <p className="text-sm text-slate-700">{impactWarning}</p>
                {allowArchive && (
                  <p className="text-xs text-amber-700 mt-2">Bude archivováno (soft delete).</p>
                )}
              </div>
              {allowArchive ? (
                <>
                  <div>
                    <label className="block text-sm text-slate-600 mb-1.5">
                      Pro potvrzení opište název: <strong className="text-slate-900">{itemName}</strong>
                    </label>
                    <input
                      type="text"
                      value={nameConfirm}
                      onChange={(e) => { setNameConfirm(e.target.value); setError(''); }}
                      placeholder={itemName}
                      autoFocus
                      className="w-full px-4 py-3 rounded-xl bg-[#fbf9f4] border border-slate-200 text-slate-900 text-sm placeholder-slate-400 focus:outline-none focus:border-emerald-600 transition"
                    />
                  </div>
                  {error && <div className="text-center text-red-600 text-sm">{error}</div>}
                  <div className="flex gap-2">
                    <button
                      onClick={handleClose}
                      className="flex-1 py-3 border border-slate-200 text-slate-700 rounded-xl font-semibold hover:bg-slate-50 transition"
                    >
                      Zrušit
                    </button>
                    <button
                      onClick={() => {
                        if (nameConfirm.trim() !== itemName.trim()) {
                          setError('Název nesouhlasí');
                          return;
                        }
                        handleFinalConfirm();
                      }}
                      disabled={deleting || nameConfirm.trim() !== itemName.trim()}
                      className="flex-1 py-3 bg-amber-600 text-white rounded-xl font-bold hover:bg-amber-500 transition disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      Archivovat
                    </button>
                  </div>
                </>
              ) : (
                <button
                  onClick={handleClose}
                  className="w-full py-3 bg-slate-100 text-slate-700 border border-slate-200 rounded-xl font-semibold hover:bg-slate-200 transition"
                >
                  Rozumím, zavřít
                </button>
              )}
            </>
          )}

          {/* ═══ STEP 3: PIN verification ═══ */}
          {step === 3 && (
            <>
              <div className="text-center mb-2">
                <Lock className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-sm text-slate-700">
                  Zadejte svůj 4místný PIN pro potvrzení smazání
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  <strong className="text-slate-900">{itemName}</strong>
                </p>
              </div>

              {/* PIN input — 4 boxes */}
              <div className="flex justify-center gap-3 my-4">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={`w-14 h-14 rounded-xl border-2 flex items-center justify-center text-2xl font-bold transition ${
                      pin.length > i
                        ? 'border-red-400 bg-red-50 text-slate-900'
                        : 'border-slate-200 bg-white text-slate-400'
                    }`}
                  >
                    {pin.length > i ? '•' : ''}
                  </div>
                ))}
              </div>

              <input
                type="tel"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setPin(v);
                  setError('');
                }}
                autoFocus
                className="sr-only"
                aria-label="PIN pro potvrzení smazání"
              />

              {/* Numeric keypad */}
              <div className="grid grid-cols-3 gap-2 max-w-[240px] mx-auto">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, 'del'].map((key, idx) => {
                  if (key === null) return <div key={idx} />;
                  if (key === 'del') {
                    return (
                      <button
                        key={idx}
                        onClick={() => setPin((p) => p.slice(0, -1))}
                        className="py-3 rounded-xl bg-slate-100 text-slate-600 font-semibold hover:bg-slate-200 transition text-sm"
                      >
                        ←
                      </button>
                    );
                  }
                  return (
                    <button
                      key={idx}
                      onClick={() => pin.length < 4 && setPin((p) => p + key)}
                      className="py-3 rounded-xl bg-white border border-slate-200 text-slate-900 font-bold text-lg hover:bg-slate-50 transition"
                    >
                      {key}
                    </button>
                  );
                })}
              </div>

              {error && (
                <div className="text-center text-red-600 text-sm mt-2">{error}</div>
              )}

              <div className="flex gap-2 mt-4">
                <button
                  onClick={handleClose}
                  className="flex-1 py-3 border border-slate-200 text-slate-700 rounded-xl font-semibold hover:bg-slate-50 transition"
                >
                  Zrušit
                </button>
                <button
                  onClick={handleStep3}
                  disabled={pin.length !== 4 || deleting}
                  className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-500 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Smazat
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
