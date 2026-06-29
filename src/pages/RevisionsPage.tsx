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
import { useReports } from '../hooks/useReports';
import { Skeleton, SkeletonList } from '../components/ui';
import {
  Shield, AlertTriangle, CheckCircle2,
  Calendar, Search, X, Download, Trash2,
  ArrowLeft, ChevronRight, Zap, Flame, Gauge, Forklift, FireExtinguisher, Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { doc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useConfirm } from '../hooks/useConfirm';

// Typ revize → lucide ikona (klidná, místo barevných emoji v TYPE_CONFIG)
const TYPE_ICON: Record<RevisionType, LucideIcon> = {
  electrical: Zap,
  gas: Flame,
  pressure: Gauge,
  lifting: Forklift,
  fire: FireExtinguisher,
  other: Wrench,
};

// České skloňování „revize" pro počty
function pluralRevize(n: number): string {
  if (n === 1) return 'revize';
  if (n >= 2 && n <= 4) return 'revize';
  return 'revizí';
}

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

  // Prošlé + brzy končící revize pro kartu „Vyžaduje pozornost".
  // `revisions` jsou z hooku už seřazené (prošlé → končící → dle dní), bereme max 4 nejnaléhavější.
  const attentionRevisions = revisions
    .filter((r) => r.status === 'expired' || r.status === 'expiring')
    .slice(0, 4);

  // ─────────────────────────────────────────
  // LOADING
  // ─────────────────────────────────────────
  if (loading) {
    return (
      <div className="vik-page pb-24">
        <div className="vik-page-header px-4 py-4">
          <div className="vik-page-shell space-y-2">
            <Skeleton width="w-48" height="h-7" />
          </div>
        </div>
        <div className="vik-page-shell p-4 space-y-4">
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} height="h-20" rounded="rounded-2xl" />
            ))}
          </div>
          <Skeleton height="h-12" rounded="rounded-xl" />
          <SkeletonList rows={6} />
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────
  return (
    <div className="vik-page pb-24">
      {/* Header */}
      <div className="vik-page-header sticky top-0 z-30 px-4 py-3">
        <div className="vik-page-shell flex items-center gap-3">
          <button onClick={() => navigate('/')} aria-label="Zpět" className="p-2 rounded-lg hover:bg-slate-100">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-black flex items-center gap-2">
              <Shield className="w-6 h-6 text-emerald-700" />
              Revize
              {alertCount > 0 && (
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-black text-red-700">
                  {alertCount}
                </span>
              )}
            </h1>
            <p className="truncate text-sm font-semibold text-slate-600">Revizní zprávy a zákonné lhůty · semafor platnosti</p>
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

      <div className="vik-page-shell p-4 space-y-4">
        {/* Vyžaduje pozornost — prošlé + brzy končící revize */}
        {attentionRevisions.length > 0 && (
          <section className="rounded-2xl border border-amber-200 bg-gradient-to-b from-amber-50 to-white p-4 shadow-sm">
            <div className="eyebrow text-amber-700">Vyžaduje pozornost</div>
            <h2 className="mt-0.5 text-lg font-black text-slate-950">
              <span className="text-amber-700">{attentionRevisions.length} {pluralRevize(attentionRevisions.length)}</span> potřebuje termín
            </h2>
            <div className="mt-3 space-y-2">
              {attentionRevisions.map((rev) => {
                const Icon = TYPE_ICON[rev.type] || Wrench;
                const cfg = STATUS_CONFIG[rev.status];
                const days = daysUntilRevision(rev.nextRevisionDate);
                return (
                  <div key={rev.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 transition hover:border-amber-200">
                    <button type="button" onClick={() => setSelectedRevision(rev)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${cfg.bgColor} ${cfg.color}`}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-black text-slate-950">{rev.title}</span>
                        <span className="block truncate text-[13px] font-semibold text-slate-600">{rev.assetName} · {rev.revisionCompany}</span>
                      </span>
                    </button>
                    <span className={`hidden shrink-0 text-right sm:block ${cfg.color}`}>
                      <span className="block font-mono text-[15px] font-black leading-none">{days < 0 ? `${Math.abs(days)} d` : `${days} d`}</span>
                      <span className="block text-[11px] font-bold">{days < 0 ? 'po termínu' : 'zbývá'}</span>
                    </span>
                    {canEdit && (
                      <button type="button" onClick={() => setSelectedRevision(rev)} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-black text-white transition hover:bg-emerald-500 active:scale-95">
                        <Shield className="h-4 w-4" />Zapsat
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Semafor Stats */}
        <div className="grid grid-cols-4 gap-2">
          <button
            onClick={() => setFilterStatus('all')}
            className={`vik-card-soft p-3 text-center ${filterStatus === 'all' ? 'border-blue-500' : ''}`}
          >
            <div className="text-2xl font-bold text-slate-900">{stats.total}</div>
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
          {(Object.entries(TYPE_CONFIG) as [RevisionType, { label: string; icon: string; color: string }][]).map(([key, cfg]) => {
            const Icon = TYPE_ICON[key] || Wrench;
            return (
              <button
                key={key}
                onClick={() => setFilterType(key)}
                className={`vik-chip ${
                  filterType === key ? 'vik-chip-active' : ''
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{cfg.label}</span>
              </button>
            );
          })}
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

  const Icon = TYPE_ICON[revision.type] || Wrench;

  return (
    <button
      onClick={onClick}
      className="vik-row-card flex w-full items-center gap-3 p-3 text-left"
    >
      {/* Ikona typu — barevné pozadí dle stavu (zelená/žlutá/červená) */}
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${statusCfg.bgColor} ${statusCfg.color}`}>
        <Icon className="h-5 w-5" />
      </span>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h4 className="truncate text-[15px] font-black text-slate-950">{revision.title}</h4>
          <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-black ${statusCfg.bgColor} ${statusCfg.color}`}>
            {statusCfg.label}
          </span>
        </div>
        <div className="mt-0.5 truncate text-[12.5px] font-semibold text-slate-600">
          {typeCfg.label} · {revision.assetName}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 truncate font-mono text-[11px] text-slate-400">
          <Calendar className="h-3 w-3 shrink-0" />
          {formatRevisionDate(revision.nextRevisionDate)}
          {revision.certificateNumber ? ` · ${revision.certificateNumber}` : ''}
        </div>
      </div>

      {/* Počet dní */}
      <div className={`shrink-0 text-right ${statusCfg.color}`}>
        <div className="font-mono text-lg font-black leading-none">
          {days < 0 ? `${Math.abs(days)} d` : `${days} d`}
        </div>
        <div className="mt-0.5 text-[10px] font-bold">
          {days < 0 ? 'po termínu' : 'zbývá'}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
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
  const TypeIcon = TYPE_ICON[revision.type] || Wrench;
  const days = daysUntilRevision(revision.nextRevisionDate);
  const { exportPDF } = useReports();
  const { ask } = useConfirm();

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
        <div className="sticky top-0 bg-white border-b border-slate-200 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${statusCfg.bgColor} ${statusCfg.color}`}>
              <TypeIcon className="h-5 w-5" />
            </span>
            <span className={`px-2 py-1 rounded-lg text-sm font-bold ${statusCfg.bgColor} ${statusCfg.color}`}>
              {statusCfg.label}
            </span>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <h2 className="text-xl font-bold text-slate-900">{revision.title}</h2>

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
              <div className="font-medium text-sm flex items-center gap-1.5"><TypeIcon className="h-4 w-4 text-slate-500" /> {typeCfg.label}</div>
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
                if (await ask({ message: `Opravdu smazat revizi "${revision.title}"?`, danger: true })) {
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
            <div className="border-t border-slate-200 pt-4 space-y-3">
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
