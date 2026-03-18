import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { OdooClient, OdooDomain } from '../odoo-client.js';

const CRM_LEAD_FIELDS = [
  'id',
  'name',
  'partner_id',
  'stage_id',
  'user_id',
  'team_id',
  'probability',
  'expected_revenue',
  'planned_revenue',
  'priority',
  'tag_ids',
  'description',
  'date_deadline',
  'date_closed',
  'active',
  'email_from',
  'phone',
  'mobile',
  'company_id',
  'create_date',
  'write_date',
];

export function registerCrmTools(server: McpServer, client: OdooClient): void {
  server.tool(
    'odoo_crm_list_leads',
    'List CRM leads/opportunities with optional filters',
    {
      stage: z.string().optional().describe('Filter by stage name (partial match)'),
      assigned_to: z.string().optional().describe('Filter by salesperson name (partial match)'),
      active: z.boolean().optional().default(true).describe('true = active, false = lost/archived'),
      limit: z.number().optional().default(20).describe('Max records to return (default 20)'),
      offset: z.number().optional().default(0),
    },
    async ({ stage, assigned_to, active, limit, offset }) => {
      const domain: OdooDomain = [['active', '=', active ?? true]];

      if (stage) {
        domain.push(['stage_id.name', 'ilike', stage]);
      }
      if (assigned_to) {
        domain.push(['user_id.name', 'ilike', assigned_to]);
      }

      const leads = await client.searchRead('crm.lead', domain, CRM_LEAD_FIELDS, {
        limit,
        offset,
        order: 'write_date desc',
      });

      return {
        content: [{ type: 'text', text: JSON.stringify(leads, null, 2) }],
      };
    }
  );

  server.tool(
    'odoo_crm_get_lead',
    'Get full details of a CRM lead/opportunity by ID',
    {
      id: z.number().describe('Lead/opportunity ID'),
    },
    async ({ id }) => {
      const leads = await client.read('crm.lead', [id], CRM_LEAD_FIELDS);
      if (!leads.length) throw new Error(`Lead ${id} not found`);
      return {
        content: [{ type: 'text', text: JSON.stringify(leads[0], null, 2) }],
      };
    }
  );

  server.tool(
    'odoo_crm_search_leads',
    'Search CRM leads/opportunities by keyword (searches name, partner, email)',
    {
      query: z.string().describe('Search keyword'),
      limit: z.number().optional().default(20),
    },
    async ({ query, limit }) => {
      const domain: OdooDomain = [
        '|',
        '|',
        ['name', 'ilike', query],
        ['partner_id.name', 'ilike', query],
        ['email_from', 'ilike', query],
      ];

      const leads = await client.searchRead('crm.lead', domain, CRM_LEAD_FIELDS, {
        limit,
        order: 'write_date desc',
      });

      return {
        content: [{ type: 'text', text: JSON.stringify(leads, null, 2) }],
      };
    }
  );

  server.tool(
    'odoo_crm_pipeline_summary',
    'Get a summary of the CRM pipeline grouped by stage',
    {},
    async () => {
      // Get all stages
      const stages = await client.searchRead(
        'crm.stage',
        [],
        ['id', 'name', 'sequence', 'probability'],
        { order: 'sequence asc', limit: 50 }
      );

      // For each stage, get count and total expected revenue
      const summary = await Promise.all(
        stages.map(async (stage) => {
          const count = await client.searchCount('crm.lead', [
            ['stage_id', '=', stage['id'] as number],
            ['active', '=', true],
          ]);

          const leads = await client.searchRead(
            'crm.lead',
            [
              ['stage_id', '=', stage['id'] as number],
              ['active', '=', true],
            ],
            ['expected_revenue'],
            { limit: 500 }
          );

          const totalRevenue = leads.reduce(
            (sum, l) => sum + ((l['expected_revenue'] as number) || 0),
            0
          );

          return {
            stage: stage['name'],
            count,
            total_expected_revenue: totalRevenue,
          };
        })
      );

      return {
        content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
      };
    }
  );

  server.tool(
    'odoo_crm_create_lead',
    'Create a new CRM lead/opportunity',
    {
      name: z.string().describe('Lead title'),
      partner_name: z
        .string()
        .optional()
        .describe('Contact/company name (if not an existing partner)'),
      email: z.string().optional().describe('Contact email'),
      phone: z.string().optional().describe('Contact phone'),
      expected_revenue: z.number().optional().describe('Expected revenue amount'),
      description: z.string().optional().describe('Internal notes/description'),
    },
    async ({ name, partner_name, email, phone, expected_revenue, description }) => {
      const values: Record<string, import('../odoo-client.js').OdooValue> = { name };
      if (partner_name) values['partner_name'] = partner_name;
      if (email) values['email_from'] = email;
      if (phone) values['phone'] = phone;
      if (expected_revenue !== undefined) values['expected_revenue'] = expected_revenue;
      if (description) values['description'] = description;

      const id = await client.create('crm.lead', values);
      return {
        content: [{ type: 'text', text: `Created lead with ID ${id}` }],
      };
    }
  );
}
