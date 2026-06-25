// connector/src/tools.ts
// Fáze 1 — read-only nástroje konektoru. Nic nemění, jen čte a shrnuje.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getAssets, getAssetById, getWorkLogs, getOpenTasks, findAssetByName, addWorkLogEntry, createTaskEntry, createAssetEntry, type Asset } from './firestore.js';

const daysUntil = (iso?: string): number | null => {
  if (!iso) return null;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  return Math.ceil((t.getTime() - Date.now()) / 86400000);
};
const text = (s: string) => ({ content: [{ type: 'text' as const, text: s.slice(0, 120000) }] });
const place = (a: Asset) => [a.buildingId ? `Budova ${a.buildingId}` : '', a.areaName || a.location, a.code].filter(Boolean).join(' · ');
const czDate = (ts?: { toDate?: () => Date }) => { const d = ts?.toDate?.(); return d ? d.toLocaleDateString('cs-CZ') : '?'; };

const STATUS_CZ: Record<string, string> = { operational: 'běží', maintenance: 'údržba', broken: 'PORUCHA', stopped: 'stop', idle: 'nečinný' };
const statusLabel = (s?: string) => STATUS_CZ[(s || '').toLowerCase()] ?? (s || '?');
const isProblem = (s?: string) => /broken|stopped|fault|out_of_service|porucha/i.test(s || '');

const AUDIT_RE = /kalibr|celistvost|detector|detektor|kontrol|revize|udrzba|údržba|servis|chladiv|plyn/i;

export function registerTools(server: McpServer): void {
  server.tool(
    'get_machine_status',
    'Stav zařízení/strojů (běží, porucha, údržba, stop). Volitelně jen problémy nebo hledaný název.',
    { onlyProblems: z.boolean().optional().describe('jen poruchy/stop'), query: z.string().optional().describe('hledaný název nebo kód') },
    async ({ onlyProblems, query }) => {
      let assets = await getAssets();
      if (query) { const q = query.toLowerCase(); assets = assets.filter((a) => `${a.name ?? ''} ${a.code ?? ''}`.toLowerCase().includes(q)); }
      if (onlyProblems) assets = assets.filter((a) => isProblem(a.status));
      const lines = assets.slice(0, 150).map((a) => `• ${a.name ?? a.id} — ${statusLabel(a.status)}${place(a) ? ` (${place(a)})` : ''}`);
      return text(`Zařízení: ${assets.length}\n${lines.join('\n') || '—'}`);
    },
  );

  server.tool(
    'list_open_tasks',
    'Otevřené úkoly / pracovní příkazy (co se teď řeší).',
    {},
    async () => {
      const tasks = await getOpenTasks();
      const lines = tasks.slice(0, 150).map((t) => `• ${t.title ?? t.id}${t.priority ? ` [${t.priority}]` : ''}${t.assetName ? ` — ${t.assetName}` : ''}${t.dueDate ? ` (do ${t.dueDate})` : ''}`);
      return text(`Otevřené úkoly: ${tasks.length}\n${lines.join('\n') || '—'}`);
    },
  );

  server.tool(
    'list_overdue_checks',
    'Propadlé nebo brzy propadající termíny (kalibrace, kontroly, údržba) z events na zařízeních.',
    { withinDays: z.number().optional().describe('zahrň i ty, co propadnou do X dní (default 0 = jen propadlé)') },
    async ({ withinDays }) => {
      const limit = withinDays ?? 0;
      const assets = await getAssets();
      const items = assets
        .flatMap((a) => (a.events ?? []).map((ev) => ({ a, ev, d: daysUntil(ev.nextDate) })))
        .filter((x): x is { a: Asset; ev: typeof x.ev; d: number } => x.d !== null && x.d <= limit)
        .sort((x, y) => x.d - y.d);
      const lines = items.slice(0, 150).map((x) => `${x.d < 0 ? '❗ PO TERMÍNU' : '⏳ blíží se'} — ${x.a.name}: ${x.ev.name} (termín ${x.ev.nextDate ?? '—'})`);
      return text(`Propadlé/blížící se: ${items.length}\n${lines.join('\n') || 'Nic.'}`);
    },
  );

  server.tool(
    'audit_readiness',
    'Audit přehled (IFS/BRC/Tesco): kolik auditních kontrol je po termínu nebo se blíží — checklist připravenosti.',
    {},
    async () => {
      const assets = await getAssets();
      const audit = assets.flatMap((a) =>
        (a.events ?? []).filter((ev) => AUDIT_RE.test(`${ev.name ?? ''} ${ev.eventType ?? ''}`)).map((ev) => ({ a, ev, d: daysUntil(ev.nextDate) })),
      );
      const overdue = audit.filter((x) => x.d !== null && x.d < 0);
      const soon = audit.filter((x) => x.d !== null && x.d >= 0 && x.d <= 30);
      const lines = [
        `Auditních kontrol celkem: ${audit.length}`,
        `❗ Po termínu: ${overdue.length}`,
        ...overdue.slice(0, 60).map((x) => `   • ${x.a.name}: ${x.ev.name} (${x.ev.nextDate ?? '—'})`),
        `⏳ Blíží se (do 30 dní): ${soon.length}`,
        ...soon.slice(0, 40).map((x) => `   • ${x.a.name}: ${x.ev.name} (${x.ev.nextDate ?? '—'})`),
      ];
      return text(lines.join('\n'));
    },
  );

  server.tool(
    'search_worklogs',
    'Prohledá Deník (záznamy práce). Buď podle assetId, nebo textem (název zařízení, co se dělalo).',
    { assetId: z.string().optional(), query: z.string().optional(), limit: z.number().optional() },
    async ({ assetId, query, limit }) => {
      let logs = await getWorkLogs({ assetId, limit: assetId ? (limit ?? 50) : 200 });
      if (query && !assetId) {
        const q = query.toLowerCase();
        logs = logs.filter((l) => `${l.assetName ?? ''} ${l.workType ?? ''} ${l.content ?? ''}`.toLowerCase().includes(q)).slice(0, limit ?? 50);
      }
      const lines = logs.map((l) => `• ${czDate(l.performedAt ?? l.createdAt)} — ${l.assetName ?? '?'}: ${l.workType ?? l.type ?? ''} ${l.content ?? ''} (${l.userName ?? '?'})`);
      return text(`Záznamy: ${logs.length}\n${lines.join('\n') || '—'}`);
    },
  );

  server.tool(
    'get_asset_detail',
    'Detail zařízení: stav, termíny (events), poslední práce. Zadej assetId nebo název.',
    { assetId: z.string().optional(), name: z.string().optional() },
    async ({ assetId, name }) => {
      let asset: Asset | null = null;
      if (assetId) asset = await getAssetById(assetId);
      else if (name) { const all = await getAssets(); const q = name.toLowerCase(); asset = all.find((a) => (a.name ?? '').toLowerCase().includes(q)) ?? null; }
      if (!asset) return text('Zařízení nenalezeno.');
      const events = (asset.events ?? []).map((ev) => {
        const d = daysUntil(ev.nextDate);
        return `   • ${ev.name}: ${ev.nextDate ?? '—'}${d !== null ? (d < 0 ? ' (PO TERMÍNU)' : ` (za ${d} dní)`) : ''}`;
      });
      const logs = await getWorkLogs({ assetId: asset.id, limit: 5 });
      const logLines = logs.map((l) => `   • ${czDate(l.performedAt ?? l.createdAt)}: ${l.workType ?? l.type ?? ''} ${l.content ?? ''}`);
      return text([
        `${asset.name} — ${statusLabel(asset.status)}`,
        place(asset),
        'Termíny:',
        ...(events.length ? events : ['   —']),
        'Poslední práce:',
        ...(logLines.length ? logLines : ['   —']),
      ].join('\n'));
    },
  );

  // Zápisové nástroje (Fáze 2) — jen když je MCP_ALLOW_WRITE=true.
  if (process.env.MCP_ALLOW_WRITE === 'true') registerWriteTools(server);
}

function registerWriteTools(server: McpServer): void {
  server.tool(
    'add_worklog',
    'Zapíše záznam práce do Deníku (co bylo uděláno, na čem, kým). Použij JEN na výslovný pokyn uživatele.',
    { content: z.string().describe('co bylo uděláno / výsledek'), asset: z.string().optional().describe('název zařízení, kterého se to týká'), workType: z.string().optional().describe('druh práce, např. Údržba / Oprava / Čištění'), worker: z.string().optional().describe('kdo práci udělal') },
    async ({ content, asset, workType, worker }) => {
      let assetId: string | undefined;
      let assetName: string | undefined;
      if (asset) { const a = await findAssetByName(asset); if (a) { assetId = a.id; assetName = a.name; } else assetName = asset; }
      await addWorkLogEntry({ assetId, assetName, content, workType, worker });
      return text(`✅ Zapsáno do Deníku — ${assetName ?? 'bez zařízení'}: ${content}${worker ? ` (${worker})` : ''}`);
    },
  );

  server.tool(
    'create_task',
    'Založí nový úkol / pracovní příkaz. Použij JEN na výslovný pokyn uživatele.',
    { title: z.string().describe('název úkolu'), description: z.string().optional(), priority: z.enum(['P1', 'P2', 'P3', 'P4']).optional().describe('P1 = havárie … P4 = nízká (default P3)'), asset: z.string().optional().describe('název zařízení') },
    async ({ title, description, priority, asset }) => {
      let assetId: string | undefined;
      let assetName: string | undefined;
      if (asset) { const a = await findAssetByName(asset); if (a) { assetId = a.id; assetName = a.name; } else assetName = asset; }
      const { code } = await createTaskEntry({ title, description, priority, assetId, assetName });
      return text(`✅ Úkol založen — ${code}: ${title}${assetName ? ` (${assetName})` : ''} [${priority ?? 'P3'}]`);
    },
  );

  server.tool(
    'create_asset',
    'Založí nové zařízení v kartotéce. Použij JEN na výslovný pokyn uživatele.',
    { name: z.string().describe('název zařízení, např. „Klimatizace velín"'), location: z.string().optional().describe('umístění textem'), category: z.string().optional() },
    async ({ name, location, category }) => {
      await createAssetEntry({ name, location, category });
      return text(`✅ Zařízení založeno — ${name}${location ? ` (${location})` : ''}. Najdeš ho v Kartotéce (Bez budovy).`);
    },
  );
}
