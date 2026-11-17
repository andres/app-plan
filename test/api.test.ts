import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/index.ts';
import { openDb } from '../server/db.ts';
import { examplePlan } from '../shared/example.ts';

const setup = (password?: string) => createApp(openDb(':memory:'), { password });
const json = (method: string, body?: unknown, cookie?: string) => ({
  method,
  headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body),
});

test('login gate', async () => {
  const app = setup('s3cret');
  assert.equal((await app.request('/api/plans')).status, 401);
  assert.equal((await (await app.request('/api/config')).json()).authed, false);
  assert.equal((await app.request('/api/login', json('POST', { password: 'nope' }))).status, 401);
  const ok = await app.request('/api/login', json('POST', { password: 's3cret' }));
  assert.equal(ok.status, 200);
  const cookie = ok.headers.get('set-cookie')!.split(';')[0];
  assert.equal((await app.request('/api/plans', { headers: { cookie } })).status, 200);
  assert.equal((await app.request('/api/plans', { headers: { cookie: cookie.replace(/.$/, 'x') } })).status, 401);
});

test('create, save with revisions, conflict, delete', async () => {
  const app = setup();
  const created = await (await app.request('/api/plans', json('POST', { name: 'Shop' }))).json();
  assert.equal(created.rev, 1);
  const got = await (await app.request(`/api/plans/${created.id}`)).json();
  assert.equal(got.plan.name, 'Shop');

  const plan = { ...examplePlan(), name: 'Shop v2' };
  const s1 = await app.request(`/api/plans/${created.id}`, json('PUT', { rev: 1, plan }));
  assert.deepEqual(await s1.json(), { rev: 2 });
  const stale = await app.request(`/api/plans/${created.id}`, json('PUT', { rev: 1, plan }));
  assert.equal(stale.status, 409);
  const bad = await app.request(`/api/plans/${created.id}`, json('PUT', { rev: 2, plan: { nodes: 'x' } }));
  assert.equal(bad.status, 400);

  const list = await (await app.request('/api/plans')).json();
  assert.equal(list[0].name, 'Shop v2');
  assert.equal((await app.request(`/api/plans/${created.id}`, json('DELETE'))).status, 200);
  assert.equal((await app.request(`/api/plans/${created.id}`)).status, 404);
});

test('push without GitHub configured explains why', async () => {
  const app = setup();
  const { id } = await (await app.request('/api/plans', json('POST', { name: 'A' }))).json();
  const r = await app.request(`/api/plans/${id}/push`, json('POST', { repo: 'me/a' }));
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /GITHUB_TOKEN/);
});
