// PROTOTYPE (M0). Throwaway seed data, in memory only. Reload to reset.
(() => {
  const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;
  const now = Date.now();
  const ago = (ms) => now - ms;

  const members = [
    { id: 'amirali', kind: 'human', name: 'Amirali Beigi', short: 'Amirali', initials: 'AB', hue: 250 },
    { id: 'noor', kind: 'human', name: 'Noor Haddad', short: 'Noor', initials: 'NH', hue: 20 },
    { id: 'theo', kind: 'human', name: 'Theo Lindqvist', short: 'Theo', initials: 'TL', hue: 160 },
    { id: 'ferro', kind: 'agent', name: 'Ferro', short: 'Ferro', initials: 'Fe', glyph: 'Fe',
      about: 'Coding agent. Works ENG issues end to end and opens pull requests.' },
    { id: 'sable', kind: 'agent', name: 'Sable', short: 'Sable', initials: 'Sa', glyph: 'Sa',
      about: 'Ops agent. Runs runbooks, watches deploys and triages alerts.' },
  ];

  // Every status maps to one fixed category. `fill` drives the status glyph.
  const statuses = {
    ENG: [
      { id: 'eng-backlog', name: 'Backlog', category: 'backlog' },
      { id: 'eng-todo', name: 'Todo', category: 'todo' },
      { id: 'eng-progress', name: 'In Progress', category: 'started', fill: 0.5 },
      { id: 'eng-review', name: 'In Review', category: 'started', fill: 0.75 },
      { id: 'eng-done', name: 'Done', category: 'done' },
      { id: 'eng-canceled', name: 'Canceled', category: 'canceled' },
    ],
    OPS: [
      { id: 'ops-backlog', name: 'Backlog', category: 'backlog' },
      { id: 'ops-todo', name: 'Todo', category: 'todo' },
      { id: 'ops-progress', name: 'In Progress', category: 'started', fill: 0.5 },
      { id: 'ops-monitoring', name: 'Monitoring', category: 'started', fill: 0.75 },
      { id: 'ops-done', name: 'Done', category: 'done' },
      { id: 'ops-canceled', name: 'Canceled', category: 'canceled' },
    ],
  };

  const teams = [
    { key: 'ENG', name: 'Engineering' },
    { key: 'OPS', name: 'Operations' },
  ];

  // Labels: organization-wide (team: null) or per team. Hue is decorative only.
  const labels = [
    { id: 'bug', name: 'Bug', team: null, hue: 25 },
    { id: 'feature', name: 'Feature', team: null, hue: 280 },
    { id: 'improvement', name: 'Improvement', team: null, hue: 200 },
    { id: 'api', name: 'api', team: 'ENG', hue: 60 },
    { id: 'mcp', name: 'mcp', team: 'ENG', hue: 320 },
    { id: 'web', name: 'web', team: 'ENG', hue: 230 },
    { id: 'db', name: 'db', team: 'ENG', hue: 140 },
    { id: 'infra', name: 'infra', team: 'OPS', hue: 100 },
    { id: 'incident', name: 'incident', team: 'OPS', hue: 15 },
  ];

  // priority: 0 none, 1 urgent, 2 high, 3 medium, 4 low
  const I = (team, number, title, status, priority, labels, assignee, delegate, updated, extra = {}) =>
    ({ id: `${team}-${number}`, team, number, title, status, priority, labels, assignee, delegate,
       updatedAt: ago(updated), createdAt: ago(updated + 3 * DAY), parent: null, description: '', ...extra });

  const issues = [
    I('ENG', 142, 'Keep old identifiers resolving after a team key rename', 'eng-todo', 2, ['bug', 'db'], 'amirali', 'ferro', 40 * MIN, {
      description:
`Renaming a team key (\`PLAT\` → \`OPS\`) or moving an issue to another team changes its identifier. Agents keep old identifiers in context and in pull request descriptions, so **old identifiers must keep resolving** everywhere.

## Acceptance

- [ ] \`GET /api/v1/issues/PLAT-12\` returns the issue now named \`OPS-12\`
- [ ] \`edict://issue/PLAT-12\` resolves in MCP
- [ ] Web URLs redirect to the current identifier
- [x] Decision recorded in ADR 0002

## Notes

Lookups go through the data-access layer, so \`org_id\` is enforced on the alias table too.`,
    }),
    I('ENG', 143, 'Alias table and migration for old identifiers', 'eng-todo', 2, ['db'], 'amirali', 'ferro', 40 * MIN, { parent: 'ENG-142' }),
    I('ENG', 144, 'Resolve aliases in MCP resources', 'eng-backlog', 3, ['mcp'], 'amirali', null, 40 * MIN, { parent: 'ENG-142' }),
    I('ENG', 141, '`update_issue` should accept status category names', 'eng-progress', 3, ['mcp', 'improvement'], 'noor', 'ferro', 6 * MIN, {
      description: `Agents send \`"status": "In Progress"\` to teams whose statuses are named differently. Accept a **status category** as well as a status name, and list the valid options in the error.`,
    }),
    I('ENG', 140, 'Webhook deliveries retry with exponential backoff', 'eng-progress', 2, ['api', 'feature'], 'theo', null, 2 * HOUR, {
      description: `Retry failed deliveries for about 24 hours with exponential backoff, then disable the subscription and alert admins.`,
    }),
    I('ENG', 139, 'Peek panel loses scroll position after a realtime patch', 'eng-todo', 3, ['web', 'bug'], 'noor', null, 5 * HOUR),
    I('ENG', 138, 'Merge view for stale human writes', 'eng-backlog', 3, ['web', 'feature'], 'theo', null, 1 * DAY),
    I('ENG', 137, 'Rate limit agent issue creation to 60 per hour', 'eng-review', 2, ['api'], 'amirali', 'ferro', 3 * HOUR),
    I('ENG', 136, 'Command palette ranks recent issues first', 'eng-todo', 4, ['web', 'improvement'], 'noor', null, 2 * DAY),
    I('ENG', 135, '`post_progress` rejects links without a title', 'eng-todo', 1, ['mcp', 'bug'], 'amirali', 'ferro', 25 * MIN),
    I('ENG', 134, 'Soft delete comments into the trash', 'eng-progress', 3, ['api', 'feature'], 'theo', null, 7 * HOUR),
    I('ENG', 133, 'Undo for bulk label edits', 'eng-backlog', 4, ['web', 'feature'], null, null, 4 * DAY),
    I('ENG', 132, 'Migrations take an advisory lock on boot', 'eng-done', 2, ['db'], 'amirali', null, 3 * DAY),
    I('ENG', 131, 'OpenAPI spec drops nullable on `dueDate`', 'eng-done', 3, ['api', 'bug'], 'noor', 'ferro', 2 * DAY),
    I('ENG', 130, 'Board view: drag across status categories', 'eng-backlog', 3, ['web'], null, null, 6 * DAY),
    I('ENG', 129, 'Pause switch also revokes OAuth grants', 'eng-review', 1, ['api', 'bug'], 'theo', null, 50 * MIN),
    I('ENG', 128, 'Full-text search ignores identifiers', 'eng-todo', 3, ['db', 'bug'], 'noor', null, 1 * DAY),
    I('ENG', 127, 'Markdown tables lose alignment on round-trip', 'eng-backlog', 4, ['web', 'bug'], 'amirali', null, 8 * DAY),
    I('ENG', 126, 'Use Yjs for description editing', 'eng-canceled', 0, ['feature'], 'theo', null, 9 * DAY),
    I('ENG', 125, 'Seed script for the dogfood instance', 'eng-done', 4, ['db', 'improvement'], 'amirali', 'ferro', 4 * DAY),

    I('OPS', 31, 'Rotate Postgres backups to the new bucket', 'ops-progress', 2, ['infra'], 'theo', 'sable', 4 * MIN),
    I('OPS', 30, 'Alert admins when a webhook subscription disables itself', 'ops-todo', 3, ['infra'], 'noor', 'sable', 3 * HOUR),
    I('OPS', 29, 'Dokploy deploy drops WebSocket connections', 'ops-progress', 1, ['incident'], 'amirali', null, 35 * MIN),
    I('OPS', 28, 'Publish images to GHCR with semver tags', 'ops-done', 3, ['infra'], 'amirali', 'sable', 2 * DAY),
    I('OPS', 27, 'Rename team key PLAT to OPS on the dogfood instance', 'ops-done', 4, [], 'theo', null, 5 * DAY),
    I('OPS', 26, 'Copyable invite links expire after 7 days', 'ops-backlog', 4, [], 'noor', null, 6 * DAY),
    I('OPS', 25, 'Load test the 600 requests per minute agent limit', 'ops-todo', 3, ['infra'], null, 'sable', 1 * DAY),
    I('OPS', 24, 'Nightly restore drill', 'ops-backlog', 3, ['infra'], 'theo', null, 7 * DAY),
  ];

  // Relations are stored once; the core derives the inverse side.
  const relations = [
    { from: 'ENG-132', type: 'blocks', to: 'ENG-142' },
    { from: 'ENG-142', type: 'related', to: 'ENG-128' },
    { from: 'ENG-142', type: 'related', to: 'OPS-27' },
    { from: 'ENG-142', type: 'blocks', to: 'ENG-144' },
    { from: 'ENG-135', type: 'related', to: 'ENG-141' },
    { from: 'ENG-140', type: 'blocks', to: 'OPS-30' },
    { from: 'ENG-126', type: 'duplicate', to: 'ENG-138' },
    { from: 'ENG-129', type: 'related', to: 'ENG-137' },
  ];

  const comments = [
    { issueId: 'ENG-142', author: 'noor', at: ago(2 * DAY),
      body: 'This bit us on the dogfood instance when we renamed `PLAT` to `OPS`. Links in old pull request descriptions now 404.' },
    { issueId: 'ENG-142', author: 'amirali', at: ago(45 * MIN),
      body: 'Delegating to @Ferro. Write the alias row in the same transaction as the rename event, same as every other change.' },
    { issueId: 'ENG-135', author: 'amirali', at: ago(3 * HOUR), body: 'Seen from Claude Code too. The error does not say which field is missing.' },
    { issueId: 'ENG-141', author: 'noor', at: ago(1 * HOUR), body: 'Keep the error listing the valid options, agents recover from it in one retry.' },
    { issueId: 'OPS-29', author: 'theo', at: ago(30 * MIN), body: 'Happens on every redeploy. The proxy closes idle sockets after 60s.' },
  ];

  // Events: "Agent X on behalf of Y" when a human triggered it through OAuth.
  const events = [
    { issueId: 'ENG-142', actor: 'amirali', text: 'created the issue', at: ago(3 * DAY) },
    { issueId: 'ENG-142', actor: 'amirali', text: 'delegated to Ferro', at: ago(44 * MIN) },
    { issueId: 'ENG-137', actor: 'ferro', onBehalfOf: 'amirali', text: 'moved to In Review', at: ago(3 * HOUR) },
    { issueId: 'ENG-141', actor: 'noor', text: 'delegated to Ferro', at: ago(70 * MIN) },
    { issueId: 'ENG-141', actor: 'ferro', onBehalfOf: 'noor', text: 'moved to In Progress', at: ago(65 * MIN) },
    { issueId: 'OPS-31', actor: 'sable', text: 'moved to In Progress', at: ago(40 * MIN) },
  ];

  // Progress updates already on issues before the page loads.
  const progress = [
    { issueId: 'ENG-137', agent: 'ferro', state: 'working', at: ago(5 * HOUR), msg: 'Adding a per-agent counter keyed on `agent_id` and the hour bucket.' },
    { issueId: 'ENG-137', agent: 'ferro', state: 'done', at: ago(3 * HOUR), msg: 'Limit enforced in the data-access layer. Returns `429` with `Retry-After`.',
      links: [{ kind: 'pr', title: '#311 Rate limit agent issue creation', url: '#' }] },
    { issueId: 'ENG-135', agent: 'ferro', state: 'needs input', at: ago(20 * MIN),
      msg: 'Two options: default the title to the URL host, or reject with an error that names `links[].title`. Which one, @amirali?' },
    { issueId: 'ENG-141', agent: 'ferro', state: 'working', at: ago(60 * MIN), msg: 'Mapping status names to categories per team from `get_team_context`.' },
    { issueId: 'ENG-131', agent: 'ferro', state: 'done', at: ago(2 * DAY), msg: 'Fixed the Zod schema, regenerated `packages/client`.',
      links: [{ kind: 'pr', title: '#296 Keep nullable on dueDate', url: '#' }] },
    { issueId: 'ENG-125', agent: 'ferro', state: 'done', at: ago(4 * DAY), msg: 'Seed script lands 2 teams, 28 issues and both agents.' },
    { issueId: 'OPS-31', agent: 'sable', state: 'working', at: ago(38 * MIN), msg: 'Running the backup runbook against `edict-backups-2026`.' },
    { issueId: 'OPS-28', agent: 'sable', state: 'done', at: ago(2 * DAY), msg: 'Tags `latest`, `1`, `1.4` and `1.4.2` publish on release.' },
    { issueId: 'OPS-25', agent: 'sable', state: 'blocked', at: ago(1 * DAY), msg: 'Blocked: no staging instance to point the load test at.' },
  ];

  // The scripted run on ENG-142. `at` is milliseconds after the run starts.
  const scripts = {
    'ENG-142': [
      { at: 600, status: 'In Progress' },
      { at: 900, state: 'working', msg: 'Picked this up. Reading `packages/db/schema/issues.ts` and the identifier lookup in `apps/server/src/routes/issues.ts`.' },
      { at: 5200, state: 'working', msg:
`Found it. Lookups match \`team.key\` and \`number\` directly, so \`PLAT-12\` stops resolving the moment the key changes.

Plan:
1. Add \`issue_identifier_alias (org_id, identifier, issue_id)\`
2. Write an alias row on rename and on move, in the same transaction as the event
3. Fall back to the alias table when the direct lookup misses` },
      { at: 10500, state: 'working', msg: 'Tests first. `rename-team-key.test.ts` has 4 cases, all red as expected.' },
      { at: 14500, state: 'working', msg: 'Migration `0014_identifier_alias.sql` written. Alias rows carry `org_id`, so lookups stay inside the data-access layer.' },
      { at: 15000, sub: ['ENG-143', 'Done'] },
      { at: 19000, state: 'working', msg: 'Fallback implemented. `pnpm test --filter server`: **48 passed**, 0 failed.' },
      { at: 22500, state: 'working', msg: 'Opened a pull request.', links: [{ kind: 'pr', title: '#318 Keep old identifiers resolving', url: '#' }] },
      { at: 26000, state: 'done', msg: 'Ready for review. One question for @amirali: should aliases survive a team going to the trash and coming back? I kept them for now.' },
      { at: 26300, status: 'In Review' },
    ],
  };

  // Slow background updates so the rest of the world stays alive.
  const ambient = {
    'ENG-141': { agent: 'ferro', every: 11000, msgs: [
      'Added `resolveStatus(team, value)` that accepts a name or a category.',
      'Error now lists valid options: `Backlog, Todo, In Progress, In Review, Done, Canceled`.',
      'Contract test for `update_issue` with `"status": "started"` passes.',
      'Checking the OPS team, where the second started status is named `Monitoring`.',
    ] },
    'OPS-31': { agent: 'sable', every: 14000, msgs: [
      'Backup `2026-10-16T09:00Z` copied, checksum matches.',
      'Updating `BACKUP_BUCKET` in Dokploy for the dogfood instance.',
      'Restore test on a scratch database: 28 issues, 5 comments, event log intact.',
    ] },
  };

  window.EDICT_DATA = { members, statuses, teams, labels, issues, relations, comments, events, progress, scripts, ambient };
})();
