# App Plan

Model an app visually — screens, data, architecture — and export a spec that coding agents (Cloudroom threads) build from.

- **Overview:** summary, goals, out of scope, constraints, roles.
- **Screens:** one card per page, arrows for navigation, a list of what is on each screen.
- **Data:** entities with typed fields, relations with cardinality.
- **Architecture:** frontend, backend, databases, outside services.
- **Acceptance criteria** on every card (`AC-n`, stable ids). Each must get an automated test that names it; the agent reports coverage in `VERIFY.md`.
- **Playbooks:** reusable engineering standards (testing, patterns, workflow, tools, project skills). A "Default" playbook is seeded on first run; each plan picks one and can add its own rules.
- **Spec & export:** a generated `SPEC.md` (with Mermaid diagrams), the gaps a builder would have to guess about, file downloads, and **Push to GitHub**.

Installable as a PWA on desktop and phone (open the site, then "Install app" / "Add to Home Screen").

## What agents get

Push writes this to the repo (new repos are always **private**):

```
AGENTS.md              # planner-managed block (rest of the file is kept): read order, definition of done
CLAUDE.md              # imports AGENTS.md (Claude Code reads CLAUDE.md, not AGENTS.md)
plan/SPEC.md           # what to build: screens, data, architecture, acceptance criteria, known gaps
plan/RULES.md          # how to build: playbook + app rules + definition of done
plan/plan.json         # the plan as structured data (source of truth)
plan/plan.schema.json  # JSON Schema describing every field
.claude/skills/*/SKILL.md  # the playbook's project skills (e.g. verify, plan-sync)
```

Then start a Cloudroom thread with the prompt shown on the Spec tab.

## Stack

React + Vite + React Flow (UI, PWA) · Hono on Node 24 (runs TypeScript directly) · SQLite via `node:sqlite` · Zod schema shared by UI, server and export (`shared/`).

## Develop

```bash
npm install
npm run dev        # API on :8787 + Vite on :5173 (no password in dev)
npm test           # spec generator + API tests
npm run typecheck
```

## Deploy on DigitalOcean

1. Create an Ubuntu droplet (the $6/month 1 GB size is enough). Turn on droplet backups — the SQLite database lives in a Docker volume on it.
2. Point a DNS A record (e.g. `plan.yourdomain.com`) at the droplet's IP.
3. On the droplet: clone this repo, then run `bash deploy/setup-droplet.sh`. The first run creates `.env`; fill it in and run the script again.
4. Open `https://plan.yourdomain.com`. Caddy gets the HTTPS certificate automatically.

Update later with `bash deploy/update.sh` (run on the droplet in the cloned repo).

`GITHUB_TOKEN`: a classic token with the `repo` scope (simplest), or a fine-grained token with **Administration** (to create repos) and **Contents** read/write.
