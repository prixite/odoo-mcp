#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig, SERVER_NAME, SERVER_VERSION } from './config.js';
import { OdooClient } from './odoo-client.js';
import { registerCrmTools } from './tools/crm-tools.js';
import { registerSalesTools } from './tools/sales-tools.js';
import { registerHrTools } from './tools/hr-tools.js';
import { registerAccountsTools } from './tools/accounts-tools.js';
import { registerPayrollTools } from './tools/payroll-tools.js';
import { registerGenericTools } from './tools/generic-tools.js';

async function main(): Promise<void> {
  const config = loadConfig();

  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  const client = new OdooClient(config);

  try {
    await client.initialize();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Failed to connect to Odoo: ${msg}\n`);
    process.exit(1);
  }

  // Register all tool groups
  registerCrmTools(server, client);
  registerSalesTools(server, client);
  registerHrTools(server, client);
  registerAccountsTools(server, client);
  registerPayrollTools(server, client);
  registerGenericTools(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.stderr.write(`${SERVER_NAME} v${SERVER_VERSION} connected to ${config.url} (db: ${config.db})\n`);
}

main().catch(err => {
  process.stderr.write(`Fatal error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
