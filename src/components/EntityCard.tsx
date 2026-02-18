// src/components/EntityCard.tsx
// VIKRR — Asset Shield — Univerzální Entity karta (Matryoshka architektura)
// Touch-friendly, dark glassmorphism theme

import { useMemo } from 'react';
import {
  Car, Wrench, Building2, Box, Users, Clock,
  ChevronRight,
} from 'lucide-react';

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════

export interface BlueprintField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'photo' | 'boolean';
  required: boolean;
  options?: string[];
  unit?: string;
  alert?: {
    warningDays?: number;
    criticalDays?: number;
    maxValue?: number;
  };
}

export interface Blueprint {
  id?: string;
  type: string;
  label: string;
  icon: string;
  fields: BlueprintField[];
  color: string;
}

export interface Entity {
  id: string;
  parentId: string | null;
  type: string;
  blueprintId: string;
  name: string;
  code: string;
  status: 'operational' | 'warning' | 'critical' | 'inactive';
  data: Record<string, any>;
  tags: string[];
  createdAt: any;
  updatedAt: any;
  createdBy: string;
  isDeleted: boolean;
}

export interface EntityLogEntry {
  id: string;
  entityId: string;
  userId: string;
  userInitials: string;
  type: string;
  text: string;
  data?: Record<string, any>;
  createdAt: any;
}

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  Car, Wrench, Building2, Box, Users,
};

function getIcon(iconName: string) {
  return ICON_MAP[iconName] || Car;
}

type SemaphoreColor = 'green' | 'yellow' | 'red' | 'gray';

export function getFieldSemaphore(
  field: BlueprintField,
  value: any
): SemaphoreColor {
  if (!field.alert || value === undefined || value === null || value === '') return 'gray';

  // Date fields
  if (field.type === 'date' && field.alert.warningDays != null) {
    const dateStr = typeof value === 'string' ? value : '';
    if (!dateStr) return 'gray';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return 'gray';
    const daysLeft = Math.round((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysLeft <= (field.alert.criticalDays || 0)) return 'red';
    if (daysLeft <= (field.alert.warningDays || 30)) return 'yellow';
    return 'green';
  }

  // Number fields
  if (field.type === 'number' && field.alert.maxValue != null) {
    const num = Number(value);
    if (isNaN(num)) return 'gray';
    if (num >= field.alert.maxValue) return 'red';
    if (num >= field.alert.maxValue * 0.8) return 'yellow';
    return 'green';
  }

  return 'gray';
}

const SEMAPHORE_COLORS: Record<SemaphoreColor, string> = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-500',
  red: 'bg-red-500',
  gray: 'bg-slate-600',
};

const SEMAPHORE_TEXT: Record<SemaphoreColor, string> = {
  green: 'text-emerald-400',
  yellow: 'text-amber-400',
  red: 'text-red-400',
  gray: 'text-slate-400',
};

function SemaphoreDot({ color, size = 'sm' }: { color: SemaphoreColor; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'w-2.5 h-2.5', md: 'w-3.5 h-3.5', lg: 'w-5 h-5' };
  return <span className={`inline-block rounded-full ${SEMAPHORE_COLORS[color]} ${sizes[size]}`} />;
}

function daysUntilDate(dateStr: string): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.round((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function formatDateCZ(dateStr: string): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('cs-CZ');
}

function formatLogTime(ts: any): string {
  if (!ts) return '';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  return date.toLocaleDateString('cs-CZ') + ' ' + date.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
}

// ═══════════════════════════════════════════
// ENTITY STATUS
// ═══════════════════════════════════════════

export function computeEntityStatus(entity: Entity, blueprint: Blueprint | null): SemaphoreColor {
  if (!blueprint) return 'gray';
  let worst: SemaphoreColor = 'green';
  for (const field of blueprint.fields) {
    if (!field.alert) continue;
    const val = entity.data?.[field.key];
    const sem = getFieldSemaphore(field, val);
    if (sem === 'red') return 'red';
    if (sem === 'yellow') worst = 'yellow';
  }
  return worst;
}

// ═══════════════════════════════════════════
// COMPACT CARD (for grid)
// ═══════════════════════════════════════════

interface EntityCardCompactProps {
  entity: Entity;
  blueprint: Blueprint | null;
  onClick?: () => void;
}

export function EntityCardCompact({ entity, blueprint, onClick }: EntityCardCompactProps) {
  const overallStatus = useMemo(
    () => computeEntityStatus(entity, blueprint),
    [entity, blueprint]
  );

  // Klíčová pole k zobrazení (date/number s alert)
  const keyFields = useMemo(() => {
    if (!blueprint) return [];
    return blueprint.fields
      .filter((f) => f.alert && entity.data?.[f.key])
      .slice(0, 3)
      .map((f) => ({
        ...f,
        value: entity.data?.[f.key],
        semaphore: getFieldSemaphore(f, entity.data?.[f.key]),
      }));
  }, [blueprint, entity.data]);

  const IconComp = blueprint ? getIcon(blueprint.icon) : Car;

  return (
    <button
      onClick={onClick}
      className="w-full bg-slate-800/60 backdrop-blur-sm rounded-2xl p-4 border border-slate-700/50 text-left hover:bg-slate-700/60 transition-all active:scale-[0.98] min-h-[120px]"
    >
      <div className="flex items-start gap-3">
        {/* Icon + status */}
        <div className="relative flex-shrink-0">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: (blueprint?.color || '#3b82f6') + '30' }}
          >
            <IconComp className="w-6 h-6" style={{ color: blueprint?.color || '#3b82f6' }} />
          </div>
          <div className="absolute -bottom-1 -right-1">
            <SemaphoreDot color={overallStatus} size="md" />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-bold text-white truncate">{entity.name}</h3>
          </div>
          {entity.code && (
            <div className="text-xs text-slate-500 font-mono mb-2">{entity.code}</div>
          )}

          {/* Key fields with semaphore */}
          <div className="space-y-1">
            {keyFields.map((f) => (
              <div key={f.key} className="flex items-center gap-2 text-xs">
                <SemaphoreDot color={f.semaphore} />
                <span className="text-slate-400">{f.label}:</span>
                <span className={`font-medium ${SEMAPHORE_TEXT[f.semaphore]}`}>
                  {f.type === 'date'
                    ? (() => {
                        const days = daysUntilDate(f.value);
                        return days !== null
                          ? days < 0
                            ? `${Math.abs(days)}d po!`
                            : `za ${days}d`
                          : formatDateCZ(f.value);
                      })()
                    : `${f.value}${f.unit ? ` ${f.unit}` : ''}`
                  }
                </span>
              </div>
            ))}
          </div>

          {/* Assigned / tags */}
          {entity.data?.assigned_to && entity.data.assigned_to !== 'Pool (sdílený)' && (
            <div className="mt-2 text-xs text-blue-400">
              → {entity.data.assigned_to}
            </div>
          )}
        </div>

        <ChevronRight className="w-5 h-5 text-slate-600 flex-shrink-0 self-center" />
      </div>
    </button>
  );
}

// ═══════════════════════════════════════════
// FULL DETAIL CARD
// ═══════════════════════════════════════════

interface EntityCardFullProps {
  entity: Entity;
  blueprint: Blueprint | null;
  logs?: EntityLogEntry[];
  breadcrumbs?: { label: string; onClick?: () => void }[];
  children?: Entity[];
  onAddLog?: () => void;
}

export function EntityCardFull({ entity, blueprint, logs, breadcrumbs, children, onAddLog }: EntityCardFullProps) {
  const IconComp = blueprint ? getIcon(blueprint.icon) : Car;
  const overallStatus = useMemo(
    () => computeEntityStatus(entity, blueprint),
    [entity, blueprint]
  );

  return (
    <div className="space-y-4">
      {/* Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <div className="flex items-center text-sm text-slate-500 flex-wrap gap-1">
          {breadcrumbs.map((bc, i) => (
            <span key={i} className="flex items-center">
              {i > 0 && <ChevronRight className="w-4 h-4 mx-1 text-slate-600" />}
              {bc.onClick ? (
                <button onClick={bc.onClick} className="hover:text-blue-400 transition">
                  {bc.label}
                </button>
              ) : (
                <span className="text-white font-medium">{bc.label}</span>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-4">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: (blueprint?.color || '#3b82f6') + '30' }}
        >
          <IconComp className="w-8 h-8" style={{ color: blueprint?.color || '#3b82f6' }} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-white">{entity.name}</h2>
            <SemaphoreDot color={overallStatus} size="lg" />
          </div>
          {entity.code && (
            <div className="text-sm text-slate-500 font-mono">{entity.code}</div>
          )}
          {entity.data?.assigned_to && (
            <div className="text-sm text-blue-400 mt-1">→ {entity.data.assigned_to}</div>
          )}
        </div>
      </div>

      {/* Blueprint fields */}
      {blueprint && (
        <div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/30">
          <h3 className="text-xs text-slate-500 uppercase font-bold mb-3">Rodný list</h3>
          <div className="grid grid-cols-2 gap-3">
            {blueprint.fields
              .filter((f) => f.type !== 'photo' && entity.data?.[f.key] !== undefined && entity.data?.[f.key] !== '')
              .map((f) => {
                const val = entity.data?.[f.key];
                const sem = getFieldSemaphore(f, val);
                const daysLeft = f.type === 'date' ? daysUntilDate(val) : null;

                return (
                  <div key={f.key} className="bg-slate-700/30 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      {sem !== 'gray' && <SemaphoreDot color={sem} />}
                      <span className="text-xs text-slate-500">{f.label}</span>
                    </div>
                    <div className={`text-sm font-medium ${SEMAPHORE_TEXT[sem] || 'text-white'}`}>
                      {f.type === 'date'
                        ? (
                          <>
                            {formatDateCZ(val)}
                            {daysLeft !== null && (
                              <span className="ml-1 text-xs opacity-75">
                                ({daysLeft < 0 ? `${Math.abs(daysLeft)}d po!` : `za ${daysLeft}d`})
                              </span>
                            )}
                          </>
                        )
                        : f.type === 'number' && f.unit
                          ? `${Number(val).toLocaleString('cs-CZ')} ${f.unit}`
                          : String(val)
                      }
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Photo */}
      {entity.data?.photo_url && (
        <div className="rounded-2xl overflow-hidden border border-slate-700/50">
          <img src={entity.data.photo_url} alt={entity.name} className="w-full h-48 object-cover" />
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        {onAddLog && (
          <button
            onClick={onAddLog}
            className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-500 transition active:scale-[0.98] min-h-[48px]"
          >
            <Clock className="w-5 h-5" />
            Zapsat
          </button>
        )}
      </div>

      {/* Children entities */}
      {children && children.length > 0 && (
        <div>
          <h3 className="text-xs text-slate-500 uppercase font-bold mb-3">Podřízené entity</h3>
          <div className="space-y-2">
            {children.map((child) => (
              <div key={child.id} className="bg-slate-700/30 rounded-xl p-3 flex items-center gap-3">
                <Box className="w-5 h-5 text-slate-400" />
                <span className="text-sm text-white font-medium">{child.name}</span>
                {child.code && <span className="text-xs text-slate-500 font-mono">{child.code}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Logs (historie) */}
      {logs && logs.length > 0 && (
        <div>
          <h3 className="text-xs text-slate-500 uppercase font-bold mb-3">
            Historie ({logs.length})
          </h3>
          <div className="space-y-2">
            {logs.map((log) => (
              <div key={log.id} className="bg-slate-700/30 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-7 h-7 rounded-full bg-slate-600 flex items-center justify-center text-[10px] text-white font-bold flex-shrink-0">
                    {log.userInitials}
                  </div>
                  <span className="text-xs text-slate-500">
                    {formatLogTime(log.createdAt)}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    log.type === 'handover' ? 'bg-blue-500/20 text-blue-400' :
                    log.type === 'maintenance' ? 'bg-amber-500/20 text-amber-400' :
                    log.type === 'inspection' ? 'bg-emerald-500/20 text-emerald-400' :
                    'bg-slate-500/20 text-slate-400'
                  }`}>
                    {log.type === 'handover' ? 'Předání' :
                     log.type === 'maintenance' ? 'Servis' :
                     log.type === 'inspection' ? 'Kontrola' :
                     log.type === 'note' ? 'Poznámka' :
                     log.type}
                  </span>
                </div>
                <div className="text-sm text-slate-300 ml-9">{log.text}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Default export = compact variant
export default EntityCardCompact;
