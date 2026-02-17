// scripts/seed-production.ts
// NOMINAL CMMS — Kompletní produkční seed z reálných dat
// Spuštění: npx ts-node scripts/seed-production.ts

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

// ═══════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════

import { readFileSync } from 'fs';
const serviceAccount = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf-8'));

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

// ═══════════════════════════════════════════════════════════════════
// UŽIVATELÉ
// ═══════════════════════════════════════════════════════════════════

const USERS = [
  { id: 'user-milan', displayName: 'Milan Novák', pin: '1111', role: 'MAJITEL', color: '#f59e0b', email: '', phone: '', active: true },
  { id: 'user-martina', displayName: 'Martina', pin: '2222', role: 'VEDENI', color: '#3b82f6', email: '', phone: '', active: true },
  { id: 'user-vilem', displayName: 'Vilém', pin: '3333', role: 'SUPERADMIN', color: '#16a34a', email: '', phone: '', active: true },
  { id: 'user-pavla', displayName: 'Pavla Drápelová', pin: '4444', role: 'VYROBA', color: '#d97706', email: '', phone: '', active: true },
  { id: 'user-zdenek', displayName: 'Zdeněk Mička', pin: '5555', role: 'UDRZBA', color: '#64748b', email: '', phone: '', active: true },
  { id: 'user-petr', displayName: 'Petr Volf', pin: '6666', role: 'UDRZBA', color: '#0ea5e9', email: '', phone: '', active: true },
  { id: 'user-filip', displayName: 'Filip Novák', pin: '7777', role: 'UDRZBA', color: '#8b5cf6', email: '', phone: '', active: true },
  { id: 'user-kiosk', displayName: 'Kiosk Velín', pin: '0000', role: 'OPERATOR', color: '#6b7280', email: '', phone: '', active: true },
];

// ═══════════════════════════════════════════════════════════════════
// ZAŘÍZENÍ (ASSETS) — 139 položek z CSV
// ═══════════════════════════════════════════════════════════════════

const ASSETS = [
  // ─────────────────────────────────────────────────────────────────
  // EXTRUDOVNA I
  // ─────────────────────────────────────────────────────────────────
  { id: 'STR_001', code: 'STR_001', name: 'Extruder 1', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Extrudovna I', category: 'Extrudér' },
  { id: 'STR_002', code: 'STR_002', name: 'Extruder 2', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Extrudovna I', category: 'Extrudér' },
  { id: 'STR_003', code: 'STR_003', name: 'Vzduchový dopravník 1 (EX I)', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Extrudovna I', category: 'Dopravník' },
  { id: 'STR_004', code: 'STR_004', name: 'Vzduchový dopravník 2 (EX I)', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Extrudovna I', category: 'Dopravník' },
  { id: 'STR_005', code: 'STR_005', name: 'Vzduchový dopravník se šnekem (EX I)', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Extrudovna I', category: 'Dopravník' },
  { id: 'STR_006', code: 'STR_006', name: 'Mlýn na pohankovou mouku', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Extrudovna I', category: 'Mlýn' },
  { id: 'STR_007', code: 'STR_007', name: 'Násypka na suroviny 1 (EX I)', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Extrudovna I', category: 'Násypka' },
  { id: 'STR_008', code: 'STR_008', name: 'Násypka na suroviny 2 (EX I)', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Extrudovna I', category: 'Násypka' },
  { id: 'STR_009', code: 'STR_009', name: 'Násypka na suroviny 3 (EX I)', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Extrudovna I', category: 'Násypka' },
  { id: 'STR_010', code: 'STR_010', name: 'Násypka na suroviny 4 (EX I)', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Extrudovna I', category: 'Násypka' },
  { id: 'STR_011', code: 'STR_011', name: 'Zásobník na křupky 1 (EX I)', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Extrudovna I', category: 'Zásobník' },
  { id: 'STR_012', code: 'STR_012', name: 'Zásobník na křupky 2 (EX I)', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Extrudovna I', category: 'Zásobník' },
  { id: 'STR_013', code: 'STR_013', name: 'Mlýn na křupky', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Extrudovna I', category: 'Mlýn' },
  { id: 'STR_014', code: 'STR_014', name: 'Metal detekce (EX I)', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Extrudovna I', category: 'Metal detekce' },
  { id: 'STR_015', code: 'STR_015', name: 'Mlýn na jablka', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Extrudovna I', category: 'Mlýn' },
  { id: 'STR_016', code: 'STR_016', name: 'Vysévač (EX I)', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Extrudovna I', category: 'Vysévač' },
  { id: 'STR_017', code: 'STR_017', name: 'Pytlovačka (EX I)', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Extrudovna I', category: 'Pytlovačka' },
  { id: 'STR_018', code: 'STR_018', name: 'Dopravník s násypkou (EX I)', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Extrudovna I', category: 'Dopravník' },
  { id: 'STR_019', code: 'STR_019', name: 'Dopravník 1 (EX I)', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Extrudovna I', category: 'Dopravník' },
  { id: 'STR_020', code: 'STR_020', name: 'Dopravník 2 (EX I)', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Extrudovna I', category: 'Dopravník' },
  { id: 'STR_021', code: 'STR_021', name: 'Žirafa (EX I)', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Extrudovna I', category: 'Dopravník' },
  { id: 'STR_022', code: 'STR_022', name: 'Topení 4', type: 'infrastructure', status: 'operational', buildingId: 'D', areaName: 'Extrudovna I', category: 'Topení' },
  { id: 'STR_023', code: 'STR_023', name: 'Topení 2', type: 'infrastructure', status: 'operational', buildingId: 'D', areaName: 'Extrudovna I', category: 'Topení' },
  { id: 'STR_024', code: 'STR_024', name: 'Strouhankový mlýn 1 (EX I)', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Extrudovna I', category: 'Mlýn' },
  
  // ─────────────────────────────────────────────────────────────────
  // EXTRUDOVNA II
  // ─────────────────────────────────────────────────────────────────
  { id: 'STR_025', code: 'STR_025', name: 'Extruder 3', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Extrudovna II', category: 'Extrudér' },
  { id: 'STR_026', code: 'STR_026', name: 'Extruder 4', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Extrudovna II', category: 'Extrudér' },
  { id: 'STR_027', code: 'STR_027', name: 'Vzduchový dopravník 1 (EX II)', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Extrudovna II', category: 'Dopravník' },
  { id: 'STR_028', code: 'STR_028', name: 'Vzduchový dopravník 2 (EX II)', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Extrudovna II', category: 'Dopravník' },
  { id: 'STR_029', code: 'STR_029', name: 'Zásobník na křupky 1 (EX II)', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Extrudovna II', category: 'Zásobník' },
  { id: 'STR_030', code: 'STR_030', name: 'Zásobník na křupky 2 (EX II)', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Extrudovna II', category: 'Zásobník' },
  { id: 'STR_031', code: 'STR_031', name: 'Dopravník vzduch. se šnekem (EX II)', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Extrudovna II', category: 'Dopravník' },
  { id: 'STR_032', code: 'STR_032', name: 'Šroťák', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Extrudovna II', category: 'Mlýn' },
  { id: 'STR_033', code: 'STR_033', name: 'Metal detekce (EX II)', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Extrudovna II', category: 'Metal detekce' },
  { id: 'STR_034', code: 'STR_034', name: 'Strouhankový mlýn 1 (EX II)', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Extrudovna II', category: 'Mlýn' },
  { id: 'STR_035', code: 'STR_035', name: 'Mlýn na rýžovku', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Extrudovna II', category: 'Mlýn' },
  { id: 'STR_036', code: 'STR_036', name: 'Žirafa na rýžovku', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Extrudovna II', category: 'Dopravník' },
  { id: 'STR_037', code: 'STR_037', name: 'Pytlovací váha (EX II)', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Extrudovna II', category: 'Váha' },
  { id: 'STR_038', code: 'STR_038', name: 'Dopravník k pytlovací váze', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Extrudovna II', category: 'Dopravník' },
  { id: 'STR_039', code: 'STR_039', name: 'Nauta', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Extrudovna II', category: 'Míchačka' },
  { id: 'STR_040', code: 'STR_040', name: 'Násypka na surovinu 1 (EX II)', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Extrudovna II', category: 'Násypka' },
  { id: 'STR_041', code: 'STR_041', name: 'Násypka na surovinu 2 (EX II)', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Extrudovna II', category: 'Násypka' },
  { id: 'STR_042', code: 'STR_042', name: 'Násypka na surovinu 3 (EX II)', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Extrudovna II', category: 'Násypka' },
  { id: 'STR_043', code: 'STR_043', name: 'Násypka na surovinu 4 (EX II)', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Extrudovna II', category: 'Násypka' },
  { id: 'STR_044', code: 'STR_044', name: 'Násypka na surovinu 5 (EX II)', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Extrudovna II', category: 'Násypka' },
  { id: 'STR_045', code: 'STR_045', name: 'Násypka malá k nautě 1', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Extrudovna II', category: 'Násypka' },
  { id: 'STR_046', code: 'STR_046', name: 'Násypka malá k nautě 2', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Extrudovna II', category: 'Násypka' },
  { id: 'STR_047', code: 'STR_047', name: 'Koza k mlýnu na mouku', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Extrudovna II', category: 'Dopravník' },
  { id: 'STR_048', code: 'STR_048', name: 'Vysavač 2', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Extrudovna II', category: 'Vysavač' },
  { id: 'STR_049', code: 'STR_049', name: 'Mlýn na mouku (EX II)', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Extrudovna II', category: 'Mlýn' },
  
  // ─────────────────────────────────────────────────────────────────
  // MÍCHÁRNA I & II
  // ─────────────────────────────────────────────────────────────────
  { id: 'STR_050', code: 'STR_050', name: 'Homogenizér (Míchárna I)', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Míchárna I', category: 'Homogenizér' },
  { id: 'STR_051', code: 'STR_051', name: 'Homogenizér 1 (Míchárna II)', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Míchárna II', category: 'Homogenizér' },
  { id: 'STR_052', code: 'STR_052', name: 'Míchačka chleby', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Míchárna II', category: 'Míchačka' },
  
  // ─────────────────────────────────────────────────────────────────
  // BALÍRNA
  // ─────────────────────────────────────────────────────────────────
  { id: 'STR_053', code: 'STR_053', name: 'Balička Lojza', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Balírna', category: 'Balička' },
  { id: 'STR_054', code: 'STR_054', name: 'Balička Karel', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Balírna', category: 'Balička' },
  { id: 'STR_055', code: 'STR_055', name: 'Balička Agáta', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Balírna', category: 'Balička' },
  { id: 'STR_056', code: 'STR_056', name: 'Kartonovačka', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Balírna', category: 'Kartonovačka' },
  { id: 'STR_057', code: 'STR_057', name: 'Pytlovačka (Balírna)', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Balírna', category: 'Pytlovačka' },
  
  // ─────────────────────────────────────────────────────────────────
  // KOTELNA
  // ─────────────────────────────────────────────────────────────────
  { id: 'STR_058', code: 'STR_058', name: 'Kotel', type: 'infrastructure', status: 'operational', buildingId: 'D', areaName: 'Kotelna', category: 'Kotel' },
  { id: 'STR_059', code: 'STR_059', name: 'Kompresor', type: 'infrastructure', status: 'operational', buildingId: 'D', areaName: 'Kotelna', category: 'Kompresor' },
  { id: 'STR_060', code: 'STR_060', name: 'Kogeneračka', type: 'infrastructure', status: 'operational', buildingId: 'D', areaName: 'Kotelna', category: 'Kogenerační jednotka' },
  
  // ─────────────────────────────────────────────────────────────────
  // MYCÍ MÍSTNOST
  // ─────────────────────────────────────────────────────────────────
  { id: 'STR_061', code: 'STR_061', name: 'Mycí stroj Hylda', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Mycí místnost', category: 'Mycí stroj' },
  { id: 'STR_062', code: 'STR_062', name: 'Mycí stroj malá', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Mycí místnost', category: 'Mycí stroj' },
  { id: 'STR_063', code: 'STR_063', name: 'Bedna na okap', type: 'tool', status: 'operational', buildingId: 'D', areaName: 'Mycí místnost', category: 'Příslušenství' },
  
  // ─────────────────────────────────────────────────────────────────
  // EXPEDICE
  // ─────────────────────────────────────────────────────────────────
  { id: 'STR_064', code: 'STR_064', name: 'Obalovačka', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Expedice', category: 'Obalovačka' },
  
  // ─────────────────────────────────────────────────────────────────
  // VZT (VZDUCHOTECHNIKA)
  // ─────────────────────────────────────────────────────────────────
  { id: 'STR_065', code: 'STR_065', name: 'VZT Dílna 1', type: 'infrastructure', status: 'operational', buildingId: 'D', areaName: 'VZT', category: 'Vzduchotechnika' },
  { id: 'STR_066', code: 'STR_066', name: 'VZT Dílna 2', type: 'infrastructure', status: 'operational', buildingId: 'D', areaName: 'VZT', category: 'Vzduchotechnika' },
  { id: 'STR_067', code: 'STR_067', name: 'VZT Pilové filtry EX.1.2.', type: 'infrastructure', status: 'operational', buildingId: 'D', areaName: 'VZT', category: 'Filtr' },
  { id: 'STR_068', code: 'STR_068', name: 'VZT Baterkárna', type: 'infrastructure', status: 'operational', buildingId: 'D', areaName: 'VZT', category: 'Vzduchotechnika' },
  { id: 'STR_069', code: 'STR_069', name: 'VZT Sklep', type: 'infrastructure', status: 'operational', buildingId: 'D', areaName: 'VZT', category: 'Vzduchotechnika' },
  { id: 'STR_070', code: 'STR_070', name: 'VZT Výdejna', type: 'infrastructure', status: 'operational', buildingId: 'D', areaName: 'VZT', category: 'Vzduchotechnika' },
  { id: 'STR_071', code: 'STR_071', name: 'VZT Balkon', type: 'infrastructure', status: 'operational', buildingId: 'D', areaName: 'VZT', category: 'Vzduchotechnika' },
  
  // ─────────────────────────────────────────────────────────────────
  // PŘEDFILTRY
  // ─────────────────────────────────────────────────────────────────
  { id: 'STR_072', code: 'STR_072', name: 'Předfiltr Extruder 1', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Předfiltry', category: 'Filtr' },
  { id: 'STR_073', code: 'STR_073', name: 'Předfiltr Extruder 2', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Předfiltry', category: 'Filtr' },
  { id: 'STR_074', code: 'STR_074', name: 'Předfiltr Extruder 3', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Předfiltry', category: 'Filtr' },
  { id: 'STR_075', code: 'STR_075', name: 'Předfiltr Extruder 4', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Předfiltry', category: 'Filtr' },
  
  // ─────────────────────────────────────────────────────────────────
  // TOPENÍ
  // ─────────────────────────────────────────────────────────────────
  { id: 'STR_076', code: 'STR_076', name: 'Topení 1', type: 'infrastructure', status: 'operational', buildingId: 'D', areaName: 'Topení', category: 'Topení' },
  { id: 'STR_077', code: 'STR_077', name: 'Topení 3', type: 'infrastructure', status: 'operational', buildingId: 'D', areaName: 'Topení', category: 'Topení' },
  
  // ─────────────────────────────────────────────────────────────────
  // PŘEVODOVKY
  // ─────────────────────────────────────────────────────────────────
  { id: 'STR_078', code: 'STR_078', name: 'Převodovka 1', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Převodovky', category: 'Převodovka' },
  { id: 'STR_079', code: 'STR_079', name: 'Převodovka 2', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Převodovky', category: 'Převodovka' },
  { id: 'STR_080', code: 'STR_080', name: 'Převodovka 3', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Převodovky', category: 'Převodovka' },
  { id: 'STR_081', code: 'STR_081', name: 'Převodovka 4', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Převodovky', category: 'Převodovka' },
  { id: 'STR_082', code: 'STR_082', name: 'Převodovka 5', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Převodovky', category: 'Převodovka' },
  
  // ─────────────────────────────────────────────────────────────────
  // ZDVIHACÍ ZAŘÍZENÍ (VZV)
  // ─────────────────────────────────────────────────────────────────
  { id: 'STR_083', code: 'STR_083', name: 'VZV Jung 1', type: 'vehicle', status: 'operational', buildingId: 'D', areaName: 'Zdvihací zařízení', category: 'Vysokozdvižný vozík' },
  { id: 'STR_084', code: 'STR_084', name: 'VZV Retrak 2', type: 'vehicle', status: 'operational', buildingId: 'D', areaName: 'Zdvihací zařízení', category: 'Vysokozdvižný vozík' },
  { id: 'STR_085', code: 'STR_085', name: 'VZV Toyota 3', type: 'vehicle', status: 'operational', buildingId: 'D', areaName: 'Zdvihací zařízení', category: 'Vysokozdvižný vozík' },
  { id: 'STR_086', code: 'STR_086', name: 'Plynová ještěrka 4', type: 'vehicle', status: 'operational', buildingId: 'D', areaName: 'Zdvihací zařízení', category: 'Vysokozdvižný vozík' },
  { id: 'STR_087', code: 'STR_087', name: 'VZV BT 4', type: 'vehicle', status: 'operational', buildingId: 'D', areaName: 'Zdvihací zařízení', category: 'Vysokozdvižný vozík' },
  { id: 'STR_088', code: 'STR_088', name: 'VZV BT 5', type: 'vehicle', status: 'operational', buildingId: 'D', areaName: 'Zdvihací zařízení', category: 'Vysokozdvižný vozík' },
  { id: 'STR_089', code: 'STR_089', name: 'VZV BT 3 Karkulka', type: 'vehicle', status: 'operational', buildingId: 'D', areaName: 'Zdvihací zařízení', category: 'Vysokozdvižný vozík' },
  { id: 'STR_090', code: 'STR_090', name: 'Paletový vozík Stihl 1', type: 'vehicle', status: 'operational', buildingId: 'D', areaName: 'Zdvihací zařízení', category: 'Paletový vozík' },
  { id: 'STR_091', code: 'STR_091', name: 'Paletový vozík Stihl 2', type: 'vehicle', status: 'operational', buildingId: 'D', areaName: 'Zdvihací zařízení', category: 'Paletový vozík' },
  
  // ─────────────────────────────────────────────────────────────────
  // NABÍJEČKY
  // ─────────────────────────────────────────────────────────────────
  { id: 'STR_092', code: 'STR_092', name: 'Nabíječka 1 (Retrak)', type: 'infrastructure', status: 'operational', buildingId: 'D', areaName: 'Nabíječky', category: 'Nabíječka' },
  { id: 'STR_093', code: 'STR_093', name: 'Nabíječka 2 (Ještěr)', type: 'infrastructure', status: 'operational', buildingId: 'D', areaName: 'Nabíječky', category: 'Nabíječka' },
  { id: 'STR_094', code: 'STR_094', name: 'Nabíječka 3 (Stihl)', type: 'infrastructure', status: 'operational', buildingId: 'D', areaName: 'Nabíječky', category: 'Nabíječka' },
  { id: 'STR_095', code: 'STR_095', name: 'Nabíječka 4 (EXT)', type: 'infrastructure', status: 'operational', buildingId: 'D', areaName: 'Nabíječky', category: 'Nabíječka' },
  { id: 'STR_096', code: 'STR_096', name: 'Nabíječka 5 (EXT)', type: 'infrastructure', status: 'operational', buildingId: 'D', areaName: 'Nabíječky', category: 'Nabíječka' },
  
  // ─────────────────────────────────────────────────────────────────
  // VÝTAHY
  // ─────────────────────────────────────────────────────────────────
  { id: 'STR_097', code: 'STR_097', name: 'Výtah expedice', type: 'infrastructure', status: 'operational', buildingId: 'D', areaName: 'Výtahy', category: 'Výtah' },
  { id: 'STR_098', code: 'STR_098', name: 'Výtah extrudovny', type: 'infrastructure', status: 'operational', buildingId: 'D', areaName: 'Výtahy', category: 'Výtah' },
  { id: 'STR_099', code: 'STR_099', name: 'Výtah bistro', type: 'infrastructure', status: 'operational', buildingId: 'A', areaName: 'Výtahy', category: 'Výtah' },
  
  // ─────────────────────────────────────────────────────────────────
  // MALÁ ZAŘÍZENÍ
  // ─────────────────────────────────────────────────────────────────
  { id: 'STR_100', code: 'STR_100', name: 'Šička 1', type: 'tool', status: 'operational', buildingId: 'D', areaName: 'Malá zařízení', category: 'Šička' },
  { id: 'STR_101', code: 'STR_101', name: 'Šička 2', type: 'tool', status: 'operational', buildingId: 'D', areaName: 'Malá zařízení', category: 'Šička' },
  { id: 'STR_102', code: 'STR_102', name: 'Šička 3', type: 'tool', status: 'operational', buildingId: 'D', areaName: 'Malá zařízení', category: 'Šička' },
  { id: 'STR_103', code: 'STR_103', name: 'Šička 4', type: 'tool', status: 'operational', buildingId: 'D', areaName: 'Malá zařízení', category: 'Šička' },
  { id: 'STR_104', code: 'STR_104', name: 'Šička 5', type: 'tool', status: 'operational', buildingId: 'D', areaName: 'Malá zařízení', category: 'Šička' },
  { id: 'STR_105', code: 'STR_105', name: 'Šička 6', type: 'tool', status: 'operational', buildingId: 'D', areaName: 'Malá zařízení', category: 'Šička' },
  { id: 'STR_106', code: 'STR_106', name: 'Váha 1 (pracovní)', type: 'tool', status: 'operational', buildingId: 'D', areaName: 'Malá zařízení', category: 'Váha' },
  { id: 'STR_107', code: 'STR_107', name: 'Váha 2 (pracovní)', type: 'tool', status: 'operational', buildingId: 'D', areaName: 'Malá zařízení', category: 'Váha' },
  { id: 'STR_108', code: 'STR_108', name: 'Váha 3 (pracovní)', type: 'tool', status: 'operational', buildingId: 'D', areaName: 'Malá zařízení', category: 'Váha' },
  { id: 'STR_109', code: 'STR_109', name: 'Váha 4 (pracovní)', type: 'tool', status: 'operational', buildingId: 'D', areaName: 'Malá zařízení', category: 'Váha' },
  { id: 'STR_110', code: 'STR_110', name: 'Váha 5 (pracovní)', type: 'tool', status: 'operational', buildingId: 'D', areaName: 'Malá zařízení', category: 'Váha' },
  { id: 'STR_111', code: 'STR_111', name: 'Váha 6 (pracovní)', type: 'tool', status: 'operational', buildingId: 'D', areaName: 'Malá zařízení', category: 'Váha' },
  { id: 'STR_112', code: 'STR_112', name: 'Váha 7 (pracovní)', type: 'tool', status: 'operational', buildingId: 'D', areaName: 'Malá zařízení', category: 'Váha' },
  { id: 'STR_113', code: 'STR_113', name: 'Vysavač 1', type: 'tool', status: 'operational', buildingId: 'D', areaName: 'Malá zařízení', category: 'Vysavač' },
  { id: 'STR_114', code: 'STR_114', name: 'Vysavač 2', type: 'tool', status: 'operational', buildingId: 'D', areaName: 'Malá zařízení', category: 'Vysavač' },
  { id: 'STR_115', code: 'STR_115', name: 'Vysavač 3', type: 'tool', status: 'operational', buildingId: 'D', areaName: 'Malá zařízení', category: 'Vysavač' },
  { id: 'STR_116', code: 'STR_116', name: 'Vysavač 4', type: 'tool', status: 'operational', buildingId: 'D', areaName: 'Malá zařízení', category: 'Vysavač' },
  
  // ─────────────────────────────────────────────────────────────────
  // MĚŘIDLA
  // ─────────────────────────────────────────────────────────────────
  { id: 'STR_117', code: 'STR_117', name: 'Paletová váha A12-534/12', type: 'tool', status: 'operational', buildingId: 'D', areaName: 'Měřidla', category: 'Váha stanovená', serialNumber: 'A12-534/12' },
  { id: 'STR_118', code: 'STR_118', name: 'Stolní váha CAS 150951184', type: 'tool', status: 'operational', buildingId: 'D', areaName: 'Měřidla', category: 'Váha stanovená', serialNumber: '150951184' },
  { id: 'STR_119', code: 'STR_119', name: 'Stolní váha CAS 110942507', type: 'tool', status: 'operational', buildingId: 'D', areaName: 'Měřidla', category: 'Váha stanovená', serialNumber: '110942507' },
  { id: 'STR_120', code: 'STR_120', name: 'Váha DIGI 09620918', type: 'tool', status: 'operational', buildingId: 'D', areaName: 'Měřidla', category: 'Váha stanovená', serialNumber: '09620918' },
  { id: 'STR_121', code: 'STR_121', name: 'Váha DIGI 13616214', type: 'tool', status: 'operational', buildingId: 'D', areaName: 'Měřidla', category: 'Váha stanovená', serialNumber: '13616214' },
  { id: 'STR_122', code: 'STR_122', name: 'Váha DIGI 12601473', type: 'tool', status: 'operational', buildingId: 'D', areaName: 'Měřidla', category: 'Váha stanovená', serialNumber: '12601473' },
  { id: 'STR_123', code: 'STR_123', name: 'Váha velká CAS 160654975', type: 'tool', status: 'operational', buildingId: 'D', areaName: 'Měřidla', category: 'Váha stanovená', serialNumber: '160654975' },
  { id: 'STR_124', code: 'STR_124', name: 'Průběžná váha LOMA I', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Měřidla', category: 'Váha průběžná' },
  { id: 'STR_125', code: 'STR_125', name: 'Průběžná váha LOMA II', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Měřidla', category: 'Váha průběžná' },
  { id: 'STR_126', code: 'STR_126', name: 'Průběžná váha LOMA III', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Měřidla', category: 'Váha průběžná' },
  { id: 'STR_127', code: 'STR_127', name: 'Datalogger 17932357', type: 'tool', status: 'operational', buildingId: 'D', areaName: 'Měřidla', category: 'Datalogger', serialNumber: '17932357' },
  { id: 'STR_128', code: 'STR_128', name: 'Metaldetektor LOMA (malá balička)', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Měřidla', category: 'Metal detekce' },
  { id: 'STR_129', code: 'STR_129', name: 'Metaldetektor LOMA (velká balička)', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Měřidla', category: 'Metal detekce' },
  { id: 'STR_130', code: 'STR_130', name: 'Metaldetektor LOMA (EX I)', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Měřidla', category: 'Metal detekce' },
  { id: 'STR_131', code: 'STR_131', name: 'Metaldetektor LOMA (EX II)', type: 'machine', status: 'operational', buildingId: 'D', areaName: 'Měřidla', category: 'Metal detekce' },
  { id: 'STR_132', code: 'STR_132', name: 'Teploměr Fluke 62 MAX+', type: 'tool', status: 'operational', buildingId: 'D', areaName: 'Měřidla', category: 'Teploměr' },
  { id: 'STR_133', code: 'STR_133', name: 'Datalogger 16930446', type: 'tool', status: 'operational', buildingId: 'D', areaName: 'Měřidla', category: 'Datalogger', serialNumber: '16930446' },
  { id: 'STR_134', code: 'STR_134', name: 'Datalogger 20930051', type: 'tool', status: 'operational', buildingId: 'D', areaName: 'Měřidla', category: 'Datalogger', serialNumber: '20930051' },
  { id: 'STR_135', code: 'STR_135', name: 'Datalogger 20930052', type: 'tool', status: 'operational', buildingId: 'D', areaName: 'Měřidla', category: 'Datalogger', serialNumber: '20930052' },
  { id: 'STR_136', code: 'STR_136', name: 'Paletová váha A12-108/17', type: 'tool', status: 'operational', buildingId: 'D', areaName: 'Měřidla', category: 'Váha informativní', serialNumber: 'A12-108/17' },
  { id: 'STR_137', code: 'STR_137', name: 'Paletová váha A12-066/16', type: 'tool', status: 'operational', buildingId: 'D', areaName: 'Měřidla', category: 'Váha informativní', serialNumber: 'A12-066/16' },
  { id: 'STR_138', code: 'STR_138', name: 'Litrová odměrka', type: 'tool', status: 'operational', buildingId: 'D', areaName: 'Měřidla', category: 'Odměrka' },
  { id: 'STR_139', code: 'STR_139', name: 'Můstková váha CAS 220559500', type: 'tool', status: 'operational', buildingId: 'D', areaName: 'Měřidla', category: 'Váha informativní', serialNumber: '220559500' },
  
  // ─────────────────────────────────────────────────────────────────
  // LOUPÁRNA (Budova L) — základní struktura
  // ─────────────────────────────────────────────────────────────────
  { id: 'STR_L01', code: 'SIL-001', name: 'Silo 1', type: 'infrastructure', status: 'operational', buildingId: 'L', areaName: 'Sila', category: 'Silo' },
  { id: 'STR_L02', code: 'SIL-002', name: 'Silo 2', type: 'infrastructure', status: 'operational', buildingId: 'L', areaName: 'Sila', category: 'Silo' },
  { id: 'STR_L03', code: 'SIL-003', name: 'Silo 3', type: 'infrastructure', status: 'operational', buildingId: 'L', areaName: 'Sila', category: 'Silo' },
  { id: 'STR_L04', code: 'SIL-004', name: 'Silo 4', type: 'infrastructure', status: 'operational', buildingId: 'L', areaName: 'Sila', category: 'Silo' },
  { id: 'STR_L05', code: 'LOU-001', name: 'Loupací linka', type: 'machine', status: 'operational', buildingId: 'L', areaName: 'Loupací linka', category: 'Loupačka' },
  { id: 'STR_L06', code: 'CIS-001', name: 'Čistička obilí', type: 'machine', status: 'operational', buildingId: 'L', areaName: 'Čištění', category: 'Čistička' },
];

// ═══════════════════════════════════════════════════════════════════
// MÍSTNOSTI (AREAS) — z budova_textova_data.csv
// ═══════════════════════════════════════════════════════════════════

const AREAS = [
  // 1. Patro - Budova D
  { id: 'D1.25', code: 'D 1.25', name: 'Údržba, mycí centrum', buildingId: 'D', floor: '1.Patro', checkItems: 'odpad podlaha, kontrola dřezu (odpad, kohouty), hadice na vodu, vzduchové hadice, sítky v oknech, odtah VZT, celistvost soklů a zdí' },
  { id: 'D1.24', code: 'D 1.24', name: 'Kancelář skladník', buildingId: 'D', floor: '1.Patro', checkItems: 'síť v okně, topení, celistvost soklů a zdí' },
  { id: 'D1.23', code: 'D1.23', name: 'Expedice', buildingId: 'D', floor: '1.Patro', checkItems: 'trubky topení, hmyzolapače, vrata 4x, rozvaděč, hasící přístroje, celistvost soklů a zdí' },
  { id: 'D1.21', code: 'D 1.21', name: 'WC řidiči', buildingId: 'D', floor: '1.Patro', checkItems: 'kontrola vlhkosti, umývadlo (odpad, kohoutek), WC, celistvost soklů a zdí' },
  { id: 'D1.22', code: 'D 1.22', name: 'WC expedice', buildingId: 'D', floor: '1.Patro', checkItems: 'kontrola vlhkosti, umývadlo (odpad, kohoutek), WC, celistvost soklů a zdí' },
  { id: 'D1.18', code: 'D 1.18', name: 'Úklidovka expedice', buildingId: 'D', floor: '1.Patro', checkItems: 'Bojler, hadice u bojleru k napouštění mycího stroje, expanzní nádrž, výlevka, rozvod vodoinstalace, celistvost soklů a zdí' },
  { id: 'D1.17', code: 'D 1.17', name: 'Odpadová místnost', buildingId: 'D', floor: '1.Patro', checkItems: 'úklid, mřížky ve zdi, celistvost soklů a zdí' },
  { id: 'D1.13a', code: 'D1.13a', name: 'U Agáty', buildingId: 'D', floor: '1.Patro', checkItems: '3x vzduchová hadice, síť v okně, rolety, průchody stropem, celistvost soklů a zdí' },
  { id: 'D1.13', code: 'D1.13', name: 'U kartonovačky', buildingId: 'D', floor: '1.Patro', checkItems: '9x vzduchové hadice, 3x síť v okně, rolety, topení, elekt. rozvody, VZT odtah/přívod, průchod stropem 2x, Rozvodna el., čidlo VZT, celistvost soklů a zdí' },
  { id: 'D1.9', code: 'D1.9', name: 'Úklidovka u kartonovačky', buildingId: 'D', floor: '1.Patro', checkItems: 'Bojler, expanzní nádrž, výlevka, umyvadlo, dávkovač 2x, dávkovač papíru kontrola funkce a dobití baterii, celistvost soklů a zdí' },
  { id: 'D1.12', code: 'D1.12', name: 'Kancelář Vedoucí výroby', buildingId: 'D', floor: '1.Patro', checkItems: '2x síť v okně, 2x rolety, čidlo VZT, celistvost soklů a zdí' },
  { id: 'D1.02', code: 'D1.02', name: 'Chodba u kotelny', buildingId: 'D', floor: '1.Patro', checkItems: '2x vrata, čidlo VZT, rozvody vody, vzduchu (žlaby), hydrant, nabíječky' },
  { id: 'D1.06a', code: 'D1.06', name: 'Sklad vzorků', buildingId: 'D', floor: '1.Patro', checkItems: 'zámek u dveří, VZT, čidla VZT, odpadní trubky, celistvost soklů a zdí' },
  { id: 'D1.08', code: 'D1.08', name: 'Prádelna', buildingId: 'D', floor: '1.Patro', checkItems: 'VZT - odtah kontrola funkčnosti, dřez, odpady u praček, celistvost soklů a zdí' },
  { id: 'D1.01', code: 'D1.01', name: 'Kotelna', buildingId: 'D', floor: '1.Patro', checkItems: 'síťky v oknech, čidlo VZT, vzduchová hadice, umyvadlo, zámek u vrat, celistvost soklů a zdí' },
  { id: 'D1.15', code: 'D1.15', name: 'Sklad surovin', buildingId: 'D', floor: '1.Patro', checkItems: 'topení, zatékání po dešti, kontrola regálů, vrata, akumulační nádrž, filtr chlazení motoru ex.4, hmyzolapač, čidla, VZT, klimatizace, police, celistvost soklů a zdí, okna střecha' },
  { id: 'D1.14', code: 'D1.14', name: 'Sklad hotové výrobky', buildingId: 'D', floor: '1.Patro', checkItems: 'požární clony, VZT, topení, kontrola regálů, střecha, balkonek, celistvost soklů a zdí, okna střecha' },
  
  // 2. Patro - Budova D
  { id: 'D2.11', code: 'D2.11', name: 'Chodba u výtahu', buildingId: 'D', floor: '2.Patro', checkItems: 'kontrola poškození regálu, hydrant, spára před výtahem, celistvost soklů a zdí' },
  { id: 'D2.12', code: 'D2.12', name: 'Sklad obalů', buildingId: 'D', floor: '2.Patro', checkItems: 'kontrola regálů, VZT čidla, hasičák, okna střecha, celistvost soklů a zdí' },
  { id: 'D2.1', code: 'D2.1', name: 'Sklad Extrudátu', buildingId: 'D', floor: '2.Patro', checkItems: 'kontrola regálů, VZT čidla, hasičák, okna střecha, celistvost soklů a zdí, dřez, bojler pod dřezem, rozvaděč, hasičáky' },
  { id: 'D2.092', code: 'D2.092', name: 'Míchárna II.', buildingId: 'D', floor: '2.Patro', checkItems: 'VZT, vzduchová hadice, signalizace, skříňka, celistvost soklů a zdí' },
  { id: 'D2.091', code: 'D2.091', name: 'Míchárna I.', buildingId: 'D', floor: '2.Patro', checkItems: 'VZT, vzduchová hadice, signalizace, skříňka, celistvost soklů a zdí' },
  { id: 'D2.08', code: 'D2.08', name: 'Extrudovna 1', buildingId: 'D', floor: '2.Patro', checkItems: 'vzduchové hadice, topení, olejové topení, voda, VZT, čidlo, vzduchový rukáv, klapky, elektrické rozvody u šroťáku, filtry v rozvaděčích, skříňka, celistvost soklů a zdí' },
  { id: 'D2.07', code: 'D2.07', name: 'Denní místnost', buildingId: 'D', floor: '2.Patro', checkItems: 'síť v okně, dřez, topení, stůl, lednice, prodlužka, celistvost soklů a zdí' },
  { id: 'D2.06', code: 'D2.06', name: 'WC', buildingId: 'D', floor: '2.Patro', checkItems: 'umyvadlo, WC, celistvost soklů a zdí, bateriový dávkovač ručníků' },
  { id: 'D2.02', code: 'D2.02', name: 'Chodba Ex.', buildingId: 'D', floor: '2.Patro', checkItems: 'kontrola regálů, VZT klapky, topení, hydrant, celistvost soklů a zdí' },
  { id: 'D2.05', code: 'D2.05', name: 'Úklidovka', buildingId: 'D', floor: '2.Patro', checkItems: 'výlevka, skříň, VZT, celistvost soklů a zdí' },
  { id: 'D2.04', code: 'D2.04', name: 'El. rozvodna', buildingId: 'D', floor: '2.Patro', checkItems: 'VZT, rozvaděč' },
  { id: 'D2.01', code: 'D2.01', name: 'Extrudovna 2.', buildingId: 'D', floor: '2.Patro', checkItems: 'vzduchové hadice, topení, olejové topení, voda, VZT, čidlo, vzduchový rukáv, klapky, elektrické rozvody u šroťáku, filtry v rozvaděčích, skříňka, celistvost soklů a zdí, schody k nautě, síť v okně' },
  
  // 3. Patro
  { id: 'D2.03', code: 'D2.03', name: 'VZT', buildingId: 'D', floor: '3.Patro', checkItems: 'zanešení filtrů VZT, filtry v rozvaděči' },
  
  // Budova C
  { id: 'C1.18', code: 'C1.18', name: 'Denní místnost', buildingId: 'C', floor: '1.Patro', checkItems: 'VZT, síťka v okně, topení, odpad u dřezu, celistvost soklů a zdí' },
  { id: 'C1.03a', code: 'C1.03', name: 'Chodba šatny směr A', buildingId: 'C', floor: '1.Patro', checkItems: 'VZT, hmyzolapač, hasičák, hydrant, skříňka návštěvy, celistvost soklů a zdí' },
  { id: 'C1.05', code: 'C1.05', name: 'Úklidová místnost', buildingId: 'C', floor: '1.Patro', checkItems: 'VZT, celistvost soklů a zdí' },
  { id: 'C1.17', code: 'C1.17/C1.13', name: 'Šatna ženy', buildingId: 'C', floor: '1.Patro', checkItems: 'topení, umyvadla, WC, sprchové kouty, VZT, celistvost soklů a zdí' },
  { id: 'C1.07', code: 'C1.07', name: 'Šatna Muži', buildingId: 'C', floor: '1.Patro', checkItems: 'topení, umyvadla, WC, sprchové kouty, VZT, celistvost soklů a zdí' },
  { id: 'C.01', code: 'C.01', name: 'Baterkárna FVE', buildingId: 'C', floor: '1.Patro', checkItems: 'rozvody vody, rozvaděč, klimatizace, baterie VZT, celistvost soklů a zdí' },
  { id: 'C1.02', code: 'C1.02', name: 'Místnost s Bojlerem', buildingId: 'C', floor: '1.Patro', checkItems: 'expanzní nádoba, bojler, celistvost soklů a zdí' },
  { id: 'C1.03b', code: 'C1.03', name: 'WC C', buildingId: 'C', floor: '1.Patro', checkItems: 'umyvadlo, WC, celistvost soklů a zdí' },
];

// ═══════════════════════════════════════════════════════════════════
// REVIZE
// ═══════════════════════════════════════════════════════════════════

const REVISIONS = [
  { id: 'rev-fire', type: 'FIRE', name: 'Hasicí přístroje', buildingId: 'D', intervalMonths: 12, nextRevisionAt: Timestamp.fromDate(new Date('2026-03-01')), provider: 'PYRO s.r.o.' },
  { id: 'rev-elec', type: 'ELEC', name: 'Elektrická zařízení', buildingId: 'D', intervalMonths: 36, nextRevisionAt: Timestamp.fromDate(new Date('2026-06-15')), provider: 'ElektroRevize CZ' },
  { id: 'rev-scale', type: 'CALIBRATION', name: 'Kalibrace vah (stanovené)', buildingId: 'D', intervalMonths: 12, nextRevisionAt: Timestamp.fromDate(new Date('2026-02-28')), provider: 'MetroCal' },
  { id: 'rev-lift', type: 'LIFT', name: 'Zdvihací zařízení (VZV)', buildingId: 'D', intervalMonths: 12, nextRevisionAt: Timestamp.fromDate(new Date('2026-09-01')), provider: 'TÜV SÜD' },
  { id: 'rev-elevator', type: 'LIFT', name: 'Výtahy', buildingId: 'D', intervalMonths: 12, nextRevisionAt: Timestamp.fromDate(new Date('2026-04-15')), provider: 'OTIS' },
  { id: 'rev-pressure', type: 'PRESSURE', name: 'Tlaková zařízení (kotel)', buildingId: 'D', intervalMonths: 12, nextRevisionAt: Timestamp.fromDate(new Date('2026-05-01')), provider: 'TI CZ' },
  { id: 'rev-metal', type: 'CALIBRATION', name: 'Metaldetektory LOMA', buildingId: 'D', intervalMonths: 6, nextRevisionAt: Timestamp.fromDate(new Date('2026-03-15')), provider: 'LOMA Systems' },
  { id: 'rev-datalogger', type: 'CALIBRATION', name: 'Dataloggery', buildingId: 'D', intervalMonths: 12, nextRevisionAt: Timestamp.fromDate(new Date('2026-07-01')), provider: 'TFA Dostmann' },
];

// ═══════════════════════════════════════════════════════════════════
// NASTAVENÍ
// ═══════════════════════════════════════════════════════════════════

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
  
  const batchSize = 500; // Firestore limit
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = db.batch();
    const chunk = data.slice(i, i + batchSize);
    
    for (const item of chunk) {
      const { id, ...rest } = item;
      const ref = db.collection(collectionName).doc(id);
      batch.set(ref, {
        ...rest,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    }
    
    await batch.commit();
  }
  
  console.log(`✅ ${collectionName}: ${data.length} documents`);
}

async function seedSettings() {
  console.log(`📝 Seeding settings...`);
  await db.collection('settings').doc(SETTINGS.id).set(SETTINGS);
  console.log(`✅ settings: 1 document`);
}

async function main() {
  console.log('🚀 Starting NOMINAL CMMS PRODUCTION seed...\n');
  console.log('═══════════════════════════════════════════════════════════════');
  
  try {
    await seedCollection('users', USERS);
    await seedCollection('assets', ASSETS);
    await seedCollection('areas', AREAS);
    await seedCollection('revisions', REVISIONS);
    await seedSettings();
    
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('✅ SEED COMPLETED SUCCESSFULLY!');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('\n📊 Summary:');
    console.log(`   Users:     ${USERS.length}`);
    console.log(`   Assets:    ${ASSETS.length}`);
    console.log(`   Areas:     ${AREAS.length}`);
    console.log(`   Revisions: ${REVISIONS.length}`);
    console.log(`   Settings:  1`);
    console.log(`   ─────────────────`);
    console.log(`   TOTAL:     ${USERS.length + ASSETS.length + AREAS.length + REVISIONS.length + 1} documents`);
    
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

main();

