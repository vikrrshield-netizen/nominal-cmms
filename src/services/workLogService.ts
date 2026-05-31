import { collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp, Timestamp, limit } from 'firebase/firestore';
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

export const subscribeToWorkLogs = (
  workOrderId: string,
  callback: (logs: WorkLog[]) => void
): (() => void) => {
  const q = query(
    collection(db, COLLECTION),
    where('workOrderId', '==', workOrderId),
    orderBy('createdAt', 'desc')
  );
  
  return onSnapshot(q, (snapshot) => {
    const logs: WorkLog[] = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt instanceof Timestamp ? doc.data().createdAt.toDate() : new Date(),
    } as WorkLog));
    callback(logs);
  });
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
