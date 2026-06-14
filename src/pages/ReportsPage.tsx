// src/pages/ReportsPage.tsx
// VIKRR — Asset Shield — Reporty a statistiky (REAL DATA driven)

import { useState, useEffect, useMemo, useCallback } from 'react';
import { collection, limit, onSnapshot, orderBy, query, Timestamp, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthContext } from '../context/AuthContext';
import { useBackNavigation } from '../hooks/useBackNavigation';
import appConfig from '../appConfig';
import { brandFilePrefix } from '../lib/branding';
import {
  BarChart3,
  FileSpreadsheet, ArrowLeft,
  Wrench, Clock, AlertTriangle,
  PieChart, Activity, Printer, Flame,
  ChevronDown, Table2, Filter, ClipboardList, ShieldCheck,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

interface TaskRow {
  id: string;
  title: string;
  description?: string;
  type?: string;
  status: string;
  priority: string;
  source?: string;
  buildingId?: string;
  assetName?: string;
  assignedToName?: string;
  assignedWorkerNames?: string[];
  createdByName?: string;
  completedBy?: string;
  completedByNames?: string[];
  resolution?: string;
  durationMinutes?: number;
  result?: string;
  auditNote?: string;
  actualMinutes?: number;
  estimatedMinutes?: number;
  workType?: string;
  createdAt?: any;
  completedAt?: any;
  inspectionLogId?: string;
  sourceRefId?: string;
  sourceRefType?: string;
  foodSafetyRisk?: boolean;
  foodSafetyHazardType?: string;
  foodSafetyImpact?: string;
  temporaryRepair?: boolean;
  permanentFixDueDate?: any;
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
  completedAt?: any;
  completedBy?: string;
  building?: string;
  floor?: string;
  roomName?: string;
  roomCode?: string;
  defectNote?: string;
  taskId?: string;
  month?: string;
  foodSafetyRisk?: boolean;
  foodSafetyHazardType?: string;
  foodSafetyImpact?: string;
}

interface WorkLogRow {
  id: string;
  userName?: string;
  workerNames?: string[];
  completedByNames?: string[];
  type?: string;
  content?: string;
  location?: string;
  assetName?: string;
  taskId?: string;
  taskTitle?: string;
  workType?: string;
  result?: string;
  auditNote?: string;
  hoursWorked?: number;
  auditReady?: boolean;
  cleaningStatus?: 'done' | 'not_applicable';
  cleaningDone?: boolean;
  cleaningChecked?: boolean;
  cleaningNotApplicable?: boolean;
  cleaningNote?: string;
  performedAt?: any;
  createdAt?: any;
}

interface GearboxTemperatureRow {
  id: string;
  gearboxId: string;
  gearboxName: string;
  extruderId?: string | null;
  extruderName?: string | null;
  temperatureC: number;
  measuredAt?: any;
  userName?: string;
  note?: string;
  photoUrl?: string;
  createdAt?: any;
}

interface AuditTrailRow {
  id: string;
  date: any;
  area: string;
  defect: string;
  taskTitle: string;
  taskStatus: string;
  taskPriority: string;
  technician: string;
  workContent: string;
  foodSafetyRisk: boolean;
  foodSafetyHazardType: string;
  foodSafetyImpact: string;
  minutes: number;
  complete: boolean;
}

type ReportDateRange = 'week' | 'month' | 'quarter' | 'year' | 'all';

interface DeviceHistoryItem {
  id: string;
  date: Date;
  source: 'Deník' | 'Úkol' | 'Kontrola' | 'Teplota';
  asset: string;
  title: string;
  detail: string;
  person: string;
  minutes: number;
  status: string;
}

// ═══════════════════════════════════════════════════════════════════
// FIRESTORE HOOKS
// ═══════════════════════════════════════════════════════════════════

function useReportData(startDate: Date | null, endDate: Date | null) {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [inspections, setInspections] = useState<InspectionLogRow[]>([]);
  const [workLogs, setWorkLogs] = useState<WorkLogRow[]>([]);
  const [gearboxTemperatures, setGearboxTemperatures] = useState<GearboxTemperatureRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let tasksReady = false, inspReady = false, workLogsReady = false, gearboxReady = false;
    const done = () => { if (tasksReady && inspReady && workLogsReady && gearboxReady) setLoading(false); };

    const REPORT_ALL_LIMIT = 5000;

    const buildReportQuery = (collectionName: string, dateField: string) => {
      const ref = collection(db, collectionName);
      if (startDate && endDate) {
        return query(
          ref,
          where(dateField, '>=', Timestamp.fromDate(startDate)),
          where(dateField, '<=', Timestamp.fromDate(endDate))
        );
      }
      return query(ref, orderBy(dateField, 'desc'), limit(REPORT_ALL_LIMIT));
    };

    const unsub1 = onSnapshot(buildReportQuery('tasks', 'createdAt'), (snap) => {
      setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() } as TaskRow)));
      tasksReady = true; done();
    }, () => { tasksReady = true; done(); });

    const unsub2 = onSnapshot(buildReportQuery('inspection_logs', 'timestamp'), (snap) => {
      setInspections(snap.docs.map(d => ({ id: d.id, ...d.data() } as InspectionLogRow)));
      inspReady = true; done();
    }, () => { inspReady = true; done(); });

    const unsub3 = onSnapshot(buildReportQuery('workLogs', 'createdAt'), (snap) => {
      setWorkLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as WorkLogRow)));
      workLogsReady = true; done();
    }, () => { workLogsReady = true; done(); });

    const unsub4 = onSnapshot(buildReportQuery('gearbox_temperature_logs', 'createdAt'), (snap) => {
      setGearboxTemperatures(snap.docs.map(d => ({ id: d.id, ...d.data() } as GearboxTemperatureRow)));
      gearboxReady = true; done();
    }, () => { gearboxReady = true; done(); });

    return () => { unsub1(); unsub2(); unsub3(); unsub4(); };
  }, [startDate, endDate]);

  return { tasks, inspections, workLogs, gearboxTemperatures, loading };
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

function taskMinutes(task: TaskRow): number {
  return task.durationMinutes ?? task.actualMinutes ?? task.estimatedMinutes ?? 0;
}

function uniqueNames(names: Array<string | null | undefined>): string[] {
  return [...new Set(names.map((name) => String(name || '').trim()).filter(Boolean))];
}

function taskTechnicians(task: TaskRow): string[] {
  return uniqueNames([
    ...(Array.isArray(task.completedByNames) ? task.completedByNames : []),
    task.completedBy,
    ...(Array.isArray(task.assignedWorkerNames) ? task.assignedWorkerNames : []),
    task.assignedToName,
    task.createdByName,
  ]);
}

function taskTechnician(task: TaskRow): string {
  return taskTechnicians(task).join(', ');
}

function workLogTechnicians(log: WorkLogRow): string[] {
  return uniqueNames([
    ...(Array.isArray(log.workerNames) ? log.workerNames : []),
    ...(Array.isArray(log.completedByNames) ? log.completedByNames : []),
    log.userName,
  ]);
}

function workLogTechnician(log: WorkLogRow): string {
  return workLogTechnicians(log).join(', ');
}

function inspectionDate(row: InspectionLogRow): Date | null {
  return toDate(row.timestamp) || toDate(row.completedAt);
}

function inspectionArea(row: InspectionLogRow): string {
  return row.areaLabel || row.areaId || [row.building ? `Budova ${row.building}` : '', row.floor, row.roomName].filter(Boolean).join(' / ') || 'Kontrola';
}

function workLogMinutes(log: WorkLogRow): number {
  return Math.round((log.hoursWorked || 0) * 60);
}

function workLogDate(log: WorkLogRow): Date | null {
  return toDate(log.performedAt) || toDate(log.createdAt);
}

function resultLabel(value?: string): string {
  if (value === 'fixed') return 'Opraveno';
  if (value === 'monitor') return 'Sledovat';
  if (value === 'not_fixable') return 'Nelze opravit';
  if (value === 'handover') return 'Předat dál';
  return value || '';
}

function normalizeSearch(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function matchesFreeText(query: string, fields: unknown[]): boolean {
  const q = normalizeSearch(query).trim();
  if (!q) return true;
  const words = q.split(/\s+/).filter(Boolean);
  const haystack = normalizeSearch(fields.filter(Boolean).join(' '));
  return words.every((word) => haystack.includes(word));
}

function taskMatchesInspection(task: TaskRow, inspection: InspectionLogRow): boolean {
  if (inspection.taskId && task.id === inspection.taskId) return true;
  if (task.inspectionLogId && task.inspectionLogId === inspection.id) return true;
  if (task.sourceRefId && task.sourceRefId === inspection.id) return true;
  return false;
}

function workLogMatchesTask(log: WorkLogRow, task?: TaskRow): boolean {
  if (!task) return false;
  if (log.taskId && log.taskId === task.id) return true;
  if (log.taskTitle && task.title && log.taskTitle === task.title) return true;
  return false;
}

function buildAuditTrail(inspections: InspectionLogRow[], tasks: TaskRow[], workLogs: WorkLogRow[]): AuditTrailRow[] {
  const defectInspections = inspections.filter((inspection) => inspection.status === 'defect' || Boolean(inspection.defectNote));
  return defectInspections
    .map((inspection) => {
      const task = tasks.find((item) => taskMatchesInspection(item, inspection));
      const taskLogs = workLogs.filter((log) => workLogMatchesTask(log, task));
      const latestLog = taskLogs
        .slice()
        .sort((a, b) => (workLogDate(b)?.getTime() || 0) - (workLogDate(a)?.getTime() || 0))[0];
      const minutes = task ? taskMinutes(task) || taskLogs.reduce((sum, log) => sum + workLogMinutes(log), 0) : 0;
      const status = task?.status || (inspection.taskId ? 'ukol nenalezen' : 'bez ukolu');
      return {
        id: inspection.id,
        date: inspection.completedAt || inspection.timestamp,
        area: inspectionArea(inspection),
        defect: inspection.defectNote || 'Zavada bez popisu',
        taskTitle: task?.title || (inspection.taskId ? `Ukol ${inspection.taskId}` : 'Bez ukolu'),
        taskStatus: status,
        taskPriority: task?.priority || '',
        technician: latestLog ? workLogTechnician(latestLog) : taskTechnician(task || ({} as TaskRow)) || inspection.completedBy || inspection.inspectorName || '',
        workContent: latestLog?.content || task?.resolution || '',
        foodSafetyRisk: inspection.foodSafetyRisk === true || task?.foodSafetyRisk === true,
        foodSafetyHazardType: inspection.foodSafetyHazardType || task?.foodSafetyHazardType || '',
        foodSafetyImpact: inspection.foodSafetyImpact || task?.foodSafetyImpact || '',
        minutes,
        complete: Boolean(task && ['completed', 'done'].includes(task.status) && (latestLog || task.resolution)),
      };
    })
    .sort((a, b) => (toDate(b.date)?.getTime() || 0) - (toDate(a.date)?.getTime() || 0));
}

function buildDeviceHistory(tasks: TaskRow[], inspections: InspectionLogRow[], workLogs: WorkLogRow[], gearboxTemperatures: GearboxTemperatureRow[] = []): DeviceHistoryItem[] {
  const taskItems: DeviceHistoryItem[] = tasks
    .map((task) => {
      const date = toDate(task.completedAt) || toDate(task.createdAt);
      if (!date) return null;
      return {
        id: `task-${task.id}`,
        date,
        source: 'Úkol' as const,
        asset: task.assetName || task.buildingId || 'Bez zařízení',
        title: task.title || 'Úkol',
        detail: [
          task.resolution || task.description || '',
          resultLabel(task.result) ? `Výsledek: ${resultLabel(task.result)}` : '',
          task.auditNote ? `Audit: ${task.auditNote}` : '',
        ].filter(Boolean).join('\n'),
        person: taskTechnician(task) || 'Neznámý',
        minutes: taskMinutes(task),
        status: task.status || '',
      };
    })
    .filter(Boolean) as DeviceHistoryItem[];

  const logItems: DeviceHistoryItem[] = workLogs
    .map((log) => {
      const date = workLogDate(log);
      if (!date) return null;
      return {
        id: `log-${log.id}`,
        date,
        source: 'Deník' as const,
        asset: log.assetName || log.location || 'Bez zařízení',
        title: log.taskTitle || log.type || 'Zápis práce',
        detail: log.content || '',
        person: workLogTechnician(log) || 'Neznámý',
        minutes: workLogMinutes(log),
        status: log.auditReady ? 'audit ready' : '',
      };
    })
    .filter(Boolean) as DeviceHistoryItem[];

  const inspectionItems: DeviceHistoryItem[] = inspections
    .map((inspection) => {
      const date = inspectionDate(inspection);
      if (!date) return null;
      return {
        id: `inspection-${inspection.id}`,
        date,
        source: 'Kontrola' as const,
        asset: inspectionArea(inspection),
        title: inspection.defectNote || 'Kontrola',
        detail: inspection.defectNote || `${inspection.okCount || 0}/${inspection.totalPoints || 0} OK`,
        person: inspection.inspectorName || inspection.completedBy || 'Neznámý',
        minutes: 0,
        status: inspection.status || '',
      };
    })
    .filter(Boolean) as DeviceHistoryItem[];

  const gearboxTemperatureItems: DeviceHistoryItem[] = gearboxTemperatures
    .map((log) => {
      const date = toDate(log.measuredAt) || toDate(log.createdAt);
      if (!date) return null;
      return {
        id: `gearbox-temp-${log.id}`,
        date,
        source: 'Teplota' as const,
        asset: log.gearboxName || 'Převodovka',
        title: `${log.temperatureC} °C`,
        detail: [
          log.extruderName ? `Extruder: ${log.extruderName}` : '',
          log.note || '',
          log.photoUrl ? 'Fotka priložena' : '',
        ].filter(Boolean).join('\n'),
        person: log.userName || 'Neznámý',
        minutes: 0,
        status: 'audit ready',
      };
    })
    .filter(Boolean) as DeviceHistoryItem[];

  return [...taskItems, ...logItems, ...inspectionItems, ...gearboxTemperatureItems]
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}

const MONTH_NAMES = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];

function getDateRange(range: ReportDateRange): { start: Date; end: Date; label: string } {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  let start: Date;
  let label: string;

  switch (range) {
    case 'all': {
      start = new Date(2000, 0, 1);
      label = 'Vsechna data';
      break;
    }
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
    entry.hours += taskMinutes(t) / 60;
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
    const names = taskTechnicians(t);
    for (const name of names) {
      const entry = byTech.get(name) || { tasks: 0, totalMin: 0 };
      entry.tasks++;
      entry.totalMin += taskMinutes(t);
      byTech.set(name, entry);
    }
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
  const withDuration = completed.filter(t => taskMinutes(t) > 0);
  const avgMinutes = withDuration.length > 0
    ? Math.round(withDuration.reduce((s, t) => s + taskMinutes(t), 0) / withDuration.length)
    : 0;
  const p1Tasks = completed.filter(t => t.priority === 'P1');
  const p1Avg = p1Tasks.length > 0
    ? Math.round(p1Tasks.filter(t => taskMinutes(t) > 0).reduce((s, t) => s + taskMinutes(t), 0) / p1Tasks.length)
    : 0;
  const byPriority = [
    { priority: 'P1', label: 'Havárie', count: tasks.filter(t => t.priority === 'P1').length, color: 'bg-red-500' },
    { priority: 'P2', label: 'Urgentní', count: tasks.filter(t => t.priority === 'P2').length, color: 'bg-orange-500' },
    { priority: 'P3', label: 'Plánované', count: tasks.filter(t => t.priority === 'P3').length, color: 'bg-blue-500' },
    { priority: 'P4', label: 'Zlepšení', count: tasks.filter(t => t.priority === 'P4').length, color: 'bg-slate-400' },
  ];
  return { completionRate, avgMinutes, p1Avg, byPriority };
}

function computeWorkLogStats(logs: WorkLogRow[]) {
  const totalMinutes = logs.reduce((sum, log) => sum + workLogMinutes(log), 0);
  const auditReady = logs.filter((log) => log.auditReady).length;
  const byType = new Map<string, number>();
  const byTechnician = new Map<string, { count: number; minutes: number }>();

  for (const log of logs) {
    const type = log.type || 'zapis';
    byType.set(type, (byType.get(type) || 0) + 1);
    const names = workLogTechnicians(log);
    (names.length ? names : ['Neznamy']).forEach((tech) => {
      const current = byTechnician.get(tech) || { count: 0, minutes: 0 };
      current.count++;
      current.minutes += workLogMinutes(log);
      byTechnician.set(tech, current);
    });
  }

  return {
    total: logs.length,
    totalMinutes,
    auditReady,
    byType: [...byType.entries()].sort((a, b) => b[1] - a[1]),
    byTechnician: [...byTechnician.entries()]
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 8),
  };
}

function computeAuditSummary(tasks: TaskRow[], inspections: InspectionLogRow[], workLogs: WorkLogRow[]) {
  const completedTasks = tasks.filter((task) => task.status === 'completed').length;
  const defects = inspections.filter((inspection) => inspection.status === 'defect' || inspection.status === 'issue' || (inspection.issueCount || 0) > 0).length;
  const workMinutes = workLogs.reduce((sum, log) => sum + workLogMinutes(log), 0);
  const p1Open = tasks.filter((task) => task.priority === 'P1' && task.status !== 'completed' && task.status !== 'cancelled').length;
  const temporaryRepairs = tasks.filter((task) => task.temporaryRepair === true).length;
  const temporaryOpen = tasks.filter((task) => task.temporaryRepair === true && task.status !== 'completed' && task.status !== 'cancelled').length;
  const foodSafetyTasks = tasks.filter((task) => task.foodSafetyRisk === true).length;
  return { completedTasks, defects, workMinutes, p1Open, temporaryRepairs, temporaryOpen, foodSafetyTasks };
}

function temporaryRepairText(task: TaskRow) {
  if (task.temporaryRepair !== true) return '';
  const due = fmtDateTime(task.permanentFixDueDate) || 'termin nezadan';
  return `Docasna oprava: trvale reseni do ${due}`;
}

function foodSafetyTaskText(task: TaskRow) {
  if (task.foodSafetyRisk !== true) return '';
  return `Food safety: ${task.foodSafetyHazardType || 'neurceno'} / ${task.foodSafetyImpact || 'neurceno'}`;
}

function cleaningEvidenceText(log: WorkLogRow) {
  if (log.cleaningStatus === 'done' || (log.cleaningDone && log.cleaningChecked)) {
    return `Uklid a kontrola: ANO${log.cleaningNote ? ` - ${log.cleaningNote}` : ''}`;
  }
  if (log.cleaningStatus === 'not_applicable' || log.cleaningNotApplicable) {
    return `Uklid: NETYKA SE${log.cleaningNote ? ` - ${log.cleaningNote}` : ''}`;
  }
  return '';
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
    taskTechnician(t),
    t.durationMinutes != null ? String(t.durationMinutes) : '', t.workType || '',
  ]);
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const csv = [header.map(escape).join(';'), ...csvRows.map(r => r.map(escape).join(';'))].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${brandFilePrefix('Report')}_${rangeLabel.replace(/\s+/g, '_')}.csv`;
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
    <td>${taskTechnician(t) || '—'}</td>
    <td>${t.durationMinutes != null ? t.durationMinutes + ' min' : '—'}</td>
  </tr>`).join('');
  const inspRows = inspections.map(i => `<tr>
    <td>${fmtDateTime(i.timestamp)}</td><td>${i.areaLabel || i.areaId}</td>
    <td>${i.inspectorName || '—'}</td><td>${i.status === 'ok' ? '✅ OK' : '⚠️ Závada'}</td>
    <td>${i.totalPoints || 0}</td><td>${i.okCount || 0}</td><td>${i.issueCount || 0}</td>
  </tr>`).join('');

  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>${appConfig.APP_NAME} Report — ${rangeLabel}</title>
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
    <div class="subtitle">${rangeLabel} · Vygenerováno: ${new Date().toLocaleDateString('cs-CZ')} · ${appConfig.APP_NAME}</div>
    <h2>Úkoly a opravy (${tasks.length})</h2>
    <table><thead><tr><th>Vytvořeno</th><th>Dokončeno</th><th>Prior.</th><th>Stroj</th><th>Úkol</th><th>Řešení</th><th>Technik</th><th>Čas</th></tr></thead>
    <tbody>${taskRows || '<tr><td colspan="8">Žádné záznamy</td></tr>'}</tbody></table>
    ${inspections.length > 0 ? `<h2>Kontroly (${inspections.length})</h2>
    <table><thead><tr><th>Datum</th><th>Oblast</th><th>Inspektor</th><th>Výsledek</th><th>Bodů</th><th>OK</th><th>Závad</th></tr></thead>
    <tbody>${inspRows}</tbody></table>` : ''}
  </body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 300);
}

// ═══════════════════════════════════════════════════════════════════
// FAILURE KEYWORD ANALYSIS
// ═══════════════════════════════════════════════════════════════════

void exportCSV;
void exportPDF;

function exportExpandedCSV(tasks: TaskRow[], inspections: InspectionLogRow[], workLogs: WorkLogRow[], rangeLabel: string, auditTrail: AuditTrailRow[] = []) {
  const header = ['Sekce', 'Datum', 'Dokonceno', 'Priorita', 'Status/Typ', 'Misto/Zarizeni', 'Nazev/Popis', 'Technik', 'Cas (min)', 'Poznamka'];
  const auditRows = auditTrail.map((row) => [
    'Audit stopa',
    fmtDateTime(row.date),
    row.complete ? 'ANO' : 'NE',
    row.taskPriority,
    row.taskStatus,
    row.area,
    `${row.defect} -> ${row.taskTitle}`,
    row.technician,
    row.minutes ? String(row.minutes) : '',
    `${row.workContent.replace(/[\n\r]+/g, ' ')}${row.foodSafetyRisk ? ` | FOOD SAFETY: ${row.foodSafetyHazardType || 'neurceno'} / ${row.foodSafetyImpact || 'neurceno'}` : ''}`,
  ]);
  const taskRows = tasks.map((task) => [
    'Ukol',
    fmtDateTime(task.createdAt),
    fmtDateTime(task.completedAt),
    task.priority || '',
    task.status || '',
    task.assetName || task.buildingId || '',
    task.title || '',
    taskTechnician(task),
    taskMinutes(task) ? String(taskMinutes(task)) : '',
    [
      task.resolution || task.description || '',
      resultLabel(task.result) ? `Vysledek: ${resultLabel(task.result)}` : '',
      foodSafetyTaskText(task),
      temporaryRepairText(task),
      task.auditNote ? `Audit: ${task.auditNote}` : '',
    ].filter(Boolean).join(' | ').replace(/[\n\r]+/g, ' '),
  ]);
  const inspectionRows = inspections.map((inspection) => [
    'Kontrola',
    fmtDateTime(inspection.timestamp || inspection.completedAt),
    '',
    '',
    inspection.status || '',
    inspectionArea(inspection),
    inspection.defectNote || `${inspection.okCount || 0}/${inspection.totalPoints || 0} OK`,
    inspection.inspectorName || inspection.completedBy || '',
    '',
    inspection.taskId ? `Ukol: ${inspection.taskId}` : '',
  ]);
  const workRows = workLogs.map((log) => [
    'Denik udrzby',
    fmtDateTime(workLogDate(log)),
    '',
    '',
    log.type || '',
    log.assetName || log.location || '',
    log.content || '',
    workLogTechnician(log) || '',
    workLogMinutes(log) ? String(workLogMinutes(log)) : '',
    [
      log.auditReady ? 'audit ready' : '',
      cleaningEvidenceText(log),
      resultLabel(log.result) ? `Vysledek: ${resultLabel(log.result)}` : '',
      log.auditNote ? `Audit: ${log.auditNote}` : '',
    ].filter(Boolean).join(' | '),
  ]);
  const escape = (value: unknown) => `"${String(value).replace(/"/g, '""')}"`;
  const csvRows = [...auditRows, ...taskRows, ...inspectionRows, ...workRows];
  const csv = [header.map(escape).join(';'), ...csvRows.map((row) => row.map(escape).join(';'))].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${brandFilePrefix('Audit_Report')}_${rangeLabel.replace(/\s+/g, '_')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportExpandedPDF(tasks: TaskRow[], inspections: InspectionLogRow[], workLogs: WorkLogRow[], rangeLabel: string, auditTrail: AuditTrailRow[] = []) {
  const w = window.open('', '_blank');
  if (!w) return;

  const audit = computeAuditSummary(tasks, inspections, workLogs);
  const taskRows = tasks.map((task) => `<tr>
    <td>${fmtDateTime(task.createdAt)}</td><td>${fmtDateTime(task.completedAt)}</td>
    <td><strong>${task.priority || ''}</strong></td><td>${task.assetName || task.buildingId || '-'}</td>
    <td>${task.title || ''}</td><td class="wrap">${
      [
        task.resolution || task.description || '-',
        resultLabel(task.result) ? `<strong>Výsledek:</strong> ${resultLabel(task.result)}` : '',
        foodSafetyTaskText(task) ? `<strong>${foodSafetyTaskText(task)}</strong>` : '',
        temporaryRepairText(task) ? `<strong>${temporaryRepairText(task)}</strong>` : '',
        task.auditNote ? `<strong>Audit:</strong> ${task.auditNote}` : '',
      ].filter(Boolean).join('<br>')
    }</td>
    <td>${taskTechnician(task) || '-'}</td>
    <td>${taskMinutes(task) ? `${taskMinutes(task)} min` : '-'}</td>
  </tr>`).join('');
  const inspectionRows = inspections.map((inspection) => `<tr>
    <td>${fmtDateTime(inspection.timestamp || inspection.completedAt)}</td><td>${inspectionArea(inspection)}</td>
    <td>${inspection.inspectorName || inspection.completedBy || '-'}</td><td>${inspection.status || '-'}</td>
    <td>${inspection.totalPoints || 0}</td><td>${inspection.okCount || 0}</td><td>${inspection.issueCount || 0}</td>
  </tr>`).join('');
  const workRows = workLogs.map((log) => `<tr>
    <td>${fmtDateTime(workLogDate(log))}</td><td>${log.type || ''}</td>
    <td>${log.assetName || log.location || '-'}</td><td class="wrap">${
      [
        log.content || '',
        cleaningEvidenceText(log) ? `<strong>${cleaningEvidenceText(log)}</strong>` : '',
        resultLabel(log.result) ? `<strong>Výsledek:</strong> ${resultLabel(log.result)}` : '',
        log.auditNote ? `<strong>Audit:</strong> ${log.auditNote}` : '',
      ].filter(Boolean).join('<br>')
    }</td>
    <td>${workLogTechnician(log) || '-'}</td><td>${workLogMinutes(log) ? `${workLogMinutes(log)} min` : '-'}</td>
  </tr>`).join('');
  const auditRows = auditTrail.map((row) => `<tr>
    <td>${fmtDateTime(row.date)}</td><td>${row.area}</td><td class="wrap">${row.defect}</td>
    <td><strong>${row.taskPriority || ''}</strong> ${row.taskTitle}</td><td>${row.taskStatus}</td>
    <td>${row.technician || '-'}</td><td>${row.minutes ? `${row.minutes} min` : '-'}</td>
    <td class="wrap">${row.workContent || '-'}${row.foodSafetyRisk ? `<br><strong>Food safety:</strong> ${row.foodSafetyHazardType || 'neurceno'} / ${row.foodSafetyImpact || 'neurceno'}` : ''}</td><td>${row.complete ? 'ANO' : 'NE'}</td>
  </tr>`).join('');

  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>${appConfig.APP_NAME} audit report - ${rangeLabel}</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: Arial, sans-serif; font-size: 11px; color: #0f172a; padding: 18px; }
      h1 { font-size: 17px; margin: 0 0 4px; }
      h2 { font-size: 13px; margin: 18px 0 8px; color: #334155; border-bottom: 2px solid #cbd5e1; padding-bottom: 4px; }
      .subtitle { color: #64748b; margin-bottom: 14px; }
      .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0 18px; }
      .box { border: 1px solid #cbd5e1; background: #f8fafc; padding: 8px; border-radius: 6px; }
      .box strong { display: block; font-size: 16px; }
      .box span { color: #64748b; font-size: 10px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
      th { background: #f1f5f9; text-align: left; padding: 5px 6px; font-size: 9px; text-transform: uppercase; border: 1px solid #cbd5e1; }
      td { padding: 4px 6px; border: 1px solid #cbd5e1; vertical-align: top; }
      td.wrap { max-width: 220px; word-wrap: break-word; white-space: pre-wrap; }
      tr:nth-child(even) { background: #f8fafc; }
      @page { margin: 12mm; size: A4 landscape; }
    </style></head><body>
    <h1>Nominal CMMS - auditni report udalosti</h1>
    <div class="subtitle">${rangeLabel} · vygenerovano ${new Date().toLocaleDateString('cs-CZ')} · ${appConfig.APP_NAME}</div>
    <div class="summary">
      <div class="box"><strong>${audit.completedTasks}</strong><span>Dokoncene ukoly</span></div>
      <div class="box"><strong>${inspections.length}</strong><span>Kontroly</span></div>
      <div class="box"><strong>${Math.round(audit.workMinutes / 60 * 10) / 10} h</strong><span>Denik udrzby</span></div>
      <div class="box"><strong>${audit.defects}</strong><span>Zavady z kontrol</span></div>
    </div>
    <h2>Auditni stopa: kontrola -> ukol -> denik (${auditTrail.length})</h2>
    <table><thead><tr><th>Datum</th><th>Misto</th><th>Zavada</th><th>Ukol</th><th>Stav</th><th>Provedl</th><th>Cas</th><th>Zapis prace</th><th>Kompletni</th></tr></thead>
    <tbody>${auditRows || '<tr><td colspan="9">Zadne propojene zavady</td></tr>'}</tbody></table>
    <h2>Ukoly a opravy (${tasks.length})</h2>
    <table><thead><tr><th>Vytvoreno</th><th>Dokonceno</th><th>Prior.</th><th>Misto</th><th>Ukol</th><th>Reseni / popis</th><th>Technik</th><th>Cas</th></tr></thead>
    <tbody>${taskRows || '<tr><td colspan="8">Zadne zaznamy</td></tr>'}</tbody></table>
    <h2>Kontroly (${inspections.length})</h2>
    <table><thead><tr><th>Datum</th><th>Oblast</th><th>Inspektor</th><th>Vysledek</th><th>Bodu</th><th>OK</th><th>Zavad</th></tr></thead>
    <tbody>${inspectionRows || '<tr><td colspan="7">Zadne zaznamy</td></tr>'}</tbody></table>
    <h2>Denik udrzby (${workLogs.length})</h2>
    <table><thead><tr><th>Datum</th><th>Typ</th><th>Misto</th><th>Zapis</th><th>Provedl</th><th>Cas</th></tr></thead>
    <tbody>${workRows || '<tr><td colspan="6">Zadne zaznamy</td></tr>'}</tbody></table>
  </body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 300);
}

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
      <div className="bg-white rounded-2xl shadow-sm p-6 border border-slate-200">
        <h3 className="text-lg font-bold text-slate-950 mb-2 flex items-center gap-2">
          <Flame className="w-5 h-5 text-orange-700" /> Mapa poruch
        </h3>
        <p className="text-sm text-slate-500">Nedostatek dat — vyplňujte pole &ldquo;Řešení&rdquo; při dokončování úkolů.</p>
      </div>
    );
  }
  return (
    <div className="bg-white rounded-2xl shadow-sm p-6 border border-slate-200">
      <h3 className="text-lg font-bold text-slate-950 mb-1 flex items-center gap-2">
        <Flame className="w-5 h-5 text-orange-700" /> Top 3 nejčastější závady
      </h3>
      <p className="text-xs text-slate-500 mb-4">Analýza klíčových slov z řešení úkolů</p>
      <div className="space-y-4">
        {heatmap.map((item) => (
          <div key={item.machine} className="bg-slate-50 rounded-xl p-3">
            <div className="text-sm font-semibold text-slate-950 mb-2">{item.machine}</div>
            <div className="flex gap-2">
              {item.top3.map((issue, i) => {
                const maxCount = item.top3[0]?.count || 1;
                const intensity = Math.max(0.3, issue.count / maxCount);
                return (
                  <div key={i} className="flex-1 rounded-lg p-2 text-center border transition"
                    style={{ backgroundColor: `rgba(249, 115, 22, ${intensity * 0.25})`, borderColor: `rgba(249, 115, 22, ${intensity * 0.5})` }}>
                    <div className="text-lg">{issue.icon}</div>
                    <div className="text-[11px] font-medium text-slate-950 mt-1">{issue.label}</div>
                    <div className="text-[10px] text-orange-700 font-bold">{issue.count}x</div>
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
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-950 flex items-center gap-2">
          <Table2 className="w-5 h-5 text-sky-700" /> Data Explorer
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
                  <tr key={t.id} className="border-t border-slate-100 hover:bg-emerald-50 transition">
                    <td className="px-4 py-2 text-slate-600 text-xs whitespace-nowrap">{fmtDateTime(t.createdAt)}</td>
                    <td className="px-4 py-2">
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                        t.priority === 'P1' ? 'bg-red-50 text-red-700 border border-red-200' :
                        t.priority === 'P2' ? 'bg-orange-500/20 text-orange-700' :
                        t.priority === 'P3' ? 'bg-blue-500/20 text-blue-700' : 'bg-slate-500/20 text-slate-600'
                      }`}>{t.priority || '—'}</span>
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-600">{STATUS_LABELS[t.status] || t.status}</td>
                    <td className="px-4 py-2 text-xs text-slate-950 font-medium max-w-[140px] truncate">{t.assetName || '—'}</td>
                    <td className="px-4 py-2 text-xs text-slate-950 max-w-[200px] truncate">{t.title}</td>
                    <td className="px-4 py-2 text-xs text-slate-600">{taskTechnician(t) || '—'}</td>
                    <td className="px-4 py-2 text-xs text-slate-600 text-right">{t.durationMinutes ? `${t.durationMinutes}m` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {tasks.length > 10 && (
            <button onClick={() => setExpanded(!expanded)}
              className="w-full py-3 text-sm text-emerald-700 hover:text-emerald-800 font-medium flex items-center justify-center gap-1 border-t border-slate-100 transition">
              <ChevronDown className={`w-4 h-4 transition ${expanded ? 'rotate-180' : ''}`} />
              {expanded ? 'Zobrazit méně' : `Zobrazit všech ${tasks.length}`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function WorkLogExplorer({ logs }: { logs: WorkLogRow[] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? logs : logs.slice(0, 12);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-950 flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-amber-400" /> Denik udrzby
        </h3>
        <span className="text-xs text-slate-500">{logs.length} zapisu</span>
      </div>
      {logs.length === 0 ? (
        <div className="p-8 text-center text-slate-500 text-sm">Zadne zapisy v tomto obdobi</div>
      ) : (
        <>
          <div className="divide-y divide-slate-100">
            {shown.map((log) => (
              <div key={log.id} className="p-4 hover:bg-emerald-50 transition">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-slate-500">provedeno {fmtDateTime(workLogDate(log))} · {log.type || 'zapis'}</div>
                    <div className="font-medium text-slate-950 mt-1">{log.assetName || log.location || 'Bez mista'}</div>
                    <div className="text-sm text-slate-700 mt-1 whitespace-pre-wrap">{log.content || '-'}</div>
                    <div className="text-xs text-slate-500 mt-2">{workLogTechnician(log) || 'Neznamy'}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold text-amber-700">{workLogMinutes(log) ? `${workLogMinutes(log)}m` : '-'}</div>
                    {log.auditReady && <div className="text-[10px] text-emerald-700 mt-1">audit</div>}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {logs.length > 12 && (
            <button onClick={() => setExpanded(!expanded)}
              className="w-full py-3 text-sm text-emerald-700 hover:text-emerald-800 font-medium flex items-center justify-center gap-1 border-t border-slate-100 transition">
              <ChevronDown className={`w-4 h-4 transition ${expanded ? 'rotate-180' : ''}`} />
              {expanded ? 'Zobrazit mene' : `Zobrazit vsech ${logs.length}`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function DeviceHistoryPanel({
  items,
  query,
  asset,
  rangeLabel,
  onAllTime,
}: {
  items: DeviceHistoryItem[];
  query: string;
  asset: string;
  rangeLabel: string;
  onAllTime: () => void;
}) {
  const label = query.trim() || asset;
  if (!label) return null;
  const latest = items[0];
  const shown = items.slice(0, 12);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-emerald-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-emerald-100 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-950 flex items-center gap-2">
            <Wrench className="w-5 h-5 text-emerald-700" /> Historie zařízení: {label}
          </h3>
          <p className="text-xs text-slate-600 mt-1">{items.length} záznamů · {rangeLabel}</p>
        </div>
        <button
          type="button"
          onClick={onAllTime}
          className="px-3 py-2 rounded-xl bg-emerald-400 text-slate-950 text-sm font-bold active:scale-95"
        >
          Hledat v celé historii
        </button>
      </div>

      {latest ? (
        <>
          <div className="p-5 bg-emerald-500/10 border-b border-emerald-100">
            <div className="text-xs uppercase tracking-wide text-emerald-700 mb-1">Naposledy provedeno</div>
            <div className="text-2xl font-black text-slate-950">{fmtDateTime(latest.date)}</div>
            <div className="mt-2 text-sm text-emerald-800">
              <strong>{latest.asset}</strong> · {latest.source} · {latest.person}
              {latest.minutes ? ` · ${fmtMinLocal(latest.minutes)}` : ''}
            </div>
            <div className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">{latest.detail || latest.title}</div>
          </div>

          <div className="divide-y divide-slate-100">
            {shown.map((item) => (
              <div key={item.id} className="p-4 hover:bg-emerald-50 transition">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-emerald-700">{fmtDateTime(item.date)} · {item.source} · {item.person}</div>
                    <div className="font-bold text-slate-950 mt-1">{item.asset}</div>
                    <div className="text-sm text-slate-700 mt-1">{item.title}</div>
                    {item.detail && <div className="text-xs text-slate-600 mt-1 whitespace-pre-wrap">{item.detail}</div>}
                  </div>
                  <div className="text-right shrink-0 text-xs text-emerald-700">
                    {item.minutes ? fmtMinLocal(item.minutes) : item.status || '-'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="p-8 text-center text-slate-600 text-sm">
          Pro tento výběr nejsou záznamy. Zkus přepnout na „Vše“ nebo zkrátit hledaný výraz.
        </div>
      )}
    </div>
  );
}

function QuickAnswerCard({
  query,
  setQuery,
  dateRange,
  setDateRange,
  latest,
  resultCount,
  canExport,
  onExport,
}: {
  query: string;
  setQuery: (value: string) => void;
  dateRange: ReportDateRange;
  setDateRange: (value: ReportDateRange) => void;
  latest?: DeviceHistoryItem;
  resultCount: number;
  canExport: boolean;
  onExport: (format: 'csv' | 'pdf') => void;
}) {
  const quickRanges: { id: ReportDateRange; label: string }[] = [
    { id: 'month', label: 'Měsíc' },
    { id: 'quarter', label: 'Čtvrtletí' },
    { id: 'year', label: 'Rok' },
    { id: 'all', label: 'Celá historie' },
  ];

  return (
    <section className="rounded-3xl border border-emerald-200 bg-white shadow-sm p-4 md:p-5 mb-4">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-emerald-700 font-bold">Rychlá odpověď pro vedoucího</div>
          <h2 className="text-xl font-black text-slate-950 mt-1">Kdy se naposledy dělalo konkrétní zařízení?</h2>
          <p className="text-sm text-slate-600 mt-1">Zadej zařízení, vyber období a případně stáhni PDF.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          {canExport && (
            <>
              <button onClick={() => onExport('pdf')} className="px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-bold active:scale-95">
                PDF
              </button>
              <button onClick={() => onExport('csv')} className="px-4 py-2 rounded-xl bg-emerald-400 text-slate-950 text-sm font-bold active:scale-95">
                CSV
              </button>
            </>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Např. převodovka, extruder 2, vrata..."
          className="w-full min-h-14 rounded-2xl bg-white border border-emerald-200 px-4 text-base text-slate-950 outline-none focus:border-emerald-600"
        />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {quickRanges.map((range) => (
            <button
              key={range.id}
              type="button"
              onClick={() => setDateRange(range.id)}
              className={`min-h-12 px-3 rounded-xl text-sm font-bold active:scale-95 ${
                dateRange === range.id ? 'bg-emerald-700 text-white' : 'bg-slate-50 text-slate-700 border border-slate-200'
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-slate-50 border border-slate-200 p-4">
        {!query.trim() ? (
          <div className="text-sm text-slate-600">Začni tím, že napíšeš název zařízení nebo jeho část.</div>
        ) : latest ? (
          <div>
            <div className="text-xs uppercase tracking-wide text-emerald-700 font-bold">Odpověď</div>
            <div className="text-2xl font-black text-slate-950 mt-1">{fmtDateTime(latest.date)}</div>
            <div className="text-sm text-emerald-800 mt-2">
              {latest.asset} · {latest.person} · {latest.source}
              {latest.minutes ? ` · ${fmtMinLocal(latest.minutes)}` : ''}
            </div>
            <div className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">{latest.detail || latest.title}</div>
            <div className="text-xs text-slate-500 mt-3">Nalezeno {resultCount} záznamů pro aktuální výběr.</div>
          </div>
        ) : (
          <div className="text-sm text-amber-800">Pro tento výraz a období nejsou záznamy. Zkus „Celá historie“ nebo kratší název.</div>
        )}
      </div>
    </section>
  );
}

function AuditTrailTable({ rows }: { rows: AuditTrailRow[] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? rows : rows.slice(0, 10);
  const completeCount = rows.filter((row) => row.complete).length;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-950 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" /> Auditni stopa
          </h3>
          <p className="text-xs text-slate-500 mt-1">Kontrola {'>'} zavada {'>'} ukol {'>'} zapis prace</p>
        </div>
        <span className="text-xs text-emerald-700">{completeCount}/{rows.length} kompletni</span>
      </div>
      {rows.length === 0 ? (
        <div className="p-8 text-center text-slate-500 text-sm">V tomto obdobi nejsou propojene zavady z kontrol.</div>
      ) : (
        <>
          <div className="divide-y divide-slate-100">
            {shown.map((row) => (
              <div key={row.id} className="p-4 hover:bg-emerald-50 transition">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-slate-500">{fmtDateTime(row.date)} · {row.area}</div>
                    <div className="font-bold text-amber-800 mt-1">{row.defect}</div>
                    <div className="text-sm text-slate-950 mt-2">{row.taskTitle}</div>
                    <div className="text-xs text-slate-600 mt-1">
                      {[row.taskPriority, row.taskStatus, row.technician].filter(Boolean).join(' · ') || 'Bez detailu'}
                    </div>
                    {row.foodSafetyRisk && (
                      <div className="mt-2 inline-flex rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs font-bold text-red-700">
                        Food safety: {row.foodSafetyHazardType || 'neurceno'} · {row.foodSafetyImpact || 'neurceno'}
                      </div>
                    )}
                    {row.workContent && (
                      <div className="text-sm text-slate-700 mt-2 rounded-xl bg-slate-50 border border-slate-200 p-3 whitespace-pre-wrap">
                        {row.workContent}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className={`rounded-xl px-2 py-1 text-xs font-bold ${row.complete ? 'bg-emerald-500/15 text-emerald-700' : 'bg-amber-500/15 text-amber-700'}`}>
                      {row.complete ? 'Kompletni' : 'Rozprac.'}
                    </div>
                    <div className="text-xs text-slate-500 mt-2">{row.minutes ? fmtMinLocal(row.minutes) : '-'}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {rows.length > 10 && (
            <button onClick={() => setExpanded(!expanded)}
              className="w-full py-3 text-sm text-emerald-700 hover:text-emerald-800 font-medium flex items-center justify-center gap-1 border-t border-slate-100 transition">
              <ChevronDown className={`w-4 h-4 transition ${expanded ? 'rotate-180' : ''}`} />
              {expanded ? 'Zobrazit mene' : `Zobrazit vsech ${rows.length}`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function TemporaryRepairPanel({ tasks }: { tasks: TaskRow[] }) {
  const rows = tasks.filter((task) => task.temporaryRepair === true);
  const openRows = rows.filter((task) => task.status !== 'completed' && task.status !== 'cancelled');

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-amber-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-amber-100 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-950 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" /> Dočasné opravy
          </h3>
          <p className="text-xs text-slate-500 mt-1">IFS 4.16: každá dočasná oprava musí mít trvalé řešení a termín.</p>
        </div>
        <span className="text-xs font-bold text-amber-700">{openRows.length}/{rows.length} otevřeno</span>
      </div>
      {rows.length === 0 ? (
        <div className="p-6 text-sm text-slate-500">V tomto období není evidovaná žádná dočasná oprava.</div>
      ) : (
        <div className="divide-y divide-amber-100">
          {rows.slice(0, 12).map((task) => (
            <div key={task.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-black text-slate-950">{task.title}</div>
                  <div className="mt-1 text-xs text-slate-600">
                    {[task.priority, task.status, task.assetName || task.buildingId].filter(Boolean).join(' · ')}
                  </div>
                  <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-950">
                    Trvalé řešení do: {fmtDateTime(task.permanentFixDueDate) || 'není zadáno'}
                  </div>
                </div>
                <span className={`shrink-0 rounded-xl px-2 py-1 text-xs font-bold ${
                  task.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-100 text-amber-800'
                }`}>
                  {task.status === 'completed' ? 'Uzavřeno' : 'Sledovat'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function fmtMinLocal(minutes: number) {
  return minutes >= 60 ? `${(minutes / 60).toFixed(1)}h` : `${minutes}min`;
}

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function ReportsPage() {
  const goBack = useBackNavigation('/');
  const { hasPermission } = useAuthContext();
  const [dateRange, setDateRange] = useState<ReportDateRange>('month');
  const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'machines' | 'team' | 'diary' | 'audit'>('overview');
  const [filterAsset, setFilterAsset] = useState('');
  const [filterTech, setFilterTech] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterQuery, setFilterQuery] = useState('');

  const canExport = hasPermission('report.export');

  // Date range
  const { start, end, label: rangeLabel } = useMemo(() => getDateRange(dateRange), [dateRange]);
  const {
    tasks: allTasks,
    inspections: allInspections,
    workLogs: allWorkLogs,
    gearboxTemperatures: allGearboxTemperatures,
    loading,
  } = useReportData(
    dateRange === 'all' ? null : start,
    dateRange === 'all' ? null : end
  );

  // Filter by date + asset + technician
  const filteredTasks = useMemo(() => {
    return allTasks
      .filter(t => {
        const d = toDate(t.createdAt);
        if (!d || d < start || d > end) return false;
        if (filterAsset && t.assetName !== filterAsset) return false;
        if (filterStatus && t.status !== filterStatus) return false;
        if (filterPriority && t.priority !== filterPriority) return false;
        if (filterTech) {
          if (!taskTechnicians(t).includes(filterTech)) return false;
        }
        if (!matchesFreeText(filterQuery, [
          t.title,
          t.description,
          t.resolution,
          t.assetName,
          t.buildingId,
          t.createdByName,
          t.assignedToName,
          ...(Array.isArray(t.assignedWorkerNames) ? t.assignedWorkerNames : []),
          t.completedBy,
          ...(Array.isArray(t.completedByNames) ? t.completedByNames : []),
          t.workType,
          resultLabel(t.result),
          foodSafetyTaskText(t),
          temporaryRepairText(t),
          t.auditNote,
        ])) return false;
        return true;
      })
      .sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0));
  }, [allTasks, start, end, filterAsset, filterStatus, filterPriority, filterTech, filterQuery]);

  const filteredInspections = useMemo(() => {
    return allInspections
      .filter(i => {
        const d = inspectionDate(i);
        if (!d || d < start || d > end) return false;
        if (!matchesFreeText(filterQuery, [
          inspectionArea(i),
          i.defectNote,
          i.inspectorName,
          i.completedBy,
          i.status,
          i.foodSafetyHazardType,
          i.foodSafetyImpact,
        ])) return false;
        return true;
      })
      .sort((a, b) => (inspectionDate(b)?.getTime() || 0) - (inspectionDate(a)?.getTime() || 0));
  }, [allInspections, start, end, filterQuery]);

  const filteredWorkLogs = useMemo(() => {
    return allWorkLogs
      .filter((log) => {
        const d = workLogDate(log);
        if (!d || d < start || d > end) return false;
        if (filterAsset && log.assetName !== filterAsset && log.location !== filterAsset) return false;
        if (filterTech && !workLogTechnicians(log).includes(filterTech)) return false;
        if (!matchesFreeText(filterQuery, [
          log.content,
          log.assetName,
          log.location,
          log.userName,
          ...(Array.isArray(log.workerNames) ? log.workerNames : []),
          ...(Array.isArray(log.completedByNames) ? log.completedByNames : []),
          log.taskTitle,
          log.type,
          log.workType,
          resultLabel(log.result),
          log.auditNote,
          cleaningEvidenceText(log),
        ])) return false;
        return true;
      })
      .sort((a, b) => (workLogDate(b)?.getTime() || 0) - (workLogDate(a)?.getTime() || 0));
  }, [allWorkLogs, start, end, filterAsset, filterTech, filterQuery]);

  const filteredGearboxTemperatures = useMemo(() => {
    return allGearboxTemperatures
      .filter((log) => {
        const d = toDate(log.measuredAt) || toDate(log.createdAt);
        if (!d || d < start || d > end) return false;
        if (filterAsset && log.gearboxName !== filterAsset && log.extruderName !== filterAsset) return false;
        if (filterTech && log.userName !== filterTech) return false;
        if (!matchesFreeText(filterQuery, [
          log.gearboxName,
          log.extruderName,
          log.temperatureC,
          log.userName,
          log.note,
          'převodovka',
          'teplota',
        ])) return false;
        return true;
      })
      .sort((a, b) => (toDate(b.measuredAt)?.getTime() || 0) - (toDate(a.measuredAt)?.getTime() || 0));
  }, [allGearboxTemperatures, start, end, filterAsset, filterTech, filterQuery]);

  // Unique asset names & technicians for filter dropdowns
  const assetOptions = useMemo(() => {
    const set = new Set<string>();
    allTasks.forEach(t => { if (t.assetName) set.add(t.assetName); });
    allWorkLogs.forEach(log => { if (log.assetName) set.add(log.assetName); if (log.location) set.add(log.location); });
    allGearboxTemperatures.forEach(log => { if (log.gearboxName) set.add(log.gearboxName); if (log.extruderName) set.add(log.extruderName); });
    return [...set].sort();
  }, [allTasks, allWorkLogs, allGearboxTemperatures]);

  const techOptions = useMemo(() => {
    const set = new Set<string>();
    allTasks.forEach(t => { taskTechnicians(t).forEach((n) => set.add(n)); });
    allWorkLogs.forEach(log => { workLogTechnicians(log).forEach((n) => set.add(n)); });
    return [...set].sort();
  }, [allTasks, allWorkLogs]);

  // Computed stats
  const kpi = useMemo(() => computeKPI(filteredTasks), [filteredTasks]);
  const monthlyTrend = useMemo(() => computeMonthlyTrend(allTasks), [allTasks]);
  const categories = useMemo(() => computeCategories(filteredTasks), [filteredTasks]);
  const machineDowntime = useMemo(() => computeMachineDowntime(filteredTasks), [filteredTasks]);
  const technicians = useMemo(() => computeTechnicians(filteredTasks), [filteredTasks]);
  const taskStats = useMemo(() => computeTasksStats(filteredTasks), [filteredTasks]);
  const workLogStats = useMemo(() => computeWorkLogStats(filteredWorkLogs), [filteredWorkLogs]);
  const auditSummary = useMemo(() => computeAuditSummary(filteredTasks, filteredInspections, filteredWorkLogs), [filteredTasks, filteredInspections, filteredWorkLogs]);
  const auditTrail = useMemo(() => buildAuditTrail(filteredInspections, filteredTasks, filteredWorkLogs), [filteredInspections, filteredTasks, filteredWorkLogs]);
  const deviceHistory = useMemo(() => buildDeviceHistory(filteredTasks, filteredInspections, filteredWorkLogs, filteredGearboxTemperatures), [filteredTasks, filteredInspections, filteredWorkLogs, filteredGearboxTemperatures]);
  const reportWorkLogs = useMemo(() => {
    const temperatureLogs: WorkLogRow[] = filteredGearboxTemperatures.map((log) => ({
      id: `gearbox-temp-${log.id}`,
      userName: log.userName,
      type: 'inspection',
      workType: 'gearbox_temperature',
      assetName: log.gearboxName,
      location: log.extruderName || '',
      content: [
        `Teplota převodovky: ${log.temperatureC} °C`,
        log.extruderName ? `Extruder: ${log.extruderName}` : '',
        log.note || '',
        log.photoUrl ? `Foto: ${log.photoUrl}` : '',
      ].filter(Boolean).join('\n'),
      auditReady: true,
      performedAt: log.measuredAt,
      createdAt: log.createdAt,
    }));
    return [...filteredWorkLogs.filter((log) => log.workType !== 'gearbox_temperature'), ...temperatureLogs];
  }, [filteredGearboxTemperatures, filteredWorkLogs]);
  const maxTechTasks = useMemo(() => Math.max(...technicians.map(t => t.tasks), 1), [technicians]);
  const maxBar = useMemo(() => Math.max(...monthlyTrend.map(m => Math.max(m.completed, m.created)), 1), [monthlyTrend]);
  const reportLabel = useMemo(() => {
    const q = filterQuery.trim();
    return q ? `${rangeLabel} - filtr: ${q}` : rangeLabel;
  }, [filterQuery, rangeLabel]);

  const handleExport = useCallback((format: 'csv' | 'pdf') => {
    if (format === 'csv') exportExpandedCSV(filteredTasks, filteredInspections, reportWorkLogs, reportLabel, auditTrail);
    else exportExpandedPDF(filteredTasks, filteredInspections, reportWorkLogs, reportLabel, auditTrail);
  }, [filteredTasks, filteredInspections, reportWorkLogs, reportLabel, auditTrail]);

  const fmtMin = (m: number) => m >= 60 ? `${(m / 60).toFixed(1)}h` : `${m}min`;

  return (
    <div className="vik-page">
      <div className="pb-24">
        {/* Header */}
        <header className="p-6">
          <button onClick={() => goBack()} className="flex items-center gap-2 text-slate-600 hover:text-slate-950 mb-4 transition">
            <ArrowLeft className="w-5 h-5" /> Zpět
          </button>

          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-br from-sky-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-sky-500/25">
                <BarChart3 className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-950">Reporty & Statistiky</h1>
                <p className="text-slate-600 text-sm">
                  {loading ? 'Načítám...' : `${filteredTasks.length} úkolů · ${filteredInspections.length} kontrol · ${filteredWorkLogs.length} zápisů · ${rangeLabel}`}
                </p>
                {!loading && allWorkLogs.length > filteredWorkLogs.length && (
                  <p className="text-amber-700 text-xs mt-1">
                    Zobrazeno {filteredWorkLogs.length} z {allWorkLogs.length} zápisů deníku.
                  </p>
                )}
              </div>
            </div>
            {canExport && (
              <div className="flex gap-2">
                <button onClick={() => handleExport('csv')} className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition active:scale-95">
                  <FileSpreadsheet className="w-4 h-4" /><span className="hidden sm:inline">CSV</span>
                </button>
                <button onClick={() => handleExport('pdf')} className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-xl hover:bg-red-100 transition active:scale-95">
                  <Printer className="w-4 h-4" /><span className="hidden sm:inline">PDF</span>
                </button>
              </div>
            )}
          </div>

          <QuickAnswerCard
            query={filterQuery}
            setQuery={setFilterQuery}
            dateRange={dateRange}
            setDateRange={setDateRange}
            latest={deviceHistory[0]}
            resultCount={deviceHistory.length}
            canExport={canExport}
            onExport={handleExport}
          />

          <div className="mb-3 rounded-2xl border border-slate-200 bg-white p-3">
            <label className="block text-xs font-semibold text-slate-600 mb-2">Pokročilé hledání v reportu</label>
            <input
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="např. převodovka, extruder, vrata, VZT..."
              className="w-full min-h-11 rounded-xl bg-white border border-slate-200 px-4 text-sm text-slate-950 outline-none focus:border-emerald-600"
            />
            <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
              {['převodovka', 'extruder', 'vrata', 'VZT'].map((word) => (
                <button
                  key={word}
                  type="button"
                  onClick={() => setFilterQuery(word)}
                  className="px-3 py-1.5 rounded-lg bg-slate-50 text-xs text-slate-700 whitespace-nowrap hover:bg-slate-100"
                >
                  {word}
                </button>
              ))}
              {filterQuery && (
                <button
                  type="button"
                  onClick={() => setFilterQuery('')}
                  className="px-3 py-1.5 rounded-lg bg-orange-500/20 text-xs text-orange-700 whitespace-nowrap"
                >
                  vymazat hledání
                </button>
              )}
            </div>
          </div>

          {/* Date Range */}
          <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
            {([
              { id: 'all', label: 'Vše' },
              { id: 'week', label: 'Týden' }, { id: 'month', label: 'Měsíc' },
              { id: 'quarter', label: 'Čtvrtletí' }, { id: 'year', label: 'Rok' },
            ] as const).map(r => (
              <button key={r.id} onClick={() => setDateRange(r.id)}
                className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition ${
                  dateRange === r.id ? 'bg-emerald-700 text-white' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                }`}>{r.label}</button>
            ))}
          </div>

          {/* Asset & Technician Filters */}
          <div className="flex gap-2 flex-wrap">
            <div className="relative">
              <Filter className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              <select value={filterAsset} onChange={(e) => setFilterAsset(e.target.value)}
                className="pl-8 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-sm text-slate-700 focus:outline-none focus:border-emerald-600 appearance-none min-w-[160px]">
                <option value="">Všechna zařízení</option>
                {assetOptions.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div className="relative">
              <Filter className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              <select value={filterTech} onChange={(e) => setFilterTech(e.target.value)}
                className="pl-8 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-sm text-slate-700 focus:outline-none focus:border-emerald-600 appearance-none min-w-[160px]">
                <option value="">Všichni technici</option>
                {techOptions.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="relative">
              <Filter className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
                className="pl-8 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-sm text-slate-700 focus:outline-none focus:border-emerald-600 appearance-none min-w-[150px]">
                <option value="">Všechny stavy</option>
                <option value="backlog">Čeká</option>
                <option value="planned">Plán</option>
                <option value="in_progress">Probíhá</option>
                <option value="paused">Pauza</option>
                <option value="completed">Hotovo</option>
                <option value="cancelled">Zrušeno</option>
              </select>
            </div>
            <div className="relative">
              <Filter className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}
                className="pl-8 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-sm text-slate-700 focus:outline-none focus:border-emerald-600 appearance-none min-w-[130px]">
                <option value="">Všechny priority</option>
                <option value="P1">P1</option>
                <option value="P2">P2</option>
                <option value="P3">P3</option>
                <option value="P4">P4</option>
              </select>
            </div>
            {(filterAsset || filterTech || filterStatus || filterPriority || filterQuery) && (
              <button onClick={() => { setFilterAsset(''); setFilterTech(''); setFilterStatus(''); setFilterPriority(''); setFilterQuery(''); }}
                className="px-3 py-2 rounded-xl bg-orange-500/20 text-orange-700 text-sm font-medium hover:bg-orange-500/30 transition">
                Zrušit filtry
              </button>
            )}
          </div>

          {!loading && allWorkLogs.length > filteredWorkLogs.length && (
            <div className="mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-sm text-amber-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <span>Některé zápisy deníku jsou schované vybraným obdobím nebo filtrem.</span>
              <button
                onClick={() => { setDateRange('all'); setFilterAsset(''); setFilterTech(''); setFilterStatus(''); setFilterPriority(''); setFilterQuery(''); }}
                className="px-3 py-2 rounded-lg bg-amber-400 text-slate-950 font-medium"
              >
                Zobrazit vše
              </button>
            </div>
          )}
        </header>

        {/* Tabs */}
        <div className="px-6 mb-6">
          <div className="flex gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
            {([
              { id: 'overview', label: 'Přehled', icon: PieChart },
              { id: 'tasks', label: 'Úkoly', icon: Wrench },
              { id: 'machines', label: 'Stroje', icon: Activity },
              { id: 'team', label: 'Tým', icon: Clock },
              { id: 'diary', label: 'Deník', icon: ClipboardList },
              { id: 'audit', label: 'Audit', icon: ShieldCheck },
            ] as const).map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition ${
                  activeTab === tab.id ? 'bg-emerald-700 text-white' : 'text-slate-700 hover:text-slate-950 hover:bg-slate-50'
                }`}>
                <tab.icon className="w-4 h-4" /><span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 space-y-6">
          <DeviceHistoryPanel
            items={deviceHistory}
            query={filterQuery}
            asset={filterAsset}
            rangeLabel={rangeLabel}
            onAllTime={() => setDateRange('all')}
          />

          {activeTab === 'overview' && (
            <>
              {/* KPI Cards — REAL DATA */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {kpi.map((stat, i) => (
                  <div key={i} className="bg-white rounded-2xl shadow-sm p-4 border border-slate-200">
                    <div className={`w-3 h-3 rounded-full ${stat.color} mb-3`} />
                    <div className="text-3xl font-bold text-slate-950 mb-1">{stat.value}</div>
                    <div className="text-sm text-slate-600">{stat.label}</div>
                  </div>
                ))}
              </div>

              {/* Monthly Trend — REAL DATA */}
              <div className="hidden bg-white rounded-2xl shadow-sm p-6 border border-slate-200">
                <h3 className="text-lg font-bold text-slate-950 mb-4">Měsíční trend</h3>
                <div className="space-y-3">
                  {monthlyTrend.map((month, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <span className="w-20 text-sm text-slate-600">{month.month}</span>
                      <div className="flex-1 flex gap-1 h-6">
                        <div className="bg-emerald-500 rounded-l" style={{ width: `${(month.completed / maxBar) * 50}%` }} title={`Dokončeno: ${month.completed}`} />
                        <div className="bg-blue-500 rounded-r" style={{ width: `${(month.created / maxBar) * 50}%` }} title={`Vytvořeno: ${month.created}`} />
                      </div>
                      <span className="text-sm text-slate-600 w-16 text-right">{month.completed}/{month.created}</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-4 mt-4 text-xs text-slate-600">
                  <span className="flex items-center gap-1"><div className="w-3 h-3 bg-emerald-500 rounded" /> Dokončeno</span>
                  <span className="flex items-center gap-1"><div className="w-3 h-3 bg-blue-500 rounded" /> Vytvořeno</span>
                </div>
              </div>

              {/* Categories — REAL DATA */}
              <div className="hidden bg-white rounded-2xl shadow-sm p-6 border border-slate-200">
                <h3 className="text-lg font-bold text-slate-950 mb-4">Rozdělení dle typu</h3>
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
                      <span className="text-sm text-slate-600">{cat.name}</span>
                      <span className="text-sm font-medium text-slate-950 ml-auto">{cat.value}%</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Data Explorer */}
              <DataExplorer tasks={filteredTasks} />

              <WorkLogExplorer logs={filteredWorkLogs} />

              <details className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <summary className="cursor-pointer select-none px-5 py-4 text-slate-950 font-bold flex items-center justify-between gap-3">
                  <span>Souhrnné grafy</span>
                  <span className="text-xs text-slate-600 font-medium">trend a typy práce</span>
                </summary>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 p-4 pt-0">
                  <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200">
                    <h3 className="text-base font-bold text-slate-950 mb-4">Měsíční trend</h3>
                    <div className="space-y-3">
                      {monthlyTrend.map((month, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <span className="w-16 text-sm text-slate-600">{month.month}</span>
                          <div className="flex-1 flex gap-1 h-5">
                            <div className="bg-emerald-500 rounded-l" style={{ width: `${(month.completed / maxBar) * 50}%` }} title={`Dokončeno: ${month.completed}`} />
                            <div className="bg-blue-500 rounded-r" style={{ width: `${(month.created / maxBar) * 50}%` }} title={`Vytvořeno: ${month.created}`} />
                          </div>
                          <span className="text-sm text-slate-600 w-14 text-right">{month.completed}/{month.created}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-4 mt-4 text-xs text-slate-600">
                      <span className="flex items-center gap-1"><div className="w-3 h-3 bg-emerald-500 rounded" /> Dokončeno</span>
                      <span className="flex items-center gap-1"><div className="w-3 h-3 bg-blue-500 rounded" /> Vytvořeno</span>
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200">
                    <h3 className="text-base font-bold text-slate-950 mb-4">Rozdělení dle typu</h3>
                    <div className="flex gap-2 mb-4">
                      {categories.filter(c => c.value > 0).map((cat, i) => (
                        <div key={i} className={`h-4 ${cat.color} first:rounded-l-full last:rounded-r-full`}
                          style={{ width: `${cat.value}%` }} title={`${cat.name}: ${cat.value}%`} />
                      ))}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {categories.map((cat, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded ${cat.color}`} />
                          <span className="text-sm text-slate-600">{cat.name}</span>
                          <span className="text-sm font-medium text-slate-950 ml-auto">{cat.value}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </details>
            </>
          )}

          {activeTab === 'tasks' && (
            <>
              {/* Completion rate — REAL DATA */}
              <div className="bg-white rounded-2xl shadow-sm p-6 border border-slate-200">
                <h3 className="text-lg font-bold text-slate-950 mb-2">Úspěšnost dokončení</h3>
                <div className="flex items-end gap-4">
                  <span className="text-5xl font-bold text-emerald-400">{taskStats.completionRate}%</span>
                  <span className="text-slate-600 mb-2">úkolů dokončeno</span>
                </div>
                <div className="mt-4 h-3 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all" style={{ width: `${taskStats.completionRate}%` }} />
                </div>
              </div>

              {/* Avg times — REAL DATA */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white rounded-2xl shadow-sm p-4 border border-slate-200">
                  <Clock className="w-6 h-6 text-blue-700 mb-2" />
                  <div className="text-2xl font-bold text-slate-950">{taskStats.avgMinutes > 0 ? fmtMin(taskStats.avgMinutes) : '—'}</div>
                  <div className="text-sm text-slate-600">Průměrná doba opravy</div>
                </div>
                <div className="bg-white rounded-2xl shadow-sm p-4 border border-slate-200">
                  <AlertTriangle className="w-6 h-6 text-amber-400 mb-2" />
                  <div className="text-2xl font-bold text-slate-950">{taskStats.p1Avg > 0 ? fmtMin(taskStats.p1Avg) : '—'}</div>
                  <div className="text-sm text-slate-600">Průměr P1</div>
                </div>
              </div>

              {/* Priority breakdown — REAL DATA */}
              <div className="bg-white rounded-2xl shadow-sm p-6 border border-slate-200">
                <h3 className="text-lg font-bold text-slate-950 mb-4">Dle priority</h3>
                <div className="space-y-3">
                  {taskStats.byPriority.map((p, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className={`w-8 h-8 ${p.color} rounded-lg flex items-center justify-center text-white text-xs font-bold`}>{p.priority}</span>
                      <span className="flex-1 text-slate-700">{p.label}</span>
                      <span className="text-slate-950 font-medium">{p.count}</span>
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
              <div className="bg-white rounded-2xl shadow-sm p-6 border border-slate-200">
                <h3 className="text-lg font-bold text-slate-950 mb-4">Zařízení dle počtu úkolů</h3>
                {machineDowntime.length === 0 ? (
                  <p className="text-sm text-slate-500">Žádná data — úkoly nemají přiřazené zařízení.</p>
                ) : (
                  <div className="space-y-3">
                    {machineDowntime.map((machine, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                        <span className="w-8 h-8 bg-red-50 text-red-700 border border-red-200 rounded-lg flex items-center justify-center font-bold">{i + 1}</span>
                        <div className="flex-1">
                          <div className="font-medium text-slate-950">{machine.name}</div>
                          <div className="text-xs text-slate-600">{machine.incidents} úkolů</div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-red-700">{machine.hours}h</div>
                          <div className="text-xs text-slate-600">zaznamenaný čas</div>
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
              <div className="bg-white rounded-2xl shadow-sm p-6 border border-slate-200">
                <h3 className="text-lg font-bold text-slate-950 mb-4">Technici dle výkonu</h3>
                {technicians.length === 0 ? (
                  <p className="text-sm text-slate-500">Žádná data — úkoly nemají přiřazeného technika.</p>
                ) : (
                  <div className="space-y-3">
                    {technicians.map((tech, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold" style={{ backgroundColor: tech.color }}>
                          {tech.name.charAt(0)}
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-slate-950">{tech.name}</div>
                          <div className="text-xs text-slate-600">{tech.tasks} úkolů</div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-blue-700">{tech.avgTime > 0 ? `${tech.avgTime}min` : '—'}</div>
                          <div className="text-xs text-slate-600">průměr/úkol</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Workload distribution — REAL DATA */}
              {technicians.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm p-6 border border-slate-200">
                  <h3 className="text-lg font-bold text-slate-950 mb-4">Rozložení práce</h3>
                  <div className="space-y-3">
                    {technicians.map((tech, i) => (
                      <div key={i}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-slate-700">{tech.name}</span>
                          <span className="text-slate-600">{tech.tasks} úkolů</span>
                        </div>
                        <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${(tech.tasks / maxTechTasks) * 100}%`, backgroundColor: tech.color }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === 'diary' && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white rounded-2xl shadow-sm p-4 border border-slate-200">
                  <div className="text-3xl font-bold text-slate-950">{workLogStats.total}</div>
                  <div className="text-sm text-slate-600">Zápisů</div>
                </div>
                <div className="bg-white rounded-2xl shadow-sm p-4 border border-slate-200">
                  <div className="text-3xl font-bold text-amber-700">{fmtMin(workLogStats.totalMinutes)}</div>
                  <div className="text-sm text-slate-600">Zapsaný čas</div>
                </div>
                <div className="bg-white rounded-2xl shadow-sm p-4 border border-slate-200">
                  <div className="text-3xl font-bold text-emerald-700">{workLogStats.auditReady}</div>
                  <div className="text-sm text-slate-600">Audit ready</div>
                </div>
                <div className="bg-white rounded-2xl shadow-sm p-4 border border-slate-200">
                  <div className="text-3xl font-bold text-sky-700">{workLogStats.byTechnician.length}</div>
                  <div className="text-sm text-slate-600">Lidí</div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white rounded-2xl shadow-sm p-6 border border-slate-200">
                  <h3 className="text-lg font-bold text-slate-950 mb-4">Typy práce</h3>
                  <div className="space-y-3">
                    {workLogStats.byType.map(([type, count]) => (
                      <div key={type} className="flex items-center justify-between text-sm">
                        <span className="text-slate-700">{type}</span>
                        <span className="font-bold text-slate-950">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-white rounded-2xl shadow-sm p-6 border border-slate-200">
                  <h3 className="text-lg font-bold text-slate-950 mb-4">Čas podle lidí</h3>
                  <div className="space-y-3">
                    {workLogStats.byTechnician.map((tech) => (
                      <div key={tech.name} className="flex items-center justify-between text-sm">
                        <span className="text-slate-700">{tech.name}</span>
                        <span className="font-bold text-slate-950">{fmtMin(tech.minutes)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <WorkLogExplorer logs={filteredWorkLogs} />
            </>
          )}

          {activeTab === 'audit' && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                <div className="bg-emerald-500/10 rounded-2xl p-4 border border-emerald-200">
                  <div className="text-3xl font-bold text-emerald-700">{auditSummary.completedTasks}</div>
                  <div className="text-sm text-slate-600">Dokončené úkoly</div>
                </div>
                <div className="bg-blue-500/10 rounded-2xl p-4 border border-blue-500/30">
                  <div className="text-3xl font-bold text-blue-700">{filteredInspections.length}</div>
                  <div className="text-sm text-blue-700">Kontroly</div>
                </div>
                <div className="bg-amber-500/10 rounded-2xl p-4 border border-amber-500/30">
                  <div className="text-3xl font-bold text-amber-700">{fmtMin(auditSummary.workMinutes)}</div>
                  <div className="text-sm text-amber-800/70">Práce z deníku</div>
                </div>
                <div className="bg-red-500/10 rounded-2xl p-4 border border-red-500/30">
                  <div className="text-3xl font-bold text-red-700">{auditSummary.p1Open}</div>
                  <div className="text-sm text-red-700">Otevřené P1</div>
                </div>
                <div className="bg-red-500/10 rounded-2xl p-4 border border-red-200">
                  <div className="text-3xl font-bold text-red-700">{auditSummary.foodSafetyTasks}</div>
                  <div className="text-sm text-red-700">Food safety</div>
                </div>
                <div className="bg-amber-500/10 rounded-2xl p-4 border border-amber-300">
                  <div className="text-3xl font-bold text-amber-700">{auditSummary.temporaryOpen}</div>
                  <div className="text-sm text-amber-800">Dočasné opravy</div>
                </div>
              </div>

              <AuditTrailTable rows={auditTrail} />
              <TemporaryRepairPanel tasks={filteredTasks} />

              <div className="bg-white rounded-2xl shadow-sm p-6 border border-slate-200">
                <h3 className="text-lg font-bold text-slate-950 mb-2">Auditní balíček</h3>
                <p className="text-sm text-slate-600 mb-4">
                  PDF a CSV export teď obsahuje úkoly, kontroly budov i deník údržby v jednom souboru pro vybrané období a filtry.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="font-bold text-slate-950">1. Co se dělalo</div>
                    <div className="text-slate-600 mt-1">Úkoly, zápisy, popisy oprav a čas.</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="font-bold text-slate-950">2. Kdo to provedl</div>
                    <div className="text-slate-600 mt-1">Technik z úkolu nebo deníku údržby.</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="font-bold text-slate-950">3. Kontroly a závady</div>
                    <div className="text-slate-600 mt-1">Kontrolní záznamy, závady a napojené úkoly.</div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
