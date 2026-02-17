// src/hooks/useInspections.ts
// NOMINAL CMMS — Kontrolní body budovy (měsíční checklist)

import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthContext } from '../context/AuthContext';

export interface InspectionLog {
  id: string;
  templateId: string;
  month: string;
  building: string;
  floor: string;
  roomName: string;
  roomCode: string;
  checkPoints: string;
  status: 'pending' | 'ok' | 'defect';
  defectNote: string;
  completedBy: string;
  completedAt: Timestamp | null;
  isDeleted: boolean;
}

export interface InspectionStats {
  total: number;
  ok: number;
  defect: number;
  pending: number;
  percentDone: number;
}

export function useInspections(month?: string) {
  const [logs, setLogs] = useState<InspectionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuthContext();

  // Default = aktuální měsíc
  const currentMonth = month || new Date().toISOString().slice(0, 7);

  useEffect(() => {
    const q = query(
      collection(db, 'inspection_logs'),
      where('month', '==', currentMonth),
      where('isDeleted', '==', false)
    );

    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as InspectionLog))
        .sort((a, b) => {
          // Sort: building → floor → roomName
          if (a.building !== b.building) return a.building.localeCompare(b.building);
          if (a.floor !== b.floor) return a.floor.localeCompare(b.floor);
          return 0;
        });
      setLogs(data);
      setLoading(false);
    });

    return () => unsub();
  }, [currentMonth]);

  // Stats
  const stats: InspectionStats = useMemo(() => {
    const total = logs.length;
    const ok = logs.filter((l) => l.status === 'ok').length;
    const defect = logs.filter((l) => l.status === 'defect').length;
    const pending = logs.filter((l) => l.status === 'pending').length;
    const percentDone = total > 0 ? Math.round(((ok + defect) / total) * 100) : 0;
    return { total, ok, defect, pending, percentDone };
  }, [logs]);

  // Grouped by building + floor
  const grouped = useMemo(() => {
    const groups: Record<string, InspectionLog[]> = {};
    for (const log of logs) {
      const key = `${log.building} — ${log.floor}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(log);
    }
    return groups;
  }, [logs]);

  // Označit jako OK
  async function markOk(logId: string) {
    await updateDoc(doc(db, 'inspection_logs', logId), {
      status: 'ok',
      defectNote: '',
      completedBy: user?.displayName || 'Neznámý',
      completedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  // Označit se závadou
  async function markDefect(logId: string, defectNote: string) {
    await updateDoc(doc(db, 'inspection_logs', logId), {
      status: 'defect',
      defectNote,
      completedBy: user?.displayName || 'Neznámý',
      completedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  // Vrátit na pending (oprava)
  async function markPending(logId: string) {
    await updateDoc(doc(db, 'inspection_logs', logId), {
      status: 'pending',
      defectNote: '',
      completedBy: '',
      completedAt: null,
      updatedAt: serverTimestamp(),
    });
  }

  return {
    logs,
    loading,
    stats,
    grouped,
    markOk,
    markDefect,
    markPending,
    currentMonth,
  };
}
