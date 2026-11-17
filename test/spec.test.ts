import { test } from 'node:test';
import assert from 'node:assert/strict';
import { examplePlan } from '../shared/example.ts';
import { emptyPlan, Plan } from '../shared/schema.ts';
import { generateSpec, lintPlan, exportFiles } from '../shared/spec.ts';

test('example plan is valid and has no gaps', () => {
  const p = examplePlan();
  assert.deepEqual(lintPlan(p), []);
  assert.equal(Plan.safeParse(JSON.parse(exportFiles(p)['plan/plan.json'])).success, true);
});

test('spec covers screens, navigation, data and architecture', () => {
  const spec = generateSpec(examplePlan());
  for (const s of ['## Screens', '### Class detail', '`/classes/:id`', 'tap a class', 'flowchart LR', 'erDiagram',
    'User ||--o{ Booking', '| status | enum | yes |', 'one-to-many', '## Architecture', 'webhook: payment succeeded', 'None flagged.']) {
    assert.ok(spec.includes(s), `missing: ${s}`);
  }
});

test('mermaid labels are sanitised', () => {
  const p = emptyPlan('X');
  p.nodes.push(
    { id: 'a', kind: 'screen', name: 'Home "main" [v2]', notes: '', position: { x: 0, y: 0 }, route: '', roles: [], components: ['x'] },
    { id: 'b', kind: 'screen', name: 'Detail', notes: '', position: { x: 0, y: 0 }, route: '', roles: [], components: ['y'] },
  );
  p.edges.push({ id: 'e', kind: 'navigates', source: 'a', target: 'b', label: 'tap (row)' });
  const spec = generateSpec(p);
  assert.ok(spec.includes('s0["Home main v2 "]') || spec.includes('s0["Home main v2"]'), spec);
  assert.ok(spec.includes('|"tap row"|'));
});

test('lint flags the things a builder would guess about', () => {
  const p = emptyPlan('X');
  p.roles.push({ name: 'Admin', description: '' });
  p.nodes.push(
    { id: 'a', kind: 'screen', name: 'A', notes: '', position: { x: 0, y: 0 }, route: '', roles: ['Ghost'], components: ['', ' '] },
    { id: 'b', kind: 'screen', name: 'B', notes: 'n', position: { x: 0, y: 0 }, route: '', roles: [], components: [] },
    { id: 'u', kind: 'entity', name: 'U', notes: '', position: { x: 0, y: 0 }, fields: [{ name: 's', type: 'enum', required: true, notes: '' }] },
    { id: 'v', kind: 'entity', name: 'V', notes: '', position: { x: 0, y: 0 }, fields: [] },
  );
  p.edges.push({ id: 'r', kind: 'relation', source: 'u', target: 'v', label: '' });
  const g = lintPlan(p).join('\n');
  for (const s of ['no summary', 'Screen "A": no components', 'role "Ghost"', 'not connected', 'U.s": enum', 'Entity "V": no fields', 'no cardinality']) {
    assert.ok(g.includes(s), `missing gap: ${s}\n${g}`);
  }
});

test('JSON schema export describes fields', () => {
  const schema = exportFiles(emptyPlan('X'))['plan/plan.schema.json'];
  assert.ok(schema.includes('Free text: purpose, business rules'));
  assert.ok(schema.includes('"navigates"'));
});
