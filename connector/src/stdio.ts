// connector/src/stdio.ts
// Lokální spuštění pro Claude Desktop (stdio transport) — Fáze 1, read-only.
// Žádný OAuth, žádné nasazení. Claude Desktop spustí tenhle proces a mluví s ním přes stdin/stdout.
// Klíč k Firestore se předá přes env GOOGLE_APPLICATION_CREDENTIALS, firma přes TENANT_ID.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools.js';

const server = new McpServer({ name: 'nominal-cmms-connector', version: '0.1.0' });
registerTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
