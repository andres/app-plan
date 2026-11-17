import type { Plan } from '../shared/schema.ts';

export type PlanRow = { id: string; name: string; rev: number; updatedAt: string };
export type Config = { authRequired: boolean; authed: boolean; github: boolean; githubOwner: string };

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  config: () => call<Config>('GET', '/config'),
  login: (password: string) => call<{ ok: true }>('POST', '/login', { password }),
  logout: () => call<{ ok: true }>('POST', '/logout'),
  list: () => call<PlanRow[]>('GET', '/plans'),
  create: (name: string, plan?: Plan) => call<PlanRow>('POST', '/plans', { name, plan }),
  get: (id: string) => call<PlanRow & { plan: Plan }>('GET', `/plans/${id}`),
  save: (id: string, rev: number, plan: Plan) => call<{ rev: number }>('PUT', `/plans/${id}`, { rev, plan }),
  remove: (id: string) => call<{ ok: true }>('DELETE', `/plans/${id}`),
  push: (id: string, repo: string) => call<{ url: string; commit: string; created: boolean }>('POST', `/plans/${id}/push`, { repo }),
};
