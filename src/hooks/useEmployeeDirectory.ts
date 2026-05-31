import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface EmployeeDirectoryUser {
  id: string;
  displayName: string;
  role: string;
  tenantId?: string;
}

export const MAINTENANCE_EMPLOYEE_ROLES = ['UDRZBA', 'SKLADNIK', 'SUPERADMIN'];

export function normalizeEmployeeName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function nameScore(name: string) {
  let score = name.length;
  if (/[Á-ž]/.test(name)) score += 20;
  if (name.trim().split(/\s+/).length > 1) score += 10;
  return score;
}

function uniqueEmployees(users: EmployeeDirectoryUser[]) {
  const byName = new Map<string, EmployeeDirectoryUser>();
  for (const user of users) {
    const key = normalizeEmployeeName(user.displayName);
    if (!key) continue;
    const existing = byName.get(key);
    if (!existing || nameScore(user.displayName) > nameScore(existing.displayName)) {
      byName.set(key, user);
    }
  }
  return [...byName.values()].sort((a, b) => a.displayName.localeCompare(b.displayName, 'cs-CZ'));
}

export function useEmployeeDirectory(options: { tenantId?: string; roles?: string[] } = {}) {
  const { tenantId, roles } = options;
  const [users, setUsers] = useState<EmployeeDirectoryUser[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        const loaded = snap.docs
          .map((docSnap) => {
            const data = docSnap.data();
            return {
              id: docSnap.id,
              displayName: String(data.displayName || '').trim(),
              role: String(data.role || ''),
              tenantId: data.tenantId ? String(data.tenantId) : undefined,
              active: data.active !== false && data.isActive !== false,
            };
          })
          .filter((item) => item.active && item.displayName)
          .filter((item) => !tenantId || !item.tenantId || item.tenantId === tenantId)
          .map(({ active: _active, ...item }) => item);

        setUsers(uniqueEmployees(loaded));
      },
      (err) => {
        console.error('[useEmployeeDirectory] users error:', err);
        setUsers([]);
      }
    );
    return () => unsub();
  }, [tenantId]);

  return useMemo(() => {
    if (!roles?.length) return users;
    return users.filter((user) => roles.includes(user.role));
  }, [roles, users]);
}

export function useEmployeeNames(options: { tenantId?: string; roles?: string[] } = {}) {
  return useEmployeeDirectory(options).map((user) => user.displayName);
}
