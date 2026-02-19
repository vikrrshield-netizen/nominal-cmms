// src/types/tenant.ts
// Nominal CMMS — Multi-tenant types


// ═══════════════════════════════════════════════════════
// TENANT SETTINGS — active modules per tenant
// ═══════════════════════════════════════════════════════

export interface TenantSettings {
  id: string;           // tenantId e.g. 'main_firm'
  name: string;         // Display name e.g. 'Nominal s.r.o.'
  activeModules: string[]; // Module IDs from MODULE_DEFINITIONS
  updatedAt: Date;
  updatedByName: string;
}

// ═══════════════════════════════════════════════════════
// TENANT ROLES — custom positions per tenant
// ═══════════════════════════════════════════════════════

export interface TenantRole {
  id: string;
  tenantId: string;
  roleName: string;
  description: string;
  permissions: Record<string, boolean>; // permission key → enabled
  createdAt: Date;
  updatedAt: Date;
  createdByName: string;
}

// ═══════════════════════════════════════════════════════
// PERMISSION GROUP — for UI grouping
// ═══════════════════════════════════════════════════════

export interface PermissionGroup {
  module: string;       // Module ID from MODULE_DEFINITIONS
  label: string;
  permissions: { key: string; label: string; description: string }[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    module: 'tasks',
    label: 'Úkoly',
    permissions: [
      { key: 'wo.create', label: 'Vytvořit', description: 'Nahlásit poruchu / vytvořit úkol' },
      { key: 'wo.read', label: 'Číst', description: 'Zobrazit seznam úkolů' },
      { key: 'wo.update', label: 'Upravit', description: 'Změnit stav/detail úkolu' },
      { key: 'wo.delete', label: 'Smazat', description: 'Odstranit úkol' },
      { key: 'wo.approve', label: 'Schválit', description: 'Schválit úkol' },
      { key: 'wo.assign', label: 'Přiřadit', description: 'Přiřadit technika' },
    ],
  },
  {
    module: 'inventory',
    label: 'Sklad ND',
    permissions: [
      { key: 'inv.consume', label: 'Odebrat', description: 'Odebrat díl ze skladu' },
      { key: 'inv.restock', label: 'Naskladnit', description: 'Přidat díl na sklad' },
      { key: 'inv.manage', label: 'Spravovat', description: 'Editovat položky skladu' },
      { key: 'inv.order', label: 'Objednat', description: 'Vytvořit objednávku' },
    ],
  },
  {
    module: 'fleet',
    label: 'Vozidla',
    permissions: [
      { key: 'fleet.read', label: 'Číst', description: 'Zobrazit vozový park' },
      { key: 'fleet.manage', label: 'Spravovat', description: 'Editovat vozidla' },
    ],
  },
  {
    module: 'production',
    label: 'Výroba',
    permissions: [
      { key: 'production.manage', label: 'Spravovat', description: 'Plánování extruze a balení' },
    ],
  },
  {
    module: 'warehouse',
    label: 'Sklad výroby',
    permissions: [
      { key: 'warehouse.view', label: 'Zobrazit', description: 'Příjem, zásoby, expedice' },
    ],
  },
  {
    module: 'shifts',
    label: 'Směny',
    permissions: [
      { key: 'shifts.view', label: 'Zobrazit', description: 'Plánování směn' },
    ],
  },
  {
    module: 'reports',
    label: 'Reporty',
    permissions: [
      { key: 'report.read', label: 'Číst', description: 'Zobrazit reporty' },
      { key: 'report.export', label: 'Exportovat', description: 'Stáhnout CSV/PDF' },
    ],
  },
  {
    module: 'admin',
    label: 'Administrace',
    permissions: [
      { key: 'admin.view', label: 'Číst', description: 'Prohlížet administraci' },
      { key: 'admin.manage', label: 'Spravovat', description: 'Plná správa systému' },
      { key: 'user.manage', label: 'Uživatelé', description: 'Správa uživatelů' },
    ],
  },
];
