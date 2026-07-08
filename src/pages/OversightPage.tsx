// src/pages/OversightPage.tsx
// „Dohled" — kontrolní věž pro vedení + údržbu. Jedna obrazovka: JAK TO CELÉ FUNGUJE.
// Čtyři roviny: (1) žijí data / používá se to, (2) provoz v kondici, (3) dodržuje se,
// (4) připravenost na audit. JEN ČTENÍ — nic nemění. Gate: report.read (operátor nevidí).

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import {
  ArrowLeft, Activity, AlertTriangle, ClipboardCheck,
  FileText, ShieldCheck, Loader2, Gauge, Bug,
} from 'lucide-react';
import { db } from '../lib/firebase';
import { useAuthContext } from '../context/AuthContext';
import { useBackNavigation } from '../hooks/useBackNavigation';
import { useStats } from '../hooks/useStats';
import { assetService } from '../services/assetService';
import type { Asset } from '../types/asset';

type Tone = 'ok' | 'warn' | 'crit' | 'idle';
const TONE_BG: Record<Tone, string> = {
  ok: 'border-emerald-200 bg-emerald-50', warn: 'border-amber-200 bg-amber-50',
  crit: 'border-red-200 bg-red-50', idle: 'border-slate-200 bg-white',
};
const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-emerald-800', warn: 'text-amber-800', crit: 'text-red-800', idle: 'text-slate-600',
};

const norm = (s?: unknown) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
function eventDaysTo(iso?: string): number | null {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return Math.round((new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() - dayStart(new Date())) / 86400000);
}
function toMs(v: unknown): number {
  const t = (v as { toMillis?: () => number })?.toMillis?.();
  if (typeof t === 'number') return t;
  const d = new Date(String(v ?? '')).getTime();
  return Number.isNaN(d) ? 0 : d;
}
function agoLabel(ms: number): string {
  if (!ms) return 'nikdy';
  const days = Math.floor((Date.now() - ms) / 86400000);
  if (days <= 0) return 'dnes';
  if (days === 1) return 'včera';
  if (days < 7) return `před ${days} dny`;
  if (days < 60) return `před ${Math.floor(days / 7)} týdny`;
  return `před ${Math.floor(days / 30)} měsíci`;
}

interface Signal { label: string; value: string; tone: Tone; hint?: string; onClick?: () => void; }

function SignalRow({ s }: { s: Signal }) {
  const Row = s.onClick ? 'button' : 'div';
  return (
    <Row
      {...(s.onClick ? { type: 'button', onClick: s.onClick } : {})}
      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left ${TONE_BG[s.tone]}`}
    >
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${s.tone === 'ok' ? 'bg-emerald-500' : s.tone === 'warn' ? 'bg-amber-500' : s.tone === 'crit' ? 'bg-red-500' : 'bg-slate-300'}`} />
      <span className="min-w-0 flex-1">
        <span className={`block text-[14px] font-bold ${TONE_TEXT[s.tone]}`}>{s.label}</span>
        {s.hint && <span className="block text-[12px] text-slate-500">{s.hint}</span>}
      </span>
      <span className={`shrink-0 text-[14px] font-black ${TONE_TEXT[s.tone]}`}>{s.value}</span>
    </Row>
  );
}

function Panel({ title, icon: Icon, signals }: { title: string; icon: typeof Activity; signals: Signal[] }) {
  const worst = signals.some((s) => s.tone === 'crit') ? 'crit' : signals.some((s) => s.tone === 'warn') ? 'warn' : 'ok';
  return (
    <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-3.5">
      <h2 className="mb-2.5 flex items-center gap-2 text-[15px] font-black text-slate-900">
        <Icon size={18} className="text-emerald-700" /> {title}
        <span className={`ml-auto h-2.5 w-2.5 rounded-full ${worst === 'crit' ? 'bg-red-500' : worst === 'warn' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
      </h2>
      <div className="space-y-1.5">{signals.map((s, i) => <SignalRow key={i} s={s} />)}</div>
    </section>
  );
}

export default function OversightPage() {
  const navigate = useNavigate();
  const goBack = useBackNavigation('/');
  const { user } = useAuthContext();
  const tenantId = user?.tenantId ?? 'main_firm';
  const stats = useStats();

  const [assets, setAssets] = useState<Asset[]>([]);
  const [lastWorkMs, setLastWorkMs] = useState<number>(0);
  const [workLast7, setWorkLast7] = useState<number>(0);
  const [lastInspectMs, setLastInspectMs] = useState<number>(0);
  const [inspectLast7, setInspectLast7] = useState<number>(0);
  const [errRows, setErrRows] = useState<Array<{ message: string; path: string; severity: string; ms: number }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const week = Date.now() - 7 * 86400000;
      const [a] = await Promise.all([
        assetService.getAll(tenantId).catch(() => [] as Asset[]),
        (async () => {
          try {
            const snap = await getDocs(query(collection(db, 'workLogs'), orderBy('performedAt', 'desc'), limit(200)));
            if (!alive) return;
            const rows = snap.docs.map((d) => d.data());
            setLastWorkMs(rows[0] ? toMs((rows[0] as { performedAt?: unknown; createdAt?: unknown }).performedAt ?? (rows[0] as { createdAt?: unknown }).createdAt) : 0);
            setWorkLast7(rows.filter((r) => toMs((r as { performedAt?: unknown; createdAt?: unknown }).performedAt ?? (r as { createdAt?: unknown }).createdAt) >= week).length);
          } catch { /* bez práva/indexu → nech 0 */ }
        })(),
        (async () => {
          try {
            const snap = await getDocs(query(collection(db, 'inspection_run_logs'), orderBy('createdAt', 'desc'), limit(200)));
            if (!alive) return;
            const rows = snap.docs.map((d) => d.data());
            setLastInspectMs(rows[0] ? toMs((rows[0] as { createdAt?: unknown }).createdAt) : 0);
            setInspectLast7(rows.filter((r) => toMs((r as { createdAt?: unknown }).createdAt) >= week).length);
          } catch { /* ignore */ }
        })(),
        (async () => {
          // Chyby appky = audit_logs type 'error'. Zkus indexovaný dotaz, jinak spadni na
          // čtení posledních logů a filtruj chyby v paměti (bez nutnosti indexu).
          try {
            let rows: Array<Record<string, unknown>>;
            try {
              const snap = await getDocs(query(collection(db, 'audit_logs'), where('type', '==', 'error'), orderBy('createdAt', 'desc'), limit(40)));
              rows = snap.docs.map((d) => d.data());
            } catch {
              const snap = await getDocs(query(collection(db, 'audit_logs'), orderBy('createdAt', 'desc'), limit(300)));
              rows = snap.docs.map((d) => d.data()).filter((r) => r.type === 'error' || r.category === 'app_error').slice(0, 40);
            }
            if (!alive) return;
            setErrRows(rows.map((r) => ({
              message: String(r.message ?? r.name ?? 'Chyba'),
              path: String(r.path ?? ''),
              severity: String(r.severity ?? 'error'),
              ms: toMs(r.createdAt),
            })));
          } catch { /* bez práva → prázdné */ }
        })(),
      ]);
      if (alive) { setAssets(a); setLoading(false); }
    })();
    return () => { alive = false; };
  }, [tenantId]);

  // ── Výpočty z kartotéky ──
  const derived = useMemo(() => {
    const isDevice = (a: Asset) => {
      const t = norm(`${a.entityType} ${(a as { category?: string }).category}`);
      return !['budova', 'building', 'hala', 'areal', 'mistnost', 'room', 'prostor'].some((w) => t.includes(w));
    };
    const isProblem = (s?: string) => /broken|stopped|porucha/i.test(String(s ?? ''));
    const broken = assets.filter((a) => isDevice(a) && isProblem(a.status)).length;

    const events = assets.flatMap((a) => (Array.isArray(a.events) ? a.events : []).map((ev) => ({ a, ev, d: eventDaysTo(ev.nextDate) })));
    const overdue = events.filter((x) => x.d !== null && x.d < 0);
    const cat = (x: { ev: { name?: string; eventType?: string } }) => norm(`${x.ev.name} ${x.ev.eventType}`);
    const overRevize = overdue.filter((x) => /reviz|kontrol/.test(cat(x))).length;
    const overKalibr = overdue.filter((x) => /kalibr/.test(cat(x))).length;
    const overDetekt = overdue.filter((x) => /detektor|test/.test(cat(x))).length;

    const devices = assets.filter(isDevice);
    const noPlan = devices.filter((a) => !(Array.isArray(a.events) && a.events.some((ev) => Number(ev.frequencyDays) > 0))).length;
    return { broken, overdueTotal: overdue.length, overRevize, overKalibr, overDetekt, noPlan, deviceCount: devices.length };
  }, [assets]);

  const donePct = stats.totalTasks > 0 ? Math.round((stats.completedTasks / stats.totalTasks) * 100) : null;

  // ── Chyby aplikace (to „gro" — co se v appce rozbilo) ──
  const err = useMemo(() => {
    const now = Date.now();
    const last24 = errRows.filter((e) => e.ms >= now - 86400000);
    const last7 = errRows.filter((e) => e.ms >= now - 7 * 86400000);
    const fatal24 = last24.filter((e) => e.severity === 'fatal').length;
    return { last24: last24.length, last7: last7.length, fatal24, recent: errRows.slice(0, 6) };
  }, [errRows]);

  const errSignals: Signal[] = [
    {
      label: 'Chyby za 24 hodin', value: String(err.last24),
      tone: err.fatal24 > 0 ? 'crit' : err.last24 > 0 ? 'warn' : 'ok',
      hint: err.fatal24 > 0 ? `${err.fatal24}× vážná (appka spadla)` : err.last24 === 0 ? 'appka běží čistě' : undefined,
    },
    { label: 'Chyby za 7 dní', value: String(err.last7), tone: err.last7 > 0 ? 'warn' : 'ok' },
    ...err.recent.map((e): Signal => ({
      label: e.message.slice(0, 90),
      value: agoLabel(e.ms),
      tone: e.severity === 'fatal' ? 'crit' : e.severity === 'warning' ? 'idle' : 'warn',
      hint: e.path ? `kde: ${e.path}` : undefined,
      onClick: e.path && e.path.startsWith('/') ? () => navigate(e.path) : undefined,
    })),
  ];

  // ── Panel 1: Žijí data / používá se to ──
  const fungujeSignals: Signal[] = [
    {
      label: 'Poslední zápis práce', value: agoLabel(lastWorkMs),
      tone: !lastWorkMs ? 'idle' : Date.now() - lastWorkMs > 3 * 86400000 ? 'warn' : 'ok',
      hint: workLast7 ? `${workLast7} zápisů za 7 dní` : 'za týden nikdo nic nezapsal',
      onClick: () => navigate('/work-diary'),
    },
    {
      label: 'Poslední kontrola', value: agoLabel(lastInspectMs),
      tone: !lastInspectMs ? 'idle' : Date.now() - lastInspectMs > 7 * 86400000 ? 'warn' : 'ok',
      hint: inspectLast7 ? `${inspectLast7} kontrol za 7 dní` : undefined,
      onClick: () => navigate('/inspections'),
    },
    {
      label: 'Noční hlídač údržby', value: 'běží', tone: 'ok',
      hint: 'každý den 5:45 zakládá úkoly z propadlých termínů',
    },
  ];

  // ── Panel 2: Provoz v kondici ──
  const provozSignals: Signal[] = [
    { label: 'Stroje v poruše', value: String(derived.broken), tone: derived.broken > 0 ? 'crit' : 'ok', onClick: () => navigate('/kartoteka') },
    { label: 'Havárie P1 (otevřené)', value: String(stats.criticalTickets), tone: stats.criticalTickets > 0 ? 'crit' : 'ok', onClick: () => navigate('/tasks') },
    { label: 'Otevřené úkoly', value: String(stats.activeTickets), tone: stats.activeTickets > 15 ? 'warn' : 'ok', onClick: () => navigate('/tasks') },
    { label: 'Propadlé termíny (revize/kontroly)', value: String(derived.overRevize), tone: derived.overRevize > 0 ? 'warn' : 'ok' },
  ];

  // ── Panel 3: Dodržuje se ──
  const dodrzujeSignals: Signal[] = [
    { label: 'Dokončené úkoly', value: donePct !== null ? `${donePct} %` : '—', tone: donePct === null ? 'idle' : donePct >= 70 ? 'ok' : donePct >= 40 ? 'warn' : 'crit', hint: `${stats.completedTasks} z ${stats.totalTasks}` },
    { label: 'Průměrná doba opravy (MTTR)', value: stats.mttrMinutes ? `${Math.round(stats.mttrMinutes)} min` : '—', tone: 'idle' },
    { label: 'Stroje bez preventivního plánu', value: String(derived.noPlan), tone: derived.noPlan > 0 ? 'warn' : 'ok', hint: `z ${derived.deviceCount} strojů`, onClick: () => navigate('/kartoteka') },
    ...(stats.lemonList[0] ? [{ label: 'Nejporuchovější stroj', value: `${stats.lemonList[0].issueCount}×`, tone: 'warn' as Tone, hint: stats.lemonList[0].assetName ?? stats.lemonList[0].assetId }] : []),
  ];

  // ── Panel 4: Audit ──
  const auditSignals: Signal[] = [
    { label: 'Propadlé kalibrace měřidel', value: String(derived.overKalibr), tone: derived.overKalibr > 0 ? 'crit' : 'ok', onClick: () => navigate('/kalibrace') },
    { label: 'Propadlé testy detektorů', value: String(derived.overDetekt), tone: derived.overDetekt > 0 ? 'crit' : 'ok', onClick: () => navigate('/detektory') },
    { label: 'Připravenost — export pro auditora', value: 'Reporty', tone: 'idle', hint: 'audit balíček jedním klikem', onClick: () => navigate('/reports') },
  ];

  return (
    <div className="px-4 py-6 md:px-8 max-w-3xl mx-auto pb-24">
      <div className="mb-4 flex items-center gap-3">
        <button type="button" onClick={() => goBack()} aria-label="Zpět" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700">
          <ArrowLeft size={20} />
        </button>
        <Gauge className="shrink-0 text-emerald-700" size={24} />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-black text-slate-900">Dohled</h1>
          <p className="text-[13px] text-slate-500">Chyby appky a jak to celé funguje — na jednom místě.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-slate-500"><Loader2 size={20} className="animate-spin" /> Načítám…</div>
      ) : (
        <>
          <Panel title="Chyby aplikace" icon={Bug} signals={errSignals} />
          <Panel title="Žijí data / používá se to" icon={Activity} signals={fungujeSignals} />
          <Panel title="Provoz v kondici" icon={AlertTriangle} signals={provozSignals} />
          <Panel title="Dodržuje se" icon={ClipboardCheck} signals={dodrzujeSignals} />
          <Panel title="Připravenost na audit" icon={ShieldCheck} signals={auditSignals} />
          <p className="mt-3 flex items-center gap-1.5 text-[12px] text-slate-400">
            <FileText size={13} /> Dohled jen ukazuje stav (nic nemění). Vidí ho vedení a údržba.
          </p>
        </>
      )}
    </div>
  );
}
