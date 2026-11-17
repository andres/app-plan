import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, Handle, Position, MarkerType, ConnectionMode, useReactFlow,
  type Node, type Edge, type NodeProps, type Connection, type OnNodesChange, type OnEdgesChange,
} from '@xyflow/react';
import '@xyflow/react/style.css';
import {
  VIEWS, type Plan, type PlanNode, type PlanEdge, type View, type ScreenNode, type EntityNode, type ComponentNode,
} from '../shared/schema.ts';
import type { Update } from './Editor.tsx';
import { Inspector, COMPONENT_LOOK, type Selection } from './Inspector.tsx';

type RFNode = Node<{ node: PlanNode }>;

const uid = () => crypto.randomUUID().slice(0, 8);

const Handles = () => (
  <>
    {([['t', Position.Top], ['r', Position.Right], ['b', Position.Bottom], ['l', Position.Left]] as const).map(([id, pos]) => (
      <Handle key={id} id={id} type="source" position={pos} />
    ))}
  </>
);

function ScreenCard({ data, selected }: NodeProps<RFNode>) {
  const n = data.node as ScreenNode;
  const items = n.components.filter((c) => c.trim());
  return (
    <div className={`card screen ${selected ? 'selected' : ''}`}>
      <Handles />
      <div className="card-kind">Screen{n.route && <code>{n.route}</code>}</div>
      <div className="card-title">{n.name || 'Untitled'}</div>
      {items.length > 0 && (
        <ul className="card-list">
          {items.slice(0, 6).map((c, i) => <li key={i}>{c}</li>)}
          {items.length > 6 && <li className="muted">+{items.length - 6} more</li>}
        </ul>
      )}
      {n.roles.length > 0 && <div className="chips">{n.roles.map((r) => <span key={r} className="chip">{r}</span>)}</div>}
    </div>
  );
}

function EntityCard({ data, selected }: NodeProps<RFNode>) {
  const n = data.node as EntityNode;
  return (
    <div className={`card entity ${selected ? 'selected' : ''}`}>
      <Handles />
      <div className="card-title">{n.name || 'Untitled'}</div>
      <table className="fields">
        <tbody>
          {n.fields.map((f, i) => (
            <tr key={i}>
              <td>{f.name || <span className="muted">?</span>}{f.required && <span className="req">*</span>}</td>
              <td className="muted">{f.type}</td>
            </tr>
          ))}
          {n.fields.length === 0 && <tr><td className="muted">no fields yet</td></tr>}
        </tbody>
      </table>
    </div>
  );
}


function ComponentCard({ data, selected }: NodeProps<RFNode>) {
  const n = data.node as ComponentNode;
  const look = COMPONENT_LOOK[n.type];
  return (
    <div className={`card component type-${n.type} ${selected ? 'selected' : ''}`}>
      <Handles />
      <div className="card-kind">{look.label}</div>
      <div className="card-title">{n.name || 'Untitled'}</div>
      {n.tech && <div className="muted small">{n.tech}</div>}
    </div>
  );
}

const nodeTypes = { screen: ScreenCard, entity: EntityCard, component: ComponentCard };

/** Edges imported without chosen sides attach on the sides facing each other. */
function autoHandles(a?: { x: number; y: number }, b?: { x: number; y: number }): [string, string] {
  if (!a || !b) return ['r', 'l'];
  const dx = b.x - a.x, dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy) * 1.2) return dx >= 0 ? ['r', 'l'] : ['l', 'r'];
  return dy >= 0 ? ['b', 't'] : ['t', 'b'];
}

function edgeLabel(e: PlanEdge) {
  if (e.kind === 'relation') return [e.label, e.cardinality].filter(Boolean).join(' · ');
  return e.label;
}

/** What the "+" buttons create in each view. */
function palette(view: View): { label: string; make: (id: string, position: { x: number; y: number }) => PlanNode }[] {
  if (view === 'screens') {
    return [{ label: '+ Screen', make: (id, position) => ({ id, kind: 'screen', name: 'New screen', notes: '', position, route: '', roles: [], components: [] }) }];
  }
  if (view === 'data') {
    return [{
      label: '+ Entity',
      make: (id, position) => ({ id, kind: 'entity', name: 'NewEntity', notes: '', position, fields: [{ name: 'name', type: 'string', required: true, notes: '' }] }),
    }];
  }
  return (['actor', 'frontend', 'backend', 'database', 'external'] as const).map((type) => ({
    label: `+ ${COMPONENT_LOOK[type].label.split(' /')[0]}`,
    make: (id, position) => ({ id, kind: 'component', type, name: COMPONENT_LOOK[type].label.split(' /')[0], notes: '', position, tech: '' }),
  }));
}

export function Canvas(props: { view: View; plan: Plan; update: Update }) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function CanvasInner({ view, plan, update }: { view: View; plan: Plan; update: Update }) {
  const cfg = VIEWS[view];
  const [sel, setSel] = useState<Selection>(null);
  const measured = useRef(new Map<string, { width?: number; height?: number }>());
  const wrapper = useRef<HTMLDivElement>(null);
  const flow = useReactFlow();

  const nodes: RFNode[] = useMemo(
    () => plan.nodes.filter((n) => n.kind === cfg.kind).map((n) => {
      const m = measured.current.get(n.id);
      return {
        id: n.id, type: n.kind, position: n.position, data: { node: n },
        selected: sel?.type === 'node' && sel.id === n.id,
        ...(m ? { measured: m } : {}),
      };
    }),
    [plan.nodes, cfg.kind, sel],
  );
  const edges: Edge[] = useMemo(() => {
    const pos = new Map(plan.nodes.map((n) => [n.id, n.position]));
    return plan.edges.filter((e) => e.kind === cfg.edge).map((e) => {
      const auto = autoHandles(pos.get(e.source), pos.get(e.target));
      return {
      id: e.id, source: e.source, target: e.target,
      sourceHandle: e.sourceHandle ?? auto[0], targetHandle: e.targetHandle ?? auto[1],
      label: edgeLabel(e) || undefined,
      markerEnd: { type: MarkerType.ArrowClosed },
      selected: sel?.type === 'edge' && sel.id === e.id,
      };
    });
  }, [plan.nodes, plan.edges, cfg.edge, sel]);

  const onNodesChange: OnNodesChange<RFNode> = useCallback((changes) => {
    const next = changes.applyTo(nodes);
    for (const n of next) if (n.measured) measured.current.set(n.id, n.measured);
    const nextById = new Map(next.map((n) => [n.id, n]));
    const removed = new Set(nodes.filter((n) => !nextById.has(n.id)).map((n) => n.id));
    const moved = new Map(
      next.filter((n) => { const prev = nodes.find((p) => p.id === n.id); return prev && prev.position !== n.position; })
        .map((n) => [n.id, { x: Math.round(n.position.x), y: Math.round(n.position.y) }]),
    );
    if (removed.size || moved.size) {
      update((p) => ({
        ...p,
        nodes: p.nodes.filter((n) => !removed.has(n.id)).map((n) => (moved.has(n.id) ? { ...n, position: moved.get(n.id)! } : n)),
        edges: p.edges.filter((e) => !removed.has(e.source) && !removed.has(e.target)),
      }));
    }
    const picked = next.find((n) => n.selected);
    setSel((cur) => (picked ? (cur?.id === picked.id ? cur : { type: 'node', id: picked.id }) : cur?.type === 'node' ? null : cur));
  }, [nodes, update]);

  const onEdgesChange: OnEdgesChange<Edge> = useCallback((changes) => {
    const next = changes.applyTo(edges);
    const keep = new Set(next.map((e) => e.id));
    const removed = edges.filter((e) => !keep.has(e.id)).map((e) => e.id);
    if (removed.length) update((p) => ({ ...p, edges: p.edges.filter((e) => !removed.includes(e.id)) }));
    const picked = next.find((e) => e.selected);
    setSel((cur) => (picked ? (cur?.id === picked.id ? cur : { type: 'edge', id: picked.id }) : cur?.type === 'edge' ? null : cur));
  }, [edges, update]);

  const onConnect = useCallback((c: Connection) => {
    if (c.source === c.target) return;
    const id = uid();
    update((p) => ({
      ...p,
      edges: [...p.edges, {
        id, kind: cfg.edge, source: c.source, target: c.target, label: '',
        sourceHandle: c.sourceHandle, targetHandle: c.targetHandle,
        ...(cfg.edge === 'relation' ? { cardinality: '1:n' as const } : {}),
      }],
    }));
    setSel({ type: 'edge', id });
  }, [cfg.edge, update]);

  const add = (make: (id: string, pos: { x: number; y: number }) => PlanNode) => {
    const r = wrapper.current!.getBoundingClientRect();
    const center = flow.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 3 });
    const jitter = () => Math.round((Math.random() - 0.5) * 60);
    const id = uid();
    update((p) => ({ ...p, nodes: [...p.nodes, make(id, { x: Math.round(center.x - 90) + jitter(), y: Math.round(center.y) + jitter() })] }));
    setSel({ type: 'node', id });
  };

  return (
    <div className={`canvas-layout ${sel ? 'has-selection' : ''}`}>
      <div className="canvas" ref={wrapper}>
        <div className="palette">
          {palette(view).map((p) => <button key={p.label} onClick={() => add(p.make)}>{p.label}</button>)}
        </div>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          connectionMode={ConnectionMode.Loose}
          deleteKeyCode={['Backspace', 'Delete']}
          fitView
          fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
          minZoom={0.2}
          forceColorMode="dark"
        >
          <Background gap={20} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <Inspector view={view} plan={plan} sel={sel} setSel={setSel} update={update} />
    </div>
  );
}
