import { useMemo, useState, useEffect } from 'react';
import { api, type Config } from './api.ts';
import { VIEWS, type Plan, type View } from '../shared/schema.ts';
import { lintPlan } from '../shared/spec.ts';
import { useAutosave, STATUS_TEXT, type Update as U } from './useAutosave.ts';
import { Canvas } from './Canvas.tsx';
import { Overview } from './Overview.tsx';
import { SpecView } from './SpecView.tsx';

export type Update = U<Plan>;
type Tab = 'overview' | View | 'spec';

const TABS: [Tab, string][] = [
  ['overview', 'Overview'],
  ...(Object.entries(VIEWS) as [View, (typeof VIEWS)[View]][]).map(([k, v]) => [k, v.label] as [Tab, string]),
  ['spec', 'Spec & export'],
];

export function SaveStatusBadge({ status }: { status: keyof typeof STATUS_TEXT }) {
  return <span className={`status status-${status}`}>{STATUS_TEXT[status]}</span>;
}

export function ConflictBanner() {
  return (
    <div className="banner">
      This was changed on another device. Your latest edits here were not saved.{' '}
      <button onClick={() => location.reload()}>Reload latest</button>
    </div>
  );
}

export function Editor({ id, config }: { id: string; config: Config }) {
  const { doc: plan, loadError, status, update, flush } = useAutosave(api.plans, id);
  const [tab, setTab] = useState<Tab>(() => (sessionStorage.getItem(`tab:${id}`) as Tab) || 'overview');
  useEffect(() => sessionStorage.setItem(`tab:${id}`, tab), [id, tab]);
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
        <SaveStatusBadge status={status} />
      </header>
      {status === 'conflict' && <ConflictBanner />}
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
