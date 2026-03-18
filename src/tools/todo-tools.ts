import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { OdooClient, OdooDomain, OdooValue } from '../odoo-client.js';

// In Odoo 16+, personal to-dos are project.task with project_id = False
const TODO_MODEL = 'project.task';

const TODO_FIELDS = [
  'id',
  'name',
  'description',
  'date_deadline',
  'priority',
  'state',
  'active',
  'user_ids',
  'tag_ids',
  'create_date',
  'write_date',
  'date_last_stage_update',
];

function todoDomain(extra: OdooDomain = []): OdooDomain {
  return [['project_id', '=', false], ...extra];
}

export function registerTodoTools(server: McpServer, client: OdooClient): void {
  server.tool(
    'odoo_todo_list',
    'List personal to-do tasks (no project assigned)',
    {
      state: z
        .enum(['open', 'done'])
        .optional()
        .describe('"open" for pending, "done" for completed'),
      priority: z.enum(['0', '1']).optional().describe('"1" = starred/high priority, "0" = normal'),
      limit: z.number().optional().default(20),
      offset: z.number().optional().default(0),
    },
    async ({ state, priority, limit, offset }) => {
      const domain = todoDomain([['active', '=', true]]);
      if (state) domain.push(['state', '=', state]);
      if (priority) domain.push(['priority', '=', priority]);

      const todos = await client.searchRead(TODO_MODEL, domain, TODO_FIELDS, {
        limit,
        offset,
        order: 'priority desc, date_deadline asc, create_date desc',
      });

      return { content: [{ type: 'text', text: JSON.stringify(todos, null, 2) }] };
    }
  );

  server.tool(
    'odoo_todo_get',
    'Get full details of a to-do task by ID',
    {
      id: z.number().describe('To-do task ID'),
    },
    async ({ id }) => {
      const records = await client.read(TODO_MODEL, [id], TODO_FIELDS);
      if (!records.length) throw new Error(`To-do ${id} not found`);
      return { content: [{ type: 'text', text: JSON.stringify(records[0], null, 2) }] };
    }
  );

  server.tool(
    'odoo_todo_create',
    'Create a new personal to-do task',
    {
      name: z.string().describe('Task title'),
      description: z.string().optional().describe('Notes or details (HTML supported)'),
      date_deadline: z.string().optional().describe('Due date in YYYY-MM-DD format'),
      priority: z.enum(['0', '1']).optional().default('0').describe('"1" = starred, "0" = normal'),
      user_ids: z.array(z.number()).optional().describe('User IDs to assign this to-do to'),
    },
    async ({ name, description, date_deadline, priority, user_ids }) => {
      const values: Record<string, OdooValue> = {
        name,
        project_id: false,
        priority: priority ?? '0',
      };
      if (description) values['description'] = description;
      if (date_deadline) values['date_deadline'] = date_deadline;
      if (user_ids) values['user_ids'] = [[6, 0, user_ids]];

      const id = await client.create(TODO_MODEL, values);
      return { content: [{ type: 'text', text: `Created to-do with ID ${id}` }] };
    }
  );

  server.tool(
    'odoo_todo_update',
    'Update an existing to-do task',
    {
      id: z.number().describe('To-do task ID'),
      name: z.string().optional().describe('New title'),
      description: z.string().optional().describe('New notes/details'),
      date_deadline: z.string().optional().describe('New due date in YYYY-MM-DD format'),
      priority: z.enum(['0', '1']).optional().describe('"1" = starred, "0" = normal'),
      user_ids: z
        .array(z.number())
        .optional()
        .describe('Replace assigned users with these user IDs'),
    },
    async ({ id, name, description, date_deadline, priority, user_ids }) => {
      const values: Record<string, OdooValue> = {};
      if (name !== undefined) values['name'] = name;
      if (description !== undefined) values['description'] = description;
      if (date_deadline !== undefined) values['date_deadline'] = date_deadline;
      if (priority !== undefined) values['priority'] = priority;
      if (user_ids !== undefined) values['user_ids'] = [[6, 0, user_ids]];

      if (!Object.keys(values).length) throw new Error('No fields provided to update');

      await client.write(TODO_MODEL, [id], values);
      return { content: [{ type: 'text', text: `Updated to-do ${id}` }] };
    }
  );

  server.tool(
    'odoo_todo_mark_done',
    'Mark a to-do task as done or reopen it',
    {
      id: z.number().describe('To-do task ID'),
      done: z.boolean().default(true).describe('true = mark done, false = reopen'),
    },
    async ({ id, done }) => {
      await client.write(TODO_MODEL, [id], { state: done ? 'done' : 'open' });
      return {
        content: [{ type: 'text', text: `To-do ${id} marked as ${done ? 'done' : 'open'}` }],
      };
    }
  );
}
