import { test } from 'node:test';
import assert from 'node:assert/strict';
import { examplePlan } from '../shared/example.ts';
import { emptyPlan, Plan } from '../shared/schema.ts';
import { generateSpec, generateRules, lintPlan, buildExport, exportAll, mergeAgents, mergeClaude, agentsBlock } from '../shared/spec.ts';
import { defaultPlaybook } from '../shared/playbook.ts';
const exportFiles = (p: Plan) => exportAll(p, defaultPlaybook());

test('example plan is valid and has no gaps', () => {
  const p = examplePlan();
  assert.deepEqual(lintPlan(p), []);
  assert.equal(Plan.safeParse(JSON.parse(exportFiles(p)['plan/plan.json'])).success, true);
});

test('spec covers screens, navigation, data and architecture', () => {
  const spec = generateSpec(examplePlan());
  for (const s of ['## Screens', '### Class detail', '`/classes/:id`', 'tap a class', 'flowchart LR', 'erDiagram',
    'User ||--o{ Booking', '| status | enum | yes |', 'one-to-many', '## Architecture', 'webhook: payment succeeded', 'None flagged.', '- **AC-5** Given two members', '## Acceptance criteria index', '| AC-8 | Manage classes |']) {
    assert.ok(spec.includes(s), `missing: ${s}`);
  }
});

test('mermaid labels are sanitised', () => {
  const p = emptyPlan('X');
  p.nodes.push(
    { id: 'a', kind: 'screen', name: 'Home "main" [v2]', notes: '', criteria: [], position: { x: 0, y: 0 }, route: '', roles: [], components: ['x'] },
    { id: 'b', kind: 'screen', name: 'Detail', notes: '', criteria: [], position: { x: 0, y: 0 }, route: '', roles: [], components: ['y'] },
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
    { id: 'a', kind: 'screen', name: 'A', notes: '', criteria: [], position: { x: 0, y: 0 }, route: '', roles: ['Ghost'], components: ['', ' '] },
    { id: 'b', kind: 'screen', name: 'B', notes: 'n', criteria: [], position: { x: 0, y: 0 }, route: '', roles: [], components: [] },
    { id: 'u', kind: 'entity', name: 'U', notes: '', criteria: [], position: { x: 0, y: 0 }, fields: [{ name: 's', type: 'enum', required: true, notes: '' }] },
    { id: 'v', kind: 'entity', name: 'V', notes: '', criteria: [], position: { x: 0, y: 0 }, fields: [] },
  );
  p.edges.push({ id: 'r', kind: 'relation', source: 'u', target: 'v', label: '' });
  const g = lintPlan(p).join('\n');
  for (const s of ['no summary', 'Screen "A": no components', 'Screen "B": no acceptance criteria', 'role "Ghost"', 'not connected', 'U.s": enum', 'Entity "V": no fields', 'no cardinality']) {
    assert.ok(g.includes(s), `missing gap: ${s}\n${g}`);
  }
});

test('JSON schema export describes fields', () => {
  const schema = exportFiles(emptyPlan('X'))['plan/plan.schema.json'];
  assert.ok(schema.includes('Free text: purpose, business rules'));
  assert.ok(schema.includes('"navigates"'));
});

test('RULES.md combines playbook, app rules and definition of done', () => {
  const p = { ...examplePlan(), extraRules: 'Use Postgres row-level security' };
  const rules = generateRules(p, defaultPlaybook());
  for (const s of ['## Testing & quality', 'whose name contains its id', '## Patterns', '## Workflow', '## Skills & tools',
    '`verify` — Run before', '## Rules for this app', '- Use Postgres row-level security', '## Definition of done']) {
    assert.ok(rules.includes(s), `missing: ${s}`);
  }
  assert.ok(generateRules(p, null).includes('No playbook selected'));
});

test('export writes skills with valid frontmatter and skips bad names', () => {
  const pb = defaultPlaybook();
  pb.skills.push({ name: 'Bad Name', description: 'x', body: 'y' });
  const { files } = buildExport(examplePlan(), pb);
  assert.ok(files['.claude/skills/verify/SKILL.md'].startsWith('---\nname: verify\ndescription: "Run before'));
  assert.ok(files['.claude/skills/plan-sync/SKILL.md']);
  assert.equal(Object.keys(files).filter((f) => f.includes('Bad')).length, 0);
  assert.ok(files['plan/RULES.md'] && files['plan/SPEC.md'] && files['plan/plan.json']);
});

test('AGENTS.md: planner block is created, replaced in place, and keeps team notes', () => {
  const p = examplePlan();
  const b1 = agentsBlock(p, defaultPlaybook());
  const fresh = mergeAgents(null, b1);
  assert.equal(fresh, b1);
  const withNotes = `${fresh}\n## Team notes\nUse pnpm.\n`;
  const b2 = agentsBlock({ ...p, name: 'Renamed' }, defaultPlaybook());
  const merged = mergeAgents(withNotes, b2);
  assert.ok(merged.includes('# Building Renamed') && !merged.includes('# Building Example'));
  assert.ok(merged.includes('Use pnpm.'));
  assert.equal(merged.match(/app-plan:start/g)!.length, 1);
  assert.ok(mergeAgents('# Existing\n', b1).endsWith('# Existing\n'));
});

test('CLAUDE.md imports AGENTS.md exactly once', () => {
  assert.equal(mergeClaude(null), '@AGENTS.md\n');
  assert.equal(mergeClaude('@AGENTS.md\n\nmore'), '@AGENTS.md\n\nmore');
  assert.equal(mergeClaude('# mine\n'), '@AGENTS.md\n\n# mine\n');
});
