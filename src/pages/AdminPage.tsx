// src/pages/AdminPage.tsx
// NOMINAL CMMS — Administrace uživatelů a nastavení

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import { 
  Users, Shield, Edit2, Trash2, Save,
  X, ArrowLeft, AlertTriangle, Eye, EyeOff, UserPlus,
  Lock, Unlock, History, Building2
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

type UserRole = 'SUPERADMIN' | 'VEDENI' | 'MAJITEL' | 'UDRZBA' | 'VYROBA' | 'OPERATOR';

interface AdminUser {
  id: string;
  displayName: string;
  pin: string;
  role: UserRole;
  email?: string;
  phone?: string;
  building?: string;
  active: boolean;
  createdAt: string;
  lastLogin?: string;
}

// ═══════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════

const ROLE_CONFIG: Record<UserRole, { label: string; icon: string; color: string; description: string }> = {
  SUPERADMIN: { label: 'Super Admin', icon: '👑', color: 'bg-purple-500', description: 'Plný přístup ke všemu' },
  VEDENI: { label: 'Vedení', icon: '👔', color: 'bg-blue-500', description: 'Schvalování, reporty, finance' },
  MAJITEL: { label: 'Majitel', icon: '🏠', color: 'bg-amber-500', description: 'Pouze čtení, návrhy P4' },
  UDRZBA: { label: 'Údržba', icon: '🔧', color: 'bg-emerald-500', description: 'Správa strojů, úkoly, sklad' },
  VYROBA: { label: 'Výroba', icon: '🏭', color: 'bg-cyan-500', description: 'Plánování, zóny' },
  OPERATOR: { label: 'Operátor', icon: '👷', color: 'bg-slate-500', description: 'Kiosk, hlášení poruch' },
};

// ═══════════════════════════════════════════════════════════════════
// MOCK DATA
// ═══════════════════════════════════════════════════════════════════

const INITIAL_USERS: AdminUser[] = [
  { id: 'u1', displayName: 'Milan Novák', pin: '1111', role: 'MAJITEL', email: 'milan@nominal.cz', active: true, createdAt: '2024-01-01', lastLogin: '2026-02-12' },
  { id: 'u2', displayName: 'Martina', pin: '2222', role: 'VEDENI', email: 'martina@nominal.cz', active: true, createdAt: '2024-01-01', lastLogin: '2026-02-11' },
  { id: 'u3', displayName: 'Vilém', pin: '3333', role: 'SUPERADMIN', email: 'vilem@nominal.cz', phone: '+420 777 123 456', active: true, createdAt: '2024-01-01', lastLogin: '2026-02-12' },
  { id: 'u4', displayName: 'Pavla Drápelová', pin: '4444', role: 'VYROBA', building: 'D', active: true, createdAt: '2024-03-15', lastLogin: '2026-02-12' },
  { id: 'u5', displayName: 'Zdeněk Mička', pin: '5555', role: 'UDRZBA', building: 'D', active: true, createdAt: '2024-03-15', lastLogin: '2026-02-11' },
  { id: 'u6', displayName: 'Petr Volf', pin: '6666', role: 'UDRZBA', building: 'D', active: true, createdAt: '2024-06-01', lastLogin: '2026-02-10' },
  { id: 'u7', displayName: 'Filip Novák', pin: '7777', role: 'UDRZBA', building: 'E', active: true, createdAt: '2024-06-01', lastLogin: '2026-02-09' },
  { id: 'u8', displayName: 'Kiosk Velín', pin: '0000', role: 'OPERATOR', building: 'D', active: true, createdAt: '2024-01-01' },
];

const BUILDINGS = [
  { id: 'A', name: 'Administrativa' },
  { id: 'B', name: 'Spojovací krček' },
  { id: 'C', name: 'Zázemí & Vedení' },
  { id: 'D', name: 'Výrobní hala' },
  { id: 'E', name: 'Dílna & Sklad ND' },
  { id: 'L', name: 'Loupárna' },
];

// ═══════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function AdminPage() {
  const navigate = useNavigate();
  const { hasPermission, user: _user } = useAuthContext();
  
  const [users, setUsers] = useState<AdminUser[]>(INITIAL_USERS);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [showNewUserModal, setShowNewUserModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'users' | 'roles' | 'audit'>('users');
  const [filterRole, setFilterRole] = useState<UserRole | 'ALL'>('ALL');

  const canManage = hasPermission('user.manage');

  if (!canManage) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-6">
        <div className="bg-red-500/20 border border-red-500/30 rounded-2xl p-8 text-center max-w-md">
          <AlertTriangle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Přístup odepřen</h2>
          <p className="text-slate-400 mb-4">Nemáte oprávnění k administraci</p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-2 bg-slate-700 text-white rounded-xl hover:bg-slate-600"
          >
            Zpět na Dashboard
          </button>
        </div>
      </div>
    );
  }

  const filteredUsers = users.filter(u => filterRole === 'ALL' || u.role === filterRole);

  const handleDeleteUser = (userId: string) => {
    if (confirm('Opravdu smazat tohoto uživatele?')) {
      setUsers(prev => prev.filter(u => u.id !== userId));
      setSelectedUser(null);
    }
  };

  const handleToggleActive = (userId: string) => {
    setUsers(prev => prev.map(u => 
      u.id === userId ? { ...u, active: !u.active } : u
    ));
  };

  return (
    <div className="min-h-screen bg-[#0f172a]">
      {/* Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-[300px] h-[300px] md:w-[500px] md:h-[500px] bg-purple-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] md:w-[500px] md:h-[500px] bg-blue-500/10 rounded-full blur-[120px]" />
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
              <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-violet-600 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/25">
                <Shield className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Administrace</h1>
                <p className="text-slate-400 text-sm">Správa uživatelů a oprávnění</p>
              </div>
            </div>

            <button
              onClick={() => setShowNewUserModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl hover:shadow-lg transition"
            >
              <UserPlus className="w-5 h-5" />
              <span className="hidden sm:inline">Nový uživatel</span>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-white/5 p-1 rounded-xl">
            {[
              { id: 'users', label: 'Uživatelé', icon: Users },
              { id: 'roles', label: 'Role', icon: Shield },
              { id: 'audit', label: 'Audit log', icon: History },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition ${
                  activeTab === tab.id 
                    ? 'bg-white text-slate-900' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </header>

        <div className="px-6 space-y-6">
          {activeTab === 'users' && (
            <>
              {/* Filter */}
              <div className="flex gap-2 overflow-x-auto pb-2">
                <button
                  onClick={() => setFilterRole('ALL')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                    filterRole === 'ALL' ? 'bg-white text-slate-900' : 'bg-white/5 text-slate-400'
                  }`}
                >
                  Vše ({users.length})
                </button>
                {Object.entries(ROLE_CONFIG).map(([role, cfg]) => {
                  const count = users.filter(u => u.role === role).length;
                  return (
                    <button
                      key={role}
                      onClick={() => setFilterRole(role as UserRole)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition flex items-center gap-1.5 ${
                        filterRole === role ? 'bg-white text-slate-900' : 'bg-white/5 text-slate-400'
                      }`}
                    >
                      <span>{cfg.icon}</span>
                      <span>{cfg.label}</span>
                      <span className="text-xs opacity-60">({count})</span>
                    </button>
                  );
                })}
              </div>

              {/* Users List */}
              <div className="space-y-3">
                {filteredUsers.map(adminUser => {
                  const roleCfg = ROLE_CONFIG[adminUser.role];
                  return (
                    <button
                      key={adminUser.id}
                      onClick={() => setSelectedUser(adminUser)}
                      className={`w-full flex items-center gap-4 p-4 bg-white/5 backdrop-blur-xl rounded-2xl border transition hover:bg-white/10 ${
                        adminUser.active ? 'border-white/10' : 'border-red-500/30 opacity-60'
                      }`}
                    >
                      <div className={`w-12 h-12 ${roleCfg.color} rounded-xl flex items-center justify-center text-white text-xl`}>
                        {roleCfg.icon}
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white">{adminUser.displayName}</span>
                          {!adminUser.active && (
                            <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 text-[10px] rounded">
                              NEAKTIVNÍ
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-slate-400">{roleCfg.label}</div>
                        {adminUser.building && (
                          <div className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                            <Building2 className="w-3 h-3" />
                            Budova {adminUser.building}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-lg text-white">{adminUser.pin}</div>
                        <div className="text-xs text-slate-500">PIN</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {activeTab === 'roles' && (
            <div className="space-y-4">
              {Object.entries(ROLE_CONFIG).map(([role, cfg]) => (
                <div key={role} className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 border border-white/10">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 ${cfg.color} rounded-xl flex items-center justify-center text-xl`}>
                      {cfg.icon}
                    </div>
                    <div>
                      <h3 className="font-bold text-white">{cfg.label}</h3>
                      <p className="text-sm text-slate-400">{cfg.description}</p>
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">
                    {users.filter(u => u.role === role).length} uživatelů s touto rolí
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'audit' && (
            <div className="space-y-3">
              {[
                { time: '12.2.2026 14:32', user: 'Vilém', action: 'Přihlášení', detail: 'PIN 3333' },
                { time: '12.2.2026 14:15', user: 'Pavla', action: 'Schválila úkol', detail: 'WO-2026-004' },
                { time: '12.2.2026 13:45', user: 'Zdeněk', action: 'Nahlásil poruchu', detail: 'Balička Karel' },
                { time: '11.2.2026 16:20', user: 'Vilém', action: 'Změna role', detail: 'Petr → UDRZBA' },
                { time: '11.2.2026 09:00', user: 'System', action: 'Backup', detail: 'Automatická záloha' },
              ].map((log, i) => (
                <div key={i} className="flex items-center gap-4 p-3 bg-white/5 rounded-xl">
                  <div className="w-2 h-2 bg-emerald-400 rounded-full" />
                  <div className="flex-1">
                    <div className="text-sm text-white">
                      <span className="font-medium">{log.user}</span>
                      {' — '}
                      {log.action}
                    </div>
                    <div className="text-xs text-slate-500">{log.detail}</div>
                  </div>
                  <div className="text-xs text-slate-500">{log.time}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* User Detail Modal */}
      {selectedUser && (
        <UserDetailModal
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onSave={(updated) => {
            setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
            setSelectedUser(null);
          }}
          onDelete={() => handleDeleteUser(selectedUser.id)}
          onToggleActive={() => handleToggleActive(selectedUser.id)}
        />
      )}

      {/* New User Modal */}
      {showNewUserModal && (
        <NewUserModal
          existingPins={users.map(u => u.pin)}
          onClose={() => setShowNewUserModal(false)}
          onSave={(newUser) => {
            setUsers(prev => [...prev, newUser]);
            setShowNewUserModal(false);
          }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// USER DETAIL MODAL
// ═══════════════════════════════════════════════════════════════════

function UserDetailModal({ user, onClose, onSave, onDelete, onToggleActive }: {
  user: AdminUser;
  onClose: () => void;
  onSave: (user: AdminUser) => void;
  onDelete: () => void;
  onToggleActive: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [formData, setFormData] = useState({
    displayName: user.displayName,
    pin: user.pin,
    role: user.role,
    email: user.email || '',
    phone: user.phone || '',
    building: user.building || '',
  });

  const roleCfg = ROLE_CONFIG[user.role];

  const handleSave = () => {
    onSave({
      ...user,
      ...formData,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="bg-[#1e293b] rounded-t-3xl md:rounded-3xl w-full max-w-lg max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={`${roleCfg.color} p-6`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-4xl">{roleCfg.icon}</span>
              <div>
                <h2 className="text-xl font-bold text-white">{user.displayName}</h2>
                <p className="text-white/80">{roleCfg.label}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl bg-white/20 hover:bg-white/30">
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 overflow-y-auto max-h-[60vh]">
          {!isEditing ? (
            <>
              {/* PIN */}
              <div className="bg-white/5 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">PIN kód</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-2xl text-white">
                      {showPin ? user.pin : '••••'}
                    </span>
                    <button 
                      onClick={() => setShowPin(!showPin)}
                      className="p-1 hover:bg-white/10 rounded"
                    >
                      {showPin ? <EyeOff className="w-4 h-4 text-slate-400" /> : <Eye className="w-4 h-4 text-slate-400" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Info */}
              <div className="space-y-2">
                {user.email && (
                  <div className="flex justify-between py-2 border-b border-white/5">
                    <span className="text-slate-400">Email</span>
                    <span className="text-white">{user.email}</span>
                  </div>
                )}
                {user.phone && (
                  <div className="flex justify-between py-2 border-b border-white/5">
                    <span className="text-slate-400">Telefon</span>
                    <span className="text-white">{user.phone}</span>
                  </div>
                )}
                {user.building && (
                  <div className="flex justify-between py-2 border-b border-white/5">
                    <span className="text-slate-400">Budova</span>
                    <span className="text-white">{user.building}</span>
                  </div>
                )}
                <div className="flex justify-between py-2 border-b border-white/5">
                  <span className="text-slate-400">Vytvořen</span>
                  <span className="text-white">{new Date(user.createdAt).toLocaleDateString('cs-CZ')}</span>
                </div>
                {user.lastLogin && (
                  <div className="flex justify-between py-2">
                    <span className="text-slate-400">Poslední přihlášení</span>
                    <span className="text-white">{new Date(user.lastLogin).toLocaleDateString('cs-CZ')}</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-4">
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex-1 flex items-center justify-center gap-2 p-3 bg-blue-500 text-white rounded-xl"
                >
                  <Edit2 className="w-4 h-4" />
                  Upravit
                </button>
                <button
                  onClick={onToggleActive}
                  className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl ${
                    user.active 
                      ? 'bg-amber-500/20 text-amber-400' 
                      : 'bg-emerald-500/20 text-emerald-400'
                  }`}
                >
                  {user.active ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                  {user.active ? 'Deaktivovat' : 'Aktivovat'}
                </button>
              </div>
              
              <button
                onClick={onDelete}
                className="w-full flex items-center justify-center gap-2 p-3 bg-red-500/20 text-red-400 rounded-xl"
              >
                <Trash2 className="w-4 h-4" />
                Smazat uživatele
              </button>
            </>
          ) : (
            <>
              {/* Edit Form */}
              <div>
                <label className="text-sm text-slate-400">Jméno</label>
                <input
                  type="text"
                  value={formData.displayName}
                  onChange={e => setFormData(prev => ({ ...prev, displayName: e.target.value }))}
                  className="w-full p-2 bg-white/5 border border-white/10 rounded-lg mt-1 text-white"
                />
              </div>
              
              <div>
                <label className="text-sm text-slate-400">PIN (4 číslice)</label>
                <input
                  type="text"
                  value={formData.pin}
                  onChange={e => setFormData(prev => ({ ...prev, pin: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                  className="w-full p-2 bg-white/5 border border-white/10 rounded-lg mt-1 text-white font-mono text-xl"
                  maxLength={4}
                />
              </div>

              <div>
                <label className="text-sm text-slate-400">Role</label>
                <select
                  value={formData.role}
                  onChange={e => setFormData(prev => ({ ...prev, role: e.target.value as UserRole }))}
                  className="w-full p-2 bg-white/5 border border-white/10 rounded-lg mt-1 text-white"
                >
                  {Object.entries(ROLE_CONFIG).map(([role, cfg]) => (
                    <option key={role} value={role}>{cfg.icon} {cfg.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm text-slate-400">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full p-2 bg-white/5 border border-white/10 rounded-lg mt-1 text-white"
                />
              </div>

              <div>
                <label className="text-sm text-slate-400">Budova</label>
                <select
                  value={formData.building}
                  onChange={e => setFormData(prev => ({ ...prev, building: e.target.value }))}
                  className="w-full p-2 bg-white/5 border border-white/10 rounded-lg mt-1 text-white"
                >
                  <option value="">— Nespecifikováno —</option>
                  {BUILDINGS.map(b => (
                    <option key={b.id} value={b.id}>{b.id} — {b.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2 pt-4">
                <button
                  onClick={() => setIsEditing(false)}
                  className="flex-1 p-3 border border-white/20 text-white rounded-xl"
                >
                  Zrušit
                </button>
                <button
                  onClick={handleSave}
                  className="flex-1 flex items-center justify-center gap-2 p-3 bg-emerald-500 text-white rounded-xl"
                >
                  <Save className="w-4 h-4" />
                  Uložit
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// NEW USER MODAL
// ═══════════════════════════════════════════════════════════════════

function NewUserModal({ existingPins, onClose, onSave }: {
  existingPins: string[];
  onClose: () => void;
  onSave: (user: AdminUser) => void;
}) {
  const [formData, setFormData] = useState({
    displayName: '',
    pin: '',
    role: 'UDRZBA' as UserRole,
    email: '',
    building: '',
  });

  const isPinValid = formData.pin.length === 4 && !existingPins.includes(formData.pin);
  const isFormValid = formData.displayName && isPinValid;

  const handleSubmit = () => {
    if (!isFormValid) return;
    
    const newUser: AdminUser = {
      id: `u${Date.now()}`,
      displayName: formData.displayName,
      pin: formData.pin,
      role: formData.role,
      email: formData.email || undefined,
      building: formData.building || undefined,
      active: true,
      createdAt: new Date().toISOString().split('T')[0],
    };
    onSave(newUser);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="bg-[#1e293b] rounded-t-3xl md:rounded-3xl w-full max-w-lg max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Nový uživatel</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto max-h-[70vh]">
          <div>
            <label className="text-sm text-slate-400">Jméno *</label>
            <input
              type="text"
              value={formData.displayName}
              onChange={e => setFormData(prev => ({ ...prev, displayName: e.target.value }))}
              className="w-full p-2 bg-white/5 border border-white/10 rounded-lg mt-1 text-white"
              placeholder="Jan Novák"
            />
          </div>

          <div>
            <label className="text-sm text-slate-400">PIN (4 číslice) *</label>
            <input
              type="text"
              value={formData.pin}
              onChange={e => setFormData(prev => ({ ...prev, pin: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
              className={`w-full p-2 bg-white/5 border rounded-lg mt-1 text-white font-mono text-xl ${
                formData.pin.length === 4 
                  ? isPinValid ? 'border-emerald-500' : 'border-red-500'
                  : 'border-white/10'
              }`}
              maxLength={4}
              placeholder="0000"
            />
            {formData.pin.length === 4 && !isPinValid && (
              <p className="text-red-400 text-xs mt-1">Tento PIN už existuje</p>
            )}
          </div>

          <div>
            <label className="text-sm text-slate-400">Role *</label>
            <select
              value={formData.role}
              onChange={e => setFormData(prev => ({ ...prev, role: e.target.value as UserRole }))}
              className="w-full p-2 bg-white/5 border border-white/10 rounded-lg mt-1 text-white"
            >
              {Object.entries(ROLE_CONFIG).map(([role, cfg]) => (
                <option key={role} value={role}>{cfg.icon} {cfg.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-slate-400">Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
              className="w-full p-2 bg-white/5 border border-white/10 rounded-lg mt-1 text-white"
              placeholder="jan@nominal.cz"
            />
          </div>

          <div>
            <label className="text-sm text-slate-400">Budova</label>
            <select
              value={formData.building}
              onChange={e => setFormData(prev => ({ ...prev, building: e.target.value }))}
              className="w-full p-2 bg-white/5 border border-white/10 rounded-lg mt-1 text-white"
            >
              <option value="">— Nespecifikováno —</option>
              {BUILDINGS.map(b => (
                <option key={b.id} value={b.id}>{b.id} — {b.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="p-4 border-t border-white/10 flex gap-2">
          <button onClick={onClose} className="flex-1 p-3 border border-white/20 text-white rounded-xl">
            Zrušit
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isFormValid}
            className="flex-1 flex items-center justify-center gap-2 p-3 bg-emerald-500 text-white rounded-xl disabled:opacity-50"
          >
            <UserPlus className="w-5 h-5" />
            Vytvořit
          </button>
        </div>
      </div>
    </div>
  );
}
