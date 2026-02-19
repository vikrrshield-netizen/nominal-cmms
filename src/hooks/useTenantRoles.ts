// src/hooks/useTenantRoles.ts
// Nominal CMMS — Firestore hook for tenant_roles collection

import { useState, useEffect } from 'react';
import {
  collection, doc, query, where, onSnapshot,
  addDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { TenantRole } from '../types/tenant';

export function useTenantRoles(tenantId: string) {
  const [roles, setRoles] = useState<TenantRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) { setLoading(false); return; }
    const q = query(collection(db, 'tenant_roles'), where('tenantId', '==', tenantId));
    const unsub = onSnapshot(q, (snap) => {
      setRoles(
        snap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            tenantId: data.tenantId,
            roleName: data.roleName || '',
            description: data.description || '',
            permissions: data.permissions || {},
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
            updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : new Date(),
            createdByName: data.createdByName || '',
          } as TenantRole;
        }).sort((a, b) => a.roleName.localeCompare(b.roleName, 'cs'))
      );
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [tenantId]);

  const createRole = async (role: Omit<TenantRole, 'id' | 'createdAt' | 'updatedAt'>) => {
    await addDoc(collection(db, 'tenant_roles'), {
      ...role,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  };

  const updateRole = async (roleId: string, updates: Partial<TenantRole>) => {
    await updateDoc(doc(db, 'tenant_roles', roleId), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  };

  const removeRole = async (roleId: string) => {
    await deleteDoc(doc(db, 'tenant_roles', roleId));
  };

  return { roles, loading, createRole, updateRole, removeRole };
}
