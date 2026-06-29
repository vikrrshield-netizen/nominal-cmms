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
  memory: '512MB',
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

// ── Čtení Firestore (admin SDK) ────────────────────────────────
async function getAssets(tenantId: string): Promise<any[]> {
  const snap = await db().collection('assets').get();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((a) => belongsToTenant(a, tenantId) && !a.isDeleted);
}

async function getAssetById(tenantId: string, id: string): Promise<any | null> {
  const doc = await db().collection('assets').doc(id).get();
  if (!doc.exists) return null;
  const a = { id: doc.id, ...(doc.data() as any) };
  return belongsToTenant(a, tenantId) && !a.isDeleted ? a : null;
}

async function getOpenTasks(tenantId: string): Promise<any[]> {
  const snap = await db().collection('tasks').get();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((t) => belongsToTenant(t, tenantId) && OPEN_TASK(t.status));
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

async function findAssetByName(tenantId: string, name: string): Promise<any | null> {
  const all = await getAssets(tenantId);
  const q = name.toLowerCase();
  return all.find((a) => (a.name ?? '').toLowerCase() === q)
    ?? all.find((a) => (a.name ?? '').toLowerCase().includes(q))
    ?? null;
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
async function getAiMemory(tenantId: string): Promise<any[]> {
  const snap = await db().collection('aiMemory').where('tenantId', '==', tenantId).limit(200).get();
  const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  rows.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
  return rows.slice(0, 60);
}

async function addAiMemory(tenantId: string, actor: Actor, content: string, category?: string): Promise<void> {
  const data: Record<string, unknown> = {
    content,
    tenantId,
    createdById: actor.uid,
    createdByName: actor.name,
    source: 'ai-assistant',
    createdAt: FV.serverTimestamp(),
  };
  if (category) data.category = category;
  await db().collection('aiMemory').add(data);
}

async function forgetAiMemory(tenantId: string, query: string): Promise<number> {
  const q = query.toLowerCase();
  const snap = await db().collection('aiMemory').where('tenantId', '==', tenantId).limit(200).get();
  const hits = snap.docs.filter((d) => String((d.data() as any).content ?? '').toLowerCase().includes(q));
  await Promise.all(hits.map((d) => d.ref.delete()));
  return hits.length;
}

// ── Sklad / revize / statistiky / nové zařízení ────────────────
const invStatus = (q: number, min: number) => (q <= 0 ? 'DOŠLO' : q <= min * 0.5 ? 'kriticky málo' : q <= min ? 'málo' : 'ok');
const revDays = (ts: any): number | null => { const d = ts?.toDate?.(); return d ? Math.ceil((d.getTime() - Date.now()) / 86400000) : null; };

async function getInventory(tenantId: string): Promise<any[]> {
  const snap = await db().collection('inventory').get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })).filter((i) => belongsToTenant(i, tenantId) && !i.isDeleted);
}

async function getRevisions(tenantId: string): Promise<any[]> {
  const snap = await db().collection('revisions').get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })).filter((r) => belongsToTenant(r, tenantId) && !r.isDeleted);
}

async function getGlobalStats(): Promise<any | null> {
  const doc = await db().doc('stats_aggregates/global').get();
  return doc.exists ? (doc.data() as any) : null;
}

async function createAssetEntry(tenantId: string, actor: Actor, input: { name: string; category?: string; location?: string }): Promise<void> {
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
  await db().collection('assets').add(data);
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
    description: 'Detail zařízení: stav, termíny, poslední práce. Zadej name (název) nebo assetId.',
    input_schema: {
      type: 'object',
      properties: {
        assetId: { type: 'string' },
        name: { type: 'string' },
      },
    },
  },
  {
    name: 'get_inventory',
    description: 'Sklad náhradních dílů: stav položek, co dochází/chybí. Volitelně jen nedostatkové (onlyLow) nebo hledaný název dílu.',
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
    description: 'Založí nové zařízení/stroj do Kartotéky. Použij JEN když to uživatel jasně chce. Po založení potvrď.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'název zařízení' },
        category: { type: 'string', description: 'kategorie (volitelné)' },
        location: { type: 'string', description: 'umístění textem (volitelné)' },
      },
      required: ['name'],
    },
  },
];

const TEACH_TOOLS: Anthropic.Tool[] = [
  {
    name: 'remember',
    description: 'Ulož si TRVALE pravidlo, preferenci nebo fakt o této firmě, kterému tě uživatel naučí (např. „extrudery se mažou jen mazivem X“, „poruchy linky vždy hlas Pepovi“). Použij, když uživatel řekne „pamatuj si…“, „od teď…“, „u nás platí…“, nebo ti dá trvalý pokyn. Po uložení stručně potvrď, co sis zapamatoval.',
    input_schema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'co si zapamatovat, jasně a stručně' },
        category: { type: 'string', description: 'volitelně: pravidlo / preference / fakt / kontakt' },
      },
      required: ['content'],
    },
  },
  {
    name: 'forget',
    description: 'Smaž z paměti dříve zapamatované, když uživatel řekne „zapomeň…“ nebo to už neplatí. Najde záznamy podle textu.',
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
async function runTool(name: string, input: any, ctx: { tenantId: string; actor: Actor; canWrite: boolean; canTeach: boolean }): Promise<string> {
  const { tenantId, actor, canWrite, canTeach } = ctx;
  try {
    switch (name) {
      case 'get_machine_status': {
        let assets = await getAssets(tenantId);
        if (input?.query) { const q = String(input.query).toLowerCase(); assets = assets.filter((a) => `${a.name ?? ''} ${a.code ?? ''}`.toLowerCase().includes(q)); }
        if (input?.onlyProblems) assets = assets.filter((a) => isProblem(a.status));
        const lines = assets.slice(0, 150).map((a) => `• ${a.name ?? a.id} — ${statusLabel(a.status)}${place(a) ? ` (${place(a)})` : ''}`);
        return `Zařízení: ${assets.length}\n${lines.join('\n') || '—'}`;
      }
      case 'list_open_tasks': {
        const tasks = await getOpenTasks(tenantId);
        const lines = tasks.slice(0, 150).map((t) => `• ${t.title ?? t.id}${t.priority ? ` [${t.priority}]` : ''}${t.assetName ? ` — ${t.assetName}` : ''}`);
        return `Otevřené úkoly: ${tasks.length}\n${lines.join('\n') || '—'}`;
      }
      case 'list_overdue_checks': {
        const limit = typeof input?.withinDays === 'number' ? input.withinDays : 0;
        const assets = await getAssets(tenantId);
        const items = assets
          .flatMap((a) => (a.events ?? []).map((ev: any) => ({ a, ev, d: daysUntil(ev.nextDate) })))
          .filter((x: any) => x.d !== null && x.d <= limit)
          .sort((x: any, y: any) => x.d - y.d);
        const lines = items.slice(0, 150).map((x: any) => `${x.d < 0 ? '❗ PO TERMÍNU' : '⏳ blíží se'} — ${x.a.name}: ${x.ev.name} (termín ${x.ev.nextDate ?? '—'})`);
        return `Propadlé/blížící se: ${items.length}\n${lines.join('\n') || 'Nic.'}`;
      }
      case 'audit_readiness': {
        const assets = await getAssets(tenantId);
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
      case 'get_asset_detail': {
        let asset: any = null;
        if (input?.assetId) asset = await getAssetById(tenantId, input.assetId);
        else if (input?.name) asset = await findAssetByName(tenantId, String(input.name));
        if (!asset) return 'Zařízení nenalezeno.';
        const events = (asset.events ?? []).map((ev: any) => {
          const d = daysUntil(ev.nextDate);
          return `   • ${ev.name}: ${ev.nextDate ?? '—'}${d !== null ? (d < 0 ? ' (PO TERMÍNU)' : ` (za ${d} dní)`) : ''}`;
        });
        const logs = await getWorkLogs(tenantId, { assetId: asset.id, limit: 5 });
        const logLines = logs.map((l) => `   • ${czDate(l.performedAt ?? l.createdAt)}: ${l.workType ?? l.type ?? ''} ${l.content ?? ''}`);
        return [
          `${asset.name} — ${statusLabel(asset.status)}`,
          place(asset),
          'Termíny:',
          ...(events.length ? events : ['   —']),
          'Poslední práce:',
          ...(logLines.length ? logLines : ['   —']),
        ].join('\n');
      }
      case 'log_work': {
        if (!canWrite) return 'Tvoje role nemá právo zapisovat. (Majitel je jen pro čtení.)';
        if (!input?.content) return 'Chybí popis, co bylo uděláno.';
        let assetId: string | undefined;
        let assetName: string | undefined;
        if (input?.asset) { const a = await findAssetByName(tenantId, String(input.asset)); if (a) { assetId = a.id; assetName = a.name; } else assetName = String(input.asset); }
        await addWorkLogEntry(tenantId, actor, { assetId, assetName, content: String(input.content), workType: input?.workType });
        return `✅ Zapsáno do Deníku — ${assetName ?? 'bez zařízení'}: ${input.content}`;
      }
      case 'create_task': {
        if (!canWrite) return 'Tvoje role nemá právo zakládat úkoly. (Majitel je jen pro čtení.)';
        if (!input?.title) return 'Chybí název úkolu.';
        let assetId: string | undefined;
        let assetName: string | undefined;
        if (input?.asset) { const a = await findAssetByName(tenantId, String(input.asset)); if (a) { assetId = a.id; assetName = a.name; } else assetName = String(input.asset); }
        const code = await createTaskEntry(tenantId, actor, { title: String(input.title), description: input?.description, priority: input?.priority, assetId, assetName });
        return `✅ Úkol založen — ${code}: ${input.title}${assetName ? ` (${assetName})` : ''} [${input?.priority ?? 'P3'}]`;
      }
      case 'get_inventory': {
        let items = await getInventory(tenantId);
        if (input?.query) { const q = String(input.query).toLowerCase(); items = items.filter((i) => `${i.name ?? ''} ${i.code ?? ''} ${i.category ?? ''}`.toLowerCase().includes(q)); }
        if (input?.onlyLow) items = items.filter((i) => Number(i.quantity ?? 0) <= Number(i.minQuantity ?? 0));
        items.sort((a, b) => (Number(a.quantity ?? 0) / Math.max(1, Number(a.minQuantity ?? 1))) - (Number(b.quantity ?? 0) / Math.max(1, Number(b.minQuantity ?? 1))));
        const lines = items.slice(0, 150).map((i) => `• ${i.name ?? '?'} — ${i.quantity ?? 0}${i.unit ? ' ' + i.unit : ''} (${invStatus(Number(i.quantity ?? 0), Number(i.minQuantity ?? 0))})${i.location ? ` · ${i.location}` : ''}`);
        return `Sklad: ${items.length} položek\n${lines.join('\n') || '—'}`;
      }
      case 'list_revisions': {
        const limit = typeof input?.withinDays === 'number' ? input.withinDays : 60;
        const revs = (await getRevisions(tenantId))
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
        if (!canWrite) return 'Tvoje role nemá právo zakládat zařízení. (Majitel je jen pro čtení.)';
        if (!input?.name) return 'Chybí název zařízení.';
        await createAssetEntry(tenantId, actor, { name: String(input.name), category: input?.category, location: input?.location });
        return `✅ Zařízení založeno — ${input.name}${input?.location ? ` (${input.location})` : ''}. Najdeš ho v Kartotéce.`;
      }
      case 'remember': {
        if (!canTeach) return 'Učit asistenta mohou jen Majitel, Vedení a Superadmin.';
        if (!input?.content) return 'Chybí, co si mám zapamatovat.';
        await addAiMemory(tenantId, actor, String(input.content), input?.category);
        return `🧠 Zapamatováno: ${input.content}`;
      }
      case 'forget': {
        if (!canTeach) return 'Mazat z paměti mohou jen Majitel, Vedení a Superadmin.';
        if (!input?.query) return 'Chybí, co mám zapomenout.';
        const n = await forgetAiMemory(tenantId, String(input.query));
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
function buildSystemPrompt(actor: Actor, role: string, canWrite: boolean, canTeach: boolean, memories: string[]): string {
  const today = new Date().toLocaleDateString('cs-CZ');
  const memoryBlock = memories.length
    ? `\n\nZNALOSTI A PRAVIDLA TÉTO FIRMY (naučil ses je dříve — VŽDY se jimi řiď):\n${memories.map((m) => `• ${m}`).join('\n')}`
    : '';
  const teachLine = canTeach
    ? `\n- UČENÍ: Když tě uživatel naučí trvalé pravidlo / preferenci / fakt („pamatuj si…“, „od teď…“, „u nás platí…“), ulož to nástrojem remember. Když řekne „zapomeň…“, použij forget. Po uložení potvrď.`
    : '';
  return `Jsi AI asistent systému Asset Shield (PROVOZ 360) — údržba potravinářského závodu (firma nominal, areál Kozlov).
Dnešní datum: ${today}. Mluvíš s: ${actor.name} (role ${role}).

JAK ODPOVÍDAT:
- VŽDY česky. Stručně, lidsky, jen finální odpověď — žádné meta-komentáře o tom, jak přemýšlíš.
- Když se uživatel ptá na STAV, ČÍSLA nebo TERMÍNY, NEHÁDEJ — nejdřív použij čtecí nástroj a odpověz z dat.
- Když si všimneš opakujícího se problému nebo příležitosti ke zlepšení (často se kazící stroj, propadlé termíny), stručně NAVRHNI zlepšení.
${canWrite
    ? `- Umíš i ZAPISOVAT: zápis do Deníku (log_work) a založení úkolu (create_task). Použij je JEN když uživatel jasně chce něco zapsat/založit (např. „zapiš že jsme vyměnili ložisko na EXT-001“). Po zápisu stručně potvrď, co jsi uložil.`
    : `- Tvoje role je jen pro čtení — zápisy nedělej, jen poraď a ukaž data.`}${teachLine}

KONTEXT SYSTÉMU:
- Moduly: Úkoly (P1 havárie … P4 nápad), Mapa strojů, Sklad ND, Revize/kontroly, Vozidla, Odpady, Loupárna, Kontroly budov, Deník (záznamy práce).
- Budovy: A administrativa, B krček, C zázemí & vedení, D výrobní hala, E dílna & sklad ND, L loupárna.
- Stroje: Extrudery (EXT-xxx), míchačky, balicí linky, pece, dopravníky, VZV, kompresory, chladicí jednotky, loupačky, převodovky.
- Role: Majitel (jen čtení), Vedení, Superadmin, Údržba, Výroba, Skladník, Operátor.${memoryBlock}`;
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

    const tools = [...READ_TOOLS, ...(canWrite ? WRITE_TOOLS : []), ...(canTeach ? TEACH_TOOLS : [])];

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
    const memories = (await getAiMemory(tenantId)).map((m) => String(m.content ?? '')).filter(Boolean);
    const system = buildSystemPrompt(actor, role, canWrite, canTeach, memories);
    const toolsUsed: string[] = [];

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
          const results: Anthropic.ToolResultBlockParam[] = [];
          for (const block of response.content) {
            if (block.type === 'tool_use') {
              toolsUsed.push(block.name);
              const out = await runTool(block.name, block.input, { tenantId, actor, canWrite, canTeach });
              results.push({ type: 'tool_result', tool_use_id: block.id, content: out });
            }
          }
          msgs.push({ role: 'user', content: results });
          continue;
        }

        // Hotovo — vytáhni text.
        reply = response.content.filter((b) => b.type === 'text').map((b: any) => b.text).join('\n').trim();
        break;
      }

      if (!reply) reply = 'Promiň, na tohle se mi teď nepodařilo odpovědět. Zkus to prosím jinak.';
      return { reply, toolsUsed };
    } catch (err) {
      console.error('[assistantChat] Anthropic error:', (err as Error)?.message);
      throw new functions.https.HttpsError('internal', 'AI asistent je dočasně nedostupný. Zkus to prosím za chvíli.');
    }
  });

// ── Týdenní AI souhrn (běží sám) — pošle vedení přehled + návrhy ──
export const weeklyAiSummary = functions
  .runWith({ secrets: ['ANTHROPIC_API_KEY'], timeoutSeconds: 300, memory: '512MB' })
  .pubsub.schedule('every monday 07:00')
  .timeZone('Europe/Prague')
  .onRun(async () => {
    try {
      const apiKey = process.env.ANTHROPIC_API_KEY || '';
      if (!apiKey) { console.warn('[weeklyAiSummary] chybí ANTHROPIC_API_KEY'); return; }
      const tenantId = 'main_firm';

      const assets = await getAssets(tenantId);
      const events = assets.flatMap((a) => (a.events ?? []).map((ev: any) => ({ a, ev, d: daysUntil(ev.nextDate) })));
      const overdue = events.filter((x: any) => x.d !== null && x.d < 0);
      const soon = events.filter((x: any) => x.d !== null && x.d >= 0 && x.d <= 14);
      const auditOverdue = events.filter((x: any) => x.d !== null && x.d < 0 && AUDIT_RE.test(`${x.ev.name ?? ''} ${x.ev.eventType ?? ''}`));
      const tasks = await getOpenTasks(tenantId);
      const p1 = tasks.filter((t) => String(t.priority) === 'P1');
      const stats = await getGlobalStats();
      const lemon = Array.isArray(stats?.lemonList) ? stats.lemonList : [];
      const memories = (await getAiMemory(tenantId)).map((m) => String(m.content ?? '')).filter(Boolean);

      const dataText = [
        `Po termínu (kontroly/revize/údržba): ${overdue.length}`,
        ...overdue.slice(0, 15).map((x: any) => `   • ${x.a.name}: ${x.ev.name} (${x.ev.nextDate ?? '—'})`),
        `Z toho auditních po termínu (IFS/BRC): ${auditOverdue.length}`,
        `Blíží se do 14 dní: ${soon.length}`,
        `Otevřené úkoly: ${tasks.length} (P1 havárie: ${p1.length})`,
        `Nejporuchovější stroje (30 dní): ${lemon.slice(0, 5).map((l: any) => `${l.assetName ?? l.assetId} (${l.issueCount}×)`).join(', ') || '—'}`,
      ].join('\n');

      const memBlock = memories.length ? `\nPravidla firmy (zohledni je):\n${memories.map((m) => `• ${m}`).join('\n')}` : '';
      const client = new Anthropic({ apiKey });
      const resp = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: `Jsi AI asistent údržby potravinářského závodu (firma nominal). Napiš KRÁTKÝ týdenní souhrn pro vedení v češtině: 3–5 vět co je tento týden důležité + 2–3 konkrétní návrhy, na co se zaměřit (priority, prevence, audit). Stručně, lidsky, bez balastu.${memBlock}`,
        messages: [{ role: 'user', content: `Data za tento týden:\n${dataText}\n\nNapiš týdenní souhrn + návrhy.` }],
      });
      const summary = resp.content.filter((b) => b.type === 'text').map((b: any) => b.text).join('\n').trim() || 'Tento týden bez zásadních zjištění.';

      const ref = await db().collection('aiSummaries').add({ tenantId, content: summary, source: 'weekly', createdAt: FV.serverTimestamp() });

      const usersSnap = await db().collection('users').get();
      const targets = usersSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }))
        .filter((u) => u.active !== false && (!u.tenantId || u.tenantId === tenantId) && ['MAJITEL', 'VEDENI', 'SUPERADMIN'].includes(String(u.role || '').toUpperCase()));
      const batch = db().batch();
      targets.forEach((u) => {
        batch.set(db().doc(`notifications/ai-weekly-${ref.id}-${u.id}`), {
          userId: u.id,
          tenantId,
          type: 'ai',
          priority: 'normal',
          title: '🧠 Týdenní souhrn od AI',
          message: summary.slice(0, 280),
          actionUrl: '/ai',
          actionLabel: 'Otevřít AI',
          read: false,
          generated: true,
          source: 'ai-weekly',
          sourceId: ref.id,
          createdAt: FV.serverTimestamp(),
        });
      });
      await batch.commit();
      console.log(`[weeklyAiSummary] hotovo, notifikováno ${targets.length}`);
    } catch (err) {
      console.error('[weeklyAiSummary] error:', (err as Error)?.message);
    }
  });
