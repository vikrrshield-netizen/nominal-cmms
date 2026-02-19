// src/pages/NotificationsPage.tsx
// VIKRR — Asset Shield — Centrum notifikací (Firestore-backed)

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import { showToast } from '../components/ui/Toast';
import {
  collection, query, where, orderBy, onSnapshot,
  doc, updateDoc, deleteDoc, addDoc, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  Bell, BellOff, ArrowLeft, Check, CheckCheck, Trash2,
  Calendar, Wrench, Package,
  Clock, ChevronRight, Settings, X, Loader2,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

type NotificationType = 'task' | 'revision' | 'inventory' | 'system' | 'reminder';
type NotificationPriority = 'low' | 'medium' | 'high' | 'critical';

interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  createdAt: Timestamp;
  read: boolean;
  actionUrl?: string;
  actionLabel?: string;
}

// ═══════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════

const TYPE_CONFIG: Record<NotificationType, { icon: typeof Bell; color: string; label: string }> = {
  task: { icon: Wrench, color: 'bg-blue-500', label: 'Úkol' },
  revision: { icon: Calendar, color: 'bg-amber-500', label: 'Revize' },
  inventory: { icon: Package, color: 'bg-emerald-500', label: 'Sklad' },
  system: { icon: Settings, color: 'bg-slate-500', label: 'Systém' },
  reminder: { icon: Clock, color: 'bg-purple-500', label: 'Upomínka' },
};

const PRIORITY_CONFIG: Record<NotificationPriority, { color: string; pulse: boolean }> = {
  low: { color: 'bg-slate-400', pulse: false },
  medium: { color: 'bg-blue-400', pulse: false },
  high: { color: 'bg-amber-400', pulse: false },
  critical: { color: 'bg-red-500', pulse: true },
};

// ═══════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function NotificationsPage() {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const uid = user?.uid || user?.id || '';

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');
  const [filterType, setFilterType] = useState<NotificationType | 'all'>('all');

  // ── Real-time Firestore listener ──
  useEffect(() => {
    if (!uid) { setLoading(false); return; }
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', uid),
      orderBy('createdAt', 'desc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() } as Notification)));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [uid]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const filteredNotifications = notifications.filter(n => {
    if (activeTab === 'unread' && n.read) return false;
    if (filterType !== 'all' && n.type !== filterType) return false;
    return true;
  });

  const markAsRead = async (id: string) => {
    await updateDoc(doc(db, 'notifications', id), { read: true });
    showToast('Označeno jako přečtené', 'success');
  };

  const markAllAsRead = async () => {
    const unread = notifications.filter(n => !n.read);
    await Promise.all(unread.map(n => updateDoc(doc(db, 'notifications', n.id), { read: true })));
    showToast(`${unread.length} notifikací označeno`, 'success');
  };

  const deleteNotification = async (id: string) => {
    await deleteDoc(doc(db, 'notifications', id));
    showToast('Notifikace smazána', 'success');
  };

  const clearAll = async () => {
    if (!confirm('Opravdu smazat všechny notifikace?')) return;
    await Promise.all(notifications.map(n => deleteDoc(doc(db, 'notifications', n.id))));
    showToast('Vše smazáno', 'success');
  };

  const sendTestNotification = async () => {
    await addDoc(collection(db, 'notifications'), {
      userId: uid,
      type: 'system',
      priority: 'medium',
      title: 'Testovací notifikace',
      message: 'Toto je testovací notifikace pro ověření funkčnosti systému.',
      createdAt: serverTimestamp(),
      read: false,
    });
    showToast('Testovací notifikace odeslána', 'success');
  };

  const formatTime = (ts: Timestamp | null) => {
    if (!ts) return '';
    const date = ts.toDate ? ts.toDate() : new Date(ts as any);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 1000 / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (minutes < 60) return `před ${minutes} min`;
    if (hours < 24) return `před ${hours} hod`;
    if (days === 1) return 'včera';
    return `před ${days} dny`;
  };

  return (
    <div className="min-h-screen bg-[#0f172a]">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-0 w-[300px] h-[300px] md:w-[500px] md:h-[500px] bg-indigo-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[300px] h-[300px] md:w-[500px] md:h-[500px] bg-purple-500/10 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 pb-24">
        {/* Header */}
        <header className="p-6">
          <button onClick={() => navigate('/')} className="flex items-center gap-2 text-slate-400 hover:text-white mb-4 transition">
            <ArrowLeft className="w-5 h-5" /> Dashboard
          </button>

          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/25">
                  <Bell className="w-7 h-7 text-white" />
                </div>
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center animate-pulse">{unreadCount}</span>
                )}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Notifikace</h1>
                <p className="text-slate-400 text-sm">
                  {loading ? 'Načítám...' : unreadCount > 0 ? `${unreadCount} nepřečtených` : 'Vše přečteno'}
                </p>
              </div>
            </div>

            {notifications.length > 0 && (
              <div className="flex gap-2">
                {unreadCount > 0 && (
                  <button onClick={markAllAsRead} className="flex items-center gap-1 px-3 py-2 bg-white/5 text-slate-400 rounded-xl hover:bg-white/10 text-sm">
                    <CheckCheck className="w-4 h-4" /><span className="hidden sm:inline">Přečíst vše</span>
                  </button>
                )}
                <button onClick={clearAll} className="flex items-center gap-1 px-3 py-2 bg-red-500/20 text-red-400 rounded-xl hover:bg-red-500/30 text-sm">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-white/5 p-1 rounded-xl">
            {[
              { id: 'all' as const, label: 'Vše', count: notifications.length },
              { id: 'unread' as const, label: 'Nepřečtené', count: unreadCount },
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2 ${
                  activeTab === tab.id ? 'bg-white text-slate-900' : 'text-slate-400 hover:text-white'
                }`}>
                {tab.label}
                {tab.count > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${activeTab === tab.id ? 'bg-slate-200' : 'bg-white/10'}`}>{tab.count}</span>
                )}
              </button>
            ))}
          </div>
        </header>

        <div className="px-6 space-y-4">
          {/* Type Filter */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            <button onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                filterType === 'all' ? 'bg-white text-slate-900' : 'bg-white/5 text-slate-400'
              }`}>Vše</button>
            {Object.entries(TYPE_CONFIG).map(([type, cfg]) => (
              <button key={type} onClick={() => setFilterType(type as NotificationType)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition flex items-center gap-1.5 ${
                  filterType === type ? 'bg-white text-slate-900' : 'bg-white/5 text-slate-400'
                }`}>
                <cfg.icon className="w-3.5 h-3.5" />{cfg.label}
              </button>
            ))}
          </div>

          {/* Loading */}
          {loading && (
            <div className="text-center py-16">
              <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mx-auto mb-3" />
              <p className="text-slate-500 text-sm">Načítám notifikace...</p>
            </div>
          )}

          {/* Empty */}
          {!loading && filteredNotifications.length === 0 && (
            <div className="text-center py-16">
              <BellOff className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-white mb-2">Žádné notifikace</h3>
              <p className="text-slate-400">{activeTab === 'unread' ? 'Všechny notifikace jsou přečteny' : 'Zatím nemáte žádné notifikace'}</p>
            </div>
          )}

          {/* Notifications List */}
          {!loading && filteredNotifications.length > 0 && (
            <div className="space-y-3">
              {filteredNotifications.map(notification => {
                const typeCfg = TYPE_CONFIG[notification.type] || TYPE_CONFIG.system;
                const priorityCfg = PRIORITY_CONFIG[notification.priority] || PRIORITY_CONFIG.low;
                const Icon = typeCfg.icon;
                return (
                  <div key={notification.id}
                    className={`bg-white/5 backdrop-blur-xl rounded-2xl border transition overflow-hidden ${
                      notification.read ? 'border-white/5 opacity-70' : 'border-white/10'
                    }`}>
                    <div className="p-4">
                      <div className="flex gap-3">
                        <div className={`relative w-12 h-12 ${typeCfg.color} rounded-xl flex items-center justify-center flex-shrink-0`}>
                          <Icon className="w-6 h-6 text-white" />
                          {!notification.read && (
                            <span className={`absolute -top-1 -right-1 w-3 h-3 ${priorityCfg.color} rounded-full ${priorityCfg.pulse ? 'animate-pulse' : ''}`} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className={`font-semibold ${notification.read ? 'text-slate-300' : 'text-white'}`}>{notification.title}</h4>
                            <span className="text-xs text-slate-500 whitespace-nowrap">{formatTime(notification.createdAt)}</span>
                          </div>
                          <p className="text-sm text-slate-400 mt-1">{notification.message}</p>
                          <div className="flex items-center gap-2 mt-3">
                            {notification.actionUrl && (
                              <button onClick={() => { markAsRead(notification.id); navigate(notification.actionUrl!); }}
                                className="flex items-center gap-1 px-3 py-1.5 bg-white/10 text-white rounded-lg text-sm hover:bg-white/20 transition">
                                {notification.actionLabel || 'Zobrazit'}<ChevronRight className="w-4 h-4" />
                              </button>
                            )}
                            {!notification.read && (
                              <button onClick={() => markAsRead(notification.id)}
                                className="flex items-center gap-1 px-3 py-1.5 text-slate-400 rounded-lg text-sm hover:text-white transition">
                                <Check className="w-4 h-4" /> Přečteno
                              </button>
                            )}
                            <button onClick={() => deleteNotification(notification.id)}
                              className="p-1.5 text-slate-500 hover:text-red-400 transition ml-auto">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Send test notification */}
          <button onClick={sendTestNotification}
            className="w-full p-4 bg-indigo-500/20 text-indigo-400 rounded-xl font-medium hover:bg-indigo-500/30 transition flex items-center justify-center gap-2">
            <Bell className="w-5 h-5" /> Odeslat testovací notifikaci
          </button>
        </div>
      </div>
    </div>
  );
}
