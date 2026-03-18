import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { OdooClient, OdooDomain } from '../odoo-client.js';

const PAYSLIP_FIELDS = [
  'id',
  'name',
  'employee_id',
  'department_id',
  'job_id',
  'date_from',
  'date_to',
  'state',
  'net_wage',
  'gross_wage',
  'basic_wage',
  'company_id',
  'struct_id',
  'payslip_run_id',
];

export function registerPayrollTools(server: McpServer, client: OdooClient): void {
  server.tool(
    'odoo_payroll_list_payslips',
    'List payslips with optional filters',
    {
      employee: z.string().optional().describe('Filter by employee name (partial match)'),
      state: z
        .enum(['draft', 'verify', 'done', 'cancel'])
        .optional()
        .describe('draft=draft, verify=waiting, done=paid, cancel=refused'),
      date_from: z.string().optional().describe('Payslip period from (YYYY-MM-DD)'),
      date_to: z.string().optional().describe('Payslip period to (YYYY-MM-DD)'),
      limit: z.number().optional().default(20),
    },
    async ({ employee, state, date_from, date_to, limit }) => {
      const domain: OdooDomain = [];
      if (employee) domain.push(['employee_id.name', 'ilike', employee]);
      if (state) domain.push(['state', '=', state]);
      if (date_from) domain.push(['date_from', '>=', date_from]);
      if (date_to) domain.push(['date_to', '<=', date_to]);

      const payslips = await client.searchRead('hr.payslip', domain, PAYSLIP_FIELDS, {
        limit,
        order: 'date_from desc',
      });

      return {
        content: [{ type: 'text', text: JSON.stringify(payslips, null, 2) }],
      };
    }
  );

  server.tool(
    'odoo_payroll_get_payslip',
    'Get full details of a payslip including salary lines',
    {
      id: z.number().describe('Payslip ID'),
    },
    async ({ id }) => {
      const payslips = await client.read('hr.payslip', [id], [...PAYSLIP_FIELDS, 'line_ids']);
      if (!payslips.length) throw new Error(`Payslip ${id} not found`);

      const payslip = payslips[0];
      const lineIds = payslip['line_ids'] as number[];
      const lines = lineIds?.length
        ? await client.read('hr.payslip.line', lineIds, [
            'id',
            'name',
            'code',
            'category_id',
            'amount',
            'quantity',
            'rate',
            'total',
          ])
        : [];

      return {
        content: [{ type: 'text', text: JSON.stringify({ ...payslip, lines }, null, 2) }],
      };
    }
  );

  server.tool(
    'odoo_payroll_list_batches',
    'List payroll batches (payslip runs)',
    {
      state: z.enum(['draft', 'close']).optional().describe('draft=open, close=closed'),
      limit: z.number().optional().default(10),
    },
    async ({ state, limit }) => {
      const domain: OdooDomain = [];
      if (state) domain.push(['state', '=', state]);

      const batches = await client.searchRead(
        'hr.payslip.run',
        domain,
        ['id', 'name', 'date_start', 'date_end', 'state', 'slip_ids', 'company_id'],
        { limit, order: 'date_start desc' }
      );

      return {
        content: [{ type: 'text', text: JSON.stringify(batches, null, 2) }],
      };
    }
  );

  server.tool(
    'odoo_payroll_salary_summary',
    'Get payroll cost summary for a given period',
    {
      date_from: z.string().describe('Period start (YYYY-MM-DD)'),
      date_to: z.string().describe('Period end (YYYY-MM-DD)'),
    },
    async ({ date_from, date_to }) => {
      const domain: OdooDomain = [
        ['state', '=', 'done'],
        ['date_from', '>=', date_from],
        ['date_to', '<=', date_to],
      ];

      const payslips = await client.searchRead(
        'hr.payslip',
        domain,
        ['employee_id', 'department_id', 'net_wage', 'gross_wage', 'basic_wage'],
        { limit: 1000 }
      );

      const totalNet = payslips.reduce((s, p) => s + ((p['net_wage'] as number) || 0), 0);
      const totalGross = payslips.reduce((s, p) => s + ((p['gross_wage'] as number) || 0), 0);

      // Group by department
      const byDept: Record<string, { count: number; net: number; gross: number }> = {};
      for (const p of payslips) {
        const dept = p['department_id'] as [number, string] | false;
        const deptName = dept ? dept[1] : 'No Department';
        if (!byDept[deptName]) byDept[deptName] = { count: 0, net: 0, gross: 0 };
        byDept[deptName].count++;
        byDept[deptName].net += (p['net_wage'] as number) || 0;
        byDept[deptName].gross += (p['gross_wage'] as number) || 0;
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                period: { date_from, date_to },
                total_employees: payslips.length,
                total_net_wage: totalNet,
                total_gross_wage: totalGross,
                by_department: byDept,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
