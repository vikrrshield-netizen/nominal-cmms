// src/components/ui/MicButton.tsx
// VIKRR — Asset Shield — Compact mic button for text inputs (Speech-to-Text)

import { useEffect } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { useSpeechToText } from '../../hooks/useSpeechToText';

interface MicButtonProps {
  onTranscript: (text: string) => void;
  className?: string;
}

export default function MicButton({ onTranscript, className = '' }: MicButtonProps) {
  const { isListening, transcript, toggle, supported } = useSpeechToText();

  // Forward transcript to parent when speech ends
  useEffect(() => {
    if (transcript && !isListening) {
      onTranscript(transcript);
    }
  }, [transcript, isListening, onTranscript]);

  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      title={isListening ? 'Zastavit nahrávání' : 'Diktovat hlasem'}
      className={`w-10 h-10 rounded-xl flex items-center justify-center transition active:scale-90 flex-shrink-0 ${
        isListening
          ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/30'
          : 'bg-white/5 border border-white/10 text-slate-500 hover:text-orange-400 hover:border-orange-500/30'
      } ${className}`}
    >
      {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
    </button>
  );
}
