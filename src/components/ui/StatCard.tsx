// src/components/ui/StatCard.tsx
// NOMINAL CMMS — Stat Card pro Dashboard

import type { ReactNode } from 'react';

interface StatCardProps {
  icon: ReactNode;
  value: string | number;
  label: string;
  sublabel?: string;
  color: string;       // hex color: '#f97316'
  onClick?: () => void;
}

export default function StatCard({ icon, value, label, sublabel, color, onClick }: StatCardProps) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`
        flex-1 p-4 rounded-2xl text-left min-w-0
        border transition-all
        ${onClick ? 'hover:scale-[1.02] active:scale-[0.98] cursor-pointer' : 'cursor-default'}
      `}
      style={{
        background: `linear-gradient(135deg, ${color}12, ${color}06)`,
        borderColor: `${color}20`,
      }}
    >
      <div style={{ color }} className="mb-2">{icon}</div>
      <div className="text-[28px] font-bold text-white leading-none">{value}</div>
      <div className="text-[13px] text-slate-400 mt-1">{label}</div>
      {sublabel && <div className="text-[11px] text-slate-600 mt-0.5">{sublabel}</div>}
    </button>
  );
}
