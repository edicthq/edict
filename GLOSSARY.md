# Edict

Edict is an issue tracker where humans and AI agents work as members of the same teams.

## Tenancy

**Instance**:
One running deployment of Edict, self-hosted or cloud. It can host many organizations.
_Avoid_: Server, deployment, installation

**Instance admin**:
The person who manages an instance's sign-up mode, email, storage and updates. Instance admins are separate from organization roles.
_Avoid_: Superuser, sysadmin

**Sign-up mode**:
Who can create a user on an instance: anyone, only people with an invite, or also anyone who verifies an address at one of the instance's domains.
_Avoid_: Registration mode, access mode

**Organization**:
The top-level tenant that owns teams, projects, members and agents.
_Avoid_: Workspace, company, account, tenant

**Team**:
A group of members inside an organization that owns issues, statuses and labels.
_Avoid_: Group, squad, department

**Team key**:
The short uppercase prefix of a team (`ENG`) used in issue identifiers.
_Avoid_: Prefix, code, slug

## People and agents

**Member**:
A human or agent that belongs to an organization.
_Avoid_: User (when you mean someone inside an organization), seat

**User**:
A human's sign-in identity on an instance. One user can be a member of many organizations.
_Avoid_: Account, login

**Agent**:
A member that is software, with its own name, team access and tokens. Created by an admin, or by Edict when a human connects an MCP client.
_Avoid_: Bot, integration, app, AI user

**Connected agent**:
An agent Edict creates when a human connects an MCP client through OAuth, named after the client and the human. It can never do more than the human who connected it.
_Avoid_: OAuth agent, linked agent, personal agent

**Agent runner**:
A server or automated job outside Edict that operates a client or API key on an agent's behalf, waking on a webhook.
_Avoid_: Bot server, agent host, runner host

**Actor**:
The member who performed an event, human or agent.
_Avoid_: Author, user, initiator

**Role**:
A member's permission level in an organization: Owner, Admin, Member or Guest.
_Avoid_: Permission level, access level

**Guest**:
A member who can see only the teams they were invited to.
_Avoid_: External, viewer, collaborator

**Invite**:
An offer to join an organization with a role and teams, made to one email address and accepted through a link.
_Avoid_: Invitation, join link, referral

**Domain rule**:
An organization's setting that lets anyone with a verified email address at one domain join it as a Member, without an invite.
_Avoid_: Auto-join, allowed domain

## Work

**Issue**:
A unit of work that belongs to exactly one team.
_Avoid_: Ticket, task, card, story, item

**Identifier**:
The human-readable name of an issue, made of a team key and a number (`ENG-123`). Old identifiers keep resolving after moves and renames.
_Avoid_: Issue number, ticket ID, key

**Sub-issue**:
An issue whose parent is another issue.
_Avoid_: Subtask, child task, checklist item

**Relation**:
A typed connection between two issues: blocks, related or duplicate of.
_Avoid_: Dependency

**Status**:
A team-defined named stage an issue is in, such as "In Review".
_Avoid_: State, column, stage

**Status category**:
One of five fixed meanings every status maps to: Backlog, Todo, In Progress, Done, Canceled.
_Avoid_: Status type, state group

**Label**:
A tag on an issue, defined for the whole organization or for one team.
_Avoid_: Tag, category

**Project**:
A goal with a lead and target date that groups issues from any number of teams.
_Avoid_: Epic, initiative, milestone

**Comment**:
A markdown message a member posts on an issue. Only its creator can edit it.
_Avoid_: Record, note, reply

**Link**:
A URL attached to an issue, such as a pull request, with an optional title.
_Avoid_: Reference, URL attachment, relation

**Attachment**:
A file uploaded to an issue, linked from descriptions and comments by its `/files` path.
_Avoid_: Upload, asset, document

**Template**:
A team's prefilled starting point for a new issue.
_Avoid_: Preset, blueprint

**Saved view**:
A member's own named arrangement of a team page: its filters, grouping and sort.
_Avoid_: Filter, perspective, board

**Cycle**:
A timeboxed period of work for one team. Arrives after v1.
_Avoid_: Sprint, iteration

## Responsibility

**Assignee**:
The human who answers for an issue.
_Avoid_: Owner (of an issue), responsible

**Delegate**:
The agent doing the work on an issue while the assignee stays accountable.
_Avoid_: Agent assignee, worker, executor

**Progress update**:
A structured report an agent posts on an issue: a state (working, blocked, needs input, done), a message and optional links.
_Avoid_: Status update, log, heartbeat

**On behalf of**:
The human whose OAuth approval let an agent take an action. Actions with an API key have no "on behalf of".
_Avoid_: Impersonation, acting as

**Power**:
One of four things an agent may not do until an admin grants it: delete, change settings, manage members, manage agents. A power never lets an agent see a team it cannot see or give out more than it holds.
_Avoid_: Permission, scope, capability

**Pause**:
An admin action that revokes every token an agent holds and stops its webhooks.
_Avoid_: Disable, suspend, kill switch

## Record

**Event**:
An append-only record of one part of a change, with its actor and time.
_Avoid_: Activity, audit entry, log line

**Change**:
Everything one action did, such as creating an issue or a bulk edit, recorded as one or more events. Undo reverts a whole change.
_Avoid_: Transaction, batch, operation

**Inbox**:
A member's list of notifications about work that involves them.
_Avoid_: Notifications page, feed

**Inbox item**:
One notification in an inbox, made from one event: an assignment, a delegation, a mention, a comment, an agent's progress, or a webhook that turned itself off.
_Avoid_: Alert, message

**Trash**:
Where deleted issues, comments, projects and teams wait 30 days before permanent removal.
_Avoid_: Archive, recycle bin

**Archive**:
Where closed issues go to leave active views while staying searchable. Archived issues are not deleted.
_Avoid_: Trash, hidden

## Connections

**API key**:
A secret that lets one agent call the API as itself, scoped to teams.
_Avoid_: Token (alone), personal access token, secret

**Webhook**:
A subscription that sends signed event payloads to an outside URL.
_Avoid_: Callback, hook, notification

**Delivery**:
One attempt to send a webhook payload, recorded with its request and response.
_Avoid_: Call, ping
