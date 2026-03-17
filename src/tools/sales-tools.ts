import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { OdooClient, OdooDomain } from '../odoo-client.js';

const ORDER_FIELDS = [
  'id', 'name', 'partner_id', 'user_id', 'team_id',
  'state', 'date_order', 'validity_date', 'commitment_date',
  'amount_untaxed', 'amount_tax', 'amount_total',
  'currency_id', 'company_id', 'note',
  'order_line', 'invoice_status', 'create_date', 'write_date',
];

const ORDER_LINE_FIELDS = [
  'id', 'product_id', 'name', 'product_uom_qty', 'price_unit',
  'price_subtotal', 'price_total', 'tax_id', 'discount',
];

export function registerSalesTools(server: McpServer, client: OdooClient): void {
  server.tool(
    'odoo_sales_list_orders',
    'List sales orders or quotations',
    {
      state: z.enum(['draft', 'sent', 'sale', 'done', 'cancel']).optional()
        .describe('draft=quotation, sent=sent quotation, sale=confirmed order, done=locked, cancel=cancelled'),
      customer: z.string().optional().describe('Filter by customer name (partial match)'),
      limit: z.number().optional().default(20),
      offset: z.number().optional().default(0),
    },
    async ({ state, customer, limit, offset }) => {
      const domain: OdooDomain = [];
      if (state) domain.push(['state', '=', state]);
      if (customer) domain.push(['partner_id.name', 'ilike', customer]);

      const orders = await client.searchRead('sale.order', domain, ORDER_FIELDS, {
        limit,
        offset,
        order: 'date_order desc',
      });

      return {
        content: [{ type: 'text', text: JSON.stringify(orders, null, 2) }],
      };
    }
  );

  server.tool(
    'odoo_sales_get_order',
    'Get full details of a sales order including line items',
    {
      id: z.number().describe('Sales order ID'),
    },
    async ({ id }) => {
      const orders = await client.read('sale.order', [id], ORDER_FIELDS);
      if (!orders.length) throw new Error(`Order ${id} not found`);

      const order = orders[0];
      const lineIds = order['order_line'] as number[];
      const lines = lineIds?.length
        ? await client.read('sale.order.line', lineIds, ORDER_LINE_FIELDS)
        : [];

      return {
        content: [{ type: 'text', text: JSON.stringify({ ...order, order_line: lines }, null, 2) }],
      };
    }
  );

  server.tool(
    'odoo_sales_search_orders',
    'Search sales orders by order name or customer',
    {
      query: z.string().describe('Search by order name (e.g. S00123) or customer name'),
      limit: z.number().optional().default(20),
    },
    async ({ query, limit }) => {
      const domain: OdooDomain = [
        '|',
        ['name', 'ilike', query],
        ['partner_id.name', 'ilike', query],
      ];

      const orders = await client.searchRead('sale.order', domain, ORDER_FIELDS, {
        limit,
        order: 'date_order desc',
      });

      return {
        content: [{ type: 'text', text: JSON.stringify(orders, null, 2) }],
      };
    }
  );

  server.tool(
    'odoo_sales_summary',
    'Get a sales summary: count and total revenue grouped by state',
    {},
    async () => {
      const states = [
        { key: 'draft', label: 'Quotation' },
        { key: 'sent', label: 'Quotation Sent' },
        { key: 'sale', label: 'Sales Order' },
        { key: 'done', label: 'Locked' },
        { key: 'cancel', label: 'Cancelled' },
      ];

      const summary = await Promise.all(
        states.map(async ({ key, label }) => {
          const domain: OdooDomain = [['state', '=', key]];
          const count = await client.searchCount('sale.order', domain);

          const orders = await client.searchRead(
            'sale.order',
            domain,
            ['amount_total'],
            { limit: 1000 }
          );
          const total = orders.reduce(
            (sum, o) => sum + ((o['amount_total'] as number) || 0),
            0
          );

          return { state: label, count, total_amount: total };
        })
      );

      return {
        content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
      };
    }
  );
}
