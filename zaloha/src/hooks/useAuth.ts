const getUserClaims = async () => ({} as any);
const refreshToken = async () => { await (window as any).__fb_auth?.currentUser?.getIdToken(true); };
// src/hooks/useAuth.ts
// NOMINAL CMMS — Autentizace s novou hierarchií

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { User } from 'firebase/auth';
import {
  onAuthChange,
  signInWithPin,
  signOut as firebaseSignOut,
} from '../lib/firebase';
import {
  type UserRole,
  type Permission,
  type RoleFlags,
  type RoleMeta,
  ROLE_PERMISSIONS,
  ROLE_FLAGS,
  ROLE_META,
} from '../types/user';

// Re-export pro zpětnou kompatibilitu
export { ROLE_PERMISSIONS, ROLE_FLAGS, ROLE_META };
export type { UserRole, Permission, RoleFlags, RoleMeta };

// ═══════════════════════════════════════════════════════════════════
// AUTH STATE
// ═══════════════════════════════════════════════════════════════════

interface AuthState {
  user: User | null;
  role: UserRole;
  plantId: string;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
}

// ═══════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════

export const useAuth = () => {
  const [state, setState] = useState<AuthState>({
    user: null,
    role: 'OPERATOR',  // Default = nejnižší práva
    plantId: 'kozlov',
    isLoading: true,
    isAuthenticated: false,
    error: null,
  });

  // ─────────────────────────────────────────────────────────────────
  // AUTH STATE LISTENER
  // ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    const unsubscribe = onAuthChange(async (user: any) => {
      if (user) {
        try {
          const claims = await getUserClaims();
          setState({
            user,
            role: (claims?.role as UserRole) || 'OPERATOR',
            plantId: (claims?.plantId as string) || 'kozlov',
            isLoading: false,
            isAuthenticated: true,
            error: null,
          });
        } catch {
          setState(prev => ({ 
            ...prev, 
            isLoading: false, 
            error: 'Nepodařilo se načíst oprávnění' 
          }));
        }
      } else {
        setState({
          user: null,
          role: 'OPERATOR',
          plantId: 'kozlov',
          isLoading: false,
          isAuthenticated: false,
          error: null,
        });
      }
    });
    return () => unsubscribe();
  }, []);

  // ─────────────────────────────────────────────────────────────────
  // LOGIN
  // ─────────────────────────────────────────────────────────────────

  const login = useCallback(async (pin: string): Promise<boolean> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    // Validace PIN
    if (!/^\d{4}$/.test(pin)) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'PIN musí být 4 číslice',
      }));
      return false;
    }

    try {
      await signInWithPin(pin);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Přihlášení selhalo';
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: message.includes('user-not-found') ? 'Neplatný PIN' : message,
      }));
      return false;
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────
  // LOGOUT
  // ─────────────────────────────────────────────────────────────────

  const logout = useCallback(async () => {
    await firebaseSignOut();
  }, []);

  // ─────────────────────────────────────────────────────────────────
  // PERMISSION CHECKS
  // ─────────────────────────────────────────────────────────────────

  const permissions = useMemo(() => {
    return ROLE_PERMISSIONS[state.role] || [];
  }, [state.role]);

  const hasPermission = useCallback(
    (permission: Permission): boolean => {
      return permissions.includes(permission);
    },
    [permissions]
  );

  const hasAnyPermission = useCallback(
    (perms: Permission[]): boolean => {
      return perms.some(p => permissions.includes(p));
    },
    [permissions]
  );

  const hasAllPermissions = useCallback(
    (perms: Permission[]): boolean => {
      return perms.every(p => permissions.includes(p));
    },
    [permissions]
  );

  // ─────────────────────────────────────────────────────────────────
  // ROLE FLAGS
  // ─────────────────────────────────────────────────────────────────

  const flags = useMemo((): RoleFlags => {
    return ROLE_FLAGS[state.role] || { isReadOnly: false, isKiosk: false };
  }, [state.role]);

  const isReadOnly = flags.isReadOnly;
  const isKiosk = flags.isKiosk;

  // ─────────────────────────────────────────────────────────────────
  // ROLE METADATA
  // ─────────────────────────────────────────────────────────────────

  const roleMeta = useMemo((): RoleMeta => {
    return ROLE_META[state.role];
  }, [state.role]);

  // ─────────────────────────────────────────────────────────────────
  // SPECIAL CHECKS
  // ─────────────────────────────────────────────────────────────────

  // Může měnit týdenní plán? (MAJITEL a OPERATOR nemohou)
  const canModifyWeeklyPlan = useMemo(() => {
    if (isReadOnly || isKiosk) return false;
    return hasPermission('weekly.modify');
  }, [isReadOnly, isKiosk, hasPermission]);

  // Vidí finance?
  const canViewFinancials = useMemo(() => {
    return hasPermission('finance.view');
  }, [hasPermission]);

  // Vidí Schránku důvěry?
  const canViewSecretBox = useMemo(() => {
    return hasPermission('secretbox.view');
  }, [hasPermission]);

  // Může schvalovat nákupy nad 5000 Kč?
  const canApprovePurchases = useMemo(() => {
    return hasPermission('purchase.approve');
  }, [hasPermission]);

  // Může používat AI?
  const canUseAI = useMemo(() => {
    return hasPermission('ai.use');
  }, [hasPermission]);

  // ─────────────────────────────────────────────────────────────────
  // REFRESH TOKEN
  // ─────────────────────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    await refreshToken();
    const claims = await getUserClaims();
    if (claims) {
      setState(prev => ({
        ...prev,
        role: (claims.role as UserRole) || prev.role,
        plantId: (claims.plantId as string) || prev.plantId,
      }));
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────
  // RETURN
  // ─────────────────────────────────────────────────────────────────

  return {
    // State
    ...state,
    
    // Actions
    login,
    logout,
    refresh,
    
    // Permission checks
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    
    // Flags
    isReadOnly,
    isKiosk,
    
    // Metadata
    roleMeta,
    
    // Special checks
    canModifyWeeklyPlan,
    canViewFinancials,
    canViewSecretBox,
    canApprovePurchases,
    canUseAI,
  };
};
