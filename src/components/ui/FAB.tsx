// src/components/ui/FAB.tsx
// VIKRR — Asset Shield — Floating Action Button
// Hlavní akce na každé stránce (Nahlásit poruchu, Přidat úkol, atd.)

import type { ReactNode } from 'react';

interface FABProps {
  icon: ReactNode;
  label?: string;
  color?: 'orange' | 'red' | 'green' | 'blue';
  onClick: () => void;
}

const COLORS = {
  orange: 'bg-orange-500 shadow-orange-500/40',
  red:    'bg-red-500 shadow-red-500/40',
  green:  'bg-emerald-500 shadow-emerald-500/40',
  blue:   'bg-blue-500 shadow-blue-500/40',
};

export default function FAB({ icon, label, color = 'orange', onClick }: FABProps) {
  return (
    <button
      onClick={onClick}
      className={`
        fixed bottom-6 right-6 z-50
        flex items-center gap-2
        ${label ? 'px-6 py-3.5 rounded-full' : 'w-14 h-14 rounded-full justify-center'}
        ${COLORS[color]}
        text-white font-semibold text-[15px]
        shadow-2xl active:scale-95 transition-all
      `}
    >
      {icon}
      {label && <span>{label}</span>}
    </button>
  );
}
