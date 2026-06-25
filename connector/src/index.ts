// connector/src/index.ts
// MCP konektor pro nominal-cmms — remote server (Streamable HTTP), Fáze 1 (read-only).
// Běh na Cloud Run. Bezstavový (stateless) režim: server + transport na každý požadavek zvlášť.

import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { registerTools } from './tools.js';

const PORT = Number(process.env.PORT) || 8080;
const CONNECTOR_TOKEN = process.env.CONNECTOR_TOKEN || '';
const ALLOW_NO_AUTH = process.env.MCP_ALLOW_NO_AUTH === 'true';

function buildServer(): McpServer {
  const server = new McpServer({ name: 'nominal-cmms-connector', version: '0.1.0' });
  registerTools(server);
  return server;
}

const app = express();
app.use(express.json({ limit: '1mb' }));

// Zdravotní check (Cloud Run + rychlé ověření v prohlížeči).
app.get('/', (_req, res) => res.json({ ok: true, name: 'nominal-cmms-connector', phase: 1, readOnly: true }));

// Jednoduchá ochrana tokenem — pro testování přes MCP Inspector.
// POZOR: claude.ai vyžaduje OAuth; tu vrstvu přidáme PŘED připojením v Claude (Fáze 1b).
app.use('/mcp', (req, res, next) => {
  if (CONNECTOR_TOKEN) {
    if (req.header('authorization') === `Bearer ${CONNECTOR_TOKEN}`) return next();
    return res.status(401).json({ error: 'unauthorized' });
  }
  // Žádný token nastaven = fail-CLOSED. Bez ověření pustíme jen s explicitním lokálním/dev flagem.
  if (ALLOW_NO_AUTH) return next();
  return res.status(401).json({ error: 'unauthorized', hint: 'Nastav CONNECTOR_TOKEN (nebo MCP_ALLOW_NO_AUTH=true jen pro lokalni vyvoj).' });
});

app.post('/mcp', async (req, res) => {
  try {
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('[mcp] error:', (err as Error)?.message ?? 'unknown');
    if (!res.headersSent) res.status(500).json({ error: 'internal_error' });
  }
});

// V bezstavovém režimu nepodporujeme GET/DELETE (žádné dlouhé session).
app.get('/mcp', (_req, res) => res.status(405).json({ error: 'method_not_allowed' }));
app.delete('/mcp', (_req, res) => res.status(405).json({ error: 'method_not_allowed' }));

app.listen(PORT, () => console.log(`MCP konektor (Fáze 1, read-only) běží na portu ${PORT}`));
