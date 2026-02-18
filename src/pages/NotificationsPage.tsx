// src/pages/NotificationsPage.tsx
// VIKRR — Asset Shield — Centrum notifikací a upomínek

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import { 
  Bell, BellOff, ArrowLeft, Check, CheckCheck, Trash2,
  Calendar, Wrench, Package,
  Clock, ChevronRight, Settings, X
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

type NotificationType = 'task' | 'revision' | 'inventory' | 'system' | 'reminder';
type NotificationPriority = 'low' | 'medium' | 'high' | 'critical';

interface Notification {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  actionUrl?: string;
  actionLabel?: string;
}

interface NotificationSetting {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  channels: {
    push: boolean;
    email: boolean;
  };
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
// MOCK DATA
// ═══════════════════════════════════════════════════════════════════

const INITIAL_NOTIFICATIONS: Notification[] = [
  {
    id: 'n1',
    type: 'revision',
    priority: 'critical',
    title: '⚠️ Revize hasicích přístrojů',
    message: 'Termín revize vyprší za 16 dní (1.3.2026). Kontaktujte revizního technika!',
    timestamp: new Date(Date.now() - 1000 * 60 * 30), // 30 min ago
    read: false,
    actionUrl: '/revisions',
    actionLabel: 'Zobrazit revize',
  },
  {
    id: 'n2',
    type: 'revision',
    priority: 'critical',
    title: '⚠️ Kalibrace vah',
    message: 'Termín kalibrace vyprší za 15 dní (28.2.2026). Nutné pro IFS audit!',
    timestamp: new Date(Date.now() - 1000 * 60 * 60), // 1 hour ago
    read: false,
    actionUrl: '/revisions',
    actionLabel: 'Zobrazit revize',
  },
  {
    id: 'n3',
    type: 'task',
    priority: 'high',
    title: 'Nový úkol P1: Extruder 1',
    message: 'Výměna ložiska - přiřazeno vám Zdeňkem',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
    read: false,
    actionUrl: '/tasks',
    actionLabel: 'Zobrazit úkol',
  },
  {
    id: 'n4',
    type: 'inventory',
    priority: 'medium',
    title: 'Nízký stav skladu',
    message: 'Ložisko SKF 6205: zbývají 2 ks (minimum 5 ks)',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 4), // 4 hours ago
    read: true,
    actionUrl: '/inventory',
    actionLabel: 'Objednat',
  },
  {
    id: 'n5',
    type: 'reminder',
    priority: 'medium',
    title: '🗑️ Svoz odpadu zítra',
    message: 'Připravte komunální odpad - svoz ve čtvrtek',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5), // 5 hours ago
    read: true,
    actionUrl: '/waste',
    actionLabel: 'Odpad',
  },
  {
    id: 'n6',
    type: 'task',
    priority: 'low',
    title: 'Úkol dokončen',
    message: 'Oprava úniku oleje na Extruder 2 byla dokončena Vilémem',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
    read: true,
  },
  {
    id: 'n7',
    type: 'system',
    priority: 'low',
    title: 'Záloha dokončena',
    message: 'Automatická záloha databáze proběhla úspěšně',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2), // 2 days ago
    read: true,
  },
];

const INITIAL_SETTINGS: NotificationSetting[] = [
  { id: 's1', label: 'Kritické revize', description: 'Upozornění na blížící se termíny revizí', enabled: true, channels: { push: true, email: true } },
  { id: 's2', label: 'Nové úkoly', description: 'Když vám je přiřazen nový úkol', enabled: true, channels: { push: true, email: false } },
  { id: 's3', label: 'P1 Havárie', description: 'Okamžité upozornění na havárie', enabled: true, channels: { push: true, email: true } },
  { id: 's4', label: 'Nízký stav skladu', description: 'Když položka klesne pod minimum', enabled: true, channels: { push: true, email: false } },
  { id: 's5', label: 'Svoz odpadu', description: 'Připomínka den před svozem', enabled: true, channels: { push: true, email: false } },
  { id: 's6', label: 'Systémové zprávy', description: 'Zálohy, aktualizace, údržba', enabled: false, channels: { push: false, email: false } },
];

// ═══════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function NotificationsPage() {
  const navigate = useNavigate();
  const { user: _user } = useAuthContext();
  
  const [notifications, setNotifications] = useState<Notification[]>(INITIAL_NOTIFICATIONS);
  const [settings, setSettings] = useState<NotificationSetting[]>(INITIAL_SETTINGS);
  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'settings'>('all');
  const [filterType, setFilterType] = useState<NotificationType | 'all'>('all');

  const unreadCount = notifications.filter(n => !n.read).length;

  const filteredNotifications = notifications.filter(n => {
    if (activeTab === 'unread' && n.read) return false;
    if (filterType !== 'all' && n.type !== filterType) return false;
    return true;
  });

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => 
      n.id === id ? { ...n, read: true } : n
    ));
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const deleteNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const clearAll = () => {
    if (confirm('Opravdu smazat všechny notifikace?')) {
      setNotifications([]);
    }
  };

  const toggleSetting = (id: string, field: 'enabled' | 'push' | 'email') => {
    setSettings(prev => prev.map(s => {
      if (s.id !== id) return s;
      if (field === 'enabled') {
        return { ...s, enabled: !s.enabled };
      } else {
        return { 
          ...s, 
          channels: { ...s.channels, [field]: !s.channels[field] }
        };
      }
    }));
  };

  const formatTime = (date: Date) => {
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
      {/* Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-0 w-[300px] h-[300px] md:w-[500px] md:h-[500px] bg-indigo-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[300px] h-[300px] md:w-[500px] md:h-[500px] bg-purple-500/10 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 pb-24">
        {/* Header */}
        <header className="p-6">
          <button 
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-slate-400 hover:text-white mb-4 transition"
          >
            <ArrowLeft className="w-5 h-5" />
            Dashboard
          </button>
          
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/25">
                  <Bell className="w-7 h-7 text-white" />
                </div>
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center animate-pulse">
                    {unreadCount}
                  </span>
                )}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Notifikace</h1>
                <p className="text-slate-400 text-sm">
                  {unreadCount > 0 ? `${unreadCount} nepřečtených` : 'Vše přečteno'}
                </p>
              </div>
            </div>

            {notifications.length > 0 && (
              <div className="flex gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="flex items-center gap-1 px-3 py-2 bg-white/5 text-slate-400 rounded-xl hover:bg-white/10 text-sm"
                  >
                    <CheckCheck className="w-4 h-4" />
                    <span className="hidden sm:inline">Přečíst vše</span>
                  </button>
                )}
                <button
                  onClick={clearAll}
                  className="flex items-center gap-1 px-3 py-2 bg-red-500/20 text-red-400 rounded-xl hover:bg-red-500/30 text-sm"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-white/5 p-1 rounded-xl">
            {[
              { id: 'all', label: 'Vše', count: notifications.length },
              { id: 'unread', label: 'Nepřečtené', count: unreadCount },
              { id: 'settings', label: 'Nastavení' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2 ${
                  activeTab === tab.id 
                    ? 'bg-white text-slate-900' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                    activeTab === tab.id ? 'bg-slate-200' : 'bg-white/10'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </header>

        <div className="px-6 space-y-4">
          {(activeTab === 'all' || activeTab === 'unread') && (
            <>
              {/* Type Filter */}
              <div className="flex gap-2 overflow-x-auto pb-2">
                <button
                  onClick={() => setFilterType('all')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                    filterType === 'all' ? 'bg-white text-slate-900' : 'bg-white/5 text-slate-400'
                  }`}
                >
                  Vše
                </button>
                {Object.entries(TYPE_CONFIG).map(([type, cfg]) => (
                  <button
                    key={type}
                    onClick={() => setFilterType(type as NotificationType)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition flex items-center gap-1.5 ${
                      filterType === type ? 'bg-white text-slate-900' : 'bg-white/5 text-slate-400'
                    }`}
                  >
                    <cfg.icon className="w-3.5 h-3.5" />
                    {cfg.label}
                  </button>
                ))}
              </div>

              {/* Notifications List */}
              {filteredNotifications.length === 0 ? (
                <div className="text-center py-16">
                  <BellOff className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-white mb-2">Žádné notifikace</h3>
                  <p className="text-slate-400">
                    {activeTab === 'unread' ? 'Všechny notifikace jsou přečteny' : 'Zatím nemáte žádné notifikace'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredNotifications.map(notification => {
                    const typeCfg = TYPE_CONFIG[notification.type];
                    const priorityCfg = PRIORITY_CONFIG[notification.priority];
                    const Icon = typeCfg.icon;

                    return (
                      <div
                        key={notification.id}
                        className={`bg-white/5 backdrop-blur-xl rounded-2xl border transition overflow-hidden ${
                          notification.read ? 'border-white/5 opacity-70' : 'border-white/10'
                        }`}
                      >
                        <div className="p-4">
                          <div className="flex gap-3">
                            {/* Icon */}
                            <div className={`relative w-12 h-12 ${typeCfg.color} rounded-xl flex items-center justify-center flex-shrink-0`}>
                              <Icon className="w-6 h-6 text-white" />
                              {!notification.read && (
                                <span className={`absolute -top-1 -right-1 w-3 h-3 ${priorityCfg.color} rounded-full ${priorityCfg.pulse ? 'animate-pulse' : ''}`} />
                              )}
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <h4 className={`font-semibold ${notification.read ? 'text-slate-300' : 'text-white'}`}>
                                  {notification.title}
                                </h4>
                                <span className="text-xs text-slate-500 whitespace-nowrap">
                                  {formatTime(notification.timestamp)}
                                </span>
                              </div>
                              <p className="text-sm text-slate-400 mt-1">{notification.message}</p>
                              
                              {/* Actions */}
                              <div className="flex items-center gap-2 mt-3">
                                {notification.actionUrl && (
                                  <button
                                    onClick={() => {
                                      markAsRead(notification.id);
                                      navigate(notification.actionUrl!);
                                    }}
                                    className="flex items-center gap-1 px-3 py-1.5 bg-white/10 text-white rounded-lg text-sm hover:bg-white/20 transition"
                                  >
                                    {notification.actionLabel}
                                    <ChevronRight className="w-4 h-4" />
                                  </button>
                                )}
                                {!notification.read && (
                                  <button
                                    onClick={() => markAsRead(notification.id)}
                                    className="flex items-center gap-1 px-3 py-1.5 text-slate-400 rounded-lg text-sm hover:text-white transition"
                                  >
                                    <Check className="w-4 h-4" />
                                    Přečteno
                                  </button>
                                )}
                                <button
                                  onClick={() => deleteNotification(notification.id)}
                                  className="p-1.5 text-slate-500 hover:text-red-400 transition ml-auto"
                                >
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
            </>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-4">
              <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 border border-white/10">
                <h3 className="text-lg font-bold text-white mb-4">Nastavení upozornění</h3>
                
                <div className="space-y-4">
                  {settings.map(setting => (
                    <div key={setting.id} className="flex items-start gap-4 p-3 bg-white/5 rounded-xl">
                      <button
                        onClick={() => toggleSetting(setting.id, 'enabled')}
                        className={`w-12 h-7 rounded-full transition relative flex-shrink-0 ${
                          setting.enabled ? 'bg-emerald-500' : 'bg-slate-600'
                        }`}
                      >
                        <span className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all ${
                          setting.enabled ? 'left-6' : 'left-1'
                        }`} />
                      </button>
                      
                      <div className="flex-1">
                        <h4 className="font-medium text-white">{setting.label}</h4>
                        <p className="text-sm text-slate-400">{setting.description}</p>
                        
                        {setting.enabled && (
                          <div className="flex gap-3 mt-2">
                            <label className="flex items-center gap-2 text-sm text-slate-400">
                              <input
                                type="checkbox"
                                checked={setting.channels.push}
                                onChange={() => toggleSetting(setting.id, 'push')}
                                className="w-4 h-4 rounded bg-white/10 border-white/20"
                              />
                              Push
                            </label>
                            <label className="flex items-center gap-2 text-sm text-slate-400">
                              <input
                                type="checkbox"
                                checked={setting.channels.email}
                                onChange={() => toggleSetting(setting.id, 'email')}
                                className="w-4 h-4 rounded bg-white/10 border-white/20"
                              />
                              Email
                            </label>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Test notification */}
              <button
                onClick={() => {
                  const testNotif: Notification = {
                    id: `test-${Date.now()}`,
                    type: 'system',
                    priority: 'medium',
                    title: '🔔 Testovací notifikace',
                    message: 'Toto je testovací notifikace pro ověření funkčnosti',
                    timestamp: new Date(),
                    read: false,
                  };
                  setNotifications(prev => [testNotif, ...prev]);
                  setActiveTab('all');
                }}
                className="w-full p-4 bg-indigo-500/20 text-indigo-400 rounded-xl font-medium hover:bg-indigo-500/30 transition flex items-center justify-center gap-2"
              >
                <Bell className="w-5 h-5" />
                Odeslat testovací notifikaci
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
