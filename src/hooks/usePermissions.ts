// src/hooks/usePermissions.ts
// VIKRR — Asset Shield — Dynamický RBAC hook
// Čte role z Firestore, počítá efektivní oprávnění uživatele

import { useState, useEffect, useCallback, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Role, UserScope, CustomPermissions } from '../types/rbac';
import { computeEffectivePermissions, canAccessBuilding, canAccessArea } from '../types/rbac';

interface UsePermissionsInput {
  roleIds: string[];
  customPermissions: CustomPermissions;
  scope: UserScope;
}

interface UsePermissionsReturn {
  /** Má uživatel konkrétní oprávnění? */
  hasPermission: (perm: string) => boolean;

  /** Má uživatel ALESPOŇ JEDNO z oprávnění? */
  hasAnyPermission: (perms: string[]) => boolean;

  /** Má uživatel VŠECHNA oprávnění? */
  hasAllPermissions: (perms: string[]) => boolean;

  /** Vidí uživatel danou budovu? */
  canSeeBuilding: (buildingId: string) => boolean;

  /** Vidí uživatel danou oblast? */
  canSeeArea: (areaId: string) => boolean;

  /** Seznam všech efektivních oprávnění */
  permissions: string[];

  /** Všechny role v systému (pro admin UI) */
  allRoles: Role[];

  /** Role tohoto uživatele */
  userRoles: Role[];

  /** Loading stav */
  loading: boolean;
}

export function usePermissions(input: UsePermissionsInput): UsePermissionsReturn {
  const [allRoles, setAllRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  // Realtime listener na roles kolekci
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'roles'),
      (snap) => {
        const roles = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Role))
          .filter((r) => !r.isDeleted);
        setAllRoles(roles);
        setLoading(false);
      },
      (err) => {
        console.error('[usePermissions] Roles load error:', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // Efektivní oprávnění
  const permissions = useMemo(() => {
    if (!input.roleIds.length || !allRoles.length) return [];
    return computeEffectivePermissions(input.roleIds, allRoles, input.customPermissions);
  }, [input.roleIds, allRoles, input.customPermissions]);

  // Role tohoto uživatele
  const userRoles = useMemo(() => {
    return allRoles.filter((r) => input.roleIds.includes(r.id));
  }, [allRoles, input.roleIds]);

  // Permission checks
  const hasPermission = useCallback(
    (perm: string) => permissions.includes(perm),
    [permissions]
  );

  const hasAnyPermission = useCallback(
    (perms: string[]) => perms.some((p) => permissions.includes(p)),
    [permissions]
  );

  const hasAllPermissions = useCallback(
    (perms: string[]) => perms.every((p) => permissions.includes(p)),
    [permissions]
  );

  // Scope checks
  const canSeeBuilding = useCallback(
    (buildingId: string) => canAccessBuilding(input.scope, buildingId),
    [input.scope]
  );

  const canSeeArea = useCallback(
    (areaId: string) => canAccessArea(input.scope, areaId),
    [input.scope]
  );

  return {
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    canSeeBuilding,
    canSeeArea,
    permissions,
    allRoles,
    userRoles,
    loading,
  };
}
