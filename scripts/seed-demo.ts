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

const ROLE_ID_BY_KEY: Record<string, string> = Object.fromEntries(ROLES.map(([id, key]) => [key, id]));

const DEMO_USERS = [
  { key: 'admin', name: 'Jan Novak', pin: '120001', role: 'SUPERADMIN', color: '#16a34a' },
  { key: 'maintenance', name: 'Eva Kralova', pin: '120002', role: 'UDRZBA', color: '#64748b' },
  { key: 'production', name: 'Tomas Svoboda', pin: '120003', role: 'VYROBA', color: '#d97706' },
  { key: 'warehouse', name: 'Lucie Dvorakova', pin: '120004', role: 'SKLADNIK', color: '#14b8a6' },
  { key: 'operator', name: 'Operator Demo', pin: '120005', role: 'OPERATOR', color: '#9ca3af' },
];

const ASSETS = [
  { id: 'demo-building-a', parentId: null, name: 'Vyrobni hala A', entityType: 'building', code: 'A', category: 'Budova', buildingId: 'A' },
  { id: 'demo-room-extrusion', parentId: 'demo-building-a', name: 'Extrudovna', entityType: 'room', code: 'A-101', category: 'Mistnost', buildingId: 'A', floor: '1.NP' },
  { id: 'demo-room-packaging', parentId: 'demo-building-a', name: 'Balirna', entityType: 'room', code: 'A-102', category: 'Mistnost', buildingId: 'A', floor: '1.NP' },
  { id: 'demo-room-warehouse', parentId: 'demo-building-a', name: 'Sklad surovin', entityType: 'room', code: 'A-103', category: 'Mistnost', buildingId: 'A', floor: '1.NP' },
  { id: 'demo-room-technical', parentId: 'demo-building-a', name: 'Technicka mistnost', entityType: 'room', code: 'A-104', category: 'Mistnost', buildingId: 'A', floor: '1.NP' },
  {
    id: 'demo-extruder-1', parentId: 'demo-room-extrusion', name: 'Extruder 1', entityType: 'machine',
    code: 'EXT-001', category: 'Extruder', buildingId: 'A', floor: '1.NP', location: 'Extrudovna',
    isProductionMachine: true, productionMachineType: 'extruder', productionLine: 'Linka A',
  },
  {
    id: 'demo-extruder-2', parentId: 'demo-room-extrusion', name: 'Extruder 2', entityType: 'machine',
    code: 'EXT-002', category: 'Extruder', buildingId: 'A', floor: '1.NP', location: 'Extrudovna',
    isProductionMachine: true, productionMachineType: 'extruder', productionLine: 'Linka A',
  },
  {
    id: 'demo-packer-1', parentId: 'demo-room-packaging', name: 'Balici linka 1', entityType: 'machine',
    code: 'BAL-001', category: 'Balicka', buildingId: 'A', floor: '1.NP', location: 'Balirna',
    isProductionMachine: true, productionMachineType: 'packaging', productionLine: 'Balirna',
  },
  {
    id: 'demo-gearbox-1', parentId: 'demo-extruder-1', name: 'Prevodovka 1', entityType: 'gearbox',
    code: 'GBX-001', category: 'Prevodovka', buildingId: 'A', location: 'Extruder 1', gearboxStatus: 'installed',
    currentExtruderId: 'demo-extruder-1', currentExtruderName: 'Extruder 1', lastTemperatureC: 58, lastMotorLoadAmps: 41.5,
  },
  {
    id: 'demo-gearbox-2', parentId: 'demo-room-technical', name: 'Prevodovka 2', entityType: 'gearbox',
    code: 'GBX-002', category: 'Prevodovka', buildingId: 'A', location: 'Sklad ND', gearboxStatus: 'in_stock',
    lastTemperatureC: 44, lastMotorLoadAmps: 0,
  },
  {
    id: 'demo-datalogger-1', parentId: 'demo-room-warehouse', name: 'Datalogger sklad surovin', entityType: 'datalogger',
    code: 'DLG-001', category: 'Datalogger', buildingId: 'A', location: 'Sklad surovin',
    minTemperatureC: 2, maxTemperatureC: 8, lastTemperatureC: 5.3, lastHumidityPct: 58,
  },
  {
    id: 'demo-hvac-1', parentId: 'demo-room-technical', name: 'Vzduchotechnika hala A', entityType: 'hvac',
    code: 'VZT-001', category: 'Vzduchotechnika', buildingId: 'A', location: 'Technicka mistnost',
  },
  {
    id: 'demo-pest-1', parentId: 'demo-room-warehouse', name: 'Hmyzolapac 1', entityType: 'hmyzolapac',
    code: 'PST-001', category: 'hmyzolapac', buildingId: 'A', roomName: 'Sklad surovin',
    location: 'Sklad surovin', checkIntervalDays: 30, lastFliesCount: 3,
  },
  {
    id: 'demo-forklift-1', parentId: 'demo-room-warehouse', name: 'VZV sklad 1', entityType: 'vehicle',
    code: 'VZV-001', category: 'VZV', buildingId: 'A', location: 'Sklad surovin',
  },
];

const INVENTORY = [
  { id: 'demo-inv-bearing-6205', code: 'LOZ-6205', name: 'Lozisko 6205-2RS', category: 'bearings', quantity: 6, minQuantity: 4, unit: 'ks', location: 'Regal A1', buildingId: 'A', status: 'ok' },
  { id: 'demo-inv-filter-g4', code: 'FIL-G4-592', name: 'Filtr G4 592x592', category: 'filters', quantity: 2, minQuantity: 6, unit: 'ks', location: 'Regal F2', buildingId: 'A', status: 'low' },
  { id: 'demo-inv-oil-food', code: 'OIL-FG-220', name: 'Food-grade olej 220', category: 'oils', quantity: 1, minQuantity: 3, unit: 'l', location: 'Chemicky sklad', buildingId: 'A', status: 'critical' },
];

const MATERIALS = [
  { id: 'demo-mat-rice', number: '001', nkCode: 'NK01', name: 'Ryze bila', active: true, usageCount: 12, allergens: [] },
  { id: 'demo-mat-corn', number: '002', nkCode: 'NK02', name: 'Kukurice', active: true, usageCount: 9, allergens: [] },
  { id: 'demo-mat-millet', number: '003', nkCode: 'NK03', name: 'Jahelne krupky', active: true, usageCount: 7, allergens: [] },
];

const PRODUCTS = [
  {
    id: 'demo-prod-rice-snack', number: '001', nkCode: 'NK001', name: 'Ryze extrudovana',
    active: true, usageCount: 8, targetMotorLoadAmps: 42,
    recipe: [{ materialId: 'demo-mat-rice', materialName: 'Ryze bila', ratio: 100 }],
  },
  {
    id: 'demo-prod-corn-snack', number: '002', nkCode: 'NK002', name: 'Kukuricne krupky',
    active: true, usageCount: 5, targetMotorLoadAmps: 45,
    recipe: [{ materialId: 'demo-mat-corn', materialName: 'Kukurice', ratio: 100 }],
  },
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

function daysFromNow(days: number): Timestamp {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return Timestamp.fromDate(d);
}

function daysAgo(days: number): Timestamp {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return Timestamp.fromDate(d);
}

function printUsage(): void {
  console.log([
    'Usage:',
    '  LOGIN_PEPPER=<same-as-functions-secret> npm run seed:demo -- --project=<firebase-project-id>',
    '',
    'Optional:',
    '  --tenantId=demo_firma',
    '  --company="Firma Demo s.r.o."',
    '  --appName="Demo CMMS"',
    '  --serviceAccount=serviceAccount.json',
    '  --pepper=<same-as-functions-secret>',
    '',
    'Creates fake users, assets, tasks, inventory, revisions, production data and inspection evidence.',
    'No real people, PINs or operational records are written.',
  ].join('\n'));
}

async function seedUsers(db: FirebaseFirestore.Firestore, auth: ReturnType<typeof getAuth>, tenantId: string, pepper: string, now: Timestamp) {
  for (const demo of DEMO_USERS) {
    const roleId = ROLE_ID_BY_KEY[demo.role];
    const email = `${demo.key}@${tenantId}.demo.local`;
    const permissions = ROLE_PERMISSIONS[demo.role] || [];
    let userRecord;
    try {
      userRecord = await auth.getUserByEmail(email);
      await auth.updateUser(userRecord.uid, {
        displayName: demo.name,
        disabled: false,
        password: randomBytes(24).toString('hex'),
      });
    } catch {
      userRecord = await auth.createUser({
        email,
        displayName: demo.name,
        disabled: false,
        password: randomBytes(24).toString('hex'),
      });
    }

    await auth.setCustomUserClaims(userRecord.uid, {
      role: demo.role,
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
      email,
      displayName: demo.name,
      role: demo.role,
      roleIds: [roleId],
      primaryRoleId: roleId,
      customPermissions: { granted: [], revoked: [] },
      scope: { buildings: ['*'], areas: ['*'] },
      phone: '',
      color: demo.color,
      active: true,
      isActive: true,
      isDeleted: false,
      plantId: tenantId,
      tenantId,
      pinLength: demo.pin.length,
      createdAt: userSnap.exists ? userSnap.data()?.createdAt || now : now,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    await db.collection('user_secrets').doc(userRecord.uid).set({
      pinHash: hashPin(demo.pin, pepper),
      pinLength: demo.pin.length,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: 'seed-demo',
    }, { merge: true });
  }
}

async function main() {
  const cli = parseArgs();
  if (cli.help || cli.h) {
    printUsage();
    return;
  }

  const tenantId = optional(cli, 'tenantId', 'demo_firma');
  const companyName = optional(cli, 'company', 'Firma Demo s.r.o.');
  const appName = optional(cli, 'appName', 'Demo CMMS');
  const projectId = optional(cli, 'project', process.env.GCLOUD_PROJECT || '');
  const pepper = String(cli.pepper || process.env.LOGIN_PEPPER || '').trim();
  const serviceAccount = typeof cli.serviceAccount === 'string' ? cli.serviceAccount : undefined;
  if (!pepper) throw new Error('Missing LOGIN_PEPPER env or --pepper=...; it must match Cloud Functions secret.');

  initializeApp({
    credential: loadServiceAccount(serviceAccount),
    ...(projectId ? { projectId } : {}),
  });
  const db = getFirestore();
  const auth = getAuth();
  const now = Timestamp.now();

  const permBatch = db.batch();
  for (const [id, module, action, label] of PERMISSIONS) {
    permBatch.set(db.collection('permissions').doc(id), {
      id, module, action, label, category: module, description: label,
      updatedAt: now, updatedBy: 'seed-demo',
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
      createdBy: 'seed-demo',
    }, { merge: true });
  }
  await roleBatch.commit();

  await db.collection('tenant_settings').doc(tenantId).set({
    name: companyName,
    appName,
    logoUrl: '',
    logoLetter: 'D',
    activeModules: MODULE_IDS,
    updatedAt: FieldValue.serverTimestamp(),
    updatedByName: 'seed-demo',
  }, { merge: true });

  await seedUsers(db, auth, tenantId, pepper, now);

  const assetBatch = db.batch();
  for (const asset of ASSETS) {
    assetBatch.set(db.collection('assets').doc(asset.id), {
      tenantId,
      status: 'operational',
      criticality: 'medium',
      isDeleted: false,
      createdAt: now,
      updatedAt: FieldValue.serverTimestamp(),
      ...asset,
    }, { merge: true });
  }
  await assetBatch.commit();

  const masterBatch = db.batch();
  for (const material of MATERIALS) {
    masterBatch.set(db.collection('materials').doc(material.id), {
      tenantId,
      approved: true,
      supplier: 'Demo Supplier s.r.o.',
      createdAt: now,
      updatedAt: FieldValue.serverTimestamp(),
      ...material,
    }, { merge: true });
  }
  for (const product of PRODUCTS) {
    masterBatch.set(db.collection('products').doc(product.id), {
      tenantId,
      packaging: 'sacek 100 g',
      shelfLifeMonths: 12,
      createdAt: now,
      updatedAt: FieldValue.serverTimestamp(),
      ...product,
    }, { merge: true });
  }
  await masterBatch.commit();

  const dataBatch = db.batch();
  for (const item of INVENTORY) {
    dataBatch.set(db.collection('inventory').doc(item.id), {
      tenantId,
      maxQuantity: item.minQuantity * 4,
      compatibleAssetIds: [],
      compatibleAssetNames: [],
      linkedMachineIds: [],
      isDeleted: false,
      createdAt: now,
      updatedAt: FieldValue.serverTimestamp(),
      ...item,
    }, { merge: true });
  }

  const tasks = [
    {
      id: 'demo-task-001', code: 'WO-2026-D01', title: 'Zkontrolovat vibrace prevodovky',
      description: 'Demo zavada z kiosku. Prevodovka ma neobvykly zvuk pri rozjezdu.',
      type: 'corrective', status: 'in_progress', priority: 'P1', source: 'kiosk',
      assetId: 'demo-gearbox-1', assetName: 'Prevodovka 1', relatedAssetId: 'demo-extruder-1',
      relatedAssetName: 'Extruder 1', buildingId: 'A', assigneeName: 'Eva Kralova',
    },
    {
      id: 'demo-task-002', code: 'WO-2026-D02', title: 'Vymena filtru VZT',
      description: 'Preventivni vymena filtru pred terminem auditu.',
      type: 'preventive', status: 'planned', priority: 'P2', source: 'scheduled',
      assetId: 'demo-hvac-1', assetName: 'Vzduchotechnika hala A', buildingId: 'A', assigneeName: 'Eva Kralova',
    },
    {
      id: 'demo-task-003', code: 'WO-2026-D03', title: 'Doplnit food-grade olej',
      description: 'Sklad je pod minimem. Vytvoreno jako demo notifikace skladu.',
      type: 'corrective', status: 'backlog', priority: 'P3', source: 'web',
      buildingId: 'A', assigneeName: 'Lucie Dvorakova',
    },
  ];

  for (const task of tasks) {
    dataBatch.set(db.collection('tasks').doc(task.id), {
      tenantId,
      createdById: 'seed-demo',
      createdByName: 'Seed Demo',
      createdAt: now,
      updatedAt: FieldValue.serverTimestamp(),
      estimatedMinutes: 45,
      ...task,
    }, { merge: true });
  }

  const revisions = [
    {
      id: 'demo-rev-electro', title: 'Revize rozvadece hala A', type: 'electrical',
      assetId: 'demo-room-technical', assetName: 'Technicka mistnost', buildingId: 'A',
      nextRevisionDate: daysFromNow(25), lastRevisionDate: daysAgo(340), status: 'expiring',
      revisionCompany: 'Revize Demo s.r.o.', technicianName: 'Karel Technik',
    },
    {
      id: 'demo-rev-forklift', title: 'Revize VZV sklad 1', type: 'lifting',
      assetId: 'demo-forklift-1', assetName: 'VZV sklad 1', buildingId: 'A',
      nextRevisionDate: daysFromNow(80), lastRevisionDate: daysAgo(285), status: 'valid',
      revisionCompany: 'Servis Demo s.r.o.', technicianName: 'Pavel Revizak',
    },
  ];
  for (const revision of revisions) {
    dataBatch.set(db.collection('revisions').doc(revision.id), {
      tenantId,
      intervalMonths: 12,
      certificateNumber: `DEMO-${revision.id}`,
      notes: 'Fiktivni revizni zaznam pro demo instanci.',
      createdAt: now,
      updatedAt: FieldValue.serverTimestamp(),
      ...revision,
    }, { merge: true });
  }

  const productionRows = [
    {
      id: 'demo-prod-run-001', batchId: 'EX-DEMO-001', planDate: new Date().toISOString().slice(0, 10),
      productionArea: 'extrudovna', productionAreaLabel: 'Extrudovna', rawMaterial: 'Ryze bila',
      productId: 'demo-prod-rice-snack', productName: 'Ryze extrudovana', productBatch: 'sk001140626',
      materialId: 'demo-mat-rice', materialName: 'Ryze bila', materialBatch: 'nk01060626-A',
      targetMotorLoadAmps: 42, targetWeight: 850, machineId: 'demo-extruder-1', machineName: 'Extruder 1',
      machineIds: ['demo-extruder-1'], machineNames: ['Extruder 1'], status: 'running',
    },
    {
      id: 'demo-prod-run-002', batchId: 'EX-DEMO-002', planDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      productionArea: 'extrudovna', productionAreaLabel: 'Extrudovna', rawMaterial: 'Kukurice',
      productId: 'demo-prod-corn-snack', productName: 'Kukuricne krupky', productBatch: 'sk002150626',
      materialId: 'demo-mat-corn', materialName: 'Kukurice', materialBatch: 'nk02060626-A',
      targetMotorLoadAmps: 45, targetWeight: 650, machineId: 'demo-extruder-2', machineName: 'Extruder 2',
      machineIds: ['demo-extruder-2'], machineNames: ['Extruder 2'], status: 'planned',
    },
  ];
  for (const row of productionRows) {
    dataBatch.set(db.collection('production_extrusion').doc(row.id), {
      tenantId,
      mixingRecipeSnapshot: [],
      mixingNote: '',
      note: 'Demo vyrobni davka.',
      shiftLog: '',
      createdById: 'seed-demo',
      createdByName: 'Seed Demo',
      createdAt: now,
      updatedAt: FieldValue.serverTimestamp(),
      startedAt: row.status === 'running' ? now : null,
      completedAt: null,
      ...row,
    }, { merge: true });
  }

  const inspectionRun = {
    id: 'demo-inspection-run-001',
    scope: { buildingId: 'A', label: 'Vyrobni hala A' },
    status: 'closed',
    startedAt: daysAgo(2),
    startedBy: { id: 'seed-demo', name: 'Seed Demo' },
    closedAt: daysAgo(2),
    closedBy: { id: 'seed-demo', name: 'Seed Demo' },
    summary: { total: 4, ok: 3, defects: 1 },
    items: [
      { roomId: 'demo-room-extrusion', roomCode: 'A-101', roomName: 'Extrudovna', status: 'ok', note: 'Podlahy a stroje bez nalezu.' },
      { roomId: 'demo-room-packaging', roomCode: 'A-102', roomName: 'Balirna', status: 'defect', note: 'Poskozene znaceni u vstupu.', taskId: 'demo-task-004' },
      { roomId: 'demo-room-warehouse', roomCode: 'A-103', roomName: 'Sklad surovin', status: 'ok', note: 'Teplota a regaly OK.' },
      { roomId: 'demo-room-technical', roomCode: 'A-104', roomName: 'Technicka mistnost', status: 'ok', note: 'Rozvadece uzavrene.' },
    ],
    tenantId,
    createdAt: now,
    updatedAt: FieldValue.serverTimestamp(),
  };
  dataBatch.set(db.collection('inspection_runs').doc(inspectionRun.id), inspectionRun, { merge: true });

  dataBatch.set(db.collection('tasks').doc('demo-task-004'), {
    tenantId,
    code: 'WO-2026-D04',
    title: 'Opravit znaceni u vstupu do balirny',
    description: 'Zalozeno z demo kontroly budovy.',
    type: 'inspection',
    status: 'backlog',
    priority: 'P2',
    source: 'inspection',
    sourceRefType: 'inspection_log',
    sourceRefId: inspectionRun.id,
    assetId: 'demo-room-packaging',
    assetName: 'Balirna',
    buildingId: 'A',
    createdById: 'seed-demo',
    createdByName: 'Seed Demo',
    createdAt: now,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  await dataBatch.commit();

  await db.collection('assets').doc('demo-pest-1').collection('pest_logs').doc('demo-pest-log-001').set({
    date: new Date().toISOString().slice(0, 10),
    fliesCount: 3,
    inspectorId: 'seed-demo',
    inspectorName: 'Seed Demo',
    note: 'Demo kontrola muchomisky.',
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  await db.collection('datalogger_temperature_logs').doc('demo-dl-log-001').set({
    assetId: 'demo-datalogger-1',
    assetName: 'Datalogger sklad surovin',
    temperatureC: 5.3,
    humidityPct: 58,
    measuredAt: now,
    createdAt: FieldValue.serverTimestamp(),
    userId: 'seed-demo',
    userName: 'Seed Demo',
    note: 'Demo zapis skladove teploty.',
  }, { merge: true });

  await db.collection('gearbox_temperature_logs').doc('demo-gb-log-001').set({
    assetId: 'demo-gearbox-1',
    assetName: 'Prevodovka 1',
    temperatureC: 58,
    motorLoadAmps: 41.5,
    productId: 'demo-prod-rice-snack',
    productName: 'Ryze extrudovana',
    measuredAt: now,
    createdAt: FieldValue.serverTimestamp(),
    userId: 'seed-demo',
    userName: 'Seed Demo',
    note: 'Demo zapis prevodovky.',
  }, { merge: true });

  console.log(`Demo tenant: ${tenantId}`);
  console.log(`Users: ${DEMO_USERS.length}`);
  console.log(`Assets: ${ASSETS.length}`);
  console.log(`Tasks: ${tasks.length + 1}`);
  console.log(`Inventory: ${INVENTORY.length}`);
  console.log(`Products: ${PRODUCTS.length}; materials: ${MATERIALS.length}`);
  console.log('Demo PINs: admin=120001, maintenance=120002, production=120003, warehouse=120004, operator=120005');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
