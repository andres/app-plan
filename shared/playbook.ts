import { Playbook } from './schema.ts';

/** The starter playbook seeded on first run. Users edit it in the planner. */
export function defaultPlaybook(): Playbook {
  return Playbook.parse({
    schemaVersion: 1,
    name: 'Default',
    description: 'Baseline engineering standards for every app.',
    testing: [
      'Every acceptance criterion (AC-n) in plan/SPEC.md has at least one automated test whose name contains its id, e.g. "AC-12: full class cannot be booked".',
      'Unit tests for business logic; API tests for every endpoint, including auth and validation failures; end-to-end browser tests for the main flow of each role.',
      'Typecheck and lint pass with zero errors and zero warnings you introduced.',
      'Never skip, delete, or weaken a test to make it pass. Fix the code, or ask if the test is wrong.',
      'Set up CI (GitHub Actions) in the first milestone: install, typecheck, lint, test on every push. A milestone is not done until CI is green.',
      'Before saying a task is done, run the verify skill and update VERIFY.md.',
    ].join('\n'),
    patterns: [
      'Keep it simple: the fewest files, dependencies and abstractions that do the job. Follow existing patterns in the repo.',
      'Validate every input at the boundary (API handlers, forms) with a schema. Share types between client and server.',
      'Enforce permissions on the server for every protected route, using the roles in the spec. Never rely on hiding UI.',
      'Handle errors explicitly. Users see a clear message; logs get the details. Never swallow errors.',
      'Secrets only in environment variables. Commit a .env.example, never .env.',
      'Database schema changes go through migrations.',
      'Ask before adding a dependency that is not standard for the chosen stack.',
      'Mobile-first, responsive UI. Accessible: labels on inputs, keyboard navigation, readable contrast.',
    ].join('\n'),
    workflow: [
      'Read AGENTS.md, plan/RULES.md and plan/SPEC.md before writing code.',
      'Build in milestones: 1) project setup + CI, 2) data model + API with tests, 3) screens with end-to-end tests, 4) integrations. Commit after each milestone with all checks passing.',
      'Write assumptions to ASSUMPTIONS.md. Ask the user about anything under "Known gaps" before building it.',
      'GitHub repos are private unless the user says otherwise.',
      'Never change production data or infrastructure without asking.',
      'When files in plan/ change, run the plan-sync skill.',
    ].join('\n'),
    tools: [
      'Use the browser (Cloudroom browser-harness skill) to open every screen you build, compare it with the spec, and save a screenshot.',
      'Use the claude-api skill for any feature that calls an LLM.',
    ].join('\n'),
    skills: [
      {
        name: 'verify',
        description: 'Run before saying any task or milestone is done: checks, tests, screenshots, VERIFY.md.',
        body: [
          '1. Run the typecheck, lint and the full test suite. Fix every failure before continuing.',
          '2. List every acceptance criterion id (AC-n) in plan/SPEC.md. For each, find the test that names it. Missing test = write it now.',
          '3. Start the app and open each screen you changed in a real browser. Save screenshots to docs/screenshots/<screen>.png.',
          '4. Rewrite VERIFY.md with: date, commit, check results, and a table | AC | Criterion | Test | Status |.',
          '5. Report honestly: anything failing or untested is listed as such, never hidden.',
        ].join('\n'),
      },
      {
        name: 'plan-sync',
        description: 'Use when files in plan/ changed (the planner pushed a new version) to bring code and tests in line.',
        body: [
          '1. Run `git log --oneline -- plan/` and `git diff <last synced commit> -- plan/` to see what changed. The last synced commit is recorded at the top of VERIFY.md.',
          '2. Summarise the changes: new / changed / removed screens, entities, criteria, rules.',
          '3. Update code and tests to match. Removed criteria: remove or update their tests. New criteria: add tests.',
          '4. Run the verify skill.',
        ].join('\n'),
      },
    ],
  });
}
