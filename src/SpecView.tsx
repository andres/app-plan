import { useMemo, useState } from 'react';
import type { Plan } from '../shared/schema.ts';
import { exportFiles, agentsMd } from '../shared/spec.ts';
import { api, type Config } from './api.ts';
import type { Update } from './Editor.tsx';

const slug = (s: string) => s.toLowerCase().replace(/^example:\s*/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'app';

function download(name: string, content: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
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
  const files = useMemo(() => exportFiles(plan), [plan]);
  const spec = files['plan/SPEC.md'];
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [pushed, setPushed] = useState<{ url: string; created: boolean } | null>(null);
  const repo = plan.repo || (config.githubOwner ? `${config.githubOwner}/${slug(plan.name)}` : '');
  const prompt = repo
    ? `Clone https://github.com/${repo} and build the app it describes. Start by reading AGENTS.md and plan/SPEC.md. Ask me about anything listed under "Known gaps" before building it.`
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
              Writes <code>plan/SPEC.md</code>, <code>plan/plan.json</code>, <code>plan/plan.schema.json</code>, and <code>AGENTS.md</code> if the repo has none. New repos are always private.
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
        <div className="row wrap">
          <button onClick={() => copy(spec, setMsg)}>Copy SPEC.md</button>
          <button onClick={() => download('SPEC.md', spec)}>SPEC.md</button>
          <button onClick={() => download('plan.json', files['plan/plan.json'])}>plan.json</button>
          <button onClick={() => download('plan.schema.json', files['plan/plan.schema.json'])}>plan.schema.json</button>
          <button onClick={() => download('AGENTS.md', agentsMd(plan))}>AGENTS.md</button>
        </div>
      </section>

      <section>
        <h3>SPEC.md preview</h3>
        <pre className="spec-preview">{spec}</pre>
      </section>
    </div>
  );
}
