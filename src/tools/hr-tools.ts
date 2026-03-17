import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { OdooClient, OdooDomain } from '../odoo-client.js';

const EMPLOYEE_FIELDS = [
  'id', 'name', 'job_id', 'job_title', 'department_id',
  'parent_id', 'coach_id', 'work_email', 'work_phone', 'mobile_phone',
  'active', 'company_id', 'resource_calendar_id',
  'gender', 'birthday', 'country_id', 'marital',
  'create_date', 'write_date',
];

const LEAVE_FIELDS = [
  'id', 'name', 'employee_id', 'holiday_status_id',
  'state', 'date_from', 'date_to', 'number_of_days',
  'description', 'user_id', 'department_id',
];

export function registerHrTools(server: McpServer, client: OdooClient): void {
  server.tool(
    'odoo_hr_list_employees',
    'List employees with optional filters',
    {
      department: z.string().optional().describe('Filter by department name (partial match)'),
      active: z.boolean().optional().default(true).describe('true = active employees only'),
      limit: z.number().optional().default(50),
    },
    async ({ department, active, limit }) => {
      const domain: OdooDomain = [['active', '=', active ?? true]];
      if (department) domain.push(['department_id.name', 'ilike', department]);

      const employees = await client.searchRead('hr.employee', domain, EMPLOYEE_FIELDS, {
        limit,
        order: 'name asc',
      });

      return {
        content: [{ type: 'text', text: JSON.stringify(employees, null, 2) }],
      };
    }
  );

  server.tool(
    'odoo_hr_get_employee',
    'Get full details of an employee by ID',
    {
      id: z.number().describe('Employee ID'),
    },
    async ({ id }) => {
      const employees = await client.read('hr.employee', [id], EMPLOYEE_FIELDS);
      if (!employees.length) throw new Error(`Employee ${id} not found`);
      return {
        content: [{ type: 'text', text: JSON.stringify(employees[0], null, 2) }],
      };
    }
  );

  server.tool(
    'odoo_hr_search_employees',
    'Search employees by name, email, or job title',
    {
      query: z.string().describe('Search keyword'),
    },
    async ({ query }) => {
      const domain: OdooDomain = [
        '|', '|',
        ['name', 'ilike', query],
        ['work_email', 'ilike', query],
        ['job_title', 'ilike', query],
      ];

      const employees = await client.searchRead('hr.employee', domain, EMPLOYEE_FIELDS, {
        limit: 20,
        order: 'name asc',
      });

      return {
        content: [{ type: 'text', text: JSON.stringify(employees, null, 2) }],
      };
    }
  );

  server.tool(
    'odoo_hr_list_leaves',
    'List leave/time-off requests',
    {
      employee: z.string().optional().describe('Filter by employee name (partial match)'),
      state: z.enum(['draft', 'confirm', 'refuse', 'validate1', 'validate']).optional()
        .describe('draft=to submit, confirm=pending, validate=approved, refuse=refused'),
      date_from: z.string().optional().describe('Filter leaves from this date (YYYY-MM-DD)'),
      date_to: z.string().optional().describe('Filter leaves to this date (YYYY-MM-DD)'),
      limit: z.number().optional().default(20),
    },
    async ({ employee, state, date_from, date_to, limit }) => {
      const domain: OdooDomain = [];
      if (employee) domain.push(['employee_id.name', 'ilike', employee]);
      if (state) domain.push(['state', '=', state]);
      if (date_from) domain.push(['date_from', '>=', date_from]);
      if (date_to) domain.push(['date_to', '<=', date_to]);

      const leaves = await client.searchRead('hr.leave', domain, LEAVE_FIELDS, {
        limit,
        order: 'date_from desc',
      });

      return {
        content: [{ type: 'text', text: JSON.stringify(leaves, null, 2) }],
      };
    }
  );

  server.tool(
    'odoo_hr_leave_allocation_summary',
    'Get leave allocation summary for employees (remaining days per leave type)',
    {
      employee: z.string().optional().describe('Filter by employee name (partial match)'),
    },
    async ({ employee }) => {
      const domain: OdooDomain = [['state', '=', 'validate']];
      if (employee) domain.push(['employee_id.name', 'ilike', employee]);

      const allocations = await client.searchRead(
        'hr.leave.allocation',
        domain,
        ['id', 'employee_id', 'holiday_status_id', 'number_of_days',
         'number_of_days_display', 'remaining_leaves', 'state', 'date_from', 'date_to'],
        { limit: 100, order: 'employee_id asc' }
      );

      return {
        content: [{ type: 'text', text: JSON.stringify(allocations, null, 2) }],
      };
    }
  );

  server.tool(
    'odoo_hr_list_departments',
    'List all departments',
    {},
    async () => {
      const departments = await client.searchRead(
        'hr.department',
        [['active', '=', true]],
        ['id', 'name', 'parent_id', 'manager_id', 'member_ids'],
        { order: 'name asc', limit: 100 }
      );

      return {
        content: [{ type: 'text', text: JSON.stringify(departments, null, 2) }],
      };
    }
  );
}
