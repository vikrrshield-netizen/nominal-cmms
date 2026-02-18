// src/context/AuthContext.tsx
// VIKRR — Asset Shield — AuthContext s dynamickým RBAC
// Zpětně kompatibilní: stávající stránky fungují beze změny

import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { doc, getDoc, collection, onSnapshot } from 'firebase/firestore';
import { db, signInWithPin, signOut, onAuthChange } from '../lib/firebase';
import { ROLE_META, ROLE_PERMISSIONS, type UserRole, type RoleMeta, type Permission } from '../types/user';
import type { Role, UserScope, CustomPermissions } from '../types/rbac';
import { computeEffectivePermissions, canAccessBuilding, canAccessArea } from '../types/rbac';

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════

interface User {
  id: string;
  uid: string;
  displayName: string;
  role: UserRole; // zachováno pro zpětnou kompatibilitu
  pin: string;
  color?: string;

  // RBAC (nové)
  roleIds: string[];
  primaryRoleId: string;
  customPermissions: CustomPermissions;
  scope: UserScope;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isKiosk: boolean;
  isReadOnly: boolean;
  roleMeta: RoleMeta | null;
  canViewSecretBox: boolean;
  login: (pin: string) => Promise<boolean>;
  logout: () => void;

  // Permission checks (dynamické RBAC)
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  hasAllPermissions: (permissions: string[]) => boolean;

  // Scope checks
  canSeeBuilding: (buildingId: string) => boolean;
  canSeeArea: (areaId: string) => boolean;

  // RBAC data (pro admin UI)
  permissions: string[];
  allRoles: Role[];
  userRoles: Role[];
}

// ═══════════════════════════════════════════
// DEFAULT VALUES
// ═══════════════════════════════════════════

const DEFAULT_SCOPE: UserScope = { buildings: ['*'], areas: ['*'] };
const DEFAULT_CUSTOM: CustomPermissions = { granted: [], revoked: [] };

// ═══════════════════════════════════════════
// CONTEXT
// ═══════════════════════════════════════════

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [allRoles, setAllRoles] = useState<Role[]>([]);

  // ─────────────────────────────────────────
  // Load all roles (realtime)
  // ─────────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'roles'),
      (snap) => {
        setAllRoles(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() } as Role))
            .filter((r) => !r.isDeleted)
        );
      },
      (err) => console.error('[Auth] Roles error:', err)
    );
    return () => unsub();
  }, []);

  // ─────────────────────────────────────────
  // Auth state listener
  // ─────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = onAuthChange(async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            setUser({
              id: firebaseUser.uid,
              uid: firebaseUser.uid,
              displayName: data.displayName || 'Neznámý',
              role: data.role as UserRole, // zpětná kompatibilita
              pin: data.pin || '',
              color: data.color,

              // RBAC fields (s fallbackem)
              roleIds: data.roleIds || [],
              primaryRoleId: data.primaryRoleId || '',
              customPermissions: data.customPermissions || DEFAULT_CUSTOM,
              scope: data.scope || DEFAULT_SCOPE,
            });
          } else {
            setUser({
              id: firebaseUser.uid,
              uid: firebaseUser.uid,
              displayName: firebaseUser.email || 'Neznámý',
              role: 'OPERATOR',
              pin: '',
              roleIds: ['role_operator'],
              primaryRoleId: 'role_operator',
              customPermissions: DEFAULT_CUSTOM,
              scope: { buildings: ['D'], areas: ['*'] },
            });
          }
        } catch (err) {
          console.error('[Auth] User doc error:', err);
          setUser({
            id: firebaseUser.uid,
            uid: firebaseUser.uid,
            displayName: firebaseUser.email || 'Neznámý',
            role: 'OPERATOR',
            pin: '',
            roleIds: ['role_operator'],
            primaryRoleId: 'role_operator',
            customPermissions: DEFAULT_CUSTOM,
            scope: { buildings: ['D'], areas: ['*'] },
          });
        }
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // ─────────────────────────────────────────
  // Efektivní oprávnění (dynamicky z rolí)
  // ─────────────────────────────────────────
  const permissions = useMemo(() => {
    if (!user || !user.roleIds.length || !allRoles.length) return [];
    return computeEffectivePermissions(user.roleIds, allRoles, user.customPermissions);
  }, [user, allRoles]);

  const userRoles = useMemo(() => {
    if (!user) return [];
    return allRoles.filter((r) => user.roleIds.includes(r.id));
  }, [user, allRoles]);

  // ─────────────────────────────────────────
  // Permission checks
  // ─────────────────────────────────────────
  const hasPermission = useCallback(
    (perm: string): boolean => {
      if (!user) return false;
      // Check dynamic RBAC first
      if (permissions.includes(perm)) return true;
      // Always also check legacy hardcoded role (belt + suspenders)
      const legacyPerms = ROLE_PERMISSIONS[user.role];
      if (legacyPerms?.includes(perm as Permission)) return true;
      return false;
    },
    [user, permissions]
  );

  const hasAnyPermission = useCallback(
    (perms: string[]) => perms.some((p) => permissions.includes(p)),
    [permissions]
  );

  const hasAllPermissions = useCallback(
    (perms: string[]) => perms.every((p) => permissions.includes(p)),
    [permissions]
  );

  // ─────────────────────────────────────────
  // Scope checks
  // ─────────────────────────────────────────
  const canSeeBuilding = useCallback(
    (buildingId: string) => {
      if (!user) return false;
      return canAccessBuilding(user.scope, buildingId);
    },
    [user]
  );

  const canSeeArea = useCallback(
    (areaId: string) => {
      if (!user) return false;
      return canAccessArea(user.scope, areaId);
    },
    [user]
  );

  // ─────────────────────────────────────────
  // Login / Logout
  // ─────────────────────────────────────────
  const login = async (pin: string): Promise<boolean> => {
    try {
      await signInWithPin(pin);
      return true;
    } catch (err: unknown) {
      console.error('Login failed:', (err as { code?: string })?.code);
      return false;
    }
  };

  const logout = async () => {
    try {
      await signOut();
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  // ─────────────────────────────────────────
  // Zpětně kompatibilní properties
  // ─────────────────────────────────────────
  const roleMeta = user ? ROLE_META[user.role] : null;
  const isKiosk = user?.role === 'OPERATOR';
  const isReadOnly = user?.role === 'MAJITEL';
  const canViewSecretBox = hasPermission('trustbox.read');

  // ─────────────────────────────────────────
  // Provider
  // ─────────────────────────────────────────
  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        isKiosk,
        isReadOnly,
        roleMeta,
        canViewSecretBox,
        login,
        logout,

        // RBAC
        hasPermission,
        hasAnyPermission,
        hasAllPermissions,
        canSeeBuilding,
        canSeeArea,
        permissions,
        allRoles,
        userRoles,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuthContext must be used within AuthProvider');
  return context;
}
