// src/pages/GuidesPage.tsx
// VIKRR — Asset Shield — „Návody" (hub). Seznam jednoduchých návodů krok za krokem.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, HelpCircle, ChevronRight } from 'lucide-react';
import { GUIDES, type Guide } from '../data/guides';
import HowToSheet from '../components/help/HowToSheet';

export default function GuidesPage() {
  const navigate = useNavigate();
  const [active, setActive] = useState<Guide | null>(null);

  return (
    <div className="px-4 py-6 md:px-8 max-w-3xl mx-auto pb-24">
      <div className="flex items-center gap-3 mb-5">
        <button type="button" onClick={() => navigate(-1)} className="min-h-11 min-w-11 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-slate-700">
          <ArrowLeft size={20} />
        </button>
        <HelpCircle className="text-emerald-700 flex-shrink-0" size={24} />
        <div className="min-w-0">
          <h1 className="text-xl font-black text-slate-900">Návody</h1>
          <p className="text-[13px] text-slate-500">Jak na to, krok za krokem. Jednoduše.</p>
        </div>
      </div>

      <div className="space-y-2">
        {GUIDES.map((g, i) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setActive(g)}
            className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left hover:border-emerald-400 hover:bg-emerald-50 transition"
          >
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-sm font-black text-emerald-700">{i + 1}</span>
            <span className="flex-1 min-w-0 text-[15px] font-bold text-slate-900">{g.title}</span>
            <ChevronRight size={18} className="flex-shrink-0 text-slate-400" />
          </button>
        ))}
      </div>

      <p className="mt-5 text-[12px] text-slate-400">Chybí ti tu nějaký návod? Řekni a doplníme.</p>

      {active && <HowToSheet guide={active} onClose={() => setActive(null)} />}
    </div>
  );
}
