// src/components/BottomNav.tsx
// VIKRR — Asset Shield — Bottom Navigation (Dark Glassmorphism)

import { Link, useLocation } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import {
  LayoutDashboard,
  ClipboardList,
  Building2,
  FileText,
  Truck,
} from 'lucide-react';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Přehled', permissions: [] },
  { path: '/tasks', icon: ClipboardList, label: 'Úkoly', permissions: ['wo.read', 'wo.create', 'wo.update'] },
  { path: '/work-diary', icon: FileText, label: 'Deník', permissions: ['wo.read', 'wo.create', 'wo.update'] },
  { path: '/kartoteka', icon: Building2, label: 'Kartotéka', permissions: ['asset.read'] },
  { path: '/vzv', icon: Truck, label: 'VZV', permissions: ['fleet.read', 'fleet.manage'] },
];

export default function BottomNav() {
  const location = useLocation();
  const { hasPermission } = useAuthContext();
  const visibleItems = navItems.filter((item) => (
    item.permissions.length === 0 || item.permissions.some((permission) => hasPermission(permission))
  ));

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-2 py-2 flex justify-around items-center z-50" style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}>
      {visibleItems.map((item) => {
        const Icon = item.icon;
        const isActive = item.path === '/'
          ? location.pathname === '/'
          : location.pathname.startsWith(item.path);

        return (
          <Link
            key={item.path}
            to={item.path}
            className={`flex flex-col items-center px-3 py-1.5 rounded-xl transition-all min-w-[56px] ${
              isActive
                ? 'text-emerald-700'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <div className={`p-1.5 rounded-lg transition-all ${
              isActive ? 'bg-emerald-50' : ''
            }`}>
              <Icon size={20} strokeWidth={isActive ? 2.5 : 1.8} />
            </div>
            <span className={`text-[10px] mt-0.5 font-medium ${
              isActive ? 'text-emerald-700' : ''
            }`}>
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
