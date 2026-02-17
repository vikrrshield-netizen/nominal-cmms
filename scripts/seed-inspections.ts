// scripts/seed-inspections.ts
// NOMINAL CMMS — Seed kontrolních bodů budovy C+D z Excelu
// Spusť: npx tsx scripts/seed-inspections.ts

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');

// Firebase Admin init
const app = initializeApp({
  projectId: 'nominal-cmms',
});
const db = getFirestore(app);

// ═══════════════════════════════════════════
// DATA Z EXCELU: formulář_budova.xlsx
// ═══════════════════════════════════════════

const TEMPLATES = [
  // === BUDOVA D — 1.NP ===
  { sortOrder: 1, building: 'D', floor: '1.NP', roomName: 'Údržba, mycí centrum', roomCode: 'D 1.25', checkPoints: 'odpad podlaha, kontrola dřezu (odpad, kohouty), hadice na vodu, vzduchové hadice, sítky v oknech, odtah VZT, celistvost soklů a zdí' },
  { sortOrder: 2, building: 'D', floor: '1.NP', roomName: 'Kancelář skladník', roomCode: 'D 1.24', checkPoints: 'síť v okně, topení, celistvost soklů a zdí' },
  { sortOrder: 3, building: 'D', floor: '1.NP', roomName: 'Expedice', roomCode: 'D1.23', checkPoints: 'trubky topení (poškození), hmyzolapače, vrata 4x, rozvaděč, hasicí přístroje, celistvost soklů a zdí' },
  { sortOrder: 4, building: 'D', floor: '1.NP', roomName: 'Výtah expedice', roomCode: '', checkPoints: 'poškození kabiny, spára před výtahem, poškození dveří' },
  { sortOrder: 5, building: 'D', floor: '1.NP', roomName: 'WC řidiči', roomCode: 'D 1.21', checkPoints: 'kontrola vlhkosti, umývadlo (odpad, kohoutek), WC, celistvost soklů a zdí' },
  { sortOrder: 6, building: 'D', floor: '1.NP', roomName: 'WC expedice', roomCode: 'D 1.22', checkPoints: 'kontrola vlhkosti, umývadlo (odpad, kohoutek), WC, celistvost soklů a zdí' },
  { sortOrder: 7, building: 'D', floor: '1.NP', roomName: 'Úklidovka expedice', roomCode: 'D 1.18', checkPoints: 'Bojler, hadice u bojleru k napouštění mycího stroje, expanzní nádrž, výlevka, rozvod vodoinstalace, celistvost soklů a zdí' },
  { sortOrder: 8, building: 'D', floor: '1.NP', roomName: 'Odpadová místnost', roomCode: 'D 1.17', checkPoints: 'úklid, mřížky ve zdi, celistvost soklů a zdí' },
  { sortOrder: 9, building: 'D', floor: '1.NP', roomName: 'U Agáty', roomCode: 'D1.13a', checkPoints: '3x vzduchová hadice, síť v okně, rolety, průchody stropem, celistvost soklů a zdí' },
  { sortOrder: 10, building: 'D', floor: '1.NP', roomName: 'U kartonovačky', roomCode: 'D1.13', checkPoints: '9x vzduchové hadice, 3x síť v okně, rolety, topení, elekt. rozvody, VZT odtah, přívod, průchod stropem 2x, rozvodna el., čidlo VZT, celistvost soklů a zdí' },
  { sortOrder: 11, building: 'D', floor: '1.NP', roomName: 'Úklidovka u kartonovačky', roomCode: 'D1.9', checkPoints: 'Bojler, expanzní nádrž, výlevka, umyvadlo, dávkovač 2x, dávkovač papíru kontrola funkce a dobití baterií, celistvost soklů a zdí' },
  { sortOrder: 12, building: 'D', floor: '1.NP', roomName: 'Kancelář vedoucí výroby', roomCode: 'D1.12', checkPoints: '2x síť v okně, 2x rolety, čidlo VZT, celistvost soklů a zdí' },
  { sortOrder: 13, building: 'D', floor: '1.NP', roomName: 'Chodba u kotelny', roomCode: 'D1.02', checkPoints: '2x vrata, čidlo VZT, rozvody vody, vzduchu (žlaby), hydrant, nabíječky' },
  { sortOrder: 14, building: 'D', floor: '1.NP', roomName: 'Výtah extrudovny', roomCode: 'D1.06', checkPoints: 'poškození kabiny, spára pod výtahem, poškození dveří' },
  { sortOrder: 15, building: 'D', floor: '1.NP', roomName: 'Sklad pod schody', roomCode: 'D1.02', checkPoints: 'vlhkost, pořádek, zamykání dveří, celistvost soklů a zdí' },
  { sortOrder: 16, building: 'D', floor: '1.NP', roomName: 'Sklad vzorků', roomCode: 'D1.06', checkPoints: 'zámek u dveří, VZT, čidla VZT, odpadní trubky, celistvost soklů a zdí' },
  { sortOrder: 17, building: 'D', floor: '1.NP', roomName: 'Prádelna', roomCode: 'D1.08', checkPoints: 'VZT - odtah kontrola funkčnosti, dřez, odpady u praček, celistvost soklů a zdí' },
  { sortOrder: 18, building: 'D', floor: '1.NP', roomName: 'Kotelna', roomCode: 'D1.01', checkPoints: 'síťky v oknech, čidlo VZT, vzduchová hadice, umyvadlo, zámek u vrat, celistvost soklů a zdí' },
  { sortOrder: 19, building: 'D', floor: '1.NP', roomName: 'Sklad surovin', roomCode: 'D1.15', checkPoints: 'topení, zatékání po dešti, kontrola regálů, vrata, akumulační nádrž, filtr chlazení motoru ex.4, hmyzolapač, čidla, VZT, klimatizace, police, celistvost soklů a zdí, okna střecha' },
  { sortOrder: 20, building: 'D', floor: '1.NP', roomName: 'Sklad hotové výrobky', roomCode: 'D1.14', checkPoints: 'požární clony, VZT, topení, kontrola regálů, střecha, balkonek, celistvost soklů a zdí, okna střecha' },
  { sortOrder: 21, building: 'D', floor: '1.NP', roomName: 'Vstup D', roomCode: '', checkPoints: 'vedení vody a topení' },
  { sortOrder: 22, building: 'D', floor: '1.NP', roomName: 'Sklad vedle vzorků', roomCode: 'D.05', checkPoints: 'zatékání z VZT, celistvost soklů a zdí' },
  { sortOrder: 23, building: 'D', floor: '1.NP', roomName: 'Sklad čistého prádla', roomCode: 'D.06', checkPoints: 'zatékání z VZT, celistvost soklů a zdí' },

  // === BUDOVA C — 1.NP ===
  { sortOrder: 24, building: 'C', floor: '1.NP', roomName: 'Denní místnost', roomCode: 'C1.18', checkPoints: 'VZT, síťka v okně, topení, odpad u dřezu, celistvost soklů a zdí' },
  { sortOrder: 25, building: 'C', floor: '1.NP', roomName: 'Chodba šatny směr A', roomCode: 'C1.03', checkPoints: 'VZT, hmyzolapač, hasičák, hydrant, skříňka návštěvy, celistvost soklů a zdí' },
  { sortOrder: 26, building: 'C', floor: '1.NP', roomName: 'Úklidová místnost', roomCode: 'C1.05', checkPoints: 'VZT, celistvost soklů a zdí' },
  { sortOrder: 27, building: 'C', floor: '1.NP', roomName: 'Šatna ženy', roomCode: 'C1.17/C1.13', checkPoints: 'topení, umyvadla, WC, sprchové kouty, VZT, celistvost soklů a zdí' },
  { sortOrder: 28, building: 'C', floor: '1.NP', roomName: 'Šatna muži', roomCode: 'C1.07', checkPoints: 'topení, umyvadla, WC, sprchové kouty, VZT, celistvost soklů a zdí' },
  { sortOrder: 29, building: 'C', floor: '1.NP', roomName: 'Baterkárna FVE', roomCode: 'C.01', checkPoints: 'rozvody vody, rozvaděč, klimatizace, baterie VZT, celistvost soklů a zdí' },
  { sortOrder: 30, building: 'C', floor: '1.NP', roomName: 'Místnost s bojlerem', roomCode: 'C1.02', checkPoints: 'expanzní nádoba, bojler, celistvost soklů a zdí' },
  { sortOrder: 31, building: 'C', floor: '1.NP', roomName: 'WC C', roomCode: 'C1.03', checkPoints: 'umyvadlo, WC, celistvost soklů a zdí' },
  { sortOrder: 32, building: 'C', floor: '1.NP', roomName: 'Chodba C', roomCode: '', checkPoints: 'kontrola celistvosti dřevěného stropu, celistvost soklů a zdí' },

  // === BUDOVA D — 2.NP ===
  { sortOrder: 33, building: 'D', floor: '2.NP', roomName: 'Schodiště expedice', roomCode: '', checkPoints: 'zábradlí, polep schodů, celistvost soklů a zdí' },
  { sortOrder: 34, building: 'D', floor: '2.NP', roomName: 'Chodba u výtahu', roomCode: 'D2.11', checkPoints: 'kontrola poškození regálu, hydrant, spára před výtahem, celistvost soklů a zdí' },
  { sortOrder: 35, building: 'D', floor: '2.NP', roomName: 'Sklad obalů', roomCode: 'D2.12', checkPoints: 'kontrola regálů, VZT čidla, hasičák, okna střecha, celistvost soklů a zdí' },
  { sortOrder: 36, building: 'D', floor: '2.NP', roomName: 'Sklad extrudátu', roomCode: 'D2.1', checkPoints: 'kontrola regálů, VZT čidla, hasičák, okna střecha, celistvost soklů a zdí, dřez, bojler pod dřezem, rozvaděč, hasičáky' },
  { sortOrder: 37, building: 'D', floor: '2.NP', roomName: 'Míchárna II', roomCode: 'D2.092', checkPoints: 'VZT, vzduchová hadice, signalizace, skříňka, celistvost soklů a zdí' },
  { sortOrder: 38, building: 'D', floor: '2.NP', roomName: 'Míchárna I', roomCode: 'D2.091', checkPoints: 'VZT, vzduchová hadice, signalizace, skříňka, celistvost soklů a zdí' },
  { sortOrder: 39, building: 'D', floor: '2.NP', roomName: 'Extrudovna 1', roomCode: 'D2.08', checkPoints: 'vzduchové hadice, topení, olejové topení, voda, VZT, čidlo, vzduchový rukáv, klapky, elektrické rozvody u šroťáku, filtry v rozvaděčích, skříňka, celistvost soklů a zdí' },
  { sortOrder: 40, building: 'D', floor: '2.NP', roomName: 'Denní místnost', roomCode: 'D2.07', checkPoints: 'síť v okně, dřez, topení, stůl, lednice, prodlužka, celistvost soklů a zdí' },
  { sortOrder: 41, building: 'D', floor: '2.NP', roomName: 'WC', roomCode: 'D2.06', checkPoints: 'umyvadlo, WC, celistvost soklů a zdí, bateriový dávkovač ručníků' },
  { sortOrder: 42, building: 'D', floor: '2.NP', roomName: 'Chodba extrudovna', roomCode: 'D2.02', checkPoints: 'kontrola regálů, VZT klapky, topení, hydrant, celistvost soklů a zdí' },
  { sortOrder: 43, building: 'D', floor: '2.NP', roomName: 'Úklidovka', roomCode: 'D2.05', checkPoints: 'výlevka, skříň, VZT, celistvost soklů a zdí' },
  { sortOrder: 44, building: 'D', floor: '2.NP', roomName: 'El. rozvodna', roomCode: 'D2.04', checkPoints: 'VZT, rozvaděč' },
  { sortOrder: 45, building: 'D', floor: '2.NP', roomName: 'Extrudovna 2', roomCode: 'D2.01', checkPoints: 'vzduchové hadice, topení, olejové topení, voda, VZT, čidlo, vzduchový rukáv, klapky, elektrické rozvody u šroťáku, filtry v rozvaděčích, skříňka, celistvost soklů a zdí, schody k nautě, síť v okně' },

  // === BUDOVA D — 3.NP ===
  { sortOrder: 46, building: 'D', floor: '3.NP', roomName: 'VZT strojovna', roomCode: 'D2.03', checkPoints: 'zanesení filtrů VZT, filtry v rozvaděči' },
];

async function seed() {
  console.log('=== NOMINAL CMMS — Seed kontrolních bodů budovy ===\n');

  const now = Timestamp.now();

  // 1. Seed šablon (inspection_templates)
  console.log(`Zapisuji ${TEMPLATES.length} šablon kontrolních bodů...`);
  const batch1 = db.batch();
  for (const t of TEMPLATES) {
    const id = `insp_${String(t.sortOrder).padStart(3, '0')}`;
    batch1.set(db.collection('inspection_templates').doc(id), {
      ...t,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    });
  }
  await batch1.commit();
  console.log(`✓ ${TEMPLATES.length} šablon`);

  // 2. Vytvoř aktuální měsíční log (únor 2026) — vše "pending"
  const month = '2026-02';
  console.log(`\nVytvářím měsíční log pro ${month}...`);

  // Simuluji že některé místnosti už byly zkontrolované
  const doneIds = [1, 2, 3, 5, 6, 7, 8, 24, 25, 26, 33, 34]; // 12 z 46 hotovo
  const defectIds = [3, 8]; // 2 se závadou

  const batch2 = db.batch();
  for (const t of TEMPLATES) {
    const logId = `log_${month}_${String(t.sortOrder).padStart(3, '0')}`;
    const isDone = doneIds.includes(t.sortOrder);
    const hasDefect = defectIds.includes(t.sortOrder);

    batch2.set(db.collection('inspection_logs').doc(logId), {
      templateId: `insp_${String(t.sortOrder).padStart(3, '0')}`,
      month,
      building: t.building,
      floor: t.floor,
      roomName: t.roomName,
      roomCode: t.roomCode,
      checkPoints: t.checkPoints,
      status: isDone ? (hasDefect ? 'defect' : 'ok') : 'pending',
      defectNote: hasDefect
        ? t.sortOrder === 3
          ? 'Prasklá hadice u vrat č.2, objednán díl'
          : 'Ucpaná mřížka ventilace, vyčistit'
        : '',
      completedBy: isDone ? 'Vilém Drápela' : '',
      completedAt: isDone ? now : null,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    });
  }
  await batch2.commit();

  const okCount = doneIds.filter((id) => !defectIds.includes(id)).length;
  const defectCount = defectIds.length;
  const pendingCount = TEMPLATES.length - doneIds.length;

  console.log(`✓ ${TEMPLATES.length} záznamů pro ${month}`);
  console.log(`  ✅ ${okCount} OK`);
  console.log(`  ⚠️  ${defectCount} se závadou`);
  console.log(`  ⏳ ${pendingCount} čeká na kontrolu`);

  console.log('\n=== Hotovo! ===');
  console.log(`Budova C: ${TEMPLATES.filter((t) => t.building === 'C').length} místností`);
  console.log(`Budova D 1.NP: ${TEMPLATES.filter((t) => t.building === 'D' && t.floor === '1.NP').length} místností`);
  console.log(`Budova D 2.NP: ${TEMPLATES.filter((t) => t.building === 'D' && t.floor === '2.NP').length} místností`);
  console.log(`Budova D 3.NP: ${TEMPLATES.filter((t) => t.building === 'D' && t.floor === '3.NP').length} místností`);

  setTimeout(() => process.exit(0), 2000);
}

seed().catch(console.error);
