import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  ClipboardList, 
  Truck, 
  Package, 
  Building2 // <-- NOVÁ IKONA
} from 'lucide-react';

const BottomNav = () => {
  const location = useLocation();

  const navItems = [
    { path: '/', icon: LayoutDashboard, label: 'Pøehled' },
    { path: '/tasks', icon: ClipboardList, label: 'Úkoly' },
    { path: '/facilities', icon: Building2, label: 'Budovy' }, // <-- NOVÝ ODKAZ
    { path: '/fleet', icon: Truck, label: 'Vozidla' },
    { path: '/inventory', icon: Package, label: 'Sklad' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-2 py-2 flex justify-around items-center z-50">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = location.pathname === item.path;

        return (
          <Link
            key={item.path}
            to={item.path}
            className={`flex flex-col items-center p-2 rounded-lg transition-colors ${
              isActive ? 'text-blue-600' : 'text-slate-500 hover:text-blue-500'
            }`}
          >
            <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
            <span className="text-[10px] mt-1 font-medium">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
};

export default BottomNav;
