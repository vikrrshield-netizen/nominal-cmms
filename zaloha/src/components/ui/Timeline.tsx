// src/components/ui/Timeline.tsx
// NOMINAL CMMS — Timeline pro historii zásahů

import { UserBadge } from './index';

export interface TimelineEntry {
  id: string;
  type: 'preventive' | 'corrective' | 'inspection' | 'incident' | 'note';
  title: string;
  description?: string;
  userId: string;
  userName: string;
  userColor: string;
  createdAt: Date | string;
  duration?: number;
}

interface TimelineProps {
  entries: TimelineEntry[];
  maxItems?: number;
  onAddClick?: () => void;
  canAdd?: boolean;
}

const TYPE_CONFIG: Record<TimelineEntry['type'], { label: string; borderColor: string; bgColor: string }> = {
  preventive: { label: 'Preventivní', borderColor: 'border-emerald-500', bgColor: 'bg-emerald-50' },
  corrective: { label: 'Oprava', borderColor: 'border-blue-500', bgColor: 'bg-blue-50' },
  inspection: { label: 'Kontrola', borderColor: 'border-amber-500', bgColor: 'bg-amber-50' },
  incident: { label: 'Incident', borderColor: 'border-red-500', bgColor: 'bg-red-50' },
  note: { label: 'Poznámka', borderColor: 'border-slate-400', bgColor: 'bg-slate-50' },
};

export function Timeline({ entries, maxItems, onAddClick, canAdd = false }: TimelineProps) {
  const displayEntries = maxItems ? entries.slice(0, maxItems) : entries;
  const hasMore = maxItems && entries.length > maxItems;

  const formatDate = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  if (entries.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-slate-400 mb-4">Žádné záznamy</p>
        {canAdd && onAddClick && (
          <button onClick={onAddClick} className="text-blue-600 font-medium hover:underline">
            + Přidat první záznam
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gradient-to-b from-slate-200 via-slate-200 to-transparent" />
      <div className="space-y-4">
        {displayEntries.map((entry, index) => {
          const config = TYPE_CONFIG[entry.type];
          const isFirst = index === 0;
          return (
            <div key={entry.id} className="relative flex items-start gap-4">
              <div className="relative z-10 flex-shrink-0">
                <UserBadge name={entry.userName} color={entry.userColor} size="md" />
              </div>
              <div className={`flex-1 ${config.bgColor} p-4 rounded-xl border-l-4 ${config.borderColor} ${isFirst ? 'shadow-md' : 'shadow-sm'}`}>
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <span className={`text-xs font-bold uppercase tracking-wide ${config.borderColor.replace('border-', 'text-')}`}>
                      {config.label}
                    </span>
                    <h4 className="font-bold text-slate-800">{entry.title}</h4>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mb-2">
                  <span>{formatDate(entry.createdAt)}</span>
                  <span>•</span>
                  <span style={{ color: entry.userColor }} className="font-medium">{entry.userName}</span>
                  {entry.duration && (<><span>•</span><span>⏱️ {entry.duration} min</span></>)}
                </div>
                {entry.description && <p className="text-sm text-slate-600">{entry.description}</p>}
              </div>
            </div>
          );
        })}
      </div>
      {hasMore && (
        <div className="mt-4 text-center">
          <button className="text-blue-600 text-sm font-medium hover:underline">
            Zobrazit dalších {entries.length - (maxItems || 0)} záznamů
          </button>
        </div>
      )}
      {canAdd && onAddClick && (
        <button onClick={onAddClick} className="mt-4 w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-400 font-medium hover:border-slate-400 hover:text-slate-500 transition-colors flex items-center justify-center gap-2">
          <span className="text-lg">+</span><span>Přidat zápis</span>
        </button>
      )}
    </div>
  );
}

export default Timeline;
