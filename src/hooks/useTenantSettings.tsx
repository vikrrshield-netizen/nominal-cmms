// src/hooks/useTenantSettings.tsx
// Nominal CMMS — sdílený kontext pro kolekci tenant_settings.
// Jeden onSnapshot listener pro celou appku (provider na rootu), všichni
// konzumenti čtou ze sdíleného kontextu — žádné duplicitní listenery.

import { useState, useEffect, useMemo, createContext, useContext, type ReactNode } from 'react';
import { collection, doc, onSnapshot, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { TenantSettings, TenantModuleConfig } from '../types/tenant';
import { MODULE_DEFINITIONS } from '../types/user';
import appConfig from '../appConfig';

const ALL_MODULE_IDS = MODULE_DEFINITIONS.map(m => m.id);

// ── Write funkce (nezávislé na stavu, jen setDoc) ───────────────────

async function updateModules(
  tenantId: string,
  activeModules: string[],
  userName: string,
  tenantName?: string,
) {
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
}

async function updateBrand(
  tenantId: string,
  brand: { name?: string; appName?: string; logoUrl?: string; logoLetter?: string },
  userName: string,
) {
  await setDoc(doc(db, 'tenant_settings', tenantId), {
    ...brand,
    updatedAt: serverTimestamp(),
    updatedByName: userName,
  }, { merge: true });
}

// Uloží per-modulovou konfiguraci. Díky merge:true se vnořené mapy
// (moduleConfig.warehouse, .shifts, …) hloubkově prolnou, ostatní klíče
// zůstanou zachované.
async function updateModuleConfig(
  tenantId: string,
  patch: TenantModuleConfig,
  userName: string,
  tenantName?: string,
) {
  await setDoc(doc(db, 'tenant_settings', tenantId), {
    name: tenantName || tenantId,
    moduleConfig: patch,
    updatedAt: serverTimestamp(),
    updatedByName: userName,
  }, { merge: true });
}

// ── Kontext ─────────────────────────────────────────────────────────

interface TenantSettingsValue {
  tenants: TenantSettings[];
  loading: boolean;
  updateModules: typeof updateModules;
  updateBrand: typeof updateBrand;
  updateModuleConfig: typeof updateModuleConfig;
}

const TenantSettingsContext = createContext<TenantSettingsValue | null>(null);

export function TenantSettingsProvider({ children }: { children: ReactNode }) {
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
            appName: data.appName || '',
            logoUrl: data.logoUrl || '',
            logoLetter: data.logoLetter || '',
            activeModules: data.activeModules || ALL_MODULE_IDS,
            moduleConfig: data.moduleConfig || {},
            updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : new Date(),
            updatedByName: data.updatedByName || '',
          } as TenantSettings;
        });

        // If no tenants exist, we'll show a default entry
        if (docs.length === 0) {
          docs.push({
            id: 'main_firm',
            name: appConfig.COMPANY_NAME,
            appName: appConfig.PRODUCT_NAME,
            logoUrl: appConfig.LOGO_URL,
            logoLetter: appConfig.LOGO_LETTER,
            activeModules: ALL_MODULE_IDS,
            moduleConfig: {},
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

  const value = useMemo<TenantSettingsValue>(
    () => ({ tenants, loading, updateModules, updateBrand, updateModuleConfig }),
    [tenants, loading],
  );

  return <TenantSettingsContext.Provider value={value}>{children}</TenantSettingsContext.Provider>;
}

export function useTenantSettings(): TenantSettingsValue {
  const ctx = useContext(TenantSettingsContext);
  if (!ctx) {
    throw new Error('useTenantSettings musí být použit uvnitř <TenantSettingsProvider>.');
  }
  return ctx;
}
