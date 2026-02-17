// scripts/seed-calendar.ts
// Přidá scheduledDate k některým existujícím taskům
// Spustit: npx tsx scripts/seed-calendar.ts

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Init
initializeApp({
  credential: cert(require('../serviceAccount.json')),
});
const db = getFirestore();

async function seedCalendar() {
  console.log('=== Seed Calendar Dates ===\n');

  const snap = await db.collection('tasks').get();
  if (snap.empty) {
    console.log('Žádné tasky v DB!');
    return;
  }

  // Najdi pondělí tohoto týdne
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - day + (day === 0 ? -6 : 1));
  monday.setHours(8, 0, 0, 0);

  // Rozděl tasky — první polovinu naplánuj, zbytek nechej jako backlog
  const openTasks = snap.docs.filter(
    (d) => d.data().status !== 'done' && d.data().status !== 'completed'
  );

  console.log(`Nalezeno ${openTasks.length} otevřených tasků`);

  const toSchedule = openTasks.slice(0, Math.min(6, openTasks.length));
  const batch = db.batch();

  toSchedule.forEach((doc, i) => {
    // Rozhoď po dnech: Po, Út, St, Čt, Pá
    const dayOffset = i % 5; // 0=Po, 1=Út, ...
    const scheduledDate = new Date(monday);
    scheduledDate.setDate(monday.getDate() + dayOffset);

    batch.update(doc.ref, {
      scheduledDate: Timestamp.fromDate(scheduledDate),
      estimatedMinutes: [30, 45, 60, 90, 120, 60][i] || 60,
    });

    console.log(
      `  → ${doc.data().title} → ${['Po', 'Út', 'St', 'Čt', 'Pá'][dayOffset]} ${scheduledDate.getDate()}.${scheduledDate.getMonth() + 1}.`
    );
  });

  // Zbytek = backlog (bez scheduledDate)
  const backlogCount = openTasks.length - toSchedule.length;
  console.log(`  → ${backlogCount} tasků zůstává v backlogu`);

  await batch.commit();
  console.log('\nHotovo!');
}

seedCalendar().catch(console.error);
