// src/types/tenant.ts
// Nominal CMMS — Multi-tenant types


// ═══════════════════════════════════════════════════════
// TENANT SETTINGS — active modules per tenant
// ═══════════════════════════════════════════════════════

export interface TenantSettings {
  id: string;           // tenantId e.g. 'main_firm'
  name: string;         // Display name e.g. 'Nominal s.r.o.'
  appName?: string;
  logoUrl?: string;
  logoLetter?: string;
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
    module: 'gearboxes',
    label: 'Převodovky',
    permissions: [
      { key: 'gearbox.temperature.write', label: 'Zapsat teplotu', description: 'Zapsat provozní teplotu převodovky bez správy celé karty' },
      { key: 'gearbox.manage', label: 'Spravovat', description: 'Správa převodovek, servis a limity' },
    ],
  },
  {
    module: 'dataloggers',
    label: 'Datalogery',
    permissions: [
      { key: 'datalogger.read', label: 'Číst', description: 'Zobrazit datalogery a historii teplot' },
      { key: 'datalogger.temperature.write', label: 'Zapsat teplotu', description: 'Zapsat denní teplotu z dataloggeru' },
      { key: 'datalogger.manage', label: 'Spravovat', description: 'Správa dataloggerů a mazání chybných zápisů' },
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
    module: 'hvac',
    label: 'Vzduchotechnika',
    permissions: [
      { key: 'hvac.read', label: 'Číst', description: 'Zobrazit vzduchotechniku, filtry a historii výměn' },
      { key: 'hvac.manage', label: 'Spravovat', description: 'Správa karet VZT, vazeb na sklad a limitů filtrů' },
    ],
  },
  {
    module: 'production',
    label: 'Výroba',
    permissions: [
      { key: 'production.read', label: 'Číst', description: 'Zobrazit plán výroby v kiosku' },
      { key: 'production.manage', label: 'Spravovat', description: 'Plánování extruze a balení' },
    ],
  },
  {
    module: 'warehouse',
    label: 'Sklad výroby',
    permissions: [
      { key: 'warehouse.view', label: 'Zobrazit', description: 'Příjem, zásoby, expedice' },
      { key: 'warehouse.manage', label: 'Spravovat', description: 'Zapisovat prijem, zasoby a expedici' },
    ],
  },
  {
    module: 'shifts',
    label: 'Směny',
    permissions: [
      { key: 'shifts.view', label: 'Zobrazit', description: 'Plánování směn' },
      { key: 'shifts.manage', label: 'Spravovat', description: 'Upravovat a ukladat plan smen' },
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
