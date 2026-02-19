// src/config/widgetRegistry.ts
// VIKRR — Asset Shield — Widget Registry (definitions + defaults per role)

import type { UserRole } from '../types/user';
import type { WidgetDefinition, WidgetInstance, WidgetSize } from '../types/dashboard';

// ═══════════════════════════════════════════════════════
// WIDGET DEFINITIONS — all available widgets
// ═══════════════════════════════════════════════════════

export const WIDGET_DEFINITIONS: WidgetDefinition[] = [
  // ── Tile widgets (icon grid) ──
  { id: 'fault',       type: 'action', label: 'Nahlásit poruchu', icon: '🚨', gradient: 'from-red-500 to-rose-600',       defaultSize: '1x1', component: 'TileWidget' },
  { id: 'tasks',       type: 'tile',   label: 'Úkoly',            icon: '📋', gradient: 'from-orange-500 to-amber-600',   defaultSize: '1x1', component: 'TileWidget' },
  { id: 'map',         type: 'tile',   label: 'Mapa areálu',      icon: '🗺️', gradient: 'from-blue-500 to-indigo-600',    defaultSize: '1x1', component: 'TileWidget' },
  { id: 'revisions',   type: 'tile',   label: 'Revize',           icon: '🔍', gradient: 'from-purple-500 to-violet-600',  defaultSize: '1x1', component: 'TileWidget' },
  { id: 'inventory',   type: 'tile',   label: 'Sklad ND',         icon: '📦', gradient: 'from-emerald-500 to-teal-600',   defaultSize: '1x1', component: 'TileWidget' },
  { id: 'waste',       type: 'action', label: 'Odpady',           icon: '♻️', gradient: 'from-yellow-500 to-amber-600',   defaultSize: '1x1', component: 'TileWidget' },
  { id: 'fleet',       type: 'tile',   label: 'Vozidla',          icon: '🚗', gradient: 'from-cyan-500 to-blue-600',      defaultSize: '1x1', component: 'TileWidget' },
  { id: 'louparna',    type: 'tile',   label: 'Loupárna',         icon: '🌾', gradient: 'from-lime-500 to-green-600',     defaultSize: '1x1', component: 'TileWidget' },
  { id: 'inspections', type: 'tile',   label: 'Kontroly',         icon: '✅', gradient: 'from-teal-500 to-emerald-600',   defaultSize: '1x1', component: 'TileWidget' },
  { id: 'calendar',    type: 'tile',   label: 'Kalendář',         icon: '📅', gradient: 'from-indigo-500 to-purple-600',  defaultSize: '1x1', component: 'TileWidget' },
  { id: 'ai',          type: 'action', label: 'VIKRR AI',         icon: '🤖', gradient: 'from-pink-500 to-rose-600',      defaultSize: '1x1', component: 'TileWidget', requiredPermission: 'ai.use' },
  { id: 'reports',     type: 'tile',   label: 'Reporty',          icon: '📊', gradient: 'from-slate-500 to-gray-600',     defaultSize: '1x1', component: 'TileWidget', requiredPermission: 'report.read' },
  { id: 'idea',        type: 'action', label: 'Nápad',            icon: '💡', gradient: 'from-violet-500 to-purple-600',  defaultSize: '1x1', component: 'TileWidget' },
  { id: 'request',     type: 'action', label: 'Požadavky',        icon: '🔧', gradient: 'from-sky-500 to-blue-600',       defaultSize: '1x1', component: 'TileWidget' },
  { id: 'noticeboard', type: 'tile',   label: 'Nástěnka',         icon: '📌', gradient: 'from-teal-500 to-cyan-600',      defaultSize: '1x1', component: 'TileWidget' },
  { id: 'academy',     type: 'tile',   label: 'Akademie',         icon: '📚', gradient: 'from-blue-600 to-indigo-700',    defaultSize: '1x1', component: 'TileWidget' },
  { id: 'production',  type: 'tile',   label: 'Výroba',            icon: '🏭', gradient: 'from-orange-500 to-red-600',     defaultSize: '1x1', component: 'TileWidget', requiredPermission: 'production.manage' },
  { id: 'warehouse',   type: 'tile',   label: 'Sklad výroby',     icon: '📦', gradient: 'from-teal-500 to-cyan-600',      defaultSize: '1x1', component: 'TileWidget', requiredPermission: 'warehouse.view' },
  { id: 'shifts',      type: 'tile',   label: 'Směny',            icon: '👥', gradient: 'from-violet-500 to-purple-600',  defaultSize: '1x1', component: 'TileWidget', requiredPermission: 'shifts.view' },
  { id: 'admin',       type: 'tile',   label: 'Administrace',     icon: '⚙️', gradient: 'from-gray-500 to-slate-600',     defaultSize: '1x1', component: 'TileWidget', minRole: 'SUPERADMIN' },

  // ── Full-width widget blocks (above tile grid) ──
  { id: 'semaphore', type: 'widget', label: 'Semafor',          icon: '🚦', gradient: '', defaultSize: 'full', component: 'SemaphoreWidget' },
  { id: 'hud',       type: 'widget', label: 'Provozní přehled', icon: '📈', gradient: '', defaultSize: 'full', component: 'OperationalHUD' },
  { id: 'top5',      type: 'widget', label: 'Top 5 úkolů',     icon: '🔥', gradient: '', defaultSize: 'full', component: 'Top5TasksWidget' },
  { id: 'lemon',     type: 'widget', label: 'Lemon List',       icon: '🍋', gradient: '', defaultSize: 'full', component: 'LemonListWidget' },
];

// ═══════════════════════════════════════════════════════
// LOOKUP HELPERS
// ═══════════════════════════════════════════════════════

const DEFINITION_MAP = new Map(WIDGET_DEFINITIONS.map(d => [d.id, d]));

export function getWidgetDef(id: string): WidgetDefinition | undefined {
  return DEFINITION_MAP.get(id);
}

// ═══════════════════════════════════════════════════════
// DEFAULT CONFIGS PER ROLE
// ═══════════════════════════════════════════════════════

function makeInstances(ids: string[]): WidgetInstance[] {
  return ids.map((widgetId, position) => {
    const def = getWidgetDef(widgetId);
    return {
      widgetId,
      position,
      visible: true,
      collapsed: false,
      size: (def?.defaultSize ?? '1x1') as WidgetSize,
    };
  });
}

// Admin roles see everything including full-width widgets above tiles
const ADMIN_ORDER = [
  'semaphore', 'hud', 'top5', 'lemon',
  'fault', 'tasks', 'map', 'revisions', 'inventory', 'waste',
  'fleet', 'louparna', 'inspections', 'calendar', 'ai', 'reports',
  'idea', 'request', 'noticeboard', 'academy', 'production', 'warehouse', 'shifts', 'admin',
];

const VYROBA_ORDER = [
  'fault', 'tasks', 'production', 'warehouse', 'shifts', 'map', 'inspections', 'calendar', 'louparna',
  'waste', 'inventory', 'revisions', 'noticeboard', 'idea', 'request', 'academy',
];

const UDRZBA_ORDER = [
  'semaphore', 'top5',
  'fault', 'tasks', 'production', 'warehouse', 'shifts', 'map', 'revisions', 'inventory', 'waste',
  'fleet', 'louparna', 'inspections', 'calendar', 'ai',
  'idea', 'request', 'noticeboard', 'academy',
];

const SKLADNIK_ORDER = [
  'inventory', 'tasks', 'fault', 'map', 'noticeboard', 'idea', 'request', 'academy',
];

const DEFAULT_CONFIGS: Record<UserRole, string[]> = {
  MAJITEL:    ADMIN_ORDER,
  VEDENI:     ADMIN_ORDER,
  SUPERADMIN: ADMIN_ORDER,
  UDRZBA:     UDRZBA_ORDER,
  SKLADNIK:   SKLADNIK_ORDER,
  VYROBA:     VYROBA_ORDER,
  OPERATOR:   [], // Operators use KioskDashboard, not widget grid
};

export function getDefaultConfig(role: UserRole): WidgetInstance[] {
  return makeInstances(DEFAULT_CONFIGS[role] || ADMIN_ORDER);
}
