import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { getSignedCookie, setSignedCookie, deleteCookie } from 'hono/cookie';
import { bodyLimit } from 'hono/body-limit';
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { openDb, type Db, type DocTable } from './db.ts';
import { pushToGitHub } from './github.ts';
import type { z } from 'zod';
import { Plan, Playbook } from '../shared/schema.ts';
import { buildExport } from '../shared/spec.ts';

export type Config = {
  password?: string; // unset = no login (local dev only)
  githubToken?: string;
  githubOwner?: string; // default owner for new repos
  staticDir?: string;
};

const sha = (s: string) => createHash('sha256').update(s).digest();

export function createApp(db: Db, cfg: Config) {
  const app = new Hono();
  const secret = cfg.password ? sha('app-plan-session:' + cfg.password).toString('hex') : '';
  const COOKIE = 'app_plan_session';

  app.use('/api/*', bodyLimit({ maxSize: 5 * 1024 * 1024 }));

  app.get('/api/config', async (c) => {
    const authed = !cfg.password || (await getSignedCookie(c, secret, COOKIE)) === 'ok';
    return c.json({ authRequired: !!cfg.password, authed, github: !!cfg.githubToken, githubOwner: cfg.githubOwner ?? '' });
  });

  app.post('/api/login', async (c) => {
    if (!cfg.password) return c.json({ ok: true });
    const { password } = await c.req.json<{ password?: string }>().catch(() => ({ password: '' }));
    if (!timingSafeEqual(sha(password ?? ''), sha(cfg.password))) {
      await new Promise((r) => setTimeout(r, 1000)); // slow down guessing
      return c.json({ error: 'Wrong password' }, 401);
    }
    const https = c.req.header('x-forwarded-proto') === 'https' || new URL(c.req.url).protocol === 'https:';
    await setSignedCookie(c, COOKIE, 'ok', secret, {
      httpOnly: true, sameSite: 'Lax', secure: https, path: '/', maxAge: 60 * 60 * 24 * 180,
    });
    return c.json({ ok: true });
  });

  app.post('/api/logout', (c) => {
    deleteCookie(c, COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  app.use('/api/*', async (c, next) => {
    if (cfg.password && (await getSignedCookie(c, secret, COOKIE)) !== 'ok') return c.json({ error: 'Not logged in' }, 401);
    await next();
  });

  // Same CRUD shape for plans and playbooks: GET list, POST create, GET/PUT(rev)/DELETE one.
  const crud = <D extends { name: string }>(path: string, key: string, table: DocTable<D>,
    schema: z.ZodType<D>, create: (name: string, doc?: D) => unknown, label: string) => {
    app.get(`/api/${path}`, (c) => c.json(table.list()));
    app.post(`/api/${path}`, async (c) => {
      const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
      let doc: D | undefined;
      if (body[key] !== undefined) {
        const parsed = schema.safeParse(body[key]);
        if (!parsed.success) return c.json({ error: `Invalid ${key}`, issues: parsed.error.issues }, 400);
        doc = parsed.data;
      }
      const name = (String(body.name ?? '') || doc?.name || '').trim() || label;
      return c.json(create(name, doc), 201);
    });
    app.get(`/api/${path}/:id`, (c) => {
      const row = table.get(c.req.param('id'));
      if (!row) return c.json({ error: 'Not found' }, 404);
      const { doc, ...meta } = row;
      return c.json({ ...meta, [key]: doc });
    });
    app.put(`/api/${path}/:id`, async (c) => {
      const body = await c.req.json<Record<string, unknown>>().catch(() => null);
      if (!body || typeof body.rev !== 'number') return c.json({ error: `Body must be { rev, ${key} }` }, 400);
      const parsed = schema.safeParse(body[key]);
      if (!parsed.success) return c.json({ error: `Invalid ${key}`, issues: parsed.error.issues }, 400);
      const id = c.req.param('id');
      if (!table.get(id)) return c.json({ error: 'Not found' }, 404);
      const rev = table.save(id, body.rev, parsed.data);
      if (rev === null) return c.json({ error: 'This was changed on another device. Reload to get the latest.' }, 409);
      return c.json({ rev });
    });
    app.delete(`/api/${path}/:id`, (c) => (table.remove(c.req.param('id')) ? c.json({ ok: true }) : c.json({ error: 'Not found' }, 404)));
  };
  crud('plans', 'plan', db.plans, Plan, (name, plan) => db.newPlan(name, plan), 'Untitled app');
  crud('playbooks', 'playbook', db.playbooks, Playbook,
    (name, pb) => db.playbooks.create({ ...(pb ?? Playbook.parse({ schemaVersion: 1, name })), name }), 'New playbook');

  app.post('/api/plans/:id/push', async (c) => {
    if (!cfg.githubToken) return c.json({ error: 'GitHub is not configured on the server (GITHUB_TOKEN).' }, 400);
    const row = db.plans.get(c.req.param('id'));
    if (!row) return c.json({ error: 'Not found' }, 404);
    const plan = row.doc;
    const body = await c.req.json<{ repo?: string }>().catch(() => ({}) as { repo?: string });
    const repo = (body.repo ?? plan.repo).trim();
    if (!repo) return c.json({ error: 'Set a repo (owner/name) first.' }, 400);
    const playbook = plan.playbookId ? db.playbooks.get(plan.playbookId)?.doc ?? null : null;
    try {
      const { files, merges } = buildExport(plan, playbook);
      const res = await pushToGitHub({
        token: cfg.githubToken, repo, files, merges,
        message: `Update plan: ${plan.name} (rev ${row.rev})`,
      });
      return c.json(res);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 502);
    }
  });

  app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));

  if (cfg.staticDir && existsSync(cfg.staticDir)) {
    const root = cfg.staticDir;
    app.use('/*', serveStatic({ root }));
    const index = readFileSync(`${root}/index.html`, 'utf8');
    app.get('*', (c) => c.html(index)); // SPA fallback
  }
  return app;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const env = process.env;
  const db = openDb(env.DB_PATH ?? './data/app-plan.db');
  if (!env.APP_PASSWORD) {
    if (env.NODE_ENV === 'production') {
      console.error('APP_PASSWORD must be set in production. Refusing to start.');
      process.exit(1);
    }
    console.warn('WARNING: APP_PASSWORD is not set. Anyone who can reach this server can edit plans.');
  }
  const app = createApp(db, {
    password: env.APP_PASSWORD || undefined,
    githubToken: env.GITHUB_TOKEN || undefined,
    githubOwner: env.GITHUB_OWNER || undefined,
    staticDir: env.STATIC_DIR ?? './dist',
  });
  const port = Number(env.PORT ?? 8787);
  serve({ fetch: app.fetch, port, hostname: env.HOST ?? '0.0.0.0' }, () => console.log(`app-plan listening on :${port}`));
}
