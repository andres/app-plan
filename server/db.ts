import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import { Plan, Playbook, emptyPlan } from '../shared/schema.ts';
import { defaultPlaybook } from '../shared/playbook.ts';

export type Row = { id: string; name: string; rev: number; updatedAt: string };
export type DocTable<D> = {
  list(): Row[];
  get(id: string): (Row & { doc: D }) | undefined;
  save(id: string, baseRev: number, doc: D): number | null;
  remove(id: string): boolean;
};

/** A table of JSON documents with optimistic-concurrency revisions. */
function docTable<S extends z.ZodType<{ name: string }>>(db: DatabaseSync, table: string, schema: S) {
  type Doc = z.infer<S>;
  db.exec(`CREATE TABLE IF NOT EXISTS ${table} (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, data TEXT NOT NULL,
    rev INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL)`);
  const now = () => new Date().toISOString();
  return {
    list(): Row[] {
      return db.prepare(`SELECT id, name, rev, updated_at AS updatedAt FROM ${table} ORDER BY updated_at DESC`).all() as Row[];
    },
    get(id: string): (Row & { doc: Doc }) | undefined {
      const r = db.prepare(`SELECT id, name, rev, updated_at AS updatedAt, data FROM ${table} WHERE id = ?`).get(id) as
        | (Row & { data: string })
        | undefined;
      if (!r) return undefined;
      const { data, ...row } = r;
      return { ...row, doc: schema.parse(JSON.parse(data)) as Doc };
    },
    create(doc: Doc): Row {
      const id = randomUUID();
      const t = now();
      db.prepare(`INSERT INTO ${table} (id, name, data, rev, updated_at) VALUES (?, ?, ?, 1, ?)`).run(id, doc.name, JSON.stringify(doc), t);
      return { id, name: doc.name, rev: 1, updatedAt: t };
    },
    /** Only saves if the caller saw the latest rev. Returns the new rev, or null on conflict. */
    save(id: string, baseRev: number, doc: Doc): number | null {
      const res = db
        .prepare(`UPDATE ${table} SET name = ?, data = ?, rev = rev + 1, updated_at = ? WHERE id = ? AND rev = ?`)
        .run(doc.name, JSON.stringify(doc), now(), id, baseRev);
      return res.changes ? baseRev + 1 : null;
    },
    remove(id: string): boolean {
      return db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id).changes > 0;
    },
  };
}

export function openDb(file: string) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  const plans = docTable(db, 'plans', Plan);
  const playbooks = docTable(db, 'playbooks', Playbook);
  if (!playbooks.list().length) {
    // First run with playbooks: seed the default and give it to plans that predate playbooks.
    const { id } = playbooks.create(defaultPlaybook());
    for (const row of plans.list()) {
      const p = plans.get(row.id)!;
      if (!p.doc.playbookId) plans.save(row.id, p.rev, { ...p.doc, playbookId: id });
    }
  }

  return {
    plans,
    playbooks,
    /** New plans start with the oldest playbook (the seeded "Default", unless deleted). */
    newPlan(name: string, plan?: Plan): Row {
      const p = plan ? { ...plan, name } : emptyPlan(name);
      if (!p.playbookId || !playbooks.get(p.playbookId)) p.playbookId = playbooks.list().at(-1)?.id ?? '';
      return plans.create(p);
    },
  };
}

export type Db = ReturnType<typeof openDb>;
