// scripts/seed-operations.ts
// NOMINAL CMMS — Seed: inventory + fleet + waste + kiosk_configs
// Spustit: npx tsx scripts/seed-operations.ts

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

initializeApp({
  credential: cert(require('../serviceAccount.json')),
});
const db = getFirestore();
const now = Timestamp.now();

// Helper: datum v budoucnosti
function futureDate(days: number): Timestamp {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return Timestamp.fromDate(d);
}

function pastDate(days: number): Timestamp {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return Timestamp.fromDate(d);
}

// ═══════════════════════════════════════════
// A) INVENTORY — Sklad náhradních dílů
// ═══════════════════════════════════════════

const INVENTORY = [
  // --- FILTRY ---
  {
    id: 'inv_filter_g4_kapsovy',
    name: 'Kapsový filtr G4',
    code: 'FIL-G4-592',
    category: 'filters',
    quantity: 12,
    unit: 'ks',
    minQuantity: 4,
    maxQuantity: 20,
    location: 'E-Regál 1-Pozice A',
    buildingId: 'E',
    supplier: 'FILTECH s.r.o.',
    supplierCode: 'KF-G4-592360',
    unitPrice: 850,
    currency: 'CZK',
    compatibleAssetIds: ['vzt_01', 'vzt_02', 'vzt_03'],
    compatibleAssetNames: ['VZT Jednotka 1', 'VZT Jednotka 2', 'VZT Jednotka 3'],
    filterSpec: {
      dimensions: '592x592x360',
      typeCode: 'F01',
      filterClass: 'G4',
    },
    status: 'ok',
  },
  {
    id: 'inv_filter_f7_kapsovy',
    name: 'Kapsový filtr F7',
    code: 'FIL-F7-592',
    category: 'filters',
    quantity: 8,
    unit: 'ks',
    minQuantity: 4,
    maxQuantity: 16,
    location: 'E-Regál 1-Pozice B',
    buildingId: 'E',
    supplier: 'FILTECH s.r.o.',
    supplierCode: 'KF-F7-592360',
    unitPrice: 1250,
    currency: 'CZK',
    compatibleAssetIds: ['vzt_01', 'vzt_02'],
    compatibleAssetNames: ['VZT Jednotka 1', 'VZT Jednotka 2'],
    filterSpec: {
      dimensions: '592x592x360',
      typeCode: 'F02',
      filterClass: 'F7',
    },
    status: 'ok',
  },
  {
    id: 'inv_predfiltr_ramecek',
    name: 'Předfiltr rámečkový G4',
    code: 'FIL-PRE-592',
    category: 'filters',
    quantity: 2,
    unit: 'ks',
    minQuantity: 4,
    maxQuantity: 12,
    location: 'E-Regál 1-Pozice C',
    buildingId: 'E',
    supplier: 'FILTECH s.r.o.',
    supplierCode: 'RF-G4-59248',
    unitPrice: 320,
    currency: 'CZK',
    compatibleAssetIds: ['vzt_01', 'vzt_02', 'vzt_03'],
    compatibleAssetNames: ['VZT Jednotka 1', 'VZT Jednotka 2', 'VZT Jednotka 3'],
    filterSpec: {
      dimensions: '592x592x48',
      typeCode: 'F03',
      filterClass: 'G4',
    },
    status: 'low', // POD LIMITEM!
  },

  // --- LOŽISKA ---
  {
    id: 'inv_lozisko_6205',
    name: 'Ložisko 6205-2RS',
    code: 'LOZ-6205',
    category: 'bearings',
    quantity: 6,
    unit: 'ks',
    minQuantity: 2,
    maxQuantity: 10,
    location: 'E-Regál 2-Pozice A',
    buildingId: 'E',
    supplier: 'SKF Distributor CZ',
    supplierCode: '6205-2RSH',
    unitPrice: 185,
    currency: 'CZK',
    compatibleAssetIds: ['ext_01', 'ext_02', 'ext_03'],
    compatibleAssetNames: ['Extruder 1', 'Extruder 2', 'Extruder 3'],
    status: 'ok',
  },
  {
    id: 'inv_lozisko_6305',
    name: 'Ložisko 6305-2RS',
    code: 'LOZ-6305',
    category: 'bearings',
    quantity: 4,
    unit: 'ks',
    minQuantity: 2,
    maxQuantity: 8,
    location: 'E-Regál 2-Pozice B',
    buildingId: 'E',
    supplier: 'SKF Distributor CZ',
    supplierCode: '6305-2RSH',
    unitPrice: 245,
    currency: 'CZK',
    compatibleAssetIds: ['mixer_01', 'mixer_02'],
    compatibleAssetNames: ['Míchačka 1', 'Míchačka 2'],
    status: 'ok',
  },
  {
    id: 'inv_lozisko_ucpavka',
    name: 'Ložisková ucpávka P205',
    code: 'LOZ-UCP-P205',
    category: 'bearings',
    quantity: 3,
    unit: 'ks',
    minQuantity: 2,
    maxQuantity: 6,
    location: 'E-Regál 2-Pozice C',
    buildingId: 'E',
    supplier: 'SKF Distributor CZ',
    supplierCode: 'SY 25 TF',
    unitPrice: 520,
    currency: 'CZK',
    compatibleAssetIds: ['doprav_01', 'doprav_02'],
    compatibleAssetNames: ['Dopravník 1', 'Dopravník 2'],
    status: 'ok',
  },

  // --- ŘEMENY ---
  {
    id: 'inv_remen_spz',
    name: 'Klínový řemen SPZ 1250',
    code: 'REM-SPZ-1250',
    category: 'belts',
    quantity: 3,
    unit: 'ks',
    minQuantity: 2,
    maxQuantity: 6,
    location: 'E-Regál 3-Pozice A',
    buildingId: 'E',
    supplier: 'Rubena a.s.',
    supplierCode: 'SPZ-1250-Lw',
    unitPrice: 145,
    currency: 'CZK',
    compatibleAssetIds: ['ext_01', 'ext_02'],
    compatibleAssetNames: ['Extruder 1', 'Extruder 2'],
    status: 'ok',
  },
  {
    id: 'inv_remen_xpz',
    name: 'Klínový řemen XPZ 1000',
    code: 'REM-XPZ-1000',
    category: 'belts',
    quantity: 1,
    unit: 'ks',
    minQuantity: 2,
    maxQuantity: 4,
    location: 'E-Regál 3-Pozice B',
    buildingId: 'E',
    supplier: 'Rubena a.s.',
    supplierCode: 'XPZ-1000-Lw',
    unitPrice: 175,
    currency: 'CZK',
    compatibleAssetIds: ['balic_karel', 'balic_lojza'],
    compatibleAssetNames: ['Balička Karel', 'Balička Lojza'],
    status: 'critical', // POD 50% MINIMA!
  },

  // --- TĚSNĚNÍ ---
  {
    id: 'inv_tesneni_o_krouzek',
    name: 'O-kroužek NBR 50x3',
    code: 'TES-O-50x3',
    category: 'seals',
    quantity: 25,
    unit: 'ks',
    minQuantity: 10,
    maxQuantity: 50,
    location: 'E-Regál 3-Pozice C',
    buildingId: 'E',
    supplier: 'Hennlich s.r.o.',
    supplierCode: 'OR-NBR-50x3',
    unitPrice: 12,
    currency: 'CZK',
    compatibleAssetIds: [],
    compatibleAssetNames: [],
    status: 'ok',
  },
  {
    id: 'inv_tesneni_gufero',
    name: 'Gufero 40x62x8 BA',
    code: 'TES-GUF-40x62',
    category: 'seals',
    quantity: 4,
    unit: 'ks',
    minQuantity: 2,
    maxQuantity: 8,
    location: 'E-Regál 3-Pozice D',
    buildingId: 'E',
    supplier: 'Hennlich s.r.o.',
    supplierCode: 'GUF-BA-40x62x8',
    unitPrice: 85,
    currency: 'CZK',
    compatibleAssetIds: ['mixer_01', 'mixer_02'],
    compatibleAssetNames: ['Míchačka 1', 'Míchačka 2'],
    status: 'ok',
  },

  // --- OLEJE A MAZIVA ---
  {
    id: 'inv_olej_prevod',
    name: 'Převodový olej CLP 220',
    code: 'OIL-CLP-220',
    category: 'oils',
    quantity: 18,
    unit: 'l',
    minQuantity: 10,
    maxQuantity: 40,
    location: 'E-Regál 4-Spodní',
    buildingId: 'E',
    supplier: 'Mogul / Paramo',
    supplierCode: 'MOGUL TRANS 220',
    unitPrice: 95,
    currency: 'CZK',
    compatibleAssetIds: ['ext_01', 'ext_02', 'ext_03', 'mixer_01'],
    compatibleAssetNames: ['Extruder 1', 'Extruder 2', 'Extruder 3', 'Míchačka 1'],
    status: 'ok',
  },
  {
    id: 'inv_mazivo_ep2',
    name: 'Plastické mazivo EP2',
    code: 'OIL-EP2',
    category: 'oils',
    quantity: 3,
    unit: 'kg',
    minQuantity: 2,
    maxQuantity: 10,
    location: 'E-Regál 4-Střední',
    buildingId: 'E',
    supplier: 'Mogul / Paramo',
    supplierCode: 'MOGUL LV 2-3',
    unitPrice: 210,
    currency: 'CZK',
    compatibleAssetIds: [],
    compatibleAssetNames: [],
    status: 'ok',
  },
  {
    id: 'inv_sprej_wd40',
    name: 'WD-40 univerzální sprej',
    code: 'OIL-WD40-400',
    category: 'oils',
    quantity: 5,
    unit: 'ks',
    minQuantity: 3,
    maxQuantity: 12,
    location: 'E-Regál 4-Horní',
    buildingId: 'E',
    supplier: 'Würth CZ',
    supplierCode: 'WD-40-400ML',
    unitPrice: 165,
    currency: 'CZK',
    compatibleAssetIds: [],
    compatibleAssetNames: [],
    status: 'ok',
  },

  // --- ELEKTRO ---
  {
    id: 'inv_pojistka_32a',
    name: 'Pojistka válcová 32A gG',
    code: 'ELE-POJ-32A',
    category: 'electrical',
    quantity: 8,
    unit: 'ks',
    minQuantity: 4,
    maxQuantity: 20,
    location: 'E-Regál 5-Pozice A',
    buildingId: 'E',
    supplier: 'Elfetex s.r.o.',
    supplierCode: 'OEZ-PV-32A-gG',
    unitPrice: 45,
    currency: 'CZK',
    compatibleAssetIds: [],
    compatibleAssetNames: [],
    status: 'ok',
  },
  {
    id: 'inv_stykac_25a',
    name: 'Stykač LC1 D25 230V',
    code: 'ELE-STY-D25',
    category: 'electrical',
    quantity: 2,
    unit: 'ks',
    minQuantity: 1,
    maxQuantity: 4,
    location: 'E-Regál 5-Pozice B',
    buildingId: 'E',
    supplier: 'Elfetex s.r.o.',
    supplierCode: 'SE-LC1D25P7',
    unitPrice: 1350,
    currency: 'CZK',
    compatibleAssetIds: ['ext_01', 'ext_02', 'ext_03'],
    compatibleAssetNames: ['Extruder 1', 'Extruder 2', 'Extruder 3'],
    status: 'ok',
  },
  {
    id: 'inv_cidlo_teplota',
    name: 'Teplotní čidlo PT100',
    code: 'ELE-PT100',
    category: 'electrical',
    quantity: 0,
    unit: 'ks',
    minQuantity: 2,
    maxQuantity: 6,
    location: 'E-Regál 5-Pozice C',
    buildingId: 'E',
    supplier: 'Sensit s.r.o.',
    supplierCode: 'PT100-A-3x100',
    unitPrice: 780,
    currency: 'CZK',
    compatibleAssetIds: ['ext_01', 'ext_02', 'ext_03'],
    compatibleAssetNames: ['Extruder 1', 'Extruder 2', 'Extruder 3'],
    status: 'out', // NENÍ NA SKLADU!
  },
];

// ═══════════════════════════════════════════
// B) FLEET — Vozový park
// ═══════════════════════════════════════════

const FLEET = [
  {
    id: 'fleet_vzv_linde',
    assetId: 'vzv_linde_h30',
    name: 'VZV Linde H30',
    type: 'forklift',
    assignedUserId: 'pin_6666', // Petr Volf
    assignedUserName: 'Petr Volf',
    keysLocation: 'Kancelář údržby — háček č. 3',
    currentMth: 4850,
    currentKm: null,
    fuelLevel: 75,
    batteryLevel: null,
    nextServiceMth: 5000,
    serviceHistory: [
      {
        date: pastDate(90),
        type: 'Výměna oleje + filtrů',
        mth: 4500,
        description: 'Pravidelný servis 500 Mth',
        cost: 3200,
        performedBy: 'Zdeněk Mička',
      },
      {
        date: pastDate(210),
        type: 'Výměna řetězů zdvihu',
        mth: 4100,
        description: 'Řetězy opotřebené, výměna obou stran',
        cost: 8500,
        performedBy: 'Servis Linde CZ',
      },
    ],
    stkExpiry: null,
    insuranceExpiry: null,
    licensePlate: null,
    status: 'available',
  },
  {
    id: 'fleet_vzv_jungheinrich',
    assetId: 'vzv_jungheinrich',
    name: 'VZV Jungheinrich EFG 216',
    type: 'forklift',
    assignedUserId: 'pin_6666',
    assignedUserName: 'Petr Volf',
    keysLocation: 'Sklad D — nabíjecí stanice',
    currentMth: 3200,
    currentKm: null,
    fuelLevel: null,
    batteryLevel: 85,
    nextServiceMth: 3500,
    serviceHistory: [
      {
        date: pastDate(60),
        type: 'Kontrola baterie + dolití vody',
        mth: 3100,
        description: 'Pravidelná kontrola trakční baterie',
        cost: 0,
        performedBy: 'Petr Volf',
      },
    ],
    stkExpiry: null,
    insuranceExpiry: null,
    licensePlate: null,
    status: 'available',
  },
  {
    id: 'fleet_jcb',
    assetId: 'jcb_3cx',
    name: 'JCB 3CX',
    type: 'loader',
    assignedUserId: 'pin_7777', // Filip Novák
    assignedUserName: 'Filip Novák',
    keysLocation: 'Garáž E',
    currentMth: 6780,
    currentKm: null,
    fuelLevel: 40,
    batteryLevel: null,
    nextServiceMth: 7000,
    serviceHistory: [
      {
        date: pastDate(45),
        type: 'Výměna hydraulického oleje',
        mth: 6500,
        description: '500 Mth servis — olej + filtry hydrauliky',
        cost: 5800,
        performedBy: 'Zdeněk Mička',
      },
    ],
    stkExpiry: futureDate(180),
    insuranceExpiry: futureDate(300),
    licensePlate: '3J2 4567',
    status: 'available',
  },
  {
    id: 'fleet_new_holland',
    assetId: 'nh_t4',
    name: 'New Holland T4.75',
    type: 'tractor',
    assignedUserId: 'pin_7777',
    assignedUserName: 'Filip Novák',
    keysLocation: 'Garáž E',
    currentMth: 2340,
    currentKm: null,
    fuelLevel: 60,
    batteryLevel: null,
    nextServiceMth: 2500,
    serviceHistory: [
      {
        date: pastDate(120),
        type: 'Velký servis 2000 Mth',
        mth: 2000,
        description: 'Olej motor + převodovka + filtry + ošetření',
        cost: 12000,
        performedBy: 'Agro Servis Vysočina',
      },
    ],
    stkExpiry: futureDate(90),
    insuranceExpiry: futureDate(220),
    licensePlate: '3J8 1234',
    status: 'available',
  },
  {
    id: 'fleet_shibaura',
    assetId: 'shibaura_cm374',
    name: 'Shibaura CM374',
    type: 'mower',
    assignedUserId: 'pin_7777',
    assignedUserName: 'Filip Novák',
    keysLocation: 'Garáž E',
    currentMth: 890,
    currentKm: null,
    fuelLevel: 90,
    batteryLevel: null,
    nextServiceMth: 1000,
    serviceHistory: [
      {
        date: pastDate(200),
        type: 'Výměna oleje + ostření nožů',
        mth: 750,
        description: 'Sezónní servis',
        cost: 2100,
        performedBy: 'Filip Novák',
      },
    ],
    stkExpiry: null,
    insuranceExpiry: null,
    licensePlate: null,
    status: 'available',
  },
  {
    id: 'fleet_octavia',
    assetId: 'skoda_octavia',
    name: 'Škoda Octavia Combi',
    type: 'car',
    assignedUserId: null,
    assignedUserName: 'Pool (sdílený)',
    keysLocation: 'Recepce budova A',
    currentMth: null,
    currentKm: 87500,
    fuelLevel: 55,
    batteryLevel: null,
    nextServiceAt: futureDate(30),
    nextServiceMth: null,
    serviceHistory: [
      {
        date: pastDate(150),
        type: 'Pravidelný servis 75 000 km',
        mth: 0,
        description: 'Olej + filtry + brzdová kapalina',
        cost: 6500,
        performedBy: 'Autoservis Žďár',
      },
    ],
    stkExpiry: futureDate(45),
    insuranceExpiry: futureDate(310),
    licensePlate: '3J5 9876',
    status: 'available',
  },
];

// ═══════════════════════════════════════════
// C) WASTE — Odpady (kontejnery + semafor)
// ═══════════════════════════════════════════

const WASTE = [
  {
    id: 'waste_smesny_1',
    type: 'mixed',
    name: 'Směsný odpad — kontejner 1',
    location: 'Rampa D — levá strana',
    fillLevel: 'yellow',
    lastEmptiedAt: pastDate(5),
    schedule: {
      dayOfWeek: 4, // čtvrtek
      company: 'AVE CZ',
      notifyDayBefore: 1, // středa
      notifyTime: '15:00',
    },
    notifyRoleIds: ['role_vyroba', 'role_udrzba'],
  },
  {
    id: 'waste_smesny_2',
    type: 'mixed',
    name: 'Směsný odpad — kontejner 2',
    location: 'Rampa D — pravá strana',
    fillLevel: 'green',
    lastEmptiedAt: pastDate(5),
    schedule: {
      dayOfWeek: 4,
      company: 'AVE CZ',
      notifyDayBefore: 1,
      notifyTime: '15:00',
    },
    notifyRoleIds: ['role_vyroba', 'role_udrzba'],
  },
  {
    id: 'waste_plast',
    type: 'plastic',
    name: 'Plasty — lisovna',
    location: 'Rampa D — u lisu',
    fillLevel: 'green',
    lastEmptiedAt: pastDate(12),
    schedule: {
      dayOfWeek: 2, // úterý
      company: 'EKO-KOM',
      notifyDayBefore: 1,
      notifyTime: '15:00',
    },
    notifyRoleIds: ['role_vyroba'],
  },
  {
    id: 'waste_papir',
    type: 'paper',
    name: 'Papír a lepenka',
    location: 'Rampa D — sběrný box',
    fillLevel: 'red', // PLNÝ!
    lastEmptiedAt: pastDate(20),
    schedule: {
      dayOfWeek: 3, // středa
      company: 'AVE CZ',
      notifyDayBefore: 1,
      notifyTime: '15:00',
    },
    notifyRoleIds: ['role_vyroba', 'role_vedeni'],
  },
  {
    id: 'waste_kov',
    type: 'metal',
    name: 'Kovový odpad',
    location: 'Dvůr E — kontejner',
    fillLevel: 'green',
    lastEmptiedAt: pastDate(30),
    schedule: {
      dayOfWeek: 5, // pátek, jednou za měsíc
      company: 'Kovošrot Žďár',
      notifyDayBefore: 2,
      notifyTime: '10:00',
    },
    notifyRoleIds: ['role_udrzba'],
  },
  {
    id: 'waste_nebezpecny',
    type: 'hazardous',
    name: 'Nebezpečný odpad (oleje, baterie)',
    location: 'Dílna E — uzamčený sklad NO',
    fillLevel: 'yellow',
    lastEmptiedAt: pastDate(60),
    schedule: {
      dayOfWeek: 0, // na objednávku
      company: 'SUEZ CZ',
      notifyDayBefore: 7,
      notifyTime: '09:00',
    },
    notifyRoleIds: ['role_superadmin', 'role_udrzba'],
  },
];

// ═══════════════════════════════════════════
// D) KIOSK CONFIGS — Tlačítka per lokace
// ═══════════════════════════════════════════

const KIOSK_CONFIGS = [
  {
    id: 'D2_velin',
    name: 'Kiosk Velín Extruze (2.NP)',
    publicButtons: [
      { id: 'btn_fault', label: 'Nahlásit poruchu', icon: 'AlertTriangle', action: 'create_task', color: '#dc2626' },
      { id: 'btn_material', label: 'Potřebuji materiál', icon: 'Package', action: 'create_order', color: '#f59e0b' },
      { id: 'btn_sos', label: 'SOS — havárie', icon: 'Siren', action: 'create_task_p1', color: '#991b1b' },
    ],
    personalButtons: [
      { id: 'pbtn_tasks', label: 'Moje úkoly', icon: 'ClipboardList', action: 'my_tasks', requiredPermission: 'tasks.view' },
      { id: 'pbtn_complete', label: 'Dokončit úkol', icon: 'CheckCircle', action: 'complete_task', requiredPermission: 'tasks.complete' },
      { id: 'pbtn_mth', label: 'Zapsat Mth', icon: 'Timer', action: 'log_mth', requiredPermission: 'assets.edit' },
    ],
  },
  {
    id: 'D1_micharna',
    name: 'Kiosk Míchárna (1.NP)',
    publicButtons: [
      { id: 'btn_fault', label: 'Nahlásit poruchu', icon: 'AlertTriangle', action: 'create_task', color: '#dc2626' },
      { id: 'btn_material', label: 'Potřebuji materiál', icon: 'Package', action: 'create_order', color: '#f59e0b' },
      { id: 'btn_sanitace', label: 'Hotová sanitace', icon: 'Sparkles', action: 'confirm_sanitation', color: '#16a34a' },
    ],
    personalButtons: [
      { id: 'pbtn_tasks', label: 'Moje úkoly', icon: 'ClipboardList', action: 'my_tasks', requiredPermission: 'tasks.view' },
      { id: 'pbtn_gluten', label: 'Přepnout zónu', icon: 'Wheat', action: 'toggle_gluten_zone', requiredPermission: 'assets.edit' },
    ],
  },
  {
    id: 'D1_balirna',
    name: 'Kiosk Balírna (1.NP)',
    publicButtons: [
      { id: 'btn_fault', label: 'Nahlásit poruchu', icon: 'AlertTriangle', action: 'create_task', color: '#dc2626' },
      { id: 'btn_material', label: 'Dochází obal', icon: 'Box', action: 'create_order', color: '#f59e0b' },
    ],
    personalButtons: [
      { id: 'pbtn_tasks', label: 'Moje úkoly', icon: 'ClipboardList', action: 'my_tasks', requiredPermission: 'tasks.view' },
    ],
  },
  {
    id: 'A_recepce',
    name: 'Kiosk Recepce (Admin)',
    publicButtons: [
      { id: 'btn_visit', label: 'Oznámit návštěvu', icon: 'UserPlus', action: 'announce_visitor', color: '#2563eb' },
      { id: 'btn_trustbox', label: 'Schránka důvěry', icon: 'MessageSquare', action: 'trustbox', color: '#7c3aed' },
    ],
    personalButtons: [
      { id: 'pbtn_tasks', label: 'Moje úkoly', icon: 'ClipboardList', action: 'my_tasks', requiredPermission: 'tasks.view' },
      { id: 'pbtn_fleet', label: 'Klíče od auta', icon: 'Car', action: 'fleet_checkout', requiredPermission: 'fleet.view' },
    ],
  },
];

// ═══════════════════════════════════════════
// SEED FUNKCE
// ═══════════════════════════════════════════

async function seed() {
  console.log('=== NOMINAL CMMS — Operations Seed ===\n');

  // 1. Inventory
  console.log('1. Inventory (sklad)...');
  const invBatch = db.batch();
  for (const item of INVENTORY) {
    invBatch.set(db.collection('inventory').doc(item.id), {
      ...item,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    });
  }
  await invBatch.commit();
  console.log(`   ✓ ${INVENTORY.length} položek`);

  // Stats
  const lowItems = INVENTORY.filter((i) => i.status === 'low' || i.status === 'critical');
  const outItems = INVENTORY.filter((i) => i.status === 'out');
  console.log(`   ⚠ Pod limitem: ${lowItems.map((i) => i.name).join(', ')}`);
  if (outItems.length > 0) {
    console.log(`   🔴 Není na skladu: ${outItems.map((i) => i.name).join(', ')}`);
  }

  // 2. Fleet
  console.log('\n2. Fleet (vozidla)...');
  const fleetBatch = db.batch();
  for (const vehicle of FLEET) {
    fleetBatch.set(db.collection('fleet').doc(vehicle.id), {
      ...vehicle,
      updatedAt: now,
      isDeleted: false,
    });
  }
  await fleetBatch.commit();
  console.log(`   ✓ ${FLEET.length} vozidel`);

  // 3. Waste
  console.log('\n3. Waste (odpady)...');
  const wasteBatch = db.batch();
  for (const container of WASTE) {
    wasteBatch.set(db.collection('waste').doc(container.id), {
      ...container,
      updatedAt: now,
      isDeleted: false,
    });
  }
  await wasteBatch.commit();
  console.log(`   ✓ ${WASTE.length} kontejnerů`);

  const redWaste = WASTE.filter((w) => w.fillLevel === 'red');
  if (redWaste.length > 0) {
    console.log(`   🔴 Plné: ${redWaste.map((w) => w.name).join(', ')}`);
  }

  // 4. Kiosk configs
  console.log('\n4. Kiosk configs...');
  const kioskBatch = db.batch();
  for (const cfg of KIOSK_CONFIGS) {
    kioskBatch.set(db.collection('kiosk_configs').doc(cfg.id), {
      ...cfg,
      updatedAt: now,
    });
  }
  await kioskBatch.commit();
  console.log(`   ✓ ${KIOSK_CONFIGS.length} kiosků`);

  // SOUHRN
  console.log('\n=== HOTOVO ===');
  console.log(`Inventory: ${INVENTORY.length} položek (${lowItems.length} pod limitem, ${outItems.length} vyprodáno)`);
  console.log(`Fleet:     ${FLEET.length} vozidel`);
  console.log(`Waste:     ${WASTE.length} kontejnerů`);
  console.log(`Kiosk:     ${KIOSK_CONFIGS.length} konfigurací`);
}

seed().catch(console.error);
