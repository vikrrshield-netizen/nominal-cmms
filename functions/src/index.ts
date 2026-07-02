// functions/src/index.ts
// VIKRR — Asset Shield — Cloud Functions: Task stats aggregation

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();

// Bezpečné přihlášení PINem (custom token + lockout) + správa PINů
export {
  loginWithPin,
  adminSetUserPin,
  adminSetUserActive,
  adminUpdateUser,
  adminCreateUser,
  backfillPinHashes,
  deletePlaintextPins,
  disableLegacyLogin,
  migrateAuthEmails,
} from './auth';

// AI asistent v aplikaci (Claude) — bezpečný backend, API klíč jako secret
// + týdenní AI souhrn (plánovaná funkce)
export { assistantChat, assistantConfirmAction, assistantBriefing, assistantFacts, weeklyAiSummary, monthlyExecReport } from './assistant';

const OPEN_TASK_STATUSES = new Set(['backlog', 'planned', 'in_progress', 'paused']);
const PUSH_TARGET_ROLES = new Set(['SUPERADMIN', 'VEDENI', 'UDRZBA']);
const GEARBOX_NOTIFICATION_ROLES = new Set(['SUPERADMIN', 'VEDENI', 'UDRZBA', 'VYROBA']);

function safeString(value: unknown): string {
  return String(value || '').trim();
}

function normalizeName(value: unknown): string {
  return safeString(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function timestampFrom(value: unknown): admin.firestore.Timestamp | null {
  if (!value) return null;
  if (value instanceof admin.firestore.Timestamp) return value;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : admin.firestore.Timestamp.fromDate(date);
}

function isGearboxAsset(data: admin.firestore.DocumentData): boolean {
  const text = normalizeName([
    data.entityType,
    data.category,
    data.name,
    data.code,
    data.gearboxStatus,
  ].filter(Boolean).join(' '));
  return text.includes('prevodov') || text.includes('gearbox') || Boolean(data.gearboxStatus);
}

function lastTemperatureDate(data: admin.firestore.DocumentData): Date | null {
  const fromField = timestampFrom(data.lastTemperatureAt);
  return fromField ? fromField.toDate() : null;
}

async function sendPushForNotification(notificationId: string, data: admin.firestore.DocumentData) {
  const userId = safeString(data.userId);
  if (!userId) return;

  const tokensSnap = await db.collection('pushTokens')
    .where('userId', '==', userId)
    .where('enabled', '==', true)
    .get();

  const tokenDocs = tokensSnap.docs.filter((docSnap) => safeString(docSnap.data().token));
  if (tokenDocs.length === 0) return;

  const tokens = tokenDocs.map((docSnap) => safeString(docSnap.data().token));
  const title = safeString(data.title) || 'VIKRSHIELD';
  const body = safeString(data.message) || 'Nové upozornění';
  const url = safeString(data.actionUrl) || '/notifications';

  const response = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: { title, body },
    data: {
      notificationId,
      title,
      body,
      url,
      type: safeString(data.type),
      priority: safeString(data.priority),
    },
    webpush: {
      fcmOptions: {
        link: url,
      },
      notification: {
        icon: '/logo_nominal.png',
        badge: '/logo_nominal.png',
        requireInteraction: data.priority === 'critical',
      },
    },
  });

  const batch = db.batch();
  response.responses.forEach((item, index) => {
    if (!item.success) {
      const code = item.error?.code || '';
      if (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token')) {
        batch.update(tokenDocs[index].ref, {
          enabled: false,
          disabledAt: admin.firestore.FieldValue.serverTimestamp(),
          disabledReason: code,
        });
      }
    }
  });
  await batch.commit();
}

async function createP1Notifications(taskId: string, task: admin.firestore.DocumentData) {
  if (task.priority !== 'P1' || !OPEN_TASK_STATUSES.has(String(task.status || 'backlog'))) return;

  const tenantId = safeString(task.tenantId) || 'main_firm';
  const assignedNames = new Set(
    [
      task.assigneeName,
      ...(Array.isArray(task.assignedWorkerNames) ? task.assignedWorkerNames : []),
    ].map(normalizeName).filter(Boolean)
  );

  const usersSnap = await db.collection('users').get();
  const targetUsers = usersSnap.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as any))
    .filter((user) => user.active !== false)
    .filter((user) => !user.tenantId || user.tenantId === tenantId)
    .filter((user) => PUSH_TARGET_ROLES.has(user.role) || assignedNames.has(normalizeName(user.displayName)));

  if (targetUsers.length === 0) return;

  const batch = db.batch();
  targetUsers.forEach((user) => {
    const ref = db.doc(`notifications/task-p1-${taskId}-${user.id}`);
    batch.set(ref, {
      userId: user.id,
      tenantId,
      type: 'task',
      priority: 'critical',
      title: `P1 úkol: ${safeString(task.title) || safeString(task.code) || 'bez názvu'}`,
      message: [
        task.assetName ? `Zařízení: ${task.assetName}` : '',
        task.location ? `Místo: ${task.location}` : '',
        task.dueDate ? `Termín: ${timestampFrom(task.dueDate)?.toDate().toLocaleDateString('cs-CZ')}` : '',
      ].filter(Boolean).join(' | ') || 'Nový kritický úkol.',
      actionUrl: `/tasks?task=${taskId}`,
      actionLabel: 'Otevřít úkol',
      read: false,
      generated: true,
      source: 'task-p1',
      sourceId: taskId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  await batch.commit();
}

async function createGearboxTemperatureReminder(assetId: string, gearbox: admin.firestore.DocumentData) {
  const tenantId = safeString(gearbox.tenantId) || 'main_firm';
  const openTaskSnap = await db.collection('tasks')
    .where('source', '==', 'scheduled')
    .where('sourceRefId', '==', assetId)
    .where('status', 'in', Array.from(OPEN_TASK_STATUSES))
    .limit(1)
    .get();

  if (!openTaskSnap.empty) return;

  const now = new Date();
  const dateKey = now.toISOString().slice(0, 10).replace(/-/g, '');
  const taskRef = db.collection('tasks').doc(`gearbox-temp-${assetId}-${dateKey}`);
  const taskSnap = await taskRef.get();
  if (!taskSnap.exists) {
    await taskRef.set({
      code: `GBX-TEMP-${dateKey}`,
      title: `Změřit teplotu převodovky: ${safeString(gearbox.name) || assetId}`,
      description: [
        'Převodovka nemá záznam teploty 7 nebo více dní.',
        gearbox.currentExtruderName ? `Extruder: ${gearbox.currentExtruderName}.` : '',
        'Zapište teplotu přes Kiosk výroby nebo kartu převodovky.',
      ].filter(Boolean).join(' '),
      type: 'preventive',
      status: 'backlog',
      priority: 'P2',
      source: 'scheduled',
      sourceRefType: 'asset',
      sourceRefId: assetId,
      assetId,
      assetName: safeString(gearbox.name),
      buildingId: safeString(gearbox.buildingId),
      tenantId,
      createdById: 'system',
      createdByName: 'VIKRSHIELD',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  const usersSnap = await db.collection('users').get();
  const targetUsers = usersSnap.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as any))
    .filter((user) => user.active !== false)
    .filter((user) => !user.tenantId || user.tenantId === tenantId)
    .filter((user) => GEARBOX_NOTIFICATION_ROLES.has(user.role));

  if (targetUsers.length === 0) return;

  const batch = db.batch();
  targetUsers.forEach((user) => {
    const ref = db.doc(`notifications/gearbox-temp-${assetId}-${dateKey}-${user.id}`);
    batch.set(ref, {
      userId: user.id,
      tenantId,
      type: 'gearbox',
      priority: 'high',
      title: `Chybí měření převodovky: ${safeString(gearbox.name) || assetId}`,
      message: gearbox.currentExtruderName
        ? `Převodovka je namontovaná na ${gearbox.currentExtruderName} a nemá měření 7 nebo více dní.`
        : 'Převodovka nemá aktuální měření teploty.',
      actionUrl: '/kiosk',
      actionLabel: 'Zadat teplotu',
      read: false,
      generated: true,
      source: 'gearbox-temperature-reminder',
      sourceId: assetId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  await batch.commit();
}

// ═══════════════════════════════════════════
// onWrite TRIGGER: tasks → stats_aggregates
// ═══════════════════════════════════════════

export const aggregateTaskStats = functions.firestore
  .document('tasks/{taskId}')
  .onWrite(async (_change: functions.Change<admin.firestore.DocumentSnapshot>, _context: functions.EventContext) => {
    try {
      // Throttle: přepočet čte CELOU kolekci tasks, takže při dávce zápisů (import, hromadná
      // změna, rychlé přechody stavů) je drahý. Když se přepočítalo před méně než THROTTLE_MS,
      // přeskoč — jednotlivé úpravy jsou spaced-out (přepočítají se), jen rychlé dávky se sloučí.
      const THROTTLE_MS = 30000;
      const globalRef = db.doc('stats_aggregates/global');
      const prevGlobal = await globalRef.get();
      const lastMs = prevGlobal.exists ? (prevGlobal.data()?.updatedAt?.toMillis?.() ?? 0) : 0;
      if (lastMs && Date.now() - lastMs < THROTTLE_MS) {
        return;
      }

      const tasksSnap = await db.collection('tasks').get();
      const tasks = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

      // ── Work Type Distribution (Alibi) ──
      const workTypeCounts: Record<string, number> = {};
      tasks.forEach(t => {
        const wt = t.workType || 'Nespecifikováno';
        workTypeCounts[wt] = (workTypeCounts[wt] || 0) + 1;
      });

      // ── Task Type Distribution ──
      const taskTypeCounts: Record<string, number> = {};
      tasks.forEach(t => {
        const tt = t.type || 'other';
        taskTypeCounts[tt] = (taskTypeCounts[tt] || 0) + 1;
      });

      // ── MTTR (Mean Time To Repair) ──
      const completedCorrective = tasks.filter(
        t => t.status === 'completed' && t.type === 'corrective' && t.createdAt && t.completedAt
      );
      let mttrMinutes = 0;
      if (completedCorrective.length > 0) {
        const totalMinutes = completedCorrective.reduce((sum, t) => {
          const created = t.createdAt?.toDate?.() || new Date(t.createdAt);
          const completed = t.completedAt?.toDate?.() || new Date(t.completedAt);
          return sum + (completed.getTime() - created.getTime()) / 60000;
        }, 0);
        mttrMinutes = Math.round(totalMinutes / completedCorrective.length);
      }

      // ── MTBF (Mean Time Between Failures) per asset ──
      const assetFailures: Record<string, Date[]> = {};
      tasks
        .filter(t => t.priority === 'P1' && t.assetId && t.createdAt)
        .forEach(t => {
          if (!assetFailures[t.assetId]) assetFailures[t.assetId] = [];
          const d = t.createdAt?.toDate?.() || new Date(t.createdAt);
          assetFailures[t.assetId].push(d);
        });

      const assetMtbf: Record<string, number> = {};
      Object.entries(assetFailures).forEach(([assetId, dates]) => {
        if (dates.length < 2) { assetMtbf[assetId] = -1; return; }
        dates.sort((a, b) => a.getTime() - b.getTime());
        let totalGap = 0;
        for (let i = 1; i < dates.length; i++) {
          totalGap += dates[i].getTime() - dates[i - 1].getTime();
        }
        assetMtbf[assetId] = Math.round(totalGap / (dates.length - 1) / 3600000);
      });

      // ── Total Labor (minutes) ──
      const totalLaborMinutes = tasks
        .filter(t => t.actualMinutes)
        .reduce((sum, t) => sum + (t.actualMinutes || 0), 0);

      // ── Parts Cost Aggregation ──
      let totalPartsCost = 0;
      tasks.forEach(t => {
        if (t.partsCost) totalPartsCost += Number(t.partsCost) || 0;
        if (t.partsUsed && Array.isArray(t.partsUsed)) {
          t.partsUsed.forEach((p: any) => {
            totalPartsCost += (Number(p.cost) || 0) * (Number(p.quantity) || 1);
          });
        }
      });

      // ── Active / Critical ticket counts ──
      const activeStatuses = ['backlog', 'planned', 'in_progress', 'paused'];
      const activeTasks = tasks.filter(t => activeStatuses.includes(t.status));
      const criticalTasks = activeTasks.filter(t => t.priority === 'P1');
      const inProgressTasks = activeTasks.filter(t => t.status === 'in_progress');

      // ── Lemon List: Top 5 assets with most P1/P2 tasks (last 30 days) ──
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600000);
      const recentIssues: Record<string, { count: number; assetName: string }> = {};
      tasks
        .filter(t => (t.priority === 'P1' || t.priority === 'P2') && t.assetId && t.createdAt)
        .forEach(t => {
          const d = t.createdAt?.toDate?.() || new Date(t.createdAt);
          if (d < thirtyDaysAgo) return;
          if (!recentIssues[t.assetId]) recentIssues[t.assetId] = { count: 0, assetName: t.assetName || t.assetId };
          recentIssues[t.assetId].count++;
        });

      const lemonList = Object.entries(recentIssues)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 5)
        .map(([assetId, data]) => ({
          assetId,
          assetName: data.assetName,
          issueCount: data.count,
          mtbfHours: assetMtbf[assetId] || -1,
        }));

      // ── Write to stats_aggregates/global ──
      await db.doc('stats_aggregates/global').set({
        workTypeDistribution: workTypeCounts,
        taskTypeDistribution: taskTypeCounts,
        mttrMinutes,
        totalLaborMinutes,
        totalPartsCost,
        activeTickets: activeTasks.length,
        criticalTickets: criticalTasks.length,
        inProgressTickets: inProgressTasks.length,
        totalTasks: tasks.length,
        completedTasks: tasks.filter(t => t.status === 'completed').length,
        lemonList,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      // ── Write per-asset stats ──
      const batch = db.batch();
      Object.entries(assetMtbf).forEach(([assetId, mtbfHours]) => {
        const assetTasks = tasks.filter(t => t.assetId === assetId);
        const ref = db.doc(`stats_aggregates/by_asset/${assetId}/stats`);
        batch.set(ref, {
          mtbfHours,
          totalTasks: assetTasks.length,
          p1Count: assetTasks.filter(t => t.priority === 'P1').length,
          p2Count: assetTasks.filter(t => t.priority === 'P2').length,
          completedCount: assetTasks.filter(t => t.status === 'completed').length,
          totalLaborMinutes: assetTasks
            .filter(t => t.actualMinutes)
            .reduce((s, t) => s + (t.actualMinutes || 0), 0),
          avgRepairMinutes: (() => {
            const completed = assetTasks.filter(t => t.actualMinutes && t.status === 'completed');
            if (completed.length === 0) return 0;
            return Math.round(completed.reduce((s, t) => s + (t.actualMinutes || 0), 0) / completed.length);
          })(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      });
      await batch.commit();

      console.log(`[aggregateTaskStats] Global + ${Object.keys(assetMtbf).length} per-asset stats updated`);
    } catch (err) {
      console.error('[aggregateTaskStats] Error:', err);
    }
  });

export const sendPushOnNotificationCreate = functions.firestore
  .document('notifications/{notificationId}')
  .onCreate(async (snap: admin.firestore.DocumentSnapshot, context: functions.EventContext) => {
    try {
      const data = snap.data();
      if (!data) return;
      await sendPushForNotification(context.params.notificationId, data);
    } catch (err) {
      console.error('[sendPushOnNotificationCreate] Error:', err);
    }
  });

export const createNotificationsForCriticalTask = functions.firestore
  .document('tasks/{taskId}')
  .onWrite(async (change: functions.Change<admin.firestore.DocumentSnapshot>, context: functions.EventContext) => {
    try {
      const after = change.after.exists ? change.after.data() : null;
      if (!after) return;

      const before = change.before.exists ? change.before.data() : null;
      const wasAlreadyCriticalOpen = before
        && before.priority === 'P1'
        && OPEN_TASK_STATUSES.has(String(before.status || 'backlog'));
      const isCriticalOpen = after.priority === 'P1'
        && OPEN_TASK_STATUSES.has(String(after.status || 'backlog'));

      if (!isCriticalOpen || wasAlreadyCriticalOpen) return;
      await createP1Notifications(context.params.taskId, after);
    } catch (err) {
      console.error('[createNotificationsForCriticalTask] Error:', err);
    }
  });

export const checkGearboxTemperatureReminders = functions.pubsub
  .schedule('every 24 hours')
  .timeZone('Europe/Prague')
  .onRun(async () => {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const assetsSnap = await db.collection('assets').get();
      const gearboxes = assetsSnap.docs
        .map((docSnap) => ({ id: docSnap.id, data: docSnap.data() }))
        .filter((item) => item.data.isDeleted !== true)
        .filter((item) => isGearboxAsset(item.data))
        .filter((item) => item.data.gearboxStatus === 'installed' || item.data.currentExtruderId)
        .filter((item) => {
          const last = lastTemperatureDate(item.data);
          return !last || last < sevenDaysAgo;
        });

      await Promise.all(
        gearboxes.map((item) => createGearboxTemperatureReminder(item.id, item.data))
      );

      console.log(`[checkGearboxTemperatureReminders] reminders checked: ${gearboxes.length}`);
    } catch (err) {
      console.error('[checkGearboxTemperatureReminders] Error:', err);
    }
  });
