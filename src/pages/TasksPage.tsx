// src/pages/TasksPage.tsx
// VIKRR — Asset Shield — Úkoly (responsive grid: 1col mobil, 2col tablet, 3col PC)

import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc, Timestamp, serverTimestamp, writeBatch, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthContext } from '../context/AuthContext';
import { useBackNavigation } from '../hooks/useBackNavigation';
import { useFormDraft } from '../hooks/useFormDraft';
import CompleteTaskModal from '../components/ui/CompleteTaskModal';
import {
  Wrench,
  Plus,
  ArrowLeft,
  Loader2,
  Inbox,
  Edit2,
  Download,
  Trash2,
  Play,
  CalendarDays,
  PauseCircle,
  CheckCircle2,
  Clock,
  ClipboardList,
  FileText,
  MapPin,
  Search,
  User,
  AlertTriangle,
  BellRing,
} from 'lucide-react';
import { cmmsConfig } from '../cmmsConfig';
import { addWorkLog, subscribeToWorkLogs } from '../services/workLogService';
import type { WorkLog } from '../types/workLog';
import FAB from '../components/ui/FAB';
import EmptyState from '../components/ui/EmptyState';
import BottomSheet, { FormField, FormFooter } from '../components/ui/BottomSheet';
import MicButton from '../components/ui/MicButton';
import { showToast } from '../components/ui/Toast';
import { assetService } from '../services/assetService';
import type { Asset } from '../types/asset';
import { isGearboxAsset } from '../services/gearboxService';

// ═══════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════
interface Task {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  assignedTo?: string;
  assignedToName?: string;
  assignedWorkerNames?: string[];
  assetId?: string;
  assetName?: string;
  createdAt?: any;
  updatedAt?: any;
  startedAt?: any;
  plannedDate?: string;
  completedAt?: any;
  completedBy?: string;
  completedByNames?: string[];
  isDone?: boolean;
  resolution?: string;
  durationMinutes?: number;
  result?: string;
  auditNote?: string;
  source?: string;
  workType?: string;
  location?: string;
  dueDate?: any;
  inspectionLogId?: string;
  sourceRefId?: string;
  sourceRefType?: string;
  relatedAssetId?: string;
  relatedAssetName?: string;
  relatedAssetRole?: string;
  lastUpdate?: string;
  lastUpdateAt?: any;
  lastUpdateBy?: string;
  foodSafetyRisk?: boolean;
  foodSafetyHazardType?: string;
  foodSafetyImpact?: string;
  temporaryRepair?: boolean;
  permanentFixDueDate?: any;
}

interface SourceWorkLog {
  id: string;
  userName?: string;
  content?: string;
  location?: string;
  assetName?: string;
  hoursWorked?: number;
  performedAt?: any;
  createdAt?: any;
}

type TaskSuggestMode = 'location' | 'asset' | null;

const FOOD_SAFETY_HAZARD_OPTIONS = [
  { value: 'foreign_body', label: 'Cizí těleso / fyzikální' },
  { value: 'chemical', label: 'Chemické' },
  { value: 'biological', label: 'Biologické' },
  { value: 'allergen', label: 'Alergen' },
  { value: 'other', label: 'Jiné' },
];

function foodSafetyHazardLabel(value?: string) {
  return FOOD_SAFETY_HAZARD_OPTIONS.find((item) => item.value === value)?.label || value || 'neuvedeno';
}

function normalizeLookup(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isBuildingAsset(asset: Asset) {
  const type = normalizeLookup(asset.entityType);
  return type === 'budova' || type === 'hala' || type === 'areal' || type === 'building';
}

function isRoomAsset(asset: Asset) {
  const type = normalizeLookup(asset.entityType);
  return type === 'mistnost' || type === 'room' || type === 'prostor';
}

function taskAssetBuilding(asset: Asset, allAssets: Asset[] = []) {
  if (asset.buildingId?.trim()) return asset.buildingId.trim().toUpperCase();
  let parentId = asset.parentId;
  while (parentId) {
    const parent = allAssets.find((item) => item.id === parentId);
    if (!parent) break;
    if (parent.buildingId?.trim()) return parent.buildingId.trim().toUpperCase();
    const match = parent.name?.match(/\bBudova\s+([A-Z0-9]{1,4})\b/i);
    if (match?.[1]) return match[1].toUpperCase();
    parentId = parent.parentId;
  }
  const direct = `${asset.name || ''} ${asset.code || ''}`.match(/\bBudova\s+([A-Z0-9]{1,4})\b/i);
  return direct?.[1]?.toUpperCase() || '';
}

function taskCleanLocationPart(value?: string | null, buildingCode?: string | null) {
  const code = buildingCode?.trim();
  let text = String(value || '').trim().replace(/\s+/g, ' ');
  if (!text) return '';
  text = text.replace(/^budova\s+[a-z0-9]{1,4}\s*[-–—:/]\s*/i, '');
  if (code) {
    const escapedCode = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(`^${escapedCode}\\s*[-–—:/]\\s*`, 'i'), '');
  }
  return text.trim();
}

function taskLocationParts(selectedLocation: string) {
  const text = selectedLocation.trim();
  const buildingMatch = text.match(/\bbudova\s+([a-z0-9]{1,4})\b/i) || text.match(/^([a-z0-9]{1,4})\s*[-–—:/]\s*/i);
  const buildingCode = buildingMatch?.[1]?.toUpperCase() || '';
  const roomLabel = taskCleanLocationPart(text, buildingCode);
  const normalizedRoom = normalizeLookup(roomLabel);
  const normalizedBuilding = normalizeLookup(buildingCode ? `Budova ${buildingCode}` : '');
  const hasSpecificRoom = normalizedRoom.length >= 2 && normalizedRoom !== normalizedBuilding && !/^budova\s+[a-z0-9]{1,4}$/.test(normalizedRoom);
  return { buildingCode, normalizedRoom, hasSpecificRoom };
}

function taskAssetRoomCandidateLabels(asset: Asset, allAssets: Asset[] = []) {
  const building = taskAssetBuilding(asset, allAssets);
  const parents: Asset[] = [];
  let parentId = asset.parentId;
  while (parentId) {
    const parent = allAssets.find((item) => item.id === parentId);
    if (!parent || parents.some((item) => item.id === parent.id)) break;
    parents.push(parent);
    parentId = parent.parentId;
  }

  const byKey = new Map<string, string>();
  [
    taskCleanLocationPart(asset.areaName, building),
    taskCleanLocationPart(asset.location, building),
    ...parents.flatMap((parent) => {
      const parentBuilding = taskAssetBuilding(parent, allAssets) || building;
      return [
        isRoomAsset(parent) ? taskCleanLocationPart(parent.name, parentBuilding) : '',
        taskCleanLocationPart(parent.areaName, parentBuilding),
        taskCleanLocationPart(parent.location, parentBuilding),
      ];
    }),
  ]
    .forEach((value) => {
      const cleanValue = String(value || '').trim();
      const key = normalizeLookup(cleanValue);
      if (cleanValue && !byKey.has(key)) byKey.set(key, cleanValue);
    });
  return Array.from(byKey.values());
}

function taskAssetRoomCandidates(asset: Asset, allAssets: Asset[] = []) {
  return taskAssetRoomCandidateLabels(asset, allAssets).map((value) => normalizeLookup(value));
}

function taskAssetLocation(asset: Asset, allAssets: Asset[] = []) {
  const building = taskAssetBuilding(asset, allAssets);
  const room = taskAssetRoomCandidateLabels(asset, allAssets)[0] || '';
  return [building ? `Budova ${building}` : '', room].filter(Boolean).join(' - ');
}

function taskAssetMatchesLocation(asset: Asset, selectedLocation: string, allAssets: Asset[] = []) {
  const parts = taskLocationParts(selectedLocation);
  if (!parts.buildingCode && !parts.normalizedRoom) return true;
  const building = taskAssetBuilding(asset, allAssets);
  if (parts.buildingCode && building && building !== parts.buildingCode) return false;
  if (parts.hasSpecificRoom) {
    return taskAssetRoomCandidates(asset, allAssets).some((candidate) => candidate === parts.normalizedRoom);
  }
  return !parts.buildingCode || building === parts.buildingCode;
}

const taskSuggestionPanelClass = 'mt-2 max-h-[min(22rem,52vh)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl';

// ═══════════════════════════════════════════════════
// PRIORITY CONFIG
// ═══════════════════════════════════════════════════
const PRIORITY_CONFIG: Record<string, { bg: string; border: string; color: string; label: string; textClass: string; borderLeft: string }> = {
  P1: { bg: 'bg-red-500/12', border: 'border-red-500/35', color: '#f87171', label: 'P1 — Havárie', textClass: 'text-red-400', borderLeft: 'border-l-4 border-l-red-500' },
  P2: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', color: '#fbbf24', label: 'P2 — Tento týden', textClass: 'text-amber-400', borderLeft: 'border-l-4 border-l-orange-400' },
  P3: { bg: 'bg-blue-500/8', border: 'border-blue-500/20', color: '#60a5fa', label: 'P3 — Běžná', textClass: 'text-blue-400', borderLeft: 'border-l-4 border-l-blue-400' },
  P4: { bg: 'bg-slate-500/8', border: 'border-slate-500/20', color: '#94a3b8', label: 'P4 — Nápad', textClass: 'text-slate-400', borderLeft: 'border-l-4 border-l-gray-500' },
};

const STATUS_BADGES: Record<string, { label: string; bg: string; text: string }> = {
  backlog:      { label: 'Nový',         bg: 'bg-red-100',     text: 'text-red-700' },
  planned:      { label: 'Plánovaný',    bg: 'bg-blue-100',    text: 'text-blue-700' },
  in_progress:  { label: 'V řešení',     bg: 'bg-amber-100',   text: 'text-amber-800' },
  paused:       { label: 'Čeká na díl',  bg: 'bg-cyan-100',    text: 'text-cyan-800' },
  completed:    { label: 'Hotovo',        bg: 'bg-emerald-100', text: 'text-emerald-800' },
  done:         { label: 'Hotovo',        bg: 'bg-emerald-100', text: 'text-emerald-800' },
  deferred:     { label: 'Odloženo',      bg: 'bg-violet-100',  text: 'text-violet-800' },
  cancelled:    { label: 'Zrušeno',       bg: 'bg-slate-100',   text: 'text-slate-700' },
};

// ═══════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════
function timeAgo(date: any): string {
  if (!date) return '';
  const d = date.toDate ? date.toDate() : new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'právě teď';
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function taskTimeValue(value: any): number {
  if (!value) return 0;
  const date = value.toDate ? value.toDate() : new Date(value);
  const time = date instanceof Date ? date.getTime() : Number.NaN;
  return Number.isNaN(time) ? 0 : time;
}

function isKioskTask(task: Task): boolean {
  return task.source === 'kiosk';
}

function isNewKioskTask(task: Task): boolean {
  return isKioskTask(task) && task.status === 'backlog';
}

function priorityRank(priority?: string): number {
  return ({ P1: 0, P2: 1, P3: 2, P4: 3 } as Record<string, number>)[priority || ''] ?? 9;
}

function compareTasks(a: Task, b: Task, mode: SortMode): number {
  const newestA = taskTimeValue(a.createdAt || a.updatedAt || a.completedAt);
  const newestB = taskTimeValue(b.createdAt || b.updatedAt || b.completedAt);

  if (mode === 'newest') return newestB - newestA;

  const priorityDiff = priorityRank(a.priority) - priorityRank(b.priority);
  if (priorityDiff !== 0) return priorityDiff;

  if (mode === 'smart') {
    const kioskDiff = Number(isNewKioskTask(b)) - Number(isNewKioskTask(a));
    if (kioskDiff !== 0) return kioskDiff;
    const activeDiff = Number(b.status === 'in_progress') - Number(a.status === 'in_progress');
    if (activeDiff !== 0) return activeDiff;
  }

  return newestB - newestA;
}

function priorityCardClass(priority?: string): string {
  if (priority === 'P1') return 'bg-red-50 border-red-200';
  if (priority === 'P2') return 'bg-amber-50 border-amber-200';
  if (priority === 'P3') return 'bg-white border-slate-200';
  return 'bg-slate-50 border-slate-200';
}

function toDate(value: any): Date | null {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(value);
}

function formatDateTime(value: any): string {
  const date = toDate(value);
  if (!date) return '';
  return date.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' '
    + date.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
}

function formatMinutes(minutes?: number) {
  if (!minutes) return '';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function normalizePersonKey(name: string): string {
  return name
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('cs-CZ');
}

function personNameScore(name: string): number {
  const nonAscii = [...name].filter((char) => char.charCodeAt(0) > 127).length;
  const hasReplacement = name.includes('?') || name.includes('�');
  return nonAscii * 10 + name.length - (hasReplacement ? 1000 : 0);
}

function uniqueNames(names: Array<string | null | undefined>): string[] {
  const byKey = new Map<string, string>();
  for (const rawName of names) {
    const cleanName = String(rawName || '').trim().replace(/\s+/g, ' ');
    if (!cleanName) continue;
    const key = normalizePersonKey(cleanName);
    const existing = byKey.get(key);
    if (!existing || personNameScore(cleanName) > personNameScore(existing)) {
      byKey.set(key, cleanName);
    }
  }
  return [...byKey.values()];
}

function taskWorkerNames(task: Task): string[] {
  return uniqueNames([
    ...(Array.isArray(task.completedByNames) ? task.completedByNames : []),
    task.completedBy,
    ...(Array.isArray(task.assignedWorkerNames) ? task.assignedWorkerNames : []),
    task.assignedToName,
    task.assignedTo,
  ]);
}

function taskWorkerLabel(task: Task): string {
  const names = taskWorkerNames(task);
  return names.length ? names.join(', ') : '—';
}

function escapeTaskHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTaskDate(value: unknown): string {
  if (!value) return '—';
  const date = value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function'
    ? (value as { toDate: () => Date }).toDate()
    : value instanceof Date
      ? value
      : new Date(String(value));
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function exportCompletedTasksPrint(tasks: Task[]): void {
  const rows = tasks.map((task) => `
    <tr>
      <td>${escapeTaskHtml(task.priority)}</td>
      <td>${escapeTaskHtml(task.title)}</td>
      <td>${escapeTaskHtml(task.assetName || '—')}</td>
      <td>${escapeTaskHtml(formatTaskDate(task.completedAt))}</td>
      <td>${escapeTaskHtml(taskWorkerLabel(task))}</td>
    </tr>
  `).join('');
  const win = window.open('', '_blank', 'width=1000,height=900');
  if (!win) {
    showToast('Tiskové okno bylo zablokováno prohlížečem', 'error');
    return;
  }
  win.document.write(`<!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8" />
  <title>Dokončené úkoly</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    body { margin: 0; font-family: Arial, sans-serif; color: #1b2620; }
    h1 { margin: 0 0 4px; font-size: 22px; }
    .muted { color: #66756b; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { background: #1a6b4f; color: white; text-align: left; padding: 7px; }
    td { border: 1px solid #d8d0c3; padding: 7px; vertical-align: top; }
  </style>
</head>
<body>
  <h1>Dokončené úkoly</h1>
  <div class="muted">Export: ${escapeTaskHtml(new Date().toLocaleString('cs-CZ'))}</div>
  <table>
    <thead><tr><th>Priorita</th><th>Název úkolu</th><th>Zařízení</th><th>Dokončeno</th><th>Řešitel</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <script>window.onload = () => setTimeout(() => window.print(), 150);</script>
</body>
</html>`);
  win.document.close();
}

function taskResultLabel(value?: string) {
  if (value === 'fixed') return 'Opraveno';
  if (value === 'monitor') return 'Sledovat';
  if (value === 'not_fixable') return 'Nelze opravit';
  if (value === 'handover') return 'Předat dál';
  return '';
}

function isDiaryTask(task: Task): boolean {
  if (task.sourceRefType === 'work_log') return true;
  if (task.sourceRefType === 'manual' && task.sourceRefId && task.description?.toLowerCase().includes('deniku udrzby')) return true;
  return false;
}

function workTypeLabel(value?: string) {
  if (!value) return '';
  return cmmsConfig.workTypes.find((item) => item.id === value)?.label || value;
}

function taskProblemText(task: Task) {
  return (task.description || task.title || '').trim();
}

function taskActionText(task: Task) {
  const parts = [
    workTypeLabel(task.workType),
    task.assetName ? `Zařízení: ${task.assetName}` : '',
    task.location ? `Místo: ${task.location}` : '',
  ].filter(Boolean);
  return parts.join(' · ') || 'Není vybrané zařízení ani místo';
}

// ═══════════════════════════════════════════════════
// SUMMARY BAR
// ═══════════════════════════════════════════════════
function TaskSummary({ tasks }: { tasks: Task[] }) {
  const open = tasks.filter((t) => t.status !== 'done' && t.status !== 'completed');
  const p1 = open.filter((t) => t.priority === 'P1').length;
  const p2 = open.filter((t) => t.priority === 'P2').length;
  const inProgress = tasks.filter((t) => t.status === 'in_progress').length;
  const done = tasks.filter((t) => t.status === 'done' || t.status === 'completed').length;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
      {[
        { value: p1, label: 'Havárie', color: '#f87171' },
        { value: p2, label: 'Tento týden', color: '#fbbf24' },
        { value: inProgress, label: 'V řešení', color: '#f97316' },
        { value: open.length, label: 'Otevřeno', color: '#60a5fa' },
        { value: done, label: 'Hotovo', color: '#34d399' },
      ].map((s) => (
        <div
          key={s.label}
          className="vik-card-soft text-center py-2 px-1"
          style={{ borderColor: `${s.color}28` }}
        >
          <div className="text-lg font-bold" style={{ color: s.color }}>{s.value}</div>
          <div className="text-[10px] vik-muted">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════
function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'tasks'),
      (snap) => {
        setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Task)));
        setLoading(false);
      },
      (err) => {
        console.error('[TasksPage] Firestore error:', err);
        setTasks([]);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  return { tasks, loading };
}

// ═══════════════════════════════════════════════════
// HOOK — Technicians (dispatching)
// ═══════════════════════════════════════════════════
interface Technician { id: string; displayName: string; role: string; }

function useTechnicians() {
  const [techs, setTechs] = useState<Technician[]>([]);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      const DISPATCH_ROLES = ['UDRZBA', 'SKLADNIK', 'SUPERADMIN'];
      const users = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              displayName: data.displayName || '?',
              role: data.role || '',
              active: data.active !== false && data.isActive !== false,
            };
          })
          .filter((u) => u.active && DISPATCH_ROLES.includes(u.role));
      const byName = new Map<string, Technician>();
      for (const technician of users) {
        const key = normalizePersonKey(technician.displayName);
        const existing = byName.get(key);
        if (!existing || personNameScore(technician.displayName) > personNameScore(existing.displayName)) {
          byName.set(key, technician);
        }
      }
      setTechs([...byName.values()].sort((a, b) => a.displayName.localeCompare(b.displayName, 'cs-CZ')));
    });
    return () => unsub();
  }, []);
  return techs;
}

function WorkerMultiSelect({
  label,
  selected,
  onChange,
  options,
  required,
}: {
  label: string;
  selected: string[];
  onChange: (value: string[]) => void;
  options: string[];
  required?: boolean;
}) {
  const sourceOptions = options.length > 0 ? options : selected;
  const allOptions = uniqueNames([...sourceOptions, ...selected]);
  const toggle = (name: string) => {
    const key = normalizePersonKey(name);
    onChange(selected.some((item) => normalizePersonKey(item) === key)
      ? selected.filter((item) => normalizePersonKey(item) !== key)
      : uniqueNames([...selected, name])
    );
  };

  return (
    <div className="mb-4">
      <label className="block text-sm text-slate-600 font-medium mb-2">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {allOptions.map((name) => {
          const active = selected.some((item) => normalizePersonKey(item) === normalizePersonKey(name));
          return (
            <button
              key={name}
              type="button"
              onClick={() => toggle(name)}
              className={`min-h-[44px] px-3 py-2 rounded-xl border text-left text-sm font-semibold transition ${
                active
                  ? 'bg-emerald-50 border-emerald-500 text-emerald-900'
                  : 'bg-white border-slate-200 text-slate-700 active:bg-slate-50'
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${
                  active ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-400 text-transparent'
                }`}>
                  ✓
                </span>
                {name}
              </span>
            </button>
          );
        })}
      </div>
      {selected.length > 0 && (
        <div className="mt-2 text-xs text-slate-600">
          Vybráno: <span className="text-slate-200">{selected.join(', ')}</span>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// TAB FILTER TYPE
// ═══════════════════════════════════════════════════
type FilterTab = 'mine' | 'active' | 'done';
type SourceFilter = 'all' | 'kiosk';
type SortMode = 'smart' | 'newest' | 'priority';

const TAB_OPTIONS: { key: FilterTab; label: string; color: string }[] = [
  { key: 'active', label: 'Aktivní', color: '#fbbf24' },
  { key: 'mine', label: 'Moje úkoly', color: '#f97316' },
  { key: 'done', label: 'Hotovo', color: '#34d399' },
];

// ═══════════════════════════════════════════════════
// TASK CARD (standardized)
// ═══════════════════════════════════════════════════
function TaskCard({ task, onClick, onEdit, onDelete, onAddLog, onTake, onComplete }: { task: Task; onClick: () => void; onEdit: () => void; onDelete: () => void; onAddLog: () => void; onTake: () => void; onComplete: () => void }) {
  const pc = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.P3;
  const sb = STATUS_BADGES[task.status] || STATUS_BADGES.backlog;
  const assignee = taskWorkerLabel(task);
  const initials = assignee !== '—' ? assignee.split(/[,\s]+/).filter(Boolean).map(w => w[0] || '').join('').slice(0, 2) || '?' : '?';
  const isActive = task.status === 'in_progress';
  const isDone = task.status === 'done' || task.status === 'completed';
  const fromKiosk = isKioskTask(task);
  const freshKiosk = isNewKioskTask(task);
  const diaryTask = isDiaryTask(task);
  const problem = taskProblemText(task);
  const action = taskActionText(task);
  const typeLabel = workTypeLabel(task.workType);

  return (
    <div className={`vik-row-card flex flex-col overflow-hidden ${priorityCardClass(task.priority)} ${pc.borderLeft} ${
      freshKiosk ? 'ring-2 ring-red-300/70' : isActive ? 'ring-1 ring-amber-500/30' : ''
    }`}>
      {freshKiosk && (
        <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700">
          <BellRing className="h-4 w-4" />
          Nové hlášení z kiosku
        </div>
      )}
      {/* Active technician bar */}
      {isActive && assignee !== '—' && (
        <div className="px-2.5 py-1 bg-amber-500/15 border-b border-amber-500/20 flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
          <span className="text-[10px] font-bold text-amber-400 truncate">{assignee}</span>
          <span className="text-[9px] text-amber-400/50 ml-auto flex-shrink-0">řeší</span>
        </div>
      )}

      {/* CLICKABLE BODY */}
      <button onClick={onClick} className="w-full px-3 py-3 text-left hover:bg-slate-50 transition">
        {/* HEADER: Priority + Status + Time */}
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          <span className="text-[10px] font-bold px-2 py-1 rounded-lg" style={{ background: `${pc.color}20`, color: pc.color }}>
            {task.priority}
          </span>
          <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${sb.bg} ${sb.text}`}>{sb.label}</span>
          {fromKiosk && !freshKiosk && (
            <span className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-black text-red-700">
              <BellRing className="h-3 w-3" /> kiosk
            </span>
          )}
          {typeLabel && (
            <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-700 text-white">
              {typeLabel}
            </span>
          )}
          {diaryTask && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-0.5">
              <ClipboardList className="w-2.5 h-2.5" /> z deníku
            </span>
          )}
          <span className="text-xs font-medium text-slate-500 ml-auto">{timeAgo(task.createdAt)}</span>
        </div>

        {/* TITLE */}
        <h4 className="text-base font-black text-slate-950 leading-tight mb-2 line-clamp-2">{task.title}</h4>

        <div className="space-y-2 mb-3">
          <div className="rounded-xl border border-red-200 bg-red-50 p-2.5">
            <div className="text-[10px] font-black uppercase tracking-wide text-red-600 mb-1">Problém</div>
            <div className="text-sm font-semibold text-slate-900 line-clamp-3">{problem || 'Bez popisu problému.'}</div>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-2.5">
            <div className="text-[10px] font-black uppercase tracking-wide text-blue-600 mb-1">Týká se</div>
            <div className="text-sm font-semibold text-slate-900 line-clamp-2">{action}</div>
          </div>
          {task.lastUpdate && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5">
              <div className="flex items-center justify-between gap-2 text-[10px] font-black uppercase tracking-wide text-amber-600 mb-1">
                <span>Poslední aktualizace</span>
                {task.lastUpdateAt && <span className="normal-case tracking-normal text-amber-700">{timeAgo(task.lastUpdateAt)}</span>}
              </div>
              <div className="text-sm font-semibold text-slate-900 line-clamp-2">{task.lastUpdate}</div>
              {task.lastUpdateBy && <div className="text-xs font-medium text-slate-600 mt-1">{task.lastUpdateBy}</div>}
            </div>
          )}
        </div>

        {/* META: Assignee + Asset — single dense line */}
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-slate-600">
          <div className="flex items-center gap-1 min-w-0">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${isActive ? 'bg-amber-100 border border-amber-300' : 'bg-slate-700'}`}>
              <span className={`text-[8px] font-black ${isActive ? 'text-amber-700' : 'text-white'}`}>{initials}</span>
            </div>
            <span className={`truncate ${isActive ? 'text-amber-700 font-bold' : 'font-medium'}`}>{assignee}</span>
          </div>
          {task.assetName && (
            <div className="flex items-center gap-0.5 min-w-0">
              <Wrench className="w-2.5 h-2.5 flex-shrink-0" />
              <span className="truncate">{task.assetName}</span>
            </div>
          )}
          {task.dueDate && (
            <div className="flex items-center gap-0.5 min-w-0">
              <CalendarDays className="w-3 h-3 flex-shrink-0" />
              <span>{formatDateTime(task.dueDate)}</span>
            </div>
          )}
        </div>
        {diaryTask && (
          <div className="mt-2 text-xs font-medium text-amber-700 flex items-center gap-1">
            <FileText className="w-3 h-3" />
            <span>původní zápis je v detailu úkolu</span>
          </div>
        )}
      </button>

      {/* ACTION FOOTER — primární akce (zápis/dokončit) + edit/smazat */}
      <div className="border-t border-slate-200 px-2 py-1.5 flex items-center gap-1 bg-white">
        {!isDone && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); onTake(); }}
              className="flex-1 min-h-11 rounded-lg flex items-center justify-center gap-1.5 border border-amber-200 bg-amber-50 text-amber-800 text-xs font-bold hover:bg-amber-100 transition"
            >
              <Play className="w-4 h-4" /> Přebírám
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onAddLog(); }}
              className="flex-1 min-h-11 rounded-lg flex items-center justify-center gap-1.5 border border-sky-200 bg-sky-50 text-sky-700 text-xs font-bold hover:bg-sky-100 transition"
            >
              <FileText className="w-4 h-4" /> Zápis
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onComplete(); }}
              className="flex-1 min-h-11 rounded-lg flex items-center justify-center gap-1.5 border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-bold hover:bg-emerald-100 transition"
            >
              <CheckCircle2 className="w-4 h-4" /> Dokončit
            </button>
          </>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="w-11 h-11 shrink-0 rounded-lg flex items-center justify-center border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 transition"
        >
          <Edit2 className="w-4 h-4" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="w-11 h-11 shrink-0 rounded-lg flex items-center justify-center border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════
export default function TasksPage() {
  const goBack = useBackNavigation('/');
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuthContext();
  const { tasks, loading } = useTasks();
  const technicians = useTechnicians();
  const [showNewTask, setShowNewTask] = useState(false);
  const [actionsTask, setActionsTask] = useState<Task | null>(null);
  const [completingTask, setCompletingTask] = useState<Task | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [loggingTask, setLoggingTask] = useState<Task | null>(null);
  const [logText, setLogText] = useState('');
  const [savingLog, setSavingLog] = useState(false);
  const [filterTab, setFilterTab] = useState<FilterTab>('active');
  const [filterPriority, setFilterPriority] = useState<string | null>(null);
  const [filterTechnician, setFilterTechnician] = useState<string | null>(null);
  const [filterSource, setFilterSource] = useState<SourceFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('smart');
  const [openedTaskFromUrl, setOpenedTaskFromUrl] = useState<string | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [suggestMode, setSuggestMode] = useState<TaskSuggestMode>(null);

  // Form state with draft persistence
  const [form, setForm, clearDraft] = useFormDraft('new_task', {
    title: '',
    description: '',
    priority: 'P3',
    assignee: '',
    assignedWorkerNames: [] as string[],
    workType: '',
    location: '',
    assetName: '',
    assetId: '',
    foodSafetyRisk: false,
    foodSafetyHazardType: 'foreign_body',
    foodSafetyImpact: '',
    temporaryRepair: false,
    permanentFixDueDate: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const tenantId = user?.tenantId || 'main_firm';
    assetService.getAll(tenantId)
      .then((items) => setAssets(items))
      .catch((err) => {
        console.error('[Tasks] Asset suggestions failed:', err);
        setAssets([]);
      });
  }, [user?.tenantId]);

  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    setShowNewTask(true);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('new');
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const taskId = searchParams.get('task');
    if (!taskId || loading || openedTaskFromUrl === taskId) return;
    const task = tasks.find((item) => item.id === taskId);
    if (task) {
      setActionsTask(task);
      setOpenedTaskFromUrl(taskId);
      setSearchParams({}, { replace: true });
    }
  }, [loading, openedTaskFromUrl, searchParams, setSearchParams, tasks]);

  useEffect(() => {
    if (searchParams.get('source') !== 'kiosk') return;
    setFilterTab('active');
    setFilterSource('kiosk');
    setSortMode('newest');
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('source');
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  // Counts for tabs
  const activeCount = tasks.filter((t) => t.status !== 'done' && t.status !== 'completed').length;
  const mineCount = tasks.filter((t) =>
    taskWorkerNames(t).includes(user?.displayName || '') &&
    t.status !== 'done' && t.status !== 'completed'
  ).length;
  const doneCount = tasks.filter((t) => t.status === 'done' || t.status === 'completed').length;
  const tabCounts: Record<FilterTab, number> = { active: activeCount, mine: mineCount, done: doneCount };
  const newKioskCount = tasks.filter(isNewKioskTask).length;

  const equipmentAssets = useMemo(() => (
    assets
      .filter((asset) => !asset.isDeleted)
      .filter((asset) => !isBuildingAsset(asset) && !isRoomAsset(asset))
      .sort((a, b) => a.name.localeCompare(b.name, 'cs'))
  ), [assets]);

  const locationOptions = useMemo(() => {
    const byKey = new Map<string, string>();
    const add = (value?: string | null) => {
      const label = String(value || '').trim().replace(/\s+/g, ' ');
      if (!label) return;
      const key = normalizeLookup(label);
      if (!byKey.has(key)) byKey.set(key, label);
    };
    assets
      .filter((asset) => !asset.isDeleted)
      .forEach((asset) => {
        if (isBuildingAsset(asset)) add(asset.name);
        if (isRoomAsset(asset)) add(taskAssetLocation(asset, assets) || asset.name);
        add(taskAssetLocation(asset, assets));
      });
    return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b, 'cs')).slice(0, 60);
  }, [assets]);

  const filteredLocationOptions = useMemo(() => {
    const q = normalizeLookup(form.location);
    return locationOptions
      .filter((label) => !q || normalizeLookup(label).includes(q))
      .slice(0, 20);
  }, [form.location, locationOptions]);

  const filteredAssetOptions = useMemo(() => {
    const q = normalizeLookup(form.assetName);
    const scoped = form.location?.trim()
      ? equipmentAssets.filter((asset) => taskAssetMatchesLocation(asset, form.location, assets))
      : equipmentAssets;
    return scoped
      .filter((asset) => {
        const text = normalizeLookup([asset.name, asset.code, asset.entityType, taskAssetLocation(asset, assets)].filter(Boolean).join(' '));
        return !q || text.includes(q);
      })
      .slice(0, 25);
  }, [assets, equipmentAssets, form.assetName, form.location]);

  const selectedTaskAsset = useMemo(() => {
    if (form.assetId) return assets.find((asset) => asset.id === form.assetId);
    const q = normalizeLookup(form.assetName);
    if (!q) return undefined;
    return equipmentAssets.find((asset) =>
      normalizeLookup(asset.name) === q ||
      normalizeLookup(asset.code || '') === q ||
      normalizeLookup(`${asset.name} ${asset.code || ''}`) === q
    );
  }, [assets, equipmentAssets, form.assetId, form.assetName]);

  const selectedTaskGearboxExtruderName = selectedTaskAsset && isGearboxAsset(selectedTaskAsset)
    ? selectedTaskAsset.currentExtruderName || ''
    : '';

  const resolveTaskAsset = async (task: Task): Promise<Asset | undefined> => {
    if (!task.assetId) return undefined;
    const local = assets.find((asset) => asset.id === task.assetId);
    if (local) return local;
    const snap = await getDoc(doc(db, 'assets', task.assetId));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as Asset) : undefined;
  };

  const selectTaskLocation = (value: string) => {
    const selectedAsset = form.assetId ? assets.find((asset) => asset.id === form.assetId) : undefined;
    setForm(prev => ({
      ...prev,
      location: value,
      ...(selectedAsset && !taskAssetMatchesLocation(selectedAsset, value, assets)
        ? { assetName: '', assetId: '' }
        : {}),
    }));
    setSuggestMode(null);
  };

  const selectTaskAsset = (asset: Asset) => {
    setForm(prev => ({
      ...prev,
      assetName: asset.name,
      assetId: asset.id,
      location: prev.location || taskAssetLocation(asset, assets),
    }));
    setSuggestMode(null);
  };

  // Filtered & sorted tasks
  const filteredTasks = (() => {
    let result = [...tasks];

    switch (filterTab) {
      case 'mine':
        result = result.filter((t) =>
          taskWorkerNames(t).includes(user?.displayName || '') &&
          t.status !== 'done' && t.status !== 'completed'
        );
        break;
      case 'active':
        result = result.filter((t) => t.status !== 'done' && t.status !== 'completed');
        break;
      case 'done':
        result = result.filter((t) => t.status === 'done' || t.status === 'completed');
        break;
    }

    if (filterPriority) {
      result = result.filter((t) => t.priority === filterPriority);
    }

    if (filterTechnician) {
      result = result.filter((t) => taskWorkerNames(t).includes(filterTechnician));
    }

    if (filterSource === 'kiosk') {
      result = result.filter((t) => isKioskTask(t));
    }

    return result.sort((a, b) => compareTasks(a, b, sortMode));
  })();

  const handleCreateTask = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const gearboxExtruderId = selectedTaskAsset && isGearboxAsset(selectedTaskAsset) ? selectedTaskAsset.currentExtruderId || '' : '';
      const gearboxExtruderName = selectedTaskAsset && isGearboxAsset(selectedTaskAsset) ? selectedTaskAsset.currentExtruderName || '' : '';
      await addDoc(collection(db, 'tasks'), {
        title: form.title.trim(),
        description: form.description.trim() || '',
        status: 'backlog',
        priority: form.priority || 'P3',
        type: 'corrective',
        source: 'web',
        workType: form.workType || null,
        location: form.location?.trim() || null,
        assetId: form.assetId || null,
        assetName: form.assetName?.trim() || null,
        foodSafetyRisk: form.foodSafetyRisk === true,
        ...(form.foodSafetyRisk ? {
          foodSafetyHazardType: form.foodSafetyHazardType || 'foreign_body',
          foodSafetyImpact: form.foodSafetyImpact?.trim() || null,
        } : {}),
        temporaryRepair: form.temporaryRepair === true,
        ...(form.temporaryRepair && form.permanentFixDueDate ? {
          permanentFixDueDate: Timestamp.fromDate(new Date(`${form.permanentFixDueDate}T12:00:00`)),
        } : {}),
        ...(gearboxExtruderId ? {
          relatedAssetId: gearboxExtruderId,
          relatedAssetName: gearboxExtruderName,
          relatedAssetRole: 'mounted_extruder',
        } : {}),
        assigneeId: form.assignee || null,
        assigneeName: (form.assignedWorkerNames[0] || form.assignee) || null,
        assignedToName: (form.assignedWorkerNames[0] || form.assignee) || null,
        assignedWorkerNames: uniqueNames([...(form.assignedWorkerNames || []), form.assignee]),
        isDone: false,
        createdAt: Timestamp.now(),
        updatedAt: serverTimestamp(),
        createdById: user?.id || 'unknown',
        createdByName: user?.displayName || 'Neznámý',
      });
      setShowNewTask(false);
      clearDraft();
    } catch (err) {
      console.error('Create task failed:', err);
    }
    setSaving(false);
  };

  return (
    <div className="vik-page">
      <div className="vik-page-shell px-3 pt-4 pb-24">

        {/* Header */}
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => goBack()}
            className="vik-button w-10 h-10 p-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white">Úkoly</h1>
            <p className="text-xs text-slate-500">
              {activeCount} otevřených · {doneCount} hotových
            </p>
          </div>
          {filterTab === 'done' && (
            <button
              onClick={() => exportCompletedTasksPrint(filteredTasks)}
              className="vik-button w-10 h-10 p-0"
              title="Export PDF"
            >
              <Download className="w-5 h-5 text-slate-400" />
            </button>
          )}
          {loading && <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />}
        </div>

        {/* Summary */}
        <TaskSummary tasks={tasks} />

        {newKioskCount > 0 && filterTab !== 'done' && (
          <button
            type="button"
            onClick={() => { setFilterTab('active'); setFilterSource('kiosk'); setSortMode('newest'); }}
            className="mb-3 flex w-full items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-left shadow-sm"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-700">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-black text-red-800">
                {newKioskCount === 1 ? 'Nové hlášení z kiosku' : `${newKioskCount} nová hlášení z kiosku`}
              </span>
              <span className="block text-xs font-semibold text-red-700">Kliknutím zobrazíš nejnovější úkoly od obsluhy.</span>
            </span>
          </button>
        )}

        {/* Tab filters */}
        <div className="flex gap-2 mb-3 border-b border-white/10 pb-2 overflow-x-auto">
          {TAB_OPTIONS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilterTab(tab.key)}
              className={`vik-chip ${
                filterTab === tab.key
                  ? 'vik-chip-active'
                  : ''
              }`}
            >
              {tab.label}
              <span className="ml-1.5 text-[11px] opacity-70">{tabCounts[tab.key]}</span>
            </button>
          ))}
        </div>

        {/* Compact filters */}
        <div className="grid grid-cols-1 gap-2 mb-4 sm:grid-cols-2 xl:grid-cols-4">
          <select
            value={filterPriority || ''}
            onChange={(e) => setFilterPriority(e.target.value || null)}
            className="vik-input flex-1 text-sm font-semibold"
          >
            <option value="">Priorita: Vše</option>
            <option value="P1">P1 — Havárie</option>
            <option value="P2">P2 — Tento týden</option>
            <option value="P3">P3 — Běžná</option>
            <option value="P4">P4 — Nápad</option>
          </select>
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="vik-input flex-1 text-sm font-semibold"
          >
            <option value="smart">Řazení: priorita + nové</option>
            <option value="newest">Řazení: nejnovější</option>
            <option value="priority">Řazení: jen priorita</option>
          </select>
          <select
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value as SourceFilter)}
            className="vik-input flex-1 text-sm font-semibold"
          >
            <option value="all">Zdroj: Vše</option>
            <option value="kiosk">Zdroj: Kiosk</option>
          </select>
          {technicians.length > 0 && (
            <select
              value={filterTechnician || ''}
              onChange={(e) => setFilterTechnician(e.target.value || null)}
              className="vik-input flex-1 text-sm font-semibold"
            >
              <option value="">Technik: Všichni</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.displayName}>{t.displayName}</option>
              ))}
            </select>
          )}
        </div>

        {/* ═══ CARD GRID ═══ */}
        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Načítám...
          </div>
        ) : filteredTasks.length === 0 ? (
          <EmptyState
            icon={<Inbox className="w-12 h-12" />}
            title={filterTab === 'mine' ? 'Žádné přiřazené úkoly' : filterTab === 'done' ? 'Žádné hotové úkoly' : 'Žádné aktivní úkoly'}
            subtitle={filterPriority ? 'Zkus jiný filtr priority' : 'Vše čisté!'}
            actionLabel="Nový úkol"
            onAction={() => setShowNewTask(true)}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredTasks.map((task) => (
              <TaskCard key={task.id} task={task} onClick={() => setActionsTask(task)} onEdit={() => setEditingTask(task)} onAddLog={() => { setLogText(''); setLoggingTask(task); }} onTake={async () => {
                const userName = user?.displayName || 'Uživatel';
                const names = uniqueNames([...taskWorkerNames(task), userName]);
                await updateDoc(doc(db, 'tasks', task.id), {
                  status: 'in_progress',
                  startedAt: serverTimestamp(),
                  assignedWorkerNames: names,
                  assignedToName: names[0] || userName,
                  updatedBy: userName,
                  updatedAt: serverTimestamp(),
                });
                showToast('Úkol převzat', 'success');
              }} onComplete={() => setCompletingTask(task)} onDelete={async () => {
                if (window.confirm(`Smazat úkol "${task.title}"?`)) {
                  await deleteDoc(doc(db, 'tasks', task.id));
                }
              }} />
            ))}
          </div>
        )}
      </div>

      {/* FAB */}
      <FAB icon={<Plus className="w-6 h-6" />} label="Nový úkol" onClick={() => setShowNewTask(true)} />

      {/* New Task Modal */}
      <BottomSheet title="Nový úkol" isOpen={showNewTask} onClose={() => setShowNewTask(false)}>
        <div className="-mx-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-slate-950 shadow-inner sm:-mx-1">
        <FormField label="Název" value={form.title} onChange={(v) => setForm(prev => ({ ...prev, title: v }))} placeholder="Co je potřeba udělat?" required />
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <FormField label="Popis" value={form.description} onChange={(v) => setForm(prev => ({ ...prev, description: v }))} type="textarea" placeholder="Podrobnosti..." />
          </div>
          <div className="mb-4">
            <MicButton onTranscript={(t) => setForm(prev => ({ ...prev, description: prev.description ? prev.description + ' ' + t : t }))} />
          </div>
        </div>
        <WorkerMultiSelect
          label="Kdo na tom bude dělat"
          selected={form.assignedWorkerNames || []}
          onChange={(value) => setForm(prev => ({
            ...prev,
            assignedWorkerNames: value,
            assignee: value[0] || '',
          }))}
          options={technicians.map((t) => t.displayName)}
        />
        <FormField
          label="Typ práce"
          value={form.workType}
          onChange={(v) => setForm(prev => ({ ...prev, workType: v }))}
          type="select"
          required
          options={cmmsConfig.workTypes.map(w => ({ value: w.id, label: w.label }))}
        />
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-semibold text-slate-600">Kde</span>
            <div className="relative mt-2">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
              <input
                value={form.location || ''}
                onChange={(event) => {
                  setForm(prev => ({ ...prev, location: event.target.value, assetId: '' }));
                  setSuggestMode('location');
                }}
                onFocus={() => setSuggestMode('location')}
                placeholder="Budova D - Extrudovna II"
                autoComplete="off"
                className="w-full min-h-14 rounded-2xl border border-slate-300 bg-white py-4 pl-12 pr-4 text-base font-bold text-slate-950 outline-none placeholder:text-slate-400 focus:border-emerald-600"
              />
            </div>
            {suggestMode === 'location' && filteredLocationOptions.length > 0 && (
              <div className={taskSuggestionPanelClass}>
                {filteredLocationOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectTaskLocation(option)}
                    className="w-full min-h-14 rounded-xl px-4 py-3 text-left text-base font-black leading-snug text-slate-950 active:bg-emerald-50"
                  >
                    <span className="flex items-start gap-3">
                      <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-blue-300" />
                      <span className="break-words">{option}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-600">Zařízení / věc</span>
            {form.location?.trim() && (
              <span className="mt-1 block text-xs font-bold text-emerald-700">
                Nabízím jen zařízení podle zvolené místnosti.
              </span>
            )}
            <div className="relative mt-2">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
              <input
                value={form.assetName || ''}
                onChange={(event) => {
                  setForm(prev => ({ ...prev, assetName: event.target.value, assetId: '' }));
                  setSuggestMode('asset');
                }}
                onFocus={() => setSuggestMode('asset')}
                placeholder="Extruder, dopravník, převodovka..."
                autoComplete="off"
                className="w-full min-h-14 rounded-2xl border border-slate-300 bg-white py-4 pl-12 pr-4 text-base font-bold text-slate-950 outline-none placeholder:text-slate-400 focus:border-emerald-600"
              />
            </div>
            {suggestMode === 'asset' && filteredAssetOptions.length > 0 && (
              <div className={taskSuggestionPanelClass}>
                {filteredAssetOptions.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectTaskAsset(asset)}
                    className="w-full min-h-16 rounded-xl px-4 py-3 text-left active:bg-emerald-50"
                  >
                    <span className="flex items-start gap-3">
                      <Wrench className="mt-0.5 h-5 w-5 shrink-0 text-blue-300" />
                      <span className="min-w-0">
                        <span className="block text-base font-black leading-snug text-slate-950 break-words">{asset.name}</span>
                        <span className="mt-1 block text-sm leading-snug text-slate-600 break-words">
                          {[asset.code, taskAssetLocation(asset, assets)].filter(Boolean).join(' | ') || asset.entityType}
                        </span>
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {suggestMode === 'asset' && form.location?.trim() && filteredAssetOptions.length === 0 && (
              <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">
                V této místnosti zatím nevidím žádné zařízení z kartotéky.
              </div>
            )}
            {selectedTaskAsset && isGearboxAsset(selectedTaskAsset) && selectedTaskGearboxExtruderName && (
              <div className="mt-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-3 text-sm font-semibold text-violet-900">
                <div className="font-black">Sledovaná převodovka</div>
                <div className="mt-1">Je namontovaná na: {selectedTaskGearboxExtruderName}</div>
                <div className="mt-1 text-xs font-bold text-violet-700">
                  Úkol i pozdější zápisy se uloží do historie převodovky i extruderu.
                </div>
              </div>
            )}
          </label>
        </div>
        <FormField
          label="Priorita"
          value={form.priority}
          onChange={(v) => setForm(prev => ({ ...prev, priority: v }))}
          type="select"
          required
          options={cmmsConfig.priorities.map(p => ({ value: p.id, label: p.label }))}
        />

        <div className="space-y-3 rounded-2xl border border-red-200 bg-red-50 p-3">
          <button
            type="button"
            onClick={() => setForm(prev => ({ ...prev, foodSafetyRisk: !prev.foodSafetyRisk }))}
            className="flex w-full items-start gap-3 text-left"
          >
            <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs font-bold ${
              form.foodSafetyRisk ? 'border-red-600 bg-red-600 text-white' : 'border-slate-400 bg-white text-transparent'
            }`}>
              ✓
            </span>
            <span>
              <span className="block text-sm font-black text-slate-950">Food safety riziko</span>
              <span className="block text-xs font-semibold text-slate-600">Použij pro kontaminaci, alergeny, cizí tělesa nebo hygienické riziko.</span>
            </span>
          </button>
          {form.foodSafetyRisk && (
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                label="Typ nebezpečí"
                value={form.foodSafetyHazardType}
                onChange={(v) => setForm(prev => ({ ...prev, foodSafetyHazardType: v }))}
                type="select"
                options={FOOD_SAFETY_HAZARD_OPTIONS}
              />
              <FormField
                label="Dopad"
                value={form.foodSafetyImpact}
                onChange={(v) => setForm(prev => ({ ...prev, foodSafetyImpact: v }))}
                placeholder="Např. produkt zastaven, nutná kontrola linky..."
                required
              />
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-3">
          <button
            type="button"
            onClick={() => setForm(prev => ({ ...prev, temporaryRepair: !prev.temporaryRepair }))}
            className="flex w-full items-start gap-3 text-left"
          >
            <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs font-bold ${
              form.temporaryRepair ? 'border-amber-600 bg-amber-500 text-slate-950' : 'border-slate-400 bg-white text-transparent'
            }`}>
              ✓
            </span>
            <span>
              <span className="block text-sm font-black text-slate-950">Dočasná oprava</span>
              <span className="block text-xs font-semibold text-slate-600">IFS 4.16: musí mít termín trvalého řešení.</span>
            </span>
          </button>
          {form.temporaryRepair && (
            <FormField
              label="Termín trvalého řešení"
              value={form.permanentFixDueDate}
              onChange={(v) => setForm(prev => ({ ...prev, permanentFixDueDate: v }))}
              type="date"
              required
            />
          )}
        </div>

        <FormFooter
          onCancel={() => setShowNewTask(false)}
          onSubmit={handleCreateTask}
          submitLabel="Vytvořit úkol"
          loading={saving}
          disabled={!form.title.trim() || (form.foodSafetyRisk && !form.foodSafetyImpact.trim()) || (form.temporaryRepair && !form.permanentFixDueDate)}
        />
        </div>
      </BottomSheet>

      {/* Task Actions Sheet */}
      {actionsTask && (
        <TaskActionsSheet
          task={actionsTask}
          userName={user?.displayName || 'Neznámý'}
          onClose={() => setActionsTask(null)}
          onEdit={() => { setEditingTask(actionsTask); setActionsTask(null); }}
          onComplete={() => { setCompletingTask(actionsTask); setActionsTask(null); }}
          onStatusChange={async (updates) => {
            await updateDoc(doc(db, 'tasks', actionsTask.id), {
              ...updates,
              updatedAt: serverTimestamp(),
            });
            setActionsTask(null);
          }}
        />
      )}

      {/* Complete Task Modal */}
      {completingTask && (
        <CompleteTaskModal
          taskTitle={completingTask.title}
          defaultWorkers={taskWorkerNames(completingTask)}
          workerOptions={technicians.map((t) => t.displayName)}
          onConfirm={async (data) => {
            const completedByNames = uniqueNames([...(data.completedByNames || []), data.completedByName, user?.displayName]);
            const completedByName = completedByNames.join(', ') || user?.displayName || 'Neznamy';
            const assignedWorkerNames = uniqueNames([...taskWorkerNames(completingTask), ...completedByNames]);
            const performedAt = data.performedDate ? Timestamp.fromDate(new Date(`${data.performedDate}T12:00:00`)) : serverTimestamp();
            const resultLabel = taskResultLabel(data.result);
            const diaryContent = [
              data.resolution,
              resultLabel ? `Výsledek: ${resultLabel}` : '',
              data.cleaningStatus === 'done' ? `Úklid po opravě: provedeno${data.cleaningNote ? ` (${data.cleaningNote})` : ''}` : '',
              data.cleaningStatus === 'not_applicable' ? `Úklid po opravě: netýká se${data.cleaningNote ? ` (${data.cleaningNote})` : ''}` : '',
              data.auditNote ? `Audit: ${data.auditNote}` : '',
            ].filter(Boolean).join('\n');
            const batch = writeBatch(db);
            const taskRef = doc(db, 'tasks', completingTask.id);
            const workLogRef = doc(collection(db, 'workLogs'));
            const taskAsset = await resolveTaskAsset(completingTask);
            const linkedExtruderId = taskAsset && isGearboxAsset(taskAsset)
              ? taskAsset.currentExtruderId || completingTask.relatedAssetId || ''
              : '';
            const linkedExtruderName = taskAsset && isGearboxAsset(taskAsset)
              ? taskAsset.currentExtruderName || completingTask.relatedAssetName || ''
              : '';
            const workLogData: Record<string, unknown> = {
              workOrderId: completingTask.id,
              taskId: completingTask.id,
              taskTitle: completingTask.title,
              userId: user?.id || 'unknown',
              userName: completedByName,
              workerNames: completedByNames,
              completedByNames,
              type: 'time_log',
              content: diaryContent,
              auditReady: true,
              performedAt,
              createdAt: serverTimestamp(),
              result: data.result,
              auditNote: data.auditNote,
              cleaningStatus: data.cleaningStatus,
              cleaningDone: data.cleaningDone,
              cleaningChecked: data.cleaningChecked,
              cleaningNotApplicable: data.cleaningNotApplicable,
              cleaningNote: data.cleaningNote,
            };
            if (completingTask.assetId) workLogData.assetId = completingTask.assetId;
            if (taskAsset?.name || completingTask.assetName) workLogData.assetName = taskAsset?.name || completingTask.assetName;
            if (data.workType) workLogData.workType = data.workType;
            if (data.durationMinutes) {
              workLogData.hoursWorked = data.durationMinutes / 60;
            }
            if (taskAsset && isGearboxAsset(taskAsset) && linkedExtruderId && linkedExtruderName) {
              const shadowWorkLogRef = doc(collection(db, 'workLogs'));
              workLogData.relatedWorkLogId = shadowWorkLogRef.id;
              workLogData.relatedWorkLogRole = 'gearbox_source';
              workLogData.relatedAssetId = linkedExtruderId;
              workLogData.relatedAssetName = linkedExtruderName;

              batch.set(shadowWorkLogRef, {
                ...workLogData,
                assetId: linkedExtruderId,
                assetName: linkedExtruderName,
                location: linkedExtruderName,
                workType: 'gearbox_related_work',
                relatedWorkLogId: workLogRef.id,
                relatedWorkLogRole: 'extruder_shadow',
                relatedAssetId: taskAsset.id,
                relatedAssetName: taskAsset.name,
                content: [
                  `Dokončen úkol na převodovce: ${taskAsset.name}`,
                  taskAsset.code ? `Kód převodovky: ${taskAsset.code}` : '',
                  `Převodovka byla sledovaná na extruderu: ${linkedExtruderName}`,
                  diaryContent,
                ].filter(Boolean).join('\n'),
              });
            }

            batch.update(taskRef, {
              status: 'completed',
              isDone: true,
              resolution: data.resolution,
              durationMinutes: data.durationMinutes,
              workType: data.workType || null,
              result: data.result,
              auditNote: data.auditNote || null,
              completedAt: serverTimestamp(),
              completedBy: completedByName,
              completedByNames,
              assignedWorkerNames,
              assignedToName: assignedWorkerNames[0] || completedByName,
              ...(linkedExtruderId ? {
                relatedAssetId: linkedExtruderId,
                relatedAssetName: linkedExtruderName,
                relatedAssetRole: 'mounted_extruder',
              } : {}),
              updatedAt: serverTimestamp(),
            });
            batch.set(workLogRef, workLogData);
            await batch.commit();
            setCompletingTask(null);
          }}
          onClose={() => setCompletingTask(null)}
        />
      )}

      {/* Quick Log Modal — rychlý zápis k úkolu z kartičky */}
      {loggingTask && (
        <BottomSheet title="Přidat zápis" isOpen onClose={() => { setLoggingTask(null); setLogText(''); }}>
          <div className="mb-3 rounded-xl bg-slate-100 border border-slate-200 p-3 text-sm font-semibold text-slate-900">
            {loggingTask.title}
          </div>
          <FormField
            label="Zápis"
            value={logText}
            onChange={setLogText}
            type="textarea"
            placeholder="Co se udělalo / poznámka k úkolu..."
            required
          />
          <button
            type="button"
            disabled={savingLog || !logText.trim()}
            onClick={async () => {
              const text = logText.trim();
              if (!loggingTask || !text) return;
              setSavingLog(true);
              try {
                const taskAsset = await resolveTaskAsset(loggingTask);
                const linkedExtruderId = taskAsset && isGearboxAsset(taskAsset)
                  ? taskAsset.currentExtruderId || loggingTask.relatedAssetId || ''
                  : '';
                const linkedExtruderName = taskAsset && isGearboxAsset(taskAsset)
                  ? taskAsset.currentExtruderName || loggingTask.relatedAssetName || ''
                  : '';
                const createdLogId = await addWorkLog({
                  workOrderId: loggingTask.id,
                  taskId: loggingTask.id,
                  taskTitle: loggingTask.title,
                  assetId: loggingTask.assetId,
                  assetName: taskAsset?.name || loggingTask.assetName,
                  location: loggingTask.location,
                  userId: user?.id || 'unknown',
                  userName: user?.displayName || 'Neznámý',
                  type: 'note',
                  content: text,
                  ...(taskAsset && isGearboxAsset(taskAsset) && linkedExtruderId && linkedExtruderName ? {
                    relatedWorkLogRole: 'gearbox_source' as const,
                    relatedAssetId: linkedExtruderId,
                    relatedAssetName: linkedExtruderName,
                  } : {}),
                });
                if (taskAsset && isGearboxAsset(taskAsset) && linkedExtruderId && linkedExtruderName) {
                  const relatedLogId = await addWorkLog({
                    workOrderId: loggingTask.id,
                    taskId: loggingTask.id,
                    taskTitle: loggingTask.title,
                    assetId: linkedExtruderId,
                    assetName: linkedExtruderName,
                    location: linkedExtruderName,
                    userId: user?.id || 'unknown',
                    userName: user?.displayName || 'Neznámý',
                    type: 'note',
                    workType: 'gearbox_related_work',
                    relatedWorkLogId: createdLogId,
                    relatedWorkLogRole: 'extruder_shadow',
                    relatedAssetId: taskAsset.id,
                    relatedAssetName: taskAsset.name,
                    content: [
                      `Zápis k úkolu na převodovce: ${taskAsset.name}`,
                      taskAsset.code ? `Kód převodovky: ${taskAsset.code}` : '',
                      `Převodovka je sledovaná na extruderu: ${linkedExtruderName}`,
                      text,
                    ].filter(Boolean).join('\n'),
                  });
                  await updateDoc(doc(db, 'workLogs', createdLogId), {
                    relatedWorkLogId: relatedLogId,
                    updatedAt: serverTimestamp(),
                  });
                }
                await updateDoc(doc(db, 'tasks', loggingTask.id), {
                  lastUpdate: text,
                  lastUpdateAt: serverTimestamp(),
                  lastUpdateBy: user?.displayName || 'Neznámý',
                  ...(linkedExtruderId ? {
                    relatedAssetId: linkedExtruderId,
                    relatedAssetName: linkedExtruderName,
                    relatedAssetRole: 'mounted_extruder',
                  } : {}),
                  updatedAt: serverTimestamp(),
                });
                setLoggingTask(null);
                setLogText('');
              } catch (err) {
                console.error('[TasksPage] quick log failed:', err);
              } finally {
                setSavingLog(false);
              }
            }}
            className="w-full min-h-12 rounded-xl bg-sky-600 text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <FileText className="w-5 h-5" /> Uložit zápis
          </button>
        </BottomSheet>
      )}

      {/* Edit Task Sheet */}
      {editingTask && (
        <EditTaskSheet
          task={editingTask}
          workerOptions={technicians.map((t) => t.displayName)}
          onClose={() => setEditingTask(null)}
          onSave={async (updates) => {
            await updateDoc(doc(db, 'tasks', editingTask.id), {
              ...updates,
              updatedAt: serverTimestamp(),
            });
            setEditingTask(null);
          }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// EDIT TASK SHEET
// ═══════════════════════════════════════════════════
function EditTaskSheet({ task, workerOptions, onClose, onSave }: {
  task: Task;
  workerOptions: string[];
  onClose: () => void;
  onSave: (updates: Record<string, unknown>) => Promise<void>;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  const [priority, setPriority] = useState(task.priority);
  const [status, setStatus] = useState(task.status);
  const [assignedWorkers, setAssignedWorkers] = useState(taskWorkerNames(task));
  const [workType, setWorkType] = useState((task as any).workType || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim(),
        priority,
        status,
        assignedWorkerNames: assignedWorkers,
        assignedToName: assignedWorkers[0] || null,
        workType: workType || null,
      });
    } catch (err) {
      console.error('[TasksPage] Edit save failed:', err);
    }
    setSaving(false);
  };

  return (
    <BottomSheet title="Upravit úkol" isOpen onClose={onClose}>
      <FormField label="Název" value={title} onChange={setTitle} required />
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <FormField label="Popis" value={description} onChange={setDescription} type="textarea" />
        </div>
        <div className="mb-4">
          <MicButton onTranscript={(t) => setDescription((prev) => prev ? prev + ' ' + t : t)} />
        </div>
      </div>
      <FormField
        label="Priorita"
        value={priority}
        onChange={setPriority}
        type="select"
        options={cmmsConfig.priorities.map(p => ({ value: p.id, label: p.label }))}
      />
      <FormField
        label="Status"
        value={status}
        onChange={setStatus}
        type="select"
        options={[
          { value: 'backlog', label: 'Nový' },
          { value: 'planned', label: 'Plánovaný' },
          { value: 'in_progress', label: 'V řešení' },
          { value: 'paused', label: 'Čeká na díl' },
          { value: 'deferred', label: 'Odloženo' },
          { value: 'completed', label: 'Hotovo' },
        ]}
      />
      <FormField
        label="Typ práce"
        value={workType}
        onChange={setWorkType}
        type="select"
        required
        options={cmmsConfig.workTypes.map(w => ({ value: w.id, label: w.label }))}
      />
      <WorkerMultiSelect
        label="Kdo na tom bude dělat"
        selected={assignedWorkers}
        onChange={setAssignedWorkers}
        options={workerOptions}
      />
      <FormFooter
        onCancel={onClose}
        onSubmit={handleSave}
        submitLabel="Uložit změny"
        loading={saving}
        disabled={!title.trim()}
      />
    </BottomSheet>
  );
}

// ═══════════════════════════════════════════════════
// TASK ACTIONS SHEET (status transitions)
// ═══════════════════════════════════════════════════
function TaskActionsSheet({ task, userName, onClose, onEdit, onComplete, onStatusChange }: {
  task: Task;
  userName: string;
  onClose: () => void;
  onEdit: () => void;
  onComplete: () => void;
  onStatusChange: (updates: Record<string, unknown>) => Promise<void>;
}) {
  const navigate = useNavigate();
  const [showPlanner, setShowPlanner] = useState(false);
  const [plannedDate, setPlannedDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [sourceLog, setSourceLog] = useState<SourceWorkLog | null>(null);
  const [updates, setUpdates] = useState<WorkLog[]>([]);
  const [updateText, setUpdateText] = useState('');
  const [savingUpdate, setSavingUpdate] = useState(false);

  const isDone = task.status === 'done' || task.status === 'completed';
  const isInProgress = task.status === 'in_progress';
  const diaryTask = isDiaryTask(task);

  useEffect(() => {
    let cancelled = false;
    setSourceLog(null);
    if (!diaryTask || !task.sourceRefId) return;
    getDoc(doc(db, 'workLogs', task.sourceRefId))
      .then((snapshot) => {
        if (!cancelled && snapshot.exists()) {
          setSourceLog({ id: snapshot.id, ...snapshot.data() } as SourceWorkLog);
        }
      })
      .catch((err) => {
        console.error('[TasksPage] Source work log failed:', err);
      });
    return () => { cancelled = true; };
  }, [diaryTask, task.sourceRefId]);

  useEffect(() => {
    return subscribeToWorkLogs(task.id, setUpdates);
  }, [task.id]);

  const doAction = async (updates: Record<string, unknown>) => {
    setSaving(true);
    await onStatusChange(updates);
    setSaving(false);
  };

  const saveUpdate = async (text = updateText) => {
    const cleanText = text.trim();
    if (!cleanText) return;
    setSavingUpdate(true);
    try {
      await addWorkLog({
        workOrderId: task.id,
        taskId: task.id,
        taskTitle: task.title,
        userId: userName || 'unknown',
        userName: userName || 'Neznámý',
        type: 'note',
        content: cleanText,
      });
      await updateDoc(doc(db, 'tasks', task.id), {
        lastUpdate: cleanText,
        lastUpdateAt: serverTimestamp(),
        lastUpdateBy: userName,
        updatedAt: serverTimestamp(),
      });
      setUpdateText('');
    } finally {
      setSavingUpdate(false);
    }
  };

  const sb = STATUS_BADGES[task.status] || STATUS_BADGES.backlog;
  const pc = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.P3;

  return (
    <BottomSheet title="Detail úkolu" isOpen onClose={onClose}>
      <div className="-mx-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-slate-950 shadow-inner sm:-mx-1">
      {/* Task info */}
      <div className="rounded-xl border border-slate-200 bg-white p-3.5 mb-5">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${pc.color}20`, color: pc.color }}>
              {task.priority}
            </span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-lg ${sb.bg} ${sb.text}`}>{sb.label}</span>
          </div>
          <button
            type="button"
            onClick={onEdit}
            className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-300 text-amber-800 text-xs font-bold active:scale-95"
          >
            Upravit
          </button>
        </div>
        <div className="text-slate-950 font-semibold">{task.title}</div>
        {task.description && <div className="text-xs text-slate-600 mt-1 line-clamp-2">{task.description}</div>}
        {(task.foodSafetyRisk || task.temporaryRepair) && (
          <div className="mt-3 grid gap-2">
            {task.foodSafetyRisk && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
                <div className="font-black">Food safety riziko</div>
                <div className="mt-0.5">
                  {foodSafetyHazardLabel(task.foodSafetyHazardType)}
                  {task.foodSafetyImpact ? ` · ${task.foodSafetyImpact}` : ''}
                </div>
              </div>
            )}
            {task.temporaryRepair && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                <div className="font-black">Dočasná oprava</div>
                <div className="mt-0.5">
                  Trvalé řešení do: {formatDateTime(task.permanentFixDueDate) || 'není zadáno'}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {diaryTask && (
        <div className="mb-4 rounded-xl bg-amber-500/10 border border-amber-500/25 p-3.5">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-2 text-amber-800 font-bold text-sm">
              <ClipboardList className="w-4 h-4" />
              Vzniklo z deníku údržby
            </div>
            {task.sourceRefId && (
              <button
                type="button"
                onClick={() => navigate(`/work-diary?log=${task.sourceRefId}`)}
                className="px-2.5 py-1.5 rounded-lg bg-amber-500 text-slate-950 text-xs font-bold active:scale-95"
              >
                Otevřít zápis
              </button>
            )}
          </div>
          {sourceLog ? (
            <div className="space-y-2 text-xs text-slate-700">
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-slate-600">
                {sourceLog.userName && <span className="flex items-center gap-1"><User className="w-3 h-3" />{sourceLog.userName}</span>}
                {(sourceLog.performedAt || sourceLog.createdAt) && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDateTime(sourceLog.performedAt || sourceLog.createdAt)}</span>}
                {sourceLog.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{sourceLog.location}</span>}
                {sourceLog.hoursWorked && <span>{formatMinutes(Math.round(sourceLog.hoursWorked * 60))}</span>}
              </div>
              {sourceLog.assetName && <div className="font-bold text-amber-800">{sourceLog.assetName}</div>}
              <div className="whitespace-pre-wrap leading-relaxed">{sourceLog.content || 'Bez popisu'}</div>
            </div>
          ) : (
            <div className="text-xs text-slate-600">
              Původní zápis se načítá, nebo už není dostupný. Základní text je uložený v popisu úkolu.
            </div>
          )}
        </div>
      )}

      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3.5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <div className="text-sm font-bold text-slate-950">Aktualizace úkolu</div>
            <div className="text-xs text-slate-600">Krátké průběžné poznámky k otevřenému úkolu.</div>
          </div>
          <span className="text-xs font-bold px-2 py-1 rounded-lg bg-slate-100 text-slate-700">
            {updates.length}
          </span>
        </div>

        {!isDone && (
          <div className="space-y-2 mb-3">
            <textarea
              value={updateText}
              onChange={(event) => setUpdateText(event.target.value)}
              placeholder="Např. čekáme na díl, rozebráno, objednáno, domluveno s výrobou..."
              className="w-full min-h-[92px] rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none placeholder:text-slate-400 focus:border-emerald-600"
            />
            <div className="grid grid-cols-2 gap-2">
              {['Čeká na díl', 'Objednáno', 'Domluveno s výrobou', 'Bude pokračovat'].map((label) => (
                <button
                  key={label}
                  type="button"
                  disabled={savingUpdate}
                  onClick={() => saveUpdate(label)}
                  className="min-h-10 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 active:scale-95 disabled:opacity-50"
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={!updateText.trim() || savingUpdate}
              onClick={() => saveUpdate()}
              className="w-full min-h-12 rounded-xl bg-blue-500 text-white text-sm font-bold active:scale-95 disabled:opacity-40"
            >
              {savingUpdate ? 'Ukládám...' : 'Přidat aktualizaci'}
            </button>
          </div>
        )}

        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {updates.length === 0 ? (
            <div className="text-xs text-slate-500">Zatím tu není žádná aktualizace.</div>
          ) : (
            updates.slice(0, 8).map((update) => (
              <div key={update.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 mb-1">
                  <span className="font-bold text-slate-700">{update.userName || 'Neznámý'}</span>
                  <span>{formatDateTime(update.createdAt)}</span>
                </div>
                <div className="text-sm text-slate-800 whitespace-pre-wrap">{update.content}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Date picker (conditionally shown) */}
      {showPlanner && (
        <div className="mb-4 p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
          <label className="block text-sm text-blue-400 font-medium mb-2">
            <CalendarDays className="w-4 h-4 inline mr-1.5" />
            Datum plánování
          </label>
          <input
            type="date"
            value={plannedDate}
            onChange={(e) => setPlannedDate(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-white border border-slate-300 text-slate-950 text-base focus:outline-none focus:border-blue-500/50 transition min-h-[48px]"
          />
          <button
            disabled={!plannedDate || saving}
            onClick={() => doAction({ status: 'planned', plannedDate, updatedBy: userName })}
            className="w-full mt-3 py-3.5 rounded-xl bg-blue-500 text-white font-bold text-base active:scale-[0.97] transition disabled:opacity-40"
          >
            {saving ? 'Ukládám...' : 'Potvrdit plán'}
          </button>
        </div>
      )}

      {/* Action buttons — vertical stack, thumb-friendly */}
      {!isDone && (
        <div className="flex flex-col gap-2.5">
          {/* Přebírám */}
          <button
            disabled={saving}
            onClick={() => {
              const names = uniqueNames([...taskWorkerNames(task), userName]);
              const update: Record<string, unknown> = {
                status: 'in_progress',
                assignedWorkerNames: names,
                assignedToName: names[0] || userName,
                updatedBy: userName,
              };
              if (!isInProgress) update.startedAt = serverTimestamp();
              doAction(update);
            }}
            className="w-full py-4 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 font-bold text-base flex items-center justify-center gap-2.5 active:scale-[0.97] transition disabled:opacity-40"
          >
            <Play className="w-5 h-5" /> Přebírám
          </button>

          {/* Naplánovat */}
          {!showPlanner && (
            <button
              onClick={() => setShowPlanner(true)}
              className="w-full py-4 rounded-2xl bg-blue-500/15 border border-blue-500/30 text-blue-400 font-bold text-base flex items-center justify-center gap-2.5 active:scale-[0.97] transition"
            >
              <CalendarDays className="w-5 h-5" /> Naplánovat
            </button>
          )}

          {/* Odložit */}
          <button
            disabled={saving}
            onClick={() => doAction({ status: 'deferred', updatedBy: userName })}
            className="w-full py-4 rounded-2xl bg-violet-500/15 border border-violet-500/30 text-violet-400 font-bold text-base flex items-center justify-center gap-2.5 active:scale-[0.97] transition disabled:opacity-40"
          >
            <PauseCircle className="w-5 h-5" /> Odložit
          </button>

          {/* Dokončit */}
          <button
            onClick={onComplete}
            className="w-full py-4 rounded-2xl bg-emerald-500 text-white font-bold text-base flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-500/25 active:scale-[0.97] transition"
          >
            <CheckCircle2 className="w-5 h-5" /> Dokončit
          </button>
        </div>
      )}

      {isDone && (
        <div className="text-center py-6 text-emerald-400 font-semibold">
          <CheckCircle2 className="w-8 h-8 mx-auto mb-2" />
          Tento úkol je dokončen
        </div>
      )}
      </div>
    </BottomSheet>
  );
}


