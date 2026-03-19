# odoo-mcp

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server for [Odoo](https://www.odoo.com), enabling AI agents (Claude, etc.) to interact with Odoo ERP — CRM, Sales, HR, Accounts, Payroll, and To-dos — via natural language.

## Features

- **CRM** — list, search, create leads/opportunities; pipeline summary by stage
- **Sales** — list, search, get orders; sales summary by salesperson
- **HR** — list employees/departments, search employees, leave allocations and balances
- **Accounts** — invoices, accounts receivable/payable summaries, revenue reports
- **Payroll** — payslips, payroll batches, salary summaries
- **To-do** — list, create, update, and complete personal to-do tasks
- **Generic** — `search_read`, `get_record`, `write`, and `create` for any Odoo model

## Tools

### CRM
| Tool | Description |
|------|-------------|
| `odoo_crm_list_leads` | List leads/opportunities with optional stage and assignee filters |
| `odoo_crm_get_lead` | Get full details of a lead by ID |
| `odoo_crm_search_leads` | Search leads by keyword (name, partner, email) |
| `odoo_crm_pipeline_summary` | Pipeline grouped by stage with counts and expected revenue |
| `odoo_crm_create_lead` | Create a new lead/opportunity |

### Sales
| Tool | Description |
|------|-------------|
| `odoo_sales_list_orders` | List sales orders with optional status filter |
| `odoo_sales_get_order` | Get full details of a sales order by ID |
| `odoo_sales_search_orders` | Search orders by customer name or order reference |
| `odoo_sales_summary` | Sales summary grouped by salesperson |

### HR
| Tool | Description |
|------|-------------|
| `odoo_hr_list_employees` | List employees with optional department filter |
| `odoo_hr_get_employee` | Get full details of an employee by ID |
| `odoo_hr_search_employees` | Search employees by name |
| `odoo_hr_list_departments` | List all departments |
| `odoo_hr_list_leaves` | List leave requests with optional filters |
| `odoo_hr_leave_allocation_summary` | Leave allocation summary by employee and leave type |

### Accounts
| Tool | Description |
|------|-------------|
| `odoo_accounts_list_invoices` | List invoices with optional type and status filters |
| `odoo_accounts_get_invoice` | Get full details of an invoice by ID |
| `odoo_accounts_receivable_summary` | Accounts receivable summary (outstanding customer invoices) |
| `odoo_accounts_payable_summary` | Accounts payable summary (outstanding vendor bills) |
| `odoo_accounts_revenue_report` | Revenue report grouped by month |

### Payroll
| Tool | Description |
|------|-------------|
| `odoo_payroll_list_payslips` | List payslips with optional employee and date filters |
| `odoo_payroll_get_payslip` | Get full details of a payslip by ID |
| `odoo_payroll_list_batches` | List payroll batches |
| `odoo_payroll_salary_summary` | Salary summary grouped by department |

### To-do
| Tool | Description |
|------|-------------|
| `odoo_todo_list` | List personal to-dos with optional state and priority filters |
| `odoo_todo_get` | Get full details of a to-do by ID |
| `odoo_todo_create` | Create a new to-do (title, notes, deadline, priority) |
| `odoo_todo_update` | Update title, notes, deadline, or priority of a to-do |
| `odoo_todo_mark_done` | Mark a to-do as done or reopen it |

### Generic
| Tool | Description |
|------|-------------|
| `odoo_search_read` | Search and read any Odoo model with a domain filter |
| `odoo_get_record` | Get a specific record by model and ID |
| `odoo_fields_get` | Get field definitions for any Odoo model |
| `odoo_list_partners` | List contacts/partners with optional filters |
| `odoo_write` | Update one or more records by ID on any model |
| `odoo_create` | Create a new record on any model |

## Setup

### 1. Get Odoo credentials

You need:
- Your Odoo instance URL (e.g. `https://mycompany.odoo.com`)
- Database name
- Username and password (admin or a user with API access)

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
ODOO_URL=https://your-odoo-instance.com
ODOO_DB=your_database_name
ODOO_USERNAME=admin@example.com
ODOO_PASSWORD=your_password_here
```

### 3. Build

```bash
npm install
npm run build
```

### 4. Configure Claude Desktop (or other MCP client)

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "odoo": {
      "command": "node",
      "args": ["/path/to/odoo-mcp/dist/index.js"],
      "env": {
        "ODOO_URL": "https://your-odoo-instance.com",
        "ODOO_DB": "your_database_name",
        "ODOO_USERNAME": "admin@example.com",
        "ODOO_PASSWORD": "your_password_here"
      }
    }
  }
}
```

Or if installed globally via npm:

```json
{
  "mcpServers": {
    "odoo": {
      "command": "odoo-mcp",
      "env": {
        "ODOO_URL": "https://your-odoo-instance.com",
        "ODOO_DB": "your_database_name",
        "ODOO_USERNAME": "admin@example.com",
        "ODOO_PASSWORD": "your_password_here"
      }
    }
  }
}
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ODOO_URL` | Yes | — | Odoo instance URL (e.g. `https://mycompany.odoo.com`) |
| `ODOO_DB` | Yes | — | Database name |
| `ODOO_USERNAME` | Yes | — | User email address |
| `ODOO_PASSWORD` | Yes | — | User password |
| `ODOO_TIMEOUT_MS` | No | `30000` | HTTP request timeout in milliseconds |

## Development

```bash
npm run dev   # run with tsx (no build step)
npm run build # compile TypeScript to dist/
```

## Tech Stack

- **Language:** TypeScript (ESM, compiled to `dist/`)
- **MCP SDK:** `@modelcontextprotocol/sdk`
- **Schema validation:** `zod`
- **Transport:** stdio
- **Odoo API:** XML-RPC (`/xmlrpc/2/common` and `/xmlrpc/2/object`)

## License

MIT
