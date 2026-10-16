// PROTOTYPE (M0). Direction C, "Agent-native".
// The only chromatic color in the UI belongs to agents (phosphor lime), and so
// does the monospace face: agents speak in Martian Mono, humans in Instrument
// Sans. Agent surfaces carry a hatch texture, live work pulses. Agents sit in
// the rail as teammates with presence, and every issue peek has an agent lane.
(() => {
  const esc = (s) => window.E.esc(s);
  const slug = (s) => String(s || 'idle').replace(/\s+/g, '-');
  const STATE = { working: 'Working', blocked: 'Blocked', 'needs input': 'Needs input', done: 'Done', null: 'Delegated' };

  const human = (m, cls = '') => !m
    ? `<span class="c-av c-av-none ${cls}" title="Unassigned" aria-label="Unassigned"></span>`
    : `<span class="c-av ${cls}" title="${m.name}">${m.initials}</span>`;
  const hex = (m, live, cls = '') =>
    `<span class="c-hexwrap ${live ? 'is-live' : ''} ${cls}" title="${m.name} (agent)"><span class="c-hex">${m.glyph}</span></span>`;
  const pill = (state, live) => `<span class="c-pill" data-state="${slug(state)}" ${live ? 'data-live' : ''}>${live ? '<i aria-hidden="true"></i>' : ''}${STATE[state]}</span>`;
  const firstLine = (s) => s.split('\n')[0];

  const logo = `<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M10 1.5l7.4 4.25v8.5L10 18.5l-7.4-4.25v-8.5z" fill="var(--agent)"/><path d="M6.5 6.5h7M6.5 10h5M6.5 13.5h6" stroke="var(--on-agent)" stroke-width="1.6" stroke-linecap="round"/></svg>`;
  const prIcon = `<svg viewBox="0 0 14 14" width="13" height="13" aria-hidden="true"><circle cx="3.5" cy="3" r="1.6" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="3.5" cy="11" r="1.6" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="10.5" cy="11" r="1.6" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M3.5 4.6v4.8M10.5 9.4V6.5A2 2 0 0 0 8.5 4.5H6.5M7.8 3 6.3 4.5 7.8 6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const links = (p) => (p.links || []).map((l) => `<a class="c-prchip" href="#pr">${prIcon}<span>${esc(l.title)}</span></a>`).join('');

  const labelsHtml = (E, i) => E.labels(i).map((l) => `<span class="c-label" style="--h:${l.hue}"><i aria-hidden="true"></i>${esc(l.name)}</span>`).join('');

  const people = (E, i, info) => `<span class="c-people">${human(E.member(i.assignee))}${info ? hex(info.agent, info.live) : ''}</span>`;

  // Second line of a delegated row: the agent's voice, live.
  function agentLine(E, info) {
    if (!info || !(info.live || info.state === 'needs input' || info.state === 'blocked')) return '';
    const p = info.latest;
    return `<span class="c-r2">
      <span class="c-r2-name">${info.agent.name}</span>${pill(info.state, info.live)}
      ${info.live ? `<span class="c-clock" data-since="${info.since}">${E.clock(info.since)}</span>` : ''}
      ${p ? `<span class="c-r2-msg" data-reveal="${p.id}:row">${E.mdInline(firstLine(p.msg))}</span>` : '<span class="c-r2-msg">Starting…</span>'}
    </span>`;
  }

  function row(E, i) {
    const S = E.S, info = E.agentInfo(i), parent = E.parent(i), subs = E.subIssues(i);
    const done = subs.filter((s) => E.status(s).category === 'done').length;
    return `<button type="button" class="c-row ${info ? 'is-agent' : ''} ${info && info.live ? 'is-live' : ''}" data-act="open" data-id="${i.id}"
        data-focused="${S.focusId === i.id}" ${E.flashing(i.id) ? 'data-flash' : ''} ${S.peekId === i.id ? 'aria-current="true"' : ''}>
      <span class="c-r1">
        ${E.icon.priority(i.priority)}
        <span class="c-id">${i.id}</span>
        ${E.icon.status(E.status(i))}
        <span class="c-title"><span class="c-t">${E.mdInline(i.title)}</span>
          ${parent ? `<span class="c-meta">↳ ${parent.id}</span>` : ''}${subs.length ? `<span class="c-meta">${done}/${subs.length} sub-issues</span>` : ''}</span>
        <span class="c-labels">${labelsHtml(E, i)}</span>
        ${people(E, i, info)}
        <span class="c-age">${E.ago(i.updatedAt)}</span>
      </span>
      ${agentLine(E, info)}
    </button>`;
  }

  function list(E) {
    return `<div class="c-list">${E.groups().map((g) => `
      <section class="c-group" aria-label="${g.status.name}">
        <h2 class="c-group-h">${E.icon.status(g.status)}<span>${g.status.name}</span><span class="c-count">${g.issues.length}</span></h2>
        ${g.issues.map((i) => row(E, i)).join('')}
      </section>`).join('')}</div>`;
  }

  function card(E, i) {
    const S = E.S, info = E.agentInfo(i);
    return `<button type="button" class="c-card ${info ? 'is-agent' : ''} ${info && info.live ? 'is-live' : ''}" data-act="open" data-id="${i.id}"
        data-focused="${S.focusId === i.id}" ${E.flashing(i.id) ? 'data-flash' : ''}>
      ${info ? `<span class="c-band">${hex(info.agent, info.live)}<span class="c-band-name">${info.agent.name}</span>${pill(info.state, info.live)}
        ${info.live ? `<span class="c-clock" data-since="${info.since}">${E.clock(info.since)}</span>` : ''}</span>` : ''}
      <span class="c-card-body">
        <span class="c-card-top"><span class="c-id">${i.id}</span>${E.icon.priority(i.priority)}</span>
        <span class="c-card-title">${E.mdInline(i.title)}</span>
        ${info && info.live && info.latest ? `<span class="c-card-msg" data-reveal="${info.latest.id}:card">${E.mdInline(firstLine(info.latest.msg))}</span>` : ''}
        <span class="c-card-foot"><span class="c-labels">${labelsHtml(E, i)}</span>${human(E.member(i.assignee))}</span>
      </span>
    </button>`;
  }

  function board(E) {
    return `<div class="c-board">${E.columns().map((c) => `
      <section class="c-col" aria-label="${c.status.name}">
        <h2 class="c-group-h">${E.icon.status(c.status)}<span>${c.status.name}</span><span class="c-count">${c.issues.length}</span></h2>
        <div class="c-col-body">${c.issues.map((i) => card(E, i)).join('') || '<p class="c-empty">Nothing here</p>'}</div>
      </section>`).join('')}</div>`;
  }

  function miniRow(E, i) {
    const info = E.agentInfo(i);
    return `<button type="button" class="c-mini" data-act="open" data-id="${i.id}">
      ${E.icon.status(E.status(i))}<span class="c-id">${i.id}</span><span class="c-t">${E.mdInline(i.title)}</span>${people(E, i, info)}</button>`;
  }

  function lane(E, i, info) {
    if (!info) {
      return `<aside class="c-lane is-empty" aria-label="Agent lane">
        <div class="c-lane-empty">
          <p class="c-lane-kicker">Agent lane</p>
          <p>No agent on this issue. Delegate it and the agent's progress streams here, live, while ${E.member(i.assignee) ? E.member(i.assignee).short : 'the assignee'} stays accountable.</p>
          <div class="c-lane-agents">${E.agents().map((a) => `<button type="button" class="c-lane-agent" data-act="delegate" data-id="${i.id}">${hex(a, false)}<span><b>${a.name}</b><small>${esc(a.about)}</small></span></button>`).join('')}</div>
          <p class="c-hint">Press <kbd>D</kbd> to delegate</p>
        </div>
      </aside>`;
    }
    const { agent, live, state } = info;
    const obo = info.onBehalfOf && E.member(info.onBehalfOf);
    const items = [
      ...E.progress(i).map((p) => ({ kind: 'p', ...p })),
      ...E.events(i).filter((e) => E.member(e.actor).kind === 'agent').map((e) => ({ kind: 'e', ...e })),
    ].sort((a, b) => a.at - b.at);
    return `<aside class="c-lane ${live ? 'is-live' : ''}" aria-label="Agent lane">
      <header class="c-lane-h">
        ${hex(agent, live, 'is-lg')}
        <div class="c-lane-who">
          <b>${agent.name}</b>
          <span>${obo ? `on behalf of ${obo.short}` : esc(agent.about.split('.')[0])}</span>
        </div>
        <span class="c-sp"></span>
        ${pill(state, live)}
      </header>
      <div class="c-lane-sub">
        ${live ? `<span>run time <span class="c-clock" data-since="${info.since}">${E.clock(info.since)}</span></span>` : `<span>${info.latest ? `last update ${E.ago(info.latest.at)} ago` : 'waiting for the runner'}</span>`}
        <span class="c-sp"></span>
        ${info.hasScript ? `<button type="button" class="c-ghost" data-act="replay" data-id="${i.id}">Replay run</button>` : ''}
        <button type="button" class="c-ghost" data-act="delegate" data-id="${i.id}">Change <kbd>D</kbd></button>
      </div>
      <ol class="c-stream" data-scroll="lane-${i.id}" data-stick-bottom aria-live="polite">
        ${items.map((x) => x.kind === 'e'
          ? `<li class="c-pu-ev"><span class="c-pu-time">${E.time(x.at)}</span><span>${esc(x.text)}</span></li>`
          : `<li class="c-pu" data-state="${slug(x.state)}">
              <span class="c-pu-time">${E.time(x.at)}</span>
              <div class="c-pu-body">
                ${x.state !== 'working' ? `<span class="c-pu-state">${STATE[x.state]}</span>` : ''}
                <div class="md c-pu-msg" data-reveal="${x.id}:lane">${E.md(x.msg)}</div>${links(x)}
              </div>
            </li>`).join('')}
        ${live ? `<li class="c-thinking"><span class="c-dots" aria-hidden="true"><i></i><i></i><i></i></span>${agent.name} is working</li>` : ''}
        ${!items.length && !live ? `<li class="c-pu-ev"><span class="c-pu-time">—</span><span>Delegated. No progress updates yet.</span></li>` : ''}
      </ol>
    </aside>`;
  }

  function discussion(E, i) {
    const items = [
      ...E.comments(i).map((c) => ({ kind: 'c', ...c })),
      ...E.events(i).filter((e) => E.member(e.actor).kind === 'human').map((e) => ({ kind: 'e', ...e })),
    ].sort((a, b) => a.at - b.at);
    return items.map((x) => {
      const who = E.member(x.author || x.actor);
      if (x.kind === 'e') return `<li class="c-ev">${human(who, 'is-sm')}<span><b>${who.short}</b> ${esc(x.text)}</span><time>${E.ago(x.at)}</time></li>`;
      return `<li class="c-cm">${human(who)}<div><div class="c-cm-h"><b>${who.name}</b><time>${E.ago(x.at)}</time></div><div class="md">${E.md(x.body)}</div></div></li>`;
    }).join('');
  }

  window.VARIANTS = window.VARIANTS || {};
  window.VARIANTS.C = {
    name: 'Agent-native',

    shell: () => `
      <div class="c-app">
        <nav class="c-rail" data-region="side" aria-label="Teams and members"></nav>
        <div class="c-center">
          <header class="c-top" data-region="top"></header>
          <main id="main" tabindex="-1" class="c-main" data-region="main" aria-label="Issues"></main>
          <section class="c-peek" data-region="peek" aria-label="Issue"></section>
        </div>
      </div>`,

    side(E) {
      const S = E.S;
      const agents = E.agents().map((a) => {
        const now = E.agentNow(a.id);
        const latest = now.live.flatMap((i) => E.progress(i)).sort((x, y) => y.at - x.at)[0];
        const live = now.live.length > 0;
        return `<li class="c-mate is-agent ${live ? 'is-live' : ''}">
          <div class="c-mate-h">${hex(a, live)}<b>${a.name}</b><span class="c-sp"></span>${live ? pill('working', true) : now.waiting.length ? pill(now.waiting[0].info.state) : '<span class="c-idle">idle</span>'}</div>
          ${now.live.map((i) => `<button type="button" class="c-mate-issue" data-act="open" data-id="${i.id}"><span class="c-id">${i.id}</span><span class="c-t">${E.mdInline(i.title)}</span></button>`).join('')}
          ${now.waiting.map((x) => `<button type="button" class="c-mate-issue is-waiting" data-act="open" data-id="${x.issue.id}"><span class="c-id">${x.issue.id}</span><span class="c-t">${STATE[x.info.state]}</span></button>`).join('')}
          ${latest ? `<p class="c-mate-msg" data-reveal="${latest.id}:rail">${E.mdInline(firstLine(latest.msg))}</p>` : ''}
        </li>`;
      }).join('');
      const humans = E.humans().map((h) => {
        const n = D().issues.filter((i) => i.assignee === h.id && ['started', 'todo'].includes(E.status(i).category)).length;
        return `<li class="c-mate">${human(h)}<span>${h.name}</span><span class="c-sp"></span><span class="c-count">${n}</span></li>`;
      }).join('');
      const liveN = E.liveIssues().length;
      return `
        <div class="c-org">${logo}<b>Edict</b><span class="c-muted">edicthq</span></div>
        <button type="button" class="c-search" data-act="palette"><span>Search or command</span><kbd>${E.mod}K</kbd></button>
        <div class="c-rail-sec">
          <h2 class="c-rail-h">Teams</h2>
          ${E.D.teams.map((t) => `<button type="button" class="c-teamlink" data-act="team" data-v="${t.key}" ${S.team === t.key ? 'aria-current="true"' : ''}>
            <span class="c-key">${t.key}</span>${t.name}<span class="c-sp"></span><span class="c-count">${E.issues(t.key).length}</span></button>`).join('')}
        </div>
        <div class="c-rail-sec">
          <h2 class="c-rail-h">Agents <span class="c-rail-live">${liveN ? `${liveN} live run${liveN === 1 ? '' : 's'}` : ''}</span></h2>
          <ul class="c-mates">${agents}</ul>
        </div>
        <div class="c-rail-sec">
          <h2 class="c-rail-h">Humans</h2>
          <ul class="c-mates">${humans}</ul>
        </div>
        ${S.dir === 'C2' ? `<div class="c-appearance">
          <h2 class="c-rail-h">Appearance</h2>
          <div class="c-appearance-row">Theme<button type="button" class="c-theme-btn" data-act="theme">${S.theme === 'light' ? 'Light' : 'Dark'}</button></div>
          <div class="c-appearance-row">Accent
            <div class="c-swatches" role="radiogroup" aria-label="Accent color">${E.ACCENTS.map((a) =>
              `<button type="button" class="c-swatch" role="radio" aria-checked="${S.accent === a}" aria-label="${E.ACCENT_NAMES[a]}" title="${E.ACCENT_NAMES[a]}" data-act="accent" data-v="${a}"><span class="c2-swatch" data-accent="${a}"></span></button>`).join('')}</div>
          </div>
        </div>` : ''}`;
    },

    top(E) {
      const S = E.S, team = E.team(S.team);
      const live = E.liveIssues().filter((i) => i.team === S.team);
      const waiting = E.issues(S.team).filter((i) => { const x = E.agentInfo(i); return x && (x.state === 'needs input' || x.state === 'blocked') && !x.live; });
      return `
        <div class="c-titlebox"><span class="c-key">${team.key}</span><h1>${team.name}</h1></div>
        <div class="c-seg" role="group" aria-label="View">
          <button type="button" data-act="view" data-v="list" aria-pressed="${S.view === 'list'}">List</button>
          <button type="button" data-act="view" data-v="board" aria-pressed="${S.view === 'board'}">Board</button>
        </div>
        <span class="c-sp"></span>
        <div class="c-strip ${live.length ? 'is-live' : ''}">
          <span class="c-strip-hexes">${[...new Set(live.map((i) => i.delegate))].map((id) => hex(E.member(id), true)).join('') || hex(E.agents()[0], false)}</span>
          <span><b>${live.length}</b> agent run${live.length === 1 ? '' : 's'} live</span>
          ${waiting.length ? `<span class="c-strip-sep">·</span><span><b>${waiting.length}</b> waiting on you</span>` : ''}
        </div>
        <button type="button" class="c-primary" data-act="create">New issue <kbd>C</kbd></button>`;
    },

    main: (E) => (E.S.view === 'list' ? list(E) : board(E)),

    peek(E) {
      const i = E.issue(E.S.peekId);
      if (!i) return '';
      const st = E.status(i), info = E.agentInfo(i), parent = E.parent(i), subs = E.subIssues(i), rels = E.relations(i);
      const assignee = E.member(i.assignee);
      const done = subs.filter((s) => E.status(s).category === 'done').length;
      return `
      <div class="c-peek-in">
        <header class="c-peek-h">
          <span class="c-id">${i.id}</span>
          ${parent ? `<span class="c-muted">sub-issue of</span><button type="button" class="c-crumb" data-act="open" data-id="${parent.id}">${parent.id}</button>` : ''}
          <span class="c-sp"></span>
          <span class="c-hint"><kbd>J</kbd><kbd>K</kbd> next issue</span>
          <button type="button" class="c-ghost" data-act="close-peek" aria-label="Close issue">Close <kbd>Esc</kbd></button>
        </header>
        <div class="c-peek-grid">
          <div class="c-peek-scroll" data-scroll="peek-${i.id}">
            <h1 class="c-ptitle">${E.mdInline(i.title)}</h1>
            <div class="c-chips">
              <button type="button" class="c-chip" data-act="status" data-id="${i.id}">${E.icon.status(st)}${st.name}<kbd>S</kbd></button>
              <span class="c-chip is-static">${E.icon.priority(i.priority)}${E.PRIORITY[i.priority]}</span>
              <button type="button" class="c-chip" data-act="assignee" data-id="${i.id}">${human(assignee, 'is-sm')}${assignee ? assignee.short : 'Unassigned'}<kbd>A</kbd></button>
              <button type="button" class="c-chip is-agent" data-act="delegate" data-id="${i.id}">${info ? hex(info.agent, info.live, 'is-sm') + info.agent.name : 'Delegate'}<kbd>D</kbd></button>
              ${labelsHtml(E, i)}
            </div>
            <div class="md c-desc">${i.description ? E.md(i.description) : '<p class="c-muted">No description.</p>'}</div>
            ${subs.length ? `<section class="c-sec"><h2>Sub-issues <span class="c-count">${done}/${subs.length}</span></h2>${subs.map((s) => miniRow(E, s)).join('')}</section>` : ''}
            ${rels.length ? `<section class="c-sec"><h2>Relations</h2>${rels.map((r) => `<div class="c-rel"><span class="c-rel-type">${r.type}</span><div>${r.issues.map((x) => miniRow(E, x)).join('')}</div></div>`).join('')}</section>` : ''}
            <section class="c-sec">
              <h2>Discussion</h2>
              <ol class="c-disc">${discussion(E, i)}</ol>
              <div class="c-composer">
                <label class="sr" for="c-composer">Comment</label>
                <textarea id="c-composer" data-keep="composer" rows="2" placeholder="Comment, or @mention an agent. Markdown works."></textarea>
                <button type="button" class="c-btn" data-act="comment">Comment <kbd>${E.mod}↵</kbd></button>
              </div>
            </section>
          </div>
          ${lane(E, i, info)}
        </div>
      </div>`;
    },

    paletteFrame(E) {
      const p = E.S.palette, i = p.mode === 'accent' ? null : E.issue(p.target);
      const mode = { status: 'Change status', assignee: 'Assign to a human', delegate: 'Delegate to an agent', accent: 'Accent color' }[p.mode];
      const ph = { root: 'Type a command, or search issues', status: 'Pick a status', assignee: 'Pick who answers for it', delegate: 'Pick the agent that does the work', accent: 'Pick the color agents show in' }[p.mode];
      return `<div class="c-scrim" data-act="backdrop"><div class="c-pal ${p.mode === 'delegate' ? 'is-agent' : ''}" role="dialog" aria-modal="true" aria-label="Command palette">
        ${i ? `<div class="c-pal-ctx">${mode ? `<span class="c-pal-mode">${mode}</span>` : ''}<span class="c-id">${i.id}</span><span class="c-pal-ctx-t">${E.mdInline(i.title)}</span></div>` : ''}
        <input class="c-pal-input" data-palette-input role="combobox" aria-expanded="true" aria-controls="pal-list" aria-autocomplete="list"
          aria-label="${ph}" placeholder="${ph}" autocomplete="off" spellcheck="false">
        <div class="c-pal-list" id="pal-list" role="listbox" data-palette-list></div>
        <div class="c-pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> run</span>${p.mode !== 'root' && p.from === 'root' ? '<span><kbd>⌫</kbd> back</span>' : ''}<span><kbd>Esc</kbd> close</span></div>
      </div></div>`;
    },

    paletteList(E, items, idx) {
      if (!items.length) return `<p class="c-pal-empty">Nothing matches “${esc(E.S.palette.query)}”. Try a status, an agent's name or an identifier like ENG-142.</p>`;
      let html = '', group = null;
      items.forEach((it, ix) => {
        if (it.group !== group) { group = it.group; html += `<div class="c-pal-group" role="presentation">${esc(group)}</div>`; }
        const icon = it.icon || (it.member ? (it.member.kind === 'agent' ? hex(it.member, false, 'is-sm') : human(it.member, 'is-sm'))
          : it.agent ? `<span class="c-hexwrap is-sm"><span class="c-hex"></span></span>` : '');
        html += `<div class="c-pal-item ${it.agent ? 'is-agent' : ''}" role="option" id="pal-${ix}" data-ix="${ix}" data-act="pal-item" aria-selected="${ix === idx}">
          <span class="c-pal-ic">${icon}</span>
          ${it.idLabel ? `<span class="c-id">${it.idLabel}</span>` : ''}
          <span class="c-pal-label">${E.mdInline(it.label)}</span>
          ${it.sub ? `<span class="c-pal-sub">${esc(it.sub)}</span>` : ''}
          <span class="c-sp"></span>
          ${it.current ? '<span class="c-pal-cur">current</span>' : ''}
          ${it.kbd ? `<kbd>${it.kbd}</kbd>` : ''}${it.to ? '<span class="c-pal-more" aria-hidden="true">→</span>' : ''}
        </div>`;
      });
      return html;
    },

    createFrame(E) {
      const S = E.S, todo = E.statuses(S.team)[1];
      return `<div class="c-scrim" data-act="backdrop"><form class="c-pal c-create" role="dialog" aria-modal="true" aria-labelledby="c-h" onsubmit="return false">
        <div class="c-pal-ctx"><span class="c-key">${S.team}</span><span id="c-h" class="c-pal-ctx-t">New issue</span></div>
        <label class="sr" for="c-title">Title</label>
        <input id="c-title" name="title" class="c-create-title" placeholder="Issue title" autocomplete="off">
        <label class="sr" for="c-desc">Description</label>
        <textarea id="c-desc" name="description" rows="5" placeholder="Describe the outcome. Agents read this as markdown."></textarea>
        <div class="c-create-foot">
          <span class="c-chip is-static">${E.icon.status(todo)}${todo.name}</span>
          <span class="c-chip is-static">${human(E.member('amirali'), 'is-sm')}Amirali</span>
          <span class="c-sp"></span>
          <button type="button" class="c-ghost" data-act="create-cancel">Cancel</button>
          <button type="button" class="c-primary" data-act="create-submit">Create issue <kbd>↵</kbd></button>
        </div>
      </form></div>`;
    },
  };

  // C2: the same structure, restyled to be more conventional (see c2.css).
  window.VARIANTS.C2 = { ...window.VARIANTS.C, name: 'Agent-native, conventional' };

  const D = () => window.EDICT_DATA;
})();
