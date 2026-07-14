// functions/src/preventive.ts
// Preventivní údržba: z termínů v Kartotéce (asset.events s frequencyDays) sama zakládá úkoly.
// Běží každý den ráno. Termín propadl/je dnes → založí úkol (typ preventive) a posune nextDate
// o frekvenci dál. Úkol a posun termínu jdou v JEDNÉ dávce → opakovaný běh nic nezdvojí.

import * as functions from 'firebase-functions/v1'; // gen1 API (v6 default je v2)
import * as admin from 'firebase-admin';

const db = () => admin.firestore();
const FV = admin.firestore.FieldValue;

// Dnešek v Praze jako 'YYYY-MM-DD' (nextDate je datumový string).
function todayPrague(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

// Ořeže datum na YYYY-MM-DD (snese i ISO s časem); nevalidní → ''.
function normDate(s: unknown): string {
  const m = String(s ?? '').trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

const OPEN_STATUSES = ['backlog', 'planned', 'in_progress', 'paused'];

export const generatePreventiveTasks = functions
  .runWith({ memory: '512MB', timeoutSeconds: 300 })
  .pubsub.schedule('45 5 * * *')
  .timeZone('Europe/Prague')
  .onRun(async () => {
    const today = todayPrague();
    const year = today.slice(0, 4);

    // Otevřené preventivní úkoly — když už na stejnou událost jeden visí, další nezakládej
    // (termín se ale posune, ať se fronta nehromadí). Stavy filtrujeme v paměti — jeden
    // where nepotřebuje složený index (a preventivních úkolů nebude mnoho).
    const openSnap = await db().collection('tasks')
      .where('source', '==', 'preventive')
      .get();
    const openKeys = new Set(openSnap.docs
      .map((d) => d.data() as any)
      .filter((t) => OPEN_STATUSES.includes(String(t.status ?? '')))
      .map((t) => `${t.assetId ?? ''}::${String(t.eventName ?? '')}`));

    const snap = await db().collection('assets').get();
    let created = 0;
    let skipped = 0;
    let batch = db().batch();
    let ops = 0;
    const flush = async () => { if (ops > 0) { await batch.commit(); batch = db().batch(); ops = 0; } };

    for (const doc of snap.docs) {
      const a = doc.data() as any;
      if (a.isDeleted) continue;
      const events = Array.isArray(a.events) ? a.events : [];
      // Jen PERIODICKÉ události (frequencyDays > 0) s propadlým/dnešním termínem.
      // Jednorázové termíny bez frekvence nechává být — ty hlídá přehled termínů.
      const due = events.filter((ev: any) =>
        Number(ev?.frequencyDays) > 0
        && normDate(ev?.nextDate)
        && normDate(ev.nextDate) <= today
        && String(ev?.name ?? '').trim());
      if (!due.length) continue;

      const dueSet = new Set(due);
      const updatedEvents = events.map((ev: any) => {
        if (!dueSet.has(ev)) return ev;
        const freq = Number(ev.frequencyDays);
        let next = normDate(ev.nextDate);
        while (next <= today) next = addDays(next, freq); // dožene i zameškané periody
        // lastDate (= „naposledy PROVEDENO") se tady NEnastavuje — úkol byl teprve založen.
        // Zapíše ho až preventiveTaskCompleted níže, když někdo úkol skutečně dokončí.
        // Jinak by audit viděl „provedeno", i když práce jen leží v backlogu.
        return { ...ev, nextDate: next };
      });

      for (const ev of due) {
        const evName = String(ev.name).trim();
        if (openKeys.has(`${doc.id}::${evName}`)) { skipped++; continue; }
        const code = `WO-${year}-PM${(Date.now() + created).toString(36).slice(-5).toUpperCase()}`;
        const task: Record<string, unknown> = {
          code,
          title: `Údržba: ${evName} — ${a.name ?? 'zařízení'}`,
          type: 'preventive',
          status: 'backlog',
          priority: 'P3',
          source: 'preventive',
          eventName: evName,
          description: [
            String(ev.instructions ?? '').trim(),
            `Plánovaný termín: ${normDate(ev.nextDate)} (opakuje se každých ${Number(ev.frequencyDays)} dní).`,
          ].filter(Boolean).join('\n'),
          assetId: doc.id,
          assetName: a.name ?? '',
          tenantId: a.tenantId ?? 'main_firm',
          createdById: 'system',
          createdByName: 'Preventivní údržba',
          createdAt: FV.serverTimestamp(),
          updatedAt: FV.serverTimestamp(),
        };
        batch.set(db().collection('tasks').doc(), task);
        ops++;
        created++;
      }

      batch.update(doc.ref, { events: updatedEvents, updatedAt: FV.serverTimestamp() });
      ops++;
      if (ops >= 400) await flush();
    }
    await flush();
    console.log(`[preventive] ${today}: založeno ${created} úkolů, přeskočeno ${skipped} (už otevřený), assets: ${snap.size}`);
    return null;
  });

// „Naposledy provedeno" (event.lastDate) se zapisuje AŽ TADY — když někdo preventivní úkol
// skutečně DOKONČÍ. Plánovač výš lastDate neposouvá (jen nextDate), jinak by audit viděl
// „provedeno", i když úkol jen leží otevřený. Admin SDK = funguje i pro role bez asset.update.
export const preventiveTaskCompleted = functions.firestore
  .document('tasks/{taskId}')
  .onUpdate(async (change) => {
    const before = change.before.data() as any;
    const after = change.after.data() as any;
    if (String(after?.source ?? '') !== 'preventive') return null;
    if (String(before?.status ?? '') === String(after?.status ?? '')) return null;
    if (String(after?.status ?? '') !== 'completed') return null;
    const assetId = String(after?.assetId ?? '').trim();
    const evName = String(after?.eventName ?? '').trim();
    if (!assetId || !evName) return null;

    const done = todayPrague();
    const ref = db().collection('assets').doc(assetId);
    await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const a = snap.data() as any;
      const events = Array.isArray(a.events) ? a.events : [];
      let hit = false;
      const updated = events.map((ev: any) => {
        if (String(ev?.name ?? '').trim() !== evName) return ev;
        hit = true;
        // Nepřepisuj novější datum starším (např. pozdě zavřený starý úkol).
        const prev = normDate(ev?.lastDate);
        return { ...ev, lastDate: prev && prev > done ? prev : done };
      });
      if (hit) tx.update(ref, { events: updated, updatedAt: FV.serverTimestamp() });
    });
    console.log(`[preventive] lastDate → ${done}: ${evName} @ ${assetId}`);
    return null;
  });
