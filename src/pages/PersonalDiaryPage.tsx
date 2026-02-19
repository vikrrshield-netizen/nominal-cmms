// src/pages/PersonalDiaryPage.tsx
// VIKRR — Asset Shield — Personal Notebook (soukromé poznámky technika)

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import {
  collection, query, where, orderBy, onSnapshot,
  addDoc, deleteDoc, doc, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import MicButton from '../components/ui/MicButton';
import VoiceMemoRecorder from '../components/ui/VoiceMemoRecorder';
import {
  ArrowLeft, Plus, Trash2, BookOpen, Mic, FileText, Loader2, X,
} from 'lucide-react';

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════

interface UserNote {
  id: string;
  userId: string;
  text: string;
  audioUrl?: string;
  createdAt: Timestamp;
}

// ═══════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════

export default function PersonalDiaryPage() {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const uid = user?.uid || '';

  const [notes, setNotes] = useState<UserNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newText, setNewText] = useState('');
  const [newAudioUrl, setNewAudioUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Real-time listener ──
  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, 'user_notes'),
      where('userId', '==', uid),
      orderBy('createdAt', 'desc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      setNotes(snap.docs.map((d) => ({ id: d.id, ...d.data() } as UserNote)));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [uid]);

  // ── Save note ──
  const handleSave = async () => {
    if (!newText.trim() && !newAudioUrl) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'user_notes'), {
        userId: uid,
        text: newText.trim(),
        audioUrl: newAudioUrl || null,
        createdAt: serverTimestamp(),
      });
      setNewText('');
      setNewAudioUrl('');
      setShowNew(false);
    } catch (err) {
      console.error('[Diary] Save failed:', err);
    }
    setSaving(false);
  };

  // ── Delete note ──
  const handleDelete = async (noteId: string) => {
    if (!window.confirm('Smazat poznámku?')) return;
    await deleteDoc(doc(db, 'user_notes', noteId));
  };

  // ── Format date ──
  const fmtDate = (ts: Timestamp | null) => {
    if (!ts) return '';
    const d = ts.toDate();
    return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short', year: 'numeric' })
      + ' ' + d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="min-h-screen bg-[#0f172a]">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#0f172a]/95 backdrop-blur-lg border-b border-white/10">
        <div className="max-w-3xl mx-auto flex items-center gap-3 px-4 py-3">
          <button onClick={() => navigate('/')} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition">
            <ArrowLeft className="w-5 h-5 text-slate-400" />
          </button>
          <BookOpen className="w-6 h-6 text-violet-400" />
          <h1 className="text-lg font-bold text-white flex-1">Osobní poznámky</h1>
          <button
            onClick={() => { setShowNew(true); setTimeout(() => textareaRef.current?.focus(), 100); }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-500 transition"
          >
            <Plus className="w-4 h-4" />
            Nová
          </button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {/* New Note Form */}
        {showNew && (
          <div className="bg-slate-800/80 border border-violet-500/30 rounded-2xl p-5 space-y-4 shadow-lg shadow-violet-500/5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-violet-400 flex items-center gap-2">
                <FileText className="w-4 h-4" /> Nová poznámka
              </h2>
              <button onClick={() => { setShowNew(false); setNewText(''); setNewAudioUrl(''); }}
                className="p-1.5 rounded-lg bg-white/5 text-slate-500 hover:text-white transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Text + Mic */}
            <div className="flex gap-2 items-start">
              <textarea
                ref={textareaRef}
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                placeholder="Co si chceš poznamenat? Můžeš i diktovat..."
                rows={4}
                className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-[15px] placeholder-slate-600 focus:outline-none focus:border-violet-500/50 transition resize-none min-h-[48px]"
              />
              <div className="pt-2">
                <MicButton onTranscript={(t) => setNewText((prev) => prev ? prev + ' ' + t : t)} />
              </div>
            </div>

            {/* Voice Memo */}
            <VoiceMemoRecorder
              userId={uid}
              label="Hlasová poznámka"
              onUpload={(url) => setNewAudioUrl(url)}
            />

            {newAudioUrl && (
              <div className="text-xs text-emerald-400 flex items-center gap-1">
                <Mic className="w-3 h-3" /> Hlasová zpráva připojena
              </div>
            )}

            {/* Save */}
            <button
              onClick={handleSave}
              disabled={saving || (!newText.trim() && !newAudioUrl)}
              className="w-full py-3 rounded-xl bg-violet-600 text-white font-bold text-sm disabled:opacity-40 hover:bg-violet-500 transition flex items-center justify-center gap-2 min-h-[48px]"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {saving ? 'Ukládám...' : 'Uložit poznámku'}
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-center py-16">
            <Loader2 className="w-8 h-8 text-violet-400 animate-spin mx-auto mb-3" />
            <p className="text-slate-500 text-sm">Načítám poznámky...</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && notes.length === 0 && !showNew && (
          <div className="text-center py-16">
            <BookOpen className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400 font-medium mb-1">Zatím žádné poznámky</p>
            <p className="text-slate-600 text-sm">Klikni na "Nová" pro vytvoření první poznámky</p>
          </div>
        )}

        {/* Notes List */}
        {notes.map((note) => (
          <div key={note.id} className="bg-slate-800/60 border border-white/5 rounded-2xl p-4 hover:border-white/10 transition group">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                {note.text && (
                  <p className="text-white text-sm whitespace-pre-wrap leading-relaxed">{note.text}</p>
                )}
                {note.audioUrl && (
                  <div className="mt-2 flex items-center gap-2">
                    <Mic className="w-3.5 h-3.5 text-violet-400 flex-shrink-0" />
                    <audio src={note.audioUrl} controls className="h-8 max-w-full" style={{ filter: 'invert(1) hue-rotate(180deg)' }} />
                  </div>
                )}
                <div className="mt-2 text-xs text-slate-600">{fmtDate(note.createdAt)}</div>
              </div>
              <button
                onClick={() => handleDelete(note.id)}
                className="p-2 rounded-lg bg-white/5 text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition opacity-0 group-hover:opacity-100"
                title="Smazat"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
