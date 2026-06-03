// src/pages/RevisionsPage.tsx
// VIKRR — Asset Shield — Přehled revizí (Firestore LIVE, semafor)

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import {
  useRevisions, TYPE_CONFIG, STATUS_CONFIG,
  formatRevisionDate, daysUntilRevision,
} from '../hooks/useRevisions';
import type { Revision, RevisionType, RevisionStatus } from '../hooks/useRevisions';
import { Breadcrumb } from '../components/ui';
import { useReports } from '../hooks/useReports';
import {
  Shield, AlertTriangle, CheckCircle2,
  Loader2, Calendar, Search, X, Download, Edit2, Trash2,
} from 'lucide-react';
import { doc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

// ═══════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════

export default function RevisionsPage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuthContext();
  const { revisions, loading, stats, logRevision } = useRevisions();
  const { exportXLSX } = useReports();

  // State
  const [filterType, setFilterType] = useState<RevisionType | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<RevisionStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRevision, setSelectedRevision] = useState<Revision | null>(null);
  // showLogModal — reserved for future use

  const canEdit = hasPermission('asset.update') || hasPermission('wo.update') || hasPermission('admin.manage');
  const canDelete = hasPermission('admin.manage');
  const canExport = hasPermission('report.export');

  // ─────────────────────────────────────────
  // FILTERING
  // ─────────────────────────────────────────
  const filteredRevisions = revisions.filter((rev) => {
    if (filterType !== 'all' && rev.type !== filterType) return false;
    if (filterStatus !== 'all' && rev.status !== filterStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !(rev.title || '').toLowerCase().includes(q) &&
        !(rev.assetName || '').toLowerCase().includes(q) &&
        !(rev.revisionCompany || '').toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const alertCount = stats.expired + stats.expiring;

  // ─────────────────────────────────────────
  // LOADING
  // ─────────────────────────────────────────
  if (loading) {
    return (
      <div className="vik-page flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // ─────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────
  return (
    <div className="vik-page pb-24">
      {/* Expired Alert */}
      {stats.expired > 0 && (
        <div className="bg-red-500 text-white px-4 py-3 flex items-center gap-3">
          <Shield className="w-5 h-5 animate-pulse" />
          <div>
            <div className="font-bold">{stats.expired} prošlých revizí!</div>
            <div className="text-sm opacity-90">Kontaktujte revizní techniky</div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="vik-page-header px-4 py-4">
        <div className="vik-page-shell">
          <Breadcrumb items={[
            { label: 'Dashboard', onClick: () => navigate('/') },
            { label: 'Revize' },
          ]} />
        <div className="flex justify-between items-center gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Shield className="w-6 h-6 text-blue-400" />
              Revize
            </h1>
            {alertCount > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full animate-pulse">
                {alertCount} ⚠️
              </span>
            )}
          </div>
          {canExport && (
            <button
              onClick={() => {
                const data = filteredRevisions.map(rev => ({
                  title: rev.title,
                  type: rev.type,
                  status: rev.status,
                  assetName: rev.assetName,
                  buildingId: rev.buildingId,
                  areaName: rev.areaName,
                  lastRevisionDate: rev.lastRevisionDate,
                  nextRevisionDate: rev.nextRevisionDate,
                  revisionCompany: rev.revisionCompany,
                  certificateNumber: rev.certificateNumber,
                  intervalMonths: rev.intervalMonths,
                }));
                exportXLSX('revisions', data, { filename: `NOMINAL_revize_${new Date().toISOString().slice(0, 10)}.xlsx` });
              }}
              className="vik-button"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export</span>
            </button>
          )}
        </div>
        </div>
      </div>

      <div className="vik-page-shell p-4 space-y-4">
        {/* Semafor Stats */}
        <div className="grid grid-cols-4 gap-2">
          <button
            onClick={() => setFilterStatus('all')}
            className={`vik-card-soft p-3 text-center ${filterStatus === 'all' ? 'border-blue-500' : ''}`}
          >
            <div className="text-2xl font-bold text-white">{stats.total}</div>
            <div className="text-xs vik-muted">Celkem</div>
          </button>
          <button
            onClick={() => setFilterStatus('valid')}
            className={`vik-card-soft p-3 text-center ${filterStatus === 'valid' ? 'border-emerald-500' : ''}`}
          >
            <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
            <div className="text-2xl font-bold text-emerald-600">{stats.valid}</div>
            <div className="text-xs text-slate-500">Platné</div>
          </button>
          <button
            onClick={() => setFilterStatus('expiring')}
            className={`vik-card-soft p-3 text-center ${filterStatus === 'expiring' ? 'border-amber-500' : ''}`}
          >
            <AlertTriangle className="w-5 h-5 text-amber-500 mx-auto mb-1" />
            <div className="text-2xl font-bold text-amber-600">{stats.expiring}</div>
            <div className="text-xs text-slate-500">Končí</div>
          </button>
          <button
            onClick={() => setFilterStatus('expired')}
            className={`vik-card-soft p-3 text-center ${filterStatus === 'expired' ? 'border-red-500' : ''}`}
          >
            <AlertTriangle className="w-5 h-5 text-red-500 mx-auto mb-1 animate-pulse" />
            <div className="text-2xl font-bold text-red-600">{stats.expired}</div>
            <div className="text-xs text-slate-500">Prošlé</div>
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Hledat revizi, zařízení, firmu..."
            className="vik-input pl-10 pr-4"
          />
        </div>

        {/* Type Filter */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setFilterType('all')}
            className={`vik-chip ${
              filterType === 'all' ? 'vik-chip-active' : ''
            }`}
          >
            Vše
          </button>
          {(Object.entries(TYPE_CONFIG) as [RevisionType, { label: string; icon: string; color: string }][]).map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => setFilterType(key)}
              className={`vik-chip ${
                filterType === key ? 'vik-chip-active' : ''
              }`}
            >
              <span>{cfg.icon}</span>
              <span>{cfg.label}</span>
            </button>
          ))}
        </div>

        {/* Revisions List */}
        <div className="space-y-3">
          {filteredRevisions.length === 0 ? (
            <div className="text-center py-12">
              <Shield className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">Žádné revize</p>
            </div>
          ) : (
            filteredRevisions.map((rev) => (
              <RevisionCard
                key={rev.id}
                revision={rev}
                onClick={() => setSelectedRevision(rev)}
              />
            ))
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedRevision && (
        <RevisionDetailModal
          revision={selectedRevision}
          onClose={() => setSelectedRevision(null)}
          canEdit={canEdit}
          canDelete={canDelete}
          onLog={(data) => {
            logRevision(selectedRevision.id, data).then(() => setSelectedRevision(null));
          }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════

function RevisionCard({ revision, onClick }: { revision: Revision; onClick: () => void }) {
  const statusCfg = STATUS_CONFIG[revision.status];
  const typeCfg = TYPE_CONFIG[revision.type] || TYPE_CONFIG.other;
  const days = daysUntilRevision(revision.nextRevisionDate);

  return (
    <button
      onClick={onClick}
      className={`w-full vik-row-card p-4 text-left ${
        revision.status === 'expired' ? 'border-red-300' : ''
      }`}
    >
      <div className="flex items-center gap-4">
        {/* Type Icon */}
        <div className={`w-12 h-12 rounded-xl ${typeCfg.color} flex items-center justify-center text-2xl text-white`}>
          {typeCfg.icon}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${statusCfg.bgColor} ${statusCfg.color}`}>
              {statusCfg.label}
            </span>
            <span className="text-xs text-slate-400">{typeCfg.label}</span>
          </div>
          <h4 className="font-medium text-white truncate">{revision.title}</h4>
          <div className="flex items-center gap-3 mt-1 text-xs vik-muted">
            <span>{revision.assetName}</span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {formatRevisionDate(revision.nextRevisionDate)}
            </span>
          </div>
          <div className="text-xs text-slate-400 mt-0.5">
            {revision.revisionCompany} • {revision.certificateNumber}
          </div>
        </div>

        {/* Days counter */}
        <div className={`text-right flex-shrink-0 ${statusCfg.color}`}>
          <div className="text-lg font-bold">
            {days < 0 ? `${Math.abs(days)}d` : `${days}d`}
          </div>
          <div className="text-[10px]">
            {days < 0 ? 'po termínu' : 'zbývá'}
          </div>
        </div>

        <Edit2 className="w-4 h-4 text-slate-400 flex-shrink-0" />
      </div>
    </button>
  );
}

function RevisionDetailModal({ revision, onClose, canEdit, canDelete, onLog }: {
  revision: Revision;
  onClose: () => void;
  canEdit: boolean;
  canDelete: boolean;
  onLog: (data: { date: Date; certificateNumber: string }) => void;
}) {
  const statusCfg = STATUS_CONFIG[revision.status];
  const typeCfg = TYPE_CONFIG[revision.type] || TYPE_CONFIG.other;
  const days = daysUntilRevision(revision.nextRevisionDate);
  const { exportPDF } = useReports();

  const [showLogForm, setShowLogForm] = useState(false);
  const [logDate, setLogDate] = useState(new Date().toISOString().split('T')[0]);
  const [logCert, setLogCert] = useState('');

  const handleExportPDF = () => {
    exportPDF('revision-report', {
      revision: {
        name: revision.title,
        category: typeCfg.label,
        lastPerformedAt: revision.lastRevisionDate,
        nextDueAt: revision.nextRevisionDate,
        performedBy: revision.technicianName,
      },
      assets: [{ name: revision.assetName, areaName: revision.areaName }],
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4" onClick={onClose}>
      <div className="vik-card rounded-t-2xl md:rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-slate-900/95 border-b border-white/10 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{typeCfg.icon}</span>
            <span className={`px-2 py-1 rounded-lg text-sm font-bold ${statusCfg.bgColor} ${statusCfg.color}`}>
              {statusCfg.label}
            </span>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <h2 className="text-xl font-bold text-white">{revision.title}</h2>

          {/* Status big display */}
          <div className={`p-6 rounded-xl text-center ${statusCfg.bgColor}`}>
            <div className={`text-4xl font-bold ${statusCfg.color}`}>
              {days < 0 ? `${Math.abs(days)} dní` : `${days} dní`}
            </div>
            <div className={`text-sm ${statusCfg.color}`}>
              {days < 0 ? 'po termínu!' : 'do příští revize'}
            </div>
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="vik-card-soft p-3">
              <div className="text-xs text-slate-500 mb-1">Zařízení</div>
              <div className="font-medium text-sm">{revision.assetName}</div>
            </div>
            <div className="vik-card-soft p-3">
              <div className="text-xs text-slate-500 mb-1">Umístění</div>
              <div className="font-medium text-sm">{revision.buildingId} — {revision.areaName}</div>
            </div>
            <div className="vik-card-soft p-3">
              <div className="text-xs text-slate-500 mb-1">Interval</div>
              <div className="font-medium text-sm">{revision.intervalMonths} měsíců</div>
            </div>
            <div className="vik-card-soft p-3">
              <div className="text-xs text-slate-500 mb-1">Typ</div>
              <div className="font-medium text-sm">{typeCfg.icon} {typeCfg.label}</div>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="vik-card-soft p-3">
              <div className="text-xs text-slate-500 mb-1">Poslední revize</div>
              <div className="font-medium">{formatRevisionDate(revision.lastRevisionDate)}</div>
            </div>
            <div className={`vik-card-soft p-3 ${revision.status === 'expired' ? 'border-red-500/40' : ''}`}>
              <div className="text-xs text-slate-500 mb-1">Příští revize</div>
              <div className={`font-bold ${statusCfg.color}`}>
                {formatRevisionDate(revision.nextRevisionDate)}
              </div>
            </div>
          </div>

          {/* Company & Certificate */}
          <div className="vik-card-soft p-3">
            <div className="text-xs text-slate-500 mb-1">Revizní firma</div>
            <div className="font-medium">{revision.revisionCompany}</div>
            <div className="text-sm text-slate-500">{revision.technicianName}</div>
          </div>
          <div className="vik-card-soft p-3">
            <div className="text-xs text-slate-500 mb-1">Číslo revizní zprávy</div>
            <div className="font-mono font-medium">{revision.certificateNumber}</div>
          </div>

          {/* Notes */}
          {revision.notes && (
            <div className="vik-card-soft border-amber-500/30 p-3">
              <div className="text-xs text-amber-700 font-bold mb-1">Poznámka</div>
              <div className="text-sm text-amber-800">{revision.notes}</div>
            </div>
          )}

          {/* Export PDF */}
          <button
            onClick={handleExportPDF}
            className="vik-button w-full"
          >
            <Download className="w-5 h-5" />
            Export PDF
          </button>

          {/* Delete */}
          {canDelete && (
            <button
              onClick={async () => {
                if (window.confirm(`Opravdu smazat revizi "${revision.title}"?`)) {
                  await deleteDoc(doc(db, 'revisions', revision.id));
                  onClose();
                }
              }}
              className="vik-button vik-button-danger w-full"
            >
              <Trash2 className="w-4 h-4" />
              Smazat revizi
            </button>
          )}

          {/* Log new revision */}
          {canEdit && !showLogForm && (
            <button
              onClick={() => setShowLogForm(true)}
              className="vik-button vik-button-primary w-full"
            >
              <Shield className="w-5 h-5" />
              Zapsat novou revizi
            </button>
          )}

          {showLogForm && (
            <div className="border-t border-white/10 pt-4 space-y-3">
              <div className="text-sm font-bold text-slate-700">Zápis nové revize</div>
              <input
                type="date"
                value={logDate}
                onChange={(e) => setLogDate(e.target.value)}
                className="vik-input"
              />
              <input
                type="text"
                value={logCert}
                onChange={(e) => setLogCert(e.target.value)}
                placeholder="Číslo revizní zprávy"
                className="vik-input"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setShowLogForm(false)}
                  className="vik-button flex-1"
                >
                  Zrušit
                </button>
                <button
                  onClick={() => {
                    if (logCert.trim()) {
                      onLog({ date: new Date(logDate), certificateNumber: logCert.trim() });
                    }
                  }}
                  disabled={!logCert.trim()}
                  className="vik-button vik-button-primary flex-1 disabled:opacity-50"
                >
                  Potvrdit
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
