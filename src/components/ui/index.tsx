// src/components/ui/index.tsx
// VIKRR — Asset Shield — Sdílené UI komponenty

import { type ReactNode } from 'react';
import { ChevronRight, Clock, CheckCircle2, AlertTriangle, FileWarning } from 'lucide-react';
import { ROLE_META, type UserRole } from '../../types/user';

// ═══════════════════════════════════════════════════════════════════
// USER BADGE
// ═══════════════════════════════════════════════════════════════════

interface UserBadgeProps {
  name: string;
  color: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function UserBadge({ name, color, size = 'md', className = '' }: UserBadgeProps) {
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const sizeClasses = { sm: 'w-6 h-6 text-[10px]', md: 'w-10 h-10 text-sm', lg: 'w-12 h-12 text-base' };
  return (
    <div 
      className={`flex items-center justify-center rounded-full text-white font-bold shadow-md ${sizeClasses[size]} ${className}`}
      style={{ backgroundColor: color }}
      title={name}
    >
      {initials}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ROLE BADGE
// ═══════════════════════════════════════════════════════════════════

interface RoleBadgeProps {
  role: UserRole;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

export function RoleBadge({ role, showLabel = true, size = 'md' }: RoleBadgeProps) {
  const meta = ROLE_META[role];
  if (!meta) return null;
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium ${meta.color} text-white ${sizeClasses}`}>
      <span>{meta.icon}</span>
      {showLabel && <span>{meta.label}</span>}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════
// STATUS BADGE
// ═══════════════════════════════════════════════════════════════════

type StatusType = 'OK' | 'WARNING' | 'CRITICAL' | 'INFO';

interface StatusBadgeProps {
  status: StatusType;
  label?: string;
  showIcon?: boolean;
  pulse?: boolean;
}

const STATUS_CONFIG: Record<StatusType, { bg: string; text: string; icon: ReactNode }> = {
  OK: { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: <CheckCircle2 className="w-4 h-4" /> },
  WARNING: { bg: 'bg-amber-100', text: 'text-amber-700', icon: <Clock className="w-4 h-4" /> },
  CRITICAL: { bg: 'bg-red-100', text: 'text-red-700', icon: <FileWarning className="w-4 h-4" /> },
  INFO: { bg: 'bg-blue-100', text: 'text-blue-700', icon: <AlertTriangle className="w-4 h-4" /> },
};

export function StatusBadge({ status, label, showIcon = true, pulse = false }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${config.bg} ${config.text} ${pulse ? 'animate-pulse' : ''}`}>
      {showIcon && config.icon}
      {label || status}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════
// STATUS DOT
// ═══════════════════════════════════════════════════════════════════

interface StatusDotProps {
  status: 'operational' | 'maintenance' | 'broken' | 'stopped' | 'OK' | 'WARNING' | 'CRITICAL';
  size?: 'sm' | 'md' | 'lg';
  pulse?: boolean;
}

export function StatusDot({ status, size = 'md', pulse = false }: StatusDotProps) {
  const colors: Record<string, string> = {
    operational: 'bg-emerald-500', OK: 'bg-emerald-500',
    maintenance: 'bg-amber-500', WARNING: 'bg-amber-500',
    broken: 'bg-red-500', CRITICAL: 'bg-red-500',
    stopped: 'bg-slate-400',
  };
  const sizes = { sm: 'w-2 h-2', md: 'w-3 h-3', lg: 'w-4 h-4' };
  return <span className={`inline-block rounded-full ${colors[status] || 'bg-slate-400'} ${sizes[size]} ${pulse ? 'animate-pulse' : ''}`} />;
}

// ═══════════════════════════════════════════════════════════════════
// MODULE CARD
// ═══════════════════════════════════════════════════════════════════

interface ModuleCardProps {
  title: string;
  icon: ReactNode;
  color: string;
  bgColor: string;
  onClick: () => void;
  badge?: number | string;
  disabled?: boolean;
}

export function ModuleCard({ title, icon, color, bgColor, onClick, badge, disabled }: ModuleCardProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative flex flex-col items-center justify-center p-6 rounded-2xl border border-slate-200 shadow-sm transition-all group ${bgColor} ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-md hover:border-slate-300 active:scale-[0.98]'}`}
    >
      {badge !== undefined && (
        <span className="absolute top-3 right-3 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
          {badge}
        </span>
      )}
      <div className={`p-3 rounded-xl bg-white shadow-sm mb-3 group-hover:scale-110 transition-transform ${color}`}>
        {icon}
      </div>
      <span className="font-semibold text-slate-800 text-sm text-center">{title}</span>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════
// KIOSK BUTTON
// ═══════════════════════════════════════════════════════════════════

interface KioskButtonProps {
  title: string;
  subtitle?: string;
  icon: ReactNode;
  color: string;
  onClick: () => void;
}

export function KioskButton({ title, subtitle, icon, color, onClick }: KioskButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`${color} hover:opacity-90 text-white rounded-3xl p-8 md:p-12 flex flex-col items-center justify-center transition-all shadow-2xl active:scale-95`}
    >
      <div className="mb-4 md:mb-6">{icon}</div>
      <span className="text-xl md:text-3xl font-bold uppercase tracking-wider text-center">{title}</span>
      {subtitle && <span className="text-sm md:text-base opacity-80 mt-2">{subtitle}</span>}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════
// BREADCRUMB
// ═══════════════════════════════════════════════════════════════════

interface BreadcrumbProps {
  items: { label: string; onClick?: () => void }[];
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <div className="flex items-center text-sm text-slate-500 mb-6">
      {items.map((item, index) => (
        <span key={index} className="flex items-center">
          {index > 0 && <ChevronRight className="w-4 h-4 mx-2 text-slate-300" />}
          {item.onClick ? (
            <button onClick={item.onClick} className="hover:text-blue-600 font-medium">{item.label}</button>
          ) : (
            <span className="text-slate-800 font-bold">{item.label}</span>
          )}
        </span>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// EMPTY STATE
// ═══════════════════════════════════════════════════════════════════

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="text-slate-300 mb-4">{icon}</div>
      <h3 className="text-lg font-bold text-slate-800 mb-2">{title}</h3>
      {description && <p className="text-slate-500 mb-4 max-w-md">{description}</p>}
      {action && (
        <button onClick={action.onClick} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition">
          {action.label}
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// LOADING SPINNER
// ═══════════════════════════════════════════════════════════════════

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
}

export function LoadingSpinner({ size = 'md', text }: LoadingSpinnerProps) {
  const sizes = { sm: 'w-6 h-6 border-2', md: 'w-10 h-10 border-4', lg: 'w-16 h-16 border-4' };
  return (
    <div className="flex flex-col items-center justify-center py-8">
      <div className={`${sizes[size]} border-blue-500 border-t-transparent rounded-full animate-spin`} />
      {text && <p className="text-slate-500 mt-3 text-sm">{text}</p>}
    </div>
  );
}
