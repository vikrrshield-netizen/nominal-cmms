// src/hooks/useFirestoreAction.ts
// NOMINAL CMMS — Bezpečné Firestore operace
// Auto timestamps, soft delete, audit logging

import { useState, useCallback } from 'react';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  DocumentReference,
  WriteBatch,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthContext } from '../context/AuthContext';

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════

/** Typ akce pro audit log */
type AuditAction = 'CREATE' | 'UPDATE' | 'SOFT_DELETE' | 'HARD_DELETE' | 'RESTORE';

/** Záznam v audit_logs kolekci */
interface AuditLogEntry {
  userId: string;
  userName: string;
  userRole: string;
  action: AuditAction;
  collection: string;
  documentId: string;
  timestamp: ReturnType<typeof serverTimestamp>;
  changes?: Record<string, unknown>;
  reason?: string;
}

/** Výsledek operace */
interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  docId?: string;
}

/** Konfigurace hooku */
interface UseFirestoreActionOptions {
  /** Název kolekce */
  collectionName: string;
  /** Zapnout audit logging (default: true) */
  enableAudit?: boolean;
}

// ═══════════════════════════════════════════
// AUDIT LOGGER
// ═══════════════════════════════════════════

async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    await addDoc(collection(db, 'audit_logs'), entry);
  } catch (err) {
    // Audit log failure nesmí zastavit hlavní operaci
    console.error('[AuditLog] Failed to write:', err);
  }
}

// ═══════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════

export function useFirestoreAction(options: UseFirestoreActionOptions) {
  const { collectionName, enableAudit = true } = options;
  const { user } = useAuthContext();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Helper: get current user info for audit
  const getAuditUser = useCallback(() => {
    if (!user) throw new Error('Uživatel není přihlášen');
    return {
      userId: user.uid,
      userName: user.displayName || 'unknown',
      userRole: user.role || 'unknown',
    };
  }, [user]);

  // Helper: write audit if enabled
  const audit = useCallback(
    async (
      action: AuditAction,
      documentId: string,
      changes?: Record<string, unknown>,
      reason?: string
    ) => {
      if (!enableAudit) return;
      const auditUser = getAuditUser();
      await writeAuditLog({
        ...auditUser,
        action,
        collection: collectionName,
        documentId,
        timestamp: serverTimestamp(),
        ...(changes && { changes }),
        ...(reason && { reason }),
      });
    },
    [enableAudit, collectionName, getAuditUser]
  );

  // ─────────────────────────────────────────
  // CREATE — přidá dokument s timestamps
  // ─────────────────────────────────────────
  const create = useCallback(
    async (data: Record<string, unknown>): Promise<ActionResult<DocumentReference>> => {
      setLoading(true);
      setError(null);

      try {
        if (!user) throw new Error('Uživatel není přihlášen');

        const enrichedData = {
          ...data,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: user.uid,
          updatedBy: user.uid,
          isDeleted: false,
        };

        const ref = await addDoc(collection(db, collectionName), enrichedData);

        await audit('CREATE', ref.id, data);

        setLoading(false);
        return { success: true, data: ref, docId: ref.id };
      } catch (err: any) {
        const msg = err.message || 'Chyba při vytváření';
        setError(msg);
        setLoading(false);
        return { success: false, error: msg };
      }
    },
    [user, collectionName, audit]
  );

  // ─────────────────────────────────────────
  // UPDATE — aktualizuje dokument + updatedAt
  // ─────────────────────────────────────────
  const update = useCallback(
    async (
      documentId: string,
      data: Record<string, unknown>,
      reason?: string
    ): Promise<ActionResult> => {
      setLoading(true);
      setError(null);

      try {
        if (!user) throw new Error('Uživatel není přihlášen');

        const enrichedData = {
          ...data,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        };

        const ref = doc(db, collectionName, documentId);
        await updateDoc(ref, enrichedData);

        await audit('UPDATE', documentId, data, reason);

        setLoading(false);
        return { success: true, docId: documentId };
      } catch (err: any) {
        const msg = err.message || 'Chyba při aktualizaci';
        setError(msg);
        setLoading(false);
        return { success: false, error: msg };
      }
    },
    [user, collectionName, audit]
  );

  // ─────────────────────────────────────────
  // SOFT DELETE — nastaví isDeleted: true
  // ─────────────────────────────────────────
  const softDelete = useCallback(
    async (documentId: string, reason?: string): Promise<ActionResult> => {
      setLoading(true);
      setError(null);

      try {
        if (!user) throw new Error('Uživatel není přihlášen');

        const ref = doc(db, collectionName, documentId);
        await updateDoc(ref, {
          isDeleted: true,
          deletedAt: serverTimestamp(),
          deletedBy: user.uid,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        });

        await audit('SOFT_DELETE', documentId, undefined, reason);

        setLoading(false);
        return { success: true, docId: documentId };
      } catch (err: any) {
        const msg = err.message || 'Chyba při mazání';
        setError(msg);
        setLoading(false);
        return { success: false, error: msg };
      }
    },
    [user, collectionName, audit]
  );

  // ─────────────────────────────────────────
  // RESTORE — obnoví soft-deleted dokument
  // ─────────────────────────────────────────
  const restore = useCallback(
    async (documentId: string): Promise<ActionResult> => {
      setLoading(true);
      setError(null);

      try {
        if (!user) throw new Error('Uživatel není přihlášen');

        const ref = doc(db, collectionName, documentId);
        await updateDoc(ref, {
          isDeleted: false,
          deletedAt: null,
          deletedBy: null,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        });

        await audit('RESTORE', documentId);

        setLoading(false);
        return { success: true, docId: documentId };
      } catch (err: any) {
        const msg = err.message || 'Chyba při obnově';
        setError(msg);
        setLoading(false);
        return { success: false, error: msg };
      }
    },
    [user, collectionName, audit]
  );

  // ─────────────────────────────────────────
  // HARD DELETE — POUZE PRO SUPERADMIN
  // ─────────────────────────────────────────
  const hardDelete = useCallback(
    async (documentId: string, reason: string): Promise<ActionResult> => {
      setLoading(true);
      setError(null);

      try {
        if (!user) throw new Error('Uživatel není přihlášen');

        const auditUser = getAuditUser();
        if (auditUser.userRole !== 'SUPERADMIN') {
          throw new Error('Tvrdé mazání je povoleno pouze pro SUPERADMIN');
        }

        if (!reason || reason.trim().length < 5) {
          throw new Error('Důvod mazání je povinný (min. 5 znaků)');
        }

        // Audit BEFORE delete (document won't exist after)
        await audit('HARD_DELETE', documentId, undefined, reason);

        const ref = doc(db, collectionName, documentId);
        await deleteDoc(ref);

        setLoading(false);
        return { success: true, docId: documentId };
      } catch (err: any) {
        const msg = err.message || 'Chyba při tvrdém mazání';
        setError(msg);
        setLoading(false);
        return { success: false, error: msg };
      }
    },
    [user, collectionName, audit, getAuditUser]
  );

  // ─────────────────────────────────────────
  // BATCH — více operací v jedné transakci
  // ─────────────────────────────────────────
  const batchUpdate = useCallback(
    async (
      updates: Array<{ docId: string; data: Record<string, unknown> }>
    ): Promise<ActionResult> => {
      setLoading(true);
      setError(null);

      try {
        if (!user) throw new Error('Uživatel není přihlášen');

        const batch: WriteBatch = writeBatch(db);

        for (const { docId, data } of updates) {
          const ref = doc(db, collectionName, docId);
          batch.update(ref, {
            ...data,
            updatedAt: serverTimestamp(),
            updatedBy: user.uid,
          });
        }

        await batch.commit();

        // Audit each update
        for (const { docId, data } of updates) {
          await audit('UPDATE', docId, data, `Batch update (${updates.length} docs)`);
        }

        setLoading(false);
        return { success: true };
      } catch (err: any) {
        const msg = err.message || 'Chyba při batch operaci';
        setError(msg);
        setLoading(false);
        return { success: false, error: msg };
      }
    },
    [user, collectionName, audit]
  );

  // ─────────────────────────────────────────
  // RETURN
  // ─────────────────────────────────────────
  return {
    create,
    update,
    softDelete,
    restore,
    hardDelete,
    batchUpdate,
    loading,
    error,
    clearError: () => setError(null),
  };
}

// ═══════════════════════════════════════════
// USAGE EXAMPLES
// ═══════════════════════════════════════════
//
// const { create, update, softDelete, loading, error } = useFirestoreAction({
//   collectionName: 'tasks',
// });
//
// // Vytvořit úkol
// const result = await create({
//   title: 'Opravit extruder E1-A',
//   priority: 'P1',
//   assignedTo: 'uid_zdenda',
// });
//
// // Aktualizovat
// await update(taskId, { status: 'completed' }, 'Oprava dokončena');
//
// // Soft delete (bezpečné smazání)
// await softDelete(taskId, 'Duplicitní úkol');
//
// // Hard delete (jen SUPERADMIN)
// await hardDelete(taskId, 'Testovací data - čištění DB');
