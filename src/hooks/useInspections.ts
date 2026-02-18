// src/hooks/useInspections.ts
// VIKRR — Asset Shield — Kontrolní body budovy (měsíční checklist)

import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthContext } from '../context/AuthContext';
import { createTask } from '../services/taskService';

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
  resolution?: 'fixed' | 'carried_over';
  previousDefectId?: string;
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

  // Previous month for defect memory
  const prevMonth = useMemo(() => {
    const d = new Date(currentMonth + '-01');
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  }, [currentMonth]);

  const [previousDefects, setPreviousDefects] = useState<InspectionLog[]>([]);

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

  // Fetch previous month's unresolved defects
  useEffect(() => {
    const q2 = query(
      collection(db, 'inspection_logs'),
      where('month', '==', prevMonth),
      where('status', '==', 'defect'),
      where('isDeleted', '==', false)
    );

    const unsub2 = onSnapshot(q2, (snap) => {
      const data = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as InspectionLog))
        .filter((d) => !d.resolution); // Only unresolved
      setPreviousDefects(data);
    });

    return () => unsub2();
  }, [prevMonth]);

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

  // Označit se závadou + automaticky vytvořit P1 úkol
  async function markDefect(logId: string, defectNote: string) {
    // Najdi log pro context
    const log = logs.find((l) => l.id === logId);

    await updateDoc(doc(db, 'inspection_logs', logId), {
      status: 'defect',
      defectNote,
      completedBy: user?.displayName || 'Neznámý',
      completedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Auto-create P1 task
    try {
      await createTask({
        title: `Závada: ${log?.roomName || 'Neznámá místnost'} — ${defectNote.slice(0, 80)}`,
        description: `Automaticky vytvořeno z kontroly budov.\nBudova: ${log?.building || '?'}\nPatro: ${log?.floor || '?'}\nMístnost: ${log?.roomName || '?'}\nPopis: ${defectNote}`,
        type: 'corrective',
        priority: 'P1',
        source: 'inspection',
        buildingId: log?.building || undefined,
        createdById: user?.id || 'system',
        createdByName: user?.displayName || 'Kontrola budov',
      });
    } catch (err) {
      console.error('[useInspections] Auto-task creation failed:', err);
    }
  }

  // Potvrdit předchozí závadu — buď opravena, nebo přenést do aktuálního měsíce
  async function confirmPreviousDefect(logId: string, action: 'fixed' | 'still_defect') {
    const log = previousDefects.find((l) => l.id === logId);

    if (action === 'fixed') {
      await updateDoc(doc(db, 'inspection_logs', logId), {
        resolution: 'fixed',
        resolvedBy: user?.displayName || 'Neznámý',
        resolvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      // Carry over — create new defect entry for current month
      if (log) {
        await addDoc(collection(db, 'inspection_logs'), {
          templateId: log.templateId,
          month: currentMonth,
          building: log.building,
          floor: log.floor,
          roomName: log.roomName,
          roomCode: log.roomCode,
          checkPoints: log.checkPoints,
          status: 'defect',
          defectNote: `[Nedodělek] ${log.defectNote}`,
          completedBy: user?.displayName || 'Neznámý',
          completedAt: serverTimestamp(),
          isDeleted: false,
          previousDefectId: logId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        // Auto-create P1 task for carried defect
        try {
          await createTask({
            title: `Nedodělek: ${log.roomName} — ${log.defectNote.slice(0, 60)}`,
            description: `Přenesená závada z ${prevMonth}.\nBudova: ${log.building}\nPatro: ${log.floor}\nMístnost: ${log.roomName}\nPopis: ${log.defectNote}`,
            type: 'corrective',
            priority: 'P1',
            source: 'inspection',
            buildingId: log.building || undefined,
            createdById: user?.id || 'system',
            createdByName: user?.displayName || 'Kontrola budov',
          });
        } catch (err) {
          console.error('[useInspections] Carry-over task creation failed:', err);
        }
      }

      // Mark original as carried over
      await updateDoc(doc(db, 'inspection_logs', logId), {
        resolution: 'carried_over',
        carriedToMonth: currentMonth,
        updatedAt: serverTimestamp(),
      });
    }
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
    previousDefects,
    confirmPreviousDefect,
    prevMonth,
  };
}
