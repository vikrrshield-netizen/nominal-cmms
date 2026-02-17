// src/hooks/useFirestore.ts
// NOMINAL CMMS — Generic Firestore hooks

import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  doc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  QueryConstraint,
  type DocumentData,
  Timestamp,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../lib/firebase';

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

interface UseCollectionOptions {
  constraints?: QueryConstraint[];
  realtime?: boolean;
}

interface UseDocumentOptions {
  realtime?: boolean;
}

interface FirestoreState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

interface FirestoreListState<T> {
  data: T[];
  loading: boolean;
  error: Error | null;
}

// ═══════════════════════════════════════════════════════════════════
// useDocument — jeden dokument
// ═══════════════════════════════════════════════════════════════════

export function useDocument<T extends DocumentData>(
  collectionName: string,
  documentId: string | null,
  options: UseDocumentOptions = { realtime: true }
): FirestoreState<T> {
  const [state, setState] = useState<FirestoreState<T>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!documentId) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    const docRef = doc(db, collectionName, documentId);

    if (options.realtime) {
      // Real-time listener
      const unsubscribe = onSnapshot(
        docRef,
        (snapshot) => {
          if (snapshot.exists()) {
            setState({
              data: { id: snapshot.id, ...snapshot.data() } as unknown as T,
              loading: false,
              error: null,
            });
          } else {
            setState({ data: null, loading: false, error: null });
          }
        },
        (error) => {
          console.error(`Error fetching ${collectionName}/${documentId}:`, error);
          setState({ data: null, loading: false, error });
        }
      );

      return () => unsubscribe();
    } else {
      // One-time fetch
      getDoc(docRef)
        .then((snapshot) => {
          if (snapshot.exists()) {
            setState({
              data: { id: snapshot.id, ...snapshot.data() } as unknown as T,
              loading: false,
              error: null,
            });
          } else {
            setState({ data: null, loading: false, error: null });
          }
        })
        .catch((error) => {
          console.error(`Error fetching ${collectionName}/${documentId}:`, error);
          setState({ data: null, loading: false, error });
        });
    }
  }, [collectionName, documentId, options.realtime]);

  return state;
}

// ═══════════════════════════════════════════════════════════════════
// useCollection — seznam dokumentů
// ═══════════════════════════════════════════════════════════════════

export function useCollection<T extends DocumentData>(
  collectionName: string,
  options: UseCollectionOptions = { realtime: true }
): FirestoreListState<T> {
  const [state, setState] = useState<FirestoreListState<T>>({
    data: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    const collectionRef = collection(db, collectionName);
    const q = options.constraints
      ? query(collectionRef, ...options.constraints)
      : query(collectionRef);

    if (options.realtime) {
      // Real-time listener
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const docs = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) as unknown as T[];
          setState({ data: docs, loading: false, error: null });
        },
        (error) => {
          console.error(`Error fetching ${collectionName}:`, error);
          setState({ data: [], loading: false, error });
        }
      );

      return () => unsubscribe();
    } else {
      // One-time fetch
      getDocs(q)
        .then((snapshot) => {
          const docs = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) as unknown as T[];
          setState({ data: docs, loading: false, error: null });
        })
        .catch((error) => {
          console.error(`Error fetching ${collectionName}:`, error);
          setState({ data: [], loading: false, error });
        });
    }
  }, [collectionName, JSON.stringify(options.constraints), options.realtime]);

  return state;
}

// ═══════════════════════════════════════════════════════════════════
// CRUD Operations
// ═══════════════════════════════════════════════════════════════════

export function useFirestoreCRUD<T extends DocumentData>(collectionName: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // CREATE
  const create = useCallback(
    async (data: Omit<T, 'id'>): Promise<string | null> => {
      setLoading(true);
      setError(null);
      try {
        const docRef = await addDoc(collection(db, collectionName), {
          ...data,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setLoading(false);
        return docRef.id;
      } catch (err) {
        console.error(`Error creating in ${collectionName}:`, err);
        setError(err as Error);
        setLoading(false);
        return null;
      }
    },
    [collectionName]
  );

  // CREATE with custom ID
  const createWithId = useCallback(
    async (id: string, data: Omit<T, 'id'>): Promise<boolean> => {
      setLoading(true);
      setError(null);
      try {
        await setDoc(doc(db, collectionName, id), {
          ...data,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setLoading(false);
        return true;
      } catch (err) {
        console.error(`Error creating ${collectionName}/${id}:`, err);
        setError(err as Error);
        setLoading(false);
        return false;
      }
    },
    [collectionName]
  );

  // UPDATE
  const update = useCallback(
    async (id: string, data: Partial<T>): Promise<boolean> => {
      setLoading(true);
      setError(null);
      try {
        await updateDoc(doc(db, collectionName, id), {
          ...data,
          updatedAt: serverTimestamp(),
        });
        setLoading(false);
        return true;
      } catch (err) {
        console.error(`Error updating ${collectionName}/${id}:`, err);
        setError(err as Error);
        setLoading(false);
        return false;
      }
    },
    [collectionName]
  );

  // DELETE
  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      setLoading(true);
      setError(null);
      try {
        await deleteDoc(doc(db, collectionName, id));
        setLoading(false);
        return true;
      } catch (err) {
        console.error(`Error deleting ${collectionName}/${id}:`, err);
        setError(err as Error);
        setLoading(false);
        return false;
      }
    },
    [collectionName]
  );

  return { create, createWithId, update, remove, loading, error };
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

// Konverze Timestamp na Date
export function timestampToDate(timestamp: Timestamp | null | undefined): Date | null {
  if (!timestamp) return null;
  return timestamp.toDate();
}

// Konverze Date na Timestamp
export function dateToTimestamp(date: Date | null | undefined): Timestamp | null {
  if (!date) return null;
  return Timestamp.fromDate(date);
}

// Format pro zobrazení
export function formatTimestamp(
  timestamp: Timestamp | null | undefined,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'numeric', year: 'numeric' }
): string {
  const date = timestampToDate(timestamp);
  if (!date) return '—';
  return date.toLocaleDateString('cs-CZ', options);
}

// Re-export query helpers
export { where, orderBy, limit, Timestamp, serverTimestamp };
