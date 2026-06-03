// src/hooks/useInspections.ts
// VIKRR — Asset Shield — Kontrolní body budovy (měsíční checklist)

import { useState, useEffect, useMemo, useRef } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, addDoc, serverTimestamp, Timestamp, writeBatch, getDoc, setDoc, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthContext } from '../context/AuthContext';
import { createTask, updateTask } from '../services/taskService';
import { BUILDING_INSPECTION_TEMPLATES } from '../data/buildingInspectionTemplates';
import type { TaskPriority } from '../types/firestore';

export interface FoodSafetyDefectInfo {
  foodSafetyRisk: boolean;
  foodSafetyHazardType?: string;
  foodSafetyImpact?: string;
}

export type InspectionFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface InspectionLog {
  id: string;
  templateId: string;
  month: string;
  building: string;
  floor: string;
  roomName: string;
  roomCode: string;
  checkPoints: string;
  frequency?: InspectionFrequency;
  status: 'pending' | 'ok' | 'defect';
  defectNote: string;
  inspectionNote?: string;
  completedBy: string;
  completedAt: Timestamp | null;
  isDeleted: boolean;
  resolution?: 'fixed' | 'carried_over';
  previousDefectId?: string;
  taskId?: string;
  sortOrder?: number;
  foodSafetyRisk?: boolean;
  foodSafetyHazardType?: string;
  foodSafetyImpact?: string;
}

export interface InspectionStats {
  total: number;
  ok: number;
  defect: number;
  pending: number;
  percentDone: number;
}

async function addInspectionRunLog(
  log: InspectionLog | undefined,
  logId: string,
  result: 'ok' | 'defect',
  performedBy: string,
  performedById: string,
  detail: Record<string, unknown> = {},
) {
  await addDoc(collection(db, 'inspection_run_logs'), {
    inspectionLogId: logId,
    templateId: log?.templateId || '',
    month: log?.month || '',
    building: log?.building || '',
    floor: log?.floor || '',
    roomName: log?.roomName || '',
    roomCode: log?.roomCode || '',
    checkPoints: log?.checkPoints || '',
    frequency: log?.frequency || 'monthly',
    result,
    performedBy,
    performedById,
    performedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    isDeleted: false,
    ...detail,
  });
}

async function createMonthlyInspectionLogs(month: string, createdByName: string) {
  const batch = writeBatch(db);
  const now = serverTimestamp();

  for (const template of BUILDING_INSPECTION_TEMPLATES) {
    const templateId = `building_cd_${String(template.sortOrder).padStart(3, '0')}`;
    const logId = `building_cd_${month}_${String(template.sortOrder).padStart(3, '0')}`;
    const templateRef = doc(db, 'inspection_templates', templateId);
    const existingTemplate = await getDoc(templateRef);
    const frequency = (existingTemplate.data()?.frequency || 'monthly') as InspectionFrequency;

    batch.set(templateRef, {
      ...template,
      frequency,
      isDeleted: false,
      source: 'formular_budova_xlsx',
      updatedAt: now,
    }, { merge: true });

    batch.set(doc(db, 'inspection_logs', logId), {
      templateId,
      month,
      building: template.building,
      floor: template.floor,
      roomName: template.roomName,
      roomCode: template.roomCode,
      checkPoints: template.checkPoints,
      frequency,
      sortOrder: template.sortOrder,
      status: 'pending',
      defectNote: '',
      inspectionNote: '',
      completedBy: '',
      completedAt: null,
      isDeleted: false,
      createdByName,
      createdAt: now,
      updatedAt: now,
    });
  }

  const customTemplatesSnap = await getDocs(collection(db, 'inspection_templates'));
  customTemplatesSnap.docs.forEach((templateDoc) => {
    const template = templateDoc.data();
    if (template.isDeleted === true || template.source !== 'kartoteka') return;

    const templateId = templateDoc.id;
    const logId = `${templateId}_${month}`;
    const frequency = (template.frequency || 'monthly') as InspectionFrequency;

    batch.set(doc(db, 'inspection_logs', logId), {
      templateId,
      month,
      building: template.building || '',
      floor: template.floor || '',
      roomName: template.roomName || '',
      roomCode: template.roomCode || '',
      checkPoints: template.checkPoints || '',
      frequency,
      sortOrder: template.sortOrder || 9000,
      status: 'pending',
      defectNote: '',
      inspectionNote: '',
      completedBy: '',
      completedAt: null,
      isDeleted: false,
      sourceAssetId: template.sourceAssetId || null,
      createdByName,
      createdAt: now,
      updatedAt: now,
    }, { merge: true });
  });

  await batch.commit();
}

export function useInspections(month?: string) {
  const [logs, setLogs] = useState<InspectionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuthContext();
  const bootstrapStarted = useRef<Set<string>>(new Set());

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

    const unsub = onSnapshot(q, async (snap) => {
      const data = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as InspectionLog))
        .sort((a, b) => {
          // Sort: building → floor → roomName
          return (a.sortOrder ?? 999) - (b.sortOrder ?? 999);
        });
      setLogs(data);
      setLoading(false);

      if (snap.empty && user && !bootstrapStarted.current.has(currentMonth)) {
        bootstrapStarted.current.add(currentMonth);
        try {
          await createMonthlyInspectionLogs(currentMonth, user.displayName || 'System');
        } catch (err) {
          console.error('[useInspections] Monthly bootstrap failed:', err);
        }
      }
    });

    return () => unsub();
  }, [currentMonth, user]);

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
    const log = logs.find((l) => l.id === logId);
    const performedBy = user?.displayName || 'Neznamy';
    const performedById = user?.id || user?.uid || 'unknown';

    await updateDoc(doc(db, 'inspection_logs', logId), {
      status: 'ok',
      defectNote: '',
      completedBy: user?.displayName || 'Neznámý',
      completedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await addInspectionRunLog(log, logId, 'ok', performedBy, performedById, {
      note: 'Kontrola provedena bez zavady',
    });
  }

  // Označit se závadou + automaticky vytvořit P1 úkol
  async function markDefect(logId: string, defectNote: string, priority: TaskPriority = 'P2', foodSafety?: FoodSafetyDefectInfo) {
    // Najdi log pro context
    const log = logs.find((l) => l.id === logId);
    const performedBy = user?.displayName || 'Neznamy';
    const performedById = user?.id || user?.uid || 'unknown';
    const foodSafetyRisk = foodSafety?.foodSafetyRisk === true;
    const foodSafetyHazardType = foodSafetyRisk ? foodSafety?.foodSafetyHazardType || '' : '';
    const foodSafetyImpact = foodSafetyRisk ? foodSafety?.foodSafetyImpact || '' : '';

    await updateDoc(doc(db, 'inspection_logs', logId), {
      status: 'defect',
      defectNote,
      foodSafetyRisk,
      foodSafetyHazardType,
      foodSafetyImpact,
      completedBy: user?.displayName || 'Neznámý',
      completedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await addInspectionRunLog(log, logId, 'defect', performedBy, performedById, {
      defectNote,
      taskPriority: priority,
      foodSafetyRisk,
      foodSafetyHazardType,
      foodSafetyImpact,
    });

    const taskTitle = `Zavada: ${log?.roomName || 'Neznama mistnost'} - ${defectNote.slice(0, 80)}`;
    const taskDescription = [
      'Automaticky vytvoreno z kontroly budov.',
      `Budova: ${log?.building || '?'}`,
      `Patro: ${log?.floor || '?'}`,
      `Mistnost: ${log?.roomName || '?'}`,
      `Popis: ${defectNote}`,
      foodSafetyRisk ? `Food safety riziko: ANO (${foodSafetyHazardType || 'neurceno'}, dopad: ${foodSafetyImpact || 'neurceno'})` : '',
    ].join('\n');

    if (log?.taskId) {
      try {
        await updateTask(log.taskId, {
          title: taskTitle,
          description: taskDescription,
          priority,
          foodSafetyRisk,
          foodSafetyHazardType,
          foodSafetyImpact,
        });
      } catch (err) {
        console.error('[useInspections] Linked task update failed:', err);
      }
      return;
    }

    // Auto-create linked task
    try {
      const taskId = await createTask({
        title: `Závada: ${log?.roomName || 'Neznámá místnost'} — ${defectNote.slice(0, 80)}`,
        description: `Automaticky vytvořeno z kontroly budov.\nBudova: ${log?.building || '?'}\nPatro: ${log?.floor || '?'}\nMístnost: ${log?.roomName || '?'}\nPopis: ${defectNote}`,
        type: 'corrective',
        priority,
        source: 'inspection',
        sourceRefType: 'inspection_log',
        sourceRefId: logId,
        inspectionLogId: logId,
        buildingId: log?.building || undefined,
        foodSafetyRisk,
        foodSafetyHazardType,
        foodSafetyImpact,
        createdById: user?.id || 'system',
        createdByName: user?.displayName || 'Kontrola budov',
      });
      await updateDoc(doc(db, 'inspection_logs', logId), {
        taskId,
        updatedAt: serverTimestamp(),
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
        const newLogRef = await addDoc(collection(db, 'inspection_logs'), {
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
          const taskId = await createTask({
            title: `Nedodělek: ${log.roomName} — ${log.defectNote.slice(0, 60)}`,
            description: `Přenesená závada z ${prevMonth}.\nBudova: ${log.building}\nPatro: ${log.floor}\nMístnost: ${log.roomName}\nPopis: ${log.defectNote}`,
            type: 'corrective',
            priority: 'P1',
            source: 'inspection',
            sourceRefType: 'inspection_log',
            sourceRefId: newLogRef.id,
            inspectionLogId: newLogRef.id,
            buildingId: log.building || undefined,
            createdById: user?.id || 'system',
            createdByName: user?.displayName || 'Kontrola budov',
          });
          await updateDoc(doc(db, 'inspection_logs', newLogRef.id), {
            taskId,
            updatedAt: serverTimestamp(),
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

  async function updateInspectionNote(logId: string, inspectionNote: string) {
    await updateDoc(doc(db, 'inspection_logs', logId), {
      inspectionNote,
      updatedAt: serverTimestamp(),
    });
  }

  async function updateInspectionFrequency(logId: string, frequency: InspectionFrequency) {
    const logRef = doc(db, 'inspection_logs', logId);
    const currentLog = await getDoc(logRef);
    const templateId = currentLog.data()?.templateId;

    await updateDoc(doc(db, 'inspection_logs', logId), {
      frequency,
      updatedAt: serverTimestamp(),
    });

    if (typeof templateId === 'string' && templateId) {
      await setDoc(doc(db, 'inspection_templates', templateId), {
        frequency,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    }
  }

  return {
    logs,
    loading,
    stats,
    grouped,
    markOk,
    markDefect,
    markPending,
    updateInspectionNote,
    updateInspectionFrequency,
    currentMonth,
    previousDefects,
    confirmPreviousDefect,
    prevMonth,
  };
}
