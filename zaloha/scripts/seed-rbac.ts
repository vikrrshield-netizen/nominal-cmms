// scripts/seed-rbac.ts
// NOMINAL CMMS — Seed: roles + permissions + update users
// Spustit: npx tsx scripts/seed-rbac.ts

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

initializeApp({
  credential: cert(require('../serviceAccount.json')),
});
const db = getFirestore();

// ═══════════════════════════════════════════
// PERMISSIONS (číselník)
// ═══════════════════════════════════════════

const PERMISSIONS = [
  // Tasks
  { id: 'tasks.view', module: 'tasks', action: 'view', label: 'Vidět úkoly', category: 'Úkoly' },
  { id: 'tasks.create', module: 'tasks', action: 'create', label: 'Vytvářet úkoly', category: 'Úkoly' },
  { id: 'tasks.edit', module: 'tasks', action: 'edit', label: 'Editovat úkoly', category: 'Úkoly' },
  { id: 'tasks.assign', module: 'tasks', action: 'assign', label: 'Přiřazovat úkoly', category: 'Úkoly' },
  { id: 'tasks.complete', module: 'tasks', action: 'complete', label: 'Dokončovat úkoly', category: 'Úkoly' },
  { id: 'tasks.delete', module: 'tasks', action: 'delete', label: 'Mazat úkoly', category: 'Úkoly' },
  { id: 'tasks.schedule', module: 'tasks', action: 'schedule', label: 'Plánovat do kalendáře', category: 'Úkoly' },
  { id: 'tasks.prioritize', module: 'tasks', action: 'prioritize', label: 'Měnit priority', category: 'Úkoly' },

  // Assets
  { id: 'assets.view', module: 'assets', action: 'view', label: 'Vidět zařízení', category: 'Majetek' },
  { id: 'assets.create', module: 'assets', action: 'create', label: 'Přidávat zařízení', category: 'Majetek' },
  { id: 'assets.edit', module: 'assets', action: 'edit', label: 'Editovat zařízení', category: 'Majetek' },
  { id: 'assets.delete', module: 'assets', action: 'delete', label: 'Mazat zařízení', category: 'Majetek' },
  { id: 'assets.move', module: 'assets', action: 'move', label: 'Přesouvat zařízení', category: 'Majetek' },

  // Inventory
  { id: 'inventory.view', module: 'inventory', action: 'view', label: 'Vidět sklad', category: 'Sklad' },
  { id: 'inventory.issue', module: 'inventory', action: 'issue', label: 'Výdej ze skladu', category: 'Sklad' },
  { id: 'inventory.receive', module: 'inventory', action: 'receive', label: 'Příjem na sklad', category: 'Sklad' },
  { id: 'inventory.order', module: 'inventory', action: 'order', label: 'Vytvořit objednávku', category: 'Sklad' },
  { id: 'inventory.approve', module: 'inventory', action: 'approve', label: 'Schválit objednávku', category: 'Sklad' },

  // Fleet
  { id: 'fleet.view', module: 'fleet', action: 'view', label: 'Vidět vozidla', category: 'Flotila' },
  { id: 'fleet.edit', module: 'fleet', action: 'edit', label: 'Editovat vozidla', category: 'Flotila' },
  { id: 'fleet.assign', module: 'fleet', action: 'assign', label: 'Přiřadit zodpovědnou osobu', category: 'Flotila' },

  // Revisions
  { id: 'revisions.view', module: 'revisions', action: 'view', label: 'Vidět revize', category: 'Revize' },
  { id: 'revisions.edit', module: 'revisions', action: 'edit', label: 'Editovat revize', category: 'Revize' },

  // Calendar
  { id: 'calendar.view', module: 'calendar', action: 'view', label: 'Vidět kalendář', category: 'Plánování' },
  { id: 'calendar.edit', module: 'calendar', action: 'edit', label: 'Upravovat plán', category: 'Plánování' },

  // Waste
  { id: 'waste.view', module: 'waste', action: 'view', label: 'Vidět odpady', category: 'Odpady' },
  { id: 'waste.edit', module: 'waste', action: 'edit', label: 'Aktualizovat semafor', category: 'Odpady' },

  // TrustBox
  { id: 'trustbox.submit', module: 'trustbox', action: 'submit', label: 'Odesílat zprávy', category: 'Schránka důvěry' },
  { id: 'trustbox.read', module: 'trustbox', action: 'read', label: 'Číst zprávy', category: 'Schránka důvěry' },
  { id: 'trustbox.respond', module: 'trustbox', action: 'respond', label: 'Odpovídat na zprávy', category: 'Schránka důvěry' },

  // Admin
  { id: 'admin.users', module: 'admin', action: 'users', label: 'Správa uživatelů', category: 'Administrace' },
  { id: 'admin.roles', module: 'admin', action: 'roles', label: 'Správa rolí', category: 'Administrace' },
  { id: 'admin.settings', module: 'admin', action: 'settings', label: 'Systémové nastavení', category: 'Administrace' },
  { id: 'admin.audit', module: 'admin', action: 'audit', label: 'Prohlížet audit logy', category: 'Administrace' },
  { id: 'admin.hard_delete', module: 'admin', action: 'hard_delete', label: 'Tvrdé mazání', category: 'Administrace' },

  // Kiosk
  { id: 'kiosk.configure', module: 'kiosk', action: 'configure', label: 'Nastavovat kiosky', category: 'Kiosk' },

  // Reports
  { id: 'reports.view', module: 'reports', action: 'view', label: 'Vidět reporty', category: 'Reporty' },
  { id: 'reports.export', module: 'reports', action: 'export', label: 'Exportovat data', category: 'Reporty' },
];

// ═══════════════════════════════════════════
// ROLES
// ═══════════════════════════════════════════

const ALL_PERMS = PERMISSIONS.map((p) => p.id);

const ROLES = [
  {
    id: 'role_superadmin',
    name: 'Super Admin',
    description: 'Plný přístup ke všemu včetně systémových nastavení',
    color: '#16a34a',
    icon: 'Shield',
    isSystem: true,
    permissions: ALL_PERMS,
    defaultScope: { buildings: ['*'], areas: ['*'] },
    defaultWidgets: ['tasks_all', 'assets_critical', 'chart_weekly', 'audit_recent'],
    defaultKioskButtons: [],
  },
  {
    id: 'role_majitel',
    name: 'Majitel',
    description: 'Přehled o chodu firmy, schvalování priorit',
    color: '#7c3aed',
    icon: 'Crown',
    isSystem: true,
    permissions: [
      'tasks.view', 'tasks.prioritize',
      'assets.view',
      'inventory.view', 'inventory.approve',
      'fleet.view',
      'revisions.view',
      'calendar.view',
      'waste.view',
      'trustbox.read', 'trustbox.respond',
      'reports.view', 'reports.export',
    ],
    defaultScope: { buildings: ['*'], areas: ['*'] },
    defaultWidgets: ['tasks_overview', 'chart_weekly', 'reports_summary'],
    defaultKioskButtons: [],
  },
  {
    id: 'role_vedeni',
    name: 'Vedení',
    description: 'Správa zaměstnanců a procesů',
    color: '#2563eb',
    icon: 'Users',
    isSystem: true,
    permissions: [
      'tasks.view', 'tasks.create', 'tasks.edit', 'tasks.assign', 'tasks.schedule', 'tasks.prioritize',
      'assets.view',
      'inventory.view', 'inventory.order', 'inventory.approve',
      'fleet.view', 'fleet.assign',
      'revisions.view', 'revisions.edit',
      'calendar.view', 'calendar.edit',
      'waste.view',
      'admin.users',
      'reports.view', 'reports.export',
    ],
    defaultScope: { buildings: ['*'], areas: ['*'] },
    defaultWidgets: ['tasks_all', 'assets_overview', 'calendar_week'],
    defaultKioskButtons: [],
  },
  {
    id: 'role_vyroba',
    name: 'Výroba',
    description: 'Asistence výroby, plán balení a sanitací',
    color: '#f59e0b',
    icon: 'Factory',
    isSystem: false,
    permissions: [
      'tasks.view', 'tasks.create',
      'assets.view',
      'inventory.view', 'inventory.order',
      'calendar.view',
      'waste.view',
      'trustbox.submit',
    ],
    defaultScope: { buildings: ['D'], areas: ['*'] },
    defaultWidgets: ['tasks_my', 'calendar_week'],
    defaultKioskButtons: ['report_fault', 'order_material'],
  },
  {
    id: 'role_udrzba',
    name: 'Údržba',
    description: 'Technici — řeší úkoly, spravují stroje, vydávají díly',
    color: '#64748b',
    icon: 'Wrench',
    isSystem: true,
    permissions: [
      'tasks.view', 'tasks.create', 'tasks.edit', 'tasks.complete', 'tasks.schedule',
      'assets.view', 'assets.edit',
      'inventory.view', 'inventory.issue', 'inventory.receive', 'inventory.order',
      'fleet.view', 'fleet.edit',
      'revisions.view', 'revisions.edit',
      'calendar.view', 'calendar.edit',
      'waste.view', 'waste.edit',
      'trustbox.submit',
      'reports.view',
    ],
    defaultScope: { buildings: ['*'], areas: ['*'] },
    defaultWidgets: ['tasks_my', 'assets_critical', 'calendar_week', 'inventory_low'],
    defaultKioskButtons: ['report_fault', 'order_material', 'complete_task'],
  },
  {
    id: 'role_operator',
    name: 'Operátor',
    description: 'Kiosk mód — hlášení poruch a požadavků',
    color: '#06b6d4',
    icon: 'Monitor',
    isSystem: true,
    permissions: [
      'tasks.view', 'tasks.create',
      'assets.view',
      'inventory.view',
      'trustbox.submit',
    ],
    defaultScope: { buildings: ['D'], areas: ['*'] },
    defaultWidgets: ['tasks_my'],
    defaultKioskButtons: ['report_fault', 'order_material'],
  },
];

// ═══════════════════════════════════════════
// USER → ROLE MAPPING (PIN → roleId)
// ═══════════════════════════════════════════

const USER_ROLE_MAP: Record<string, { roleIds: string[]; primaryRoleId: string; scope: any }> = {
  // PIN 3333 = Vilém = SUPERADMIN
  '3333': {
    roleIds: ['role_superadmin'],
    primaryRoleId: 'role_superadmin',
    scope: { buildings: ['*'], areas: ['*'] },
  },
  // PIN 1111 = Milan = MAJITEL
  '1111': {
    roleIds: ['role_majitel'],
    primaryRoleId: 'role_majitel',
    scope: { buildings: ['*'], areas: ['*'] },
  },
  // PIN 2222 = Martina = VEDENI
  '2222': {
    roleIds: ['role_vedeni'],
    primaryRoleId: 'role_vedeni',
    scope: { buildings: ['*'], areas: ['*'] },
  },
  // PIN 4444 = Pavla = VYROBA
  '4444': {
    roleIds: ['role_vyroba'],
    primaryRoleId: 'role_vyroba',
    scope: { buildings: ['D'], areas: ['*'] },
  },
  // PIN 5555 = Zdeněk = UDRZBA
  '5555': {
    roleIds: ['role_udrzba'],
    primaryRoleId: 'role_udrzba',
    scope: { buildings: ['*'], areas: ['*'] },
  },
  // PIN 6666 = Petr = UDRZBA (hybridní — přidat i inventory.approve)
  '6666': {
    roleIds: ['role_udrzba'],
    primaryRoleId: 'role_udrzba',
    scope: { buildings: ['*'], areas: ['*'] },
  },
  // PIN 7777 = Filip = UDRZBA (fleet focus)
  '7777': {
    roleIds: ['role_udrzba'],
    primaryRoleId: 'role_udrzba',
    scope: { buildings: ['*'], areas: ['*'] },
  },
  // PIN 0000 = Kiosk = OPERATOR
  '0000': {
    roleIds: ['role_operator'],
    primaryRoleId: 'role_operator',
    scope: { buildings: ['D'], areas: ['*'] },
  },
};

// Petr Volf — individuální: přidat inventory.approve (hybridní role)
const CUSTOM_PERMS: Record<string, { granted: string[]; revoked: string[] }> = {
  '6666': { granted: ['inventory.approve'], revoked: [] },
  // Filip — přidat fleet.assign
  '7777': { granted: ['fleet.assign'], revoked: [] },
};

// ═══════════════════════════════════════════
// SEED
// ═══════════════════════════════════════════

async function seed() {
  console.log('=== NOMINAL CMMS — RBAC Seed ===\n');
  const now = Timestamp.now();

  // 1. Permissions
  console.log('1. Permissions...');
  const permBatch = db.batch();
  for (const p of PERMISSIONS) {
    permBatch.set(db.collection('permissions').doc(p.id), {
      ...p,
      description: `Oprávnění: ${p.label}`,
    });
  }
  await permBatch.commit();
  console.log(`   ✓ ${PERMISSIONS.length} permissions`);

  // 2. Roles
  console.log('2. Roles...');
  const roleBatch = db.batch();
  for (const r of ROLES) {
    roleBatch.set(db.collection('roles').doc(r.id), {
      ...r,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
      createdBy: 'seed-script',
    });
  }
  await roleBatch.commit();
  console.log(`   ✓ ${ROLES.length} roles`);

  // 3. Update existing users
  console.log('3. Updating users...');
  const usersSnap = await db.collection('users').get();
  let updated = 0;

  for (const userDoc of usersSnap.docs) {
    const data = userDoc.data();
    const pin = data.pin;

    if (!pin || !USER_ROLE_MAP[pin]) {
      console.log(`   ⚠ Přeskakuji ${data.displayName} (neznámý PIN: ${pin})`);
      continue;
    }

    const mapping = USER_ROLE_MAP[pin];
    const custom = CUSTOM_PERMS[pin] || { granted: [], revoked: [] };

    await userDoc.ref.update({
      roleIds: mapping.roleIds,
      primaryRoleId: mapping.primaryRoleId,
      customPermissions: custom,
      scope: mapping.scope,
      updatedAt: now,
    });

    console.log(
      `   ✓ ${data.displayName} (PIN ${pin}) → ${mapping.primaryRoleId}` +
      (custom.granted.length > 0 ? ` +${custom.granted.join(',')}` : '')
    );
    updated++;
  }

  console.log(`\n=== Hotovo ===`);
  console.log(`Permissions: ${PERMISSIONS.length}`);
  console.log(`Roles: ${ROLES.length}`);
  console.log(`Users updated: ${updated}`);
}

seed().catch(console.error);
