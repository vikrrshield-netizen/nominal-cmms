// src/components/StrojeLinkyTabs.tsx
// VIKRR — přepínač mezi „Přehled strojů" (/stroje), „Výrobní linky" (/linky) a „Mapa areálu" (/mapa).

import { Link } from 'react-router-dom';

const TABS: { key: 'stroje' | 'linky' | 'mapa'; to: string; label: string }[] = [
  { key: 'stroje', to: '/stroje', label: 'Přehled strojů' },
  { key: 'linky', to: '/linky', label: 'Výrobní linky' },
  { key: 'mapa', to: '/mapa', label: 'Mapa areálu' },
];

export default function StrojeLinkyTabs({ active }: { active: 'stroje' | 'linky' | 'mapa' }) {
  const base = 'px-4 py-2 rounded-xl text-[13px] font-bold transition';
  const on = 'bg-emerald-600 text-white';
  const off = 'bg-white border border-[#e2d8c9] text-slate-600 hover:bg-slate-50';
  return (
    <div className="flex flex-wrap gap-2 mb-5">
      {TABS.map((t) => (
        <Link key={t.key} to={t.to} className={`${base} ${active === t.key ? on : off}`}>{t.label}</Link>
      ))}
    </div>
  );
}
