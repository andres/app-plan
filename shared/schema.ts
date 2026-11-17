import { z } from 'zod';

// The plan model. This file is the single source of truth: the editor validates
// against it, and its JSON Schema ships with every export so an LLM knows exactly
// what each field means.

const Position = z.object({ x: z.number(), y: z.number() });

export const Criterion = z.object({
  id: z.string().describe('Stable id like AC-12. Never reused, even if the criterion is deleted.'),
  text: z.string().describe('Testable behaviour, ideally "Given … when … then …".'),
});
export type Criterion = z.infer<typeof Criterion>;

const base = {
  id: z.string(),
  name: z.string().describe('Short display name.'),
  notes: z
    .string()
    .default('')
    .describe('Free text: purpose, business rules, edge cases, the "why". Most important field for the builder.'),
  position: Position.describe('Canvas position. Layout only; carries no meaning.'),
  criteria: z
    .array(z.lazy(() => Criterion))
    .default([])
    .describe('Acceptance criteria. Each one must be covered by at least one automated test that names its id.'),
};

export const ScreenNode = z
  .object({
    ...base,
    kind: z.literal('screen'),
    route: z.string().default('').describe('URL path, e.g. /orders/:id. Empty = builder decides.'),
    roles: z.array(z.string()).default([]).describe('Role names allowed to see this screen. Empty = everyone.'),
    components: z
      .array(z.string())
      .default([])
      .describe('What is on the screen, top to bottom, one item per entry (e.g. "Search box", "Orders table: date, total, status").'),
  })
  .describe('A page or screen of the app.');

export const FIELD_TYPES = [
  'string', 'text', 'number', 'integer', 'boolean', 'date', 'datetime',
  'email', 'url', 'enum', 'json', 'file', 'reference',
] as const;

export const Field = z.object({
  name: z.string(),
  type: z.enum(FIELD_TYPES),
  required: z.boolean().default(false),
  notes: z.string().default('').describe('Enum values, validation, defaults, what a reference points to.'),
});

export const EntityNode = z
  .object({
    ...base,
    kind: z.literal('entity'),
    fields: z.array(Field).default([]).describe('Fields besides the implicit id / createdAt / updatedAt.'),
  })
  .describe('A stored data type (a table / collection).');

export const COMPONENT_TYPES = [
  'actor', 'frontend', 'backend', 'database', 'storage', 'queue', 'job', 'external',
] as const;

export const ComponentNode = z
  .object({
    ...base,
    kind: z.literal('component'),
    type: z.enum(COMPONENT_TYPES).describe('actor = a person or outside system using the app; external = third-party service.'),
    tech: z.string().default('').describe('Preferred technology, e.g. "Postgres", "Stripe". Empty = builder decides.'),
  })
  .describe('A building block of the system architecture.');

export const PlanNode = z.discriminatedUnion('kind', [ScreenNode, EntityNode, ComponentNode]);

export const CARDINALITIES = ['1:1', '1:n', 'n:1', 'n:n'] as const;

export const PlanEdge = z
  .object({
    id: z.string(),
    source: z.string().describe('id of the source node.'),
    target: z.string().describe('id of the target node.'),
    kind: z
      .enum(['navigates', 'relation', 'calls'])
      .describe('navigates: screen -> screen. relation: entity <-> entity. calls: component -> component.'),
    label: z.string().default('').describe('navigates: the trigger ("tap Save"). relation: the meaning ("places"). calls: what flows ("REST", "webhook").'),
    cardinality: z.enum(CARDINALITIES).optional().describe('relation only, source:target. 1:n = one source has many targets.'),
    sourceHandle: z.string().nullish().describe('Layout only.'),
    targetHandle: z.string().nullish().describe('Layout only.'),
  })
  .describe('A connection between two nodes of the same view.');

export const Role = z.object({
  name: z.string(),
  description: z.string().default(''),
});

export const Plan = z
  .object({
    schemaVersion: z.literal(1),
    name: z.string(),
    summary: z.string().default('').describe('What the app is and who it is for, in a few sentences.'),
    goals: z.string().default('').describe('One goal per line.'),
    nonGoals: z.string().default('').describe('Explicitly out of scope. One per line.'),
    constraints: z.string().default('').describe('Platform, stack preferences, hosting, budget, deadlines. One per line.'),
    roles: z.array(Role).default([]).describe('User roles / permission levels.'),
    nodes: z.array(PlanNode).default([]),
    edges: z.array(PlanEdge).default([]),
    repo: z.string().default('').describe('GitHub repo (owner/name) this plan is exported to.'),
    playbookId: z.string().default('').describe('Planner-internal id of the engineering playbook used (exported as plan/RULES.md).'),
    extraRules: z.string().default('').describe('Engineering rules specific to this app, added to the playbook. One per line.'),
    acSeq: z.number().int().default(0).describe('Planner-internal counter for acceptance-criterion ids.'),
  })
  .describe('An application plan, written by a human for an LLM coding agent to build from.');

export type Plan = z.infer<typeof Plan>;
export type PlanNode = z.infer<typeof PlanNode>;
export type PlanEdge = z.infer<typeof PlanEdge>;
export type ScreenNode = z.infer<typeof ScreenNode>;
export type EntityNode = z.infer<typeof EntityNode>;
export type ComponentNode = z.infer<typeof ComponentNode>;
export type Field = z.infer<typeof Field>;
export type NodeKind = PlanNode['kind'];

export const VIEWS = {
  screens: { kind: 'screen', edge: 'navigates', label: 'Screens' },
  data: { kind: 'entity', edge: 'relation', label: 'Data' },
  architecture: { kind: 'component', edge: 'calls', label: 'Architecture' },
} as const;
export type View = keyof typeof VIEWS;

export function emptyPlan(name: string): Plan {
  return Plan.parse({ schemaVersion: 1, name });
}

export function planJsonSchema(): unknown {
  return z.toJSONSchema(Plan, { io: 'input' });
}

// ---------------------------------------------------------------------------
// Playbooks: reusable engineering standards (tests, patterns, workflow, skills)
// shared by many plans. Exported as plan/RULES.md and .claude/skills/*.

export const Skill = z.object({
  name: z.string().describe('kebab-case, becomes .claude/skills/<name>/SKILL.md'),
  description: z.string().describe('When the agent should use this skill.'),
  body: z.string().describe('Step-by-step instructions (markdown).'),
});
export type Skill = z.infer<typeof Skill>;

export const Playbook = z.object({
  schemaVersion: z.literal(1),
  name: z.string(),
  description: z.string().default(''),
  testing: z.string().default('').describe('Testing & quality rules, one per line.'),
  patterns: z.string().default('').describe('Code & design patterns, one per line.'),
  workflow: z.string().default('').describe('How to work: milestones, commits, when to ask. One per line.'),
  tools: z.string().default('').describe('Existing skills / tools to use and when. One per line.'),
  skills: z.array(Skill).default([]).describe('Project skills written into the repo.'),
});
export type Playbook = z.infer<typeof Playbook>;

export const SKILL_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
