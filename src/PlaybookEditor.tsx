import { api } from './api.ts';
import { SKILL_NAME, type Playbook, type Skill } from '../shared/schema.ts';
import { useAutosave } from './useAutosave.ts';
import { SaveStatusBadge, ConflictBanner } from './Editor.tsx';

type TextKey = 'testing' | 'patterns' | 'workflow' | 'tools';
const SECTIONS: [TextKey, string, string][] = [
  ['testing', 'Testing & quality', 'One rule per line. e.g. "Every acceptance criterion has a test naming its id"'],
  ['patterns', 'Patterns', 'One rule per line. Architecture, validation, errors, auth, dependencies…'],
  ['workflow', 'Workflow', 'One rule per line. Milestones, commits, when to ask the user…'],
  ['tools', 'Skills & tools to use', 'One per line. Existing skills/tools and when to use them, e.g. "Use browser-harness to screenshot each screen"'],
];

export function PlaybookEditor({ id }: { id: string }) {
  const { doc: pb, loadError, status, update, flush } = useAutosave(api.playbooks, id);
  if (loadError) return <div className="center">Couldn't open playbook: {loadError} <a href="#/">Back</a></div>;
  if (!pb) return <div className="center muted">Loading…</div>;

  const set = (patch: Partial<Playbook>) => update((p) => ({ ...p, ...patch }));
  const setSkill = (i: number, patch: Partial<Skill>) => set({ skills: pb.skills.map((k, j) => (j === i ? { ...k, ...patch } : k)) });

  return (
    <div className="editor">
      <header className="editor-header">
        <a href="#/" className="button ghost" title="Back" onClick={() => void flush()}>←</a>
        <input className="plan-name" value={pb.name} onChange={(e) => set({ name: e.target.value })} aria-label="Playbook name" />
        <SaveStatusBadge status={status} />
      </header>
      {status === 'conflict' && <ConflictBanner />}
      <main className="editor-main">
        <div className="page">
          <p className="muted small">
            A playbook is your engineering standard. Plans that use it export it as <code>plan/RULES.md</code>, and its skills as{' '}
            <code>.claude/skills/&lt;name&gt;/SKILL.md</code>. Changes apply to every plan using it on the next push.
          </p>
          <label className="field">
            <span>Description</span>
            <input value={pb.description} onChange={(e) => set({ description: e.target.value })} />
          </label>
          {SECTIONS.map(([key, label, hint]) => (
            <label key={key} className="field">
              <span>{label}</span>
              <textarea rows={Math.min(16, Math.max(4, pb[key].split('\n').length + Math.ceil(pb[key].length / 110)))} placeholder={hint} value={pb[key]}
                onChange={(e) => set({ [key]: e.target.value })} />
            </label>
          ))}
          <div className="field">
            <span>Project skills <em className="muted">written into the repo; agents load them when the description matches</em></span>
            {pb.skills.map((k, i) => {
              const bad = k.name.trim() !== '' && !SKILL_NAME.test(k.name.trim());
              return (
                <div className="skill" key={i}>
                  <div className="row">
                    <input placeholder="skill-name" value={k.name} onChange={(e) => setSkill(i, { name: e.target.value })} style={{ maxWidth: 200 }} />
                    <input placeholder="When to use it" value={k.description} onChange={(e) => setSkill(i, { description: e.target.value })} />
                    <button className="ghost danger" title="Remove skill"
                      onClick={() => confirm(`Remove skill "${k.name}"?`) && set({ skills: pb.skills.filter((_, j) => j !== i) })}>×</button>
                  </div>
                  {bad && <p className="error small">Use lowercase letters, numbers and dashes (e.g. run-e2e). This skill is skipped on export until fixed.</p>}
                  <textarea rows={Math.min(14, Math.max(4, k.body.split('\n').length + 1))} placeholder="Step-by-step instructions" value={k.body}
                    onChange={(e) => setSkill(i, { body: e.target.value })} />
                </div>
              );
            })}
            <div>
              <button onClick={() => set({ skills: [...pb.skills, { name: '', description: '', body: '' }] })}>+ Skill</button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
