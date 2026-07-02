// functions/src/assistant.ts
// VIKRR — Asset Shield — AI asistent v aplikaci (Claude).
//
// Bezpečný backend: API klíč Anthropicu žije TADY jako secret (ANTHROPIC_API_KEY),
// nikdy v prohlížeči. Stránka /ai volá tuto funkci (callable). Funkce mluví s Claude,
// který má NÁSTROJE pro ČTENÍ dat (stav strojů, úkoly, termíny, deník) a — pokud má
// uživatel právo zapisovat — pro ZÁPIS (záznam do Deníku, založení úkolu).
//
// Identita: zápisy se ukládají pod přihlášeného uživatele (uid + jméno z users/{uid}),
// ne pod klienta. Majitel (read-only) zápisové nástroje nedostane.

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Anthropic from '@anthropic-ai/sdk';

// ── Konfigurace ────────────────────────────────────────────────
// MODEL: claude-haiku-4-5 = nejrychlejší + nejlevnější. Chytřejší: 'claude-sonnet-4-6'. Nejchytřejší: 'claude-opus-4-8'.
const MODEL = 'claude-haiku-4-5';
const MAX_TOKENS = 2048;       // strop odpovědi (chat = krátké odpovědi → drží to náklady)
const MAX_TURNS = 6;           // strop kol smyčky nástrojů (ochrana proti zacyklení)
const HISTORY_LIMIT = 12;      // kolik posledních zpráv historie posíláme

const SECRET_OPTS: functions.RuntimeOptions = {
  secrets: ['ANTHROPIC_API_KEY'],
  timeoutSeconds: 120,
  // 1GB = vyšší CPU tier (rychlejší zpracování i studený start). Běhy jsou krátké → cena zanedbatelná.
  memory: '1GB',
};

function db() {
  return admin.firestore();
}
const TS = admin.firestore.Timestamp;
const FV = admin.firestore.FieldValue;

// ── Pomocné (zrcadlí konektor) ─────────────────────────────────
const OPEN_TASK = (s?: string) =>
  !['done', 'completed', 'closed', 'hotovo', 'uzavreno', 'uzavřeno', 'cancelled', 'zruseno'].includes((s || '').toLowerCase());

const daysUntil = (iso?: string): number | null => {
  if (!iso) return null;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  return Math.ceil((t.getTime() - Date.now()) / 86400000);
};

const STATUS_CZ: Record<string, string> = { operational: 'běží', maintenance: 'údržba', broken: 'PORUCHA', stopped: 'stop', idle: 'nečinný' };
const statusLabel = (s?: string) => STATUS_CZ[(s || '').toLowerCase()] ?? (s || '?');
const isProblem = (s?: string) => /broken|stopped|fault|out_of_service|porucha/i.test(s || '');
const place = (a: any) => [a.buildingId ? `Budova ${a.buildingId}` : '', a.areaName || a.location, a.code].filter(Boolean).join(' · ');
const czDate = (ts?: any) => { const d = ts?.toDate?.(); return d ? d.toLocaleDateString('cs-CZ') : '?'; };
const AUDIT_RE = /kalibr|celistvost|detector|detektor|kontrol|revize|udrzba|údržba|servis|chladiv|plyn/i;

const belongsToTenant = (x: any, tenantId: string) => !x.tenantId || x.tenantId === tenantId;

// ── Oprávnění akcí (zrcadlí firestore.rules) — kdo smí jakou zápisovou akci ──
// Jen podmnožina potřebná pro AI akce. Fail-closed: neznámá role = nic nesmí.
const ROLE_PERMS: Record<string, string[]> = {
  SUPERADMIN: ['wo.create', 'wo.update', 'wo.close', 'asset.create', 'asset.update'],
  UDRZBA: ['wo.create', 'wo.update', 'wo.close', 'asset.update'],
  SKLADNIK: ['wo.create', 'wo.update'],
  VYROBA: ['wo.create'],
  OPERATOR: ['wo.create'],
  VEDENI: [], // vedení jen schvaluje/čte, samo zápisové akce v rules nemá
  MAJITEL: [], // read-only
};
function roleCan(role: string, perm: string): boolean {
  return (ROLE_PERMS[role] || []).includes(perm);
}
// Jaké oprávnění vyžaduje která AI akce.
const ACTION_PERM: Record<string, string> = {
  log_work: 'wo.create',
  create_task: 'wo.create',
  create_asset: 'asset.create',
  set_machine_status: 'asset.update',
  close_task: 'wo.close',
  create_asset_tree: 'asset.create',
};
const NO_PERM_MSG = 'Na tuhle akci nemáš oprávnění — může ji udělat jen pověřená role (např. údržba/správce). Řekni to prosím uživateli.';

// ── Čtení Firestore (admin SDK) ────────────────────────────────
// Cache per jeden požadavek: kolekce (assets/tasks/…) se v rámci jednoho chatu
// načte JEN JEDNOU, i když ji potřebuje víc nástrojů. Vrací vždy čerstvou kopii
// pole (callery smí bez obav třídit/filtrovat).
type ReqCache = Map<string, Promise<any[]>>;
function memo(cache: ReqCache | undefined, key: string, load: () => Promise<any[]>): Promise<any[]> {
  if (!cache) return load();
  const hit = cache.get(key);
  if (hit) return hit;
  const p = load();
  cache.set(key, p);
  return p;
}

async function getAssets(tenantId: string, cache?: ReqCache): Promise<any[]> {
  const load = async () => {
    const snap = await db().collection('assets').get();
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }))
      .filter((a) => belongsToTenant(a, tenantId) && !a.isDeleted);
  };
  if (!cache) return load();
  return (await memo(cache, 'assets:' + tenantId, load)).slice();
}

async function getAssetById(tenantId: string, id: string): Promise<any | null> {
  const doc = await db().collection('assets').doc(id).get();
  if (!doc.exists) return null;
  const a = { id: doc.id, ...(doc.data() as any) };
  return belongsToTenant(a, tenantId) && !a.isDeleted ? a : null;
}

async function getOpenTasks(tenantId: string, cache?: ReqCache): Promise<any[]> {
  const load = async () => {
    const snap = await db().collection('tasks').get();
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }))
      .filter((t) => belongsToTenant(t, tenantId) && OPEN_TASK(t.status));
  };
  if (!cache) return load();
  return (await memo(cache, 'tasks:' + tenantId, load)).slice();
}

async function getWorkLogs(tenantId: string, opts: { assetId?: string; limit?: number }): Promise<any[]> {
  if (opts.assetId) {
    const snap = await db().collection('workLogs').where('assetId', '==', opts.assetId).limit(200).get();
    const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    rows.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
    return rows.filter((r) => belongsToTenant(r, tenantId)).slice(0, opts.limit ?? 50);
  }
  const snap = await db().collection('workLogs').orderBy('createdAt', 'desc').limit(opts.limit ?? 200).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })).filter((r) => belongsToTenant(r, tenantId));
}

// ── Chytré hledání zařízení v Kartotéce ────────────────────────
// Odolné vůči diakritice (loupacka=Loupačka), kódu (EXT001=EXT-001) i překlepům.
function normText(s?: string): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // pryč s diakritikou: č→c, ř→r, ě→e
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Levenshtein (kolik úprav do sebe navzájem) — pro krátká slova, s rychlým odpadem.
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 2) return 3;
  const dp: number[] = Array.from({ length: m + 1 }, (_, i) => i);
  for (let j = 1; j <= n; j++) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= m; i++) {
      const tmp = dp[i];
      dp[i] = Math.min(dp[i] + 1, dp[i - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[m];
}

// Podobnost dvou slov: 1 = shodné, ~0.8 = jeden překlep, 0 = nesouvisí.
function tokenSim(q: string, t: string): number {
  if (!q || !t) return 0;
  if (q === t) return 1;
  if (/^\d+$/.test(q) && /^\d+$/.test(t) && parseInt(q, 10) === parseInt(t, 10)) return 0.9; // "1" = "001"
  if (q.length >= 3 && t.length >= 3 && (t.includes(q) || q.includes(t))) return 0.9;
  const d = levenshtein(q, t);
  const maxLen = Math.max(q.length, t.length);
  if (maxLen >= 4 && d <= 1) return 0.8; // jeden překlep
  if (maxLen >= 6 && d <= 2) return 0.65; // dva překlepy u delších slov
  return 0;
}

function assetTokens(a: any): string[] {
  return Array.from(new Set(`${normText(a.name)} ${normText(a.code)}`.split(' ').filter(Boolean)));
}

// Skóre 0..10, jak dobře dotaz sedí na zařízení.
function scoreAsset(qTokens: string[], qFull: string, a: any): number {
  const nameN = normText(a.name);
  const codeN = normText(a.code);
  if (nameN && nameN === qFull) return 10; // přesně název
  if (codeN && (codeN === qFull || codeN.replace(/ /g, '') === qFull.replace(/ /g, ''))) return 9.8; // přesně kód
  const hay = assetTokens(a);
  if (!hay.length || !qTokens.length) return 0;
  let sum = 0;
  for (const qt of qTokens) {
    let best = 0;
    for (const at of hay) {
      const s = tokenSim(qt, at);
      if (s > best) best = s;
    }
    sum += best;
  }
  return (sum / qTokens.length) * 8; // pokrytí dotazu → 0..8
}

interface AssetMatch { match: any | null; candidates: any[]; ambiguous: boolean; }

// Najde zařízení podle volného textu. match = jistá shoda; ambiguous = víc podobných (ptát se).
async function resolveAsset(tenantId: string, name: string, cache?: ReqCache): Promise<AssetMatch> {
  const all = await getAssets(tenantId, cache);
  const qFull = normText(name);
  const qTokens = qFull.split(' ').filter(Boolean);
  if (!qTokens.length) return { match: null, candidates: [], ambiguous: false };
  const scored = all
    .map((a) => ({ a, s: scoreAsset(qTokens, qFull, a) }))
    .filter((x) => x.s >= 3)
    .sort((x, y) => y.s - x.s);
  if (!scored.length) return { match: null, candidates: [], ambiguous: false };
  const top = scored[0];
  const second = scored[1];
  const candidates = scored.slice(0, 5).map((x) => x.a);
  const close = !!second && top.s - second.s < 1.2; // víc strojů skoro nastejno
  const confident = top.s >= 7 || (top.s >= 5 && !close);
  if (confident && !close) return { match: top.a, candidates, ambiguous: false };
  return { match: null, candidates, ambiguous: close };
}

// Pro zápisové nástroje: buď vrať shodu, nebo „block" text (nejednoznačné → nic nezapisovat).
async function resolveForWrite(
  tenantId: string,
  asset: string,
  cache?: ReqCache,
): Promise<{ assetId?: string; assetName?: string; near?: string; block?: string }> {
  const r = await resolveAsset(tenantId, asset, cache);
  if (r.match) return { assetId: r.match.id, assetName: r.match.name };
  if (r.ambiguous) {
    return { block: `⚠️ „${asset}" může být víc strojů: ${r.candidates.map((c) => c.name).join(', ')}. Zeptej se uživatele, který z nich, a zopakuj zápis s přesným názvem. (Zatím jsem NIC nezapsal.)` };
  }
  return { assetName: asset, near: r.candidates[0]?.name };
}

// Zpětně kompatibilní: vrať jen shodu (nebo null).
async function findAssetByName(tenantId: string, name: string): Promise<any | null> {
  return (await resolveAsset(tenantId, name)).match;
}

// ── Zápis Firestore (pod přihlášeného uživatele) ───────────────
interface Actor { uid: string; name: string; }

async function addWorkLogEntry(tenantId: string, actor: Actor, input: { assetId?: string; assetName?: string; content: string; workType?: string }): Promise<void> {
  const data: Record<string, unknown> = {
    userId: actor.uid,
    userName: actor.name,
    workerNames: [actor.name],
    type: 'maintenance',
    content: input.content,
    auditReady: true,
    source: 'ai-assistant',
    tenantId,
    performedAt: TS.now(),
    createdAt: FV.serverTimestamp(),
  };
  if (input.workType) data.workType = input.workType;
  if (input.assetId) data.assetId = input.assetId;
  if (input.assetName) data.assetName = input.assetName;
  await db().collection('workLogs').add(data);
}

async function createTaskEntry(tenantId: string, actor: Actor, input: { title: string; description?: string; priority?: string; assetId?: string; assetName?: string }): Promise<string> {
  const year = new Date().getFullYear();
  const code = `WO-${year}-AI${Date.now().toString(36).slice(-5).toUpperCase()}`;
  const priority = input.priority && /^P[1-4]$/.test(input.priority) ? input.priority : 'P3';
  const data: Record<string, unknown> = {
    code,
    title: input.title,
    type: 'corrective',
    status: 'backlog',
    priority,
    source: 'ai',
    createdById: actor.uid,
    createdByName: actor.name,
    tenantId,
    createdAt: FV.serverTimestamp(),
    updatedAt: FV.serverTimestamp(),
  };
  if (input.description) data.description = input.description;
  if (input.assetId) data.assetId = input.assetId;
  if (input.assetName) data.assetName = input.assetName;
  await db().collection('tasks').add(data);
  return code;
}

// ── AI paměť (učení) — co asistenta naučíš, ukládá se sem a načítá při každém pokecu ──
// Paměť má dva okruhy: FIREMNÍ (scope 'firm' nebo legacy bez scope — pro všechny) a OSOBNÍ (scope 'personal', userId).
async function getAiMemory(tenantId: string, uid: string): Promise<{ firm: string[]; personal: string[] }> {
  const snap = await db().collection('aiMemory').where('tenantId', '==', tenantId).limit(300).get();
  const rows = snap.docs.map((d) => (d.data() as any));
  rows.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
  const firm: string[] = [];
  const personal: string[] = [];
  for (const r of rows) {
    const c = String(r.content ?? '').trim();
    if (!c) continue;
    if (r.scope === 'personal') { if (r.userId === uid && personal.length < 40) personal.push(c); }
    else if (firm.length < 60) firm.push(c);
  }
  return { firm, personal };
}

async function addAiMemory(tenantId: string, actor: Actor, content: string, scope: 'firm' | 'personal', category?: string): Promise<void> {
  const data: Record<string, unknown> = {
    content,
    tenantId,
    scope,
    createdById: actor.uid,
    createdByName: actor.name,
    source: 'ai-assistant',
    createdAt: FV.serverTimestamp(),
  };
  if (scope === 'personal') data.userId = actor.uid;
  if (category) data.category = category;
  await db().collection('aiMemory').add(data);
}

async function forgetAiMemory(tenantId: string, uid: string, canTeach: boolean, query: string): Promise<number> {
  const q = query.toLowerCase();
  const snap = await db().collection('aiMemory').where('tenantId', '==', tenantId).limit(300).get();
  const hits = snap.docs.filter((d) => {
    const data = d.data() as any;
    if (!String(data.content ?? '').toLowerCase().includes(q)) return false;
    if (data.scope === 'personal') return data.userId === uid; // osobní jen svoje
    return canTeach;                                           // firemní/legacy jen vedení
  });
  await Promise.all(hits.map((d) => d.ref.delete()));
  return hits.length;
}

// ── Sklad / revize / statistiky / nové zařízení ────────────────
const invStatus = (q: number, min: number) => (q <= 0 ? 'DOŠLO' : q <= min * 0.5 ? 'kriticky málo' : q <= min ? 'málo' : 'ok');
const revDays = (ts: any): number | null => { const d = ts?.toDate?.(); return d ? Math.ceil((d.getTime() - Date.now()) / 86400000) : null; };

async function getInventory(tenantId: string, cache?: ReqCache): Promise<any[]> {
  const load = async () => {
    const snap = await db().collection('inventory').get();
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })).filter((i) => belongsToTenant(i, tenantId) && !i.isDeleted);
  };
  if (!cache) return load();
  return (await memo(cache, 'inventory:' + tenantId, load)).slice();
}

async function getRevisions(tenantId: string, cache?: ReqCache): Promise<any[]> {
  const load = async () => {
    const snap = await db().collection('revisions').get();
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })).filter((r) => belongsToTenant(r, tenantId) && !r.isDeleted);
  };
  if (!cache) return load();
  return (await memo(cache, 'revisions:' + tenantId, load)).slice();
}

async function getGlobalStats(): Promise<any | null> {
  const doc = await db().doc('stats_aggregates/global').get();
  return doc.exists ? (doc.data() as any) : null;
}

async function createAssetEntry(
  tenantId: string,
  actor: Actor,
  input: { name: string; category?: string; location?: string; code?: string; manufacturer?: string; model?: string; serialNumber?: string; year?: number; notes?: string },
): Promise<string> {
  const data: Record<string, unknown> = {
    name: input.name,
    entityType: 'Zařízení',
    status: 'operational',
    parentId: null,
    tenantId,
    createdById: actor.uid,
    createdByName: actor.name,
    source: 'ai-assistant',
    createdAt: FV.serverTimestamp(),
    updatedAt: FV.serverTimestamp(),
  };
  if (input.category) data.category = input.category;
  if (input.location) { data.location = input.location; data.areaName = input.location; }
  if (input.code) data.code = input.code;
  if (input.manufacturer) data.manufacturer = input.manufacturer;
  if (input.model) data.model = input.model;
  if (input.serialNumber) data.serialNumber = input.serialNumber;
  if (typeof input.year === 'number' && input.year > 1900 && input.year < 2100) data.year = input.year;
  if (input.notes) data.notes = input.notes;
  const ref = await db().collection('assets').add(data);
  return ref.id;
}

// Hromadné založení kartotéky: budovy → místnosti → stroje (propojené přes parentId).
// Píše v dávkách (Firestore batch, max 500) → zvládne i velkou strukturu.
async function createAssetTree(
  tenantId: string,
  actor: Actor,
  tree: { buildings: any[] },
): Promise<{ b: number; r: number; d: number }> {
  const col = db().collection('assets');
  let b = 0, r = 0, d = 0;
  let batch = db().batch();
  let ops = 0;
  const flush = async () => { if (ops > 0) { await batch.commit(); batch = db().batch(); ops = 0; } };
  const base = () => ({
    tenantId,
    status: 'operational',
    createdById: actor.uid,
    createdByName: actor.name,
    source: 'ai-assistant',
    createdAt: FV.serverTimestamp(),
    updatedAt: FV.serverTimestamp(),
  });
  const put = (ref: FirebaseFirestore.DocumentReference, data: Record<string, unknown>) => { batch.set(ref, data); ops++; };

  const addDevice = async (dev: any, parentId: string, buildingId?: string, areaName?: string) => {
    if (!dev?.name) return;
    const data: Record<string, unknown> = { ...base(), name: String(dev.name), entityType: 'Zařízení', parentId };
    if (buildingId) data.buildingId = buildingId;
    if (areaName) data.areaName = areaName;
    if (dev.code) data.code = String(dev.code);
    if (dev.category) data.category = String(dev.category);
    if (dev.manufacturer) data.manufacturer = String(dev.manufacturer);
    if (dev.model) data.model = String(dev.model);
    put(col.doc(), data);
    d++;
    if (ops >= 400) await flush();
  };

  for (const bl of (Array.isArray(tree?.buildings) ? tree.buildings : [])) {
    if (!bl?.name) continue;
    const buildingRef = col.doc();
    const buildingId = bl.code ? String(bl.code) : undefined;
    const bData: Record<string, unknown> = { ...base(), name: String(bl.name), entityType: 'Budova', parentId: null };
    if (buildingId) bData.code = buildingId;
    put(buildingRef, bData);
    b++;
    if (ops >= 400) await flush();

    for (const dev of (Array.isArray(bl.devices) ? bl.devices : [])) await addDevice(dev, buildingRef.id, buildingId);

    for (const rm of (Array.isArray(bl.rooms) ? bl.rooms : [])) {
      if (!rm?.name) continue;
      const roomRef = col.doc();
      const rData: Record<string, unknown> = { ...base(), name: String(rm.name), entityType: 'Místnost', parentId: buildingRef.id, areaName: String(rm.name) };
      if (buildingId) rData.buildingId = buildingId;
      if (rm.code) rData.code = String(rm.code);
      put(roomRef, rData);
      r++;
      if (ops >= 400) await flush();
      for (const dev of (Array.isArray(rm.devices) ? rm.devices : [])) await addDevice(dev, roomRef.id, buildingId, String(rm.name));
    }
  }
  await flush();
  return { b, r, d };
}

// Změna stavu stroje (porucha / běží / údržba / stop).
const VALID_STATUS = ['operational', 'broken', 'maintenance', 'stopped', 'idle'];
async function updateAssetStatus(tenantId: string, assetId: string, status: string, actor: Actor): Promise<void> {
  const asset = await getAssetById(tenantId, assetId);
  if (!asset) throw new Error('Zařízení nenalezeno.');
  await db().collection('assets').doc(assetId).update({
    status,
    updatedAt: FV.serverTimestamp(),
    lastStatusByName: actor.name,
  });
}

// Najdi OTEVŘENÝ úkol podle kódu (WO-…) nebo názvu.
async function findTaskByRef(tenantId: string, ref: string): Promise<any | null> {
  const r = ref.trim().toLowerCase();
  if (!r) return null;
  const tasks = await getOpenTasks(tenantId);
  return tasks.find((t) => String(t.code ?? '').toLowerCase() === r)
    ?? tasks.find((t) => String(t.code ?? '').toLowerCase().includes(r))
    ?? tasks.find((t) => String(t.title ?? '').toLowerCase().includes(r))
    ?? null;
}

async function closeTaskEntry(tenantId: string, taskId: string, actor: Actor): Promise<void> {
  await db().collection('tasks').doc(taskId).update({
    status: 'completed',
    completedAt: FV.serverTimestamp(),
    completedByName: actor.name,
    updatedAt: FV.serverTimestamp(),
  });
}

// Kolik záznamů práce/oprav měl stroj za posledních N dní (hlídání opakovaných poruch).
async function recentRepairCount(tenantId: string, assetId: string, days = 30): Promise<number> {
  const logs = await getWorkLogs(tenantId, { assetId, limit: 200 });
  const since = Date.now() - days * 86400000;
  return logs.filter((l) => (l.performedAt?.toMillis?.() ?? l.createdAt?.toMillis?.() ?? 0) >= since).length;
}
async function repairWarning(tenantId: string, assetId: string): Promise<string> {
  const n = await recentRepairCount(tenantId, assetId, 30);
  return n >= 3 ? `⚠️ Pozor: tenhle stroj má ${n} záznamů/oprav za 30 dní. Zvaž preventivní úkol nebo revizi příčiny.` : '';
}

// Návrh zápisu, který čeká na potvrzení uživatele (Ano/Ne na klientu).
interface PendingAction {
  type: 'log_work' | 'create_task' | 'create_asset' | 'set_machine_status' | 'close_task' | 'create_asset_tree';
  summary: string;
  danger?: boolean;
  content?: string; workType?: string;
  title?: string; description?: string; priority?: string;
  name?: string; code?: string; category?: string; location?: string;
  manufacturer?: string; model?: string; serialNumber?: string; year?: number; notes?: string;
  assetId?: string; assetName?: string;
  status?: string;
  taskId?: string; taskCode?: string;
  tree?: { buildings: any[] };
}

// ── Logika KARTOTÉKY: hierarchie Budova → Místnost → Stroj ─────
// parentId je hlavní řetěz; buildingId/areaName/location jsou legacy zkratky.
// Rozpoznání typu přes normalizovaný entityType/category (zrcadlí KioskPage/AssetCardPage).
const BUILDING_NAMES: Record<string, string> = {
  A: 'Administrativa', B: 'Spojovací krček', C: 'Zázemí & Vedení',
  D: 'Výrobní hala', E: 'Dílna & Sklad ND', L: 'Loupárna',
};
const entMatch = (a: any, words: string[]): boolean => {
  const s = `${normText(a?.entityType)} ${normText(a?.category)}`;
  return words.some((w) => s.includes(w));
};
const isBuildingA = (a: any) => entMatch(a, ['budova', 'building']);
const isRoomA = (a: any) => entMatch(a, ['mistnost', 'room', 'prostor', 'hala', 'sekce', 'stredisko', 'oddeleni', 'pracoviste', 'balirna', 'expedice', 'extrudovna', 'louparna', 'satny']);
const isLineA = (a: any) => entMatch(a, ['linka', 'line']);
const isContainerA = (a: any) => isBuildingA(a) || isRoomA(a);
const isDeviceA = (a: any) => !isBuildingA(a) && !isRoomA(a) && !isLineA(a) && !entMatch(a, ['kontrola', 'kontrolni']);

function assetBuilding(a: any, all: any[]): string {
  if (a?.buildingId) return String(a.buildingId);
  let pid = a?.parentId;
  const seen = new Set<string>();
  while (pid && !seen.has(pid)) {
    seen.add(pid);
    const p = all.find((x) => x.id === pid);
    if (!p) break;
    if (p.buildingId) return String(p.buildingId);
    const m = String(p.name ?? '').match(/Budova\s+([A-Za-z0-9]+)/i);
    if (m?.[1]) return m[1].toUpperCase();
    pid = p.parentId;
  }
  return '';
}
function assetRoom(a: any, all: any[]): string {
  if (a?.areaName) return String(a.areaName);
  if (a?.location) return String(a.location);
  let pid = a?.parentId;
  const seen = new Set<string>();
  while (pid && !seen.has(pid)) {
    seen.add(pid);
    const p = all.find((x) => x.id === pid);
    if (!p) break;
    if (isRoomA(p)) return String(p.name ?? '');
    if (p.areaName) return String(p.areaName);
    pid = p.parentId;
  }
  return '';
}
// Čitelné umístění: "Budova D (Výrobní hala) › Extrudovna"
function locationLabel(a: any, all: any[]): string {
  const b = assetBuilding(a, all);
  const r = assetRoom(a, all);
  const bLabel = b ? `Budova ${b}${BUILDING_NAMES[b] ? ` (${BUILDING_NAMES[b]})` : ''}` : '';
  return [bLabel, r].filter(Boolean).join(' › ');
}
const assetChildren = (a: any, all: any[]) => all.filter((x) => x.parentId === a.id);

// Dotaz na strukturu: odfiltruj plnící slova (aby „ptal jsem se co je v budově D" → jen „d").
const STRUCT_STOP = new Set(['co', 'je', 'v', 've', 'na', 'se', 'jen', 'ptal', 'ptala', 'jsem', 'a', 'i', 'k', 'ke', 'o', 'jake', 'jaka', 'jaky', 'jaké', 'mame', 'mam', 'ma', 'budova', 'budove', 'budovu', 'budovy', 'budov', 'mistnost', 'mistnosti', 'hala', 'hale', 'stroj', 'stroje', 'stroju', 'kolik', 'prehled', 'struktura', 'kartoteka', 'kartoteky', 'ukaz', 'chci', 'vypis', 'me', 'mi', 'to', 'ten', 'ta', 'tam', 'ktere', 'ktera']);
function structTokens(q: string): string[] {
  return normText(q).split(' ').filter((w) => w.length >= 2 && !STRUCT_STOP.has(w));
}
// Shoda tokenu s textem tolerantní ke skloňování (extrudovně ~ extrudovna).
function tokenStemHit(tok: string, text: string): boolean {
  const tn = normText(text);
  if (!tok || !tn) return false;
  if (tn.includes(tok) || tok.includes(tn)) return true;
  return tn.split(' ').some((w) => w.length >= 4 && tok.length >= 4 && (w.startsWith(tok.slice(0, 5)) || tok.startsWith(w.slice(0, 5))));
}

// ── Definice nástrojů pro Claude ───────────────────────────────
const READ_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_machine_status',
    description: 'Stav zařízení/strojů (běží, porucha, údržba, stop). Volitelně jen problémy nebo hledaný název. Použij, když se uživatel ptá na stav strojů.',
    input_schema: {
      type: 'object',
      properties: {
        onlyProblems: { type: 'boolean', description: 'jen poruchy/stop' },
        query: { type: 'string', description: 'hledaný název nebo kód' },
      },
    },
  },
  {
    name: 'list_open_tasks',
    description: 'Otevřené úkoly / pracovní příkazy (co se teď řeší).',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'list_overdue_checks',
    description: 'Propadlé nebo brzy propadající termíny (kalibrace, kontroly, údržba, revize) ze zařízení.',
    input_schema: {
      type: 'object',
      properties: { withinDays: { type: 'number', description: 'zahrň i ty, co propadnou do X dní (default 0 = jen propadlé)' } },
    },
  },
  {
    name: 'audit_readiness',
    description: 'Audit přehled (IFS/BRC/Tesco): kolik auditních kontrol je po termínu nebo se blíží — připravenost na audit.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'search_worklogs',
    description: 'Prohledá Deník (záznamy práce). Buď podle assetId, nebo textem (název zařízení, co se dělalo).',
    input_schema: {
      type: 'object',
      properties: {
        assetId: { type: 'string' },
        query: { type: 'string' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'get_asset_detail',
    description: 'Detail zařízení: stav, termíny, poslední práce. Zadej name (název — snese i překlep/diakritiku) nebo assetId.',
    input_schema: {
      type: 'object',
      properties: {
        assetId: { type: 'string' },
        name: { type: 'string' },
      },
    },
  },
  {
    name: 'find_asset',
    description: 'Dohledá zařízení v Kartotéce podle názvu nebo kódu — i když je napsané jinak, zkráceně nebo s překlepem. Vrátí buď jistou shodu, nebo seznam kandidátů. Použij PŘED zápisem (log_work/create_task), když si nejsi jistý, který stroj uživatel myslí.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'název nebo kód zařízení, jak ho uživatel napsal' } },
      required: ['query'],
    },
  },
  {
    name: 'get_structure',
    description: 'STRUKTURA Kartotéky — hierarchie Budova → Místnost → Stroj. Použij, když se ptá „co je v budově D", „kolik strojů v extrudovně", „kde stojí extruder 2", „jaké máme budovy/místnosti" nebo chce přehled uspořádání areálu. Bez query = celý strom; s query (budova A–L, název místnosti nebo stroje) = jen jeho okolí/obsah.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'volitelně: budova (A–L nebo název), místnost nebo stroj' } },
    },
  },
  {
    name: 'get_inventory',
    description: 'Sklad náhradních dílů: stav položek, co dochází/chybí. Volitelně jen nedostatkové (onlyLow) nebo hledaný název dílu (snese překlep i bez diakritiky).',
    input_schema: {
      type: 'object',
      properties: {
        onlyLow: { type: 'boolean', description: 'jen položky pod minimem' },
        query: { type: 'string', description: 'hledaný název/kód dílu' },
      },
    },
  },
  {
    name: 'list_revisions',
    description: 'Revize a kontroly (hasicí přístroje, elektro, tlakové nádoby, plyn, výtahy…) — termíny, co je po termínu nebo se blíží.',
    input_schema: {
      type: 'object',
      properties: { withinDays: { type: 'number', description: 'do kolika dní zahrnout (default 60)' } },
    },
  },
  {
    name: 'get_stats',
    description: 'Statistiky provozu: otevřené/kritické úkoly, dokončenost, průměrná doba opravy (MTTR) a nejporuchovější stroje.',
    input_schema: { type: 'object', properties: {} },
  },
];

const WRITE_TOOLS: Anthropic.Tool[] = [
  {
    name: 'log_work',
    description: 'Zapíše záznam práce do Deníku (co bylo uděláno, na čem). Použij JEN když to uživatel jasně chce (např. „zapiš že jsme…“). Po zápisu stručně potvrď.',
    input_schema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'co bylo uděláno / výsledek' },
        asset: { type: 'string', description: 'název zařízení, kterého se to týká (volitelné)' },
        workType: { type: 'string', description: 'druh práce, např. Údržba / Oprava / Čištění (volitelné)' },
      },
      required: ['content'],
    },
  },
  {
    name: 'create_task',
    description: 'Založí nový úkol / pracovní příkaz. Použij JEN když to uživatel jasně chce. Po založení stručně potvrď i s kódem úkolu.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'název úkolu' },
        description: { type: 'string' },
        priority: { type: 'string', enum: ['P1', 'P2', 'P3', 'P4'], description: 'P1 = havárie … P4 = nízká (default P3)' },
        asset: { type: 'string', description: 'název zařízení (volitelné)' },
      },
      required: ['title'],
    },
  },
  {
    name: 'create_asset',
    description: 'Založí nové zařízení/stroj do Kartotéky. Použij, když to uživatel chce, nebo když z fotky výrobního štítku načteš nový stroj (nejdřív ověř find_asset, ať nevznikne duplicita). Vyplň, co víš. Po založení potvrď.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'název zařízení' },
        code: { type: 'string', description: 'kód / typ / označení (např. ze štítku), volitelné' },
        category: { type: 'string', description: 'kategorie (volitelné)' },
        location: { type: 'string', description: 'umístění textem (volitelné)' },
        manufacturer: { type: 'string', description: 'výrobce (volitelné)' },
        model: { type: 'string', description: 'model / typ (volitelné)' },
        serialNumber: { type: 'string', description: 'výrobní (sériové) číslo (volitelné)' },
        year: { type: 'number', description: 'rok výroby (volitelné)' },
        notes: { type: 'string', description: 'poznámka, další údaje ze štítku (volitelné)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'set_machine_status',
    description: 'Změní stav stroje v Kartotéce (porucha / běží / údržba / stop). Použij, když to uživatel chce (např. „extruder je v poruše", „pec zase jede"). Po změně potvrď.',
    input_schema: {
      type: 'object',
      properties: {
        asset: { type: 'string', description: 'název nebo kód stroje' },
        status: { type: 'string', enum: ['operational', 'broken', 'maintenance', 'stopped', 'idle'], description: 'operational=běží, broken=porucha, maintenance=údržba, stopped=stop, idle=nečinný' },
      },
      required: ['asset', 'status'],
    },
  },
  {
    name: 'close_task',
    description: 'Uzavře (dokončí) otevřený úkol. Zadej kód úkolu (WO-…) nebo část názvu. Použij, když uživatel řekne, že je úkol hotový. Po uzavření potvrď.',
    input_schema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'kód úkolu (WO-…) nebo část názvu' },
      },
      required: ['task'],
    },
  },
  {
    name: 'create_asset_tree',
    description: 'Založí do Kartotéky CELOU strukturu najednou: budovy → místnosti → stroje. Použij, když uživatel popisuje uspořádání firmy/haly — hlavně při zakládání nové firmy (např. „Hala A: míchárna (míchačka, váha), balírna (2 balicí linky)"). Vyplň, co víš; chybějící (kódy, výrobce) nech prázdné. Uživatel to potvrdí. Jen vedení.',
    input_schema: {
      type: 'object',
      properties: {
        buildings: {
          type: 'array',
          description: 'seznam budov / hal',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'název budovy/haly (např. „Výrobní hala", „Budova A")' },
              code: { type: 'string', description: 'krátké označení budovy (např. A, D) — volitelné' },
              devices: {
                type: 'array',
                description: 'stroje přímo v budově (bez konkrétní místnosti)',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    code: { type: 'string' },
                    category: { type: 'string' },
                    manufacturer: { type: 'string' },
                    model: { type: 'string' },
                  },
                  required: ['name'],
                },
              },
              rooms: {
                type: 'array',
                description: 'místnosti / úseky v budově',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', description: 'název místnosti/úseku (např. „Míchárna")' },
                    code: { type: 'string' },
                    devices: {
                      type: 'array',
                      description: 'stroje v této místnosti',
                      items: {
                        type: 'object',
                        properties: {
                          name: { type: 'string' },
                          code: { type: 'string' },
                          category: { type: 'string' },
                          manufacturer: { type: 'string' },
                          model: { type: 'string' },
                        },
                        required: ['name'],
                      },
                    },
                  },
                  required: ['name'],
                },
              },
            },
            required: ['name'],
          },
        },
      },
      required: ['buildings'],
    },
  },
];

const MEMORY_TOOLS: Anthropic.Tool[] = [
  {
    name: 'remember',
    description: 'Ulož si TRVALE znalost. Použij POKAŽDÉ, když ti uživatel řekne něco trvalého — pravidlo, jak se co dělá, důležitý fakt (o strojích, lidech, procesech), nebo osobní preferenci — i BEZ „pamatuj si". Rozliš scope: "firma" = platí pro celou firmu (pravidla, fakta o strojích/procesech), smí ji nastavit jen vedení; "osobni" = jen preference tohoto uživatele (jak chce odpovídat, co ho zajímá). Když si nejsi jistý, dej "osobni". Po uložení stručně potvrď. NEukládej jednorázové věci, dotazy ani nejistá tvrzení.',
    input_schema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'co si zapamatovat, jasně a stručně' },
        scope: { type: 'string', enum: ['firma', 'osobni'], description: 'firma = pro všechny (jen vedení); osobni = jen pro tohoto uživatele (default)' },
        category: { type: 'string', description: 'volitelně: pravidlo / preference / fakt / kontakt' },
      },
      required: ['content'],
    },
  },
  {
    name: 'forget',
    description: 'Smaž z paměti dříve zapamatované, když uživatel řekne „zapomeň…“ nebo to už neplatí. Najde záznamy podle textu (osobní jen svoje; firemní jen vedení).',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'text, podle kterého najít, co zapomenout' },
      },
      required: ['query'],
    },
  },
];

// ── Vykonání nástroje → text pro Claude ────────────────────────
async function runTool(name: string, input: any, ctx: { tenantId: string; actor: Actor; role: string; canWrite: boolean; canTeach: boolean; pending?: PendingAction[]; cache?: ReqCache }): Promise<string> {
  const { tenantId, actor, role, canWrite, canTeach, cache } = ctx;
  try {
    switch (name) {
      case 'get_machine_status': {
        const all = await getAssets(tenantId, cache);
        let assets = all.filter(isDeviceA); // jen skutečné stroje — ne budovy/místnosti/linky
        if (input?.query) {
          // Diakritika/překlep-tolerantní: každé slovo dotazu musí být v názvu/kódu/kategorii/umístění.
          const qs = normText(String(input.query)).split(' ').filter(Boolean);
          assets = assets.filter((a) => {
            const h = normText(`${a.name ?? ''} ${a.code ?? ''} ${a.category ?? ''} ${assetRoom(a, all)} ${assetBuilding(a, all)}`);
            return qs.every((t) => h.includes(t));
          });
        }
        if (input?.onlyProblems) assets = assets.filter((a) => isProblem(a.status));
        const lines = assets.slice(0, 150).map((a) => {
          const loc = locationLabel(a, all);
          return `• ${a.name ?? a.id}${a.code ? ` [${a.code}]` : ''} — ${statusLabel(a.status)}${loc ? ` · ${loc}` : ''}`;
        });
        return `Stroje: ${assets.length}\n${lines.join('\n') || '—'}`;
      }
      case 'get_structure': {
        const all = await getAssets(tenantId, cache);
        const devices = all.filter(isDeviceA);
        const qn = normText(input?.query ? String(input.query) : '');
        const toks = structTokens(qn);

        // Seskup stroje: budova → místnost
        const byB: Record<string, Record<string, any[]>> = {};
        for (const d of devices) {
          const b = assetBuilding(d, all) || '?';
          const r = assetRoom(d, all) || '(bez místnosti)';
          (byB[b] ??= {})[r] ??= [];
          byB[b][r].push(d);
        }
        const bKeys = Object.keys(byB).filter((b) => b !== '?').sort();
        const bCount = (b: string) => Object.values(byB[b]).reduce((s, a) => s + a.length, 0);
        const bLabel = (b: string) => `Budova ${b}${BUILDING_NAMES[b] ? ` — ${BUILDING_NAMES[b]}` : ''}`;
        const mList = (arr: any[], cap: number) =>
          arr.slice(0, cap).map((m) => `${m.name}${m.code ? ` [${m.code}]` : ''} — ${statusLabel(m.status)}`).join(', ') + (arr.length > cap ? ` … (+${arr.length - cap})` : '');

        // 1) CÍLOVÁ BUDOVA — „budova D", samostatné písmeno A–L, nebo název budovy.
        let targetB: string | null = null;
        const bm = qn.match(/\bbudov\w*\s+([a-l])\b/);
        if (bm && byB[bm[1].toUpperCase()]) targetB = bm[1].toUpperCase();
        if (!targetB) for (const w of qn.split(' ')) { if (w.length === 1 && byB[w.toUpperCase()]) { targetB = w.toUpperCase(); break; } }
        if (!targetB) for (const b of bKeys) { if (BUILDING_NAMES[b] && toks.some((t) => tokenStemHit(t, BUILDING_NAMES[b]))) { targetB = b; break; } }

        if (targetB) {
          const rooms = byB[targetB];
          const roomLines = Object.keys(rooms).sort().map((r) => `   📍 ${r} (${rooms[r].length}): ${mList(rooms[r], 12)}`);
          return `🏢 ${bLabel(targetB)} — ${bCount(targetB)} strojů v ${Object.keys(rooms).length} místnostech:\n${roomLines.join('\n')}`;
        }

        // 2) CÍLOVÁ MÍSTNOST (napříč budovami) — tolerantní ke skloňování.
        if (toks.length) {
          const hits: { b: string; r: string; ms: any[] }[] = [];
          for (const b of bKeys) for (const r of Object.keys(byB[b])) {
            if (toks.some((t) => tokenStemHit(t, r))) hits.push({ b, r, ms: byB[b][r] });
          }
          if (hits.length) {
            return hits.slice(0, 10).map(({ b, r, ms }) => `📍 ${r} (Budova ${b}) — ${ms.length}: ${mList(ms, 30)}`).join('\n');
          }
          // 3) Nic nesedělo → přehled budov + poznámka.
          return `„${input.query}" jsem nenašel jako budovu ani místnost.\nPřehled budov:\n${bKeys.map((b) => `🏢 ${bLabel(b)}: ${bCount(b)} strojů, ${Object.keys(byB[b]).length} místností`).join('\n')}`;
        }

        // 4) BEZ DOTAZU → kompaktní přehled budov (ne všech 157 strojů).
        const noB = byB['?'] ? Object.values(byB['?']).reduce((s, a) => s + a.length, 0) : 0;
        const ov = bKeys.map((b) => `🏢 ${bLabel(b)}: ${bCount(b)} strojů, ${Object.keys(byB[b]).length} místností`);
        if (noB) ov.push(`• Nezařazené (bez budovy): ${noB} strojů`);
        return `Kartotéka: ${bKeys.length} budov, ${devices.length} strojů.\n${ov.join('\n')}\n\n(Řekni „co je v budově D" pro detail budovy, nebo název místnosti pro seznam strojů.)`;
      }
      case 'list_open_tasks': {
        const tasks = await getOpenTasks(tenantId, cache);
        const lines = tasks.slice(0, 150).map((t) => `• ${t.title ?? t.id}${t.priority ? ` [${t.priority}]` : ''}${t.assetName ? ` — ${t.assetName}` : ''}`);
        return `Otevřené úkoly: ${tasks.length}\n${lines.join('\n') || '—'}`;
      }
      case 'list_overdue_checks': {
        const limit = typeof input?.withinDays === 'number' ? input.withinDays : 0;
        const assets = await getAssets(tenantId, cache);
        const items = assets
          .flatMap((a) => (a.events ?? []).map((ev: any) => ({ a, ev, d: daysUntil(ev.nextDate) })))
          .filter((x: any) => x.d !== null && x.d <= limit)
          .sort((x: any, y: any) => x.d - y.d);
        const lines = items.slice(0, 150).map((x: any) => `${x.d < 0 ? '❗ PO TERMÍNU' : '⏳ blíží se'} — ${x.a.name}: ${x.ev.name} (termín ${x.ev.nextDate ?? '—'})`);
        return `Propadlé/blížící se: ${items.length}\n${lines.join('\n') || 'Nic.'}`;
      }
      case 'audit_readiness': {
        const assets = await getAssets(tenantId, cache);
        const audit = assets.flatMap((a) =>
          (a.events ?? []).filter((ev: any) => AUDIT_RE.test(`${ev.name ?? ''} ${ev.eventType ?? ''}`)).map((ev: any) => ({ a, ev, d: daysUntil(ev.nextDate) })),
        );
        const overdue = audit.filter((x: any) => x.d !== null && x.d < 0);
        const soon = audit.filter((x: any) => x.d !== null && x.d >= 0 && x.d <= 30);
        return [
          `Auditních kontrol celkem: ${audit.length}`,
          `❗ Po termínu: ${overdue.length}`,
          ...overdue.slice(0, 50).map((x: any) => `   • ${x.a.name}: ${x.ev.name} (${x.ev.nextDate ?? '—'})`),
          `⏳ Blíží se (do 30 dní): ${soon.length}`,
          ...soon.slice(0, 30).map((x: any) => `   • ${x.a.name}: ${x.ev.name} (${x.ev.nextDate ?? '—'})`),
        ].join('\n');
      }
      case 'search_worklogs': {
        let logs = await getWorkLogs(tenantId, { assetId: input?.assetId, limit: input?.assetId ? (input?.limit ?? 50) : 200 });
        if (input?.query && !input?.assetId) {
          const q = String(input.query).toLowerCase();
          logs = logs.filter((l) => `${l.assetName ?? ''} ${l.workType ?? ''} ${l.content ?? ''}`.toLowerCase().includes(q)).slice(0, input?.limit ?? 50);
        }
        const lines = logs.map((l) => `• ${czDate(l.performedAt ?? l.createdAt)} — ${l.assetName ?? '?'}: ${l.workType ?? l.type ?? ''} ${l.content ?? ''} (${l.userName ?? '?'})`);
        return `Záznamy: ${logs.length}\n${lines.join('\n') || '—'}`;
      }
      case 'find_asset': {
        const r = await resolveAsset(tenantId, String(input?.query ?? ''), cache);
        if (r.match) {
          return `Jistá shoda: ${r.match.name}${r.match.code ? ` (${r.match.code})` : ''} — ${statusLabel(r.match.status)}${place(r.match) ? ` · ${place(r.match)}` : ''}. Pro zápis použij přesně tento název: „${r.match.name}".`;
        }
        if (r.candidates.length) {
          return `Přesná shoda nenalezena. Kandidáti ( zeptej se uživatele, který to je, pak zapiš s přesným názvem):\n${r.candidates.map((c) => `• ${c.name}${c.code ? ` (${c.code})` : ''} — ${statusLabel(c.status)}`).join('\n')}`;
        }
        return `V Kartotéce jsem nic podobného „${input?.query}" nenašel. Buď je název jiný, nebo stroj ještě není založený.`;
      }
      case 'get_asset_detail': {
        const all = await getAssets(tenantId, cache);
        let asset: any = null;
        if (input?.assetId) asset = all.find((x) => x.id === input.assetId) || await getAssetById(tenantId, input.assetId);
        else if (input?.name) {
          const r = await resolveAsset(tenantId, String(input.name), cache);
          if (r.match) asset = r.match;
          else if (r.candidates.length) {
            return `Přesně jsem „${input.name}" nenašel. Možná některé z těchto: ${r.candidates.map((c) => `${c.name}${c.code ? ` (${c.code})` : ''}`).join(', ')}. Které myslíš?`;
          }
        }
        if (!asset) return 'Zařízení nenalezeno.';
        const typeLabel = isBuildingA(asset) ? 'Budova' : isRoomA(asset) ? 'Místnost' : isLineA(asset) ? 'Výrobní linka' : 'Stroj';
        const loc = locationLabel(asset, all);
        const kids = assetChildren(asset, all);
        const events = (asset.events ?? []).map((ev: any) => {
          const d = daysUntil(ev.nextDate);
          return `   • ${ev.name}: ${ev.nextDate ?? '—'}${d !== null ? (d < 0 ? ' (PO TERMÍNU)' : ` (za ${d} dní)`) : ''}`;
        });
        const logs = await getWorkLogs(tenantId, { assetId: asset.id, limit: 5 });
        const logLines = logs.map((l) => `   • ${czDate(l.performedAt ?? l.createdAt)}: ${l.workType ?? l.type ?? ''} ${l.content ?? ''}`);
        const out: string[] = [
          `${asset.name} — ${typeLabel} — ${statusLabel(asset.status)}`,
          loc ? `Umístění: ${loc}` : '',
          asset.code ? `Kód: ${asset.code}` : '',
        ];
        if (isContainerA(asset) || kids.length) {
          out.push(`Obsahuje (${kids.length}): ${kids.slice(0, 40).map((k) => `${k.name}${k.code ? ` [${k.code}]` : ''}`).join(', ') || '—'}`);
        }
        if (isLineA(asset) && Array.isArray(asset.lineMachineIds) && asset.lineMachineIds.length) {
          const machines = asset.lineMachineIds.map((id: string) => all.find((x) => x.id === id)?.name).filter(Boolean);
          out.push(`Stroje v lince: ${machines.join(' → ') || '—'}`);
        }
        out.push('Termíny:', ...(events.length ? events : ['   —']), 'Poslední práce:', ...(logLines.length ? logLines : ['   —']));
        return out.filter(Boolean).join('\n');
      }
      case 'log_work': {
        if (!roleCan(role, 'wo.create')) return NO_PERM_MSG;
        if (!input?.content) return 'Chybí popis, co bylo uděláno.';
        let assetId: string | undefined;
        let assetName: string | undefined;
        let near: string | undefined;
        if (input?.asset) {
          const r = await resolveForWrite(tenantId, String(input.asset), cache);
          if (r.block) return r.block; // nejednoznačné → nic nenavrhuj, ať se AI zeptá
          assetId = r.assetId;
          assetName = r.assetName;
          near = r.near;
        }
        const summary = `Zapsat do Deníku${assetName ? ` — ${assetName}` : ''}:\n„${input.content}"${input?.workType ? `\n(${input.workType})` : ''}`;
        ctx.pending?.push({ type: 'log_work', summary, content: String(input.content), workType: input?.workType ? String(input.workType) : undefined, assetId, assetName });
        return `NÁVRH připraven k potvrzení: ${summary}${assetName && !assetId ? ` — ⚠️ „${assetName}" není v Kartotéce${near ? ` (nejblíž „${near}")` : ''}` : ''}. Krátce uživateli řekni, co zapíšeš, a nech ho potvrdit (Ano/Ne se ukáže samo).`;
      }
      case 'create_task': {
        if (!roleCan(role, 'wo.create')) return NO_PERM_MSG;
        if (!input?.title) return 'Chybí název úkolu.';
        let assetId: string | undefined;
        let assetName: string | undefined;
        if (input?.asset) {
          const r = await resolveForWrite(tenantId, String(input.asset), cache);
          if (r.block) return r.block; // nejednoznačné → nenavrhuj, ať se AI zeptá
          assetId = r.assetId;
          assetName = r.assetName;
        }
        const prio = input?.priority && /^P[1-4]$/.test(input.priority) ? input.priority : 'P3';
        const summary = `Založit úkol [${prio}]:\n${input.title}${assetName ? `\nStroj: ${assetName}${assetId ? '' : ' (⚠️ není v Kartotéce)'}` : ''}`;
        ctx.pending?.push({ type: 'create_task', summary, title: String(input.title), description: input?.description ? String(input.description) : undefined, priority: prio, assetId, assetName });
        return `NÁVRH připraven k potvrzení: ${summary}. Krátce uživateli řekni, co založíš, a nech ho potvrdit.`;
      }
      case 'get_inventory': {
        let items = await getInventory(tenantId, cache);
        if (input?.query) {
          // Odolné vůči diakritice, částečnému názvu i překlepu (stejně jako u strojů).
          const qs = normText(String(input.query)).split(' ').filter(Boolean);
          const hay = (i: any) => normText(`${i.name ?? ''} ${i.code ?? ''} ${i.category ?? ''} ${i.location ?? ''}`);
          let hit = items.filter((i) => { const h = hay(i); return qs.every((t) => h.includes(t)); });
          if (!hit.length && qs.length) {
            // fuzzy záchrana (překlep): skóruj přes slova názvu/kódu
            hit = items
              .map((i) => {
                const toks = Array.from(new Set(`${normText(i.name)} ${normText(i.code)}`.split(' ').filter(Boolean)));
                let sum = 0;
                for (const qt of qs) { let best = 0; for (const at of toks) { const s = tokenSim(qt, at); if (s > best) best = s; } sum += best; }
                return { i, s: sum / qs.length };
              })
              .filter((x) => x.s >= 0.6)
              .sort((a, b) => b.s - a.s)
              .map((x) => x.i);
          }
          items = hit;
        }
        if (input?.onlyLow) items = items.filter((i) => Number(i.quantity ?? 0) <= Number(i.minQuantity ?? 0));
        items.sort((a, b) => (Number(a.quantity ?? 0) / Math.max(1, Number(a.minQuantity ?? 1))) - (Number(b.quantity ?? 0) / Math.max(1, Number(b.minQuantity ?? 1))));
        const lines = items.slice(0, 150).map((i) => `• ${i.name ?? '?'} — ${i.quantity ?? 0}${i.unit ? ' ' + i.unit : ''} (${invStatus(Number(i.quantity ?? 0), Number(i.minQuantity ?? 0))})${i.location ? ` · ${i.location}` : ''}`);
        return `Sklad: ${items.length} položek\n${lines.join('\n') || '—'}`;
      }
      case 'list_revisions': {
        const limit = typeof input?.withinDays === 'number' ? input.withinDays : 60;
        const revs = (await getRevisions(tenantId, cache))
          .map((r) => ({ r, d: revDays(r.nextRevisionDate) }))
          .filter((x) => x.d === null || x.d <= limit)
          .sort((a, b) => (a.d ?? 99999) - (b.d ?? 99999));
        const lines = revs.slice(0, 150).map((x) => `${x.d !== null && x.d < 0 ? '❗ PO TERMÍNU' : '⏳'} — ${x.r.title ?? x.r.type ?? 'Revize'}: ${x.r.nextRevisionDate?.toDate?.().toLocaleDateString('cs-CZ') ?? '—'}`);
        return `Revize (propadlé / do ${limit} dní): ${revs.length}\n${lines.join('\n') || 'Nic.'}`;
      }
      case 'get_stats': {
        const s = await getGlobalStats();
        if (!s) return 'Statistiky zatím nejsou spočítané.';
        const lemon = Array.isArray(s.lemonList) ? s.lemonList : [];
        return [
          `Otevřené úkoly: ${s.activeTickets ?? '?'} (z toho P1 havárie: ${s.criticalTickets ?? '?'})`,
          `Dokončeno: ${s.completedTasks ?? '?'} / ${s.totalTasks ?? '?'}`,
          s.mttrMinutes ? `Průměrná doba opravy (MTTR): ${Math.round(s.mttrMinutes)} min` : '',
          'Nejporuchovější stroje (30 dní):',
          ...(lemon.length ? lemon.slice(0, 5).map((l: any) => `   • ${l.assetName ?? l.assetId}: ${l.issueCount}×${l.mtbfHours > 0 ? ` (MTBF ${l.mtbfHours} h)` : ''}`) : ['   —']),
        ].filter(Boolean).join('\n');
      }
      case 'create_asset': {
        if (!roleCan(role, 'asset.create')) return NO_PERM_MSG;
        if (!input?.name) return 'Chybí název zařízení.';
        // Ochrana proti duplicitám — když stroj podle názvu nebo kódu už v Kartotéce je, nenavrhuj zakládání.
        let existing = (await resolveAsset(tenantId, String(input.name), cache)).match;
        if (!existing && input?.code) existing = (await resolveAsset(tenantId, String(input.code), cache)).match;
        if (existing) {
          return `ℹ️ Tohle zařízení už v Kartotéce je: ${existing.name}${existing.code ? ` (${existing.code})` : ''}. Nezakládám znovu — otevři jeho kartu, nebo mi řekni, že je to jiný stroj.`;
        }
        const year = typeof input?.year === 'number' ? input.year : Number(input?.year);
        const extra = [input?.code, input?.manufacturer, input?.model].filter(Boolean).join(' · ');
        const summary = `Založit nový stroj do Kartotéky:\n${input.name}${extra ? `\n${extra}` : ''}${input?.serialNumber ? `\nVýr. č.: ${input.serialNumber}` : ''}`;
        ctx.pending?.push({
          type: 'create_asset', summary,
          name: String(input.name),
          code: input?.code ? String(input.code) : undefined,
          category: input?.category ? String(input.category) : undefined,
          location: input?.location ? String(input.location) : undefined,
          manufacturer: input?.manufacturer ? String(input.manufacturer) : undefined,
          model: input?.model ? String(input.model) : undefined,
          serialNumber: input?.serialNumber ? String(input.serialNumber) : undefined,
          year: Number.isFinite(year) ? year : undefined,
          notes: input?.notes ? String(input.notes) : undefined,
        });
        return `NÁVRH připraven k potvrzení: ${summary}. Krátce uživateli řekni, co založíš, a nech ho potvrdit.`;
      }
      case 'set_machine_status': {
        if (!roleCan(role, 'asset.update')) return NO_PERM_MSG;
        const status = String(input?.status ?? '').toLowerCase();
        if (!input?.asset) return 'Chybí, kterého stroje se to týká.';
        if (!VALID_STATUS.includes(status)) return `Neznámý stav. Použij: ${VALID_STATUS.join(', ')}.`;
        const r = await resolveForWrite(tenantId, String(input.asset), cache);
        if (r.block) return r.block;
        if (!r.assetId) return `Stroj „${input.asset}" jsem v Kartotéce nenašel — bez něj stav měnit nejde. Zkus přesný název nebo ho nejdřív založ.`;
        const summary = `Změnit stav stroje ${r.assetName}:\n→ ${statusLabel(status)}`;
        ctx.pending?.push({ type: 'set_machine_status', summary, assetId: r.assetId, assetName: r.assetName, status, danger: isProblem(status) });
        return `NÁVRH připraven k potvrzení: ${summary}. Krátce to řekni uživateli a nech ho potvrdit.`;
      }
      case 'close_task': {
        if (!roleCan(role, 'wo.close')) return NO_PERM_MSG;
        if (!input?.task) return 'Chybí, který úkol uzavřít (kód WO-… nebo název).';
        const task = await findTaskByRef(tenantId, String(input.task));
        if (!task) return `Otevřený úkol „${input.task}" jsem nenašel. Zkontroluj kód (WO-…) nebo název.`;
        const summary = `Uzavřít (dokončit) úkol:\n${task.code ? `${task.code} — ` : ''}${task.title ?? ''}`;
        ctx.pending?.push({ type: 'close_task', summary, taskId: task.id, taskCode: task.code, title: task.title });
        return `NÁVRH připraven k potvrzení: ${summary}. Krátce to řekni uživateli a nech ho potvrdit.`;
      }
      case 'create_asset_tree': {
        if (!roleCan(role, 'asset.create')) return 'Hromadné zakládání kartotéky smí jen správce (asset.create). Řekni to prosím uživateli.';
        const buildings = Array.isArray(input?.buildings) ? input.buildings : [];
        if (!buildings.length) return 'Chybí struktura — popiš budovy, místnosti a stroje.';
        let nB = 0, nR = 0, nD = 0;
        const lines: string[] = [];
        for (const bl of buildings) {
          if (!bl?.name) continue;
          nB++; lines.push(`🏢 ${bl.name}`);
          for (const dev of (Array.isArray(bl.devices) ? bl.devices : [])) { if (dev?.name) { nD++; lines.push(`   • ${dev.name}`); } }
          for (const rm of (Array.isArray(bl.rooms) ? bl.rooms : [])) {
            if (!rm?.name) continue;
            nR++; lines.push(`   📍 ${rm.name}`);
            for (const dev of (Array.isArray(rm.devices) ? rm.devices : [])) { if (dev?.name) { nD++; lines.push(`      • ${dev.name}`); } }
          }
        }
        if (!nB) return 'Chybí struktura — popiš budovy, místnosti a stroje.';
        const summary = `Založit do Kartotéky:\n${nB} budov · ${nR} místností · ${nD} strojů\n\n${lines.slice(0, 16).join('\n')}${lines.length > 16 ? `\n… a další (${lines.length - 16})` : ''}`;
        ctx.pending?.push({ type: 'create_asset_tree', summary, tree: { buildings } });
        return `NÁVRH připraven k potvrzení: založení ${nB} budov, ${nR} místností, ${nD} strojů. Krátce to shrň uživateli a nech ho potvrdit.`;
      }
      case 'remember': {
        if (!input?.content) return 'Chybí, co si mám zapamatovat.';
        let scope: 'firm' | 'personal' = input?.scope === 'firma' ? 'firm' : 'personal';
        let note = '';
        if (scope === 'firm' && !canTeach) { scope = 'personal'; note = ' (firemní pravidla nastavuje jen vedení — uložil jsem to jako tvou osobní poznámku)'; }
        await addAiMemory(tenantId, actor, String(input.content), scope, input?.category);
        return `🧠 Zapamatováno ${scope === 'firm' ? 'pro celou firmu' : 'jen pro tebe'}: ${input.content}${note}`;
      }
      case 'forget': {
        if (!input?.query) return 'Chybí, co mám zapomenout.';
        const n = await forgetAiMemory(tenantId, actor.uid, canTeach, String(input.query));
        return n > 0 ? `🧠 Zapomenuto (${n} záznamů k „${input.query}“).` : `Nic odpovídajícího „${input.query}“ jsem v paměti nenašel.`;
      }
      default:
        return `Neznámý nástroj: ${name}`;
    }
  } catch (err) {
    console.error(`[assistantChat] tool ${name} error:`, err);
    return `Nástroj ${name} selhal: ${(err as Error)?.message ?? 'chyba'}`;
  }
}

// ── Systémový prompt ───────────────────────────────────────────
function buildSystemPrompt(actor: Actor, role: string, canWrite: boolean, canTeach: boolean, firm: string[], personal: string[]): string {
  const today = new Date().toLocaleDateString('cs-CZ');
  const firmBlock = firm.length
    ? `\n\nZNALOSTI A PRAVIDLA FIRMY (platí pro všechny — ber je jako ZÁVAZNÁ, AKTIVNĚ je používej v odpovědích i než navrhneš akci; když jdou proti tomu, co uživatel chce, upozorni na to):\n${firm.map((m) => `• ${m}`).join('\n')}`
    : '';
  const personalBlock = personal.length
    ? `\n\nOSOBNÍ PREFERENCE UŽIVATELE ${actor.name} (řiď se jimi u něj):\n${personal.map((m) => `• ${m}`).join('\n')}`
    : '';
  const teachLine = `\n- UČENÍ (DŮLEŽITÉ): Když ti uživatel v rozhovoru řekne něco TRVALÉHO — pravidlo, jak se co dělá, důležitý fakt (o strojích, lidech, procesech) nebo osobní preferenci — ULOŽ to sám nástrojem remember (i BEZ „pamatuj si") a stručně potvrď „🧠 Zapamatoval jsem si…". Rozliš scope: „firma" = firemní pravidlo pro všechny${canTeach ? '' : ' (to smí jen vedení — tobě to uložím jako osobní)'}; „osobni" = jen preference tohoto uživatele. NEukládej jednorázové věci, dotazy ani nejistá tvrzení. Když řekne „zapomeň…", použij forget.`;
  return `Jsi AI asistent systému Asset Shield (PROVOZ 360) — údržba potravinářského závodu (firma nominal, areál Kozlov).
Dnešní datum: ${today}. Mluvíš s: ${actor.name} (role ${role}).

JAK ODPOVÍDAT:
- VŽDY česky. Stručně, lidsky, jen finální odpověď — žádné meta-komentáře o tom, jak přemýšlíš.
- Když se uživatel ptá na STAV, ČÍSLA nebo TERMÍNY, NEHÁDEJ — nejdřív použij čtecí nástroj a odpověz z dat.
- ZAŘÍZENÍ Z KARTOTÉKY: Lidé píšou názvy strojů různě, zkráceně, bez diakritiky nebo s překlepem. Systém to umí dohledat. Ale když si NEJSI jistý, který stroj uživatel myslí — nebo je víc možností — NEZAPISUJ naslepo: použij find_asset a zeptej se, který to je. Stroj si nikdy nevymýšlej. Když ti nástroj řekne, že zařízení není v Kartotéce nebo je zápis neprovázaný, řekni to uživateli.
- VÝROBNÍ ŠTÍTEK Z FOTKY: Když dostaneš fotku výrobního štítku stroje, přečti z něj název, kód/typ, výrobce, model, výrobní (sériové) číslo a rok. NEJDŘÍV ověř find_asset, jestli stroj v Kartotéce už není (ať nevznikají duplicity). Pokud není, ukaž načtené údaje a po souhlasu ho založ přes create_asset. Pokud je, ukaž jeho kartu/stav.
- ZAKLÁDÁNÍ KARTOTÉKY (hlavně nová firma): Když uživatel popisuje uspořádání firmy — budovy/haly, místnosti/úseky a stroje v nich — použij create_asset_tree a založ CELOU strukturu najednou (rozklíčuj do budov → místností → strojů). Chybějící detaily (kódy, výrobce) nech prázdné, neptej se na drobnosti; doptej se jen když je struktura nejasná. (Smí to jen vedení.)
- Když si všimneš opakujícího se problému nebo příležitosti ke zlepšení (často se kazící stroj, propadlé termíny), stručně NAVRHNI zlepšení.
${canWrite
    ? `- Umíš i AKCE: zápis do Deníku (log_work), založení úkolu (create_task), založení stroje (create_asset), změna stavu stroje (set_machine_status), uzavření úkolu (close_task). Použij je JEN když to uživatel jasně chce (např. „zapiš že jsme vyměnili ložisko na EXT-001", „extruder je v poruše", „úkol WO-2026-12 je hotový"). DŮLEŽITÉ: tyhle akce se NEprovedou hned — připraví se jako NÁVRH a uživatel je potvrdí tlačítkem Ano/Ne (ukáže se samo). Proto NEHLAŠ „zapsáno/hotovo" dopředu; jen KRÁTCE řekni, co chystáš, a nech potvrdit. Stejný nástroj nevolej dvakrát.`
    : `- Tvoje role je jen pro čtení — akce/zápisy nedělej, jen poraď a ukaž data.`}${teachLine}

KONTEXT SYSTÉMU:
- Moduly: Úkoly (P1 havárie … P4 nápad), Mapa strojů, Sklad ND, Revize/kontroly, Vozidla, Odpady, Loupárna, Kontroly budov, Deník (záznamy práce).
- Budovy: A administrativa, B krček, C zázemí & vedení, D výrobní hala, E dílna & sklad ND, L loupárna.
- KARTOTÉKA (hierarchie): je to strom BUDOVA → MÍSTNOST → STROJ. Budova i místnost jsou taky „zařízení" (entityType Budova/Místnost), stroj patří do místnosti a ta do budovy (vazba přes parentId; někdy jen přes pole budova+místnost). Když se ptá „co je v budově/místnosti", „kde stojí stroj", „kolik strojů kde", „jaké máme budovy" → použij get_structure. get_asset_detail u stroje ukáže i jeho umístění (budova › místnost), u budovy/místnosti/linky co obsahuje. Stroj bez budovy = ještě nezařazený.
- Stroje: Extrudery (EXT-xxx), míchačky, balicí linky, pece, dopravníky, VZV, kompresory, chladicí jednotky, loupačky, převodovky.
- Role: Majitel (jen čtení), Vedení, Superadmin, Údržba, Výroba, Skladník, Operátor.${firmBlock}${personalBlock}`;
}

// ── Provoz & bezpečnost: rate-limit, uložené návrhy, audit log ──
const RATE_PER_MIN = 20;
const RATE_PER_DAY = 300;
// Jednoduchý strop volání AI na uživatele (proti vytočení účtu). Fail-open: když selže
// samotná transakce (výpadek), uživatele NEblokuj — blokuje jen skutečné překročení.
async function checkRateLimit(uid: string): Promise<void> {
  const ref = db().collection('ai_usage').doc(uid);
  const now = Date.now();
  const minKey = Math.floor(now / 60000);
  const dayKey = Math.floor(now / 86400000);
  try {
    await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const d = (snap.exists ? snap.data() : {}) as any;
      const minCount = d?.minKey === minKey ? (d.minCount || 0) : 0;
      const dayCount = d?.dayKey === dayKey ? (d.dayCount || 0) : 0;
      if (minCount >= RATE_PER_MIN || dayCount >= RATE_PER_DAY) {
        throw new functions.https.HttpsError('resource-exhausted', 'Moc dotazů na AI za krátkou dobu. Dej tomu prosím chvilku.');
      }
      tx.set(ref, { minKey, minCount: minCount + 1, dayKey, dayCount: dayCount + 1, updatedAt: FV.serverTimestamp() }, { merge: true });
    });
  } catch (err) {
    if (err instanceof functions.https.HttpsError) throw err;
    console.error('[checkRateLimit] error:', (err as Error)?.message);
  }
}

// Uloží navržené akce NA SERVER a vrátí jen lehké popisy pro klienta (id + text).
// Klient pak potvrzuje jen přes id → nelze podvrhnout obsah a jde to provést jen jednou.
async function savePendingActions(
  uid: string,
  tenantId: string,
  actions: PendingAction[],
): Promise<Array<{ id: string; type: string; summary: string; danger?: boolean }>> {
  const out: Array<{ id: string; type: string; summary: string; danger?: boolean }> = [];
  for (const a of actions) {
    const ref = db().collection('aiPendingActions').doc();
    await ref.set({ uid, tenantId, action: a, used: false, createdAt: FV.serverTimestamp() });
    out.push({ id: ref.id, type: a.type, summary: a.summary, danger: a.danger });
  }
  return out;
}

// Nezměnitelná stopa AI akce (append-only kolekce audit_logs) — pro kontrolu i audit (IFS/BRC).
async function writeAiAuditLog(tenantId: string, actor: Actor, entry: { action: string; targetId?: string; summary?: string }): Promise<void> {
  try {
    await db().collection('audit_logs').add({
      userId: actor.uid,
      userName: actor.name,
      action: 'ai_' + entry.action,
      targetId: entry.targetId ?? null,
      summary: (entry.summary ?? '').slice(0, 500),
      tenantId,
      source: 'ai-assistant',
      createdAt: FV.serverTimestamp(),
    });
  } catch (err) {
    console.error('[writeAiAuditLog] error:', (err as Error)?.message);
  }
}

// ── Callable ───────────────────────────────────────────────────
export const assistantChat = functions
  .runWith(SECRET_OPTS)
  .https.onCall(async (data: any, context: functions.https.CallableContext) => {
    if (!context.auth?.uid) {
      throw new functions.https.HttpsError('unauthenticated', 'Pro AI asistenta se musíš přihlásit.');
    }
    const apiKey = process.env.ANTHROPIC_API_KEY || '';
    if (!apiKey) {
      throw new functions.https.HttpsError('failed-precondition', 'AI asistent zatím není nastaven (chybí ANTHROPIC_API_KEY).');
    }

    const message = String(data?.message || '').trim();
    const imageData = typeof data?.imageData === 'string' ? data.imageData : '';
    const imageType = typeof data?.imageType === 'string' ? data.imageType : '';
    const VALID_IMG = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    const hasImage = !!imageData && VALID_IMG.includes(imageType);
    if (!message && !hasImage) {
      throw new functions.https.HttpsError('invalid-argument', 'Prázdná zpráva.');
    }
    if (message.length > 4000) {
      throw new functions.https.HttpsError('invalid-argument', 'Zpráva je příliš dlouhá.');
    }
    if (imageData && imageData.length > 7_000_000) {
      throw new functions.https.HttpsError('invalid-argument', 'Obrázek je příliš velký.');
    }

    const uid = context.auth.uid;
    const userSnap = await db().doc(`users/${uid}`).get();
    const userData = userSnap.data() || {};
    const role = String(userData.role || (context.auth.token as any)?.role || 'OPERATOR').toUpperCase();
    const tenantId = String(userData.tenantId || 'main_firm').trim() || 'main_firm';
    const actor: Actor = { uid, name: String(userData.displayName || 'Uživatel').trim() || 'Uživatel' };
    const canWrite = role !== 'MAJITEL';
    const canTeach = ['MAJITEL', 'VEDENI', 'SUPERADMIN'].includes(role);

    // Strop volání (proti vytočení účtu za Anthropic + Firestore).
    await checkRateLimit(uid);

    const tools = [...READ_TOOLS, ...(canWrite ? WRITE_TOOLS : []), ...MEMORY_TOOLS];

    // Historie z klienta → Anthropic formát (jen text, zahodíme úvodní assistant pozdrav).
    const rawHistory: Array<{ role?: string; content?: string }> = Array.isArray(data?.history) ? data.history : [];
    const msgs: Anthropic.MessageParam[] = [];
    for (const m of rawHistory.slice(-HISTORY_LIMIT)) {
      const r = m?.role === 'assistant' ? 'assistant' : m?.role === 'user' ? 'user' : null;
      const c = String(m?.content || '').trim();
      if (!r || !c) continue;
      if (msgs.length === 0 && r !== 'user') continue; // první zpráva musí být user
      msgs.push({ role: r, content: c });
    }
    if (hasImage) {
      msgs.push({
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: imageType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: imageData } },
          { type: 'text', text: message || 'Popiš, co je na fotce, a poraď nebo zapiš, co je potřeba.' },
        ],
      });
    } else {
      msgs.push({ role: 'user', content: message });
    }

    const client = new Anthropic({ apiKey });
    const mem = await getAiMemory(tenantId, uid);
    const system = buildSystemPrompt(actor, role, canWrite, canTeach, mem.firm, mem.personal);
    const toolsUsed: string[] = [];
    const pendingActions: PendingAction[] = [];
    const cache: ReqCache = new Map(); // jedno čtení kolekcí na celý chat

    try {
      let reply = '';
      for (let turn = 0; turn < MAX_TURNS; turn++) {
        const response = await client.messages.create({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
          tools,
          messages: msgs,
        });

        if (response.stop_reason === 'tool_use') {
          // Posbírej text (pokud nějaký) a vykonej nástroje.
          msgs.push({ role: 'assistant', content: response.content });
          // Když AI chce víc nástrojů v jednom tahu, spusť je paralelně (rychlejší).
          const toolBlocks = response.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
          );
          const results: Anthropic.ToolResultBlockParam[] = await Promise.all(
            toolBlocks.map(async (block) => {
              toolsUsed.push(block.name);
              const out = await runTool(block.name, block.input, { tenantId, actor, role, canWrite, canTeach, pending: pendingActions, cache });
              return { type: 'tool_result', tool_use_id: block.id, content: out } as Anthropic.ToolResultBlockParam;
            }),
          );
          msgs.push({ role: 'user', content: results });
          continue;
        }

        // Hotovo — vytáhni text.
        reply = response.content.filter((b) => b.type === 'text').map((b: any) => b.text).join('\n').trim();
        break;
      }

      if (!reply) reply = pendingActions.length ? 'Připravil jsem návrh — potvrď ho prosím.' : 'Promiň, na tohle se mi teď nepodařilo odpovědět. Zkus to prosím jinak.';
      // Návrhy ulož na server; klientovi pošli jen id + text (potvrzuje se přes id → tamper-proof + jednorázově).
      const stored = pendingActions.length ? await savePendingActions(uid, tenantId, pendingActions) : [];
      return { reply, toolsUsed, pendingActions: stored };
    } catch (err) {
      console.error('[assistantChat] Anthropic error:', (err as Error)?.message);
      throw new functions.https.HttpsError('internal', 'AI asistent je dočasně nedostupný. Zkus to prosím za chvíli.');
    }
  });

// ── Potvrzení akce (Ano) → TEPRVE TEĎ se zapíše ──
export const assistantConfirmAction = functions
  .runWith({ timeoutSeconds: 60, memory: '512MB' })
  .https.onCall(async (data: any, context: functions.https.CallableContext) => {
    const { tenantId, actor, role } = await authContext(context);

    // Zdroj akce: PREFEROVANĚ serverem uložený návrh (pendingId) — nelze ho podvrhnout a jde provést
    // jen JEDNOU (idempotence). Fallback na `action` z klienta (starší klient) je dál hlídán rolí + tenantem.
    const pendingId = typeof data?.pendingId === 'string' ? data.pendingId : '';
    let a: any;
    let pendingRef: FirebaseFirestore.DocumentReference | null = null;
    if (pendingId) {
      const ref = db().collection('aiPendingActions').doc(pendingId);
      const snap = await ref.get();
      if (!snap.exists) throw new functions.https.HttpsError('not-found', 'Návrh vypršel nebo neexistuje. Zopakuj to prosím.');
      const d = snap.data() as any;
      if (d.uid !== actor.uid || d.tenantId !== tenantId) throw new functions.https.HttpsError('permission-denied', 'Tenhle návrh není tvůj.');
      if (Date.now() - (d.createdAt?.toMillis?.() ?? 0) > 60 * 60 * 1000) throw new functions.https.HttpsError('deadline-exceeded', 'Návrh je starý, zopakuj to prosím.');
      // Idempotence: hotovou akci NEPROVÁDĚJ znovu, jen vrať původní hlášku.
      if (d.used) return { reply: String(d.resultReply || '✅ Už provedeno.') };
      a = d.action;
      pendingRef = ref;
    } else {
      a = data?.action;
    }

    if (!a || typeof a !== 'object' || typeof a.type !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'Chybí akce k potvrzení.');
    }
    // BEZPEČNOST: ověř oprávnění role na TUTO akci (obrana proti eskalaci i u uloženého návrhu).
    const needPerm = ACTION_PERM[a.type];
    if (!needPerm || !roleCan(role, needPerm)) {
      throw new functions.https.HttpsError('permission-denied', 'Na tuhle akci nemáš oprávnění.');
    }
    try {
      let reply: string;
      let targetId: string | undefined;
      switch (a.type) {
        case 'log_work': {
          if (!a.content) throw new functions.https.HttpsError('invalid-argument', 'Chybí obsah zápisu.');
          // Ověř, že assetId patří do firmy volajícího; jinak ho neprovazuj (nech jen jméno).
          let assetId: string | undefined = a.assetId ? String(a.assetId) : undefined;
          if (assetId && !(await getAssetById(tenantId, assetId))) assetId = undefined;
          await addWorkLogEntry(tenantId, actor, { assetId, assetName: a.assetName, content: String(a.content), workType: a.workType ? String(a.workType) : undefined });
          reply = `✅ Zapsáno do Deníku${a.assetName ? ` — ${a.assetName}` : ''}: ${a.content}`;
          if (assetId) { const w = await repairWarning(tenantId, assetId); if (w) reply += `\n\n${w}`; }
          else if (a.assetName) reply += `\n(⚠️ „${a.assetName}" není v Kartotéce — záznam není provázaný.)`;
          targetId = assetId;
          break;
        }
        case 'create_task': {
          if (!a.title) throw new functions.https.HttpsError('invalid-argument', 'Chybí název úkolu.');
          let assetId: string | undefined = a.assetId ? String(a.assetId) : undefined;
          if (assetId && !(await getAssetById(tenantId, assetId))) assetId = undefined;
          const code = await createTaskEntry(tenantId, actor, { title: String(a.title), description: a.description ? String(a.description) : undefined, priority: a.priority, assetId, assetName: a.assetName });
          reply = `✅ Úkol založen — ${code}: ${a.title}${a.assetName ? ` (${a.assetName})` : ''} [${a.priority ?? 'P3'}]`;
          targetId = code;
          break;
        }
        case 'create_asset': {
          if (!a.name) throw new functions.https.HttpsError('invalid-argument', 'Chybí název zařízení.');
          targetId = await createAssetEntry(tenantId, actor, {
            name: String(a.name), code: a.code, category: a.category, location: a.location,
            manufacturer: a.manufacturer, model: a.model, serialNumber: a.serialNumber,
            year: typeof a.year === 'number' ? a.year : undefined, notes: a.notes,
          });
          const extra = [a.code, a.manufacturer, a.model].filter(Boolean).join(' · ');
          reply = `✅ Zařízení založeno — ${a.name}${extra ? ` (${extra})` : ''}. Najdeš ho v Kartotéce.`;
          break;
        }
        case 'set_machine_status': {
          if (!a.assetId || !a.status) throw new functions.https.HttpsError('invalid-argument', 'Chybí stroj nebo stav.');
          if (!VALID_STATUS.includes(String(a.status).toLowerCase())) throw new functions.https.HttpsError('invalid-argument', 'Neplatný stav stroje.');
          await updateAssetStatus(tenantId, String(a.assetId), String(a.status).toLowerCase(), actor);
          reply = `✅ Stav změněn — ${a.assetName ?? 'stroj'}: ${statusLabel(String(a.status))}`;
          if (isProblem(String(a.status))) { const w = await repairWarning(tenantId, String(a.assetId)); if (w) reply += `\n\n${w}`; }
          targetId = String(a.assetId);
          break;
        }
        case 'close_task': {
          if (!a.taskId) throw new functions.https.HttpsError('invalid-argument', 'Chybí úkol.');
          // Ověř, že úkol patří do firmy volajícího (proti cross-tenant uzavírání).
          const taskSnap = await db().collection('tasks').doc(String(a.taskId)).get();
          const task = taskSnap.exists ? { id: taskSnap.id, ...(taskSnap.data() as any) } : null;
          if (!task || !belongsToTenant(task, tenantId)) {
            throw new functions.https.HttpsError('permission-denied', 'Tenhle úkol nepatří tvojí firmě nebo neexistuje.');
          }
          await closeTaskEntry(tenantId, String(a.taskId), actor);
          reply = `✅ Úkol uzavřen — ${[a.taskCode, a.title].filter(Boolean).join(' · ')}`.trim();
          targetId = String(a.taskId);
          break;
        }
        case 'create_asset_tree': {
          if (!a.tree || !Array.isArray(a.tree.buildings)) throw new functions.https.HttpsError('invalid-argument', 'Chybí struktura.');
          const c = await createAssetTree(tenantId, actor, a.tree);
          reply = `✅ Kartotéka založena — ${c.b} budov, ${c.r} místností, ${c.d} strojů. Najdeš je v Kartotéce.`;
          break;
        }
        default:
          throw new functions.https.HttpsError('invalid-argument', 'Neznámý typ akce.');
      }
      // AŽ TEĎ (po úspěšném zápisu) označ návrh jako hotový + ulož výsledek.
      // Kdyby zápis selhal, sem se nedostaneme → used zůstane false → uživatel může bezpečně zopakovat.
      if (pendingRef) { try { await pendingRef.update({ used: true, usedAt: FV.serverTimestamp(), resultReply: reply }); } catch { /* ignore */ } }
      // Nezměnitelná stopa akce pro kontrolu / audit (IFS/BRC).
      await writeAiAuditLog(tenantId, actor, { action: a.type, targetId, summary: a.summary });
      return { reply };
    } catch (err) {
      if (err instanceof functions.https.HttpsError) throw err;
      console.error('[assistantConfirmAction] error:', (err as Error)?.message);
      throw new functions.https.HttpsError('internal', 'Akci se nepodařilo provést. Zkus to prosím znovu.');
    }
  });

// ── Proaktivní hlášení / rychlé odpovědi Z DAT (bez Claude) — instantní, zdarma ──
async function computeBriefing(tenantId: string, name: string, cache?: ReqCache): Promise<{ reply: string; counts: any; hasAlerts: boolean }> {
  const assets = await getAssets(tenantId, cache);
  const broken = assets.filter((a) => isProblem(a.status));
  const events = assets.flatMap((a) => (a.events ?? []).map((ev: any) => ({ a, ev, d: daysUntil(ev.nextDate) })));
  const overdue = events.filter((x: any) => x.d !== null && x.d < 0).sort((x: any, y: any) => x.d - y.d);
  const soon = events.filter((x: any) => x.d !== null && x.d >= 0 && x.d <= 7).sort((x: any, y: any) => x.d - y.d);
  const tasks = await getOpenTasks(tenantId, cache);
  const p1 = tasks.filter((t) => String(t.priority) === 'P1');

  const parts: string[] = [];
  if (broken.length) parts.push(`🔴 Poruchy (${broken.length}): ${broken.slice(0, 5).map((a) => a.name).join(', ')}${broken.length > 5 ? ' …' : ''}`);
  if (p1.length) parts.push(`🚨 Havárie P1 (${p1.length}): ${p1.slice(0, 5).map((t) => t.title ?? t.code ?? '?').join(', ')}`);
  if (overdue.length) parts.push(`❗ Po termínu (${overdue.length}): ${overdue.slice(0, 5).map((x: any) => `${x.a.name} – ${x.ev.name}`).join('; ')}${overdue.length > 5 ? ' …' : ''}`);
  if (soon.length) parts.push(`⏳ Do 7 dní (${soon.length}): ${soon.slice(0, 5).map((x: any) => `${x.a.name} – ${x.ev.name} (za ${x.d} d)`).join('; ')}`);

  const counts = { broken: broken.length, p1: p1.length, overdue: overdue.length, soon: soon.length };
  const hasAlerts = parts.length > 0;
  const hello = name ? `Ahoj ${name}! ` : 'Ahoj! ';
  const reply = hasAlerts
    ? `${hello}Tohle bych teď hlídal:\n\n${parts.join('\n')}\n\nChceš na něco založit úkol nebo ukázat detail? Stačí říct.`
    : `${hello}Nic nehoří ✅ Žádné poruchy ani propadlé termíny. Kdyby něco, jsem tady.`;
  return { reply, counts, hasAlerts };
}

// Pomocná: společný začátek callable (ověří přihlášení, vytáhne tenant + actor).
async function authContext(context: functions.https.CallableContext): Promise<{ tenantId: string; actor: Actor; role: string }> {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Pro AI asistenta se musíš přihlásit.');
  }
  const uid = context.auth.uid;
  const userSnap = await db().doc(`users/${uid}`).get();
  const userData = userSnap.data() || {};
  const tenantId = String(userData.tenantId || 'main_firm').trim() || 'main_firm';
  const role = String(userData.role || (context.auth.token as any)?.role || 'OPERATOR').toUpperCase();
  const actor: Actor = { uid, name: String(userData.displayName || 'Uživatel').trim() || 'Uživatel' };
  return { tenantId, actor, role };
}

export const assistantBriefing = functions
  .runWith({ timeoutSeconds: 60, memory: '512MB' })
  .https.onCall(async (_data: any, context: functions.https.CallableContext) => {
    const { tenantId, actor } = await authContext(context);
    return computeBriefing(tenantId, actor.name, new Map());
  });

// Rychlé odpovědi Z DAT (bez Claude) — pro tlačítka i jednoduché dotazy. Vrací i count kvůli fallbacku na Claude.
export const assistantFacts = functions
  .runWith({ timeoutSeconds: 60, memory: '512MB' })
  .https.onCall(async (data: any, context: functions.https.CallableContext) => {
    const { tenantId, actor, role } = await authContext(context);
    const kind = String(data?.kind || '');
    const query = data?.query ? String(data.query) : '';
    const cache: ReqCache = new Map();
    const ctx = { tenantId, actor, role, canWrite: false, canTeach: false, cache };

    let reply = '';
    let count: number | undefined;
    switch (kind) {
      case 'overview': reply = (await computeBriefing(tenantId, actor.name, cache)).reply; break;
      case 'inventory': reply = await runTool('get_inventory', { query: query || undefined }, ctx); break;
      case 'revisions': reply = await runTool('list_revisions', {}, ctx); break;
      case 'stats': reply = await runTool('get_stats', {}, ctx); break;
      case 'tasks': reply = await runTool('list_open_tasks', {}, ctx); break;
      case 'faults': reply = await runTool('get_machine_status', { onlyProblems: true }, ctx); break;
      case 'machines': reply = await runTool('get_machine_status', { query: query || undefined }, ctx); break;
      case 'overdue': reply = await runTool('list_overdue_checks', { withinDays: 7 }, ctx); break;
      case 'structure': reply = await runTool('get_structure', { query: query || undefined }, ctx); break;
      case 'worklogs': reply = await runTool('search_worklogs', { query: query || undefined }, ctx); break;
      case 'audit': reply = await runTool('audit_readiness', {}, ctx); break;
      case 'find': {
        const r = await resolveAsset(tenantId, query, cache);
        count = r.match ? 1 : r.candidates.length;
        reply = await runTool('find_asset', { query }, ctx);
        break;
      }
      default:
        throw new functions.https.HttpsError('invalid-argument', 'Neznámý typ dotazu.');
    }
    // Počet položek u skladového dotazu (klient podle toho pozná, jestli spadnout na Claude).
    if (kind === 'inventory' && query) {
      const m = reply.match(/^Sklad:\s*(\d+)/);
      count = m ? Number(m[1]) : undefined;
    }
    return { reply: reply.trim(), count };
  });

// ── AI souhrny pro vedení (běží samy) — sdílený sběr dat, týdenní + měsíční ──
async function gatherSummaryData(tenantId: string): Promise<{ dataText: string; memBlock: string }> {
  const assets = await getAssets(tenantId);
  const events = assets.flatMap((a) => (a.events ?? []).map((ev: any) => ({ a, ev, d: daysUntil(ev.nextDate) })));
  const overdue = events.filter((x: any) => x.d !== null && x.d < 0);
  const soon = events.filter((x: any) => x.d !== null && x.d >= 0 && x.d <= 14);
  const auditOverdue = events.filter((x: any) => x.d !== null && x.d < 0 && AUDIT_RE.test(`${x.ev.name ?? ''} ${x.ev.eventType ?? ''}`));
  const tasks = await getOpenTasks(tenantId);
  const p1 = tasks.filter((t) => String(t.priority) === 'P1');
  const stats = await getGlobalStats();
  const lemon = Array.isArray(stats?.lemonList) ? stats.lemonList : [];
  const memories = (await getAiMemory(tenantId, '')).firm;

  const dataText = [
    `Po termínu (kontroly/revize/údržba): ${overdue.length}`,
    ...overdue.slice(0, 15).map((x: any) => `   • ${x.a.name}: ${x.ev.name} (${x.ev.nextDate ?? '—'})`),
    `Z toho auditních po termínu (IFS/BRC): ${auditOverdue.length}`,
    `Blíží se do 14 dní: ${soon.length}`,
    `Otevřené úkoly: ${tasks.length} (P1 havárie: ${p1.length})`,
    `Dokončeno celkem: ${stats?.completedTasks ?? '?'} / ${stats?.totalTasks ?? '?'}`,
    stats?.mttrMinutes ? `Průměrná doba opravy (MTTR): ${Math.round(stats.mttrMinutes)} min` : '',
    `Nejporuchovější stroje (30 dní): ${lemon.slice(0, 5).map((l: any) => `${l.assetName ?? l.assetId} (${l.issueCount}×)`).join(', ') || '—'}`,
  ].filter(Boolean).join('\n');

  const memBlock = memories.length ? `\nPravidla firmy (zohledni je):\n${memories.map((m) => `• ${m}`).join('\n')}` : '';
  return { dataText, memBlock };
}

async function sendAiSummary(kind: 'weekly' | 'monthly'): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY || '';
  if (!apiKey) { console.warn(`[${kind}AiSummary] chybí ANTHROPIC_API_KEY`); return; }
  const tenantId = 'main_firm';
  const { dataText, memBlock } = await gatherSummaryData(tenantId);

  const system = kind === 'monthly'
    ? `Jsi AI asistent údržby potravinářského závodu (firma nominal). Napiš MĚSÍČNÍ MANAŽERSKÝ REPORT pro vedení v češtině. Struktura: (1) 2–3 věty celkové shrnutí měsíce; (2) klíčová čísla (poruchy, dokončené úkoly, MTTR, audit); (3) 3 nejrizikovější stroje/oblasti; (4) 3–5 konkrétních doporučení na příští měsíc (prevence, priority, audit IFS/BRC). Věcně, přehledně, bez balastu — čte to šéf.${memBlock}`
    : `Jsi AI asistent údržby potravinářského závodu (firma nominal). Napiš KRÁTKÝ týdenní souhrn pro vedení v češtině: 3–5 vět co je tento týden důležité + 2–3 konkrétní návrhy, na co se zaměřit (priority, prevence, audit). Stručně, lidsky, bez balastu.${memBlock}`;

  const client = new Anthropic({ apiKey });
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: kind === 'monthly' ? 1536 : 1024,
    system,
    messages: [{ role: 'user', content: `Data:\n${dataText}\n\nNapiš ${kind === 'monthly' ? 'měsíční manažerský report' : 'týdenní souhrn'} + doporučení.` }],
  });
  const summary = resp.content.filter((b) => b.type === 'text').map((b: any) => b.text).join('\n').trim() || 'Bez zásadních zjištění.';

  const ref = await db().collection('aiSummaries').add({ tenantId, content: summary, source: kind, createdAt: FV.serverTimestamp() });

  const usersSnap = await db().collection('users').get();
  const targets = usersSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((u) => u.active !== false && (!u.tenantId || u.tenantId === tenantId) && ['MAJITEL', 'VEDENI', 'SUPERADMIN'].includes(String(u.role || '').toUpperCase()));
  const batch = db().batch();
  const title = kind === 'monthly' ? '📊 Měsíční report od AI' : '🧠 Týdenní souhrn od AI';
  targets.forEach((u) => {
    batch.set(db().doc(`notifications/ai-${kind}-${ref.id}-${u.id}`), {
      userId: u.id,
      tenantId,
      type: 'ai',
      priority: 'normal',
      title,
      message: summary.slice(0, 280),
      actionUrl: '/ai',
      actionLabel: 'Otevřít AI',
      read: false,
      generated: true,
      source: `ai-${kind}`,
      sourceId: ref.id,
      createdAt: FV.serverTimestamp(),
    });
  });
  await batch.commit();
  console.log(`[${kind}AiSummary] hotovo, notifikováno ${targets.length}`);
}

export const weeklyAiSummary = functions
  .runWith({ secrets: ['ANTHROPIC_API_KEY'], timeoutSeconds: 300, memory: '512MB' })
  .pubsub.schedule('every monday 07:00')
  .timeZone('Europe/Prague')
  .onRun(async () => {
    try { await sendAiSummary('weekly'); } catch (err) { console.error('[weeklyAiSummary] error:', (err as Error)?.message); }
  });

// Měsíční manažerský report — 1. den v měsíci 07:00 (silný pitch pro vedení, Haiku, 1×/měs = levné).
export const monthlyExecReport = functions
  .runWith({ secrets: ['ANTHROPIC_API_KEY'], timeoutSeconds: 300, memory: '512MB' })
  .pubsub.schedule('1 of month 07:00')
  .timeZone('Europe/Prague')
  .onRun(async () => {
    try { await sendAiSummary('monthly'); } catch (err) { console.error('[monthlyExecReport] error:', (err as Error)?.message); }
  });
