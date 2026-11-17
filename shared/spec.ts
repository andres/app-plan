import type { Plan, PlanNode, PlanEdge, ScreenNode, EntityNode, ComponentNode, Playbook } from './schema.ts';
import { planJsonSchema } from './schema.ts';

// Turns a plan into the files an LLM coding agent builds from.

const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean);
const bullets = (s: string) => lines(s).map((l) => `- ${l.replace(/^[-*]\s*/, '')}`).join('\n');
const mdCell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n+/g, ' ');
// Mermaid labels: quotes and brackets break the parser.
const mmLabel = (s: string) => s.replace(/["\[\]{}()<>|]/g, ' ').replace(/\s+/g, ' ').trim() || ' ';
const mmIdent = (s: string) => s.replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1') || '_';

function of<K extends PlanNode['kind']>(plan: Plan, kind: K) {
  return plan.nodes.filter((n): n is Extract<PlanNode, { kind: K }> => n.kind === kind);
}

/** Problems that would force the builder to guess. Shown in the editor and written into SPEC.md. */
export function lintPlan(plan: Plan): string[] {
  const out: string[] = [];
  const byId = new Map(plan.nodes.map((n) => [n.id, n]));
  const roleNames = new Set(plan.roles.map((r) => r.name));
  const screens = of(plan, 'screen');
  const entities = of(plan, 'entity');

  if (!plan.summary.trim()) out.push('Overview: no summary. Say what the app is and who it is for.');
  if (!screens.length) out.push('No screens defined.');
  if (!entities.length) out.push('No data entities defined.');

  const names = new Map<string, number>();
  for (const n of plan.nodes) {
    const k = `${n.kind}:${n.name.trim().toLowerCase()}`;
    names.set(k, (names.get(k) ?? 0) + 1);
  }
  for (const [k, c] of names) if (c > 1) out.push(`Duplicate ${k.split(':')[0]} name "${k.slice(k.indexOf(':') + 1)}" (${c}×).`);

  for (const s of screens) {
    if (!s.components.some((c) => c.trim()) && !s.notes.trim()) out.push(`Screen "${s.name}": no components or notes. What is on it?`);
    for (const r of s.roles) if (!roleNames.has(r)) out.push(`Screen "${s.name}": role "${r}" is not defined in Overview.`);
  }
  if (screens.length > 1) {
    const reached = new Set(plan.edges.filter((e) => e.kind === 'navigates').flatMap((e) => [e.source, e.target]));
    for (const s of screens) if (!reached.has(s.id)) out.push(`Screen "${s.name}": not connected to any other screen.`);
  }
  for (const e of entities) {
    if (!e.fields.length) out.push(`Entity "${e.name}": no fields.`);
    for (const f of e.fields) {
      if (!f.name.trim()) out.push(`Entity "${e.name}": a field has no name.`);
      if (f.type === 'enum' && !f.notes.trim()) out.push(`Entity "${e.name}.${f.name}": enum without listed values (put them in notes).`);
    }
  }
  for (const s of screens) if (!s.criteria.some((c) => c.text.trim())) out.push(`Screen "${s.name}": no acceptance criteria. How will we know it works?`);
  const acIds = new Set<string>();
  for (const n of plan.nodes) {
    for (const c of n.criteria) {
      if (!c.text.trim()) out.push(`${n.name}: acceptance criterion ${c.id} is empty.`);
      if (acIds.has(c.id)) out.push(`Acceptance criterion id ${c.id} is used twice.`);
      acIds.add(c.id);
    }
  }
  for (const e of plan.edges) {
    const a = byId.get(e.source), b = byId.get(e.target);
    if (!a || !b) { out.push(`Connection ${e.id} points to a missing node.`); continue; }
    if (e.kind === 'relation' && !e.cardinality) out.push(`Relation ${a.name} → ${b.name}: no cardinality.`);
  }
  return out;
}

function edgesFrom(plan: Plan, kind: PlanEdge['kind']) {
  const byId = new Map(plan.nodes.map((n) => [n.id, n]));
  return plan.edges
    .filter((e) => e.kind === kind && byId.has(e.source) && byId.has(e.target))
    .map((e) => ({ ...e, from: byId.get(e.source)!, to: byId.get(e.target)! }));
}

function notesBlock(notes: string) {
  return notes.trim() ? `\n**Notes:**\n\n${notes.trim()}\n` : '';
}

function criteriaBlock(n: PlanNode) {
  const cs = n.criteria.filter((c) => c.text.trim());
  return cs.length ? `\n**Acceptance criteria:**\n\n${cs.map((c) => `- **${c.id}** ${c.text.trim()}`).join('\n')}\n` : '';
}

function screensSection(plan: Plan, screens: ScreenNode[]) {
  const nav = edgesFrom(plan, 'navigates');
  const out = ['## Screens', ''];
  if (nav.length) {
    out.push('```mermaid', 'flowchart LR');
    screens.forEach((s, i) => out.push(`  s${i}["${mmLabel(s.name)}"]`));
    const idx = new Map(screens.map((s, i) => [s.id, i]));
    for (const e of nav) out.push(`  s${idx.get(e.source)} -->${e.label.trim() ? `|"${mmLabel(e.label)}"|` : ''} s${idx.get(e.target)}`);
    out.push('```', '');
  }
  for (const s of screens) {
    out.push(`### ${s.name}`, '');
    if (s.route) out.push(`- **Route:** \`${s.route}\``);
    out.push(`- **Who can see it:** ${s.roles.length ? s.roles.join(', ') : 'everyone'}`);
    const go = nav.filter((e) => e.source === s.id);
    if (go.length) out.push(`- **Goes to:** ${go.map((e) => `${e.to.name}${e.label ? ` (${e.label})` : ''}`).join('; ')}`);
    const from = nav.filter((e) => e.target === s.id);
    if (from.length) out.push(`- **Reached from:** ${from.map((e) => e.from.name).join(', ')}`);
    const items = s.components.map((c) => c.trim()).filter(Boolean);
    if (items.length) out.push('', '**Contents (top to bottom):**', '', ...items.map((c, i) => `${i + 1}. ${c}`));
    out.push(notesBlock(s.notes), criteriaBlock(s));
  }
  return out.join('\n');
}

const ER: Record<string, string> = { '1:1': '||--||', '1:n': '||--o{', 'n:1': '}o--||', 'n:n': '}o--o{' };
const CARD_WORDS: Record<string, string> = {
  '1:1': 'one-to-one', '1:n': 'one-to-many', 'n:1': 'many-to-one', 'n:n': 'many-to-many',
};

function dataSection(plan: Plan, entities: EntityNode[]) {
  const rel = edgesFrom(plan, 'relation');
  const out = ['## Data model', '', 'Every entity also has `id`, `createdAt`, `updatedAt` unless its notes say otherwise.', ''];
  out.push('```mermaid', 'erDiagram');
  for (const e of entities) {
    out.push(`  ${mmIdent(e.name)} {`);
    for (const f of e.fields) out.push(`    ${f.type} ${mmIdent(f.name)}${f.required ? ' "required"' : ''}`);
    out.push('  }');
  }
  for (const r of rel) {
    out.push(`  ${mmIdent(r.from.name)} ${ER[r.cardinality ?? 'n:n']} ${mmIdent(r.to.name)} : "${mmLabel(r.label || 'relates to')}"`);
  }
  out.push('```', '');
  for (const e of entities) {
    out.push(`### ${e.name}`, '');
    if (e.fields.length) {
      out.push('| Field | Type | Required | Notes |', '|---|---|---|---|');
      for (const f of e.fields) out.push(`| ${mdCell(f.name)} | ${f.type} | ${f.required ? 'yes' : 'no'} | ${mdCell(f.notes)} |`);
      out.push('');
    }
    const rs = rel.filter((r) => r.source === e.id || r.target === e.id);
    if (rs.length) {
      out.push('**Relations:**', '');
      for (const r of rs) {
        out.push(`- ${r.from.name} ${r.label || 'relates to'} ${r.to.name} — ${r.cardinality ? `${CARD_WORDS[r.cardinality]} (${r.cardinality})` : 'cardinality not specified'}`);
      }
    }
    out.push(notesBlock(e.notes), criteriaBlock(e));
  }
  return out.join('\n');
}

function archSection(plan: Plan, comps: ComponentNode[]) {
  const calls = edgesFrom(plan, 'calls');
  const out = ['## Architecture', ''];
  out.push('```mermaid', 'flowchart LR');
  const idx = new Map(comps.map((c, i) => [c.id, i]));
  comps.forEach((c, i) => {
    const label = `"${mmLabel(c.name)}${c.tech ? `<br/>${mmLabel(c.tech)}` : ''}"`;
    const shape = c.type === 'database' || c.type === 'storage' ? `[(${label})]` : c.type === 'actor' ? `([${label}])` : `[${label}]`;
    out.push(`  c${i}${shape}`);
  });
  for (const e of calls) out.push(`  c${idx.get(e.source)} -->${e.label.trim() ? `|"${mmLabel(e.label)}"|` : ''} c${idx.get(e.target)}`);
  out.push('```', '');
  for (const c of comps) {
    out.push(`### ${c.name}`, '', `- **Type:** ${c.type}`, `- **Technology:** ${c.tech || 'builder decides'}`);
    for (const e of calls.filter((e) => e.source === c.id)) out.push(`- **Calls** ${e.to.name}${e.label ? ` — ${e.label}` : ''}`);
    out.push(notesBlock(c.notes), criteriaBlock(c));
  }
  return out.join('\n');
}

export function generateSpec(plan: Plan): string {
  const screens = of(plan, 'screen');
  const entities = of(plan, 'entity');
  const comps = of(plan, 'component');
  const gaps = lintPlan(plan);
  const out: string[] = [`# ${plan.name} — Specification`, ''];
  out.push('> Generated by the planner from `plan.json` (schema: `plan.schema.json`). Do not edit; how to build it is in `RULES.md`.', '');
  if (plan.summary.trim()) out.push('## Summary', '', plan.summary.trim(), '');
  if (plan.goals.trim()) out.push('## Goals', '', bullets(plan.goals), '');
  if (plan.nonGoals.trim()) out.push('## Out of scope', '', bullets(plan.nonGoals), '');
  if (plan.constraints.trim()) out.push('## Constraints & preferences', '', bullets(plan.constraints), '');
  if (plan.roles.length) {
    out.push('## Roles', '', ...plan.roles.map((r) => `- **${r.name}**${r.description ? ` — ${r.description}` : ''}`), '');
  }
  if (screens.length) out.push(screensSection(plan, screens));
  if (entities.length) out.push(dataSection(plan, entities));
  if (comps.length) out.push(archSection(plan, comps));
  const acs = plan.nodes.flatMap((n) => n.criteria.filter((c) => c.text.trim()).map((c) => ({ ...c, where: n.name })));
  if (acs.length) {
    out.push('## Acceptance criteria index', '', 'Every row needs at least one automated test whose name contains the id.', '');
    out.push('| ID | Where | Criterion |', '|---|---|---|', ...acs.map((c) => `| ${c.id} | ${mdCell(c.where)} | ${mdCell(c.text.trim())} |`), '');
  }
  out.push('## Known gaps', '');
  out.push(gaps.length ? 'The planner flagged these. Ask the user before guessing:\n\n' + gaps.map((g) => `- ${g}`).join('\n') : 'None flagged.');
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/** plan/RULES.md: how to build — the playbook plus this app's extra rules. */
export function generateRules(plan: Plan, playbook: Playbook | null): string {
  const out = [`# Engineering rules — ${plan.name}`, ''];
  out.push('> Mandatory for every agent working in this repo. Generated by the planner; do not edit.', '');
  if (playbook) {
    out.push(`Playbook: **${playbook.name}**${playbook.description ? ` — ${playbook.description}` : ''}`, '');
    const sec = (title: string, body: string) => body.trim() && out.push(`## ${title}`, '', bullets(body), '');
    sec('Testing & quality', playbook.testing);
    sec('Patterns', playbook.patterns);
    sec('Workflow', playbook.workflow);
    const skills = playbook.skills.filter((k) => k.name.trim());
    if (playbook.tools.trim() || skills.length) {
      out.push('## Skills & tools', '');
      if (playbook.tools.trim()) out.push(bullets(playbook.tools));
      if (skills.length) {
        out.push('', 'Project skills (in `.claude/skills/<name>/SKILL.md`; agents without skill support: read the file when its description applies):', '');
        out.push(...skills.map((k) => `- \`${k.name}\` — ${k.description}`));
      }
      out.push('');
    }
  } else {
    out.push('No playbook selected. Use sensible defaults: automated tests for every acceptance criterion, typecheck, CI.', '');
  }
  if (plan.extraRules.trim()) out.push('## Rules for this app', '', bullets(plan.extraRules), '');
  out.push(
    '## Definition of done', '',
    '- Every acceptance criterion in `plan/SPEC.md` has a passing automated test that names its id.',
    '- Typecheck, lint and tests pass locally and in CI.',
    '- `VERIFY.md` (repo root) is current: date, commit, check results, and a table `| AC | Criterion | Test | Status |`.',
    '- Assumptions are in `ASSUMPTIONS.md`; known gaps were asked about, not guessed.',
  );
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function skillFiles(playbook: Playbook | null): Record<string, string> {
  const files: Record<string, string> = {};
  for (const k of playbook?.skills ?? []) {
    const name = k.name.trim();
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) continue;
    const desc = k.description.replace(/\s+/g, ' ').trim();
    files[`.claude/skills/${name}/SKILL.md`] = `---\nname: ${name}\ndescription: ${JSON.stringify(desc)}\n---\n\n${k.body.trim()}\n`;
  }
  return files;
}

const START = '<!-- app-plan:start — managed by the planner; edits inside this block are overwritten -->';
const END = '<!-- app-plan:end -->';

export function agentsBlock(plan: Plan, playbook: Playbook | null): string {
  const skills = (playbook?.skills ?? []).filter((k) => k.name.trim()).map((k) => `\`${k.name}\``);
  return `${START}
# Building ${plan.name}

Read these before writing code, in this order:

1. \`plan/RULES.md\` — **how** to build: testing, patterns, workflow, definition of done. Mandatory.
2. \`plan/SPEC.md\` — **what** to build: screens, data, architecture, acceptance criteria (AC-n).
3. \`plan/plan.json\` — the same plan as data; source of truth if the two disagree. Fields are explained in \`plan/plan.schema.json\`.

- Done means: every AC-n has a passing automated test naming it, CI is green, and \`VERIFY.md\` is up to date.${skills.length ? `\n- Project skills: ${skills.join(', ')} in \`.claude/skills/\`.` : ''}
- Ask the user about anything under "Known gaps" in \`plan/SPEC.md\` before building it. Record other assumptions in \`ASSUMPTIONS.md\`.
- Never edit \`plan/\`, the planner's skills, or this block — the planner overwrites them. When they change, re-read them and update code and tests.
${END}
`;
}

/** Replace the planner's block in AGENTS.md, keeping anything else the team wrote there. */
export function mergeAgents(existing: string | null, block: string): string {
  if (!existing?.trim()) return block;
  const i = existing.indexOf('<!-- app-plan:start'), j = existing.indexOf(END);
  if (i >= 0 && j > i) return existing.slice(0, i) + block.trimEnd() + existing.slice(j + END.length);
  return `${block}\n${existing}`;
}

/** Claude Code reads CLAUDE.md, not AGENTS.md: make sure CLAUDE.md imports it. */
export function mergeClaude(existing: string | null): string {
  if (!existing?.trim()) return '@AGENTS.md\n';
  return /^@AGENTS\.md\s*$/m.test(existing) ? existing : `@AGENTS.md\n\n${existing}`;
}

export type ExportBundle = {
  /** Always overwritten. */
  files: Record<string, string>;
  /** Merged with whatever the repo already has (null = file does not exist). */
  merges: Record<string, (existing: string | null) => string>;
};

export function buildExport(plan: Plan, playbook: Playbook | null): ExportBundle {
  const block = agentsBlock(plan, playbook);
  return {
    files: {
      'plan/SPEC.md': generateSpec(plan),
      'plan/RULES.md': generateRules(plan, playbook),
      'plan/plan.json': JSON.stringify(plan, null, 2) + '\n',
      'plan/plan.schema.json': JSON.stringify(planJsonSchema(), null, 2) + '\n',
      ...skillFiles(playbook),
    },
    merges: {
      'AGENTS.md': (existing) => mergeAgents(existing, block),
      'CLAUDE.md': mergeClaude,
    },
  };
}

/** Every file as it would look in a fresh repo (for downloads). */
export function exportAll(plan: Plan, playbook: Playbook | null): Record<string, string> {
  const b = buildExport(plan, playbook);
  return { ...b.files, ...Object.fromEntries(Object.entries(b.merges).map(([k, f]) => [k, f(null)])) };
}
