// src/components/help/HowToSheet.tsx
// VIKRR — Asset Shield — Panel „Jak na to" (návod krok za krokem) v BottomSheetu.

import { Fragment } from 'react';
import BottomSheet from '../ui/BottomSheet';
import type { Guide } from '../../data/guides';

// Zvýrazní text mezi **...** tučně (bez HTML injekce).
function renderText(text: string) {
  return text.split('**').map((part, i) =>
    i % 2 === 1
      ? <strong key={i} className="font-bold text-slate-900">{part}</strong>
      : <Fragment key={i}>{part}</Fragment>,
  );
}

export default function HowToSheet({ guide, onClose }: { guide: Guide; onClose: () => void }) {
  return (
    <BottomSheet title={`Jak na to: ${guide.title}`} isOpen onClose={onClose}>
      <div className="space-y-3 p-1">
        {guide.steps.map((step, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-black text-white">{i + 1}</div>
            <div className="pt-0.5 text-[14px] leading-relaxed text-slate-700">{renderText(step)}</div>
          </div>
        ))}
        <button type="button" onClick={onClose} className="mt-2 w-full rounded-xl bg-emerald-600 py-2.5 font-bold text-white">Rozumím 👍</button>
      </div>
    </BottomSheet>
  );
}
