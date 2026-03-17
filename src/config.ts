import { z } from 'zod';

export const SERVER_NAME = 'odoo-mcp';
export const SERVER_VERSION = '0.1.0';

const ConfigSchema = z.object({
  url: z.string().url(),
  db: z.string(),
  username: z.string().email(),
  password: z.string(),
  timeoutMs: z.coerce.number().default(30000),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  return ConfigSchema.parse({
    url: process.env.ODOO_URL,
    db: process.env.ODOO_DB,
    username: process.env.ODOO_USERNAME,
    password: process.env.ODOO_PASSWORD,
    timeoutMs: process.env.ODOO_TIMEOUT_MS,
  });
}
