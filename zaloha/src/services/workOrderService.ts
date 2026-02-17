import {
  collection,
  addDoc,
  updateDoc,
  doc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { WorkOrder, WOStatus, WOPriority, WOType } from '../types/workOrder';

const COLLECTION = 'workOrders';

export interface CreateWorkOrderInput {
  title: string;
  description: string;
  type: WOType;
  priority: WOPriority;
  assetId: string;
  roomId: string;
  buildingId: string;
  reportedBy: string;
  reportedByName: string;
}

export const addWorkOrder = async (input: CreateWorkOrderInput): Promise<string> => {
  const docRef = await addDoc(collection(db, COLLECTION), {
    ...input,
    status: 'new' as WOStatus,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
};

export const updateWorkOrderStatus = async (
  workOrderId: string,
  status: WOStatus,
  additionalData?: Partial<WorkOrder>
): Promise<void> => {
  const docRef = doc(db, COLLECTION, workOrderId);
  await updateDoc(docRef, {
    status,
    updatedAt: serverTimestamp(),
    ...(status === 'done' ? { completedAt: serverTimestamp() } : {}),
    ...additionalData,
  });
};

export const assignWorkOrder = async (
  workOrderId: string,
  assignedTo: string,
  assignedToName: string
): Promise<void> => {
  const docRef = doc(db, COLLECTION, workOrderId);
  await updateDoc(docRef, {
    status: 'assigned' as WOStatus,
    assignedTo,
    assignedToName,
    updatedAt: serverTimestamp(),
  });
};

export const subscribeToWorkOrders = (
  callback: (workOrders: WorkOrder[]) => void
): (() => void) => {
  const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'));
  
  return onSnapshot(q, (snapshot) => {
    const workOrders: WorkOrder[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
        updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : new Date(),
        completedAt: data.completedAt instanceof Timestamp ? data.completedAt.toDate() : undefined,
        dueDate: data.dueDate instanceof Timestamp ? data.dueDate.toDate() : undefined,
      } as WorkOrder;
    });
    callback(workOrders);
  });
};
