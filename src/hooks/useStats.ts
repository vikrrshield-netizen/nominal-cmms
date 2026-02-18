// src/hooks/useStats.ts
// NOMINAL CMMS — Dashboard stats: MTBF, MTTR, Lemon List, Operational HUD
// Client-side computation (fallback until Cloud Functions are deployed)

import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════

export interface LemonEntry {
  assetId: string;
  assetName: string;
  issueCount: number;
  mtbfHours: number; // -1 = not enough data
}

export interface StatsData {
  // Work type distribution
  workTypeDistribution: Record<string, number>;
  // MTTR — average repair time (minutes)
  mttrMinutes: number;
  // Total labor (minutes)
  totalLaborMinutes: number;
  // Active / Critical
  activeTickets: number;
  criticalTickets: number;
  inProgressTickets: number;
  // Totals
  totalTasks: number;
  completedTasks: number;
  // Lemon List (Top 5 worst assets)
  lemonList: LemonEntry[];
  // Loading
  loading: boolean;
}

// ═══════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════

export function useStats(): StatsData {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Subscribe to ALL tasks (active + completed for stats)
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'tasks'),
      (snap) => {
        setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, []);

  return useMemo(() => {
    if (loading || tasks.length === 0) {
      return {
        workTypeDistribution: {},
        mttrMinutes: 0,
        totalLaborMinutes: 0,
        activeTickets: 0,
        criticalTickets: 0,
        inProgressTickets: 0,
        totalTasks: 0,
        completedTasks: 0,
        lemonList: [],
        loading,
      };
    }

    // ── Work Type Distribution ──
    const workTypeCounts: Record<string, number> = {};
    tasks.forEach(t => {
      const wt = t.workType || 'Nespecifikováno';
      workTypeCounts[wt] = (workTypeCounts[wt] || 0) + 1;
    });

    // ── MTTR (Mean Time To Repair) ──
    const completedCorrective = tasks.filter(
      t => t.status === 'completed' && t.type === 'corrective' && t.createdAt && t.completedAt
    );
    let mttrMinutes = 0;
    if (completedCorrective.length > 0) {
      const totalMinutes = completedCorrective.reduce((sum: number, t: any) => {
        const created = t.createdAt instanceof Timestamp ? t.createdAt.toDate() : new Date(t.createdAt);
        const completed = t.completedAt instanceof Timestamp ? t.completedAt.toDate() : new Date(t.completedAt);
        return sum + (completed.getTime() - created.getTime()) / 60000;
      }, 0);
      mttrMinutes = Math.round(totalMinutes / completedCorrective.length);
    }

    // ── Total Labor ──
    const totalLaborMinutes = tasks
      .filter(t => t.actualMinutes)
      .reduce((sum: number, t: any) => sum + (t.actualMinutes || 0), 0);

    // ── Active / Critical ──
    const activeStatuses = ['backlog', 'planned', 'in_progress', 'paused'];
    const activeTasks = tasks.filter(t => activeStatuses.includes(t.status));
    const criticalTasks = activeTasks.filter(t => t.priority === 'P1');
    const inProgressTasks = activeTasks.filter(t => t.status === 'in_progress');

    // ── MTBF per asset ──
    const assetFailures: Record<string, Date[]> = {};
    tasks
      .filter(t => t.priority === 'P1' && t.assetId && t.createdAt)
      .forEach(t => {
        if (!assetFailures[t.assetId]) assetFailures[t.assetId] = [];
        const d = t.createdAt instanceof Timestamp ? t.createdAt.toDate() : new Date(t.createdAt);
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

    // ── Lemon List: Top 5 worst (P1+P2, last 30 days) ──
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600000);
    const recentIssues: Record<string, { count: number; assetName: string }> = {};
    tasks
      .filter(t => (t.priority === 'P1' || t.priority === 'P2') && t.assetId && t.createdAt)
      .forEach(t => {
        const d = t.createdAt instanceof Timestamp ? t.createdAt.toDate() : new Date(t.createdAt);
        if (d < thirtyDaysAgo) return;
        if (!recentIssues[t.assetId]) recentIssues[t.assetId] = { count: 0, assetName: t.assetName || t.assetId };
        recentIssues[t.assetId].count++;
      });

    const lemonList: LemonEntry[] = Object.entries(recentIssues)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([assetId, data]) => ({
        assetId,
        assetName: data.assetName,
        issueCount: data.count,
        mtbfHours: assetMtbf[assetId] || -1,
      }));

    return {
      workTypeDistribution: workTypeCounts,
      mttrMinutes,
      totalLaborMinutes,
      activeTickets: activeTasks.length,
      criticalTickets: criticalTasks.length,
      inProgressTickets: inProgressTasks.length,
      totalTasks: tasks.length,
      completedTasks: tasks.filter(t => t.status === 'completed').length,
      lemonList,
      loading: false,
    };
  }, [tasks, loading]);
}
