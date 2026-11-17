import type { Plan } from '../shared/schema.ts';
import type { Update } from './Editor.tsx';

type TextKey = 'summary' | 'goals' | 'nonGoals' | 'constraints';
const TEXTS: [TextKey, string, string][] = [
  ['summary', 'Summary', 'What is this app and who is it for? A few sentences.'],
  ['goals', 'Goals', 'One per line. What must be true for this app to be a success?'],
  ['nonGoals', 'Out of scope', 'One per line. What should the builder NOT build?'],
  ['constraints', 'Constraints & preferences', 'One per line. Platform, stack, hosting, integrations, deadlines.'],
];

export function Overview({ plan, update }: { plan: Plan; update: Update }) {
  const setRole = (i: number, patch: Partial<Plan['roles'][number]>) =>
    update((p) => {
      const old = p.roles[i];
      const roles = p.roles.map((r, j) => (j === i ? { ...r, ...patch } : r));
      // Keep screens pointing at a renamed role.
      const nodes = patch.name === undefined ? p.nodes : p.nodes.map((n) =>
        n.kind === 'screen' && n.roles.includes(old.name) ? { ...n, roles: n.roles.map((r) => (r === old.name ? patch.name! : r)) } : n,
      );
      return { ...p, roles, nodes };
    });
  const removeRole = (i: number) =>
    update((p) => {
      const name = p.roles[i].name;
      return {
        ...p,
        roles: p.roles.filter((_, j) => j !== i),
        nodes: p.nodes.map((n) => (n.kind === 'screen' ? { ...n, roles: n.roles.filter((r) => r !== name) } : n)),
      };
    });

  return (
    <div className="page overview">
      {TEXTS.map(([key, label, hint]) => (
        <label key={key} className="field">
          <span>{label}</span>
          <textarea
            rows={key === 'summary' ? 4 : 3}
            placeholder={hint}
            value={plan[key]}
            onChange={(e) => { const v = e.target.value; update((p) => ({ ...p, [key]: v })); }}
          />
        </label>
      ))}
      <div className="field">
        <span>Roles</span>
        <p className="muted small">Who uses the app. Screens can be limited to roles.</p>
        {plan.roles.map((r, i) => (
          <div className="row" key={i}>
            <input style={{ maxWidth: 180 }} placeholder="Role name" value={r.name} onChange={(e) => setRole(i, { name: e.target.value })} />
            <input placeholder="What can they do?" value={r.description} onChange={(e) => setRole(i, { description: e.target.value })} />
            <button className="ghost danger" title="Remove role" onClick={() => removeRole(i)}>×</button>
          </div>
        ))}
        <div>
          <button onClick={() => update((p) => ({ ...p, roles: [...p.roles, { name: '', description: '' }] }))}>+ Role</button>
        </div>
      </div>
    </div>
  );
}
