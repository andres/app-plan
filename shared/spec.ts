import type { Plan, PlanNode, PlanEdge, ScreenNode, EntityNode, ComponentNode } from './schema.ts';
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
    out.push(notesBlock(s.notes));
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
    out.push(notesBlock(e.notes));
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
    out.push(notesBlock(c.notes));
  }
  return out.join('\n');
}

export function generateSpec(plan: Plan): string {
  const screens = of(plan, 'screen');
  const entities = of(plan, 'entity');
  const comps = of(plan, 'component');
  const gaps = lintPlan(plan);
  const out: string[] = [`# ${plan.name} — Specification`, ''];
  out.push('> Generated from `plan.json` (schema: `plan.schema.json`). Edit the plan in the planner, not this file.', '');
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
  out.push('## Known gaps', '');
  out.push(gaps.length ? 'The planner flagged these. Ask the user before guessing:\n\n' + gaps.map((g) => `- ${g}`).join('\n') : 'None flagged.');
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function agentsMd(plan: Plan): string {
  return `# Instructions for coding agents

You are building **${plan.name}**.

1. Read \`plan/SPEC.md\` first. It is the human-readable spec.
2. \`plan/plan.json\` is the same plan as structured data and is the source of truth if the two disagree. \`plan/plan.schema.json\` explains every field.
3. Build what is specified. Where the spec is silent, pick the simplest reasonable option and list your assumption in \`ASSUMPTIONS.md\`.
4. Items under "Known gaps" in \`plan/SPEC.md\` are open questions: ask the user before building those parts.
5. Never edit files in \`plan/\`. The planner app overwrites them. If the plan changes, re-read them and update the code to match.
`;
}

/** Files under plan/ are always overwritten on export. AGENTS.md is only created if the repo has none. */
export function exportFiles(plan: Plan): Record<string, string> {
  return {
    'plan/SPEC.md': generateSpec(plan),
    'plan/plan.json': JSON.stringify(plan, null, 2) + '\n',
    'plan/plan.schema.json': JSON.stringify(planJsonSchema(), null, 2) + '\n',
  };
}
