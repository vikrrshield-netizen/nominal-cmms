// scripts/seed-louparna.ts
// NOMINAL CMMS — Seed: Loupárna (sila, výroba, plevy)
// Spustit: npx tsx scripts/seed-louparna.ts

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

initializeApp({
  credential: cert(require('../serviceAccount.json')),
});
const db = getFirestore();
const now = Timestamp.now();

function daysAgo(days: number): Timestamp {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return Timestamp.fromDate(d);
}

function hoursAgo(hours: number): Timestamp {
  const d = new Date();
  d.setHours(d.getHours() - hours);
  return Timestamp.fromDate(d);
}

// ═══════════════════════════════════════════
// A) SILA (4 zásobníky v budově L)
// ═══════════════════════════════════════════

const SILOS = [
  {
    id: 'silo_1',
    name: 'Silo 1',
    capacityTons: 50,
    currentLevel: 75,          // %
    material: 'Pohanka',
    materialCode: 'POH-01',
    temperature: 18,
    lastFilledAt: daysAgo(5),
    lastCleanedAt: daysAgo(30),
    buildingId: 'L',
    notes: null,
  },
  {
    id: 'silo_2',
    name: 'Silo 2',
    capacityTons: 50,
    currentLevel: 30,
    material: 'Proso',
    materialCode: 'PRS-01',
    temperature: 17,
    lastFilledAt: daysAgo(7),
    lastCleanedAt: daysAgo(25),
    buildingId: 'L',
    notes: null,
  },
  {
    id: 'silo_3',
    name: 'Silo 3',
    capacityTons: 50,
    currentLevel: 92,
    material: 'Čirok',
    materialCode: 'CIR-01',
    temperature: 16,
    lastFilledAt: daysAgo(1),
    lastCleanedAt: daysAgo(35),
    buildingId: 'L',
    notes: 'Nová dodávka 14.2.',
  },
  {
    id: 'silo_4',
    name: 'Silo 4',
    capacityTons: 50,
    currentLevel: 5,
    material: 'Prázdné',
    materialCode: '',
    temperature: 15,
    lastFilledAt: null,
    lastCleanedAt: daysAgo(3),
    buildingId: 'L',
    notes: 'Vyčištěno, připraveno k plnění',
  },
];

// ═══════════════════════════════════════════
// B) VÝROBNÍ ŠARŽE (production_log)
// ═══════════════════════════════════════════

const BATCHES = [
  {
    id: 'batch_2026_041',
    batchCode: 'LOT-2026-041',
    material: 'Pohanka',
    inputSiloId: 'silo_1',
    inputKg: 2500,
    outputKg: 2125,             // ~85% výtěžnost
    outputKs: 425,              // balení po 5 kg
    wasteKg: 375,               // plevy
    yieldPercent: 85,
    status: 'completed',
    startedAt: daysAgo(4),
    completedAt: daysAgo(4),
    operatorName: 'Kiosk Velín',
    notes: null,
  },
  {
    id: 'batch_2026_042',
    batchCode: 'LOT-2026-042',
    material: 'Proso',
    inputSiloId: 'silo_2',
    inputKg: 1800,
    outputKg: 1494,
    outputKs: 299,
    wasteKg: 306,
    yieldPercent: 83,
    status: 'completed',
    startedAt: daysAgo(3),
    completedAt: daysAgo(3),
    operatorName: 'Kiosk Velín',
    notes: null,
  },
  {
    id: 'batch_2026_043',
    batchCode: 'LOT-2026-043',
    material: 'Čirok',
    inputSiloId: 'silo_3',
    inputKg: 3000,
    outputKg: 2610,
    outputKs: 522,
    wasteKg: 390,
    yieldPercent: 87,
    status: 'completed',
    startedAt: daysAgo(2),
    completedAt: daysAgo(2),
    operatorName: 'Kiosk Velín',
    notes: 'Vyšší výtěžnost — nová dodávka',
  },
  {
    id: 'batch_2026_044',
    batchCode: 'LOT-2026-044',
    material: 'Pohanka',
    inputSiloId: 'silo_1',
    inputKg: 2000,
    outputKg: 1700,
    outputKs: 340,
    wasteKg: 300,
    yieldPercent: 85,
    status: 'completed',
    startedAt: daysAgo(1),
    completedAt: daysAgo(1),
    operatorName: 'Kiosk Velín',
    notes: null,
  },
  {
    id: 'batch_2026_045',
    batchCode: 'LOT-2026-045',
    material: 'Pohanka',
    inputSiloId: 'silo_1',
    inputKg: 2200,
    outputKg: null,             // ← probíhá
    outputKs: null,
    wasteKg: null,
    yieldPercent: null,
    status: 'running',
    startedAt: hoursAgo(3),
    completedAt: null,
    operatorName: 'Kiosk Velín',
    notes: 'Aktuálně běží',
  },
];

// ═══════════════════════════════════════════
// C) PLEVY — specifický odpad Loupárny
// ═══════════════════════════════════════════

const WASTE_TICKETS = [
  {
    id: 'plevy_001',
    type: 'plevy',
    batchId: 'batch_2026_041',
    batchCode: 'LOT-2026-041',
    weightKg: 375,
    status: 'completed',
    requestedBy: 'Kiosk Velín',
    requestedAt: daysAgo(4),
    pickedUpBy: 'Filip Novák',
    pickedUpAt: daysAgo(4),
    vehicleUsed: 'JCB 3CX',
    destinationNote: 'Odvoz na kompostárnu Kozlov',
    buildingId: 'L',
  },
  {
    id: 'plevy_002',
    type: 'plevy',
    batchId: 'batch_2026_042',
    batchCode: 'LOT-2026-042',
    weightKg: 306,
    status: 'completed',
    requestedBy: 'Kiosk Velín',
    requestedAt: daysAgo(3),
    pickedUpBy: 'Filip Novák',
    pickedUpAt: daysAgo(3),
    vehicleUsed: 'JCB 3CX',
    destinationNote: 'Odvoz na kompostárnu Kozlov',
    buildingId: 'L',
  },
  {
    id: 'plevy_003',
    type: 'plevy',
    batchId: 'batch_2026_043',
    batchCode: 'LOT-2026-043',
    weightKg: 390,
    status: 'completed',
    requestedBy: 'Kiosk Velín',
    requestedAt: daysAgo(2),
    pickedUpBy: 'Petr Volf',
    pickedUpAt: daysAgo(2),
    vehicleUsed: 'VZV Linde H30',
    destinationNote: 'Odvoz na kompostárnu Kozlov',
    buildingId: 'L',
  },
  {
    id: 'plevy_004',
    type: 'plevy',
    batchId: 'batch_2026_044',
    batchCode: 'LOT-2026-044',
    weightKg: 300,
    status: 'pending',          // ← čeká na odvoz!
    requestedBy: 'Kiosk Velín',
    requestedAt: daysAgo(1),
    pickedUpBy: null,
    pickedUpAt: null,
    vehicleUsed: null,
    destinationNote: null,
    buildingId: 'L',
  },
];

// ═══════════════════════════════════════════
// D) VÝROBNÍ STANICE (linka + čistička)
// ═══════════════════════════════════════════

const MACHINES = [
  {
    id: 'louparna_linka',
    name: 'Loupací linka',
    status: 'running',
    currentBatchId: 'batch_2026_045',
    currentBatchCode: 'LOT-2026-045',
    lastMaintenanceAt: daysAgo(14),
    buildingId: 'L',
    notes: null,
  },
  {
    id: 'louparna_cisticka',
    name: 'Čistička obilí',
    status: 'stopped',
    currentBatchId: null,
    currentBatchCode: null,
    lastMaintenanceAt: daysAgo(18),
    buildingId: 'L',
    notes: 'Čeká na surovinu z Sila 4',
  },
];

// ═══════════════════════════════════════════
// SEED
// ═══════════════════════════════════════════

async function seed() {
  console.log('=== NOMINAL CMMS — Loupárna Seed ===\n');

  // --- SILA ---
  const siloCol = db.collection('louparna_silos');
  const existingSilos = await siloCol.get();
  if (existingSilos.size > 0) {
    const b = db.batch();
    existingSilos.docs.forEach((d) => b.delete(d.ref));
    await b.commit();
  }
  const siloBatch = db.batch();
  for (const silo of SILOS) {
    siloBatch.set(siloCol.doc(silo.id), {
      ...silo,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    });
  }
  await siloBatch.commit();
  console.log(`✓ ${SILOS.length} sila`);

  // --- PRODUCTION LOG ---
  const prodCol = db.collection('louparna_production');
  const existingProd = await prodCol.get();
  if (existingProd.size > 0) {
    const b = db.batch();
    existingProd.docs.forEach((d) => b.delete(d.ref));
    await b.commit();
  }
  const prodBatch = db.batch();
  for (const batch of BATCHES) {
    prodBatch.set(prodCol.doc(batch.id), {
      ...batch,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    });
  }
  await prodBatch.commit();
  console.log(`✓ ${BATCHES.length} výrobních šarží (${BATCHES.filter(b => b.status === 'running').length} běží)`);

  // --- WASTE TICKETS (plevy) ---
  const wasteCol = db.collection('louparna_waste');
  const existingWaste = await wasteCol.get();
  if (existingWaste.size > 0) {
    const b = db.batch();
    existingWaste.docs.forEach((d) => b.delete(d.ref));
    await b.commit();
  }
  const wasteBatch = db.batch();
  for (const ticket of WASTE_TICKETS) {
    wasteBatch.set(wasteCol.doc(ticket.id), {
      ...ticket,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    });
  }
  await wasteBatch.commit();
  const pending = WASTE_TICKETS.filter(t => t.status === 'pending').length;
  console.log(`✓ ${WASTE_TICKETS.length} plevy ticketů (${pending} čeká na odvoz)`);

  // --- MACHINES ---
  const machCol = db.collection('louparna_machines');
  const existingMach = await machCol.get();
  if (existingMach.size > 0) {
    const b = db.batch();
    existingMach.docs.forEach((d) => b.delete(d.ref));
    await b.commit();
  }
  const machBatch = db.batch();
  for (const machine of MACHINES) {
    machBatch.set(machCol.doc(machine.id), {
      ...machine,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    });
  }
  await machBatch.commit();
  console.log(`✓ ${MACHINES.length} výrobní stanice`);

  // Summary
  console.log('\n── Souhrn ──');
  console.log(`   Sila:     ${SILOS.length} (${SILOS.filter(s => s.currentLevel < 20).length} nízký stav)`);
  console.log(`   Šarže:    ${BATCHES.length} (${BATCHES.filter(b => b.status === 'completed').length} dokončených, ${BATCHES.filter(b => b.status === 'running').length} běží)`);
  console.log(`   Plevy:    ${WASTE_TICKETS.length} (${pending} pending ⚠️)`);
  console.log(`   Stanice:  ${MACHINES.length}`);

  const totalOutput = BATCHES.filter(b => b.outputKg).reduce((sum, b) => sum + (b.outputKg || 0), 0);
  const totalWaste = BATCHES.filter(b => b.wasteKg).reduce((sum, b) => sum + (b.wasteKg || 0), 0);
  console.log(`\n   Celková výroba:  ${totalOutput.toLocaleString('cs-CZ')} kg`);
  console.log(`   Celkové plevy:   ${totalWaste.toLocaleString('cs-CZ')} kg`);
  console.log(`   Průměrná výtěžnost: ${Math.round(totalOutput / (totalOutput + totalWaste) * 100)}%`);

  console.log('\n=== HOTOVO ===');
}

seed().catch(console.error);
