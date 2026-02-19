// src/components/dashboard/WidgetLibrary.tsx
// VIKRR — Asset Shield — "Knihovna" panel — hidden widgets that can be restored

import { LayoutGrid } from 'lucide-react';
import type { WidgetInstance } from '../../types/dashboard';
import { getWidgetDef } from '../../config/widgetRegistry';

interface WidgetLibraryProps {
  widgets: WidgetInstance[];
  onRestore: (widgetId: string) => void;
}

export default function WidgetLibrary({ widgets, onRestore }: WidgetLibraryProps) {
  const hiddenWidgets = widgets
    .filter(w => !w.visible)
    .map(w => ({ instance: w, def: getWidgetDef(w.widgetId) }))
    .filter(w => w.def != null);

  return (
    <div className="mt-5">
      <div className="text-[11px] text-slate-500 uppercase tracking-wider font-bold mb-2 flex items-center gap-2">
        <LayoutGrid className="w-3.5 h-3.5" />
        Knihovna ({hiddenWidgets.length})
      </div>
      {hiddenWidgets.length === 0 ? (
        <div className="text-sm text-slate-600 text-center py-4 bg-white/[0.02] rounded-xl border border-dashed border-slate-700/50">
          Všechny dlaždice jsou zobrazeny
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2.5">
          {hiddenWidgets.map(({ instance, def }) => (
            <button
              key={instance.widgetId}
              onClick={() => onRestore(instance.widgetId)}
              className="p-3.5 rounded-2xl border-2 border-dashed border-slate-700/50 text-center opacity-50 hover:opacity-100 hover:border-orange-500/40 transition min-h-[90px] flex flex-col items-center justify-center gap-1"
            >
              <span className="text-2xl">{def!.icon}</span>
              <div className="text-[11px] text-slate-400 font-medium">{def!.label}</div>
              <div className="text-[10px] text-emerald-400 font-bold">+ Přidat</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
