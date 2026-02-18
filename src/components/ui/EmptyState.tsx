// src/components/ui/EmptyState.tsx
// VIKRR — Asset Shield — Empty State
// Nikdy prázdná obrazovka — vždy nabídne akci

import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({ icon, title, subtitle, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="py-12 px-6 flex flex-col items-center text-center gap-4">
      <div className="text-slate-700">{icon}</div>
      <div>
        <h3 className="text-lg font-semibold text-slate-500">{title}</h3>
        {subtitle && <p className="text-sm text-slate-600 mt-2">{subtitle}</p>}
      </div>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="
            flex items-center gap-2 px-6 py-3 rounded-xl
            bg-orange-500/15 border border-orange-500/30
            text-orange-400 font-semibold text-[15px]
            hover:bg-orange-500/25 active:scale-95 transition-all
          "
        >
          <Plus className="w-5 h-5" />
          {actionLabel}
        </button>
      )}
    </div>
  );
}
