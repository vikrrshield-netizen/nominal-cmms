// src/components/ui/BottomSheet.tsx
// NOMINAL CMMS — Unified Modal/Sheet component
// Standardizovaný layout pro všechny formuláře

import { Loader2, X } from 'lucide-react';
import type { ReactNode } from 'react';

interface BottomSheetProps {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
}

export default function BottomSheet({ title, isOpen, onClose, children }: BottomSheetProps) {
  if (!isOpen) return null;

  return (
    <>
      <style>{`
        @keyframes nominalScaleIn {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
      <div
        className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-md flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg max-h-[85vh] bg-slate-800 rounded-3xl overflow-y-auto shadow-2xl border border-white/10"
          style={{ animation: 'nominalScaleIn 0.2s ease-out' }}
        >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pb-4 pt-5 border-b border-white/10">
          <h2 className="text-xl font-bold text-white">{title}</h2>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition min-w-[36px] min-h-[36px]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          {children}
        </div>
      </div>
    </div>
    </>
  );
}

// ═══════════════════════════════════════════════════
// FORM HELPERS — používat uvnitř BottomSheet
// ═══════════════════════════════════════════════════

const INPUT_BASE_CLASS = `
  w-full px-4 py-3 rounded-xl
  bg-white/5 border border-white/10
  text-white text-[15px] placeholder-slate-600
  focus:outline-none focus:border-orange-500/50 focus:bg-white/8
  transition min-h-[48px]
`;

interface FormFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'number' | 'date' | 'select' | 'textarea' | 'chips';
  placeholder?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
  autoFocus?: boolean;
}

export function FormField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  options,
  required,
  autoFocus,
}: FormFieldProps) {
  return (
    <div className="mb-4">
      <label className="block text-sm text-slate-400 font-medium mb-1.5">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {type === 'select' ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={INPUT_BASE_CLASS}
          style={{ appearance: 'auto' }}
        >
          <option value="" className="bg-slate-800">— vybrat —</option>
          {options?.map((o) => (
            <option key={o.value} value={o.value} className="bg-slate-800">
              {o.label}
            </option>
          ))}
        </select>
      ) : type === 'textarea' ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          autoFocus={autoFocus}
          className={INPUT_BASE_CLASS + ' resize-none'}
        />
      ) : type === 'chips' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {options?.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className={`py-2.5 rounded-xl text-sm font-semibold border transition min-h-[44px] ${
                value === o.value
                  ? 'bg-orange-500/20 border-orange-500/40 text-orange-400'
                  : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      ) : (
        <input
          type={type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className={INPUT_BASE_CLASS}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// FORM FOOTER — standardizovaný Cancel/Save
// ═══════════════════════════════════════════════════

interface FormFooterProps {
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  color?: 'orange' | 'red' | 'green' | 'blue';
}

export function FormFooter({
  onCancel,
  onSubmit,
  submitLabel = 'Uložit',
  cancelLabel = 'Zrušit',
  loading,
  disabled,
  color = 'orange',
}: FormFooterProps) {
  const colorClass =
    color === 'red' ? 'from-red-500 to-red-600' :
    color === 'green' ? 'from-emerald-500 to-emerald-600' :
    color === 'blue' ? 'from-blue-500 to-blue-600' :
    'from-orange-500 to-amber-500';

  return (
    <div className="flex items-center gap-3 pt-4 mt-2 border-t border-white/10">
      <button
        type="button"
        onClick={onCancel}
        className="flex-1 py-3 rounded-2xl bg-white/5 border border-white/10 text-slate-400 font-semibold text-base hover:bg-white/10 transition active:scale-[0.98] min-h-[48px]"
      >
        {cancelLabel}
      </button>
      <button
        type="button"
        onClick={onSubmit}
        disabled={loading || disabled}
        className={`flex-[2] py-3 rounded-2xl bg-gradient-to-r ${colorClass} text-white font-bold text-base active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2 min-h-[48px]`}
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {loading ? 'Ukládám...' : submitLabel}
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// SUBMIT BUTTON (legacy — single full-width button)
// ═══════════════════════════════════════════════════

interface SubmitButtonProps {
  label: string;
  onClick: () => void;
  loading?: boolean;
  color?: 'orange' | 'red' | 'green';
}

export function SubmitButton({ label, onClick, loading, color = 'orange' }: SubmitButtonProps) {
  const colorClass =
    color === 'red' ? 'from-red-500 to-red-600' :
    color === 'green' ? 'from-emerald-500 to-emerald-600' :
    'from-orange-500 to-amber-500';

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`
        w-full py-3.5 rounded-2xl mt-2
        bg-gradient-to-r ${colorClass}
        text-white font-bold text-base
        active:scale-[0.98] transition-all
        disabled:opacity-50 flex items-center justify-center gap-2 min-h-[48px]
      `}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {loading ? 'Ukládám...' : label}
    </button>
  );
}
