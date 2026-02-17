// src/types/rbac.ts
// NOMINAL CMMS — Dynamické role a oprávnění

import type { Timestamp } from 'firebase/firestore';

// ═══════════════════════════════════════════
// PERMISSIONS
// ═══════════════════════════════════════════

/** Všechny dostupné moduly */
export type PermissionModule =
  | 'tasks'
  | 'assets'
  | 'inventory'
  | 'fleet'
  | 'revisions'
  | 'calendar'
  | 'waste'
  | 'trustbox'
  | 'admin'
  | 'kiosk'
  | 'reports';

/** Všechny dostupné akce */
export type PermissionAction =
  | 'view'
  | 'create'
  | 'edit'
  | 'delete'
  | 'assign'
  | 'complete'
  | 'schedule'
  | 'prioritize'
  | 'move'
  | 'issue'
  | 'receive'
  | 'order'
  | 'approve'
  | 'submit'
  | 'read'
  | 'respond'
  | 'users'
  | 'roles'
  | 'settings'
  | 'audit'
  | 'hard_delete'
  | 'configure'
  | 'export';

/** Permission string = "module.action" */
export type PermissionString = `${PermissionModule}.${PermissionAction}`;

/** Dokument v kolekci permissions */
export interface Permission {
  id: string;
  module: PermissionModule;
  action: PermissionAction;
  label: string; // "Vytvářet úkoly"
  description: string;
  category: string; // pro groupování v admin UI
}

// ═══════════════════════════════════════════
// ROLES
// ═══════════════════════════════════════════

/** Dokument v kolekci roles */
export interface Role {
  id: string;
  name: string; // "Administrátor"
  description: string;
  color: string; // hex pro UI badge
  icon: string; // lucide icon name
  isSystem: boolean; // true = nelze smazat
  isDeleted: boolean;
  permissions: string[]; // ["tasks.create", "tasks.edit", ...]
  defaultScope: {
    buildings: string[]; // ["*"] = vše
    areas: string[];
  };
  defaultWidgets: string[];
  defaultKioskButtons: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}

// ═══════════════════════════════════════════
// USER (rozšířený)
// ═══════════════════════════════════════════

/** Scope — omezení viditelnosti */
export interface UserScope {
  buildings: string[]; // ["D", "E"] nebo ["*"]
  areas: string[]; // ["D2.08"] nebo ["*"]
}

/** Individuální oprávnění (override nad rolí) */
export interface CustomPermissions {
  granted: string[]; // extra permissions navíc
  revoked: string[]; // odebraná oprávnění z role
}

/** Rozšířený User dokument (Firestore) */
export interface UserDoc {
  uid: string;
  pin: string;
  displayName: string;
  email: string;
  avatar?: string;
  phone?: string;
  isActive: boolean;
  isDeleted: boolean;

  // RBAC
  roleIds: string[];
  primaryRoleId: string;
  customPermissions: CustomPermissions;
  scope: UserScope;

  // UI personalizace
  kioskButtons?: string[];
  dashboardLayout?: {
    widgets: string[];
    order: number[];
  };

  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastLoginAt?: Timestamp;
}

// ═══════════════════════════════════════════
// AUDIT
// ═══════════════════════════════════════════

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'SOFT_DELETE'
  | 'HARD_DELETE'
  | 'RESTORE'
  | 'LOGIN'
  | 'PERMISSION_CHANGE';

export interface AuditLogEntry {
  userId: string;
  userName: string;
  userRole: string;
  action: AuditAction;
  collection: string;
  documentId: string;
  timestamp: Timestamp;
  changes?: Record<string, unknown>;
  reason?: string;
}

// ═══════════════════════════════════════════
// HELPER: výpočet efektivních oprávnění
// ═══════════════════════════════════════════

/**
 * Sloučí oprávnění ze všech rolí + individuální grant/revoke
 */
export function computeEffectivePermissions(
  roleIds: string[],
  allRoles: Role[],
  custom: CustomPermissions
): string[] {
  // 1. Sesbírat oprávnění ze všech přiřazených rolí
  const fromRoles = roleIds.flatMap(
    (rid) => allRoles.find((r) => r.id === rid)?.permissions || []
  );

  // 2. Přidat individuálně přidělená
  const merged = [...new Set([...fromRoles, ...custom.granted])];

  // 3. Odebrat individuálně odebraná
  return merged.filter((p) => !custom.revoked.includes(p));
}

/**
 * Kontrola scope — má uživatel přístup k dané budově/oblasti?
 */
export function canAccessBuilding(scope: UserScope, buildingId: string): boolean {
  return scope.buildings.includes('*') || scope.buildings.includes(buildingId);
}

export function canAccessArea(scope: UserScope, areaId: string): boolean {
  return scope.areas.includes('*') || scope.areas.includes(areaId);
}
