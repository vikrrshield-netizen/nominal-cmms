// src/hooks/useStats.ts
// VIKRR — Asset Shield — Dashboard stats: MTBF, MTTR, Lemon List, Operational HUD
// Čte JEDEN agregační dokument stats_aggregates/global, který na serveru udržuje
// Cloud Function aggregateTaskStats. Dřív se na klientu držela a počítala CELÁ kolekce
// tasks (drahé na čtení i paměť) — to byl jen fallback, než běžely funkce.

import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
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

const EMPTY: StatsData = {
  workTypeDistribution: {},
  mttrMinutes: 0,
  totalLaborMinutes: 0,
  activeTickets: 0,
  criticalTickets: 0,
  inProgressTickets: 0,
  totalTasks: 0,
  completedTasks: 0,
  lemonList: [],
  loading: true,
};

// ═══════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════

export function useStats(): StatsData {
  const [stats, setStats] = useState<StatsData>(EMPTY);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'stats_aggregates', 'global'),
      (snap) => {
        const d = snap.exists() ? (snap.data() as Record<string, unknown>) : null;
        if (!d) {
          setStats({ ...EMPTY, loading: false });
          return;
        }
        setStats({
          workTypeDistribution: (d.workTypeDistribution as Record<string, number>) || {},
          mttrMinutes: Number(d.mttrMinutes) || 0,
          totalLaborMinutes: Number(d.totalLaborMinutes) || 0,
          activeTickets: Number(d.activeTickets) || 0,
          criticalTickets: Number(d.criticalTickets) || 0,
          inProgressTickets: Number(d.inProgressTickets) || 0,
          totalTasks: Number(d.totalTasks) || 0,
          completedTasks: Number(d.completedTasks) || 0,
          lemonList: Array.isArray(d.lemonList) ? (d.lemonList as LemonEntry[]) : [],
          loading: false,
        });
      },
      () => setStats({ ...EMPTY, loading: false }),
    );
    return () => unsub();
  }, []);

  return stats;
}
