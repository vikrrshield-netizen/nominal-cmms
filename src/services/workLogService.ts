import { collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { WorkLog } from '../types/workLog';

const COLLECTION = 'workLogs';

export const addWorkLog = async (input: Omit<WorkLog, 'id' | 'createdAt'>): Promise<string> => {
  const docRef = await addDoc(collection(db, COLLECTION), {
    ...input,
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
