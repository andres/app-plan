import {
  VIEWS, FIELD_TYPES, CARDINALITIES, COMPONENT_TYPES,
  type Plan, type PlanNode, type PlanEdge, type View, type Field, type ComponentNode,
} from '../shared/schema.ts';
import type { Update } from './Editor.tsx';

export type Selection = { type: 'node' | 'edge'; id: string } | null;

export const COMPONENT_LOOK: Record<ComponentNode['type'], { label: string }> = {
  actor: { label: 'User / actor' },
  frontend: { label: 'Frontend' },
  backend: { label: 'Backend' },
  database: { label: 'Database' },
  storage: { label: 'File storage' },
  queue: { label: 'Queue' },
  job: { label: 'Scheduled job' },
  external: { label: 'External service' },
};

const HELP: Record<View, string[]> = {
  screens: [
    'Add a screen for each page of the app.',
    'Drag from a dot on a screen\'s edge to another screen to show how users move between them.',
    'Click a screen to list what is on it and write notes.',
  ],
  data: [
    'Add an entity for each kind of thing the app stores (User, Order, …).',
    'Connect entities to show relations, then set the cardinality (1:n = one has many).',
  ],
  architecture: [
    'Optional. Sketch the parts of the system and the outside services it talks to.',
    'Leave the technology blank to let the builder decide.',
  ],
};

export function Inspector({ view, plan, sel, setSel, update }: {
  view: View; plan: Plan; sel: Selection; setSel: (s: Selection) => void; update: Update;
}) {
  const node = sel?.type === 'node' ? plan.nodes.find((n) => n.id === sel.id) : undefined;
  const edge = sel?.type === 'edge' ? plan.edges.find((e) => e.id === sel.id) : undefined;

  if (!node && !edge) {
    return (
      <aside className="inspector help">
        <h3>{VIEWS[view].label}</h3>
        <ul>{HELP[view].map((h) => <li key={h}>{h}</li>)}</ul>
        <p className="muted small">Select something and press Delete, or use the Delete button here.</p>
      </aside>
    );
  }

  const close = () => setSel(null);
  if (edge) return <EdgeForm edge={edge} plan={plan} update={update} close={close} />;
  return <NodeForm node={node!} plan={plan} update={update} close={close} />;
}

function NodeForm({ node, plan, update, close }: { node: PlanNode; plan: Plan; update: Update; close: () => void }) {
  const set = (patch: Partial<PlanNode>) =>
    update((p) => ({ ...p, nodes: p.nodes.map((n) => (n.id === node.id ? ({ ...n, ...patch } as PlanNode) : n)) }));
  const remove = () => {
    update((p) => ({
      ...p,
      nodes: p.nodes.filter((n) => n.id !== node.id),
      edges: p.edges.filter((e) => e.source !== node.id && e.target !== node.id),
    }));
    close();
  };

  return (
    <aside className="inspector">
      <div className="inspector-head">
        <strong>{{ screen: 'Screen', entity: 'Entity', component: 'Component' }[node.kind]}</strong>
        <button className="ghost" onClick={close} title="Close">✕</button>
      </div>
      <label className="field">
        <span>Name</span>
        <input value={node.name} onChange={(e) => set({ name: e.target.value })} />
      </label>

      {node.kind === 'screen' && (
        <>
          <label className="field">
            <span>Route <em className="muted">optional</em></span>
            <input placeholder="/orders/:id" value={node.route} onChange={(e) => set({ route: e.target.value })} />
          </label>
          <label className="field">
            <span>What's on it <em className="muted">one item per line, top to bottom</em></span>
            <textarea
              rows={6}
              placeholder={'Search box\nOrders table: date, total, status\nNew order button'}
              value={node.components.join('\n')}
              onChange={(e) => set({ components: e.target.value.split('\n') })}
            />
          </label>
          <div className="field">
            <span>Who can see it <em className="muted">none ticked = everyone</em></span>
            {plan.roles.length === 0 && <p className="muted small">Add roles in Overview to restrict screens.</p>}
            <div className="chips">
              {plan.roles.filter((r) => r.name.trim()).map((r) => (
                <label key={r.name} className="chip check">
                  <input
                    type="checkbox"
                    checked={node.roles.includes(r.name)}
                    onChange={(e) => set({ roles: e.target.checked ? [...node.roles, r.name] : node.roles.filter((x) => x !== r.name) })}
                  />
                  {r.name}
                </label>
              ))}
            </div>
          </div>
        </>
      )}

      {node.kind === 'entity' && <FieldsEditor fields={node.fields} onChange={(fields) => set({ fields })} />}

      {node.kind === 'component' && (
        <>
          <label className="field">
            <span>Type</span>
            <select value={node.type} onChange={(e) => set({ type: e.target.value as typeof node.type })}>
              {COMPONENT_TYPES.map((t) => <option key={t} value={t}>{COMPONENT_LOOK[t].label}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Technology <em className="muted">blank = builder decides</em></span>
            <input placeholder="e.g. Postgres, Stripe, React" value={node.tech} onChange={(e) => set({ tech: e.target.value })} />
          </label>
        </>
      )}

      <label className="field">
        <span>Notes <em className="muted">rules, edge cases, the why</em></span>
        <textarea rows={6} value={node.notes} onChange={(e) => set({ notes: e.target.value })} />
      </label>
      <CriteriaEditor node={node} update={update} />
      <button className="danger" onClick={remove}>Delete {node.kind}</button>
    </aside>
  );
}

function FieldsEditor({ fields, onChange }: { fields: Field[]; onChange: (f: Field[]) => void }) {
  const setAt = (i: number, patch: Partial<Field>) => onChange(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= fields.length) return;
    const next = [...fields];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="field">
      <span>Fields <em className="muted">id and timestamps are implicit</em></span>
      {fields.map((f, i) => (
        <div className="field-row" key={i}>
          <div className="row">
            <input placeholder="name" value={f.name} onChange={(e) => setAt(i, { name: e.target.value })} />
            <select value={f.type} onChange={(e) => setAt(i, { type: e.target.value as Field['type'] })}>
              {FIELD_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
            <label className="chip check" title="Required">
              <input type="checkbox" checked={f.required} onChange={(e) => setAt(i, { required: e.target.checked })} />req
            </label>
          </div>
          <div className="row">
            <input
              placeholder={f.type === 'enum' ? 'values: a | b | c' : f.type === 'reference' ? '-> Entity' : 'notes'}
              value={f.notes}
              onChange={(e) => setAt(i, { notes: e.target.value })}
            />
            <button className="ghost" title="Move up" onClick={() => move(i, -1)}>↑</button>
            <button className="ghost danger" title="Remove field" onClick={() => onChange(fields.filter((_, j) => j !== i))}>×</button>
          </div>
        </div>
      ))}
      <div>
        <button onClick={() => onChange([...fields, { name: '', type: 'string', required: false, notes: '' }])}>+ Field</button>
      </div>
    </div>
  );
}

function EdgeForm({ edge, plan, update, close }: { edge: PlanEdge; plan: Plan; update: Update; close: () => void }) {
  const name = (id: string) => plan.nodes.find((n) => n.id === id)?.name ?? '?';
  const set = (patch: Partial<PlanEdge>) =>
    update((p) => ({ ...p, edges: p.edges.map((e) => (e.id === edge.id ? { ...e, ...patch } : e)) }));
  const swap = () => set({ source: edge.target, target: edge.source, sourceHandle: edge.targetHandle, targetHandle: edge.sourceHandle });
  const title = { navigates: 'Navigation', relation: 'Relation', calls: 'Connection' }[edge.kind];
  const placeholder = { navigates: 'What triggers it? e.g. tap Save', relation: 'e.g. places, owns, belongs to', calls: 'e.g. REST, webhook, SQL' }[edge.kind];

  return (
    <aside className="inspector">
      <div className="inspector-head">
        <strong>{title}</strong>
        <button className="ghost" onClick={close} title="Close">✕</button>
      </div>
      <p>
        <strong>{name(edge.source)}</strong> → <strong>{name(edge.target)}</strong>{' '}
        <button className="ghost small" onClick={swap} title="Reverse direction">⇄ reverse</button>
      </p>
      <label className="field">
        <span>Label</span>
        <input placeholder={placeholder} value={edge.label} onChange={(e) => set({ label: e.target.value })} />
      </label>
      {edge.kind === 'relation' && (
        <label className="field">
          <span>Cardinality ({name(edge.source)} : {name(edge.target)})</span>
          <select value={edge.cardinality ?? ''} onChange={(e) => set({ cardinality: (e.target.value || undefined) as PlanEdge['cardinality'] })}>
            <option value="">not set</option>
            {CARDINALITIES.map((c) => (
              <option key={c} value={c}>
                {c} — {{ '1:1': 'one to one', '1:n': `one ${name(edge.source)} has many ${name(edge.target)}`, 'n:1': `many ${name(edge.source)} to one ${name(edge.target)}`, 'n:n': 'many to many' }[c]}
              </option>
            ))}
          </select>
        </label>
      )}
      <button className="danger" onClick={() => { update((p) => ({ ...p, edges: p.edges.filter((e) => e.id !== edge.id) })); close(); }}>
        Delete connection
      </button>
    </aside>
  );
}

function CriteriaEditor({ node, update }: { node: PlanNode; update: Update }) {
  const setCriteria = (fn: (cs: PlanNode['criteria']) => PlanNode['criteria']) =>
    update((p) => ({
      ...p,
      nodes: p.nodes.map((n) => (n.id === node.id ? { ...n, criteria: fn(n.criteria) } : n)),
    }));
  const add = () =>
    update((p) => {
      const id = `AC-${p.acSeq + 1}`;
      return {
        ...p,
        acSeq: p.acSeq + 1,
        nodes: p.nodes.map((n) => (n.id === node.id ? { ...n, criteria: [...n.criteria, { id, text: '' }] } : n)),
      };
    });
  return (
    <div className="field">
      <span>Acceptance criteria <em className="muted">each becomes an automated test</em></span>
      {node.criteria.map((c, i) => (
        <div className="criterion" key={c.id}>
          <code>{c.id}</code>
          <textarea
            rows={Math.max(2, Math.ceil(c.text.length / 34) + c.text.split('\n').length - 1)}
            placeholder="Given … when … then …"
            value={c.text}
            onChange={(e) => { const text = e.target.value; setCriteria((cs) => cs.map((x, j) => (j === i ? { ...x, text } : x))); }}
          />
          <button className="ghost danger" title="Remove criterion" onClick={() => setCriteria((cs) => cs.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <div>
        <button onClick={add}>+ Criterion</button>
      </div>
    </div>
  );
}
