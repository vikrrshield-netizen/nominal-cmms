import { collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp, Timestamp, limit, doc, updateDoc, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { WorkLog } from '../types/workLog';

const COLLECTION = 'workLogs';

export const addWorkLog = async (input: Omit<WorkLog, 'id' | 'createdAt'>): Promise<string> => {
  const cleanInput = Object.fromEntries(
    Object.entries(input)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, value instanceof Date ? Timestamp.fromDate(value) : value])
  );
  const docRef = await addDoc(collection(db, COLLECTION), {
    ...cleanInput,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
};

export const linkWorkLogToTask = async (logId: string, taskId: string, taskTitle: string): Promise<void> => {
  await updateDoc(doc(db, COLLECTION, logId), {
    taskId,
    taskTitle,
  });
};

export const updateWorkLog = async (
  logId: string,
  input: Partial<Omit<WorkLog, 'id' | 'createdAt'>>
): Promise<void> => {
  const cleanInput = Object.fromEntries(
    Object.entries(input)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, value instanceof Date ? Timestamp.fromDate(value) : value])
  );

  await updateDoc(doc(db, COLLECTION, logId), {
    ...cleanInput,
    updatedAt: serverTimestamp(),
  });
};

export const subscribeToWorkLogs = (
  workOrderId: string,
  callback: (logs: WorkLog[]) => void
): (() => void) => {
  const q = query(
    collection(db, COLLECTION),
    where('workOrderId', '==', workOrderId)
  );
  
  return onSnapshot(q, (snapshot) => {
    const logs: WorkLog[] = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt instanceof Timestamp ? doc.data().createdAt.toDate() : new Date(),
      performedAt: doc.data().performedAt instanceof Timestamp ? doc.data().performedAt.toDate() : undefined,
      updatedAt: doc.data().updatedAt instanceof Timestamp ? doc.data().updatedAt.toDate() : undefined,
    } as WorkLog))
      .sort((a, b) => (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0));
    callback(logs);
  });
};

// Jednorázově načte záznamy daného druhu práce (např. „Rozbití skla" pro auditní historii).
// Jen rovnost bez orderBy → nepotřebuje složený index; řadí se u klienta.
export const getWorkLogsByWorkType = async (workType: string, max = 50): Promise<WorkLog[]> => {
  const q = query(collection(db, COLLECTION), where('workType', '==', workType), limit(max));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
        performedAt: data.performedAt instanceof Timestamp ? data.performedAt.toDate() : undefined,
        updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : undefined,
      } as WorkLog;
    })
    .sort((a, b) => (b.performedAt ?? b.createdAt).getTime() - (a.performedAt ?? a.createdAt).getTime());
};

export const subscribeToRecentWorkLogs = (
  callback: (logs: WorkLog[]) => void,
  maxItems = 100
): (() => void) => {
  const q = query(
    collection(db, COLLECTION),
    orderBy('createdAt', 'desc'),
    limit(maxItems)
  );

  return onSnapshot(q, (snapshot) => {
    const logs: WorkLog[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
        performedAt: data.performedAt instanceof Timestamp ? data.performedAt.toDate() : undefined,
        updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : undefined,
      } as WorkLog;
    });
    callback(logs);
  });
};
