// src/components/AppShell.tsx
// VIKRR — společný rám: na PC boční lišta vlevo, na mobilu beze změny (navigace přes dlaždice).
// Jen UI/navigace (react-router odkazy). Nemění auth/logiku/data.

import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, ClipboardList, Building2, ClipboardCheck, Cog,
  Package, ShieldCheck, Calendar, BarChart3, Settings, LogOut,
} from 'lucide-react';
import { useAuthContext } from '../context/AuthContext';
import BrandMark from './ui/BrandMark';
import BottomNav from './BottomNav';

const NAV: { path: string; icon: typeof LayoutDashboard; label: string; permissions: string[] }[] = [
  { path: '/', icon: LayoutDashboard, label: 'Přehled', permissions: [] },
  { path: '/tasks', icon: ClipboardList, label: 'Úkoly', permissions: ['wo.read', 'wo.create', 'wo.update'] },
  { path: '/kartoteka', icon: Building2, label: 'Kartotéka', permissions: ['asset.read'] },
  { path: '/inspections', icon: ClipboardCheck, label: 'Kontroly', permissions: ['asset.read', 'weekly.modify'] },
  { path: '/gearboxes', icon: Cog, label: 'Převodovky', permissions: ['gearbox.temperature.write', 'gearbox.manage', 'asset.update', 'asset.read'] },
  { path: '/inventory', icon: Package, label: 'Sklad ND', permissions: ['inv.consume', 'inv.restock', 'inv.manage', 'inv.order', 'report.read'] },
  { path: '/revisions', icon: ShieldCheck, label: 'Revize', permissions: ['asset.read'] },
  { path: '/calendar', icon: Calendar, label: 'Kalendář', permissions: ['wo.read', 'schedule.manage'] },
  { path: '/reports', icon: BarChart3, label: 'Reporty', permissions: ['report.read', 'audit.read'] },
  { path: '/admin', icon: Settings, label: 'Správa', permissions: ['admin.view', 'admin.manage', 'user.manage'] },
];

function Sidebar() {
  const location = useLocation();
  const { hasPermission, logout } = useAuthContext();
  const canAny = (perms: string[]) => perms.length === 0 || perms.some((p) => hasPermission(p));
  const items = NAV.filter((n) => canAny(n.permissions));

  return (
    <aside className="hidden md:flex flex-col w-60 flex-shrink-0 bg-white border-r border-slate-200 h-screen sticky top-0 px-3 py-5">
      <div className="px-2 pb-5">
        <Link to="/" aria-label="Přehled"><BrandMark size="sm" tone="dark" /></Link>
      </div>
      <nav className="flex flex-col gap-1 overflow-y-auto flex-1 -mr-1 pr-1">
        {items.map(({ path, icon: Icon, label }) => {
          const isActive = path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);
          return (
            <Link
              key={path}
              to={path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] font-semibold transition ${
                isActive ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Icon size={18} strokeWidth={isActive ? 2.2 : 1.9} />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </nav>
      <button
        onClick={() => logout()}
        className="mt-2 flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] font-semibold text-slate-500 hover:bg-slate-50 transition"
      >
        <LogOut size={18} strokeWidth={1.9} />
        <span>Odhlásit</span>
      </button>
    </aside>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="md:flex min-h-screen bg-[#f1ece3]">
      <Sidebar />
      <div className="flex-1 min-w-0 pb-16 md:pb-0">{children}</div>
      {/* Spodní menu jen na mobilu (na PC je boční lišta) */}
      <BottomNav />
    </div>
  );
}
