// src/pages/NotificationsPage.tsx
// VIKRR — Asset Shield — Centrum notifikací (Firestore-backed)

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import { useBackNavigation } from '../hooks/useBackNavigation';
import { showToast } from '../components/ui/Toast';
import {
  collection, query, where, orderBy, onSnapshot,
  doc, updateDoc, deleteDoc, addDoc, serverTimestamp, Timestamp, limit,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  Bell, BellOff, ArrowLeft, Check, CheckCheck, Trash2,
  Calendar, Wrench, Package, Thermometer, ClipboardCheck,
  Clock, ChevronRight, Settings, X, Loader2, Smartphone,
} from 'lucide-react';
import { enablePushNotifications } from '../services/pushNotificationService';

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

type NotificationType = 'task' | 'revision' | 'inventory' | 'system' | 'reminder' | 'gearbox' | 'inspection';
type NotificationPriority = 'low' | 'medium' | 'high' | 'critical';

interface Notification {
  id: string;
  userId?: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  createdAt: Timestamp | null;
  read: boolean;
  actionUrl?: string;
  actionLabel?: string;
  generated?: boolean;
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
  gearbox: { icon: Thermometer, color: 'bg-violet-500', label: 'Převodovka' },
  inspection: { icon: ClipboardCheck, color: 'bg-amber-500', label: 'Kontrola' },
};

const PRIORITY_CONFIG: Record<NotificationPriority, { color: string; pulse: boolean }> = {
  low: { color: 'bg-slate-400', pulse: false },
  medium: { color: 'bg-blue-400', pulse: false },
  high: { color: 'bg-amber-400', pulse: false },
  critical: { color: 'bg-red-500', pulse: true },
};

const NOTIFICATION_LIMIT = 100;
const OPEN_TASK_LIMIT = 500;
const ASSET_LIMIT = 1000;
const GEARBOX_TEMPERATURE_LIMIT = 500;
const INSPECTION_LOG_LIMIT = 500;
const OPEN_TASK_STATUSES = ['backlog', 'planned', 'in_progress', 'paused'];

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function inspectionIsDue(log: any, now: Date): boolean {
  if (log.isDeleted === true || log.status === 'defect') return false;
  if (log.status === 'pending') return true;
  const completedAt = log.completedAt?.toDate?.();
  if (!completedAt) return true;
  const due = startOfDay(completedAt);
  const frequency = String(log.frequency || 'monthly');
  if (frequency === 'daily') due.setDate(due.getDate() + 1);
  else if (frequency === 'weekly') due.setDate(due.getDate() + 7);
  else if (frequency === 'quarterly') due.setMonth(due.getMonth() + 3);
  else if (frequency === 'yearly') due.setFullYear(due.getFullYear() + 1);
  else due.setMonth(due.getMonth() + 1);
  return due <= startOfDay(now);
}

// ═══════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function NotificationsPage() {
  const navigate = useNavigate();
  const goBack = useBackNavigation('/');
  const { user } = useAuthContext();
  const uid = user?.uid || user?.id || '';

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [gearboxTemperatures, setGearboxTemperatures] = useState<any[]>([]);
  const [inspectionLogs, setInspectionLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pushSaving, setPushSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');
  const [filterType, setFilterType] = useState<NotificationType | 'all'>('all');

  // ── Real-time Firestore listener ──
  useEffect(() => {
    if (!uid) { setLoading(false); return; }
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(NOTIFICATION_LIMIT),
    );
    const unsub = onSnapshot(q, (snap) => {
      setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() } as Notification)));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const unsubs = [
      onSnapshot(
        query(collection(db, 'tasks'), where('status', 'in', OPEN_TASK_STATUSES), limit(OPEN_TASK_LIMIT)),
        (snap) => setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
        (err) => console.error('[Notifications] tasks error:', err),
      ),
      onSnapshot(
        query(collection(db, 'assets'), limit(ASSET_LIMIT)),
        (snap) => setAssets(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
        (err) => console.error('[Notifications] assets error:', err),
      ),
      onSnapshot(
        query(collection(db, 'gearbox_temperature_logs'), orderBy('measuredAt', 'desc'), limit(GEARBOX_TEMPERATURE_LIMIT)),
        (snap) => setGearboxTemperatures(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
        (err) => console.error('[Notifications] gearbox temperatures error:', err),
      ),
      onSnapshot(
        query(collection(db, 'inspection_logs'), where('month', '==', currentMonth), limit(INSPECTION_LOG_LIMIT)),
        (snap) => setInspectionLogs(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
        (err) => console.error('[Notifications] inspection logs error:', err),
      ),
    ];
    return () => unsubs.forEach((unsub) => unsub());
  }, []);

  const toDate = (value: any): Date | null => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (value.toDate) return value.toDate();
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const generatedAlerts = useMemo<Notification[]>(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const currentMonth = now.toISOString().slice(0, 7);
    const closedStatuses = new Set(['completed', 'cancelled', 'done']);
    const alerts: Notification[] = [];

    tasks.forEach((task) => {
      if (closedStatuses.has(String(task.status))) return;
      const due = toDate(task.dueDate || task.plannedDate);
      if (due && due < todayStart) {
        alerts.push({
          id: `auto-task-overdue-${task.id}`,
          type: 'task',
          priority: task.priority === 'P1' ? 'critical' : 'high',
          title: `Ukol po terminu: ${task.title || task.code || 'bez nazvu'}`,
          message: [task.assetName, task.buildingId ? `Budova ${task.buildingId}` : '', `Termin: ${due.toLocaleDateString('cs-CZ')}`].filter(Boolean).join(' | '),
          createdAt: Timestamp.fromDate(due),
          read: false,
          actionUrl: '/tasks',
          actionLabel: 'Otevrit ukoly',
          generated: true,
        });
        return;
      }
      if (task.priority === 'P1') {
        alerts.push({
          id: `auto-task-p1-${task.id}`,
          type: 'task',
          priority: 'high',
          title: `Dulezity ukol: ${task.title || task.code || 'bez nazvu'}`,
          message: [task.assetName, task.description].filter(Boolean).join(' | ').slice(0, 180),
          createdAt: toDate(task.createdAt) ? Timestamp.fromDate(toDate(task.createdAt)!) : null,
          read: false,
          actionUrl: '/tasks',
          actionLabel: 'Otevrit ukoly',
          generated: true,
        });
      }
    });

    gearboxTemperatures.forEach((log) => {
      const temperature = Number(log.temperatureC);
      if (!Number.isFinite(temperature) || temperature < 75) return;
      const measuredAt = toDate(log.measuredAt || log.createdAt) || now;
      alerts.push({
        id: `auto-gearbox-temp-${log.id}`,
        type: 'gearbox',
        priority: temperature >= 90 ? 'critical' : 'high',
          title: `Vysoká teplota převodovky: ${temperature} °C`,
        message: [log.gearboxName, log.extruderName, log.note].filter(Boolean).join(' | '),
        createdAt: Timestamp.fromDate(measuredAt),
        read: false,
        actionUrl: '/reports',
        actionLabel: 'Otevrit reporty',
        generated: true,
      });
    });

    const latestTemperatureByGearbox = new Map<string, Date>();
    gearboxTemperatures.forEach((log) => {
      const gearboxId = String(log.gearboxId || '');
      const measuredAt = toDate(log.measuredAt || log.createdAt);
      if (!gearboxId || !measuredAt) return;
      const previous = latestTemperatureByGearbox.get(gearboxId);
      if (!previous || measuredAt > previous) latestTemperatureByGearbox.set(gearboxId, measuredAt);
    });

    assets
      .filter((asset) => !asset.isDeleted)
      .filter((asset) => {
        const value = `${asset.entityType || ''} ${asset.category || ''} ${asset.name || ''}`.toLowerCase();
        return value.includes('prevodov') || value.includes('gearbox') || asset.gearboxStatus;
      })
      .filter((asset) => asset.gearboxStatus === 'installed' || asset.currentExtruderId)
      .forEach((asset) => {
        const last = latestTemperatureByGearbox.get(asset.id) || toDate(asset.lastTemperatureAt);
        if (last && last >= fiveDaysAgo) return;
        const isMissing = !last || last < sevenDaysAgo;
        alerts.push({
          id: `auto-gearbox-stale-${asset.id}`,
          type: 'gearbox',
          priority: isMissing ? 'critical' : 'medium',
          title: `${isMissing ? 'Chybí měření' : 'Stav měření: brzy vyprší'} - ${asset.name}`,
          message: asset.currentExtruderName
            ? `Převodovka je namontovaná na ${asset.currentExtruderName}. ${isMissing ? 'Nemá měření 7 nebo více dní.' : 'Poslední měření je starší než 5 dní.'}`
            : isMissing ? 'Převodovka nemá aktuální záznam teploty.' : 'Poslední měření převodovky brzy vyprší.',
          createdAt: last ? Timestamp.fromDate(last) : null,
          read: false,
          actionUrl: '/kiosk',
          actionLabel: 'Zadat teplotu',
          generated: true,
        });
      });

    const pendingInspections = inspectionLogs.filter((log) =>
      log.month === currentMonth && inspectionIsDue(log, now)
    );
    if (pendingInspections.length > 0) {
      alerts.push({
        id: `auto-inspection-pending-${currentMonth}`,
        type: 'inspection',
        priority: 'medium',
        title: `Kontroly k provedeni: ${pendingInspections.length}`,
        message: `Je cas projit ${pendingInspections.length} kontrol. Otevri kontrolu, potvrd OK nebo zapis zavadu.`,
        createdAt: Timestamp.fromDate(todayStart),
        read: false,
        actionUrl: '/inspections',
        actionLabel: 'Provest kontroly',
        generated: true,
      });
    }

    const priorityScore: Record<NotificationPriority, number> = { critical: 4, high: 3, medium: 2, low: 1 };
    return alerts.sort((a, b) => {
      const byPriority = priorityScore[b.priority] - priorityScore[a.priority];
      if (byPriority) return byPriority;
      return (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0);
    }).slice(0, 30);
  }, [assets, gearboxTemperatures, inspectionLogs, tasks]);

  const allNotifications = useMemo(
    () => [...generatedAlerts, ...notifications],
    [generatedAlerts, notifications]
  );

  const unreadCount = allNotifications.filter(n => !n.read).length;

  const filteredNotifications = allNotifications.filter(n => {
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

  const enablePush = async () => {
    if (!user) return;
    setPushSaving(true);
    const result = await enablePushNotifications({
      id: user.id,
      uid: user.uid,
      displayName: user.displayName,
      role: user.role,
      tenantId: user.tenantId,
    });
    setPushSaving(false);
    showToast(result.ok ? 'Upozornění v telefonu jsou zapnutá' : result.message, result.ok ? 'success' : 'error');
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
    <div className="min-h-screen bg-[#f1ece3]">
      <div className="relative z-10 pb-24">
        {/* Header */}
        <header className="p-6">
          <button onClick={() => goBack()} className="flex items-center gap-2 text-slate-500 hover:text-slate-700 mb-4 transition">
            <ArrowLeft className="w-5 h-5" /> Zpět
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
                <h1 className="text-2xl font-bold text-slate-900">Notifikace</h1>
                <p className="text-slate-400 text-sm">
                  {loading ? 'Načítám...' : unreadCount > 0 ? `${unreadCount} nepřečtených` : 'Vše přečteno'}
                </p>
              </div>
            </div>

            {allNotifications.length > 0 && (
              <div className="flex gap-2">
                {unreadCount > 0 && (
                  <button onClick={markAllAsRead} className="flex items-center gap-1 px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 text-sm">
                    <CheckCheck className="w-4 h-4" /><span className="hidden sm:inline">Přečíst vše</span>
                  </button>
                )}
                <button onClick={clearAll} className="flex items-center gap-1 px-3 py-2 bg-red-50 text-red-700 rounded-xl hover:bg-red-100 text-sm">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
            {[
              { id: 'all' as const, label: 'Vše', count: allNotifications.length },
              { id: 'unread' as const, label: 'Nepřečtené', count: unreadCount },
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2 ${
                  activeTab === tab.id ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:text-slate-700'
                }`}>
                {tab.label}
                {tab.count > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${activeTab === tab.id ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-600'}`}>{tab.count}</span>
                )}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={enablePush}
            disabled={pushSaving}
            className="mt-3 w-full rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-left text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
          >
            <span className="flex items-center gap-3">
              {pushSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Smartphone className="w-5 h-5" />}
              <span>
                <span className="block text-sm font-bold">Zapnout upozornění v telefonu</span>
                <span className="block text-xs text-emerald-700">Telefon si vyžádá povolení. Potom může aplikace pípnout i mimo otevřenou stránku.</span>
              </span>
            </span>
          </button>
        </header>

        <div className="px-6 space-y-4">
          {/* Type Filter */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            <button onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                filterType === 'all' ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-200 text-slate-600'
              }`}>Vše</button>
            {Object.entries(TYPE_CONFIG).map(([type, cfg]) => (
              <button key={type} onClick={() => setFilterType(type as NotificationType)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition flex items-center gap-1.5 ${
                  filterType === type ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-200 text-slate-600'
                }`}>
                <cfg.icon className="w-3.5 h-3.5" />{cfg.label}
              </button>
            ))}
          </div>

          {/* Loading */}
          {loading && (
            <div className="text-center py-16">
              <Loader2 className="w-8 h-8 text-emerald-700 animate-spin mx-auto mb-3" />
              <p className="text-slate-500 text-sm">Načítám notifikace...</p>
            </div>
          )}

          {/* Empty */}
          {!loading && filteredNotifications.length === 0 && (
            <div className="text-center py-16">
              <BellOff className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-slate-900 mb-2">Žádné notifikace</h3>
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
                    className={`bg-white rounded-2xl border transition overflow-hidden ${
                      notification.read ? 'border-slate-200 opacity-70' : 'border-slate-200'
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
                            <h4 className={`font-semibold ${notification.read ? 'text-slate-500' : 'text-slate-900'}`}>{notification.title}</h4>
                            <span className="text-xs text-slate-500 whitespace-nowrap">{formatTime(notification.createdAt)}</span>
                          </div>
                          <p className="text-sm text-slate-400 mt-1">{notification.message}</p>
                          <div className="flex items-center gap-2 mt-3">
                            {notification.actionUrl && (
                              <button onClick={() => { if (!notification.generated) markAsRead(notification.id); navigate(notification.actionUrl!); }}
                                className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-sm hover:bg-slate-200 transition">
                                {notification.actionLabel || 'Zobrazit'}<ChevronRight className="w-4 h-4" />
                              </button>
                            )}
                            {!notification.read && !notification.generated && (
                              <button onClick={() => markAsRead(notification.id)}
                                className="flex items-center gap-1 px-3 py-1.5 text-slate-500 rounded-lg text-sm hover:text-slate-700 transition">
                                <Check className="w-4 h-4" /> Přečteno
                              </button>
                            )}
                            {!notification.generated && (
                              <button onClick={() => deleteNotification(notification.id)}
                                className="p-1.5 text-slate-500 hover:text-red-400 transition ml-auto">
                                <X className="w-4 h-4" />
                              </button>
                            )}
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
