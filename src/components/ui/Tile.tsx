// src/components/ui/Tile.tsx
// VIKRR — Asset Shield — Unified Tile Component (Design System v3)
// Používá se VŠUDE: Dashboard, Tasks, MapPage, Revize, Admin

import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

export type TileStatus = 'operational' | 'maintenance' | 'breakdown' | 'idle' | 'offline';

interface TileProps {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  status?: TileStatus;
  badge?: string;
  badgeColor?: string;
  rightContent?: ReactNode;
  onClick?: () => void;
  compact?: boolean;
  gradient?: string;
}

const STATUS_CONFIG: Record<TileStatus, { dot: string; border: string; iconBg: string; iconColor: string }> = {
  operational: { dot: 'bg-emerald-500', border: 'border-emerald-200', iconBg: 'bg-emerald-50', iconColor: 'text-emerald-700' },
  maintenance: { dot: 'bg-amber-500 animate-pulse', border: 'border-amber-200', iconBg: 'bg-amber-50', iconColor: 'text-amber-700' },
  breakdown:   { dot: 'bg-red-500 animate-pulse', border: 'border-red-200', iconBg: 'bg-red-50', iconColor: 'text-red-600' },
  idle:        { dot: 'bg-slate-400', border: 'border-slate-200', iconBg: 'bg-slate-100', iconColor: 'text-slate-500' },
  offline:     { dot: 'bg-slate-400', border: 'border-slate-200', iconBg: 'bg-slate-100', iconColor: 'text-slate-400' },
};

export default function Tile({
  icon,
  title,
  subtitle,
  status,
  badge,
  badgeColor,
  rightContent,
  onClick,
  compact = false,
  gradient,
}: TileProps) {
  const sc = status ? STATUS_CONFIG[status] : null;
  const py = compact ? 'py-2.5 px-3' : 'py-3.5 px-4';
  const borderClass = sc ? sc.border : 'border-slate-200';

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`
        w-full flex items-center gap-3 ${py}
        bg-white rounded-2xl border ${borderClass} shadow-sm
        ${onClick ? 'hover:bg-slate-50 active:scale-[0.98] cursor-pointer' : 'cursor-default'}
        transition-all text-left
      `}
      style={gradient ? { background: gradient } : undefined}
    >
      {/* Icon */}
      {icon && (
        <div className={`
          ${compact ? 'w-10 h-10' : 'w-11 h-11'} rounded-xl flex items-center justify-center flex-shrink-0
          ${sc ? sc.iconBg : 'bg-slate-100'}
          ${sc ? sc.iconColor : 'text-slate-500'}
        `}>
          {icon}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`font-semibold text-slate-900 truncate ${compact ? 'text-sm' : 'text-[15px]'}`}>
            {title}
          </span>
          {sc && <div className={`w-2 h-2 rounded-full flex-shrink-0 ${sc.dot}`} />}
        </div>
        {subtitle && (
          <p className={`text-slate-500 truncate mt-0.5 ${compact ? 'text-xs' : 'text-[13px]'}`}>
            {subtitle}
          </p>
        )}
      </div>

      {/* Badge */}
      {badge && (
        <span className={`
          px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0
          ${badgeColor === 'red' ? 'bg-red-50 text-red-600' :
            badgeColor === 'green' ? 'bg-emerald-50 text-emerald-700' :
            badgeColor === 'blue' ? 'bg-blue-50 text-blue-700' :
            'bg-amber-50 text-amber-700'}
        `}>
          {badge}
        </span>
      )}

      {/* Right content */}
      {rightContent}

      {/* Chevron */}
      {onClick && <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />}
    </button>
  );
}
