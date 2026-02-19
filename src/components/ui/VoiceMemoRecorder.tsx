// src/components/ui/VoiceMemoRecorder.tsx
// VIKRR — Asset Shield — Voice memo recorder with Firebase Storage upload

import { Mic, Square, Loader2, Play, Trash2 } from 'lucide-react';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import { useRef } from 'react';

interface VoiceMemoRecorderProps {
  userId: string;
  onUpload: (url: string) => void;
  label?: string;
}

export default function VoiceMemoRecorder({ userId, onUpload, label = 'Hlasová zpráva' }: VoiceMemoRecorderProps) {
  const { isRecording, duration, audioUrl, uploading, error, start, stop, reset } = useVoiceRecorder(userId);
  const audioRef = useRef<HTMLAudioElement>(null);

  const fmtTime = (s: number) => `${String(Math.floor(s / 60)).padStart(1, '0')}:${String(s % 60).padStart(2, '0')}`;

  // Forward URL to parent when upload completes
  if (audioUrl) {
    // Only call once per URL
    onUpload(audioUrl);
  }

  return (
    <div className="mb-4">
      <label className="block text-sm text-slate-400 font-medium mb-1.5">
        <Mic className="w-4 h-4 inline mr-1" />
        {label} <span className="text-slate-600">(max 60s)</span>
      </label>

      {/* Recording state */}
      {isRecording && (
        <div className="bg-red-500/10 border border-red-500/25 rounded-xl p-4 flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
          <span className="text-red-400 font-mono font-bold text-lg">{fmtTime(duration)}</span>
          <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-red-500 transition-all" style={{ width: `${(duration / 60) * 100}%` }} />
          </div>
          <button
            onClick={stop}
            className="w-10 h-10 rounded-xl bg-red-500 text-white flex items-center justify-center active:scale-90 transition shadow-lg shadow-red-500/30"
          >
            <Square className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Uploading state */}
      {uploading && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center gap-3 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Nahrávám na server...</span>
        </div>
      )}

      {/* Playback state */}
      {audioUrl && !uploading && (
        <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-3 flex items-center gap-3">
          <button
            onClick={() => audioRef.current?.play()}
            className="w-9 h-9 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center active:scale-90 transition"
          >
            <Play className="w-4 h-4" />
          </button>
          <div className="flex-1">
            <div className="text-xs text-emerald-400 font-semibold">Nahráno ({fmtTime(duration)})</div>
            <div className="text-[10px] text-slate-500">Hlasová zpráva uložena</div>
          </div>
          <button
            onClick={reset}
            className="w-8 h-8 rounded-lg bg-white/5 text-slate-500 hover:text-red-400 flex items-center justify-center transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <audio ref={audioRef} src={audioUrl} />
        </div>
      )}

      {/* Idle state — record button */}
      {!isRecording && !uploading && !audioUrl && (
        <button
          onClick={start}
          className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-slate-400 text-sm font-semibold hover:bg-white/8 hover:border-orange-500/20 hover:text-orange-400 transition flex items-center justify-center gap-2 min-h-[48px]"
        >
          <Mic className="w-4 h-4" />
          Nahrát hlasovou zprávu
        </button>
      )}

      {/* Error */}
      {error && (
        <div className="mt-1.5 text-xs text-red-400">{error}</div>
      )}
    </div>
  );
}
