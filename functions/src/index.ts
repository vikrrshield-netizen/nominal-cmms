// functions/src/index.ts
// VIKRR — Asset Shield — Cloud Functions: Task stats aggregation

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();

// ═══════════════════════════════════════════
// onWrite TRIGGER: tasks → stats_aggregates
// ═══════════════════════════════════════════

export const aggregateTaskStats = functions.firestore
  .document('tasks/{taskId}')
  .onWrite(async (_change, _context) => {
    try {
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
