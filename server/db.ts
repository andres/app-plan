import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Plan, emptyPlan } from '../shared/schema.ts';

export type PlanRow = { id: string; name: string; rev: number; updatedAt: string };

export function openDb(file: string) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      data TEXT NOT NULL,
      rev INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );
  `);

  const now = () => new Date().toISOString();

  return {
    list(): PlanRow[] {
      return db
        .prepare('SELECT id, name, rev, updated_at AS updatedAt FROM plans ORDER BY updated_at DESC')
        .all() as PlanRow[];
    },
    get(id: string): (PlanRow & { plan: Plan }) | undefined {
      const r = db.prepare('SELECT id, name, rev, updated_at AS updatedAt, data FROM plans WHERE id = ?').get(id) as
        | (PlanRow & { data: string })
        | undefined;
      if (!r) return undefined;
      const { data, ...row } = r;
      return { ...row, plan: Plan.parse(JSON.parse(data)) };
    },
    create(name: string, plan?: Plan): PlanRow {
      const id = randomUUID();
      const p = plan ? { ...plan, name } : emptyPlan(name);
      const t = now();
      db.prepare('INSERT INTO plans (id, name, data, rev, updated_at) VALUES (?, ?, ?, 1, ?)').run(id, name, JSON.stringify(p), t);
      return { id, name, rev: 1, updatedAt: t };
    },
    /** Optimistic concurrency: only saves if the caller saw the latest rev. Returns the new rev, or null on conflict. */
    save(id: string, baseRev: number, plan: Plan): number | null {
      const res = db
        .prepare('UPDATE plans SET name = ?, data = ?, rev = rev + 1, updated_at = ? WHERE id = ? AND rev = ?')
        .run(plan.name, JSON.stringify(plan), now(), id, baseRev);
      return res.changes ? baseRev + 1 : null;
    },
    remove(id: string): boolean {
      return db.prepare('DELETE FROM plans WHERE id = ?').run(id).changes > 0;
    },
  };
}

export type Db = ReturnType<typeof openDb>;
