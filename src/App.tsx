import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { api, type Config, type PlanRow } from './api.ts';
import { Plan } from '../shared/schema.ts';
import { examplePlan } from '../shared/example.ts';
import { Editor } from './Editor.tsx';

function useHash() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return hash;
}

export function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState('');
  const hash = useHash();
  const load = useCallback(() => api.config().then(setConfig, (e) => setError(e.message)), []);
  useEffect(() => void load(), [load]);

  if (error) return <div className="center">Can't reach the server: {error}</div>;
  if (!config) return <div className="center muted">Loading…</div>;
  if (config.authRequired && !config.authed) return <Login onDone={load} />;
  const m = /^#\/plan\/([\w-]+)$/.exec(hash);
  return m ? <Editor key={m[1]} id={m[1]} config={config} /> : <PlanList config={config} onLogout={load} />;
}

function Login({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.login(password);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="center login" onSubmit={submit}>
      <img src="/icon.svg" width={56} height={56} alt="" />
      <h1>App Plan</h1>
      <input type="password" autoFocus placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <button className="primary" disabled={busy}>{busy ? 'Checking…' : 'Log in'}</button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

function PlanList({ config, onLogout }: { config: Config; onLogout: () => void }) {
  const [plans, setPlans] = useState<PlanRow[] | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const refresh = useCallback(() => api.list().then(setPlans, (e) => setError(e.message)), []);
  useEffect(() => void refresh(), [refresh]);

  const open = (id: string) => (location.hash = `#/plan/${id}`);
  const run = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const create = (e: FormEvent) => {
    e.preventDefault();
    run(async () => open((await api.create(name.trim() || 'Untitled app')).id));
  };
  const importFile = (file: File) =>
    run(async () => {
      const parsed = Plan.safeParse(JSON.parse(await file.text()));
      if (!parsed.success) throw new Error(`Not a valid plan.json: ${parsed.error.issues[0]?.message}`);
      open((await api.create(parsed.data.name, parsed.data)).id);
    });

  return (
    <div className="page">
      <header className="list-header">
        <img src="/icon.svg" width={32} height={32} alt="" />
        <h1>App Plan</h1>
        <span className="spacer" />
        {config.authRequired && (
          <button onClick={() => run(async () => { await api.logout(); onLogout(); })}>Log out</button>
        )}
      </header>

      <form className="row" onSubmit={create}>
        <input placeholder="New app name, e.g. Gym booking" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="primary">Create</button>
      </form>
      <div className="row muted small">
        <button onClick={() => run(async () => open((await api.create('Example: Class booking', examplePlan())).id))}>
          Open an example
        </button>
        <label className="button">
          Import plan.json
          <input type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
        </label>
      </div>
      {error && <p className="error">{error}</p>}

      {plans === null ? (
        <p className="muted">Loading…</p>
      ) : plans.length === 0 ? (
        <p className="muted">No plans yet. Create one above, or open the example to see how it works.</p>
      ) : (
        <ul className="plan-list">
          {plans.map((p) => (
            <li key={p.id}>
              <a href={`#/plan/${p.id}`}>
                <strong>{p.name}</strong>
                <span className="muted small">Edited {new Date(p.updatedAt).toLocaleString()}</span>
              </a>
              <button
                className="ghost danger"
                title="Delete plan"
                onClick={() => confirm(`Delete "${p.name}"? This cannot be undone.`) && run(async () => { await api.remove(p.id); await refresh(); })}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
