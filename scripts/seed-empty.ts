import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHmac, randomBytes } from 'node:crypto';
import { applicationDefault, cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';

type Cli = Record<string, string | boolean>;

const MODULE_IDS = [
  'fault', 'tasks', 'calendar', 'noticeboard', 'idea', 'request', 'academy',
  'inventory', 'revisions', 'fleet', 'hvac', 'gearboxes', 'dataloggers',
  'inspections', 'production', 'warehouse', 'shifts', 'ai', 'reports', 'admin',
];

const PERMISSIONS = [
  ['wo.create', 'tasks', 'create', 'Create task'],
  ['wo.update', 'tasks', 'update', 'Update task'],
  ['wo.delete', 'tasks', 'delete', 'Delete task'],
  ['wo.read', 'tasks', 'read', 'Read tasks'],
  ['wo.approve', 'tasks', 'approve', 'Approve task'],
  ['wo.close', 'tasks', 'close', 'Close task'],
  ['wo.plan', 'tasks', 'plan', 'Plan task'],
  ['wo.assign', 'tasks', 'assign', 'Assign task'],
  ['asset.create', 'assets', 'create', 'Create asset'],
  ['asset.update', 'assets', 'update', 'Update asset'],
  ['asset.delete', 'assets', 'delete', 'Delete asset'],
  ['asset.read', 'assets', 'read', 'Read assets'],
  ['gearbox.temperature.write', 'gearboxes', 'temperature.write', 'Write gearbox temperature'],
  ['gearbox.manage', 'gearboxes', 'manage', 'Manage gearboxes'],
  ['inv.consume', 'inventory', 'consume', 'Consume inventory'],
  ['inv.restock', 'inventory', 'restock', 'Restock inventory'],
  ['inv.manage', 'inventory', 'manage', 'Manage inventory'],
  ['inv.approve', 'inventory', 'approve', 'Approve inventory'],
  ['inv.order', 'inventory', 'order', 'Order inventory'],
  ['fleet.manage', 'fleet', 'manage', 'Manage fleet'],
  ['fleet.read', 'fleet', 'read', 'Read fleet'],
  ['hvac.read', 'hvac', 'read', 'Read HVAC'],
  ['hvac.manage', 'hvac', 'manage', 'Manage HVAC'],
  ['datalogger.read', 'dataloggers', 'read', 'Read dataloggers'],
  ['datalogger.temperature.write', 'dataloggers', 'temperature.write', 'Write datalogger temperature'],
  ['datalogger.manage', 'dataloggers', 'manage', 'Manage dataloggers'],
  ['user.manage', 'users', 'manage', 'Manage users'],
  ['user.read', 'users', 'read', 'Read users'],
  ['zone.change', 'zones', 'change', 'Change zones'],
  ['report.read', 'reports', 'read', 'Read reports'],
  ['report.export', 'reports', 'export', 'Export reports'],
  ['audit.read', 'audit', 'read', 'Read audit'],
  ['weekly.modify', 'inspections', 'modify', 'Modify inspections'],
  ['finance.view', 'finance', 'view', 'View finance'],
  ['secretbox.view', 'trustbox', 'view', 'View trustbox'],
  ['purchase.approve', 'purchase', 'approve', 'Approve purchase'],
  ['ai.use', 'ai', 'use', 'Use AI'],
  ['schedule.manage', 'schedule', 'manage', 'Manage schedule'],
  ['production.read', 'production', 'read', 'Read production'],
  ['production.manage', 'production', 'manage', 'Manage production'],
  ['admin.view', 'admin', 'view', 'View admin'],
  ['admin.manage', 'admin', 'manage', 'Manage admin'],
  ['warehouse.view', 'warehouse', 'view', 'View warehouse'],
  ['warehouse.manage', 'warehouse', 'manage', 'Manage warehouse'],
  ['shifts.view', 'shifts', 'view', 'View shifts'],
  ['shifts.manage', 'shifts', 'manage', 'Manage shifts'],
];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  MAJITEL: [
    'wo.read', 'asset.read', 'datalogger.read', 'fleet.read', 'user.read',
    'report.read', 'report.export', 'audit.read', 'finance.view', 'secretbox.view',
    'purchase.approve', 'ai.use', 'admin.view', 'warehouse.view', 'shifts.view',
  ],
  VEDENI: [
    'wo.read', 'wo.approve', 'asset.read', 'datalogger.read', 'fleet.manage', 'fleet.read',
    'user.manage', 'user.read', 'report.read', 'report.export', 'audit.read',
    'finance.view', 'purchase.approve', 'weekly.modify', 'ai.use', 'admin.view',
    'warehouse.view', 'warehouse.manage', 'shifts.view', 'shifts.manage',
  ],
  SUPERADMIN: [
    'wo.create', 'wo.update', 'wo.delete', 'wo.read', 'wo.approve', 'wo.close', 'wo.plan', 'wo.assign',
    'asset.create', 'asset.update', 'asset.delete', 'asset.read',
    'gearbox.temperature.write', 'gearbox.manage',
    'datalogger.read', 'datalogger.temperature.write', 'datalogger.manage',
    'inv.consume', 'inv.restock', 'inv.manage', 'inv.order',
    'fleet.manage', 'fleet.read', 'user.manage', 'user.read', 'zone.change',
    'report.read', 'report.export', 'audit.read', 'weekly.modify', 'ai.use',
    'schedule.manage', 'production.manage', 'admin.view', 'admin.manage',
    'warehouse.view', 'warehouse.manage', 'shifts.view', 'shifts.manage',
  ],
  UDRZBA: [
    'wo.create', 'wo.update', 'wo.read', 'wo.close', 'asset.read', 'asset.update',
    'gearbox.temperature.write', 'gearbox.manage',
    'datalogger.read', 'datalogger.temperature.write', 'datalogger.manage',
    'inv.consume', 'inv.restock', 'fleet.read', 'report.read', 'ai.use',
    'schedule.manage', 'production.manage', 'warehouse.view', 'warehouse.manage',
    'shifts.view', 'shifts.manage',
  ],
  VYROBA: [
    'wo.create', 'wo.read', 'wo.approve', 'wo.plan', 'asset.read',
    'gearbox.temperature.write', 'zone.change', 'weekly.modify', 'report.read',
    'production.manage', 'warehouse.view', 'warehouse.manage', 'shifts.view', 'shifts.manage',
  ],
  SKLADNIK: [
    'wo.create', 'wo.update', 'wo.read', 'asset.read', 'inv.consume', 'inv.restock',
    'inv.manage', 'inv.order', 'datalogger.read', 'datalogger.temperature.write',
    'report.read', 'schedule.manage',
  ],
  OPERATOR: ['wo.create', 'wo.read', 'asset.read', 'production.read', 'gearbox.temperature.write'],
};

const ROLES = [
  ['role_superadmin', 'SUPERADMIN', 'Superadmin', '#16a34a', 'Shield'],
  ['role_majitel', 'MAJITEL', 'Owner', '#7c3aed', 'Crown'],
  ['role_vedeni', 'VEDENI', 'Management', '#2563eb', 'Users'],
  ['role_udrzba', 'UDRZBA', 'Maintenance', '#64748b', 'Wrench'],
  ['role_skladnik', 'SKLADNIK', 'Warehouse', '#14b8a6', 'Package'],
  ['role_vyroba', 'VYROBA', 'Production', '#d97706', 'Factory'],
  ['role_operator', 'OPERATOR', 'Operator', '#9ca3af', 'Monitor'],
];

function parseArgs(): Cli {
  const out: Cli = {};
  for (const arg of process.argv.slice(2)) {
    if (!arg.startsWith('--')) continue;
    const [rawKey, ...rest] = arg.slice(2).split('=');
    out[rawKey] = rest.length ? rest.join('=') : true;
  }
  return out;
}

function required(cli: Cli, key: string): string {
  const value = String(cli[key] || process.env[key.toUpperCase()] || '').trim();
  if (!value) throw new Error(`Missing --${key}=...`);
  return value;
}

function optional(cli: Cli, key: string, fallback: string): string {
  return String(cli[key] || process.env[key.toUpperCase()] || fallback).trim();
}

function loadServiceAccount(pathFromCli?: string) {
  const candidates = [
    pathFromCli,
    'serviceAccount.json',
    'serviceAccountKey.json',
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const absolute = resolve(candidate);
    if (existsSync(absolute)) {
      return cert(JSON.parse(readFileSync(absolute, 'utf8')));
    }
  }
  return applicationDefault();
}

function hashPin(pin: string, pepper: string): string {
  return createHmac('sha256', pepper).update(pin).digest('hex');
}

function assertPin(pin: string): void {
  if (!/^\d{4,6}$/.test(pin)) throw new Error('Admin PIN must be 4-6 digits.');
}

function printUsage(): void {
  console.log([
    'Usage:',
    '  LOGIN_PEPPER=<same-as-functions-secret> npm run seed:empty -- --adminName="Admin" --adminPin=123456 --company="Firma s.r.o."',
    '',
    'Optional:',
    '  --project=<firebase-project-id>',
    '  --tenantId=main_firm',
    '  --appName="Company CMMS"',
    '  --adminEmail=admin@company.local',
    '  --serviceAccount=serviceAccount.json',
    '  --pepper=<same-as-functions-secret>',
    '',
    'Writes roles, permissions, tenant_settings, one SUPERADMIN user and user_secrets pinHash.',
    'Does not seed operational data and does not store plaintext PIN in users.',
  ].join('\n'));
}

async function main() {
  const cli = parseArgs();
  if (cli.help || cli.h) {
    printUsage();
    return;
  }

  const tenantId = optional(cli, 'tenantId', 'main_firm');
  const companyName = optional(cli, 'company', 'New Company');
  const appName = optional(cli, 'appName', companyName);
  const adminName = required(cli, 'adminName');
  const adminPin = required(cli, 'adminPin');
  const adminEmail = optional(cli, 'adminEmail', `admin@${tenantId}.local`);
  const projectId = optional(cli, 'project', process.env.GCLOUD_PROJECT || '');
  const pepper = String(cli.pepper || process.env.LOGIN_PEPPER || '').trim();
  const serviceAccount = typeof cli.serviceAccount === 'string' ? cli.serviceAccount : undefined;

  assertPin(adminPin);
  if (!pepper) throw new Error('Missing LOGIN_PEPPER env or --pepper=...; it must match Cloud Functions secret.');

  initializeApp({
    credential: loadServiceAccount(serviceAccount),
    ...(projectId ? { projectId } : {}),
  });
  const db = getFirestore();
  const auth = getAuth();
  const now = Timestamp.now();

  console.log(`Seeding empty company: ${companyName} (${tenantId})`);

  const permBatch = db.batch();
  for (const [id, module, action, label] of PERMISSIONS) {
    permBatch.set(db.collection('permissions').doc(id), {
      id, module, action, label, category: module, description: label,
      updatedAt: now, updatedBy: 'seed-empty',
    }, { merge: true });
  }
  await permBatch.commit();

  const roleBatch = db.batch();
  for (const [id, roleKey, name, color, icon] of ROLES) {
    roleBatch.set(db.collection('roles').doc(id), {
      id,
      name,
      description: `${name} role`,
      color,
      icon,
      isSystem: true,
      isDeleted: false,
      permissions: ROLE_PERMISSIONS[roleKey],
      defaultScope: { buildings: ['*'], areas: ['*'] },
      defaultWidgets: [],
      defaultKioskButtons: roleKey === 'OPERATOR' ? ['report_fault'] : [],
      createdAt: now,
      updatedAt: now,
      createdBy: 'seed-empty',
    }, { merge: true });
  }
  await roleBatch.commit();

  await db.collection('tenant_settings').doc(tenantId).set({
    name: companyName,
    appName,
    logoUrl: '',
    logoLetter: companyName.slice(0, 1).toUpperCase() || 'N',
    activeModules: MODULE_IDS,
    updatedAt: FieldValue.serverTimestamp(),
    updatedByName: 'seed-empty',
  }, { merge: true });

  const roleId = 'role_superadmin';
  const permissions = ROLE_PERMISSIONS.SUPERADMIN;
  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(adminEmail);
    await auth.updateUser(userRecord.uid, {
      displayName: adminName,
      disabled: false,
      password: randomBytes(24).toString('hex'),
    });
  } catch {
    userRecord = await auth.createUser({
      email: adminEmail,
      displayName: adminName,
      disabled: false,
      password: randomBytes(24).toString('hex'),
    });
  }

  await auth.setCustomUserClaims(userRecord.uid, {
    role: 'SUPERADMIN',
    roleIds: [roleId],
    primaryRoleId: roleId,
    permissions,
    plantId: tenantId,
    tenantId,
  });

  const userRef = db.collection('users').doc(userRecord.uid);
  const userSnap = await userRef.get();
  await userRef.set({
    uid: userRecord.uid,
    email: adminEmail,
    displayName: adminName,
    role: 'SUPERADMIN',
    roleIds: [roleId],
    primaryRoleId: roleId,
    customPermissions: { granted: [], revoked: [] },
    scope: { buildings: ['*'], areas: ['*'] },
    phone: '',
    color: '#16a34a',
    active: true,
    isActive: true,
    isDeleted: false,
    plantId: tenantId,
    tenantId,
    pinLength: adminPin.length,
    createdAt: userSnap.exists ? userSnap.data()?.createdAt || now : now,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  await db.collection('user_secrets').doc(userRecord.uid).set({
    pinHash: hashPin(adminPin, pepper),
    pinLength: adminPin.length,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: 'seed-empty',
  }, { merge: true });

  console.log(`Permissions: ${PERMISSIONS.length}`);
  console.log(`Roles: ${ROLES.length}`);
  console.log(`Admin UID: ${userRecord.uid}`);
  console.log('Operational data seeded: 0');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
