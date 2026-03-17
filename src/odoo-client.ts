import type { Config } from './config.js';

export type OdooValue =
  | string
  | number
  | boolean
  | null
  | OdooValue[]
  | { [key: string]: OdooValue };

export type OdooDomain = Array<
  [string, string, OdooValue] | '&' | '|' | '!'
>;

export interface OdooRecord {
  id: number;
  [key: string]: OdooValue;
}

export class OdooClient {
  private url: string;
  private db: string;
  private username: string;
  private password: string;
  private timeoutMs: number;
  private uid: number | null = null;

  constructor(config: Config) {
    this.url = config.url.replace(/\/$/, '');
    this.db = config.db;
    this.username = config.username;
    this.password = config.password;
    this.timeoutMs = config.timeoutMs;
  }

  private async jsonRpc(
    endpoint: string,
    method: string,
    params: Record<string, OdooValue>
  ): Promise<OdooValue> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const body = JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      id: Math.floor(Math.random() * 1_000_000),
      params: { service: endpoint, method, args: params['args'] ?? [], ...params },
    });

    let response: Response;
    try {
      response = await fetch(`${this.url}/web/dataset/call_kw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const json = (await response.json()) as {
      result?: OdooValue;
      error?: { message: string; data?: { message?: string } };
    };

    if (json.error) {
      const detail = json.error.data?.message ?? json.error.message;
      throw new Error(`Odoo error: ${detail}`);
    }

    return json.result as OdooValue;
  }

  private async rpc(
    endpoint: string,
    method: string,
    args: OdooValue[]
  ): Promise<OdooValue> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const body = JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      id: Math.floor(Math.random() * 1_000_000),
      params: { service: endpoint, method, args },
    });

    let response: Response;
    try {
      response = await fetch(`${this.url}/jsonrpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const json = (await response.json()) as {
      result?: OdooValue;
      error?: { message: string; data?: { message?: string } };
    };

    if (json.error) {
      const detail = json.error.data?.message ?? json.error.message;
      throw new Error(`Odoo error: ${detail}`);
    }

    return json.result as OdooValue;
  }

  async initialize(): Promise<void> {
    const uid = await this.rpc('common', 'authenticate', [
      this.db,
      this.username,
      this.password,
      {},
    ]);

    if (!uid || typeof uid !== 'number') {
      throw new Error('Authentication failed — check username/password');
    }

    this.uid = uid;
  }

  async searchRead(
    model: string,
    domain: OdooDomain,
    fields: string[],
    opts: { limit?: number; offset?: number; order?: string } = {}
  ): Promise<OdooRecord[]> {
    if (!this.uid) throw new Error('Not authenticated');

    const result = await this.rpc('object', 'execute_kw', [
      this.db,
      this.uid,
      this.password,
      model,
      'search_read',
      [domain],
      {
        fields,
        limit: opts.limit ?? 80,
        offset: opts.offset ?? 0,
        ...(opts.order ? { order: opts.order } : {}),
      },
    ]);

    return result as OdooRecord[];
  }

  async read(
    model: string,
    ids: number[],
    fields: string[]
  ): Promise<OdooRecord[]> {
    if (!this.uid) throw new Error('Not authenticated');

    const result = await this.rpc('object', 'execute_kw', [
      this.db,
      this.uid,
      this.password,
      model,
      'read',
      [ids],
      { fields },
    ]);

    return result as OdooRecord[];
  }

  async searchCount(model: string, domain: OdooDomain): Promise<number> {
    if (!this.uid) throw new Error('Not authenticated');

    const result = await this.rpc('object', 'execute_kw', [
      this.db,
      this.uid,
      this.password,
      model,
      'search_count',
      [domain],
    ]);

    return result as number;
  }

  async create(
    model: string,
    values: Record<string, OdooValue>
  ): Promise<number> {
    if (!this.uid) throw new Error('Not authenticated');

    const result = await this.rpc('object', 'execute_kw', [
      this.db,
      this.uid,
      this.password,
      model,
      'create',
      [values],
    ]);

    return result as number;
  }

  async write(
    model: string,
    ids: number[],
    values: Record<string, OdooValue>
  ): Promise<boolean> {
    if (!this.uid) throw new Error('Not authenticated');

    const result = await this.rpc('object', 'execute_kw', [
      this.db,
      this.uid,
      this.password,
      model,
      'write',
      [ids, values],
    ]);

    return result as boolean;
  }

  async callMethod(
    model: string,
    method: string,
    ids: number[],
    kwargs: Record<string, OdooValue> = {}
  ): Promise<OdooValue> {
    if (!this.uid) throw new Error('Not authenticated');

    const result = await this.rpc('object', 'execute_kw', [
      this.db,
      this.uid,
      this.password,
      model,
      method,
      [ids],
      kwargs,
    ]);

    return result;
  }

  async fieldsGet(
    model: string,
    attributes: string[] = ['string', 'type', 'required']
  ): Promise<Record<string, OdooValue>> {
    if (!this.uid) throw new Error('Not authenticated');

    const result = await this.rpc('object', 'execute_kw', [
      this.db,
      this.uid,
      this.password,
      model,
      'fields_get',
      [],
      { attributes },
    ]);

    return result as Record<string, OdooValue>;
  }
}
