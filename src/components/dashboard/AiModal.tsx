// src/components/dashboard/AiModal.tsx
// VIKRR — Asset Shield — AI Assistant placeholder modal

import { useState } from 'react';
import { Sparkles, Send } from 'lucide-react';
import BottomSheet from '../ui/BottomSheet';
import appConfig from '../../appConfig';

interface AiModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AiModal({ isOpen, onClose }: AiModalProps) {
  const [query, setQuery] = useState('');

  return (
    <BottomSheet title={`${appConfig.APP_NAME_SHORT} AI`} isOpen={isOpen} onClose={onClose}>
      <div className="flex items-center gap-3 p-4 mb-4 bg-gradient-to-r from-pink-500/10 to-purple-500/10 border border-pink-500/20 rounded-2xl">
        <Sparkles className="w-6 h-6 text-pink-400 flex-shrink-0" />
        <div>
          <div className="text-sm font-semibold text-white">AI Asistent údržby</div>
          <div className="text-xs text-slate-400 mt-0.5">Zeptej se na cokoliv — historii oprav, doporučení, analýzu poruch...</div>
        </div>
      </div>
      <div className="relative mb-4">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Na co se chceš zeptat? Např. Kolikrát se rozbil balicí stroj letos?"
          rows={3}
          className="w-full px-4 py-3 pr-12 rounded-xl bg-white/5 border border-white/10 text-white text-[15px] placeholder-slate-600 focus:outline-none focus:border-pink-500/50 transition resize-none min-h-[48px]"
        />
        <button
          disabled={!query.trim()}
          className="absolute right-3 bottom-3 w-8 h-8 rounded-lg bg-gradient-to-r from-pink-500 to-purple-600 flex items-center justify-center text-white disabled:opacity-30 transition hover:opacity-90"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 text-center">
        <Sparkles className="w-8 h-8 text-slate-600 mx-auto mb-2" />
        <div className="text-sm text-slate-500 font-medium">Připravujeme</div>
        <div className="text-xs text-slate-600 mt-1">AI analýza bude dostupná v další verzi</div>
      </div>
    </BottomSheet>
  );
}
