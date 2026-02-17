// scripts/seed-entities.ts
// NOMINAL CMMS — Seed blueprints + entity vozidel (klientský Firebase SDK)
// Spusť: npx tsx scripts/seed-entities.ts

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc, Timestamp } from 'firebase/firestore';

const app = initializeApp({
  apiKey: 'AIzaSyDPdaXYoHvU3usmPRurKmlUqNk7atiUEsc',
  authDomain: 'nominal-cmms.firebaseapp.com',
  projectId: 'nominal-cmms',
  storageBucket: 'nominal-cmms.firebasestorage.app',
  messagingSenderId: '756412471928',
  appId: '1:756412471928:web:dd340536ee3e97e2172b8d',
});

const auth = getAuth(app);
const db = getFirestore(app);

// ═══════════════════════════════════════════
// BLUEPRINT: VEHICLE
// ═══════════════════════════════════════════

const VEHICLE_BLUEPRINT = {
  type: 'vehicle',
  label: 'Vozidlo',
  icon: 'Car',
  color: '#3b82f6',
  fields: [
    { key: 'registration', label: 'SPZ', type: 'text', required: true },
    { key: 'vin', label: 'VIN', type: 'text', required: false },
    { key: 'stk_date', label: 'STK platnost', type: 'date', required: true,
      alert: { warningDays: 30, criticalDays: 7 } },
    { key: 'insurance_date', label: 'Pojištění do', type: 'date', required: true,
      alert: { warningDays: 30, criticalDays: 7 } },
    { key: 'oil_hours', label: 'Motohodiny od výměny oleje', type: 'number', required: false,
      unit: 'Mth', alert: { maxValue: 500 } },
    { key: 'oil_limit', label: 'Limit oleje', type: 'number', required: false, unit: 'Mth' },
    { key: 'oil_type', label: 'Typ oleje', type: 'text', required: false },
    { key: 'tachometer', label: 'Tachometr', type: 'number', required: false, unit: 'km' },
    { key: 'fuel_type', label: 'Palivo', type: 'select', required: true,
      options: ['Nafta', 'Benzín', 'Elektro', 'LPG'] },
    { key: 'year', label: 'Rok výroby', type: 'number', required: false },
    { key: 'photo_url', label: 'Fotografie', type: 'photo', required: false },
    { key: 'assigned_to', label: 'Přiřazeno', type: 'text', required: false },
    { key: 'keys_location', label: 'Klíče', type: 'text', required: false },
  ],
};

// ═══════════════════════════════════════════
// FLEET ENTITIES (6 vozidel)
// ═══════════════════════════════════════════

const VEHICLES = [
  {
    id: 'entity_jcb',
    name: 'JCB 3CX',
    code: 'JCB-001',
    status: 'operational',
    data: {
      registration: 'bez SPZ',
      stk_date: '2026-09-15',
      insurance_date: '2026-12-31',
      oil_hours: 380,
      oil_limit: 500,
      oil_type: 'Mobil Delvac MX 15W-40',
      fuel_type: 'Nafta',
      year: 2018,
      keys_location: 'Údržba – skříňka č.3',
      assigned_to: 'Filip Novák',
    },
    tags: ['nakladač', 'stavba'],
  },
  {
    id: 'entity_nh',
    name: 'New Holland T4.75',
    code: 'NH-001',
    status: 'operational',
    data: {
      registration: '3J2 4567',
      stk_date: '2026-04-20',
      insurance_date: '2026-06-15',
      oil_hours: 420,
      oil_limit: 500,
      oil_type: 'Shell Rimula R4 15W-40',
      tachometer: 8540,
      fuel_type: 'Nafta',
      year: 2015,
      keys_location: 'Údržba – skříňka č.3',
      assigned_to: 'Zdeněk Mička',
    },
    tags: ['traktor', 'pole'],
  },
  {
    id: 'entity_shibaura',
    name: 'Shibaura ST450',
    code: 'SHI-001',
    status: 'operational',
    data: {
      registration: 'bez SPZ',
      stk_date: '2026-11-01',
      insurance_date: '2027-01-15',
      oil_hours: 120,
      oil_limit: 500,
      oil_type: 'Total Rubia TIR 15W-40',
      fuel_type: 'Nafta',
      year: 2020,
      keys_location: 'Údržba – skříňka č.3',
      assigned_to: 'Pool (sdílený)',
    },
    tags: ['traktor', 'komunál'],
  },
  {
    id: 'entity_vzv',
    name: 'VZV Linde H25',
    code: 'VZV-001',
    status: 'operational',
    data: {
      registration: 'bez SPZ',
      stk_date: '2026-06-30',
      insurance_date: '2026-12-31',
      oil_hours: 200,
      oil_limit: 300,
      oil_type: 'Mobil Hydraulic 10W',
      tachometer: 4210,
      fuel_type: 'LPG',
      year: 2017,
      keys_location: 'Expedice – věšák',
      assigned_to: 'Pool (sdílený)',
    },
    tags: ['vzv', 'expedice'],
  },
  {
    id: 'entity_sekacka',
    name: 'Sekačka Husqvarna',
    code: 'SEK-001',
    status: 'operational',
    data: {
      registration: '',
      stk_date: '',
      insurance_date: '',
      oil_hours: 50,
      oil_limit: 100,
      oil_type: 'SAE 30',
      fuel_type: 'Benzín',
      year: 2022,
      keys_location: 'Údržba – sklad',
      assigned_to: 'Pool (sdílený)',
    },
    tags: ['zahrada'],
  },
  {
    id: 'entity_octavia',
    name: 'Škoda Octavia',
    code: 'OCT-001',
    status: 'operational',
    data: {
      registration: '1J5 1234',
      stk_date: '2026-03-10',
      insurance_date: '2026-08-20',
      oil_hours: 0,
      oil_limit: 0,
      oil_type: 'Castrol Edge 5W-30',
      tachometer: 87320,
      fuel_type: 'Nafta',
      year: 2019,
      keys_location: 'Kancelář – klíčenka',
      assigned_to: 'Milan Novák',
    },
    tags: ['osobní', 'služební'],
  },
];

// ═══════════════════════════════════════════
// SEED
// ═══════════════════════════════════════════

async function seed() {
  console.log('=== NOMINAL CMMS — Seed Entities + Blueprints ===\n');

  // Přihlášení jako SUPERADMIN (PIN 3333)
  console.log('Přihlašuji se jako SUPERADMIN...');
  await signInWithEmailAndPassword(auth, 'pin_3333@nominal.local', '333300');
  console.log('OK\n');

  const now = Timestamp.now();

  // 1. Blueprint pro vozidla
  console.log('Zapisuji blueprint_vehicle...');
  await setDoc(doc(db, 'blueprints', 'blueprint_vehicle'), {
    ...VEHICLE_BLUEPRINT,
    createdAt: now,
    updatedAt: now,
  });
  console.log('  ✅ blueprint_vehicle');

  // 2. Virtuální fleet group (parent pro všechna vozidla)
  console.log('\nZapisuji fleet group entitu...');
  await setDoc(doc(db, 'entities', 'entity_fleet'), {
    parentId: null,
    type: 'fleet_group',
    blueprintId: '',
    name: 'Vozový park',
    code: 'FLEET',
    status: 'operational',
    data: {},
    tags: ['fleet'],
    createdAt: now,
    updatedAt: now,
    createdBy: 'seed',
    isDeleted: false,
  });
  console.log('  ✅ entity_fleet');

  // 3. Vozidla
  console.log(`\nZapisuji ${VEHICLES.length} vozidel...`);
  for (const v of VEHICLES) {
    await setDoc(doc(db, 'entities', v.id), {
      parentId: 'entity_fleet',
      type: 'vehicle',
      blueprintId: 'blueprint_vehicle',
      name: v.name,
      code: v.code,
      status: v.status,
      data: v.data,
      tags: v.tags,
      createdAt: now,
      updatedAt: now,
      createdBy: 'seed',
      isDeleted: false,
    });
    console.log(`  ✅ ${v.name} (${v.code})`);
  }

  // 4. Ukázkové logy
  console.log('\nZapisuji ukázkové logy...');
  const SAMPLE_LOGS = [
    {
      id: 'log_jcb_001',
      entityId: 'entity_jcb',
      userId: 'seed',
      userInitials: 'FN',
      type: 'handover',
      text: 'Předání vozidla. Stav: OK, bez poškození.',
      data: { tachometer: 0, condition: 'ok' },
      createdAt: Timestamp.fromDate(new Date('2026-02-10T08:00:00')),
      isDeleted: false,
    },
    {
      id: 'log_jcb_002',
      entityId: 'entity_jcb',
      userId: 'seed',
      userInitials: 'VD',
      type: 'maintenance',
      text: 'Výměna oleje — 12.5l Mobil Delvac MX 15W-40',
      data: { oil_hours_reset: true },
      createdAt: Timestamp.fromDate(new Date('2026-01-15T14:30:00')),
      isDeleted: false,
    },
    {
      id: 'log_nh_001',
      entityId: 'entity_nh',
      userId: 'seed',
      userInitials: 'ZM',
      type: 'handover',
      text: 'Přejímka po servisu. Tachometr: 8 540 km.',
      data: { tachometer: 8540, condition: 'ok' },
      createdAt: Timestamp.fromDate(new Date('2026-02-14T07:15:00')),
      isDeleted: false,
    },
    {
      id: 'log_octavia_001',
      entityId: 'entity_octavia',
      userId: 'seed',
      userInitials: 'MN',
      type: 'note',
      text: 'STK blíží se — objednat termín!',
      data: {},
      createdAt: Timestamp.fromDate(new Date('2026-02-16T10:00:00')),
      isDeleted: false,
    },
    {
      id: 'log_vzv_001',
      entityId: 'entity_vzv',
      userId: 'seed',
      userInitials: 'PV',
      type: 'inspection',
      text: 'Denní kontrola VZV OK. Vidlice bez poškození.',
      data: { checklist: 'ok' },
      createdAt: Timestamp.fromDate(new Date('2026-02-17T06:30:00')),
      isDeleted: false,
    },
  ];

  for (const log of SAMPLE_LOGS) {
    const { id, ...logData } = log;
    await setDoc(doc(db, 'entity_logs', id), logData);
    console.log(`  ✅ ${id}`);
  }

  console.log(`\n=== Hotovo! ===`);
  console.log(`  1 blueprint (blueprint_vehicle)`);
  console.log(`  1 fleet group`);
  console.log(`  ${VEHICLES.length} vozidel`);
  console.log(`  ${SAMPLE_LOGS.length} logů`);

  process.exit(0);
}

seed().catch((err) => {
  console.error('CHYBA:', err);
  process.exit(1);
});
