// src/components/StrojeLinkyTabs.tsx
// VIKRR — přepínač mezi „Přehled strojů" (/stroje) a „Výrobní linky" (/linky).

import { Link } from 'react-router-dom';

export default function StrojeLinkyTabs({ active }: { active: 'stroje' | 'linky' }) {
  const base = 'px-4 py-2 rounded-xl text-[13px] font-bold transition';
  const on = 'bg-emerald-600 text-white';
  const off = 'bg-white border border-[#e2d8c9] text-slate-600 hover:bg-slate-50';
  return (
    <div className="flex gap-2 mb-5">
      <Link to="/stroje" className={`${base} ${active === 'stroje' ? on : off}`}>Přehled strojů</Link>
      <Link to="/linky" className={`${base} ${active === 'linky' ? on : off}`}>Výrobní linky</Link>
    </div>
  );
}
