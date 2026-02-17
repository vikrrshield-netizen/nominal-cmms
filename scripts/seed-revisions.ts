// scripts/seed-revisions.ts
// NOMINAL CMMS — Seed: revisions (legislativní revize)
// Spustit: npx tsx scripts/seed-revisions.ts

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

initializeApp({
  credential: cert(require('../serviceAccount.json')),
});
const db = getFirestore();
const now = Timestamp.now();

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

// ═══════════════════════════════════════════
// REVIZE — legislativní termíny
// ═══════════════════════════════════════════

type RevisionType = 'electrical' | 'gas' | 'pressure' | 'lifting' | 'fire' | 'other';

const REVISIONS = [
  // --- ELEKTRO ---
  {
    id: 'rev_rozvodna_d',
    title: 'Revize elektrického rozvaděče RH1',
    type: 'electrical' as RevisionType,
    assetId: 'rozvodna_d1',
    assetName: 'Rozvaděč hlavní RH1',
    buildingId: 'D',
    areaName: 'Kotelna (1.NP)',
    intervalMonths: 36, // 3 roky
    lastRevisionDate: daysAgo(1000), // ~2.7 roku zpět
    nextRevisionDate: daysFromNow(95), // za 95 dní ✅ OK
    revisionCompany: 'REVIZE Novotný s.r.o.',
    technicianName: 'Ing. Jaroslav Novotný',
    certificateNumber: 'EL-2023-0847',
    notes: 'Hlavní rozvaděč výrobní haly, 3-fázový, 400A',
    status: 'valid',
  },
  {
    id: 'rev_rozvodna_d2',
    title: 'Revize elektrického rozvaděče RH2',
    type: 'electrical' as RevisionType,
    assetId: 'rozvodna_d2',
    assetName: 'Rozvaděč RH2 — Extruze',
    buildingId: 'D',
    areaName: 'Velín extruze (2.NP)',
    intervalMonths: 36,
    lastRevisionDate: daysAgo(1050),
    nextRevisionDate: daysFromNow(28), // ⚠️ EXPIRING SOON (< 30 dní)
    revisionCompany: 'REVIZE Novotný s.r.o.',
    technicianName: 'Ing. Jaroslav Novotný',
    certificateNumber: 'EL-2023-0848',
    notes: 'Rozvaděč napájení extruderů, 250A',
    status: 'expiring',
  },
  {
    id: 'rev_hromosvod',
    title: 'Revize hromosvodu budova D',
    type: 'electrical' as RevisionType,
    assetId: null,
    assetName: 'Hromosvod budova D',
    buildingId: 'D',
    areaName: 'Střecha',
    intervalMonths: 60, // 5 let
    lastRevisionDate: daysAgo(1800), // ~5 let zpět
    nextRevisionDate: daysAgo(25), // 🔴 EXPIRED! (25 dní po termínu)
    revisionCompany: 'Bleskosvod CZ s.r.o.',
    technicianName: 'Karel Hromádka',
    certificateNumber: 'HR-2021-0312',
    notes: 'Jímací tyče + svody + zemniče. Nutno objednat revizi!',
    status: 'expired',
  },

  // --- PLYN ---
  {
    id: 'rev_kotelna_plyn',
    title: 'Revize plynového zařízení — Kotelna',
    type: 'gas' as RevisionType,
    assetId: 'kotel_01',
    assetName: 'Plynový kotel Viessmann',
    buildingId: 'D',
    areaName: 'Kotelna (1.NP)',
    intervalMonths: 12, // roční
    lastRevisionDate: daysAgo(300),
    nextRevisionDate: daysFromNow(65), // ✅ OK
    revisionCompany: 'Plynservis Vysočina',
    technicianName: 'Miroslav Kadlec',
    certificateNumber: 'PL-2025-1204',
    notes: '2x kotel Viessmann Vitoplex 200, výkon 350 kW',
    status: 'valid',
  },
  {
    id: 'rev_kgj',
    title: 'Revize KGJ (kogenerační jednotka)',
    type: 'gas' as RevisionType,
    assetId: 'kgj_01',
    assetName: 'KGJ Tedom Micro T30',
    buildingId: 'D',
    areaName: 'Kotelna (1.NP)',
    intervalMonths: 12,
    lastRevisionDate: daysAgo(340),
    nextRevisionDate: daysFromNow(25), // ⚠️ EXPIRING SOON
    revisionCompany: 'Tedom servis',
    technicianName: 'Petr Šťastný',
    certificateNumber: 'PL-2025-1189',
    notes: 'Kogenerační jednotka, výkon 30 kWe / 48 kWt',
    status: 'expiring',
  },

  // --- TLAKOVÉ NÁDOBY ---
  {
    id: 'rev_vzdusnik_1',
    title: 'Tlaková zkouška vzdušníku 500L',
    type: 'pressure' as RevisionType,
    assetId: 'kompresor_01',
    assetName: 'Vzdušník 500L (Kompresorovna)',
    buildingId: 'D',
    areaName: 'Kompresory (1.NP)',
    intervalMonths: 60, // 5 let provozní, 10 let tlaková
    lastRevisionDate: daysAgo(400),
    nextRevisionDate: daysFromNow(1425), // ✅ OK (daleko)
    revisionCompany: 'TÜV SÜD Czech',
    technicianName: 'Ing. Pavel Bureš',
    certificateNumber: 'TN-2025-3487',
    notes: 'Provozní tlak 10 bar, objem 500L, výrobce JOKL',
    status: 'valid',
  },
  {
    id: 'rev_vzdusnik_2',
    title: 'Provozní revize vzdušníku 200L',
    type: 'pressure' as RevisionType,
    assetId: 'kompresor_02',
    assetName: 'Vzdušník 200L (Balírna)',
    buildingId: 'D',
    areaName: 'Balírna (1.NP)',
    intervalMonths: 12,
    lastRevisionDate: daysAgo(380),
    nextRevisionDate: daysAgo(15), // 🔴 EXPIRED!
    revisionCompany: 'TÜV SÜD Czech',
    technicianName: 'Ing. Pavel Bureš',
    certificateNumber: 'TN-2024-2901',
    notes: 'Provozní revize po 12 měsících. PŘEKROČENO!',
    status: 'expired',
  },

  // --- ZVEDACÍ ZAŘÍZENÍ ---
  {
    id: 'rev_vzv_linde',
    title: 'Revize VZV Linde H30',
    type: 'lifting' as RevisionType,
    assetId: 'fleet_vzv_linde',
    assetName: 'VZV Linde H30',
    buildingId: 'D',
    areaName: 'Sklad',
    intervalMonths: 12,
    lastRevisionDate: daysAgo(280),
    nextRevisionDate: daysFromNow(85), // ✅ OK
    revisionCompany: 'Linde Material Handling CZ',
    technicianName: 'Tomáš Vrba',
    certificateNumber: 'ZZ-2025-0456',
    notes: 'VZV H30, nosnost 3000 kg, diesel',
    status: 'valid',
  },
  {
    id: 'rev_vzv_jungheinrich',
    title: 'Revize VZV Jungheinrich EFG 216',
    type: 'lifting' as RevisionType,
    assetId: 'fleet_vzv_jungheinrich',
    assetName: 'VZV Jungheinrich EFG 216',
    buildingId: 'D',
    areaName: 'Sklad',
    intervalMonths: 12,
    lastRevisionDate: daysAgo(350),
    nextRevisionDate: daysFromNow(15), // ⚠️ EXPIRING SOON
    revisionCompany: 'Jungheinrich CZ',
    technicianName: 'Martin Řezáč',
    certificateNumber: 'ZZ-2025-0457',
    notes: 'Elektrický VZV, nosnost 1600 kg, trakční baterie',
    status: 'expiring',
  },

  // --- POŽÁRNÍ ---
  {
    id: 'rev_hasici_d',
    title: 'Kontrola hasicích přístrojů — budova D',
    type: 'fire' as RevisionType,
    assetId: null,
    assetName: 'Hasicí přístroje budova D (12 ks)',
    buildingId: 'D',
    areaName: 'Celá budova',
    intervalMonths: 12,
    lastRevisionDate: daysAgo(310),
    nextRevisionDate: daysFromNow(55), // ✅ OK
    revisionCompany: 'POŽÁR-SERVIS s.r.o.',
    technicianName: 'Jiří Havelka',
    certificateNumber: 'PO-2025-0891',
    notes: '8x práškový 6kg, 2x CO2 5kg, 2x pěnový 9L',
    status: 'valid',
  },
];

// ═══════════════════════════════════════════
// SEED
// ═══════════════════════════════════════════

async function seed() {
  console.log('=== NOMINAL CMMS — Revisions Seed ===\n');

  // Smaž staré revize
  const existing = await db.collection('revisions').get();
  if (existing.size > 0) {
    const batch = db.batch();
    existing.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    console.log(`   Smazáno ${existing.size} starých revizí`);
  }

  // Vlož nové
  const batch = db.batch();
  for (const rev of REVISIONS) {
    batch.set(db.collection('revisions').doc(rev.id), {
      ...rev,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    });
  }
  await batch.commit();

  // Stats
  const valid = REVISIONS.filter((r) => r.status === 'valid').length;
  const expiring = REVISIONS.filter((r) => r.status === 'expiring').length;
  const expired = REVISIONS.filter((r) => r.status === 'expired').length;

  console.log(`\n✓ ${REVISIONS.length} revizí vloženo`);
  console.log(`   🟢 Platné: ${valid}`);
  console.log(`   🟡 Končí brzy: ${expiring}`);
  console.log(`   🔴 Prošlé: ${expired}`);

  console.log('\nDetail:');
  REVISIONS.forEach((r) => {
    const icon = r.status === 'expired' ? '🔴' : r.status === 'expiring' ? '🟡' : '🟢';
    console.log(`   ${icon} ${r.title}`);
  });

  console.log('\n=== HOTOVO ===');
}

seed().catch(console.error);
