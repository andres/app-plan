// Pushes plan files to a GitHub repo as one commit, creating the repo (always private) if needed.
// Uses the REST API directly so the server needs no git binary.

type Files = Record<string, string>;

export async function pushToGitHub(opts: {
  token: string;
  repo: string; // owner/name
  files: Files; // always written
  merges: Record<string, (existing: string | null) => string>; // combined with the file already in the repo
  message: string;
}): Promise<{ url: string; commit: string; created: boolean }> {
  const { token, files, merges, message } = opts;
  const m = /^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/.exec(opts.repo.trim());
  if (!m) throw new Error('Repo must look like owner/name.');
  const [, owner, name] = m;

  const gh = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`https://api.github.com${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'app-plan',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    return { status: res.status, data: data as any };
  };
  const fail = (what: string, r: { status: number; data: any }) =>
    new Error(`GitHub ${what} failed (${r.status}): ${r.data?.message ?? 'unknown error'}`);

  let created = false;
  let repo = await gh('GET', `/repos/${owner}/${name}`);
  if (repo.status === 404) {
    const me = await gh('GET', '/user');
    if (me.status !== 200) throw fail('auth check', me);
    const body = { name, private: true, auto_init: true, description: 'App plan from the planner' };
    const isMe = me.data.login.toLowerCase() === owner.toLowerCase();
    repo = await gh('POST', isMe ? '/user/repos' : `/orgs/${owner}/repos`, body);
    if (repo.status !== 201) throw fail('repo creation', repo);
    if (repo.data.private !== true) throw new Error(`Repo ${owner}/${name} was created but is not private. Fix it on GitHub.`);
    created = true;
  } else if (repo.status !== 200) {
    throw fail('repo lookup', repo);
  }

  const branch: string = repo.data.default_branch;
  // A freshly auto-initialised repo can take a moment before its branch is readable.
  let ref: { status: number; data: any } = { status: 0, data: null };
  for (let i = 0; i < 5; i++) {
    ref = await gh('GET', `/repos/${owner}/${name}/git/ref/heads/${branch}`);
    if (ref.status === 200) break;
    await new Promise((r) => setTimeout(r, 800));
  }
  if (ref.status !== 200) throw fail('branch lookup (is the repo empty? add a README first)', ref);
  const parentSha: string = ref.data.object.sha;
  const parent = await gh('GET', `/repos/${owner}/${name}/git/commits/${parentSha}`);
  if (parent.status !== 200) throw fail('commit lookup', parent);

  const all: Files = { ...files };
  for (const [path, merge] of Object.entries(merges)) {
    const cur = await gh('GET', `/repos/${owner}/${name}/contents/${path}?ref=${branch}`);
    if (cur.status !== 200 && cur.status !== 404) throw fail(`read ${path}`, cur);
    const existing = cur.status === 200 ? Buffer.from(cur.data.content ?? '', 'base64').toString('utf8') : null;
    const next = merge(existing);
    if (next !== existing) all[path] = next;
  }

  const tree = await gh('POST', `/repos/${owner}/${name}/git/trees`, {
    base_tree: parent.data.tree.sha,
    tree: Object.entries(all).map(([path, content]) => ({ path, mode: '100644', type: 'blob', content })),
  });
  if (tree.status !== 201) throw fail('tree creation', tree);
  if (tree.data.sha === parent.data.tree.sha) {
    return { url: repo.data.html_url, commit: parentSha, created };
  }
  const commit = await gh('POST', `/repos/${owner}/${name}/git/commits`, {
    message,
    tree: tree.data.sha,
    parents: [parentSha],
  });
  if (commit.status !== 201) throw fail('commit', commit);
  const upd = await gh('PATCH', `/repos/${owner}/${name}/git/refs/heads/${branch}`, { sha: commit.data.sha });
  if (upd.status !== 200) throw fail('branch update', upd);
  return { url: repo.data.html_url, commit: commit.data.sha, created };
}
