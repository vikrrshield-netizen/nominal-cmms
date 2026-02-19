// src/components/dashboard/WidgetShell.tsx
// VIKRR — Asset Shield — Wrapper for full-width widget blocks (collapse/expand)

import { ChevronDown, ChevronUp, X } from 'lucide-react';
import type { WidgetDefinition } from '../../types/dashboard';

interface WidgetShellProps {
  definition: WidgetDefinition;
  collapsed: boolean;
  isEditing: boolean;
  onToggleCollapse: () => void;
  onRemove: () => void;
  children: React.ReactNode;
}

export default function WidgetShell({
  definition,
  collapsed,
  isEditing,
  onToggleCollapse,
  onRemove,
  children,
}: WidgetShellProps) {
  return (
    <div className="relative">
      {/* Edit mode: remove button */}
      {isEditing && (
        <button
          onClick={onRemove}
          className="absolute -top-2 -right-2 z-10 w-6 h-6 bg-slate-800 border-2 border-slate-600 rounded-full flex items-center justify-center hover:bg-red-600 hover:border-red-500 transition"
        >
          <X className="w-3.5 h-3.5 text-white" />
        </button>
      )}

      {/* Collapsible header */}
      <button
        onClick={onToggleCollapse}
        className="flex items-center gap-2 mb-1 text-[10px] text-slate-600 hover:text-slate-400 transition uppercase tracking-wider font-bold"
      >
        <span>{definition.icon}</span>
        <span>{definition.label}</span>
        {collapsed ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
      </button>

      {/* Content */}
      {!collapsed && children}
    </div>
  );
}
