// scripts/seed-firestore.ts
// NOMINAL CMMS — Seed script pro inicializaci databáze
// Spuštění: npx ts-node scripts/seed-firestore.ts

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

// ═══════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════

// Cesta k service account JSON
const serviceAccount = require('../serviceAccountKey.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

// ═══════════════════════════════════════════════════════════════════
// DATA
// ═══════════════════════════════════════════════════════════════════

const USERS = [
  { id: 'user-milan', displayName: 'Milan Novák', pin: '1111', role: 'MAJITEL', color: '#f59e0b', active: true },
  { id: 'user-martina', displayName: 'Martina', pin: '2222', role: 'VEDENI', color: '#3b82f6', active: true },
  { id: 'user-vilem', displayName: 'Vilém', pin: '3333', role: 'SUPERADMIN', color: '#16a34a', active: true },
  { id: 'user-pavla', displayName: 'Pavla Drápelová', pin: '4444', role: 'VYROBA', color: '#d97706', active: true },
  { id: 'user-zdenek', displayName: 'Zdeněk Mička', pin: '5555', role: 'UDRZBA', color: '#64748b', active: true },
  { id: 'user-petr', displayName: 'Petr Volf', pin: '6666', role: 'UDRZBA', color: '#0ea5e9', active: true },
  { id: 'user-filip', displayName: 'Filip Novák', pin: '7777', role: 'UDRZBA', color: '#8b5cf6', active: true },
  { id: 'user-kiosk', displayName: 'Kiosk Velín', pin: '0000', role: 'OPERATOR', color: '#6b7280', active: true },
];

const ASSETS = [
  // Budova D - Výroba
  { id: 'ast-ext1', code: 'EXT-001', name: 'Extruder 1', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Velín extruze' },
  { id: 'ast-ext2', code: 'EXT-002', name: 'Extruder 2', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Velín extruze' },
  { id: 'ast-mix1', code: 'MIX-001', name: 'Míchárna 1', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Míchací centrum' },
  { id: 'ast-mix2', code: 'MIX-002', name: 'Míchárna 2', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Míchací centrum' },
  { id: 'ast-mix3', code: 'MIX-003', name: 'Míchárna 3', type: 'machine', status: 'maintenance', buildingId: 'D', areaName: 'Míchací centrum' },
  { id: 'ast-pack1', code: 'BAL-001', name: 'Balička Karel', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Balírna' },
  { id: 'ast-pack2', code: 'BAL-002', name: 'Balička Lojza', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Balírna' },
  { id: 'ast-pack3', code: 'BAL-003', name: 'Balička U Agáty', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Balírna' },
  { id: 'ast-mill', code: 'MLN-001', name: 'Mlýn', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Mlýn' },
  { id: 'ast-comp1', code: 'KMP-001', name: 'Kompresor 1', type: 'infrastructure', status: 'operational', buildingId: 'D', areaName: 'Kompresorovna' },
  { id: 'ast-comp2', code: 'KMP-002', name: 'Kompresor 2', type: 'infrastructure', status: 'operational', buildingId: 'D', areaName: 'Kompresorovna' },
  { id: 'ast-boiler', code: 'KOT-001', name: 'Kotel', type: 'infrastructure', status: 'operational', buildingId: 'D', areaName: 'Kotelna' },
  { id: 'ast-kgj', code: 'KGJ-001', name: 'Kogenerační jednotka', type: 'infrastructure', status: 'operational', buildingId: 'D', areaName: 'KGJ' },
  
  // Budova L - Loupárna
  { id: 'ast-silo1', code: 'SIL-001', name: 'Silo 1', type: 'infrastructure', status: 'operational', buildingId: 'L', areaName: 'Sila' },
  { id: 'ast-silo2', code: 'SIL-002', name: 'Silo 2', type: 'infrastructure', status: 'operational', buildingId: 'L', areaName: 'Sila' },
  { id: 'ast-silo3', code: 'SIL-003', name: 'Silo 3', type: 'infrastructure', status: 'operational', buildingId: 'L', areaName: 'Sila' },
  { id: 'ast-silo4', code: 'SIL-004', name: 'Silo 4', type: 'infrastructure', status: 'operational', buildingId: 'L', areaName: 'Sila' },
  { id: 'ast-peeler', code: 'LOU-001', name: 'Loupací linka', type: 'machine', status: 'operational', buildingId: 'L', areaName: 'Loupací linka' },
];

const FLEET = [
  { id: 'flt-vzv1', code: 'VZV-01', name: 'VZV Toyota', type: 'forklift', status: 'available', buildingId: 'D', areaName: 'Balírna' },
  { id: 'flt-vzv2', code: 'VZV-02', name: 'VZV Linde', type: 'forklift', status: 'available', buildingId: 'D', areaName: 'Sklad' },
  { id: 'flt-vzv3', code: 'VZV-03', name: 'VZV Still', type: 'forklift', status: 'available', buildingId: 'L', areaName: 'Sklad' },
  { id: 'flt-jcb', code: 'JCB-01', name: 'JCB 3CX', type: 'loader', status: 'available', buildingId: 'E', areaName: 'Garáž' },
  { id: 'flt-nh', code: 'NH-01', name: 'New Holland T5', type: 'tractor', status: 'available', buildingId: 'L', areaName: 'Pole' },
  { id: 'flt-shib', code: 'SHI-01', name: 'Shibaura ST450', type: 'tractor', status: 'available', buildingId: 'E', areaName: 'Garáž' },
  { id: 'flt-sek1', code: 'SEK-01', name: 'Sekačka Husqvarna', type: 'mower', status: 'available', buildingId: 'E', areaName: 'Garáž' },
  { id: 'flt-sek2', code: 'SEK-02', name: 'Sekačka Viking', type: 'mower', status: 'maintenance', buildingId: 'E', areaName: 'Garáž' },
];

const INVENTORY = [
  { id: 'inv-skf6205', code: 'SKF 6205', name: 'Ložisko SKF 6205', category: 'bearing', quantity: 8, minQuantity: 5, unit: 'ks' },
  { id: 'inv-skf6208', code: 'SKF 6208', name: 'Ložisko SKF 6208', category: 'bearing', quantity: 3, minQuantity: 3, unit: 'ks' },
  { id: 'inv-belt1', code: 'BELT-A68', name: 'Klínový řemen A68', category: 'belt', quantity: 12, minQuantity: 4, unit: 'ks' },
  { id: 'inv-filter1', code: 'FLT-AIR-01', name: 'Vzduchový filtr kompresor', category: 'filter', quantity: 2, minQuantity: 4, unit: 'ks' },
  { id: 'inv-oil1', code: 'OIL-HYD-46', name: 'Hydraulický olej HLP 46', category: 'lubricant', quantity: 40, minQuantity: 20, unit: 'l' },
  { id: 'inv-grease', code: 'GRS-LI-01', name: 'Mazivo lithiové', category: 'lubricant', quantity: 5, minQuantity: 2, unit: 'kg' },
  { id: 'inv-fuse', code: 'FUS-10A', name: 'Pojistka 10A', category: 'electrical', quantity: 20, minQuantity: 10, unit: 'ks' },
  { id: 'inv-brush', code: 'BRS-NYL-01', name: 'Kartáč nylonový', category: 'tool', quantity: 6, minQuantity: 3, unit: 'ks' },
  { id: 'inv-gloves', code: 'GLV-NITRIL', name: 'Rukavice nitrilové', category: 'safety', quantity: 50, minQuantity: 30, unit: 'ks' },
  { id: 'inv-ejector', code: 'EJC-01', name: 'Vyražeč', category: 'tool', quantity: 4, minQuantity: 2, unit: 'ks' },
];

const REVISIONS = [
  { 
    id: 'rev-fire', 
    type: 'FIRE', 
    name: 'Hasicí přístroje', 
    buildingId: 'D',
    intervalMonths: 12,
    nextRevisionAt: Timestamp.fromDate(new Date('2026-03-01')),
    provider: 'PYRO s.r.o.',
  },
  { 
    id: 'rev-elec', 
    type: 'ELEC', 
    name: 'Elektrická zařízení', 
    buildingId: 'D',
    intervalMonths: 36,
    nextRevisionAt: Timestamp.fromDate(new Date('2026-06-15')),
    provider: 'ElektroRevize CZ',
  },
  { 
    id: 'rev-scale', 
    type: 'CALIBRATION', 
    name: 'Kalibrace vah', 
    buildingId: 'D',
    intervalMonths: 12,
    nextRevisionAt: Timestamp.fromDate(new Date('2026-02-28')),
    provider: 'MetroCal',
  },
  { 
    id: 'rev-lift', 
    type: 'LIFT', 
    name: 'Zdvihací zařízení', 
    buildingId: 'D',
    intervalMonths: 12,
    nextRevisionAt: Timestamp.fromDate(new Date('2026-09-01')),
    provider: 'TÜV SÜD',
  },
];

const TASKS = [
  {
    id: 'tsk-001',
    code: 'WO-2026-001',
    title: 'Výměna ložiska Extruder 1',
    description: 'Hluk z hlavního ložiska, nutná výměna',
    type: 'corrective',
    status: 'in_progress',
    priority: 'P1',
    source: 'kiosk',
    assetId: 'ast-ext1',
    assetName: 'Extruder 1',
    buildingId: 'D',
    assigneeId: 'user-vilem',
    assigneeName: 'Vilém',
    assigneeColor: '#16a34a',
    createdById: 'user-zdenek',
    createdByName: 'Zdeněk',
    createdAt: Timestamp.fromDate(new Date('2026-02-13T08:30:00')),
  },
  {
    id: 'tsk-002',
    code: 'WO-2026-002',
    title: 'Preventivní údržba Balička Karel',
    type: 'preventive',
    status: 'planned',
    priority: 'P3',
    source: 'scheduled',
    assetId: 'ast-pack1',
    assetName: 'Balička Karel',
    buildingId: 'D',
    assigneeId: 'user-zdenek',
    assigneeName: 'Zdeněk',
    assigneeColor: '#64748b',
    createdById: 'user-vilem',
    createdByName: 'Vilém',
    createdAt: Timestamp.fromDate(new Date('2026-02-10T10:00:00')),
    plannedWeek: '2026-W08',
  },
  {
    id: 'tsk-003',
    code: 'WO-2026-003',
    title: 'Únik oleje Kompresor 2',
    description: 'Malý únik u těsnění',
    type: 'corrective',
    status: 'backlog',
    priority: 'P2',
    source: 'web',
    assetId: 'ast-comp2',
    assetName: 'Kompresor 2',
    buildingId: 'D',
    createdById: 'user-petr',
    createdByName: 'Petr',
    createdAt: Timestamp.fromDate(new Date('2026-02-14T14:20:00')),
  },
];

const SETTINGS = {
  id: 'global',
  currentZone: 'gluten',
  currentWeek: '2026-W07',
  weekPlanLocked: false,
  maintenanceMode: false,
  updatedAt: Timestamp.now(),
};

// ═══════════════════════════════════════════════════════════════════
// SEED FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

async function seedCollection(collectionName: string, data: any[]) {
  console.log(`📝 Seeding ${collectionName}...`);
  
  const batch = db.batch();
  
  for (const item of data) {
    const { id, ...rest } = item;
    const ref = db.collection(collectionName).doc(id);
    batch.set(ref, {
      ...rest,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  }
  
  await batch.commit();
  console.log(`✅ ${collectionName}: ${data.length} documents`);
}

async function seedSettings() {
  console.log(`📝 Seeding settings...`);
  await db.collection('settings').doc(SETTINGS.id).set(SETTINGS);
  console.log(`✅ settings: 1 document`);
}

async function main() {
  console.log('🚀 Starting NOMINAL CMMS seed...\n');
  
  try {
    await seedCollection('users', USERS);
    await seedCollection('assets', ASSETS);
    await seedCollection('fleet', FLEET);
    await seedCollection('inventory', INVENTORY);
    await seedCollection('revisions', REVISIONS);
    await seedCollection('tasks', TASKS);
    await seedSettings();
    
    console.log('\n✅ Seed completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`   Users: ${USERS.length}`);
    console.log(`   Assets: ${ASSETS.length}`);
    console.log(`   Fleet: ${FLEET.length}`);
    console.log(`   Inventory: ${INVENTORY.length}`);
    console.log(`   Revisions: ${REVISIONS.length}`);
    console.log(`   Tasks: ${TASKS.length}`);
    
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

main();
