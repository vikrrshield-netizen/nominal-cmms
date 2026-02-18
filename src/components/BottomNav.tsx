// src/components/BottomNav.tsx
// VIKRR — Asset Shield — Bottom Navigation (Dark Glassmorphism)

import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  ClipboardList,
  Map,
  Truck,
  Search,
} from 'lucide-react';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Přehled' },
  { path: '/tasks', icon: ClipboardList, label: 'Úkoly' },
  { path: '/map', icon: Map, label: 'Mapa' },
  { path: '/fleet', icon: Truck, label: 'Vozidla' },
  { path: '/ai', icon: Search, label: 'Hledat' },
];

export default function BottomNav() {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-slate-900/90 backdrop-blur-xl border-t border-white/10 px-2 py-2 flex justify-around items-center z-50">
      {navItems.map((item) => {
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
                ? 'text-orange-400'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <div className={`p-1.5 rounded-lg transition-all ${
              isActive ? 'bg-orange-500/15' : ''
            }`}>
              <Icon size={20} strokeWidth={isActive ? 2.5 : 1.8} />
            </div>
            <span className={`text-[10px] mt-0.5 font-medium ${
              isActive ? 'text-orange-400' : ''
            }`}>
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
