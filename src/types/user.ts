// src/types/user.ts
// VIKRR — Asset Shield — Uživatelé a role

// ═══════════════════════════════════════════════════════════════════
// ROLE
// ═══════════════════════════════════════════════════════════════════

export type UserRole =
  | 'MAJITEL'      // 👑 Milan — vidí vše, read-only
  | 'VEDENI'       // 🏢 Martina — výkonná ředitelka, HR, finance
  | 'SUPERADMIN'   // 🛠️ Vilém — technika, BEZ financí
  | 'UDRZBA'       // 🔧 Zdeněk — stroje, sklad
  | 'SKLADNIK'     // 📦 Skladník — sklad ND, inventura
  | 'VYROBA'       // 🏭 Pavla — zóny, priority
  | 'OPERATOR';    // 👷 Kiosk — tablet na zdi

// ═══════════════════════════════════════════════════════════════════
// PERMISSIONS
// ═══════════════════════════════════════════════════════════════════

export type Permission =
  // Work Orders
  | 'wo.create' | 'wo.update' | 'wo.delete' | 'wo.read' | 'wo.approve' | 'wo.close' | 'wo.plan' | 'wo.assign'
  // Assets
  | 'asset.create' | 'asset.update' | 'asset.delete' | 'asset.read'
  // Gearboxes
  | 'gearbox.temperature.write' | 'gearbox.manage'
  // Inventory
  | 'inv.consume' | 'inv.restock' | 'inv.manage' | 'inv.approve' | 'inv.order'
  // Fleet
  | 'fleet.manage' | 'fleet.read'
  // HVAC
  | 'hvac.read' | 'hvac.manage'
  // Dataloggers
  | 'datalogger.read' | 'datalogger.temperature.write' | 'datalogger.manage'
  // Users
  | 'user.manage' | 'user.read'
  // Zones
  | 'zone.change'
  // Reports & Audit
  | 'report.read' | 'report.export' | 'audit.read'
  // Weekly plan
  | 'weekly.modify'
  // NOVÉ — Finance & Citlivé
  | 'finance.view'      // Mzdy, marže, náklady
  | 'secretbox.view'    // Schránka důvěry
  | 'purchase.approve'  // Schvalování nákupů nad 5000 Kč
  // NOVÉ — AI
  | 'ai.use'            // AI asistent
  // Plánování & Rozvrhy
  | 'schedule.manage'   // Správa opakovaných úkolů
  // Výroba
  | 'production.read'   // Čtení plánu výroby pro kiosk
  | 'production.manage' // Plánování extruze & balení
  // Admin
  | 'admin.view'        // Čtení administrace (read-only)
  | 'admin.manage'      // Plná správa administrace
  // Warehouse & Shifts
  | 'warehouse.view'    // Sklad výroby — příjem, zásoby, expedice
  | 'shifts.view';      // Plánování směn

// ═══════════════════════════════════════════════════════════════════
// ROLE FLAGS (speciální módy)
// ═══════════════════════════════════════════════════════════════════

export interface RoleFlags {
  isReadOnly: boolean;   // Majitel — nemůže editovat
  isKiosk: boolean;      // Operátor — tablet na zdi
}

// ═══════════════════════════════════════════════════════════════════
// ROLE METADATA (pro UI + Legenda)
// ═══════════════════════════════════════════════════════════════════

export interface RoleMeta {
  label: string;
  labelShort: string;
  icon: string;
  color: string;         // Tailwind bg class
  textColor: string;     // Tailwind text class
  badgeHex: string;      // Pro Legendu — HEX barva
  description: string;
}

export const ROLE_META: Record<UserRole, RoleMeta> = {
  MAJITEL: {
    label: 'Majitel',
    labelShort: 'MAJ',
    icon: '👑',
    color: 'bg-purple-500',
    textColor: 'text-purple-500',
    badgeHex: '#7c3aed',
    description: 'Vidí vše, read-only mód',
  },
  VEDENI: {
    label: 'Vedení',
    labelShort: 'VED',
    icon: '🏢',
    color: 'bg-blue-500',
    textColor: 'text-blue-500',
    badgeHex: '#2563eb',
    description: 'Výkonná ředitelka, HR, finance',
  },
  SUPERADMIN: {
    label: 'Superadmin',
    labelShort: 'ADM',
    icon: '🛠️',
    color: 'bg-green-500',
    textColor: 'text-green-500',
    badgeHex: '#16a34a',
    description: 'Technická správa systému',
  },
  UDRZBA: {
    label: 'Údržba',
    labelShort: 'UDR',
    icon: '🔧',
    color: 'bg-slate-500',
    textColor: 'text-slate-500',
    badgeHex: '#64748b',
    description: 'Stroje, sklad, opravy',
  },
  VYROBA: {
    label: 'Výroba',
    labelShort: 'VYR',
    icon: '🏭',
    color: 'bg-amber-500',
    textColor: 'text-amber-500',
    badgeHex: '#d97706',
    description: 'Zóny, priority výroby',
  },
  SKLADNIK: {
    label: 'Skladník',
    labelShort: 'SKL',
    icon: '📦',
    color: 'bg-teal-500',
    textColor: 'text-teal-500',
    badgeHex: '#14b8a6',
    description: 'Sklad ND, příjem, výdej, inventura',
  },
  OPERATOR: {
    label: 'Operátor',
    labelShort: 'OPR',
    icon: '👷',
    color: 'bg-gray-400',
    textColor: 'text-gray-400',
    badgeHex: '#9ca3af',
    description: 'Kiosk — hlášení poruch',
  },
};

// ═══════════════════════════════════════════════════════════════════
// ROLE → PERMISSIONS MAPPING
// ═══════════════════════════════════════════════════════════════════

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  // 👑 MAJITEL (Milan) — Vidí VŠE, ale NEMŮŽE editovat
  MAJITEL: [
    'wo.read',
    'asset.read',
    'datalogger.read',
    'fleet.read',
    'user.read',
    'report.read', 'report.export', 'audit.read',
    'finance.view',        // ✅ Vidí finance
    'secretbox.view',      // ✅ Schránka důvěry
    'purchase.approve',    // ✅ Schvaluje nákupy
    'ai.use',
    'admin.view',          // ✅ Vidí administraci (read-only)
    'warehouse.view',      // ✅ Sklad výroby
    'shifts.view',         // ✅ Směny
  ],

  // 🏢 VEDENÍ (Martina) — Výkonná ředitelka
  VEDENI: [
    'wo.read', 'wo.approve',
    'asset.read',
    'datalogger.read',
    'fleet.manage', 'fleet.read',
    'user.manage', 'user.read',
    'report.read', 'report.export', 'audit.read',
    'finance.view',        // ✅ Vidí finance
    // secretbox.view — NE
    'purchase.approve',    // ✅ Schvaluje nákupy
    'weekly.modify',
    'ai.use',
    'admin.view',          // ✅ Vidí administraci (read-only)
    'warehouse.view',      // ✅ Sklad výroby
    'shifts.view',         // ✅ Směny
  ],

  // 🛠️ SUPERADMIN (Vilém) — Technika, BEZ financí
  SUPERADMIN: [
    'wo.create', 'wo.update', 'wo.delete', 'wo.read', 'wo.approve', 'wo.close', 'wo.plan', 'wo.assign',
    'asset.create', 'asset.update', 'asset.delete', 'asset.read',
    'gearbox.temperature.write', 'gearbox.manage',
    'datalogger.read', 'datalogger.temperature.write', 'datalogger.manage',
    'inv.consume', 'inv.restock', 'inv.manage', 'inv.order',
    'fleet.manage', 'fleet.read',
    'user.manage', 'user.read',
    'zone.change',
    'report.read', 'report.export', 'audit.read',
    // finance.view — NE
    // secretbox.view — NE
    // purchase.approve — NE
    'weekly.modify',
    'ai.use',
    'schedule.manage',
    'production.manage',
    'admin.view',          // ✅ Vidí administraci
    'admin.manage',        // ✅ Plná správa
    'warehouse.view',      // ✅ Sklad výroby
    'shifts.view',         // ✅ Směny
  ],

  // 🔧 ÚDRŽBA (Zdeněk) — Stroje, sklad
  UDRZBA: [
    'wo.create', 'wo.update', 'wo.read', 'wo.close',
    'asset.read', 'asset.update',
    'gearbox.temperature.write', 'gearbox.manage',
    'datalogger.read', 'datalogger.temperature.write', 'datalogger.manage',
    'inv.consume', 'inv.restock',
    'fleet.read',
    'report.read',
    'ai.use',
    'schedule.manage',
    'production.manage',
    'warehouse.view',      // ✅ Sklad výroby
    'shifts.view',         // ✅ Směny
  ],

  // 🏭 VÝROBA (Pavla) — Zóny, priority
  VYROBA: [
    'wo.create', 'wo.read', 'wo.approve', 'wo.plan',
    'asset.read',
    'gearbox.temperature.write',
    'zone.change',
    'weekly.modify',
    'report.read',
    'production.manage',
    'warehouse.view',      // ✅ Sklad výroby
    'shifts.view',         // ✅ Směny
  ],

  // 📦 SKLADNÍK — Sklad ND, inventura
  SKLADNIK: [
    'wo.create', 'wo.update', 'wo.read',
    'asset.read',
    'inv.consume', 'inv.restock', 'inv.manage', 'inv.order',
    'datalogger.read', 'datalogger.temperature.write',
    'report.read',
    'schedule.manage',
  ],

  // 👷 OPERÁTOR (Kiosk) — Tablet na zdi
  OPERATOR: [
    'wo.create',  // Nahlásit poruchu
    'wo.read',
    'asset.read',
    'production.read',
    'gearbox.temperature.write',
  ],
};

// ═══════════════════════════════════════════════════════════════════
// ROLE FLAGS MAPPING
// ═══════════════════════════════════════════════════════════════════

export const ROLE_FLAGS: Record<UserRole, RoleFlags> = {
  MAJITEL:    { isReadOnly: true,  isKiosk: false },
  VEDENI:     { isReadOnly: false, isKiosk: false },
  SUPERADMIN: { isReadOnly: false, isKiosk: false },
  UDRZBA:     { isReadOnly: false, isKiosk: false },
  SKLADNIK:   { isReadOnly: false, isKiosk: false },
  VYROBA:     { isReadOnly: false, isKiosk: false },
  OPERATOR:   { isReadOnly: false, isKiosk: true  },
};

// ═══════════════════════════════════════════════════════════════════
// USER INTERFACE
// ═══════════════════════════════════════════════════════════════════

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  plantId: string;
  tenantId: string;  // Multi-tenant skeleton — default 'main_firm'
  pin?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
}

// ═══════════════════════════════════════════════════════════════════
// SAMPLE USERS (pro vývoj)
// ═══════════════════════════════════════════════════════════════════

export const SAMPLE_USERS: Omit<AppUser, 'createdAt' | 'updatedAt'>[] = [
  { uid: 'usr-milan',    email: 'pin_1111@nominal.local', displayName: 'Milan Novák',      role: 'MAJITEL',    plantId: 'kozlov', tenantId: 'main_firm', pin: '1111', isActive: true },
  { uid: 'usr-martina',  email: 'pin_2222@nominal.local', displayName: 'Martina Nováková', role: 'VEDENI',     plantId: 'kozlov', tenantId: 'main_firm', pin: '2222', isActive: true },
  { uid: 'usr-vilem',    email: 'pin_3333@nominal.local', displayName: 'Vilém',            role: 'SUPERADMIN', plantId: 'kozlov', tenantId: 'main_firm', pin: '3333', isActive: true },
  { uid: 'usr-zdenek',   email: 'pin_4444@nominal.local', displayName: 'Zdeněk Mička',     role: 'UDRZBA',     plantId: 'kozlov', tenantId: 'main_firm', pin: '4444', isActive: true },
  { uid: 'usr-pavla',    email: 'pin_5555@nominal.local', displayName: 'Pavla Drápelová',  role: 'VYROBA',     plantId: 'kozlov', tenantId: 'main_firm', pin: '5555', isActive: true },
  { uid: 'usr-kiosk',    email: 'pin_0000@nominal.local', displayName: 'Kiosk Tablet',     role: 'OPERATOR',   plantId: 'kozlov', tenantId: 'main_firm', pin: '0000', isActive: true },
];

// ═══════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

export const getRoleMeta = (role: UserRole): RoleMeta => ROLE_META[role];
export const getRoleFlags = (role: UserRole): RoleFlags => ROLE_FLAGS[role];
export const getRolePermissions = (role: UserRole): Permission[] => ROLE_PERMISSIONS[role];

export const hasPermission = (role: UserRole, permission: Permission): boolean => {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
};

export const isReadOnlyRole = (role: UserRole): boolean => {
  return ROLE_FLAGS[role]?.isReadOnly ?? false;
};

export const isKioskRole = (role: UserRole): boolean => {
  return ROLE_FLAGS[role]?.isKiosk ?? false;
};

// ═══════════════════════════════════════════════════════════════════
// MODULE DEFINITIONS (Feature Flags)
// ═══════════════════════════════════════════════════════════════════

export interface ModuleDefinition {
  id: string;
  label: string;
  icon: string;
  category: string;
}

export const MODULE_DEFINITIONS: ModuleDefinition[] = [
  { id: 'fault', label: 'Nahlášení poruch', icon: '🚨', category: 'Základní' },
  { id: 'tasks', label: 'Úkoly', icon: '📋', category: 'Základní' },
  { id: 'calendar', label: 'Kalendář', icon: '📅', category: 'Základní' },
  { id: 'noticeboard', label: 'Nástěnka', icon: '📌', category: 'Základní' },
  { id: 'idea', label: 'Nápady', icon: '💡', category: 'Základní' },
  { id: 'request', label: 'Požadavky', icon: '🔧', category: 'Základní' },
  { id: 'academy', label: 'Akademie', icon: '📚', category: 'Základní' },
  { id: 'inventory', label: 'Sklad ND', icon: '📦', category: 'Údržba' },
  { id: 'revisions', label: 'Revize', icon: '🔍', category: 'Údržba' },
  { id: 'fleet', label: 'Vozidla', icon: '🚗', category: 'Údržba' },
  { id: 'hvac', label: 'Vzduchotechnika', icon: '💨', category: 'Údržba' },
  { id: 'gearboxes', label: 'Převodovky', icon: '⚙️', category: 'Údržba' },
  { id: 'dataloggers', label: 'Datalogery', icon: '🌡️', category: 'Údržba' },
  { id: 'inspections', label: 'Kontroly', icon: '✅', category: 'Údržba' },
  { id: 'production', label: 'Výroba', icon: '🏭', category: 'Výroba' },
  { id: 'warehouse', label: 'Sklad výroby', icon: '📦', category: 'Výroba' },
  { id: 'shifts', label: 'Směny', icon: '👥', category: 'Výroba' },
  { id: 'ai', label: 'AI Asistent', icon: '🤖', category: 'Pokročilé' },
  { id: 'reports', label: 'Reporty', icon: '📊', category: 'Pokročilé' },
  { id: 'admin', label: 'Administrace', icon: '⚙️', category: 'Pokročilé' },
];

const ALL_MODULE_IDS = MODULE_DEFINITIONS.map(m => m.id).filter(id => id !== 'map');

export const DEFAULT_ENABLED_MODULES: Record<UserRole, string[]> = {
  MAJITEL: ALL_MODULE_IDS,
  VEDENI: ALL_MODULE_IDS,
  SUPERADMIN: ALL_MODULE_IDS,
  UDRZBA: ['fault', 'tasks', 'revisions', 'inventory', 'fleet', 'hvac', 'gearboxes', 'dataloggers', 'inspections', 'calendar', 'reports', 'ai', 'idea', 'request', 'noticeboard', 'academy', 'production', 'warehouse', 'shifts'],
  VYROBA: ['fault', 'tasks', 'production', 'warehouse', 'shifts', 'inspections', 'calendar', 'inventory', 'hvac', 'gearboxes', 'revisions', 'reports', 'noticeboard', 'idea', 'request', 'academy'],
  SKLADNIK: ['inventory', 'hvac', 'gearboxes', 'dataloggers', 'tasks', 'fault', 'reports', 'noticeboard', 'idea', 'request', 'academy'],
  OPERATOR: [],
};
