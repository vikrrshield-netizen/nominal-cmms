// src/pages/AdminPage.tsx
// NOMINAL CMMS — Administrace uživatelů a nastavení

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthContext } from '../context/AuthContext';
import {
  Users, Shield, Edit2, Trash2, Save,
  X, ArrowLeft, AlertTriangle, Eye, EyeOff, UserPlus,
  Lock, Unlock, History, Building2, Settings2, Plus, Check, Loader2,
  Upload, FileSpreadsheet, Download, CheckCircle2,
} from 'lucide-react';
import { parseExcelFile } from '../utils/importers/excelImporter';
import type { ParseResult } from '../utils/importers/excelImporter';
import { showToast } from '../components/ui/Toast';
import { exportMigrationData, downloadMigrationJson } from '../utils/vikrr_migration';

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
  const { user: authUser, hasPermission } = useAuthContext();

  const [users, setUsers] = useState<AdminUser[]>(INITIAL_USERS);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [showNewUserModal, setShowNewUserModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'users' | 'roles' | 'config' | 'audit' | 'import'>('users');
  const [filterRole, setFilterRole] = useState<UserRole | 'ALL'>('ALL');

  // Hardened access: permission check + explicit role bypass for admin-level roles
  const ADMIN_ROLES: UserRole[] = ['SUPERADMIN', 'VEDENI'];
  const canManage = hasPermission('user.manage') || ADMIN_ROLES.includes(authUser?.role as UserRole);

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
              { id: 'config', label: 'Konfigurace', icon: Settings2 },
              { id: 'import', label: 'Import', icon: Upload },
              { id: 'audit', label: 'Audit log', icon: History },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
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
            <RoleManagerTab users={users} />
          )}

          {activeTab === 'config' && (
            <DynamicConfigTab />
          )}

          {activeTab === 'import' && (
            <ImportExportTab />
          )}

          {activeTab === 'audit' && (
            <AuditTrailTab />
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
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[9999] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#1e293b] rounded-3xl w-full max-w-lg max-h-[85vh] overflow-hidden shadow-2xl border border-white/10" onClick={e => e.stopPropagation()}>
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isPinValid = formData.pin.length === 4 && !existingPins.includes(formData.pin);
  const isFormValid = formData.displayName.trim() && isPinValid;

  const handleSubmit = async () => {
    if (!isFormValid) return;
    setSaving(true);
    setError('');

    const newUser: AdminUser = {
      id: `u${Date.now()}`,
      displayName: formData.displayName.trim(),
      pin: formData.pin,
      role: formData.role,
      email: formData.email.trim() || undefined,
      building: formData.building || undefined,
      active: true,
      createdAt: new Date().toISOString().split('T')[0],
    };

    try {
      // Persist to Firestore
      await addDoc(collection(db, 'users'), {
        displayName: newUser.displayName,
        pin: newUser.pin,
        role: newUser.role,
        email: newUser.email || '',
        buildingId: newUser.building || '',
        color: '#64748b',
        active: true,
        createdAt: serverTimestamp(),
      });
      onSave(newUser);
    } catch (err) {
      console.error('[AdminPage] Create user failed:', err);
      setError('Chyba při ukládání. Uživatel přidán pouze lokálně.');
      // Still add locally as fallback
      onSave(newUser);
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[9999] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#1e293b] rounded-3xl w-full max-w-lg max-h-[85vh] overflow-hidden shadow-2xl border border-white/10" onClick={e => e.stopPropagation()}>
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

        <div className="p-4 border-t border-white/10 space-y-2">
          {error && (
            <div className="p-2 bg-amber-500/20 border border-amber-500/30 rounded-lg text-amber-300 text-xs text-center">
              {error}
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 p-3 border border-white/20 text-white rounded-xl">
              Zrušit
            </button>
            <button
              onClick={handleSubmit}
              disabled={!isFormValid || saving}
              className="flex-1 flex items-center justify-center gap-2 p-3 bg-emerald-500 text-white rounded-xl disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserPlus className="w-5 h-5" />}
              {saving ? 'Ukládám...' : 'Vytvořit'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ROLE MANAGER TAB — Feature toggles per role
// ═══════════════════════════════════════════════════════════════════

const FEATURE_TOGGLES = [
  { id: 'canDelete', label: 'Mazání záznamů', description: 'Oprávnění mazat úkoly, assety' },
  { id: 'canAdd', label: 'Přidávání záznamů', description: 'Vytvářet nové úkoly, assety' },
  { id: 'canViewPrices', label: 'Zobrazení cen', description: 'Vidí náklady, ceny dílů' },
  { id: 'canExport', label: 'Export dat', description: 'Exportovat reporty do CSV/PDF' },
  { id: 'canApprove', label: 'Schvalování', description: 'Schvalovat úkoly, objednávky' },
  { id: 'canManageUsers', label: 'Správa uživatelů', description: 'Přidávat/editovat uživatele' },
];

function RoleManagerTab({ users }: { users: AdminUser[] }) {
  const [toggles, setToggles] = useState<Record<string, Record<string, boolean>>>(() => {
    try {
      const raw = localStorage.getItem('nominal-role-toggles');
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return {
      SUPERADMIN: { canDelete: true, canAdd: true, canViewPrices: false, canExport: true, canApprove: true, canManageUsers: true },
      VEDENI: { canDelete: false, canAdd: true, canViewPrices: true, canExport: true, canApprove: true, canManageUsers: true },
      MAJITEL: { canDelete: false, canAdd: false, canViewPrices: true, canExport: true, canApprove: true, canManageUsers: false },
      UDRZBA: { canDelete: false, canAdd: true, canViewPrices: false, canExport: false, canApprove: false, canManageUsers: false },
      VYROBA: { canDelete: false, canAdd: true, canViewPrices: false, canExport: false, canApprove: true, canManageUsers: false },
      OPERATOR: { canDelete: false, canAdd: true, canViewPrices: false, canExport: false, canApprove: false, canManageUsers: false },
    };
  });

  const handleToggle = (role: string, feature: string) => {
    const newToggles = {
      ...toggles,
      [role]: { ...toggles[role], [feature]: !toggles[role]?.[feature] },
    };
    setToggles(newToggles);
    localStorage.setItem('nominal-role-toggles', JSON.stringify(newToggles));
  };

  return (
    <div className="space-y-4">
      {Object.entries(ROLE_CONFIG).map(([role, cfg]) => (
        <div key={role} className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 border border-white/10">
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-10 h-10 ${cfg.color} rounded-xl flex items-center justify-center text-xl`}>
              {cfg.icon}
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-white">{cfg.label}</h3>
              <p className="text-xs text-slate-400">{cfg.description} · {users.filter(u => u.role === role).length} uživatelů</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {FEATURE_TOGGLES.map(feat => {
              const isOn = toggles[role]?.[feat.id] ?? false;
              return (
                <button
                  key={feat.id}
                  onClick={() => handleToggle(role, feat.id)}
                  className={`flex items-center gap-2 p-2.5 rounded-xl text-left transition text-sm ${
                    isOn ? 'bg-emerald-500/15 border border-emerald-500/30' : 'bg-white/5 border border-white/10'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-md flex items-center justify-center ${isOn ? 'bg-emerald-500' : 'bg-slate-600'}`}>
                    {isOn && <Check className="w-3.5 h-3.5 text-white" />}
                  </div>
                  <div>
                    <div className={`font-medium ${isOn ? 'text-emerald-300' : 'text-slate-400'}`}>{feat.label}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// DYNAMIC CONFIG TAB — Editable dropdown values
// ═══════════════════════════════════════════════════════════════════

interface ConfigSection {
  id: string;
  label: string;
  icon: string;
  items: string[];
}

const DEFAULT_CONFIG_SECTIONS: ConfigSection[] = [
  { id: 'taskTypes', label: 'Typy úkolů', icon: '📋', items: ['corrective', 'preventive', 'improvement', 'inspection'] },
  { id: 'wasteTypes', label: 'Typy odpadů', icon: '♻️', items: ['Plevy', 'Papír', 'Plast', 'Neshodný produkt', 'Kontejner'] },
  { id: 'requestItems', label: 'Položky požadavků', icon: '📦', items: ['Nářadí', 'Pracovní oděv', 'Materiál', 'Mazivo', 'Ochranné pomůcky'] },
  { id: 'priorities', label: 'Priority', icon: '🔴', items: ['P1 — Havárie', 'P2 — Urgentní', 'P3 — Běžná', 'P4 — Nápad'] },
  { id: 'buildings', label: 'Budovy', icon: '🏢', items: ['A — Administrativa', 'B — Spojovací krček', 'C — Zázemí & Vedení', 'D — Výrobní hala', 'E — Dílna & Sklad ND', 'L — Loupárna'] },
];

function DynamicConfigTab() {
  const [sections, setSections] = useState<ConfigSection[]>(() => {
    try {
      const raw = localStorage.getItem('nominal-admin-config');
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return DEFAULT_CONFIG_SECTIONS;
  });
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [newItem, setNewItem] = useState('');

  const saveConfig = (updated: ConfigSection[]) => {
    setSections(updated);
    localStorage.setItem('nominal-admin-config', JSON.stringify(updated));
  };

  const addItem = (sectionId: string) => {
    if (!newItem.trim()) return;
    const updated = sections.map(s =>
      s.id === sectionId ? { ...s, items: [...s.items, newItem.trim()] } : s
    );
    saveConfig(updated);
    setNewItem('');
  };

  const removeItem = (sectionId: string, idx: number) => {
    const updated = sections.map(s =>
      s.id === sectionId ? { ...s, items: s.items.filter((_, i) => i !== idx) } : s
    );
    saveConfig(updated);
  };

  return (
    <div className="space-y-4">
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-sm text-amber-300">
        <Settings2 className="w-4 h-4 inline mr-2" />
        Zde můžete upravovat hodnoty dropdown seznamů v celém systému.
      </div>

      {sections.map(section => {
        const isOpen = editingSection === section.id;
        return (
          <div key={section.id} className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
            <button
              onClick={() => setEditingSection(isOpen ? null : section.id)}
              className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition text-left"
            >
              <span className="text-2xl">{section.icon}</span>
              <div className="flex-1">
                <h3 className="font-bold text-white">{section.label}</h3>
                <p className="text-xs text-slate-500">{section.items.length} položek</p>
              </div>
              <Edit2 className={`w-4 h-4 transition ${isOpen ? 'text-orange-400' : 'text-slate-500'}`} />
            </button>

            {isOpen && (
              <div className="px-4 pb-4 border-t border-white/5 pt-3">
                <div className="space-y-1.5 mb-3">
                  {section.items.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 bg-slate-700/30 rounded-lg group">
                      <span className="text-sm text-white flex-1">{item}</span>
                      <button
                        onClick={() => removeItem(section.id, idx)}
                        className="p-1 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newItem}
                    onChange={e => setNewItem(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addItem(section.id)}
                    placeholder="Nová položka..."
                    className="flex-1 p-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-slate-600"
                  />
                  <button
                    onClick={() => addItem(section.id)}
                    className="px-3 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// AUDIT TRAIL TAB — Structural change logging
// ═══════════════════════════════════════════════════════════════════

const AUDIT_LOG_ENTRIES = [
  { time: '17.2.2026 09:15', user: 'Vilém', action: 'Konfigurace', detail: 'Přidán typ odpadu: Kovový odpad', type: 'config' },
  { time: '17.2.2026 08:30', user: 'System', action: 'Deploy', detail: 'Master Ultra Finish: The Jobs/Vilda Edition', type: 'system' },
  { time: '16.2.2026 16:45', user: 'Vilém', action: 'Role změna', detail: 'UDRZBA: povoleno canExport', type: 'role' },
  { time: '16.2.2026 14:20', user: 'Martina', action: 'Nový uživatel', detail: 'Vytvořen: Karel Horák (UDRZBA)', type: 'user' },
  { time: '15.2.2026 11:00', user: 'Vilém', action: 'Konfigurace', detail: 'Přidána budova: F — Expedice', type: 'config' },
  { time: '14.2.2026 14:32', user: 'Vilém', action: 'Přihlášení', detail: 'PIN 3333', type: 'auth' },
  { time: '14.2.2026 14:15', user: 'Pavla', action: 'Schválení úkolu', detail: 'WO-2026-004', type: 'task' },
  { time: '14.2.2026 13:45', user: 'Zdeněk', action: 'Nahlášení poruchy', detail: 'Balička Karel — zaseknutý materiál', type: 'task' },
  { time: '13.2.2026 16:20', user: 'Vilém', action: 'Změna role', detail: 'Petr Volf → UDRZBA', type: 'role' },
  { time: '13.2.2026 09:00', user: 'System', action: 'Backup', detail: 'Automatická záloha Firestore', type: 'system' },
  { time: '12.2.2026 15:30', user: 'Filip', action: 'Dokončení úkolu', detail: 'WO-2026-003 — Výměna ložisek', type: 'task' },
  { time: '12.2.2026 08:00', user: 'System', action: 'Revize', detail: 'Upozornění: Kalibrace vah končí za 7 dní', type: 'system' },
];

const AUDIT_TYPE_COLORS: Record<string, string> = {
  config: 'bg-purple-500',
  system: 'bg-slate-500',
  role: 'bg-blue-500',
  user: 'bg-emerald-500',
  auth: 'bg-amber-500',
  task: 'bg-orange-500',
};

function AuditTrailTab() {
  const [filter, setFilter] = useState<string>('all');

  const types = ['all', ...new Set(AUDIT_LOG_ENTRIES.map(e => e.type))];
  const filtered = filter === 'all' ? AUDIT_LOG_ENTRIES : AUDIT_LOG_ENTRIES.filter(e => e.type === filter);

  return (
    <div>
      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
        {types.map(t => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
              filter === t ? 'bg-white text-slate-900' : 'bg-white/5 text-slate-400'
            }`}
          >
            {t === 'all' ? `Vše (${AUDIT_LOG_ENTRIES.length})` : t}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.map((log, i) => (
          <div key={i} className="flex items-start gap-3 p-3 bg-white/5 rounded-xl">
            <div className={`w-2 h-2 mt-1.5 rounded-full flex-shrink-0 ${AUDIT_TYPE_COLORS[log.type] || 'bg-slate-400'}`} />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-white">
                <span className="font-semibold">{log.user}</span>
                <span className="text-slate-500"> — </span>
                <span>{log.action}</span>
              </div>
              <div className="text-xs text-slate-500 mt-0.5">{log.detail}</div>
            </div>
            <div className="text-[11px] text-slate-500 flex-shrink-0">{log.time}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// IMPORT / EXPORT TAB
// ═══════════════════════════════════════════════════════════════════

type ImportTarget = 'assets' | 'inventory' | 'fleet';

const IMPORT_TARGETS: { id: ImportTarget; label: string; icon: string; collection: string }[] = [
  { id: 'assets', label: 'Zařízení & Stroje', icon: '🏭', collection: 'assets' },
  { id: 'inventory', label: 'Sklad ND', icon: '📦', collection: 'inventory' },
  { id: 'fleet', label: 'Vozidla', icon: '🚗', collection: 'fleet' },
];

function ImportExportTab() {
  const { user } = useAuthContext();
  const [importTarget, setImportTarget] = useState<ImportTarget>('assets');
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = async (file: File) => {
    try {
      const result = await parseExcelFile(file);
      setParseResult(result);
      setImportedCount(0);
      showToast(`Načteno ${result.rowCount} řádků z "${result.sheetName}"`, 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  const handleImport = async () => {
    if (!parseResult) return;
    setImporting(true);
    const target = IMPORT_TARGETS.find(t => t.id === importTarget)!;
    let count = 0;

    try {
      for (const row of parseResult.rows) {
        const data: Record<string, any> = { ...row };
        delete data._id;
        delete data._path;
        data.createdAt = serverTimestamp();
        data.updatedAt = serverTimestamp();
        data.createdById = user?.uid || '';
        data.createdByName = user?.displayName || 'Import';
        data.importedAt = serverTimestamp();

        if (importTarget === 'assets') {
          data.status = data.status || 'operational';
          data.buildingId = data.buildingId || '';
          data.category = data.category || '';
        } else if (importTarget === 'inventory') {
          data.quantity = Number(data.quantity) || 0;
          data.minQuantity = Number(data.minQuantity) || 0;
          data.unit = data.unit || 'ks';
        } else if (importTarget === 'fleet') {
          data.status = data.status || 'available';
        }

        await addDoc(collection(db, target.collection), data);
        count++;
      }

      setImportedCount(count);
      showToast(`Importováno ${count} záznamů do ${target.label}`, 'success');
    } catch (err) {
      showToast(`Chyba importu: ${(err as Error).message}`, 'error');
    }
    setImporting(false);
  };

  const handleExportMigration = async () => {
    setExporting(true);
    try {
      const data = await exportMigrationData(user?.uid || 'admin', {
        onProgress: (msg, current, total) => {
          console.log(`[Export] ${current}/${total}: ${msg}`);
        },
      });
      downloadMigrationJson(data);
      showToast(`Export dokončen: ${data.metadata.totalDocuments} dokumentů`, 'success');
    } catch (err) {
      showToast(`Chyba exportu: ${(err as Error).message}`, 'error');
    }
    setExporting(false);
  };

  return (
    <div className="space-y-6">
      {/* IMPORT SECTION */}
      <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-5">
        <h3 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
          <Upload className="w-5 h-5 text-blue-400" />
          Hromadný import (CSV / Excel)
        </h3>

        {/* Target selector */}
        <div className="flex gap-2 mb-4">
          {IMPORT_TARGETS.map(t => (
            <button
              key={t.id}
              onClick={() => { setImportTarget(t.id); setParseResult(null); setImportedCount(0); }}
              className={`flex-1 p-3 rounded-xl text-sm font-medium transition ${
                importTarget === t.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-white/5 text-slate-400 hover:text-white border border-white/10'
              }`}
            >
              <span className="mr-1">{t.icon}</span> {t.label}
            </button>
          ))}
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`relative border-2 border-dashed rounded-xl p-8 text-center transition ${
            dragOver
              ? 'border-blue-400 bg-blue-500/10'
              : 'border-slate-600 hover:border-slate-500'
          }`}
        >
          <FileSpreadsheet className="w-10 h-10 text-slate-500 mx-auto mb-3" />
          <p className="text-slate-400 text-sm mb-2">
            Přetáhněte soubor sem nebo
          </p>
          <label className="inline-block px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg cursor-pointer hover:bg-blue-500 transition">
            Vybrat soubor
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileInput} className="hidden" />
          </label>
          <p className="text-slate-600 text-xs mt-2">Podporováno: .xlsx, .xls, .csv</p>
        </div>

        {/* Preview */}
        {parseResult && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-slate-400">
                <span className="text-white font-semibold">{parseResult.rowCount}</span> řádků,{' '}
                <span className="text-white font-semibold">{parseResult.columns.length}</span> sloupců
                {' '}(list: {parseResult.sheetName})
              </div>
              {importedCount > 0 && (
                <span className="flex items-center gap-1 text-emerald-400 text-sm">
                  <CheckCircle2 className="w-4 h-4" /> {importedCount} importováno
                </span>
              )}
            </div>

            {/* Column mappings */}
            <div className="bg-slate-900/50 rounded-xl p-3 max-h-48 overflow-y-auto">
              <div className="text-xs text-slate-500 mb-2 font-semibold uppercase tracking-wide">Mapování sloupců</div>
              {parseResult.mappings.map((m, i) => (
                <div key={i} className="flex items-center gap-2 py-1 text-sm">
                  <span className="text-slate-500 truncate flex-1">{m.excelColumn}</span>
                  <span className="text-slate-600">→</span>
                  <span className={`truncate flex-1 ${m.confidence > 0.6 ? 'text-emerald-400' : m.confidence > 0.3 ? 'text-amber-400' : 'text-slate-500'}`}>
                    {m.mappedTo}
                  </span>
                  <span className="text-[10px] text-slate-600 w-8 text-right">{Math.round(m.confidence * 100)}%</span>
                </div>
              ))}
            </div>

            {/* Data preview */}
            <div className="bg-slate-900/50 rounded-xl p-3 overflow-x-auto">
              <div className="text-xs text-slate-500 mb-2 font-semibold uppercase tracking-wide">Náhled dat (prvních 5)</div>
              <table className="text-xs w-full">
                <thead>
                  <tr>
                    {parseResult.mappings.slice(0, 6).map((m, i) => (
                      <th key={i} className="text-left text-slate-500 pb-1 pr-3 whitespace-nowrap">{m.mappedTo}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parseResult.rows.slice(0, 5).map((row, ri) => (
                    <tr key={ri}>
                      {parseResult!.mappings.slice(0, 6).map((m, ci) => (
                        <td key={ci} className="text-slate-300 py-0.5 pr-3 whitespace-nowrap truncate max-w-[120px]">
                          {String(row[m.mappedTo] ?? row[m.excelColumn] ?? '—')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Import button */}
            <button
              onClick={handleImport}
              disabled={importing || importedCount > 0}
              className="w-full py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-500 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {importing ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Importuji...</>
              ) : importedCount > 0 ? (
                <><CheckCircle2 className="w-4 h-4" /> Hotovo ({importedCount})</>
              ) : (
                <><Upload className="w-4 h-4" /> Importovat {parseResult.rowCount} záznamů</>
              )}
            </button>
          </div>
        )}
      </div>

      {/* EXPORT SECTION */}
      <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-5">
        <h3 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
          <Download className="w-5 h-5 text-emerald-400" />
          Export dat (migrace)
        </h3>
        <p className="text-slate-400 text-sm mb-4">
          Kompletní export všech dat z Firestore (30+ kolekcí) pro migraci na nový VIKRR projekt.
        </p>
        <button
          onClick={handleExportMigration}
          disabled={exporting}
          className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-500 transition disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {exporting ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Exportuji kolekce...</>
          ) : (
            <><Download className="w-4 h-4" /> Stáhnout vikrr-migration.json</>
          )}
        </button>
      </div>
    </div>
  );
}
