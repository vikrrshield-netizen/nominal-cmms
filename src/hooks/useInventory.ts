// src/hooks/useInventory.ts
// VIKRR — Asset Shield — Skladový hook s transakčním odpisem
//
// Funkce:
// - issueItem()     → výdej ze skladu (ručně nebo z úkolu)
// - receiveItem()   → příjem na sklad
// - adjustItem()    → korekce inventury
// - completeTaskWithParts() → dokončit úkol + automatický odpis
// - createOrder()   → požadavek na nákup
// - approveOrder()  → schválení objednávky

import { useState, useEffect, useCallback } from 'react';
import {
  collection, onSnapshot, doc, addDoc, updateDoc,
  writeBatch, increment, Timestamp, serverTimestamp,
  /* query, where, orderBy, limit — reserved for future filters */
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthContext } from '../context/AuthContext';
import type {
  InventoryItem, InventoryTransaction, PurchaseOrder,
  TransactionType
} from '../types/inventory';
import { calcItemStatus } from '../types/inventory';

// ═══════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════

export function useInventory() {
  const { user } = useAuthContext();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ─────────────────────────────────────────
  // Realtime items listener
  // ─────────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'inventory'),
      (snap) => {
        setItems(
          snap.docs
            .map((d) => {
              const data = d.data();
              return {
                id: d.id,
                ...data,
                // Ensure array fields always have defaults
                compatibleAssetIds: data.compatibleAssetIds || [],
                compatibleAssetNames: data.compatibleAssetNames || [],
                linkedMachineIds: data.linkedMachineIds || [],
              } as InventoryItem;
            })
            .filter((i) => !i.isDeleted)
        );
        setLoading(false);
      },
      (err) => {
        console.error('[useInventory]', err);
        setError(err.message);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // ─────────────────────────────────────────
  // Zapsat transakci + aktualizovat množství
  // ─────────────────────────────────────────
  const recordTransaction = useCallback(
    async (
      itemId: string,
      type: TransactionType,
      qty: number, // kladné číslo (směr určuje type)
      opts?: { taskId?: string; taskTitle?: string; orderId?: string; note?: string }
    ) => {
      if (!user) throw new Error('Nepřihlášen');

      const itemRef = doc(db, 'inventory', itemId);
      const item = items.find((i) => i.id === itemId);
      if (!item) throw new Error(`Položka ${itemId} nenalezena`);

      // Výpočet
      const delta = type === 'issue' ? -qty : qty;
      const newQuantity = item.quantity + delta;

      if (newQuantity < 0 && type === 'issue') {
        throw new Error(`Nedostatek na skladu: ${item.name} (${item.quantity} ${item.unit})`);
      }

      const batch = writeBatch(db);

      // 1. Update inventory item
      const newStatus = calcItemStatus(newQuantity, item.minQuantity);
      batch.update(itemRef, {
        quantity: increment(delta),
        status: newStatus,
        updatedAt: serverTimestamp(),
      });

      // 2. Zapsat transakci
      const txRef = doc(collection(db, 'inventory_transactions'));
      const txData: Omit<InventoryTransaction, 'id'> = {
        itemId,
        itemName: item.name,
        type,
        quantity: delta,
        performedBy: user.uid,
        performedByName: user.displayName,
        performedAt: Timestamp.now(),
        quantityAfter: newQuantity,
        ...(opts?.taskId && { taskId: opts.taskId }),
        ...(opts?.taskTitle && { taskTitle: opts.taskTitle }),
        ...(opts?.orderId && { orderId: opts.orderId }),
        ...(opts?.note && { note: opts.note }),
      };
      batch.set(txRef, txData);

      // 3. Notifikace pokud pod minimem
      if (newStatus === 'low' || newStatus === 'critical' || newStatus === 'out') {
        const notifRef = doc(collection(db, 'notifications'));
        batch.set(notifRef, {
          targetType: 'role',
          targetId: 'role_vedeni', // notifikace pro vedení/nákupčí
          title: `Nízký stav: ${item.name}`,
          body: `${item.name}: ${newQuantity} ${item.unit} (minimum: ${item.minQuantity})`,
          type: 'inventory',
          severity: newStatus === 'out' ? 'critical' : 'warning',
          linkTo: `/inventory?item=${itemId}`,
          isRead: false,
          createdAt: serverTimestamp(),
        });
      }

      await batch.commit();
      return { newQuantity, newStatus };
    },
    [user, items]
  );

  // ─────────────────────────────────────────
  // Veřejné API
  // ─────────────────────────────────────────

  /** Výdej ze skladu */
  const issueItem = useCallback(
    (itemId: string, qty: number, note?: string) =>
      recordTransaction(itemId, 'issue', qty, { note }),
    [recordTransaction]
  );

  /** Příjem na sklad */
  const receiveItem = useCallback(
    (itemId: string, qty: number, opts?: { orderId?: string; note?: string }) =>
      recordTransaction(itemId, 'receive', qty, opts),
    [recordTransaction]
  );

  /** Korekce inventury */
  const adjustItem = useCallback(
    (itemId: string, qty: number, note?: string) =>
      recordTransaction(itemId, 'adjust', qty, { note }),
    [recordTransaction]
  );

  /**
   * KLÍČOVÁ FUNKCE: Dokončit úkol + automatický odpis dílů
   * Volá se z TasksPage při dokončení work orderu
   */
  const completeTaskWithParts = useCallback(
    async (
      taskId: string,
      parts: { partId: string; partName: string; quantity: number }[]
    ) => {
      if (!user) throw new Error('Nepřihlášen');

      const batch = writeBatch(db);

      // 1. Dokončit task
      const taskRef = doc(db, 'tasks', taskId);
      batch.update(taskRef, {
        status: 'done',
        completedAt: Timestamp.now(),
        completedBy: user.displayName,
        usedParts: parts,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });

      // 2. Pro každý díl: odpis + transakce + kontrola minima
      for (const part of parts) {
        const item = items.find((i) => i.id === part.partId);
        if (!item) continue;

        const newQty = item.quantity - part.quantity;
        const newStatus = calcItemStatus(Math.max(0, newQty), item.minQuantity);

        // Odpis
        const itemRef = doc(db, 'inventory', part.partId);
        batch.update(itemRef, {
          quantity: increment(-part.quantity),
          status: newStatus,
          updatedAt: serverTimestamp(),
        });

        // Transakce
        const txRef = doc(collection(db, 'inventory_transactions'));
        batch.set(txRef, {
          itemId: part.partId,
          itemName: part.partName,
          type: 'issue',
          quantity: -part.quantity,
          taskId,
          performedBy: user.uid,
          performedByName: user.displayName,
          performedAt: Timestamp.now(),
          quantityAfter: Math.max(0, newQty),
        });

        // Notifikace pokud pod minimem
        if (newStatus !== 'ok') {
          const notifRef = doc(collection(db, 'notifications'));
          batch.set(notifRef, {
            targetType: 'role',
            targetId: 'role_vedeni',
            title: `Nízký stav: ${part.partName}`,
            body: `Spotřebováno při úkolu. Zbývá: ${Math.max(0, newQty)} ${item.unit}`,
            type: 'inventory',
            severity: newStatus === 'out' ? 'critical' : 'warning',
            linkTo: `/inventory?item=${part.partId}`,
            isRead: false,
            createdAt: serverTimestamp(),
          });
        }
      }

      // 3. Audit log
      const auditRef = doc(collection(db, 'audit_logs'));
      batch.set(auditRef, {
        userId: user.uid,
        userName: user.displayName,
        userRole: user.primaryRoleId,
        action: 'UPDATE',
        collection: 'tasks',
        documentId: taskId,
        timestamp: Timestamp.now(),
        changes: {
          status: 'done',
          usedParts: parts.map((p) => `${p.partName} x${p.quantity}`),
        },
      });

      await batch.commit();
    },
    [user, items]
  );

  /** Vytvořit objednávku */
  const createOrder = useCallback(
    async (
      title: string,
      orderItems: { itemId: string; itemName: string; quantity: number }[],
      supplier?: string
    ) => {
      if (!user) throw new Error('Nepřihlášen');

      const orderData: Omit<PurchaseOrder, 'id'> = {
        title,
        status: 'pending_approval',
        items: orderItems.map((i) => ({
          itemId: i.itemId,
          itemName: i.itemName,
          quantity: i.quantity,
        })),
        supplier: supplier || '',
        requestedBy: user.uid,
        requestedByName: user.displayName,
        requestedAt: Timestamp.now(),
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        isDeleted: false,
      };

      const ref = await addDoc(collection(db, 'purchase_orders'), orderData);

      // Notifikace schvalovateli
      await addDoc(collection(db, 'notifications'), {
        targetType: 'role',
        targetId: 'role_vedeni',
        title: `Nová objednávka: ${title}`,
        body: `${orderItems.length} položek ke schválení`,
        type: 'inventory',
        severity: 'info',
        linkTo: `/inventory?order=${ref.id}`,
        isRead: false,
        createdAt: serverTimestamp(),
      });

      return ref.id;
    },
    [user]
  );

  /** Schválit objednávku */
  const approveOrder = useCallback(
    async (orderId: string) => {
      if (!user) throw new Error('Nepřihlášen');

      await updateDoc(doc(db, 'purchase_orders', orderId), {
        status: 'approved',
        approvedBy: user.uid,
        approvedByName: user.displayName,
        approvedAt: Timestamp.now(),
        updatedAt: serverTimestamp(),
      });
    },
    [user]
  );

  // ─────────────────────────────────────────
  // Stats
  // ─────────────────────────────────────────
  const stats = {
    total: items.length,
    ok: items.filter((i) => i.status === 'ok').length,
    low: items.filter((i) => i.status === 'low').length,
    critical: items.filter((i) => i.status === 'critical').length,
    out: items.filter((i) => i.status === 'out').length,
  };

  return {
    items,
    loading,
    error,
    stats,
    issueItem,
    receiveItem,
    adjustItem,
    completeTaskWithParts,
    createOrder,
    approveOrder,
  };
}
