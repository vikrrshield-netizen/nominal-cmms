// src/types/user.ts
// NOMINAL CMMS — Uživatelé a role

// ═══════════════════════════════════════════════════════════════════
// ROLE
// ═══════════════════════════════════════════════════════════════════

export type UserRole =
  | 'MAJITEL'      // 👑 Milan — vidí vše, read-only
  | 'VEDENI'       // 🏢 Martina — výkonná ředitelka, HR, finance
  | 'SUPERADMIN'   // 🛠️ Vilém — technika, BEZ financí
  | 'UDRZBA'       // 🔧 Zdeněk — stroje, sklad
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
  // Inventory
  | 'inv.consume' | 'inv.restock' | 'inv.manage' | 'inv.approve' | 'inv.order'
  // Fleet
  | 'fleet.manage' | 'fleet.read'
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
  | 'ai.use';           // AI asistent

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
    'fleet.read',
    'user.read',
    'report.read', 'report.export', 'audit.read',
    'finance.view',        // ✅ Vidí finance
    'secretbox.view',      // ✅ Schránka důvěry
    'purchase.approve',    // ✅ Schvaluje nákupy
    'ai.use',
  ],

  // 🏢 VEDENÍ (Martina) — Výkonná ředitelka
  VEDENI: [
    'wo.read', 'wo.approve',
    'asset.read',
    'fleet.manage', 'fleet.read',
    'user.manage', 'user.read',
    'report.read', 'report.export', 'audit.read',
    'finance.view',        // ✅ Vidí finance
    // secretbox.view — NE
    'purchase.approve',    // ✅ Schvaluje nákupy
    'weekly.modify',
    'ai.use',
  ],

  // 🛠️ SUPERADMIN (Vilém) — Technika, BEZ financí
  SUPERADMIN: [
    'wo.create', 'wo.update', 'wo.delete', 'wo.read', 'wo.approve', 'wo.close', 'wo.plan', 'wo.assign',
    'asset.create', 'asset.update', 'asset.delete', 'asset.read',
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
  ],

  // 🔧 ÚDRŽBA (Zdeněk) — Stroje, sklad
  UDRZBA: [
    'wo.create', 'wo.update', 'wo.read', 'wo.close',
    'asset.read', 'asset.update',
    'inv.consume', 'inv.restock',
    'fleet.read',
    'report.read',
    'ai.use',
  ],

  // 🏭 VÝROBA (Pavla) — Zóny, priority
  VYROBA: [
    'wo.create', 'wo.read', 'wo.approve', 'wo.plan',
    'asset.read',
    'zone.change',
    'weekly.modify',
    'report.read',
  ],

  // 👷 OPERÁTOR (Kiosk) — Tablet na zdi
  OPERATOR: [
    'wo.create',  // Nahlásit poruchu
    'wo.read',
    'asset.read',
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
  { uid: 'usr-milan',    email: 'pin_1111@nominal.local', displayName: 'Milan Novák',      role: 'MAJITEL',    plantId: 'kozlov', pin: '1111', isActive: true },
  { uid: 'usr-martina',  email: 'pin_2222@nominal.local', displayName: 'Martina Nováková', role: 'VEDENI',     plantId: 'kozlov', pin: '2222', isActive: true },
  { uid: 'usr-vilem',    email: 'pin_3333@nominal.local', displayName: 'Vilém',            role: 'SUPERADMIN', plantId: 'kozlov', pin: '3333', isActive: true },
  { uid: 'usr-zdenek',   email: 'pin_4444@nominal.local', displayName: 'Zdeněk Mička',     role: 'UDRZBA',     plantId: 'kozlov', pin: '4444', isActive: true },
  { uid: 'usr-pavla',    email: 'pin_5555@nominal.local', displayName: 'Pavla Drápelová',  role: 'VYROBA',     plantId: 'kozlov', pin: '5555', isActive: true },
  { uid: 'usr-kiosk',    email: 'pin_0000@nominal.local', displayName: 'Kiosk Tablet',     role: 'OPERATOR',   plantId: 'kozlov', pin: '0000', isActive: true },
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
