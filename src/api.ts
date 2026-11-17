import type { Plan, Playbook } from '../shared/schema.ts';

export type Row = { id: string; name: string; rev: number; updatedAt: string };
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

/** Same REST shape for plans and playbooks. */
function docs<D>(path: string, key: string) {
  return {
    list: () => call<Row[]>('GET', `/${path}`),
    create: (name: string, doc?: D) => call<Row>('POST', `/${path}`, { name, [key]: doc }),
    get: (id: string) => call<Row & Record<string, D>>('GET', `/${path}/${id}`).then((r) => ({ rev: r.rev, doc: r[key] as D })),
    save: (id: string, rev: number, doc: D) => call<{ rev: number }>('PUT', `/${path}/${id}`, { rev, [key]: doc }),
    remove: (id: string) => call<{ ok: true }>('DELETE', `/${path}/${id}`),
  };
}

export const api = {
  config: () => call<Config>('GET', '/config'),
  login: (password: string) => call<{ ok: true }>('POST', '/login', { password }),
  logout: () => call<{ ok: true }>('POST', '/logout'),
  plans: docs<Plan>('plans', 'plan'),
  playbooks: docs<Playbook>('playbooks', 'playbook'),
  push: (id: string, repo: string) => call<{ url: string; commit: string; created: boolean }>('POST', `/plans/${id}/push`, { repo }),
};
