import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { OdooClient, OdooDomain } from '../odoo-client.js';

export function registerGenericTools(server: McpServer, client: OdooClient): void {
  server.tool(
    'odoo_search_read',
    'Generic Odoo search_read — query any model with a domain filter. Use this for ad-hoc queries not covered by dedicated tools.',
    {
      model: z.string().describe('Odoo model name, e.g. "res.partner", "account.move"'),
      domain: z
        .array(z.any())
        .optional()
        .default([])
        .describe('Odoo domain filter as JSON array, e.g. [["state","=","posted"]]'),
      fields: z
        .array(z.string())
        .optional()
        .default([])
        .describe(
          'Fields to return. Empty array returns all fields (expensive — prefer specifying fields).'
        ),
      limit: z.number().optional().default(20),
      offset: z.number().optional().default(0),
      order: z.string().optional().describe('Sort order, e.g. "name asc" or "create_date desc"'),
    },
    async ({ model, domain, fields, limit, offset, order }) => {
      const records = await client.searchRead(model, (domain ?? []) as OdooDomain, fields ?? [], {
        limit,
        offset,
        order,
      });

      return {
        content: [{ type: 'text', text: JSON.stringify(records, null, 2) }],
      };
    }
  );

  server.tool(
    'odoo_get_record',
    'Read a specific Odoo record by ID from any model',
    {
      model: z.string().describe('Odoo model name'),
      id: z.number().describe('Record ID'),
      fields: z.array(z.string()).optional().default([]).describe('Fields to return (empty = all)'),
    },
    async ({ model, id, fields }) => {
      const records = await client.read(model, [id], fields ?? []);
      if (!records.length) throw new Error(`Record ${id} not found in ${model}`);
      return {
        content: [{ type: 'text', text: JSON.stringify(records[0], null, 2) }],
      };
    }
  );

  server.tool(
    'odoo_list_partners',
    'Search contacts/partners (customers, vendors, companies)',
    {
      query: z.string().optional().describe('Name or email search'),
      is_customer: z.boolean().optional().describe('Filter to customers only'),
      is_vendor: z.boolean().optional().describe('Filter to vendors/suppliers only'),
      is_company: z.boolean().optional().describe('Filter to companies only'),
      limit: z.number().optional().default(20),
    },
    async ({ query, is_customer, is_vendor, is_company, limit }) => {
      const domain: OdooDomain = [['active', '=', true]];
      if (query) {
        domain.push('|');
        domain.push(['name', 'ilike', query]);
        domain.push(['email', 'ilike', query]);
      }
      if (is_customer) domain.push(['customer_rank', '>', 0]);
      if (is_vendor) domain.push(['supplier_rank', '>', 0]);
      if (is_company) domain.push(['is_company', '=', true]);

      const partners = await client.searchRead(
        'res.partner',
        domain,
        [
          'id',
          'name',
          'email',
          'phone',
          'mobile',
          'is_company',
          'company_name',
          'customer_rank',
          'supplier_rank',
          'country_id',
          'city',
          'street',
        ],
        { limit, order: 'name asc' }
      );

      return {
        content: [{ type: 'text', text: JSON.stringify(partners, null, 2) }],
      };
    }
  );

  server.tool(
    'odoo_fields_get',
    'List all fields of an Odoo model with their types and labels — useful for exploring what data is available',
    {
      model: z.string().describe('Odoo model name, e.g. "crm.lead"'),
    },
    async ({ model }) => {
      const fields = await client.fieldsGet(model, [
        'string',
        'type',
        'required',
        'readonly',
        'relation',
      ]);
      return {
        content: [{ type: 'text', text: JSON.stringify(fields, null, 2) }],
      };
    }
  );

  server.tool(
    'odoo_write',
    'Update one or more Odoo records by ID. Works on any model. Use odoo_fields_get to discover writable fields.',
    {
      model: z.string().describe('Odoo model name, e.g. "hr.employee", "res.partner"'),
      ids: z.array(z.number()).describe('Record IDs to update'),
      values: z.record(z.any()).describe('Field values to set, e.g. {"name": "John Doe"}'),
    },
    async ({ model, ids, values }) => {
      const ok = await client.write(
        model,
        ids,
        values as Record<string, import('../odoo-client.js').OdooValue>
      );
      return {
        content: [
          {
            type: 'text',
            text: ok
              ? `Updated ${ids.length} record(s) in ${model}.`
              : 'Write returned false — check field values.',
          },
        ],
      };
    }
  );

  server.tool(
    'odoo_create',
    'Create a new record in any Odoo model. Use odoo_fields_get to discover required fields.',
    {
      model: z.string().describe('Odoo model name, e.g. "hr.employee", "crm.lead"'),
      values: z.record(z.any()).describe('Field values for the new record'),
    },
    async ({ model, values }) => {
      const id = await client.create(
        model,
        values as Record<string, import('../odoo-client.js').OdooValue>
      );
      return {
        content: [{ type: 'text', text: `Created record with ID ${id} in ${model}.` }],
      };
    }
  );
}
