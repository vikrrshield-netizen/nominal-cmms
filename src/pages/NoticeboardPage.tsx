// src/pages/NoticeboardPage.tsx
// VIKRR — Asset Shield — Nástěnka (Active Noticeboard)

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, updateDoc, doc, onSnapshot, orderBy, query, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthContext } from '../context/AuthContext';
import { ArrowLeft, Pin, Send, Loader2 } from 'lucide-react';
import { showToast } from '../components/ui/Toast';
import BottomSheet, { FormField, SubmitButton } from '../components/ui/BottomSheet';

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

interface NoticeMessage {
  id: string;
  title: string;
  content: string;
  priority: 'low' | 'normal' | 'high';
  pinned: boolean;
  authorId: string;
  authorName: string;
  createdAt: Date;
}

const PRIORITY_STYLES: Record<string, { border: string; badge: string; label: string }> = {
  high: { border: 'border-red-500/30', badge: 'bg-red-500/20 text-red-400', label: 'Důležité' },
  normal: { border: 'border-blue-500/20', badge: 'bg-blue-500/20 text-blue-400', label: 'Běžné' },
  low: { border: 'border-slate-500/20', badge: 'bg-slate-500/20 text-slate-400', label: 'Info' },
};

// ═══════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function NoticeboardPage() {
  const navigate = useNavigate();
  const { user, hasPermission } = useAuthContext();
  const isAdmin = hasPermission('admin.access');

  const [messages, setMessages] = useState<NoticeMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high'>('normal');
  const [saving, setSaving] = useState(false);

  // Subscribe to noticeboard messages
  useEffect(() => {
    const q = query(collection(db, 'noticeboard'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const msgs: NoticeMessage[] = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          title: data.title || '',
          content: data.content || '',
          priority: data.priority || 'normal',
          pinned: data.pinned || false,
          authorId: data.authorId || '',
          authorName: data.authorName || 'Systém',
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(data.createdAt || Date.now()),
        };
      });
      setMessages(msgs);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  // Sort: pinned first, then by date
  const sortedMessages = [...messages].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'noticeboard'), {
        title: title.trim(),
        content: content.trim(),
        priority,
        pinned: false,
        authorId: user?.id || '',
        authorName: user?.displayName || 'Neznámý',
        createdAt: serverTimestamp(),
      });
      setShowNew(false);
      setTitle('');
      setContent('');
      setPriority('normal');
      showToast('Zpráva přidána na nástěnku', 'success');
    } catch (err) {
      showToast('Chyba při přidávání zprávy', 'error');
    }
    setSaving(false);
  };

  const togglePin = async (msg: NoticeMessage) => {
    try {
      await updateDoc(doc(db, 'noticeboard', msg.id), { pinned: !msg.pinned });
      showToast(msg.pinned ? 'Zpráva odepnuta' : 'Zpráva připnuta', 'success');
    } catch {
      showToast('Chyba', 'error');
    }
  };

  const formatDate = (d: Date) => d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="min-h-screen bg-slate-900 pb-24">
      {/* Header */}
      <div className="bg-slate-800/80 backdrop-blur-sm border-b border-slate-700/50 px-4 py-4 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition">
            <ArrowLeft className="w-5 h-5 text-slate-400" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-white">Nástěnka</h1>
            <p className="text-xs text-slate-500">{messages.length} zpráv</p>
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowNew(true)}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-500 transition flex items-center gap-2"
          >
            <Send className="w-4 h-4" /> Přidat
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="max-w-2xl mx-auto px-4 py-4 space-y-3">
        {loading && (
          <div className="flex items-center justify-center py-12 text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Načítám...
          </div>
        )}

        {!loading && sortedMessages.length === 0 && (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">📌</div>
            <p className="text-slate-400">Zatím žádné zprávy</p>
            {isAdmin && <p className="text-slate-600 text-sm mt-1">Přidejte první zprávu pro tým</p>}
          </div>
        )}

        {sortedMessages.map(msg => {
          const style = PRIORITY_STYLES[msg.priority] || PRIORITY_STYLES.normal;
          return (
            <div
              key={msg.id}
              className={`bg-slate-800/60 rounded-2xl p-4 border ${style.border} ${msg.pinned ? 'ring-1 ring-amber-500/30' : ''}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {msg.pinned && <Pin className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />}
                    <h3 className="text-white font-semibold truncate">{msg.title}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${style.badge}`}>
                      {style.label}
                    </span>
                  </div>
                  <p className="text-slate-300 text-sm whitespace-pre-wrap">{msg.content}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                    <span>{msg.authorName}</span>
                    <span>{formatDate(msg.createdAt)}</span>
                  </div>
                </div>
                {isAdmin && (
                  <button
                    onClick={() => togglePin(msg)}
                    className={`p-2 rounded-lg transition flex-shrink-0 ${msg.pinned ? 'bg-amber-500/20 text-amber-400' : 'bg-white/5 text-slate-500 hover:text-white'}`}
                    title={msg.pinned ? 'Odepnout' : 'Připnout'}
                  >
                    <Pin className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* New message modal */}
      <BottomSheet title="📌 Nová zpráva" isOpen={showNew} onClose={() => setShowNew(false)}>
        <FormField label="Nadpis" value={title} onChange={setTitle} placeholder="Nadpis zprávy" required />
        <FormField label="Obsah" value={content} onChange={setContent} type="textarea" placeholder="Text zprávy pro tým..." required />
        <FormField label="Priorita" value={priority} onChange={(v) => setPriority(v as any)} type="select"
          options={[
            { value: 'high', label: '🔴 Důležité' },
            { value: 'normal', label: '🔵 Běžné' },
            { value: 'low', label: '⚪ Info' },
          ]}
        />
        <SubmitButton label="Publikovat" onClick={handleSubmit} loading={saving} color="orange" />
      </BottomSheet>
    </div>
  );
}
