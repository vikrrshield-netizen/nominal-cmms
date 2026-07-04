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
  runTransaction, Timestamp, serverTimestamp,
  /* query, where, orderBy, limit — reserved for future filters */
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthContext } from '../context/AuthContext';
import type {
  InventoryItem, InventoryTransaction, PurchaseOrder,
  TransactionType, NewInventoryItemInput
} from '../types/inventory';
import { calcItemStatus } from '../types/inventory';

// ═══════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════

export function useInventory() {
  const { user, hasAnyPermission } = useAuthContext();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Zrcadlí firestore.rules match /inventory (canReadInventory || report.read)
  const canRead = hasAnyPermission(['inv.consume', 'inv.restock', 'inv.manage', 'inv.order', 'report.read']);

  // ─────────────────────────────────────────
  // Realtime items listener
  // ─────────────────────────────────────────
  useEffect(() => {
    if (!canRead) {
      setItems([]);
      setLoading(false);
      return;
    }
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
  }, [canRead]);

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
      // Validace množství — jen kladné konečné číslo (brání záporům/NaN, které obracely směr odpisu).
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new Error('Zadej kladné číslo množství.');
      }

      const itemRef = doc(db, 'inventory', itemId);

      // Atomický odpis: skutečný stav se čte UVNITŘ transakce z DB (ne ze zastaralého
      // React snapshotu), takže dva souběžné výdeje nemůžou stav stáhnout pod nulu.
      const result = await runTransaction(db, async (tx) => {
        const snap = await tx.get(itemRef);
        if (!snap.exists()) throw new Error(`Položka ${itemId} nenalezena`);
        const data = snap.data() as InventoryItem;
        const currentQty = Number(data.quantity) || 0;
        const minQuantity = Number(data.minQuantity) || 0;

        const delta = type === 'issue' ? -qty : qty;
        const newQuantity = currentQty + delta;
        if (newQuantity < 0) {
          throw new Error(`Nedostatek na skladu: ${data.name ?? ''} (${currentQty} ${data.unit ?? ''})`);
        }
        const newStatus = calcItemStatus(newQuantity, minQuantity);

        // 1. Zapiš SKUTEČNOU hodnotu (ne slepý increment).
        tx.update(itemRef, {
          quantity: newQuantity,
          status: newStatus,
          updatedAt: serverTimestamp(),
        });

        // 2. Zapiš transakci.
        const txRef = doc(collection(db, 'inventory_transactions'));
        const txData: Omit<InventoryTransaction, 'id'> = {
          itemId,
          itemName: data.name ?? '',
          type,
          quantity: delta,
          performedBy: user.uid,
          performedByName: user.displayName,
          performedAt: Timestamp.now(),
          createdAt: Timestamp.now(),
          quantityAfter: newQuantity,
          ...(opts?.taskId && { taskId: opts.taskId }),
          ...(opts?.taskTitle && { taskTitle: opts.taskTitle }),
          ...(opts?.orderId && { orderId: opts.orderId }),
          ...(opts?.note && { note: opts.note }),
        };
        tx.set(txRef, txData);

        // 3. Notifikace pokud pod minimem.
        if (newStatus === 'low' || newStatus === 'critical' || newStatus === 'out') {
          const notifRef = doc(collection(db, 'notifications'));
          tx.set(notifRef, {
            targetType: 'role',
            targetId: 'role_vedeni', // notifikace pro vedení/nákupčí
            createdBy: user.uid,
            title: `Nízký stav: ${data.name ?? ''}`,
            body: `${data.name ?? ''}: ${newQuantity} ${data.unit ?? ''} (minimum: ${minQuantity})`,
            type: 'inventory',
            severity: newStatus === 'out' ? 'critical' : 'warning',
            linkTo: `/inventory?item=${itemId}`,
            isRead: false,
            createdAt: serverTimestamp(),
          });
        }

        return { newQuantity, newStatus };
      });

      return result;
    },
    [user]
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
   * Inventura: NASTAV skutečný stav na přesnou hodnotu.
   * Rozdíl se počítá UVNITŘ transakce z aktuálního DB stavu (ne z klientského snapshotu),
   * takže souběžný pohyb kolegy nezpůsobí špatný výsledný počet. Zapisuje typ 'adjust'.
   */
  const setAbsoluteQuantity = useCallback(
    async (itemId: string, actual: number, note?: string) => {
      if (!user) throw new Error('Nepřihlášen');
      if (!Number.isFinite(actual) || actual < 0) throw new Error('Zadej platný skutečný počet.');

      const itemRef = doc(db, 'inventory', itemId);
      return runTransaction(db, async (tx) => {
        const snap = await tx.get(itemRef);
        if (!snap.exists()) throw new Error(`Položka ${itemId} nenalezena`);
        const data = snap.data() as InventoryItem;
        const currentQty = Number(data.quantity) || 0;
        const minQuantity = Number(data.minQuantity) || 0;
        const delta = actual - currentQty; // z ČERSTVÉHO stavu v DB
        if (delta === 0) return { newQuantity: currentQty, newStatus: data.status, changed: false };

        const newStatus = calcItemStatus(actual, minQuantity);
        tx.update(itemRef, { quantity: actual, status: newStatus, updatedAt: serverTimestamp() });

        const txRef = doc(collection(db, 'inventory_transactions'));
        tx.set(txRef, {
          itemId,
          itemName: data.name ?? '',
          type: 'adjust',
          quantity: delta,
          performedBy: user.uid,
          performedByName: user.displayName,
          performedAt: Timestamp.now(),
          createdAt: Timestamp.now(),
          quantityAfter: actual,
          ...(note && { note }),
        });

        if (newStatus === 'low' || newStatus === 'critical' || newStatus === 'out') {
          const notifRef = doc(collection(db, 'notifications'));
          tx.set(notifRef, {
            targetType: 'role',
            targetId: 'role_vedeni',
            createdBy: user.uid,
            title: `Nízký stav: ${data.name ?? ''}`,
            body: `${data.name ?? ''}: ${actual} ${data.unit ?? ''} (minimum: ${minQuantity})`,
            type: 'inventory',
            severity: newStatus === 'out' ? 'critical' : 'warning',
            linkTo: `/inventory?item=${itemId}`,
            isRead: false,
            createdAt: serverTimestamp(),
          });
        }
        return { newQuantity: actual, newStatus, changed: true };
      });
    },
    [user]
  );

  /**
   * Měkké smazání položky (isDeleted:true) — data i historie pohybů zůstanou,
   * jen zmizí ze seznamu. Zapíše auditní stopu. (Tvrdý delete = ztráta + osiřelé transakce.)
   */
  const softDeleteItem = useCallback(
    async (itemId: string, itemName?: string) => {
      if (!user) throw new Error('Nepřihlášen');
      await updateDoc(doc(db, 'inventory', itemId), {
        isDeleted: true,
        updatedAt: serverTimestamp(),
        deletedBy: user.uid,
        deletedByName: user.displayName,
      });
      await addDoc(collection(db, 'audit_logs'), {
        userId: user.uid,
        userName: user.displayName,
        action: 'DELETE',
        collection: 'inventory',
        documentId: itemId,
        timestamp: Timestamp.now(),
        changes: { isDeleted: true, name: itemName ?? '' },
      });
    },
    [user]
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

      await runTransaction(db, async (tx) => {
        // ČTENÍ NEJDŘÍV — skutečné stavy dílů z DB (ne ze zastaralého snapshotu).
        const partRefs = parts.map((p) => doc(db, 'inventory', p.partId));
        const snaps = await Promise.all(partRefs.map((r) => tx.get(r)));

        // 1. Dokončit task
        const taskRef = doc(db, 'tasks', taskId);
        tx.update(taskRef, {
          status: 'completed',
          completedAt: Timestamp.now(),
          completedBy: user.displayName,
          usedParts: parts,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        });

        // 2. Pro každý díl: atomický odpis (nikdy pod nulu) + transakce + kontrola minima
        parts.forEach((part, idx) => {
          const snap = snaps[idx];
          if (!snap.exists()) return;
          const data = snap.data() as InventoryItem;
          const qty = Number(part.quantity);
          if (!Number.isFinite(qty) || qty <= 0) return;
          const currentQty = Number(data.quantity) || 0;
          const minQuantity = Number(data.minQuantity) || 0;
          const newQty = Math.max(0, currentQty - qty);
          const newStatus = calcItemStatus(newQty, minQuantity);

          tx.update(partRefs[idx], {
            quantity: newQty,
            status: newStatus,
            updatedAt: serverTimestamp(),
          });

          const txRef = doc(collection(db, 'inventory_transactions'));
          tx.set(txRef, {
            itemId: part.partId,
            itemName: part.partName,
            type: 'issue',
            quantity: -qty,
            taskId,
            performedBy: user.uid,
            performedByName: user.displayName,
            performedAt: Timestamp.now(),
            createdAt: Timestamp.now(),
            quantityAfter: newQty,
          });

          if (newStatus !== 'ok') {
            const notifRef = doc(collection(db, 'notifications'));
            tx.set(notifRef, {
              targetType: 'role',
              targetId: 'role_vedeni',
              createdBy: user.uid,
              title: `Nízký stav: ${part.partName}`,
              body: `Spotřebováno při úkolu. Zbývá: ${newQty} ${data.unit ?? ''}`,
              type: 'inventory',
              severity: newStatus === 'out' ? 'critical' : 'warning',
              linkTo: `/inventory?item=${part.partId}`,
              isRead: false,
              createdAt: serverTimestamp(),
            });
          }
        });

        // 3. Audit log
        const auditRef = doc(collection(db, 'audit_logs'));
        tx.set(auditRef, {
          userId: user.uid,
          userName: user.displayName,
          userRole: user.primaryRoleId,
          action: 'UPDATE',
          collection: 'tasks',
          documentId: taskId,
          timestamp: Timestamp.now(),
          changes: {
            status: 'completed',
            usedParts: parts.map((p) => `${p.partName} x${p.quantity}`),
          },
        });
      });
    },
    [user]
  );

  /** Ruční vytvoření nové skladové položky */
  const createItem = useCallback(
    async (data: NewInventoryItemInput) => {
      if (!user) throw new Error('Nepřihlášen');

      const payload: Record<string, unknown> = {
        name: data.name,
        code: data.code,
        category: data.category,
        quantity: data.quantity,
        unit: data.unit,
        minQuantity: data.minQuantity,
        location: data.location,
        status: calcItemStatus(data.quantity, data.minQuantity),
        compatibleAssetIds: [],
        compatibleAssetNames: [],
        linkedMachineIds: [],
        isDeleted: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (data.supplier) payload.supplier = data.supplier;
      if (data.unitPrice != null) payload.unitPrice = data.unitPrice;
      if (data.currency) payload.currency = data.currency;
      if (data.note) payload.note = data.note;

      const ref = await addDoc(collection(db, 'inventory'), payload);
      return ref.id;
    },
    [user]
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
        createdBy: user.uid,
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
    setAbsoluteQuantity,
    softDeleteItem,
    completeTaskWithParts,
    createItem,
    createOrder,
    approveOrder,
  };
}
