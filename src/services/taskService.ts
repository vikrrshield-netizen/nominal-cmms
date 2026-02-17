// src/services/taskService.ts
// NOMINAL CMMS — Task (Work Order) Service

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
  writeBatch
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { TaskDoc, TaskStatus, TaskPriority, TaskType, TaskSource } from '../types/firestore';

const COLLECTION = 'tasks';

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export interface CreateTaskInput {
  title: string;
  description?: string;
  type: TaskType;
  priority: TaskPriority;
  source?: TaskSource;
  assetId?: string;
  assetName?: string;
  buildingId?: string;
  assigneeId?: string;
  assigneeName?: string;
  assigneeColor?: string;
  plannedDate?: Date;
  dueDate?: Date;
  estimatedMinutes?: number;
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
  plannedDate?: Date;
  dueDate?: Date;
  estimatedMinutes?: number;
  actualMinutes?: number;
  resolution?: string;
}

// ═══════════════════════════════════════════════════════════════════
// CODE GENERATOR
// ═══════════════════════════════════════════════════════════════════

async function generateTaskCode(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `WO-${year}-`;
  
  // Najít nejvyšší číslo v tomto roce
  const q = query(
    collection(db, COLLECTION),
    where('code', '>=', prefix),
    where('code', '<', prefix + '\uf8ff'),
    orderBy('code', 'desc')
  );
  
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) {
    return `${prefix}001`;
  }
  
  const lastCode = snapshot.docs[0].data().code as string;
  const lastNumber = parseInt(lastCode.split('-').pop() || '0', 10);
  const nextNumber = (lastNumber + 1).toString().padStart(3, '0');
  
  return `${prefix}${nextNumber}`;
}

// ═══════════════════════════════════════════════════════════════════
// CRUD OPERATIONS
// ═══════════════════════════════════════════════════════════════════

// Vytvořit nový úkol
export async function createTask(input: CreateTaskInput): Promise<string> {
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
  if (input.assetId) taskData.assetId = input.assetId;
  if (input.assetName) taskData.assetName = input.assetName;
  if (input.buildingId) taskData.buildingId = input.buildingId;
  if (input.assigneeId) taskData.assigneeId = input.assigneeId;
  if (input.assigneeName) taskData.assigneeName = input.assigneeName;
  if (input.assigneeColor) taskData.assigneeColor = input.assigneeColor;
  if (input.plannedDate) taskData.plannedDate = Timestamp.fromDate(input.plannedDate);
  if (input.dueDate) taskData.dueDate = Timestamp.fromDate(input.dueDate);
  if (input.estimatedMinutes) taskData.estimatedMinutes = input.estimatedMinutes;

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
  if (input.plannedDate !== undefined) updateData.plannedDate = Timestamp.fromDate(input.plannedDate);
  if (input.dueDate !== undefined) updateData.dueDate = Timestamp.fromDate(input.dueDate);
  if (input.estimatedMinutes !== undefined) updateData.estimatedMinutes = input.estimatedMinutes;
  if (input.actualMinutes !== undefined) updateData.actualMinutes = input.actualMinutes;
  if (input.resolution !== undefined) updateData.resolution = input.resolution;
  
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
  await updateDoc(doc(db, COLLECTION, taskId), {
    status: 'completed',
    completedAt: serverTimestamp(),
    resolution,
    actualMinutes,
    updatedAt: serverTimestamp(),
  });
}

// Zrušit úkol
export async function cancelTask(taskId: string, reason?: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, taskId), {
    status: 'cancelled',
    resolution: reason,
    updatedAt: serverTimestamp(),
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
