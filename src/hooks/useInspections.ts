// src/hooks/useInspections.ts
// VIKRR — Asset Shield — Kontrolní body budovy (měsíční checklist)

import { useState, useEffect, useMemo, useRef } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, addDoc, serverTimestamp, Timestamp, writeBatch, getDoc, setDoc, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthContext } from '../context/AuthContext';
import { buildTaskData, createTask } from '../services/taskService';
import { BUILDING_INSPECTION_TEMPLATES } from '../data/buildingInspectionTemplates';
import type { TaskPriority } from '../types/firestore';
import type { InspectionRun, InspectionRunAuditEntry, InspectionRunItem, InspectionRunSummary } from '../types/inspectionRun';

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
  sourceAssetId?: string | null;
  foodSafetyRisk?: boolean;
  foodSafetyHazardType?: string;
  foodSafetyImpact?: string;
}

interface LegacyInspectionLog extends InspectionLog {
  areaId?: string;
  areaLabel?: string;
  buildingId?: string;
  completedById?: string;
  performedBy?: string;
  performedById?: string;
  performedAt?: Timestamp | null;
  inspectorName?: string;
  inspectorUid?: string;
  timestamp?: Timestamp | null;
  issues?: Array<{
    roomId?: string;
    roomCode?: string;
    roomName?: string;
    floor?: string;
    description?: string;
    checkPoints?: string;
    note?: string;
    defectNote?: string;
    taskId?: string;
  }>;
}

export interface InspectionStats {
  total: number;
  ok: number;
  defect: number;
  pending: number;
  percentDone: number;
}

function userId(user: ReturnType<typeof useAuthContext>['user']): string {
  return user?.id || user?.uid || 'unknown';
}

function userName(user: ReturnType<typeof useAuthContext>['user']): string {
  return user?.displayName || 'Neznamy';
}

function roomId(log: InspectionLog): string {
  return log.roomCode || log.roomName || log.id;
}

function runItemFromLog(log: InspectionLog): InspectionRunItem {
  return {
    id: log.id,
    logId: log.id,
    templateId: log.templateId || '',
    building: log.building || '',
    floor: log.floor || '',
    roomId: roomId(log),
    roomName: log.roomName || '',
    roomCode: log.roomCode || '',
    checkPoints: log.checkPoints || '',
    frequency: log.frequency,
    status: log.status || 'pending',
    defectNote: log.defectNote || '',
    inspectionNote: log.inspectionNote || '',
    completedBy: log.completedBy || '',
    completedById: '',
    completedAt: log.completedAt || null,
    taskId: log.taskId || '',
    sortOrder: log.sortOrder,
    sourceAssetId: log.sourceAssetId || null,
    foodSafetyRisk: log.foodSafetyRisk === true,
    foodSafetyHazardType: log.foodSafetyHazardType || '',
    foodSafetyImpact: log.foodSafetyImpact || '',
  };
}

function summarizeRunItems(items: InspectionRunItem[]): InspectionRunSummary {
  const total = items.length;
  const ok = items.filter((item) => item.status === 'ok').length;
  const defect = items.filter((item) => item.status === 'defect').length;
  const pending = items.filter((item) => item.status === 'pending').length;
  const taskCount = items.filter((item) => item.taskId).length;
  const percentDone = total > 0 ? Math.round(((ok + defect) / total) * 100) : 0;
  return { total, ok, defect, pending, percentDone, taskCount };
}

function auditEntry(action: InspectionRunAuditEntry['action'], user: ReturnType<typeof useAuthContext>['user'], note?: string): InspectionRunAuditEntry {
  return {
    action,
    at: new Date().toISOString(),
    byId: userId(user),
    byName: userName(user),
    ...(note ? { note } : {}),
  };
}

function runTime(run: InspectionRun): number {
  return run.closedAt?.toMillis?.() || run.startedAt?.toMillis?.() || run.updatedAt?.toMillis?.() || 0;
}

function dateFromFirestore(value: unknown): Date | null {
  if (!value) return null;
  if (typeof value === 'object' && value && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function monthFromDate(value: unknown, fallback = ''): string {
  const date = dateFromFirestore(value);
  if (!date) return fallback;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function dayKeyFromDate(value: unknown): string {
  const date = dateFromFirestore(value);
  if (!date) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function timestampFromDate(value: unknown): Timestamp | null {
  const date = dateFromFirestore(value);
  return date ? Timestamp.fromDate(date) : null;
}

function buildLegacyInspectionRuns(logs: LegacyInspectionLog[], representedLogIds: Set<string>): InspectionRun[] {
  const groups = new Map<string, {
    month: string;
    building: string;
    inspectorId: string;
    inspectorName: string;
    firstAt: Timestamp | null;
    lastAt: Timestamp | null;
    items: InspectionRunItem[];
  }>();

  for (const log of logs) {
    if (log.isDeleted === true) continue;
    if (representedLogIds.has(log.id)) continue;

    const rawStatus = log.status;
    const completedAtRaw = log.completedAt || log.performedAt || log.timestamp;
    const dayKey = dayKeyFromDate(completedAtRaw);
    if (!dayKey) continue;

    const building = log.building || log.areaId || log.buildingId || '';
    const inspectorId = log.completedById || log.performedById || log.inspectorUid || 'legacy';
    const inspectorName = log.completedBy || log.performedBy || log.inspectorName || 'Neznámý';
    const groupKey = `${dayKey}_${building || 'all'}_${inspectorId}_${inspectorName}`;
    const completedAt = timestampFromDate(completedAtRaw);
    const current = groups.get(groupKey) || {
      month: log.month || monthFromDate(completedAtRaw),
      building,
      inspectorId,
      inspectorName,
      firstAt: completedAt,
      lastAt: completedAt,
      items: [],
    };

    const pushItem = (item: InspectionRunItem) => {
      current.items.push(item);
    };

    if (Array.isArray(log.issues) && log.issues.length > 0 && !log.roomName && !log.checkPoints) {
      log.issues.forEach((issue, index) => {
        const issueId = `${log.id}_${index}`;
        pushItem({
          id: issueId,
          logId: log.id,
          templateId: log.templateId || '',
          building,
          floor: issue.floor || log.floor || '',
          roomId: issue.roomId || issue.roomCode || issue.roomName || issueId,
          roomName: issue.roomName || 'Místnost',
          roomCode: issue.roomCode || '',
          checkPoints: issue.checkPoints || issue.description || log.checkPoints || 'Závada z historického dokladu',
          frequency: log.frequency,
          status: 'defect',
          defectNote: issue.note || issue.defectNote || log.defectNote || '',
          inspectionNote: log.inspectionNote || '',
          completedBy: inspectorName,
          completedById: inspectorId,
          completedAt,
          taskId: issue.taskId || log.taskId || '',
          sortOrder: log.sortOrder,
          sourceAssetId: log.sourceAssetId || null,
          foodSafetyRisk: log.foodSafetyRisk === true,
          foodSafetyHazardType: log.foodSafetyHazardType || '',
          foodSafetyImpact: log.foodSafetyImpact || '',
        });
      });
    } else if (rawStatus === 'ok' || rawStatus === 'defect') {
      pushItem({
        id: log.id,
        logId: log.id,
        templateId: log.templateId || '',
        building,
        floor: log.floor || '',
        roomId: roomId(log),
        roomName: log.roomName || '',
        roomCode: log.roomCode || '',
        checkPoints: log.checkPoints || '',
        frequency: log.frequency,
        status: rawStatus,
        defectNote: log.defectNote || '',
        inspectionNote: log.inspectionNote || '',
        completedBy: inspectorName,
        completedById: inspectorId,
        completedAt,
        taskId: log.taskId || '',
        sortOrder: log.sortOrder,
        sourceAssetId: log.sourceAssetId || null,
        foodSafetyRisk: log.foodSafetyRisk === true,
        foodSafetyHazardType: log.foodSafetyHazardType || '',
        foodSafetyImpact: log.foodSafetyImpact || '',
      });
    }

    const currentFirst = current.firstAt?.toMillis?.() || Number.MAX_SAFE_INTEGER;
    const currentLast = current.lastAt?.toMillis?.() || 0;
    const next = completedAt?.toMillis?.() || 0;
    if (next && next < currentFirst) current.firstAt = completedAt;
    if (next && next > currentLast) current.lastAt = completedAt;
    groups.set(groupKey, current);
  }

  return Array.from(groups.entries())
    .map(([key, group]) => {
      const items = group.items
        .slice()
        .sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999));
      return {
        id: `legacy_${key}`,
        legacyLogId: key,
        month: group.month,
        status: 'closed',
        items,
        summary: summarizeRunItems(items),
        startedAt: group.firstAt || undefined,
        startedById: group.inspectorId,
        startedByName: group.inspectorName,
        closedAt: group.lastAt || undefined,
        closedById: group.inspectorId,
        closedByName: group.inspectorName,
        buildingScope: Array.from(new Set(items.map((item) => item.building).filter(Boolean))),
        taskIds: Array.from(new Set(items.map((item) => item.taskId).filter(Boolean))) as string[],
        auditTrail: [{
          action: 'closed',
          at: group.lastAt?.toDate?.().toISOString() || new Date().toISOString(),
          byId: group.inspectorId,
          byName: group.inspectorName,
          note: 'Starší doklad vytvořený ze záznamů inspection_logs.',
        }],
        createdAt: group.firstAt || undefined,
        updatedAt: group.lastAt || undefined,
      } satisfies InspectionRun;
    })
    .filter((run) => run.items.length > 0)
    .sort((a, b) => runTime(b) - runTime(a));
}

async function addInspectionRunLog(
  log: InspectionLog | undefined,
  logId: string,
  result: 'ok' | 'defect' | 'task_created' | 'pending',
  performedBy: string,
  performedById: string,
  detail: Record<string, unknown> = {},
) {
  await addDoc(collection(db, 'inspection_run_logs'), buildInspectionRunLogData(
    log,
    logId,
    result,
    performedBy,
    performedById,
    detail,
  ));
}

function buildInspectionRunLogData(
  log: InspectionLog | undefined,
  logId: string,
  result: 'ok' | 'defect' | 'task_created' | 'pending',
  performedBy: string,
  performedById: string,
  detail: Record<string, unknown> = {},
) {
  return {
    inspectionLogId: logId,
    templateId: log?.templateId || '',
    assetId: log?.sourceAssetId || '',
    sourceAssetId: log?.sourceAssetId || '',
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
  };
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
  const [legacyLogs, setLegacyLogs] = useState<LegacyInspectionLog[]>([]);
  const [inspectionRuns, setInspectionRuns] = useState<InspectionRun[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuthContext();
  const bootstrapStarted = useRef<Set<string>>(new Set());

  // Default = aktuální měsíc (LOKÁLNÍ čas — ne UTC; na přelomu měsíce by UTC ukázal špatný měsíc).
  const nowLocal = new Date();
  const currentMonth = month || `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}`;

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

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'inspection_runs'), (snap) => {
      const data = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as InspectionRun))
        .sort((a, b) => runTime(b) - runTime(a));
      setInspectionRuns(data);
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'inspection_logs'), (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as LegacyInspectionLog));
      setLegacyLogs(data);
    });

    return () => unsub();
  }, []);

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

  const currentMonthRuns = useMemo(
    () => inspectionRuns.filter((run) => run.month === currentMonth),
    [currentMonth, inspectionRuns],
  );

  const draftRun = useMemo(
    () => currentMonthRuns.find((run) => run.status === 'draft') || null,
    [currentMonthRuns],
  );

  const currentMonthClosedRuns = useMemo(
    () => currentMonthRuns.filter((run) => run.status === 'closed'),
    [currentMonthRuns],
  );

  const representedLogIds = useMemo(() => {
    const ids = new Set<string>();
    inspectionRuns.forEach((run) => {
      run.items?.forEach((item) => {
        if (item.logId) ids.add(item.logId);
        if (item.id) ids.add(item.id);
      });
    });
    return ids;
  }, [inspectionRuns]);

  const legacyRuns = useMemo(
    () => buildLegacyInspectionRuns(legacyLogs, representedLogIds),
    [legacyLogs, representedLogIds],
  );

  const closedRuns = useMemo(
    () => [
      ...inspectionRuns.filter((run) => run.status === 'closed'),
      ...legacyRuns,
    ].sort((a, b) => runTime(b) - runTime(a)),
    [inspectionRuns, legacyRuns],
  );

  const currentRun = draftRun || currentMonthRuns[0] || null;

  async function getOrCreateDraftRun(): Promise<InspectionRun> {
    if (draftRun) return draftRun;
    if (currentMonthClosedRuns.length > 0) {
      throw new Error('Kontrola je uzavrena. Nejdrive ji znovu otevri v archivu.');
    }
    if (logs.length === 0) {
      throw new Error('Nejsou nactene kontrolni body.');
    }

    const items = logs.map(runItemFromLog);
    const runRef = doc(collection(db, 'inspection_runs'));
    const payload = {
      month: currentMonth,
      status: 'draft',
      items,
      summary: summarizeRunItems(items),
      startedAt: serverTimestamp(),
      startedById: userId(user),
      startedByName: userName(user),
      buildingScope: Array.from(new Set(items.map((item) => item.building).filter(Boolean))),
      taskIds: [],
      auditTrail: [auditEntry('created', user, 'Draft kontroly zalozen.')],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(runRef, payload);
    return { id: runRef.id, ...payload, startedAt: Timestamp.now(), createdAt: Timestamp.now(), updatedAt: Timestamp.now() } as unknown as InspectionRun;
  }

  async function updateDraftRunItem(log: InspectionLog | undefined, patch: Partial<InspectionRunItem>) {
    if (!log) return;
    const run = await getOrCreateDraftRun();
    const baseItems = run.items?.length ? run.items : logs.map(runItemFromLog);
    let found = false;
    const items = baseItems.map((item) => {
      if (item.logId !== log.id && item.id !== log.id) return item;
      found = true;
      return { ...item, ...patch };
    });
    if (!found) items.push({ ...runItemFromLog(log), ...patch });

    await updateDoc(doc(db, 'inspection_runs', run.id), {
      items,
      summary: summarizeRunItems(items),
      buildingScope: Array.from(new Set(items.map((item) => item.building).filter(Boolean))),
      updatedAt: serverTimestamp(),
    });
  }

  async function startInspectionRun() {
    await getOrCreateDraftRun();
  }

  async function reopenInspectionRun(runId: string) {
    const run = inspectionRuns.find((item) => item.id === runId);
    if (!run) throw new Error('Kontrola nebyla nalezena.');
    await updateDoc(doc(db, 'inspection_runs', runId), {
      status: 'draft',
      reopenedAt: serverTimestamp(),
      reopenedById: userId(user),
      reopenedByName: userName(user),
      auditTrail: [...(run.auditTrail || []), auditEntry('reopened', user, 'Kontrola znovu otevrena.')],
      updatedAt: serverTimestamp(),
    });
  }

  async function closeInspectionRun(runId?: string) {
    const run = runId
      ? currentMonthRuns.find((item) => item.id === runId)
      : draftRun;
    if (!run || run.status !== 'draft') throw new Error('Neni otevrena rozpracovana kontrola.');

    const items = (run.items?.length ? run.items : logs.map(runItemFromLog)).map((item) => ({ ...item }));
    const taskIds = [...(run.taskIds || [])];
    const performedBy = userName(user);
    const performedById = userId(user);

    const batch = writeBatch(db);

    for (const item of items) {
      if (item.status !== 'defect' || item.taskId) continue;
      const priority = item.taskPriority || 'P2';
      const description = [
        'Vytvoreno pri uzavreni kontroly budovy.',
        `Kontrola: ${run.id}`,
        `Budova: ${item.building || '?'}`,
        `Patro: ${item.floor || '?'}`,
        `Mistnost: ${item.roomName || '?'}`,
        `Bod: ${item.checkPoints || '?'}`,
        `Popis: ${item.defectNote || ''}`,
        item.foodSafetyRisk ? `Food safety: ANO (${item.foodSafetyHazardType || 'neurceno'}, dopad: ${item.foodSafetyImpact || 'neurceno'})` : '',
      ].filter(Boolean).join('\n');

      const taskRef = doc(collection(db, 'tasks'));
      const taskId = taskRef.id;
      const taskData = await buildTaskData({
        title: `Zavada: ${item.roomName || 'Neznama mistnost'} - ${(item.defectNote || item.checkPoints || '').slice(0, 80)}`,
        description,
        type: 'corrective',
        priority,
        source: 'inspection',
        sourceRefType: 'inspection_run',
        sourceRefId: run.id,
        sourceRunId: run.id,
        sourceRunItemId: item.id,
        inspectionLogId: item.logId,
        inspectionPointId: item.templateId,
        buildingId: item.building || undefined,
        assetId: item.sourceAssetId || undefined,
        assetName: item.roomName || undefined,
        roomId: item.roomId || undefined,
        roomName: item.roomName || undefined,
        foodSafetyRisk: item.foodSafetyRisk,
        foodSafetyHazardType: item.foodSafetyHazardType,
        foodSafetyImpact: item.foodSafetyImpact,
        createdById: performedById,
        createdByName: performedBy,
      });
      batch.set(taskRef, taskData);
      item.taskId = taskId;
      taskIds.push(taskId);

      const sourceLogId = item.logId || item.id;
      if (sourceLogId) {
        batch.update(doc(db, 'inspection_logs', sourceLogId), {
          taskId,
          updatedAt: serverTimestamp(),
        });
      }

      const runLogRef = doc(collection(db, 'inspection_run_logs'));
      batch.set(runLogRef, buildInspectionRunLogData(logs.find((log) => log.id === sourceLogId), sourceLogId, 'task_created', performedBy, performedById, {
        taskId,
        taskPriority: priority,
        sourceRunId: run.id,
        defectNote: item.defectNote,
      }));
    }

    batch.update(doc(db, 'inspection_runs', run.id), {
      status: 'closed',
      closedAt: serverTimestamp(),
      closedById: performedById,
      closedByName: performedBy,
      items,
      taskIds: Array.from(new Set(taskIds)),
      summary: summarizeRunItems(items),
      auditTrail: [...(run.auditTrail || []), auditEntry('closed', user, 'Kontrola uzavrena.')],
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  }

  // Označit jako OK
  async function markOk(logId: string) {
    const log = logs.find((l) => l.id === logId);
    const performedBy = userName(user);
    const performedById = userId(user);
    const completedAt = Timestamp.now();

    await updateDoc(doc(db, 'inspection_logs', logId), {
      status: 'ok',
      defectNote: '',
      completedBy: performedBy,
      completedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await updateDraftRunItem(log, {
      status: 'ok',
      defectNote: '',
      completedBy: performedBy,
      completedById: performedById,
      completedAt,
      foodSafetyRisk: false,
      foodSafetyHazardType: '',
      foodSafetyImpact: '',
    });

    await addInspectionRunLog(log, logId, 'ok', performedBy, performedById, {
      note: 'Kontrola provedena bez zavady',
    });
  }

  // Označit se závadou. Úkol vzniká až při uzavření kontroly.
  async function markDefect(logId: string, defectNote: string, priority: TaskPriority = 'P2', foodSafety?: FoodSafetyDefectInfo) {
    // Najdi log pro context
    const log = logs.find((l) => l.id === logId);
    const performedBy = userName(user);
    const performedById = userId(user);
    const completedAt = Timestamp.now();
    const foodSafetyRisk = foodSafety?.foodSafetyRisk === true;
    const foodSafetyHazardType = foodSafetyRisk ? foodSafety?.foodSafetyHazardType || '' : '';
    const foodSafetyImpact = foodSafetyRisk ? foodSafety?.foodSafetyImpact || '' : '';

    await updateDoc(doc(db, 'inspection_logs', logId), {
      status: 'defect',
      defectNote,
      foodSafetyRisk,
      foodSafetyHazardType,
      foodSafetyImpact,
      completedBy: performedBy,
      completedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await updateDraftRunItem(log, {
      status: 'defect',
      defectNote,
      completedBy: performedBy,
      completedById: performedById,
      completedAt,
      taskPriority: priority,
      foodSafetyRisk,
      foodSafetyHazardType,
      foodSafetyImpact,
    });

    await addInspectionRunLog(log, logId, 'defect', performedBy, performedById, {
      defectNote,
      taskPriority: priority,
      foodSafetyRisk,
      foodSafetyHazardType,
      foodSafetyImpact,
    });
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
          sourceAssetId: log.sourceAssetId || null,
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
            assetId: log.sourceAssetId || undefined,
            assetName: log.roomName || undefined,
            createdById: user?.id || 'system',
            createdByName: user?.displayName || 'Kontrola budov',
          });
          await updateDoc(doc(db, 'inspection_logs', newLogRef.id), {
            taskId,
            updatedAt: serverTimestamp(),
          });
          await addInspectionRunLog(log, newLogRef.id, 'task_created', user?.displayName || 'Neznamy', user?.id || user?.uid || 'unknown', {
            taskId,
            taskPriority: 'P1',
            defectNote: log.defectNote,
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
    const log = logs.find((l) => l.id === logId);
    const performedBy = userName(user);
    const performedById = userId(user);
    const previousBy = log?.completedBy || '';
    await updateDoc(doc(db, 'inspection_logs', logId), {
      status: 'pending',
      defectNote: '',
      completedBy: '',
      completedAt: null,
      updatedAt: serverTimestamp(),
    });
    await updateDraftRunItem(log, {
      status: 'pending',
      defectNote: '',
      completedBy: '',
      completedById: '',
      completedAt: null,
      foodSafetyRisk: false,
      foodSafetyHazardType: '',
      foodSafetyImpact: '',
    });
    // Auditní stopa: vrácení na „nezkontrolováno" nesmí smazat identitu bez záznamu.
    await addInspectionRunLog(log, logId, 'pending', performedBy, performedById, {
      note: previousBy ? `Vráceno na nezkontrolováno (původně provedl: ${previousBy})` : 'Vráceno na nezkontrolováno',
    });
  }

  async function updateInspectionNote(logId: string, inspectionNote: string) {
    const log = logs.find((l) => l.id === logId);
    await updateDoc(doc(db, 'inspection_logs', logId), {
      inspectionNote,
      updatedAt: serverTimestamp(),
    });
    await updateDraftRunItem(log, { inspectionNote });
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
    inspectionRuns,
    currentRun,
    draftRun,
    closedRuns,
    startInspectionRun,
    closeInspectionRun,
    reopenInspectionRun,
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
