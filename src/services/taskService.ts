// src/services/taskService.ts
// VIKRR — Asset Shield — Task (Work Order) Service

import {
  collection,
  doc,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  serverTimestamp,
  Timestamp,
  writeBatch,
  runTransaction
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { formatCounter, nextCounterValue } from './counterService';
import type { TaskDoc, TaskStatus, TaskPriority, TaskType, TaskSource, TaskDefect } from '../types/firestore';

const COLLECTION = 'tasks';

// Jedna dílčí závada (pro checklist v úkolu)
export function newDefect(text: string): TaskDefect {
  return { id: 'dfc-' + Math.random().toString(36).slice(2, 9), text: text.trim(), done: false, doneAt: null };
}

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export interface CreateTaskInput {
  title: string;
  description?: string;
  type: TaskType;
  priority: TaskPriority;
  source?: TaskSource;
  sourceRefType?: 'inspection_log' | 'inspection_run' | 'manual' | 'asset' | 'work_log' | 'datalogger_temperature';
  sourceRefId?: string;
  sourceRunId?: string;
  sourceRunItemId?: string;
  inspectionLogId?: string;
  inspectionPointId?: string;
  assetId?: string;
  assetName?: string;
  roomId?: string;
  roomName?: string;
  relatedAssetId?: string;
  relatedAssetName?: string;
  relatedAssetRole?: string;
  buildingId?: string;
  assigneeId?: string;
  assigneeName?: string;
  assigneeColor?: string;
  assignedWorkerNames?: string[];
  plannedDate?: Date;
  dueDate?: Date;
  estimatedMinutes?: number;
  foodSafetyRisk?: boolean;
  foodSafetyHazardType?: string;
  foodSafetyImpact?: string;
  defectTexts?: string[];   // dílčí závady (každá = samostatná položka checklistu)
  createdById: string;
  createdByName: string;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  type?: TaskType;
  priority?: TaskPriority;
  status?: TaskStatus;
  assigneeId?: string;
  assigneeName?: string;
  assigneeColor?: string;
  assignedWorkerNames?: string[];
  plannedDate?: Date;
  dueDate?: Date;
  estimatedMinutes?: number;
  actualMinutes?: number;
  resolution?: string;
  foodSafetyRisk?: boolean;
  foodSafetyHazardType?: string;
  foodSafetyImpact?: string;
}

// ═══════════════════════════════════════════════════════════════════
// CODE GENERATOR
// ═══════════════════════════════════════════════════════════════════

async function generateTaskCode(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `WO-${year}-`;
  const nextValue = await nextCounterValue(`tasks_wo_${year}`);
  return `${prefix}${formatCounter(nextValue)}`;
  
  // Najít nejvyšší číslo v tomto roce
  
}

// ═══════════════════════════════════════════════════════════════════
// CRUD OPERATIONS
// ═══════════════════════════════════════════════════════════════════

// Vytvořit nový úkol
export async function buildTaskData(input: CreateTaskInput): Promise<Record<string, any>> {
  const code = await generateTaskCode();
  
  const taskData: Record<string, any> = {
    code,
    title: input.title,
    type: input.type,
    status: 'backlog',
    priority: input.priority,
    source: input.source || 'web',
    createdById: input.createdById,
    createdByName: input.createdByName,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  // Optional fields — only include if defined (Firestore rejects undefined)
  if (input.description) taskData.description = input.description;
  if (input.sourceRefType) taskData.sourceRefType = input.sourceRefType;
  if (input.sourceRefId) taskData.sourceRefId = input.sourceRefId;
  if (input.sourceRunId) taskData.sourceRunId = input.sourceRunId;
  if (input.sourceRunItemId) taskData.sourceRunItemId = input.sourceRunItemId;
  if (input.inspectionLogId) taskData.inspectionLogId = input.inspectionLogId;
  if (input.inspectionPointId) taskData.inspectionPointId = input.inspectionPointId;
  if (input.assetId) taskData.assetId = input.assetId;
  if (input.assetName) taskData.assetName = input.assetName;
  if (input.roomId) taskData.roomId = input.roomId;
  if (input.roomName) taskData.roomName = input.roomName;
  if (input.relatedAssetId) taskData.relatedAssetId = input.relatedAssetId;
  if (input.relatedAssetName) taskData.relatedAssetName = input.relatedAssetName;
  if (input.relatedAssetRole) taskData.relatedAssetRole = input.relatedAssetRole;
  if (input.buildingId) taskData.buildingId = input.buildingId;
  if (input.assigneeId) taskData.assigneeId = input.assigneeId;
  if (input.assigneeName) taskData.assigneeName = input.assigneeName;
  if (input.assigneeColor) taskData.assigneeColor = input.assigneeColor;
  if (input.assignedWorkerNames) taskData.assignedWorkerNames = input.assignedWorkerNames;
  if (input.plannedDate) taskData.plannedDate = Timestamp.fromDate(input.plannedDate);
  if (input.dueDate) taskData.dueDate = Timestamp.fromDate(input.dueDate);
  if (input.estimatedMinutes) taskData.estimatedMinutes = input.estimatedMinutes;
  if (input.foodSafetyRisk !== undefined) taskData.foodSafetyRisk = input.foodSafetyRisk;
  if (input.foodSafetyHazardType) taskData.foodSafetyHazardType = input.foodSafetyHazardType;
  if (input.foodSafetyImpact) taskData.foodSafetyImpact = input.foodSafetyImpact;
  const defectTexts = (input.defectTexts || []).map((t) => t.trim()).filter(Boolean);
  if (defectTexts.length) taskData.defects = defectTexts.map((t) => newDefect(t));

  return taskData;
}

export async function createTask(input: CreateTaskInput): Promise<string> {
  const taskData = await buildTaskData(input);
  const docRef = await addDoc(collection(db, COLLECTION), taskData);
  return docRef.id;
}

// Aktualizovat úkol
export async function updateTask(taskId: string, input: UpdateTaskInput): Promise<void> {
  const updateData: Record<string, any> = {
    updatedAt: serverTimestamp(),
  };
  
  if (input.title !== undefined) updateData.title = input.title;
  if (input.description !== undefined) updateData.description = input.description;
  if (input.type !== undefined) updateData.type = input.type;
  if (input.priority !== undefined) updateData.priority = input.priority;
  if (input.status !== undefined) updateData.status = input.status;
  if (input.assigneeId !== undefined) updateData.assigneeId = input.assigneeId;
  if (input.assigneeName !== undefined) updateData.assigneeName = input.assigneeName;
  if (input.assigneeColor !== undefined) updateData.assigneeColor = input.assigneeColor;
  if (input.assignedWorkerNames !== undefined) updateData.assignedWorkerNames = input.assignedWorkerNames;
  if (input.plannedDate !== undefined) updateData.plannedDate = Timestamp.fromDate(input.plannedDate);
  if (input.dueDate !== undefined) updateData.dueDate = Timestamp.fromDate(input.dueDate);
  if (input.estimatedMinutes !== undefined) updateData.estimatedMinutes = input.estimatedMinutes;
  if (input.actualMinutes !== undefined) updateData.actualMinutes = input.actualMinutes;
  if (input.resolution !== undefined) updateData.resolution = input.resolution;
  if (input.foodSafetyRisk !== undefined) updateData.foodSafetyRisk = input.foodSafetyRisk;
  if (input.foodSafetyHazardType !== undefined) updateData.foodSafetyHazardType = input.foodSafetyHazardType;
  if (input.foodSafetyImpact !== undefined) updateData.foodSafetyImpact = input.foodSafetyImpact;
  
  await updateDoc(doc(db, COLLECTION, taskId), updateData);
}

// Smazat úkol
export async function deleteTask(taskId: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, taskId));
}

// Získat jeden úkol
export async function getTask(taskId: string): Promise<TaskDoc | null> {
  const snapshot = await getDoc(doc(db, COLLECTION, taskId));
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() } as TaskDoc;
}

// ═══════════════════════════════════════════════════════════════════
// STATUS CHANGES
// ═══════════════════════════════════════════════════════════════════

// Spustit úkol
export async function startTask(taskId: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, taskId), {
    status: 'in_progress',
    startedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

// Pozastavit úkol
export async function pauseTask(taskId: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, taskId), {
    status: 'paused',
    pausedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

// Dokončit úkol
export async function completeTask(
  taskId: string, 
  resolution?: string, 
  actualMinutes?: number
): Promise<void> {
  // Transakce + kontrola stavu: dva souběžné „dokončit" nebo dokončení už uzavřeného
  // úkolu by přepsaly původní completedAt/resolution. Terminální stav se nepřepisuje.
  await runTransaction(db, async (tx) => {
    const ref = doc(db, COLLECTION, taskId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Úkol nenalezen.');
    const status = snap.data().status;
    if (status === 'completed' || status === 'cancelled') {
      throw new Error('Úkol je už uzavřený.');
    }
    const updateData: Record<string, unknown> = {
      status: 'completed',
      completedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (resolution !== undefined) updateData.resolution = resolution;
    if (actualMinutes !== undefined) updateData.actualMinutes = actualMinutes;
    tx.update(ref, updateData);
  });
}

// Uložit seznam dílčích závad (checklist) — přepíše celé pole `defects`.
// doneAt používá Timestamp.now() (serverTimestamp nelze uvnitř pole).
export async function setTaskDefects(taskId: string, defects: TaskDefect[]): Promise<void> {
  const clean = defects.map((d) => ({
    id: d.id,
    text: d.text,
    done: !!d.done,
    doneAt: d.done ? (d.doneAt ?? Timestamp.now()) : null,
    ...(d.doneByName ? { doneByName: d.doneByName } : {}),
  }));
  await updateDoc(doc(db, COLLECTION, taskId), { defects: clean, updatedAt: serverTimestamp() });
}

// Zrušit úkol
export async function cancelTask(taskId: string, reason?: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, COLLECTION, taskId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Úkol nenalezen.');
    const status = snap.data().status;
    if (status === 'completed' || status === 'cancelled') {
      throw new Error('Úkol je už uzavřený.');
    }
    tx.update(ref, {
      status: 'cancelled',
      resolution: reason,
      updatedAt: serverTimestamp(),
    });
  });
}

// Schválit úkol (pro VEDENI)
export async function approveTask(
  taskId: string, 
  approvedById: string, 
  approvedByName: string
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, taskId), {
    approvedById,
    approvedByName,
    approvedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

// ═══════════════════════════════════════════════════════════════════
// WEEKLY PLANNING
// ═══════════════════════════════════════════════════════════════════

// Přesunout do týdenního plánu
export async function planTaskForWeek(taskId: string, weekString: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, taskId), {
    status: 'planned',
    plannedWeek: weekString,
    updatedAt: serverTimestamp(),
  });
}

// Hromadné plánování
export async function planMultipleTasks(
  taskIds: string[], 
  weekString: string
): Promise<void> {
  const batch = writeBatch(db);
  
  taskIds.forEach(taskId => {
    const taskRef = doc(db, COLLECTION, taskId);
    batch.update(taskRef, {
      status: 'planned',
      plannedWeek: weekString,
      updatedAt: serverTimestamp(),
    });
  });
  
  await batch.commit();
}

// ═══════════════════════════════════════════════════════════════════
// QUERIES
// ═══════════════════════════════════════════════════════════════════

// Úkoly podle statusu
export function subscribeToTasksByStatus(
  status: TaskStatus,
  callback: (tasks: TaskDoc[]) => void
): () => void {
  const q = query(
    collection(db, COLLECTION),
    where('status', '==', status),
    orderBy('createdAt', 'desc')
  );
  
  return onSnapshot(q, (snapshot) => {
    const tasks = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as TaskDoc[];
    callback(tasks);
  });
}

// Úkoly podle priority
export function subscribeToTasksByPriority(
  priority: TaskPriority,
  callback: (tasks: TaskDoc[]) => void
): () => void {
  const q = query(
    collection(db, COLLECTION),
    where('priority', '==', priority),
    where('status', 'in', ['backlog', 'planned', 'in_progress', 'paused']),
    orderBy('createdAt', 'desc')
  );
  
  return onSnapshot(q, (snapshot) => {
    const tasks = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as TaskDoc[];
    callback(tasks);
  });
}

// Úkoly pro týden
export function subscribeToWeeklyTasks(
  weekString: string,
  callback: (tasks: TaskDoc[]) => void
): () => void {
  const q = query(
    collection(db, COLLECTION),
    where('plannedWeek', '==', weekString),
    orderBy('priority')
  );
  
  return onSnapshot(q, (snapshot) => {
    const tasks = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as TaskDoc[];
    callback(tasks);
  });
}

// Všechny aktivní úkoly
export function subscribeToActiveTasks(
  callback: (tasks: TaskDoc[]) => void
): () => void {
  const q = query(
    collection(db, COLLECTION),
    where('status', 'in', ['backlog', 'planned', 'in_progress', 'paused']),
    orderBy('priority'),
    orderBy('createdAt', 'desc')
  );
  
  return onSnapshot(q, (snapshot) => {
    const tasks = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as TaskDoc[];
    callback(tasks);
  });
}

// P1 havárie (pro semafor)
export function subscribeToP1Tasks(
  callback: (tasks: TaskDoc[]) => void
): () => void {
  const q = query(
    collection(db, COLLECTION),
    where('priority', '==', 'P1'),
    where('status', 'in', ['backlog', 'planned', 'in_progress'])
  );
  
  return onSnapshot(q, (snapshot) => {
    const tasks = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as TaskDoc[];
    callback(tasks);
  });
}

// ═══════════════════════════════════════════════════════════════════
// STATISTICS
// ═══════════════════════════════════════════════════════════════════

export async function getTaskStats(): Promise<{
  total: number;
  byStatus: Record<TaskStatus, number>;
  byPriority: Record<TaskPriority, number>;
}> {
  const snapshot = await getDocs(collection(db, COLLECTION));
  
  const stats = {
    total: snapshot.size,
    byStatus: {
      backlog: 0,
      planned: 0,
      in_progress: 0,
      paused: 0,
      completed: 0,
      cancelled: 0,
    } as Record<TaskStatus, number>,
    byPriority: {
      P1: 0,
      P2: 0,
      P3: 0,
      P4: 0,
    } as Record<TaskPriority, number>,
  };
  
  snapshot.docs.forEach(doc => {
    const data = doc.data();
    stats.byStatus[data.status as TaskStatus]++;
    stats.byPriority[data.priority as TaskPriority]++;
  });
  
  return stats;
}
