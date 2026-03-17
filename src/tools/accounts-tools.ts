import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { OdooClient, OdooDomain } from '../odoo-client.js';

const INVOICE_FIELDS = [
  'id', 'name', 'move_type', 'partner_id', 'invoice_date', 'invoice_date_due',
  'state', 'payment_state', 'amount_untaxed', 'amount_tax', 'amount_total',
  'amount_residual', 'currency_id', 'invoice_user_id', 'journal_id',
  'narration', 'ref', 'company_id', 'create_date', 'write_date',
];

const MOVE_TYPE_MAP: Record<string, string> = {
  out_invoice: 'Customer Invoice',
  out_refund: 'Customer Credit Note',
  in_invoice: 'Vendor Bill',
  in_refund: 'Vendor Credit Note',
};

export function registerAccountsTools(server: McpServer, client: OdooClient): void {
  server.tool(
    'odoo_accounts_list_invoices',
    'List invoices or bills',
    {
      type: z.enum(['out_invoice', 'out_refund', 'in_invoice', 'in_refund']).optional()
        .describe('out_invoice=customer invoice, in_invoice=vendor bill, out_refund=credit note'),
      state: z.enum(['draft', 'posted', 'cancel']).optional()
        .describe('draft=draft, posted=confirmed/posted, cancel=cancelled'),
      payment_state: z.enum(['not_paid', 'in_payment', 'paid', 'partial', 'reversed', 'invoicing_legacy']).optional()
        .describe('Payment status filter'),
      partner: z.string().optional().describe('Filter by partner/customer name (partial match)'),
      date_from: z.string().optional().describe('Invoice date from (YYYY-MM-DD)'),
      date_to: z.string().optional().describe('Invoice date to (YYYY-MM-DD)'),
      limit: z.number().optional().default(20),
      offset: z.number().optional().default(0),
    },
    async ({ type, state, payment_state, partner, date_from, date_to, limit, offset }) => {
      const domain: OdooDomain = [];
      if (type) domain.push(['move_type', '=', type]);
      else domain.push(['move_type', 'in', ['out_invoice', 'out_refund', 'in_invoice', 'in_refund']]);

      if (state) domain.push(['state', '=', state]);
      if (payment_state) domain.push(['payment_state', '=', payment_state]);
      if (partner) domain.push(['partner_id.name', 'ilike', partner]);
      if (date_from) domain.push(['invoice_date', '>=', date_from]);
      if (date_to) domain.push(['invoice_date', '<=', date_to]);

      const invoices = await client.searchRead('account.move', domain, INVOICE_FIELDS, {
        limit,
        offset,
        order: 'invoice_date desc',
      });

      return {
        content: [{ type: 'text', text: JSON.stringify(invoices, null, 2) }],
      };
    }
  );

  server.tool(
    'odoo_accounts_get_invoice',
    'Get full details of an invoice or bill by ID',
    {
      id: z.number().describe('Invoice/move ID'),
    },
    async ({ id }) => {
      const invoices = await client.read('account.move', [id], [
        ...INVOICE_FIELDS,
        'invoice_line_ids', 'line_ids',
      ]);
      if (!invoices.length) throw new Error(`Invoice ${id} not found`);

      const invoice = invoices[0];
      const lineIds = invoice['invoice_line_ids'] as number[];
      const lines = lineIds?.length
        ? await client.read('account.move.line', lineIds, [
            'id', 'name', 'product_id', 'quantity', 'price_unit',
            'price_subtotal', 'price_total', 'tax_ids', 'account_id', 'discount',
          ])
        : [];

      return {
        content: [{ type: 'text', text: JSON.stringify({ ...invoice, invoice_lines: lines }, null, 2) }],
      };
    }
  );

  server.tool(
    'odoo_accounts_receivable_summary',
    'Get accounts receivable summary: total outstanding customer invoices',
    {},
    async () => {
      const domain: OdooDomain = [
        ['move_type', '=', 'out_invoice'],
        ['state', '=', 'posted'],
        ['payment_state', 'in', ['not_paid', 'partial']],
      ];

      const invoices = await client.searchRead(
        'account.move',
        domain,
        ['id', 'name', 'partner_id', 'amount_residual', 'invoice_date_due', 'currency_id'],
        { limit: 500, order: 'invoice_date_due asc' }
      );

      const total = invoices.reduce(
        (sum, inv) => sum + ((inv['amount_residual'] as number) || 0),
        0
      );

      const overdue = invoices.filter(
        (inv) => inv['invoice_date_due'] && (inv['invoice_date_due'] as string) < new Date().toISOString().split('T')[0]
      );
      const overdueTotal = overdue.reduce(
        (sum, inv) => sum + ((inv['amount_residual'] as number) || 0),
        0
      );

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            total_outstanding: total,
            total_overdue: overdueTotal,
            count: invoices.length,
            overdue_count: overdue.length,
            invoices,
          }, null, 2),
        }],
      };
    }
  );

  server.tool(
    'odoo_accounts_payable_summary',
    'Get accounts payable summary: total outstanding vendor bills',
    {},
    async () => {
      const domain: OdooDomain = [
        ['move_type', '=', 'in_invoice'],
        ['state', '=', 'posted'],
        ['payment_state', 'in', ['not_paid', 'partial']],
      ];

      const bills = await client.searchRead(
        'account.move',
        domain,
        ['id', 'name', 'partner_id', 'amount_residual', 'invoice_date_due', 'currency_id'],
        { limit: 500, order: 'invoice_date_due asc' }
      );

      const total = bills.reduce(
        (sum, b) => sum + ((b['amount_residual'] as number) || 0),
        0
      );

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ total_outstanding: total, count: bills.length, bills }, null, 2),
        }],
      };
    }
  );

  server.tool(
    'odoo_accounts_revenue_report',
    'Get revenue report: posted customer invoices grouped by month',
    {
      year: z.number().describe('Year (e.g. 2025)'),
    },
    async ({ year }) => {
      const domain: OdooDomain = [
        ['move_type', '=', 'out_invoice'],
        ['state', '=', 'posted'],
        ['invoice_date', '>=', `${year}-01-01`],
        ['invoice_date', '<=', `${year}-12-31`],
      ];

      const invoices = await client.searchRead(
        'account.move',
        domain,
        ['invoice_date', 'amount_untaxed', 'amount_total'],
        { limit: 2000 }
      );

      // Group by month
      const byMonth: Record<string, { count: number; revenue: number }> = {};
      for (const inv of invoices) {
        const date = inv['invoice_date'] as string;
        if (!date) continue;
        const month = date.substring(0, 7); // YYYY-MM
        if (!byMonth[month]) byMonth[month] = { count: 0, revenue: 0 };
        byMonth[month].count++;
        byMonth[month].revenue += (inv['amount_untaxed'] as number) || 0;
      }

      const result = Object.entries(byMonth)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, data]) => ({ month, ...data }));

      const totalRevenue = invoices.reduce(
        (sum, inv) => sum + ((inv['amount_untaxed'] as number) || 0),
        0
      );

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ year, total_revenue: totalRevenue, by_month: result }, null, 2),
        }],
      };
    }
  );
}
