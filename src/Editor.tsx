import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, type Config } from './api.ts';
import { VIEWS, type Plan, type View } from '../shared/schema.ts';
import { lintPlan } from '../shared/spec.ts';
import { Canvas } from './Canvas.tsx';
import { Overview } from './Overview.tsx';
import { SpecView } from './SpecView.tsx';

export type Update = (fn: (p: Plan) => Plan) => void;
type Tab = 'overview' | View | 'spec';
type Status = 'saved' | 'unsaved' | 'saving' | 'error' | 'conflict';

const TABS: [Tab, string][] = [
  ['overview', 'Overview'],
  ...(Object.entries(VIEWS) as [View, (typeof VIEWS)[View]][]).map(([k, v]) => [k, v.label] as [Tab, string]),
  ['spec', 'Spec & export'],
];

export function Editor({ id, config }: { id: string; config: Config }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loadError, setLoadError] = useState('');
  const [status, setStatus] = useState<Status>('saved');
  const [tab, setTab] = useState<Tab>(() => (sessionStorage.getItem(`tab:${id}`) as Tab) || 'overview');
  const rev = useRef(0);
  const latest = useRef<Plan | null>(null);
  const dirty = useRef(false);
  const saving = useRef<Promise<void> | null>(null);
  const blocked = useRef(false); // conflict: stop saving until reload
  latest.current = plan;

  useEffect(() => {
    api.get(id).then(
      (r) => { rev.current = r.rev; setPlan(r.plan); },
      (e) => setLoadError(e.message),
    );
  }, [id]);
  useEffect(() => sessionStorage.setItem(`tab:${id}`, tab), [id, tab]);

  const flush = useCallback((): Promise<void> => {
    if (saving.current) return saving.current.then(() => (dirty.current ? flush() : undefined));
    if (!dirty.current || blocked.current || !latest.current) return Promise.resolve();
    dirty.current = false;
    setStatus('saving');
    const p = (async () => {
      try {
        rev.current = (await api.save(id, rev.current, latest.current!)).rev;
        setStatus(dirty.current ? 'unsaved' : 'saved');
      } catch (e) {
        dirty.current = true;
        if (e instanceof ApiError && e.status === 409) {
          blocked.current = true;
          setStatus('conflict');
        } else {
          setStatus('error');
          setTimeout(() => void flush(), 5000);
        }
      } finally {
        saving.current = null;
      }
    })();
    saving.current = p;
    return p.then(() => (dirty.current && !blocked.current ? flush() : undefined));
  }, [id]);

  const update: Update = useCallback((fn) => {
    dirty.current = true;
    setPlan((p) => (p ? fn(p) : p));
  }, []);

  // Autosave shortly after the last edit.
  useEffect(() => {
    if (!plan || !dirty.current || blocked.current) return;
    setStatus((s) => (s === 'saving' ? s : 'unsaved'));
    const t = setTimeout(() => void flush(), 600);
    return () => clearTimeout(t);
  }, [plan, flush]);

  // Save right away when the app is backgrounded (phones kill tabs) and warn before closing with unsaved edits.
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && void flush();
    const onUnload = (e: BeforeUnloadEvent) => { if (dirty.current) e.preventDefault(); };
    document.addEventListener('visibilitychange', onHide);
    addEventListener('beforeunload', onUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      removeEventListener('beforeunload', onUnload);
    };
  }, [flush]);

  const gaps = useMemo(() => (plan ? lintPlan(plan) : []), [plan]);

  if (loadError) return <div className="center">Couldn't open plan: {loadError} <a href="#/">Back</a></div>;
  if (!plan) return <div className="center muted">Loading…</div>;

  return (
    <div className="editor">
      <header className="editor-header">
        <a href="#/" className="button ghost" title="All plans" onClick={() => void flush()}>←</a>
        <input
          className="plan-name"
          value={plan.name}
          onChange={(e) => { const name = e.target.value; update((p) => ({ ...p, name })); }}
          aria-label="Plan name"
        />
        <span className={`status status-${status}`}>
          {{ saved: 'Saved', unsaved: 'Unsaved', saving: 'Saving…', error: 'Offline, retrying…', conflict: 'Changed elsewhere' }[status]}
        </span>
      </header>
      {status === 'conflict' && (
        <div className="banner">
          This plan was changed on another device. Your latest edits here were not saved.{' '}
          <button onClick={() => location.reload()}>Reload latest</button>
        </div>
      )}
      <nav className="tabs">
        {TABS.map(([k, label]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
            {label}
            {k === 'spec' && gaps.length > 0 && <span className="badge">{gaps.length}</span>}
          </button>
        ))}
      </nav>
      <main className="editor-main">
        {tab === 'overview' && <Overview plan={plan} update={update} />}
        {(tab === 'screens' || tab === 'data' || tab === 'architecture') && (
          <Canvas key={tab} view={tab} plan={plan} update={update} />
        )}
        {tab === 'spec' && <SpecView id={id} plan={plan} gaps={gaps} config={config} update={update} saveNow={flush} />}
      </main>
    </div>
  );
}
