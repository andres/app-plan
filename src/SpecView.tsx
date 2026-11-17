import { useEffect, useMemo, useState } from 'react';
import type { Plan, Playbook } from '../shared/schema.ts';
import { exportAll } from '../shared/spec.ts';
import { zip } from './zip.ts';
import { api, type Config } from './api.ts';
import type { Update } from './Editor.tsx';

const slug = (s: string) => s.toLowerCase().replace(/^example:\s*/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'app';

function download(name: string, content: string | Blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(typeof content === 'string' ? new Blob([content], { type: 'text/plain' }) : content);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function copy(text: string, done: (msg: string) => void) {
  try {
    await navigator.clipboard.writeText(text);
    done('Copied');
  } catch {
    done('Copy failed. Select the text and copy it by hand.');
  }
}

export function SpecView({ id, plan, gaps, config, update, saveNow }: {
  id: string; plan: Plan; gaps: string[]; config: Config; update: Update; saveNow: () => Promise<void>;
}) {
  const [playbook, setPlaybook] = useState<Playbook | null>(null);
  useEffect(() => {
    if (!plan.playbookId) return setPlaybook(null);
    api.playbooks.get(plan.playbookId).then((r) => setPlaybook(r.doc), () => setPlaybook(null));
  }, [plan.playbookId]);
  const files = useMemo(() => exportAll(plan, playbook), [plan, playbook]);
  const [preview, setPreview] = useState('plan/SPEC.md');
  const spec = files['plan/SPEC.md'];
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [pushed, setPushed] = useState<{ url: string; created: boolean } | null>(null);
  const repo = plan.repo || (config.githubOwner ? `${config.githubOwner}/${slug(plan.name)}` : '');
  const prompt = repo
    ? `Clone https://github.com/${repo} and build the app it describes. Follow AGENTS.md: read plan/RULES.md (how to build, including tests) and plan/SPEC.md (what to build). Ask me about anything under "Known gaps" before building it. Work milestone by milestone and run the verify skill before saying a milestone is done.`
    : '';

  const push = async () => {
    setBusy(true);
    setMsg('');
    try {
      if (!plan.repo) update((p) => ({ ...p, repo }));
      await saveNow();
      const res = await api.push(id, repo);
      setPushed(res);
      setMsg(res.created ? 'Created a private repo and pushed the plan.' : 'Pushed.');
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page spec">
      {gaps.length > 0 ? (
        <div className="gaps">
          <strong>{gaps.length} gap{gaps.length > 1 ? 's' : ''} the builder would have to guess about</strong>
          <ul>{gaps.map((g) => <li key={g}>{g}</li>)}</ul>
          <p className="muted small">They are listed in the spec as open questions, so you can still export.</p>
        </div>
      ) : (
        <div className="gaps ok">No gaps flagged.</div>
      )}

      <section>
        <h3>Send to Cloudroom</h3>
        {config.github ? (
          <>
            <div className="row">
              <input
                placeholder="owner/repo"
                value={repo}
                onChange={(e) => { const v = e.target.value.trim(); update((p) => ({ ...p, repo: v })); }}
              />
              <button className="primary" disabled={busy || !repo} onClick={push}>{busy ? 'Pushing…' : 'Push to GitHub'}</button>
            </div>
            <p className="muted small">
              Overwrites <code>plan/</code> and the playbook's skills in <code>.claude/skills/</code>. Updates only the planner's block in <code>AGENTS.md</code> and makes sure <code>CLAUDE.md</code> imports it, so anything else there is kept. New repos are always private.
            </p>
            {pushed && <p><a href={pushed.url} target="_blank" rel="noreferrer">{pushed.url}</a></p>}
          </>
        ) : (
          <p className="muted small">Set GITHUB_TOKEN on the server to push plans to GitHub. Until then, download the files below.</p>
        )}
        {prompt && (
          <>
            <p className="small">Then start a Cloudroom thread with this prompt:</p>
            <pre className="prompt">{prompt}</pre>
            <button onClick={() => copy(prompt, setMsg)}>Copy prompt</button>
          </>
        )}
        {msg && <p className="msg">{msg}</p>}
      </section>

      <section>
        <h3>Files</h3>
        {!playbook && <p className="muted small">No playbook selected (Overview tab), so RULES.md only has the basics.</p>}
        <div className="row wrap">
          <button className="primary" onClick={() => download(`${slug(plan.name)}-plan.zip`, zip(files))}>Download all (.zip)</button>
          <button onClick={() => copy(spec, setMsg)}>Copy SPEC.md</button>
        </div>
        <div className="row wrap file-tabs">
          {Object.keys(files).map((f) => (
            <button key={f} className={`small ${preview === f ? 'active' : ''}`} onClick={() => setPreview(f)}>{f}</button>
          ))}
        </div>
        <pre className="spec-preview">{files[preview] ?? ''}</pre>
      </section>
    </div>
  );
}
