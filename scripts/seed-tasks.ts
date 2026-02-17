// scripts/seed-tasks.ts
// NOMINAL CMMS — Seed dat pro tasks kolekci
// Spustit: npx tsx scripts/seed-tasks.ts

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

// ═══════════════════════════════════════════════════════════════════
// INIT (stejný pattern jako seed-production.ts)
// ═══════════════════════════════════════════════════════════════════

// Pokud nemáš service account, použij alternativu níže
initializeApp({
  projectId: 'nominal-cmms',
});

const db = getFirestore();

// ═══════════════════════════════════════════════════════════════════
// SEED DATA
// ═══════════════════════════════════════════════════════════════════

interface SeedTask {
  code: string;
  title: string;
  description?: string;
  type: 'corrective' | 'preventive' | 'inspection' | 'improvement';
  status: 'backlog' | 'planned' | 'in_progress' | 'paused' | 'completed' | 'cancelled';
  priority: 'P1' | 'P2' | 'P3' | 'P4';
  source: 'web' | 'kiosk';
  assetId?: string;
  assetName?: string;
  buildingId?: string;
  assigneeId?: string;
  assigneeName?: string;
  assigneeColor?: string;
  createdById: string;
  createdByName: string;
  createdDaysAgo: number;       // Kolik dní zpět
  plannedDaysFromNow?: number;  // Kolik dní od teď
  estimatedMinutes?: number;
  actualMinutes?: number;
  resolution?: string;
  plannedWeek?: string;
}

// User IDs z Firebase Auth (z seed-production.ts / sync-users.ts)
// Pozor: Tady používáme Firebase Auth UID — ty se mohou lišit!
// Pokud neznáš přesné UID, použij placeholder a uprav po seedu.
const USERS = {
  vilem:   { id: 'vilem_uid',   name: 'Vilém',   color: '#16a34a' },
  zdenek:  { id: 'zdenek_uid',  name: 'Zdeněk',  color: '#64748b' },
  petr:    { id: 'petr_uid',    name: 'Petr',     color: '#0ea5e9' },
  pavla:   { id: 'pavla_uid',   name: 'Pavla',    color: '#a855f7' },
  milan:   { id: 'milan_uid',   name: 'Milan',    color: '#f59e0b' },
  filip:   { id: 'filip_uid',   name: 'Filip',    color: '#ef4444' },
  martina: { id: 'martina_uid', name: 'Martina',  color: '#ec4899' },
  kiosk:   { id: 'kiosk_uid',   name: 'Kiosk',    color: '#6b7280' },
};

const TASKS: SeedTask[] = [
  // ── P1 HAVÁRIE (aktivní) ──────────────────────────────────────
  {
    code: 'WO-2026-001',
    title: 'Výměna ložiska na Extruderu 3',
    description: 'Hlučné ložisko SKF 6205, vibrace nad limitem. Nutná okamžitá výměna.',
    type: 'corrective',
    status: 'in_progress',
    priority: 'P1',
    source: 'web',
    assetId: 'STR_003',
    assetName: 'Extruder 3',
    buildingId: 'D',
    assigneeId: USERS.vilem.id,
    assigneeName: USERS.vilem.name,
    assigneeColor: USERS.vilem.color,
    createdById: USERS.zdenek.id,
    createdByName: USERS.zdenek.name,
    createdDaysAgo: 1,
    estimatedMinutes: 120,
    actualMinutes: 45,
  },
  {
    code: 'WO-2026-002',
    title: 'Balička Karel — zasekávání fólie',
    description: 'Fólie se trhá při vysoké rychlosti. Zkontrolovat napínací válce a nůž.',
    type: 'corrective',
    status: 'backlog',
    priority: 'P1',
    source: 'kiosk',
    assetId: 'STR_053',
    assetName: 'Balička Karel',
    buildingId: 'D',
    createdById: USERS.kiosk.id,
    createdByName: 'Operátor (kiosk)',
    createdDaysAgo: 0,
    estimatedMinutes: 90,
  },

  // ── P2 TENTO TÝDEN ────────────────────────────────────────────
  {
    code: 'WO-2026-003',
    title: 'Kontrola oleje KGJ',
    description: 'Pravidelná kontrola oleje a filtrů na kogenerační jednotce.',
    type: 'preventive',
    status: 'planned',
    priority: 'P2',
    source: 'web',
    assetId: 'STR_058',
    assetName: 'Kogenerační jednotka',
    buildingId: 'D',
    assigneeId: USERS.vilem.id,
    assigneeName: USERS.vilem.name,
    assigneeColor: USERS.vilem.color,
    createdById: USERS.vilem.id,
    createdByName: USERS.vilem.name,
    createdDaysAgo: 5,
    plannedDaysFromNow: 1,
    estimatedMinutes: 45,
    plannedWeek: '2026-W08',
  },
  {
    code: 'WO-2026-004',
    title: 'Výměna řemene na míchačce',
    description: 'Řemen prokluzuje, snížený výkon míchání.',
    type: 'corrective',
    status: 'planned',
    priority: 'P2',
    source: 'web',
    assetId: 'STR_050',
    assetName: 'Míchárna I',
    buildingId: 'D',
    assigneeId: USERS.zdenek.id,
    assigneeName: USERS.zdenek.name,
    assigneeColor: USERS.zdenek.color,
    createdById: USERS.pavla.id,
    createdByName: USERS.pavla.name,
    createdDaysAgo: 3,
    plannedDaysFromNow: 2,
    estimatedMinutes: 60,
    plannedWeek: '2026-W08',
  },
  {
    code: 'WO-2026-005',
    title: 'Oprava úniku oleje — Extruder 7',
    type: 'corrective',
    status: 'paused',
    priority: 'P2',
    source: 'web',
    assetId: 'STR_007',
    assetName: 'Extruder 7',
    buildingId: 'D',
    assigneeId: USERS.vilem.id,
    assigneeName: USERS.vilem.name,
    assigneeColor: USERS.vilem.color,
    createdById: USERS.zdenek.id,
    createdByName: USERS.zdenek.name,
    createdDaysAgo: 4,
    estimatedMinutes: 90,
    description: 'Čekáme na těsnění z objednávky.',
  },

  // ── P3 PLÁNOVANÁ ÚDRŽBA ───────────────────────────────────────
  {
    code: 'WO-2026-006',
    title: 'Revize kompresorů',
    description: 'Roční kontrola kompresoru 1 a 2 dle harmonogramu.',
    type: 'inspection',
    status: 'planned',
    priority: 'P3',
    source: 'scheduled',
    assetId: 'STR_059',
    assetName: 'Kompresor',
    buildingId: 'D',
    assigneeId: USERS.zdenek.id,
    assigneeName: USERS.zdenek.name,
    assigneeColor: USERS.zdenek.color,
    createdById: USERS.pavla.id,
    createdByName: USERS.pavla.name,
    createdDaysAgo: 7,
    plannedDaysFromNow: 5,
    estimatedMinutes: 120,
    plannedWeek: '2026-W09',
  },
  {
    code: 'WO-2026-007',
    title: 'Výměna předfiltrů — Extrudovna I',
    description: 'Plánovaná výměna předfiltrů na extruderech 1-12.',
    type: 'preventive',
    status: 'backlog',
    priority: 'P3',
    source: 'web',
    assetId: 'STR_072',
    assetName: 'Předfiltr sada I',
    buildingId: 'D',
    createdById: USERS.vilem.id,
    createdByName: USERS.vilem.name,
    createdDaysAgo: 10,
    estimatedMinutes: 180,
  },
  {
    code: 'WO-2026-008',
    title: 'Kontrola VZT jednotek',
    description: 'Čtvrtletní kontrola filtrů a ventilátorů VZT.',
    type: 'inspection',
    status: 'backlog',
    priority: 'P3',
    source: 'web',
    assetId: 'STR_065',
    assetName: 'VZT jednotka 1',
    buildingId: 'D',
    createdById: USERS.martina.id,
    createdByName: USERS.martina.name,
    createdDaysAgo: 12,
    estimatedMinutes: 90,
  },
  {
    code: 'WO-2026-009',
    title: 'Mazání převodovek — měsíční',
    type: 'preventive',
    status: 'backlog',
    priority: 'P3',
    source: 'scheduled',
    assetId: 'STR_078',
    assetName: 'Převodovka sada',
    buildingId: 'D',
    createdById: USERS.vilem.id,
    createdByName: USERS.vilem.name,
    createdDaysAgo: 2,
    estimatedMinutes: 60,
  },

  // ── P4 NÁPADY / ZLEPŠENÍ ──────────────────────────────────────
  {
    code: 'WO-2026-010',
    title: 'Instalace senzoru teploty v míchacím centru',
    description: 'Nápad od Milana — monitoring teploty pro optimalizaci procesu.',
    type: 'improvement',
    status: 'backlog',
    priority: 'P4',
    source: 'web',
    buildingId: 'D',
    createdById: USERS.milan.id,
    createdByName: USERS.milan.name,
    createdDaysAgo: 20,
  },
  {
    code: 'WO-2026-011',
    title: 'QR kódy na všechny stroje',
    description: 'Vytisknout a nalepit QR kódy pro rychlý přístup k AssetCard.',
    type: 'improvement',
    status: 'backlog',
    priority: 'P4',
    source: 'web',
    createdById: USERS.vilem.id,
    createdByName: USERS.vilem.name,
    createdDaysAgo: 15,
    estimatedMinutes: 240,
  },

  // ── DOKONČENÉ ──────────────────────────────────────────────────
  {
    code: 'WO-2026-012',
    title: 'Oprava úniku vzduchu — kompresor 2',
    type: 'corrective',
    status: 'completed',
    priority: 'P2',
    source: 'web',
    assetId: 'STR_060',
    assetName: 'Kompresor 2',
    buildingId: 'D',
    assigneeId: USERS.vilem.id,
    assigneeName: USERS.vilem.name,
    assigneeColor: USERS.vilem.color,
    createdById: USERS.zdenek.id,
    createdByName: USERS.zdenek.name,
    createdDaysAgo: 8,
    estimatedMinutes: 45,
    actualMinutes: 30,
    resolution: 'Vyměněn O-kroužek na výstupním ventilu. Tlak stabilní.',
  },
  {
    code: 'WO-2026-013',
    title: 'Kalibrace měřidel — únor',
    type: 'inspection',
    status: 'completed',
    priority: 'P3',
    source: 'scheduled',
    assetId: 'STR_117',
    assetName: 'Měřidla sada',
    buildingId: 'D',
    assigneeId: USERS.petr.id,
    assigneeName: USERS.petr.name,
    assigneeColor: USERS.petr.color,
    createdById: USERS.pavla.id,
    createdByName: USERS.pavla.name,
    createdDaysAgo: 14,
    estimatedMinutes: 120,
    actualMinutes: 100,
    resolution: 'Všechna měřidla v normě. 2x váha překalibrována.',
  },
  {
    code: 'WO-2026-014',
    title: 'Výměna žárovek v kotelně',
    type: 'corrective',
    status: 'completed',
    priority: 'P3',
    source: 'web',
    buildingId: 'D',
    assigneeId: USERS.filip.id,
    assigneeName: USERS.filip.name,
    assigneeColor: USERS.filip.color,
    createdById: USERS.vilem.id,
    createdByName: USERS.vilem.name,
    createdDaysAgo: 6,
    estimatedMinutes: 30,
    actualMinutes: 20,
    resolution: 'Vyměněny 4x LED trubice.',
  },
  {
    code: 'WO-2026-015',
    title: 'Údržba nabíječky VZV č.3',
    type: 'preventive',
    status: 'cancelled',
    priority: 'P3',
    source: 'web',
    assetId: 'STR_094',
    assetName: 'Nabíječka 3',
    buildingId: 'D',
    createdById: USERS.petr.id,
    createdByName: USERS.petr.name,
    createdDaysAgo: 11,
    resolution: 'Zrušeno — nabíječka vyřazena, nahrazena novou.',
  },
];

// ═══════════════════════════════════════════════════════════════════
// SEED FUNCTION
// ═══════════════════════════════════════════════════════════════════

async function seedTasks() {
  console.log('🚀 Seeding tasks collection...');
  console.log(`   ${TASKS.length} úkolů k vytvoření`);

  const now = new Date();
  let created = 0;

  for (const task of TASKS) {
    const createdAt = new Date(now.getTime() - task.createdDaysAgo * 24 * 60 * 60 * 1000);

    const data: Record<string, any> = {
      code: task.code,
      title: task.title,
      description: task.description || null,
      type: task.type,
      status: task.status,
      priority: task.priority,
      source: task.source || 'web',
      assetId: task.assetId || null,
      assetName: task.assetName || null,
      buildingId: task.buildingId || null,
      assigneeId: task.assigneeId || null,
      assigneeName: task.assigneeName || null,
      assigneeColor: task.assigneeColor || null,
      createdById: task.createdById,
      createdByName: task.createdByName,
      createdAt: Timestamp.fromDate(createdAt),
      estimatedMinutes: task.estimatedMinutes || null,
      actualMinutes: task.actualMinutes || null,
      resolution: task.resolution || null,
      plannedWeek: task.plannedWeek || null,
    };

    // Planned date
    if (task.plannedDaysFromNow !== undefined) {
      const planned = new Date(now.getTime() + task.plannedDaysFromNow * 24 * 60 * 60 * 1000);
      data.plannedDate = Timestamp.fromDate(planned);
    }

    // Status timestamps
    if (task.status === 'in_progress' || task.status === 'paused') {
      data.startedAt = Timestamp.fromDate(new Date(createdAt.getTime() + 2 * 60 * 60 * 1000));
    }
    if (task.status === 'paused') {
      data.pausedAt = Timestamp.fromDate(new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000));
    }
    if (task.status === 'completed') {
      data.completedAt = Timestamp.fromDate(new Date(createdAt.getTime() + 2 * 24 * 60 * 60 * 1000));
    }

    data.updatedAt = Timestamp.fromDate(now);

    await db.collection('tasks').add(data);
    created++;
    console.log(`   ✅ ${task.code}: ${task.title}`);
  }

  console.log(`\n🎉 Hotovo! Vytvořeno ${created} úkolů.`);
  console.log('\n⚠️  DŮLEŽITÉ: Aktualizuj User IDs!');
  console.log('   Seed používá placeholder IDs (vilem_uid, zdenek_uid...).');
  console.log('   Nahraď je skutečnými Firebase Auth UIDs z konzole.');
  console.log('   Nebo použij alternativní verzi s PIN-based IDs.');
}

seedTasks().catch(console.error);
