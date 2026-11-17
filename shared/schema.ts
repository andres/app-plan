import { z } from 'zod';

// The plan model. This file is the single source of truth: the editor validates
// against it, and its JSON Schema ships with every export so an LLM knows exactly
// what each field means.

const Position = z.object({ x: z.number(), y: z.number() });

const base = {
  id: z.string(),
  name: z.string().describe('Short display name.'),
  notes: z
    .string()
    .default('')
    .describe('Free text: purpose, business rules, edge cases, the "why". Most important field for the builder.'),
  position: Position.describe('Canvas position. Layout only; carries no meaning.'),
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
