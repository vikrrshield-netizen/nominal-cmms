// src/hooks/useTenantSettings.ts
// Nominal CMMS — Firestore hook for tenant_settings collection

import { useState, useEffect } from 'react';
import { collection, doc, onSnapshot, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { TenantSettings } from '../types/tenant';
import { MODULE_DEFINITIONS } from '../types/user';

const ALL_MODULE_IDS = MODULE_DEFINITIONS.map(m => m.id);

export function useTenantSettings() {
  const [tenants, setTenants] = useState<TenantSettings[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'tenant_settings'),
      (snap) => {
        const docs = snap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name || d.id,
            activeModules: data.activeModules || ALL_MODULE_IDS,
            updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : new Date(),
            updatedByName: data.updatedByName || '',
          } as TenantSettings;
        });

        // If no tenants exist, we'll show a default entry
        if (docs.length === 0) {
          docs.push({
            id: 'main_firm',
            name: 'Nominal s.r.o.',
            activeModules: ALL_MODULE_IDS,
            updatedAt: new Date(),
            updatedByName: '',
          });
        }

        setTenants(docs);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, []);

  const updateModules = async (
    tenantId: string,
    activeModules: string[],
    userName: string,
    tenantName?: string,
  ) => {
    await setDoc(doc(db, 'tenant_settings', tenantId), {
      name: tenantName || tenantId,
      activeModules,
      updatedAt: serverTimestamp(),
      updatedByName: userName,
    }, { merge: true });

    // Also sync to localStorage for offline fallback in DashboardPage
    try {
      const raw = localStorage.getItem('nominal-tenant-modules') || '{}';
      const config = JSON.parse(raw);
      config[tenantId] = activeModules;
      localStorage.setItem('nominal-tenant-modules', JSON.stringify(config));
    } catch { /* ignore */ }
  };

  return { tenants, loading, updateModules };
}
