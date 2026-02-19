// src/pages/NoticeboardPage.tsx
// Nominal CMMS — Communication Hub & Shift Handover

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot,
  orderBy, query, where, serverTimestamp, Timestamp, getDocs, limit,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthContext } from '../context/AuthContext';
import {
  ArrowLeft, Pin, Send, Loader2, Trash2, X,
  MessageSquare, Shield, User, Users, Clock,
  RefreshCw, AlertTriangle,
} from 'lucide-react';
import { showToast } from '../components/ui/Toast';
import MicButton from '../components/ui/MicButton';

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

type PostCategory = 'general' | 'shift' | 'safety' | 'personal';

interface NoticePost {
  id: string;
  content: string;
  category: PostCategory;
  pinned: boolean;
  fromId: string;
  fromName: string;
  toId: string | null;     // null = everyone
  toName: string | null;
  shiftInfo?: {
    from: string;          // e.g. 'Ranní'
    to: string;            // e.g. 'Odpolední'
    p1Summary: string[];   // P1 tasks completed during shift
  };
  createdAt: Date;
}

interface SimpleUser {
  id: string;
  displayName: string;
}

// ═══════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════

const CATEGORY_CONFIG: Record<PostCategory, { label: string; icon: typeof MessageSquare; color: string; bg: string; border: string }> = {
  general:  { label: 'Všeobecné', icon: MessageSquare, color: 'text-blue-400',   bg: 'bg-blue-500/15',   border: 'border-blue-500/20' },
  shift:    { label: 'Směna',     icon: RefreshCw,     color: 'text-amber-400',  bg: 'bg-amber-500/15',  border: 'border-amber-500/20' },
  safety:   { label: 'Bezpečnost',icon: Shield,        color: 'text-red-400',    bg: 'bg-red-500/15',    border: 'border-red-500/20' },
  personal: { label: 'Osobní',    icon: User,          color: 'text-purple-400', bg: 'bg-purple-500/15', border: 'border-purple-500/20' },
};

const SHIFT_PRESETS = [
  { from: 'Ranní', to: 'Odpolední', label: 'Ranní → Odpolední' },
  { from: 'Odpolední', to: 'Noční', label: 'Odpolední → Noční' },
  { from: 'Noční', to: 'Ranní', label: 'Noční → Ranní' },
];

// ═══════════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════════

function useNoticeboardPosts(userId: string) {
  const [posts, setPosts] = useState<NoticePost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'noticeboard'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const all: NoticePost[] = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          content: data.content || '',
          category: data.category || data.type || 'general',
          pinned: data.pinned || false,
          fromId: data.fromId || data.authorId || '',
          fromName: data.fromName || data.authorName || 'Systém',
          toId: data.toId ?? null,
          toName: data.toName ?? null,
          shiftInfo: data.shiftInfo || undefined,
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(data.createdAt || Date.now()),
        };
      });
      // Filter: show posts for everyone (toId=null) OR addressed to current user OR sent by current user
      const visible = all.filter(p =>
        p.toId === null || p.toId === userId || p.fromId === userId
      );
      setPosts(visible);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [userId]);

  return { posts, loading };
}

function useUsers() {
  const [users, setUsers] = useState<SimpleUser[]>([]);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map(d => ({
        id: d.id,
        displayName: d.data().displayName || 'Neznámý',
      })));
    }, () => {});
    return () => unsub();
  }, []);
  return users;
}

// Fetch P1 tasks completed today for shift handover summary
async function fetchP1CompletedToday(): Promise<string[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  try {
    const q = query(
      collection(db, 'tasks'),
      where('priority', '==', 'P1'),
      where('status', 'in', ['completed', 'done']),
      orderBy('completedAt', 'desc'),
      limit(20),
    );
    const snap = await getDocs(q);
    return snap.docs
      .filter(d => {
        const ca = d.data().completedAt;
        if (!ca) return false;
        const date = ca instanceof Timestamp ? ca.toDate() : new Date(ca);
        return date >= today;
      })
      .map(d => d.data().title || 'Bez názvu');
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function NoticeboardPage() {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const uid = user?.uid || user?.id || '';

  const { posts, loading } = useNoticeboardPosts(uid);
  const allUsers = useUsers();

  const [filterCat, setFilterCat] = useState<PostCategory | 'all'>('all');
  const [showNew, setShowNew] = useState(false);
  const [showShift, setShowShift] = useState(false);

  // New post form
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<PostCategory>('general');
  const [recipientId, setRecipientId] = useState<string>('all');
  const [saving, setSaving] = useState(false);

  // Shift handover form
  const [shiftPreset, setShiftPreset] = useState(0);
  const [shiftNotes, setShiftNotes] = useState('');
  const [shiftP1, setShiftP1] = useState<string[]>([]);
  const [shiftLoading, setShiftLoading] = useState(false);
  const [shiftSaving, setShiftSaving] = useState(false);

  // Sorted + filtered posts
  const filteredPosts = useMemo(() => {
    let result = posts;
    if (filterCat !== 'all') result = result.filter(p => p.category === filterCat);
    return [...result].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
  }, [posts, filterCat]);

  const formatDate = (d: Date) => {
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(mins / 60);
    if (mins < 60) return `před ${mins} min`;
    if (hrs < 24) return `před ${hrs} hod`;
    return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  // ── Submit new post ──
  const handleSubmit = async () => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      const toUser = recipientId !== 'all' ? allUsers.find(u => u.id === recipientId) : null;

      await addDoc(collection(db, 'noticeboard'), {
        content: content.trim(),
        category,
        pinned: false,
        fromId: uid,
        fromName: user?.displayName || 'Neznámý',
        toId: toUser ? toUser.id : null,
        toName: toUser ? toUser.displayName : null,
        createdAt: serverTimestamp(),
      });

      // If addressed to specific person, create a notification for them
      if (toUser) {
        await addDoc(collection(db, 'notifications'), {
          userId: toUser.id,
          type: 'system',
          priority: category === 'safety' ? 'high' : 'medium',
          title: `Nová zpráva od ${user?.displayName || 'Neznámý'}`,
          message: content.trim().slice(0, 100),
          createdAt: serverTimestamp(),
          read: false,
          actionUrl: '/noticeboard',
          actionLabel: 'Zobrazit',
        });
      }

      setShowNew(false);
      setContent('');
      setCategory('general');
      setRecipientId('all');
      showToast('Zpráva publikována', 'success');
    } catch {
      showToast('Chyba při publikování', 'error');
    }
    setSaving(false);
  };

  // ── Open shift handover ──
  const openShiftHandover = async () => {
    setShowShift(true);
    setShiftLoading(true);
    setShiftNotes('');
    const p1Tasks = await fetchP1CompletedToday();
    setShiftP1(p1Tasks);
    setShiftLoading(false);
  };

  // ── Submit shift handover ──
  const handleShiftSubmit = async () => {
    const preset = SHIFT_PRESETS[shiftPreset];
    setShiftSaving(true);
    try {
      const p1Text = shiftP1.length > 0
        ? `\n\nP1 úkoly dokončené za směnu:\n${shiftP1.map(t => `• ${t}`).join('\n')}`
        : '\n\nŽádné P1 úkoly za tuto směnu.';

      const fullContent = `Předávám směnu ${preset.from} → ${preset.to}.${shiftNotes ? '\n\n' + shiftNotes.trim() : ''}${p1Text}`;

      await addDoc(collection(db, 'noticeboard'), {
        content: fullContent,
        category: 'shift' as PostCategory,
        pinned: false,
        fromId: uid,
        fromName: user?.displayName || 'Neznámý',
        toId: null,
        toName: null,
        shiftInfo: {
          from: preset.from,
          to: preset.to,
          p1Summary: shiftP1,
        },
        createdAt: serverTimestamp(),
      });

      setShowShift(false);
      setShiftNotes('');
      showToast('Předání směny publikováno', 'success');
    } catch {
      showToast('Chyba při publikování', 'error');
    }
    setShiftSaving(false);
  };

  // ── Actions ──
  const togglePin = async (post: NoticePost) => {
    try {
      await updateDoc(doc(db, 'noticeboard', post.id), { pinned: !post.pinned });
      showToast(post.pinned ? 'Odepnuto' : 'Připnuto', 'success');
    } catch { showToast('Chyba', 'error'); }
  };

  const deletePost = async (postId: string) => {
    try {
      await deleteDoc(doc(db, 'noticeboard', postId));
      showToast('Zpráva smazána', 'success');
    } catch { showToast('Chyba', 'error'); }
  };

  return (
    <div className="min-h-screen bg-slate-900 pb-24">
      {/* Header */}
      <div className="bg-slate-800/80 backdrop-blur-sm border-b border-slate-700/50 px-4 py-4 sticky top-0 z-20">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition">
              <ArrowLeft className="w-5 h-5 text-slate-400" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-white">Nástěnka</h1>
              <p className="text-xs text-slate-500">{posts.length} zpráv</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={openShiftHandover}
              className="px-3 py-2 bg-amber-500/20 text-amber-400 text-sm font-semibold rounded-xl hover:bg-amber-500/30 transition flex items-center gap-1.5"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="hidden sm:inline">Předat směnu</span>
            </button>
            <button
              onClick={() => setShowNew(true)}
              className="px-3 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-500 transition flex items-center gap-1.5"
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">Přidat</span>
            </button>
          </div>
        </div>

        {/* Category filter */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <button
            onClick={() => setFilterCat('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
              filterCat === 'all' ? 'bg-white text-slate-900' : 'bg-white/5 text-slate-400'
            }`}
          >
            Vše ({posts.length})
          </button>
          {(Object.entries(CATEGORY_CONFIG) as [PostCategory, typeof CATEGORY_CONFIG[PostCategory]][]).map(([cat, cfg]) => {
            const count = posts.filter(p => p.category === cat).length;
            return (
              <button
                key={cat}
                onClick={() => setFilterCat(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition flex items-center gap-1.5 ${
                  filterCat === cat ? 'bg-white text-slate-900' : 'bg-white/5 text-slate-400'
                }`}
              >
                <cfg.icon className="w-3 h-3" />
                {cfg.label}
                {count > 0 && <span className="text-[10px] opacity-60">({count})</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Feed */}
      <div className="max-w-2xl mx-auto px-4 py-4 space-y-3">
        {loading && (
          <div className="flex items-center justify-center py-12 text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Načítám...
          </div>
        )}

        {!loading && filteredPosts.length === 0 && (
          <div className="text-center py-16">
            <MessageSquare className="w-14 h-14 text-slate-600 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-white mb-1">Žádné zprávy</h3>
            <p className="text-slate-500 text-sm">
              {filterCat !== 'all' ? 'V této kategorii nejsou žádné zprávy' : 'Nástěnka je prázdná'}
            </p>
          </div>
        )}

        {filteredPosts.map(post => {
          const catCfg = CATEGORY_CONFIG[post.category] || CATEGORY_CONFIG.general;
          const CatIcon = catCfg.icon;
          const isOwn = post.fromId === uid;
          const isShift = post.category === 'shift' && post.shiftInfo;

          return (
            <div
              key={post.id}
              className={`bg-slate-800/60 backdrop-blur-sm rounded-2xl border overflow-hidden transition ${catCfg.border} ${
                post.pinned ? 'ring-1 ring-amber-500/30' : ''
              }`}
            >
              {/* Card header */}
              <div className={`px-4 py-2.5 ${catCfg.bg} flex items-center gap-2`}>
                <CatIcon className={`w-4 h-4 ${catCfg.color}`} />
                <span className={`text-xs font-bold ${catCfg.color}`}>{catCfg.label}</span>
                {post.pinned && <Pin className="w-3 h-3 text-amber-400 ml-1" />}
                {post.toId && (
                  <span className="ml-auto flex items-center gap-1 text-[10px] text-purple-400 font-semibold">
                    <User className="w-3 h-3" />
                    {post.toId === uid ? 'Pro mě' : `→ ${post.toName}`}
                  </span>
                )}
                {!post.toId && (
                  <span className="ml-auto flex items-center gap-1 text-[10px] text-slate-500">
                    <Users className="w-3 h-3" /> Všichni
                  </span>
                )}
              </div>

              {/* Shift handover badge */}
              {isShift && post.shiftInfo && (
                <div className="mx-4 mt-3 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <span className="text-sm font-bold text-amber-300">
                    {post.shiftInfo.from} → {post.shiftInfo.to}
                  </span>
                  {post.shiftInfo.p1Summary.length > 0 && (
                    <span className="ml-auto px-2 py-0.5 bg-red-500/20 text-red-400 text-[10px] font-bold rounded-full">
                      {post.shiftInfo.p1Summary.length} P1
                    </span>
                  )}
                </div>
              )}

              {/* Content */}
              <div className="px-4 py-3">
                <p className="text-slate-200 text-sm whitespace-pre-wrap leading-relaxed">{post.content}</p>
              </div>

              {/* Footer */}
              <div className="px-4 pb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-400">
                    {post.fromName.split(' ').map(w => w[0]).join('').slice(0, 2)}
                  </div>
                  <span className="font-medium">{post.fromName}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDate(post.createdAt)}</span>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => togglePin(post)}
                    className={`p-1.5 rounded-lg transition ${post.pinned ? 'bg-amber-500/20 text-amber-400' : 'text-slate-600 hover:text-slate-400'}`}
                  >
                    <Pin className="w-3.5 h-3.5" />
                  </button>
                  {isOwn && (
                    <button
                      onClick={() => deletePost(post.id)}
                      className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ═══ NEW POST MODAL ═══ */}
      {showNew && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[9999] flex items-end sm:items-center justify-center" onClick={() => setShowNew(false)}>
          <div
            className="bg-slate-800 rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-white/10"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/10">
              <h2 className="text-xl font-bold text-white">Nová zpráva</h2>
              <button onClick={() => setShowNew(false)} className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Category chips */}
              <div>
                <label className="block text-sm text-slate-400 font-medium mb-2">Kategorie</label>
                <div className="grid grid-cols-4 gap-2">
                  {(Object.entries(CATEGORY_CONFIG) as [PostCategory, typeof CATEGORY_CONFIG[PostCategory]][]).map(([cat, cfg]) => (
                    <button
                      key={cat}
                      onClick={() => setCategory(cat)}
                      className={`py-2.5 rounded-xl text-xs font-semibold transition border flex flex-col items-center gap-1 ${
                        category === cat
                          ? `${cfg.bg} ${cfg.color} ${cfg.border}`
                          : 'bg-white/5 border-white/10 text-slate-500'
                      }`}
                    >
                      <cfg.icon className="w-4 h-4" />
                      {cfg.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Recipient */}
              <div>
                <label className="block text-sm text-slate-400 font-medium mb-1.5">Pro koho</label>
                <select
                  value={recipientId}
                  onChange={e => setRecipientId(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-blue-500/50 transition"
                  style={{ appearance: 'auto' }}
                >
                  <option value="all" className="bg-slate-800">Všichni</option>
                  {allUsers.filter(u => u.id !== uid).map(u => (
                    <option key={u.id} value={u.id} className="bg-slate-800">{u.displayName}</option>
                  ))}
                </select>
              </div>

              {/* Content + Mic */}
              <div>
                <label className="block text-sm text-slate-400 font-medium mb-1.5">Zpráva</label>
                <div className="flex gap-2 items-start">
                  <textarea
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    placeholder="Napište zprávu pro tým..."
                    rows={4}
                    autoFocus
                    className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-blue-500/50 transition resize-none"
                  />
                  <div className="pt-2">
                    <MicButton onTranscript={t => setContent(prev => prev ? prev + ' ' + t : t)} />
                  </div>
                </div>
              </div>

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={!content.trim() || saving}
                className="w-full py-3.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-2xl font-bold hover:from-blue-400 hover:to-blue-500 disabled:opacity-50 flex items-center justify-center gap-2 transition active:scale-[0.98]"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                {saving ? 'Odesílám...' : 'Publikovat'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ SHIFT HANDOVER MODAL ═══ */}
      {showShift && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[9999] flex items-end sm:items-center justify-center" onClick={() => setShowShift(false)}>
          <div
            className="bg-slate-800 rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-white/10"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-amber-400" />
                <h2 className="text-xl font-bold text-white">Předat směnu</h2>
              </div>
              <button onClick={() => setShowShift(false)} className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Shift preset */}
              <div>
                <label className="block text-sm text-slate-400 font-medium mb-2">Typ předání</label>
                <div className="grid grid-cols-3 gap-2">
                  {SHIFT_PRESETS.map((preset, i) => (
                    <button
                      key={i}
                      onClick={() => setShiftPreset(i)}
                      className={`py-3 rounded-xl text-xs font-semibold transition border text-center ${
                        shiftPreset === i
                          ? 'bg-amber-500/20 border-amber-500/30 text-amber-400'
                          : 'bg-white/5 border-white/10 text-slate-500'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* P1 summary — auto-fetched */}
              <div>
                <label className="block text-sm text-slate-400 font-medium mb-2 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  P1 úkoly dokončené dnes
                </label>
                {shiftLoading ? (
                  <div className="flex items-center gap-2 py-4 text-slate-500 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" /> Načítám P1 úkoly...
                  </div>
                ) : shiftP1.length === 0 ? (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-sm text-emerald-400">
                    Žádné P1 havárie za tuto směnu
                  </div>
                ) : (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 space-y-1.5">
                    {shiftP1.map((task, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                        <span className="text-red-300">{task}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Notes + Mic */}
              <div>
                <label className="block text-sm text-slate-400 font-medium mb-1.5">Poznámky k předání</label>
                <div className="flex gap-2 items-start">
                  <textarea
                    value={shiftNotes}
                    onChange={e => setShiftNotes(e.target.value)}
                    placeholder="Co je potřeba vědět pro další směnu..."
                    rows={4}
                    className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-amber-500/50 transition resize-none"
                  />
                  <div className="pt-2">
                    <MicButton onTranscript={t => setShiftNotes(prev => prev ? prev + ' ' + t : t)} />
                  </div>
                </div>
              </div>

              {/* Submit */}
              <button
                onClick={handleShiftSubmit}
                disabled={shiftSaving || shiftLoading}
                className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-2xl font-bold hover:from-amber-400 hover:to-orange-400 disabled:opacity-50 flex items-center justify-center gap-2 transition active:scale-[0.98]"
              >
                {shiftSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                {shiftSaving ? 'Ukládám...' : `Předat: ${SHIFT_PRESETS[shiftPreset].label}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
