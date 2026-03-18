# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Build TypeScript to dist/
npm run build

# Run in development mode (tsx, no compile step)
npm run dev

# Run the compiled server
npm start
```

There are no tests. CI only validates TypeScript compilation.

## Architecture

**odoo-mcp** is a [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that exposes Odoo ERP operations as AI-callable tools via stdio transport.

### Data Flow

```
MCP Client (e.g. Claude Desktop)
    ↓ stdio
index.ts  →  registers tool modules  →  each tool calls OdooClient
                                              ↓
                                    Odoo JSON-RPC API
                                    (/web/dataset/call_kw, /jsonrpc)
```

### Key Files

- **`src/index.ts`** — Entry point: loads config, authenticates, registers all tool modules, starts stdio server
- **`src/config.ts`** — Zod schema validation of environment variables (`ODOO_URL`, `ODOO_DB`, `ODOO_USERNAME`, `ODOO_PASSWORD`, `ODOO_TIMEOUT_MS`)
- **`src/odoo-client.ts`** — HTTP wrapper for Odoo's JSON-RPC API with methods: `searchRead`, `read`, `searchCount`, `create`, `write`, `callMethod`, `fieldsGet`
- **`src/tools/`** — Six modules each registering MCP tools against the server: `crm-tools`, `sales-tools`, `hr-tools`, `accounts-tools`, `payroll-tools`, `generic-tools`

### Tool Registration Pattern

Each tool module exports a `register*Tools(server, client)` function. Tools use Zod for input schema validation. Each module defines field-selection constants to keep queries efficient.

### OdooClient API Notes

- Authentication via `/jsonrpc` (returns UID stored on client instance)
- Data queries via `/web/dataset/call_kw`
- `OdooDomain` follows Odoo's Polish-notation domain syntax (`['&', cond1, cond2]`)
- Timeout uses `AbortController`; default 30s, configurable via env

### Environment Setup

Copy `.env.example` to `.env` and fill in the four required variables before running.
