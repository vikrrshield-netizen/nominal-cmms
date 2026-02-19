// src/hooks/useDashboardConfig.ts
// VIKRR — Asset Shield — Dashboard config hook
// Reads from Firestore → localStorage fallback → role defaults

import { useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { UserRole } from '../types/user';
import type { WidgetInstance } from '../types/dashboard';
import { getDefaultConfig, WIDGET_DEFINITIONS } from '../config/widgetRegistry';

const LS_KEY = 'vikrr-dash-v1';
const COLLECTION = 'dashboard_configs';

interface UseDashboardConfigResult {
  widgets: WidgetInstance[];
  loading: boolean;
  updateWidgets: (widgets: WidgetInstance[]) => void;
  resetToDefaults: () => void;
}

// ═══════════════════════════════════════════════════════
// LEGACY MIGRATION — old localStorage format → WidgetInstance[]
// ═══════════════════════════════════════════════════════

interface LegacyConfig {
  tileOrder: string[];
  hiddenTiles: string[];
}

function migrateLegacy(legacy: LegacyConfig): WidgetInstance[] {
  const allIds = new Set(WIDGET_DEFINITIONS.map(d => d.id));
  const visible = legacy.tileOrder.filter(id => allIds.has(id) && !legacy.hiddenTiles.includes(id));
  const hidden = legacy.hiddenTiles.filter(id => allIds.has(id));
  const mentioned = new Set([...visible, ...hidden]);
  const missing = WIDGET_DEFINITIONS.map(d => d.id).filter(id => !mentioned.has(id));

  const instances: WidgetInstance[] = [];
  let pos = 0;

  for (const id of visible) {
    const def = WIDGET_DEFINITIONS.find(d => d.id === id);
    instances.push({ widgetId: id, position: pos++, visible: true, collapsed: false, size: def?.defaultSize ?? '1x1' });
  }
  for (const id of [...hidden, ...missing]) {
    const def = WIDGET_DEFINITIONS.find(d => d.id === id);
    instances.push({ widgetId: id, position: pos++, visible: false, collapsed: false, size: def?.defaultSize ?? '1x1' });
  }
  return instances;
}

function loadFromLocalStorage(): WidgetInstance[] | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);

    // New format (array of WidgetInstance)
    if (Array.isArray(parsed) && parsed[0]?.widgetId) {
      return parsed as WidgetInstance[];
    }

    // Legacy format ({ tileOrder, hiddenTiles })
    if (parsed?.tileOrder) {
      return migrateLegacy(parsed as LegacyConfig);
    }
  } catch { /* ignore */ }
  return null;
}

function saveToLocalStorage(widgets: WidgetInstance[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(widgets));
  } catch { /* ignore */ }
}

// ═══════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════

export function useDashboardConfig(userId: string | undefined, role: UserRole): UseDashboardConfigResult {
  const [widgets, setWidgets] = useState<WidgetInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  // Subscribe to Firestore doc
  useEffect(() => {
    if (!userId) {
      setWidgets(getDefaultConfig(role));
      setLoading(false);
      return;
    }

    const docRef = doc(db, COLLECTION, userId);
    const unsub = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (Array.isArray(data.widgets) && data.widgets.length > 0) {
            // Ensure any new widgets defined in registry are included
            const existingIds = new Set(data.widgets.map((w: WidgetInstance) => w.widgetId));
            const allDefs = WIDGET_DEFINITIONS.map(d => d.id);
            const missing = allDefs.filter(id => !existingIds.has(id));
            let maxPos = Math.max(...data.widgets.map((w: WidgetInstance) => w.position), 0);
            const extras: WidgetInstance[] = missing.map(id => {
              const def = WIDGET_DEFINITIONS.find(d => d.id === id);
              return { widgetId: id, position: ++maxPos, visible: false, collapsed: false, size: def?.defaultSize ?? '1x1' };
            });
            setWidgets([...data.widgets, ...extras]);
            saveToLocalStorage([...data.widgets, ...extras]);
            setLoading(false);
            setInitialized(true);
            return;
          }
        }

        // Firestore empty — try localStorage
        if (!initialized) {
          const local = loadFromLocalStorage();
          if (local && local.length > 0) {
            setWidgets(local);
            // Migrate to Firestore (fire-and-forget)
            setDoc(docRef, { userId, widgets: local, updatedAt: serverTimestamp() }).catch(() => {});
          } else {
            const defaults = getDefaultConfig(role);
            setWidgets(defaults);
            saveToLocalStorage(defaults);
          }
        }
        setLoading(false);
        setInitialized(true);
      },
      () => {
        // Firestore error (offline?) — use localStorage or defaults
        const local = loadFromLocalStorage();
        setWidgets(local && local.length > 0 ? local : getDefaultConfig(role));
        setLoading(false);
        setInitialized(true);
      }
    );

    return () => unsub();
  }, [userId, role, initialized]);

  // Persist changes to both Firestore and localStorage
  const updateWidgets = useCallback((newWidgets: WidgetInstance[]) => {
    setWidgets(newWidgets);
    saveToLocalStorage(newWidgets);
    if (userId) {
      const docRef = doc(db, COLLECTION, userId);
      setDoc(docRef, { userId, widgets: newWidgets, updatedAt: serverTimestamp() }).catch((err) => {
        console.error('[DashConfig] Firestore write failed:', err);
      });
    }
  }, [userId]);

  const resetToDefaults = useCallback(() => {
    const defaults = getDefaultConfig(role);
    updateWidgets(defaults);
  }, [role, updateWidgets]);

  return { widgets, loading, updateWidgets, resetToDefaults };
}
