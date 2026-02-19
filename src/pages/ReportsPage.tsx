// src/pages/ReportsPage.tsx
// VIKRR — Asset Shield — Reporty a statistiky (REAL DATA driven)

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthContext } from '../context/AuthContext';
import {
  BarChart3,
  FileSpreadsheet, ArrowLeft,
  Wrench, Clock, AlertTriangle,
  PieChart, Activity, Printer, Flame,
  ChevronDown, Table2, Filter,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

interface TaskRow {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  assetName?: string;
  assignedToName?: string;
  completedBy?: string;
  resolution?: string;
  durationMinutes?: number;
  workType?: string;
  createdAt?: any;
  completedAt?: any;
}

interface InspectionLogRow {
  id: string;
  areaId: string;
  areaLabel?: string;
  inspectorName?: string;
  status: string;
  totalPoints?: number;
  okCount?: number;
  issueCount?: number;
  timestamp?: any;
}

// ═══════════════════════════════════════════════════════════════════
// FIRESTORE HOOKS
// ═══════════════════════════════════════════════════════════════════

function useReportData() {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [inspections, setInspections] = useState<InspectionLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let tasksReady = false, inspReady = false;
    const done = () => { if (tasksReady && inspReady) setLoading(false); };

    const unsub1 = onSnapshot(collection(db, 'tasks'), (snap) => {
      setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() } as TaskRow)));
      tasksReady = true; done();
    }, () => { tasksReady = true; done(); });

    const unsub2 = onSnapshot(collection(db, 'inspection_logs'), (snap) => {
      setInspections(snap.docs.map(d => ({ id: d.id, ...d.data() } as InspectionLogRow)));
      inspReady = true; done();
    }, () => { inspReady = true; done(); });

    return () => { unsub1(); unsub2(); };
  }, []);

  return { tasks, inspections, loading };
}

// ═══════════════════════════════════════════════════════════════════
// DATE HELPERS
// ═══════════════════════════════════════════════════════════════════

function toDate(val: any): Date | null {
  if (!val) return null;
  if (val.toDate) return val.toDate();
  if (val instanceof Date) return val;
  return new Date(val);
}

function fmtDateTime(val: any): string {
  const d = toDate(val);
  if (!d) return '—';
  return d.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
}

const MONTH_NAMES = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];

function getDateRange(range: 'week' | 'month' | 'quarter' | 'year'): { start: Date; end: Date; label: string } {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  let start: Date;
  let label: string;

  switch (range) {
    case 'week': {
      start = new Date(end);
      start.setDate(start.getDate() - 7);
      label = 'Poslední týden';
      break;
    }
    case 'month': {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      label = `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;
      break;
    }
    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3);
      start = new Date(now.getFullYear(), q * 3, 1);
      label = `Q${q + 1} ${now.getFullYear()}`;
      break;
    }
    case 'year': {
      start = new Date(now.getFullYear(), 0, 1);
      label = `${now.getFullYear()}`;
      break;
    }
  }
  return { start, end, label };
}

// ═══════════════════════════════════════════════════════════════════
// COMPUTED STATS FROM REAL DATA
// ═══════════════════════════════════════════════════════════════════

function computeKPI(tasks: TaskRow[]) {
  let completed = 0, inProgress = 0, backlog = 0, cancelled = 0;
  for (const t of tasks) {
    if (t.status === 'completed') completed++;
    else if (t.status === 'in_progress') inProgress++;
    else if (t.status === 'backlog' || t.status === 'planned') backlog++;
    else if (t.status === 'cancelled') cancelled++;
  }
  return [
    { label: 'Dokončeno', value: completed, color: 'bg-emerald-500' },
    { label: 'Probíhá', value: inProgress, color: 'bg-amber-500' },
    { label: 'Čeká', value: backlog, color: 'bg-slate-400' },
    { label: 'Zrušeno', value: cancelled, color: 'bg-red-400' },
  ];
}

function computeMonthlyTrend(allTasks: TaskRow[]) {
  const now = new Date();
  const months: { month: string; completed: number; created: number }[] = [];
  for (let i = 4; i >= 0; i--) {
    const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mEnd = new Date(m.getFullYear(), m.getMonth() + 1, 0, 23, 59, 59);
    let completed = 0, created = 0;
    for (const t of allTasks) {
      const cd = toDate(t.createdAt);
      if (cd && cd >= m && cd <= mEnd) created++;
      const dd = toDate(t.completedAt);
      if (dd && dd >= m && dd <= mEnd) completed++;
    }
    months.push({ month: MONTH_NAMES[m.getMonth()], completed, created });
  }
  return months;
}

function computeCategories(tasks: TaskRow[]) {
  let corrective = 0, preventive = 0, inspection = 0, improvement = 0;
  for (const t of tasks) {
    const p = t.priority || '';
    const wt = t.workType || '';
    if (p === 'P4' || wt === 'projekt_milan') improvement++;
    else if (wt === 'revize' || wt === 'sanitace') inspection++;
    else if (p === 'P1' || p === 'P2') corrective++;
    else preventive++;
  }
  const total = corrective + preventive + inspection + improvement || 1;
  return [
    { name: 'Opravy', value: Math.round((corrective / total) * 100), color: 'bg-red-500' },
    { name: 'Preventivní', value: Math.round((preventive / total) * 100), color: 'bg-blue-500' },
    { name: 'Kontroly', value: Math.round((inspection / total) * 100), color: 'bg-amber-500' },
    { name: 'Zlepšení', value: Math.round((improvement / total) * 100), color: 'bg-emerald-500' },
  ];
}

function computeMachineDowntime(tasks: TaskRow[]) {
  const byAsset = new Map<string, { hours: number; incidents: number }>();
  for (const t of tasks) {
    if (!t.assetName) continue;
    const entry = byAsset.get(t.assetName) || { hours: 0, incidents: 0 };
    entry.incidents++;
    entry.hours += (t.durationMinutes || 0) / 60;
    byAsset.set(t.assetName, entry);
  }
  return [...byAsset.entries()]
    .map(([name, data]) => ({ name, hours: Math.round(data.hours * 10) / 10, incidents: data.incidents }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 6);
}

function computeTechnicians(tasks: TaskRow[]) {
  const byTech = new Map<string, { tasks: number; totalMin: number }>();
  for (const t of tasks) {
    const name = t.completedBy || t.assignedToName;
    if (!name) continue;
    const entry = byTech.get(name) || { tasks: 0, totalMin: 0 };
    entry.tasks++;
    entry.totalMin += t.durationMinutes || 0;
    byTech.set(name, entry);
  }
  const colors = ['#16a34a', '#64748b', '#0ea5e9', '#f59e0b', '#a855f7', '#ef4444'];
  return [...byTech.entries()]
    .map(([name, data], i) => ({
      name,
      tasks: data.tasks,
      avgTime: data.tasks > 0 ? Math.round(data.totalMin / data.tasks) : 0,
      color: colors[i % colors.length],
    }))
    .sort((a, b) => b.tasks - a.tasks)
    .slice(0, 6);
}

function computeTasksStats(tasks: TaskRow[]) {
  const completed = tasks.filter(t => t.status === 'completed');
  const total = tasks.length || 1;
  const completionRate = Math.round((completed.length / total) * 100);
  const withDuration = completed.filter(t => t.durationMinutes && t.durationMinutes > 0);
  const avgMinutes = withDuration.length > 0
    ? Math.round(withDuration.reduce((s, t) => s + (t.durationMinutes || 0), 0) / withDuration.length)
    : 0;
  const p1Tasks = completed.filter(t => t.priority === 'P1');
  const p1Avg = p1Tasks.length > 0
    ? Math.round(p1Tasks.filter(t => t.durationMinutes).reduce((s, t) => s + (t.durationMinutes || 0), 0) / p1Tasks.length)
    : 0;
  const byPriority = [
    { priority: 'P1', label: 'Havárie', count: tasks.filter(t => t.priority === 'P1').length, color: 'bg-red-500' },
    { priority: 'P2', label: 'Urgentní', count: tasks.filter(t => t.priority === 'P2').length, color: 'bg-orange-500' },
    { priority: 'P3', label: 'Plánované', count: tasks.filter(t => t.priority === 'P3').length, color: 'bg-blue-500' },
    { priority: 'P4', label: 'Zlepšení', count: tasks.filter(t => t.priority === 'P4').length, color: 'bg-slate-400' },
  ];
  return { completionRate, avgMinutes, p1Avg, byPriority };
}

// ═══════════════════════════════════════════════════════════════════
// EXPORT — CSV
// ═══════════════════════════════════════════════════════════════════

function exportCSV(rows: TaskRow[], rangeLabel: string) {
  const header = ['Datum vytvoření', 'Datum dokončení', 'Priorita', 'Status', 'Stroj/Zařízení', 'Úkol', 'Popis', 'Řešení', 'Technik', 'Čas (min)', 'Typ práce'];
  const csvRows = rows.map(t => [
    fmtDateTime(t.createdAt), fmtDateTime(t.completedAt), t.priority || '', t.status || '',
    t.assetName || '', t.title || '',
    (t.description || '').replace(/[\n\r]+/g, ' '), (t.resolution || '').replace(/[\n\r]+/g, ' '),
    t.completedBy || t.assignedToName || '',
    t.durationMinutes != null ? String(t.durationMinutes) : '', t.workType || '',
  ]);
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const csv = [header.map(escape).join(';'), ...csvRows.map(r => r.map(escape).join(';'))].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `VIKRR_Report_${rangeLabel.replace(/\s+/g, '_')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════════════════════
// EXPORT — PDF via window.print()
// ═══════════════════════════════════════════════════════════════════

function exportPDF(tasks: TaskRow[], inspections: InspectionLogRow[], rangeLabel: string) {
  const w = window.open('', '_blank');
  if (!w) return;
  const taskRows = tasks.map(t => `<tr>
    <td>${fmtDateTime(t.createdAt)}</td><td>${fmtDateTime(t.completedAt)}</td>
    <td><strong>${t.priority || ''}</strong></td><td>${t.assetName || '—'}</td>
    <td>${t.title || ''}</td><td class="wrap">${t.resolution || '—'}</td>
    <td>${t.completedBy || t.assignedToName || '—'}</td>
    <td>${t.durationMinutes != null ? t.durationMinutes + ' min' : '—'}</td>
  </tr>`).join('');
  const inspRows = inspections.map(i => `<tr>
    <td>${fmtDateTime(i.timestamp)}</td><td>${i.areaLabel || i.areaId}</td>
    <td>${i.inspectorName || '—'}</td><td>${i.status === 'ok' ? '✅ OK' : '⚠️ Závada'}</td>
    <td>${i.totalPoints || 0}</td><td>${i.okCount || 0}</td><td>${i.issueCount || 0}</td>
  </tr>`).join('');

  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>VIKRR Report — ${rangeLabel}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1e293b; padding: 20px; }
      h1 { font-size: 16px; margin-bottom: 4px; }
      h2 { font-size: 13px; margin: 20px 0 8px; color: #475569; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px; }
      .subtitle { color: #64748b; font-size: 11px; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
      th { background: #f1f5f9; text-align: left; padding: 6px 8px; font-size: 10px; text-transform: uppercase; color: #475569; border: 1px solid #e2e8f0; }
      td { padding: 5px 8px; border: 1px solid #e2e8f0; vertical-align: top; font-size: 10.5px; }
      td.wrap { max-width: 200px; word-wrap: break-word; white-space: pre-wrap; }
      tr:nth-child(even) { background: #f8fafc; }
      @media print { body { padding: 10px; } }
    </style></head><body>
    <h1>Nominal CMMS — Technický report událostí</h1>
    <div class="subtitle">${rangeLabel} · Vygenerováno: ${new Date().toLocaleDateString('cs-CZ')} · VIKRR Asset Shield</div>
    <h2>Úkoly a opravy (${tasks.length})</h2>
    <table><thead><tr><th>Vytvořeno</th><th>Dokončeno</th><th>Prior.</th><th>Stroj</th><th>Úkol</th><th>Řešení</th><th>Technik</th><th>Čas</th></tr></thead>
    <tbody>${taskRows || '<tr><td colspan="8">Žádné záznamy</td></tr>'}</tbody></table>
    ${inspections.length > 0 ? `<h2>Kontroly budov (${inspections.length})</h2>
    <table><thead><tr><th>Datum</th><th>Oblast</th><th>Inspektor</th><th>Výsledek</th><th>Bodů</th><th>OK</th><th>Závad</th></tr></thead>
    <tbody>${inspRows}</tbody></table>` : ''}
  </body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 300);
}

// ═══════════════════════════════════════════════════════════════════
// FAILURE KEYWORD ANALYSIS
// ═══════════════════════════════════════════════════════════════════

const FAILURE_KEYWORDS = [
  { key: 'ložisko', label: 'Ložiska', icon: '🔩' },
  { key: 'řemen', label: 'Řemeny', icon: '🔗' },
  { key: 'těsnění', label: 'Těsnění', icon: '💧' },
  { key: 'motor', label: 'Motor/Pohon', icon: '⚡' },
  { key: 'ucpa', label: 'Ucpání/Čištění', icon: '🧹' },
  { key: 'čištěn', label: 'Ucpání/Čištění', icon: '🧹' },
  { key: 'vibra', label: 'Vibrace', icon: '📳' },
  { key: 'olej', label: 'Olej/Mazání', icon: '🛢️' },
  { key: 'mazá', label: 'Olej/Mazání', icon: '🛢️' },
  { key: 'elektr', label: 'Elektro', icon: '🔌' },
  { key: 'senzor', label: 'Senzory/Čidla', icon: '📡' },
  { key: 'čidl', label: 'Senzory/Čidla', icon: '📡' },
  { key: 'filtr', label: 'Filtry', icon: '🌀' },
  { key: 'ventil', label: 'Ventily', icon: '🔧' },
  { key: 'hadice', label: 'Hadice', icon: '🔧' },
];

function analyzeFailures(tasks: TaskRow[]) {
  const byAsset = new Map<string, TaskRow[]>();
  for (const t of tasks) {
    if (!t.assetName || (!t.resolution && !t.description)) continue;
    const list = byAsset.get(t.assetName) || [];
    list.push(t);
    byAsset.set(t.assetName, list);
  }
  const results: { machine: string; top3: { label: string; icon: string; count: number }[] }[] = [];
  for (const [machine, machineTasks] of byAsset) {
    const counts = new Map<string, { label: string; icon: string; count: number }>();
    for (const t of machineTasks) {
      const text = ((t.resolution || '') + ' ' + (t.description || '')).toLowerCase();
      const seen = new Set<string>();
      for (const kw of FAILURE_KEYWORDS) {
        if (text.includes(kw.key) && !seen.has(kw.label)) {
          seen.add(kw.label);
          const existing = counts.get(kw.label);
          if (existing) existing.count++;
          else counts.set(kw.label, { label: kw.label, icon: kw.icon, count: 1 });
        }
      }
    }
    const top3 = [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 3);
    if (top3.length > 0) results.push({ machine, top3 });
  }
  return results.sort((a, b) => (b.top3[0]?.count || 0) - (a.top3[0]?.count || 0)).slice(0, 6);
}

// ═══════════════════════════════════════════════════════════════════
// FAILURE HEATMAP COMPONENT
// ═══════════════════════════════════════════════════════════════════

function FailureHeatmap({ tasks }: { tasks: TaskRow[] }) {
  const heatmap = analyzeFailures(tasks);
  if (heatmap.length === 0) {
    return (
      <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10">
        <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
          <Flame className="w-5 h-5 text-orange-400" /> Mapa poruch
        </h3>
        <p className="text-sm text-slate-500">Nedostatek dat — vyplňujte pole &ldquo;Řešení&rdquo; při dokončování úkolů.</p>
      </div>
    );
  }
  return (
    <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10">
      <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
        <Flame className="w-5 h-5 text-orange-400" /> Top 3 nejčastější závady
      </h3>
      <p className="text-xs text-slate-500 mb-4">Analýza klíčových slov z řešení úkolů</p>
      <div className="space-y-4">
        {heatmap.map((item) => (
          <div key={item.machine} className="bg-white/5 rounded-xl p-3">
            <div className="text-sm font-semibold text-white mb-2">{item.machine}</div>
            <div className="flex gap-2">
              {item.top3.map((issue, i) => {
                const maxCount = item.top3[0]?.count || 1;
                const intensity = Math.max(0.3, issue.count / maxCount);
                return (
                  <div key={i} className="flex-1 rounded-lg p-2 text-center border transition"
                    style={{ backgroundColor: `rgba(249, 115, 22, ${intensity * 0.25})`, borderColor: `rgba(249, 115, 22, ${intensity * 0.5})` }}>
                    <div className="text-lg">{issue.icon}</div>
                    <div className="text-[11px] font-medium text-white mt-1">{issue.label}</div>
                    <div className="text-[10px] text-orange-400 font-bold">{issue.count}x</div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// DATA EXPLORER TABLE
// ═══════════════════════════════════════════════════════════════════

function DataExplorer({ tasks }: { tasks: TaskRow[] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? tasks : tasks.slice(0, 10);
  const STATUS_LABELS: Record<string, string> = {
    backlog: 'Backlog', planned: 'Plán', in_progress: 'Probíhá', paused: 'Pauza', completed: 'Hotovo', cancelled: 'Zrušeno',
  };

  return (
    <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
      <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Table2 className="w-5 h-5 text-sky-400" /> Data Explorer
        </h3>
        <span className="text-xs text-slate-500">{tasks.length} záznamů</span>
      </div>
      {tasks.length === 0 ? (
        <div className="p-8 text-center text-slate-500 text-sm">Žádné úkoly v tomto období</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-slate-500 uppercase tracking-wider">
                  <th className="px-4 py-2.5">Datum</th>
                  <th className="px-4 py-2.5">Prior.</th>
                  <th className="px-4 py-2.5">Stav</th>
                  <th className="px-4 py-2.5">Zařízení</th>
                  <th className="px-4 py-2.5">Úkol</th>
                  <th className="px-4 py-2.5">Technik</th>
                  <th className="px-4 py-2.5 text-right">Čas</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((t) => (
                  <tr key={t.id} className="border-t border-white/5 hover:bg-white/5 transition">
                    <td className="px-4 py-2 text-slate-400 text-xs whitespace-nowrap">{fmtDateTime(t.createdAt)}</td>
                    <td className="px-4 py-2">
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                        t.priority === 'P1' ? 'bg-red-500/20 text-red-400' :
                        t.priority === 'P2' ? 'bg-orange-500/20 text-orange-400' :
                        t.priority === 'P3' ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-500/20 text-slate-400'
                      }`}>{t.priority || '—'}</span>
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-400">{STATUS_LABELS[t.status] || t.status}</td>
                    <td className="px-4 py-2 text-xs text-white font-medium max-w-[140px] truncate">{t.assetName || '—'}</td>
                    <td className="px-4 py-2 text-xs text-white max-w-[200px] truncate">{t.title}</td>
                    <td className="px-4 py-2 text-xs text-slate-400">{t.completedBy || t.assignedToName || '—'}</td>
                    <td className="px-4 py-2 text-xs text-slate-400 text-right">{t.durationMinutes ? `${t.durationMinutes}m` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {tasks.length > 10 && (
            <button onClick={() => setExpanded(!expanded)}
              className="w-full py-3 text-sm text-sky-400 hover:text-sky-300 font-medium flex items-center justify-center gap-1 border-t border-white/5 transition">
              <ChevronDown className={`w-4 h-4 transition ${expanded ? 'rotate-180' : ''}`} />
              {expanded ? 'Zobrazit méně' : `Zobrazit všech ${tasks.length}`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function ReportsPage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuthContext();
  const { tasks: allTasks, inspections: allInspections, loading } = useReportData();
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'quarter' | 'year'>('month');
  const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'machines' | 'team'>('overview');
  const [filterAsset, setFilterAsset] = useState('');
  const [filterTech, setFilterTech] = useState('');

  const canExport = hasPermission('report.export');

  // Date range
  const { start, end, label: rangeLabel } = useMemo(() => getDateRange(dateRange), [dateRange]);

  // Filter by date + asset + technician
  const filteredTasks = useMemo(() => {
    return allTasks
      .filter(t => {
        const d = toDate(t.createdAt);
        if (!d || d < start || d > end) return false;
        if (filterAsset && t.assetName !== filterAsset) return false;
        if (filterTech) {
          const tech = t.completedBy || t.assignedToName || '';
          if (tech !== filterTech) return false;
        }
        return true;
      })
      .sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0));
  }, [allTasks, start, end, filterAsset, filterTech]);

  const filteredInspections = useMemo(() => {
    return allInspections
      .filter(i => { const d = toDate(i.timestamp); return d && d >= start && d <= end; })
      .sort((a, b) => (toDate(b.timestamp)?.getTime() || 0) - (toDate(a.timestamp)?.getTime() || 0));
  }, [allInspections, start, end]);

  // Unique asset names & technicians for filter dropdowns
  const assetOptions = useMemo(() => {
    const set = new Set<string>();
    allTasks.forEach(t => { if (t.assetName) set.add(t.assetName); });
    return [...set].sort();
  }, [allTasks]);

  const techOptions = useMemo(() => {
    const set = new Set<string>();
    allTasks.forEach(t => { const n = t.completedBy || t.assignedToName; if (n) set.add(n); });
    return [...set].sort();
  }, [allTasks]);

  // Computed stats
  const kpi = useMemo(() => computeKPI(filteredTasks), [filteredTasks]);
  const monthlyTrend = useMemo(() => computeMonthlyTrend(allTasks), [allTasks]);
  const categories = useMemo(() => computeCategories(filteredTasks), [filteredTasks]);
  const machineDowntime = useMemo(() => computeMachineDowntime(filteredTasks), [filteredTasks]);
  const technicians = useMemo(() => computeTechnicians(filteredTasks), [filteredTasks]);
  const taskStats = useMemo(() => computeTasksStats(filteredTasks), [filteredTasks]);
  const maxTechTasks = useMemo(() => Math.max(...technicians.map(t => t.tasks), 1), [technicians]);
  const maxBar = useMemo(() => Math.max(...monthlyTrend.map(m => Math.max(m.completed, m.created)), 1), [monthlyTrend]);

  const handleExport = useCallback((format: 'csv' | 'pdf') => {
    if (format === 'csv') exportCSV(filteredTasks, rangeLabel);
    else exportPDF(filteredTasks, filteredInspections, rangeLabel);
  }, [filteredTasks, filteredInspections, rangeLabel]);

  const fmtMin = (m: number) => m >= 60 ? `${(m / 60).toFixed(1)}h` : `${m}min`;

  return (
    <div className="min-h-screen bg-[#0f172a]">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[300px] h-[300px] md:w-[500px] md:h-[500px] bg-blue-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[300px] h-[300px] md:w-[500px] md:h-[500px] bg-purple-500/10 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 pb-24">
        {/* Header */}
        <header className="p-6">
          <button onClick={() => navigate('/')} className="flex items-center gap-2 text-slate-400 hover:text-white mb-4 transition">
            <ArrowLeft className="w-5 h-5" /> Dashboard
          </button>

          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-br from-sky-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-sky-500/25">
                <BarChart3 className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Reporty & Statistiky</h1>
                <p className="text-slate-400 text-sm">
                  {loading ? 'Načítám...' : `${filteredTasks.length} úkolů · ${filteredInspections.length} kontrol · ${rangeLabel}`}
                </p>
              </div>
            </div>
            {canExport && (
              <div className="flex gap-2">
                <button onClick={() => handleExport('csv')} className="flex items-center gap-2 px-4 py-2 bg-emerald-500/20 text-emerald-400 rounded-xl hover:bg-emerald-500/30 transition active:scale-95">
                  <FileSpreadsheet className="w-4 h-4" /><span className="hidden sm:inline">CSV</span>
                </button>
                <button onClick={() => handleExport('pdf')} className="flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 rounded-xl hover:bg-red-500/30 transition active:scale-95">
                  <Printer className="w-4 h-4" /><span className="hidden sm:inline">PDF</span>
                </button>
              </div>
            )}
          </div>

          {/* Date Range */}
          <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
            {([
              { id: 'week', label: 'Týden' }, { id: 'month', label: 'Měsíc' },
              { id: 'quarter', label: 'Čtvrtletí' }, { id: 'year', label: 'Rok' },
            ] as const).map(r => (
              <button key={r.id} onClick={() => setDateRange(r.id)}
                className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition ${
                  dateRange === r.id ? 'bg-white text-slate-900' : 'bg-white/5 text-slate-400 hover:bg-white/10'
                }`}>{r.label}</button>
            ))}
          </div>

          {/* Asset & Technician Filters */}
          <div className="flex gap-2 flex-wrap">
            <div className="relative">
              <Filter className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              <select value={filterAsset} onChange={(e) => setFilterAsset(e.target.value)}
                className="pl-8 pr-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-slate-300 focus:outline-none focus:border-sky-500/50 appearance-none min-w-[160px]">
                <option value="">Všechna zařízení</option>
                {assetOptions.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div className="relative">
              <Filter className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              <select value={filterTech} onChange={(e) => setFilterTech(e.target.value)}
                className="pl-8 pr-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-slate-300 focus:outline-none focus:border-sky-500/50 appearance-none min-w-[160px]">
                <option value="">Všichni technici</option>
                {techOptions.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            {(filterAsset || filterTech) && (
              <button onClick={() => { setFilterAsset(''); setFilterTech(''); }}
                className="px-3 py-2 rounded-xl bg-orange-500/20 text-orange-400 text-sm font-medium hover:bg-orange-500/30 transition">
                Zrušit filtry
              </button>
            )}
          </div>
        </header>

        {/* Tabs */}
        <div className="px-6 mb-6">
          <div className="flex gap-1 bg-white/5 p-1 rounded-xl">
            {([
              { id: 'overview', label: 'Přehled', icon: PieChart },
              { id: 'tasks', label: 'Úkoly', icon: Wrench },
              { id: 'machines', label: 'Stroje', icon: Activity },
              { id: 'team', label: 'Tým', icon: Clock },
            ] as const).map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition ${
                  activeTab === tab.id ? 'bg-white text-slate-900' : 'text-slate-400 hover:text-white'
                }`}>
                <tab.icon className="w-4 h-4" /><span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 space-y-6">
          {activeTab === 'overview' && (
            <>
              {/* KPI Cards — REAL DATA */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {kpi.map((stat, i) => (
                  <div key={i} className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 border border-white/10">
                    <div className={`w-3 h-3 rounded-full ${stat.color} mb-3`} />
                    <div className="text-3xl font-bold text-white mb-1">{stat.value}</div>
                    <div className="text-sm text-slate-400">{stat.label}</div>
                  </div>
                ))}
              </div>

              {/* Monthly Trend — REAL DATA */}
              <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10">
                <h3 className="text-lg font-bold text-white mb-4">Měsíční trend</h3>
                <div className="space-y-3">
                  {monthlyTrend.map((month, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <span className="w-20 text-sm text-slate-400">{month.month}</span>
                      <div className="flex-1 flex gap-1 h-6">
                        <div className="bg-emerald-500 rounded-l" style={{ width: `${(month.completed / maxBar) * 50}%` }} title={`Dokončeno: ${month.completed}`} />
                        <div className="bg-blue-500 rounded-r" style={{ width: `${(month.created / maxBar) * 50}%` }} title={`Vytvořeno: ${month.created}`} />
                      </div>
                      <span className="text-sm text-slate-400 w-16 text-right">{month.completed}/{month.created}</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-4 mt-4 text-xs text-slate-400">
                  <span className="flex items-center gap-1"><div className="w-3 h-3 bg-emerald-500 rounded" /> Dokončeno</span>
                  <span className="flex items-center gap-1"><div className="w-3 h-3 bg-blue-500 rounded" /> Vytvořeno</span>
                </div>
              </div>

              {/* Categories — REAL DATA */}
              <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10">
                <h3 className="text-lg font-bold text-white mb-4">Rozdělení dle typu</h3>
                <div className="flex gap-2 mb-4">
                  {categories.filter(c => c.value > 0).map((cat, i) => (
                    <div key={i} className={`h-4 ${cat.color} first:rounded-l-full last:rounded-r-full`}
                      style={{ width: `${cat.value}%` }} title={`${cat.name}: ${cat.value}%`} />
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {categories.map((cat, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded ${cat.color}`} />
                      <span className="text-sm text-slate-400">{cat.name}</span>
                      <span className="text-sm font-medium text-white ml-auto">{cat.value}%</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Data Explorer */}
              <DataExplorer tasks={filteredTasks} />
            </>
          )}

          {activeTab === 'tasks' && (
            <>
              {/* Completion rate — REAL DATA */}
              <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10">
                <h3 className="text-lg font-bold text-white mb-2">Úspěšnost dokončení</h3>
                <div className="flex items-end gap-4">
                  <span className="text-5xl font-bold text-emerald-400">{taskStats.completionRate}%</span>
                  <span className="text-slate-400 mb-2">úkolů dokončeno</span>
                </div>
                <div className="mt-4 h-3 bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all" style={{ width: `${taskStats.completionRate}%` }} />
                </div>
              </div>

              {/* Avg times — REAL DATA */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 border border-white/10">
                  <Clock className="w-6 h-6 text-blue-400 mb-2" />
                  <div className="text-2xl font-bold text-white">{taskStats.avgMinutes > 0 ? fmtMin(taskStats.avgMinutes) : '—'}</div>
                  <div className="text-sm text-slate-400">Průměrná doba opravy</div>
                </div>
                <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 border border-white/10">
                  <AlertTriangle className="w-6 h-6 text-amber-400 mb-2" />
                  <div className="text-2xl font-bold text-white">{taskStats.p1Avg > 0 ? fmtMin(taskStats.p1Avg) : '—'}</div>
                  <div className="text-sm text-slate-400">Průměr P1</div>
                </div>
              </div>

              {/* Priority breakdown — REAL DATA */}
              <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10">
                <h3 className="text-lg font-bold text-white mb-4">Dle priority</h3>
                <div className="space-y-3">
                  {taskStats.byPriority.map((p, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className={`w-8 h-8 ${p.color} rounded-lg flex items-center justify-center text-white text-xs font-bold`}>{p.priority}</span>
                      <span className="flex-1 text-slate-300">{p.label}</span>
                      <span className="text-white font-medium">{p.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Data Explorer */}
              <DataExplorer tasks={filteredTasks} />
            </>
          )}

          {activeTab === 'machines' && (
            <>
              {/* Downtime ranking — REAL DATA */}
              <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10">
                <h3 className="text-lg font-bold text-white mb-4">Zařízení dle počtu úkolů</h3>
                {machineDowntime.length === 0 ? (
                  <p className="text-sm text-slate-500">Žádná data — úkoly nemají přiřazené zařízení.</p>
                ) : (
                  <div className="space-y-3">
                    {machineDowntime.map((machine, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
                        <span className="w-8 h-8 bg-red-500/20 text-red-400 rounded-lg flex items-center justify-center font-bold">{i + 1}</span>
                        <div className="flex-1">
                          <div className="font-medium text-white">{machine.name}</div>
                          <div className="text-xs text-slate-400">{machine.incidents} úkolů</div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-red-400">{machine.hours}h</div>
                          <div className="text-xs text-slate-400">zaznamenaný čas</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Failure Heatmap */}
              <FailureHeatmap tasks={filteredTasks} />
            </>
          )}

          {activeTab === 'team' && (
            <>
              {/* Top performers — REAL DATA */}
              <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10">
                <h3 className="text-lg font-bold text-white mb-4">Technici dle výkonu</h3>
                {technicians.length === 0 ? (
                  <p className="text-sm text-slate-500">Žádná data — úkoly nemají přiřazeného technika.</p>
                ) : (
                  <div className="space-y-3">
                    {technicians.map((tech, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold" style={{ backgroundColor: tech.color }}>
                          {tech.name.charAt(0)}
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-white">{tech.name}</div>
                          <div className="text-xs text-slate-400">{tech.tasks} úkolů</div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-blue-400">{tech.avgTime > 0 ? `${tech.avgTime}min` : '—'}</div>
                          <div className="text-xs text-slate-400">průměr/úkol</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Workload distribution — REAL DATA */}
              {technicians.length > 0 && (
                <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10">
                  <h3 className="text-lg font-bold text-white mb-4">Rozložení práce</h3>
                  <div className="space-y-3">
                    {technicians.map((tech, i) => (
                      <div key={i}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-slate-300">{tech.name}</span>
                          <span className="text-slate-400">{tech.tasks} úkolů</span>
                        </div>
                        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${(tech.tasks / maxTechTasks) * 100}%`, backgroundColor: tech.color }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
