// PROTOTYPE (M0). Direction A, "Calm precision".
// Quiet warm neutrals and one accent, vermilion, which only ever means "now":
// your cursor, the focused control, and an agent working live. Never buttons,
// never static state, never text. Agents differ from humans by shape (square
// vs round), not by color. Peek splits the screen instead of covering it.
(() => {
  const esc = (s) => window.E.esc(s);

  const av = (m) => {
    if (!m) return `<span class="a-av a-av-none" title="Unassigned" aria-label="Unassigned"></span>`;
    if (m.kind === 'agent') return `<span class="a-av a-av-agent" title="${m.name} (agent)">${m.glyph}</span>`;
    return `<span class="a-av" title="${m.name}">${m.initials}</span>`;
  };

  const logo = `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><rect x="2" y="2.5" width="12" height="2.4" rx="1" fill="currentColor"/><rect x="2" y="6.8" width="8" height="2.4" rx="1" fill="currentColor"/><rect x="2" y="11.1" width="10.5" height="2.4" rx="1" fill="currentColor"/></svg>`;
  const prIcon = `<svg viewBox="0 0 14 14" width="13" height="13" aria-hidden="true"><circle cx="3.5" cy="3" r="1.6" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="3.5" cy="11" r="1.6" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="10.5" cy="11" r="1.6" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M3.5 4.6v4.8M10.5 9.4V6.5A2 2 0 0 0 8.5 4.5H6.5M7.8 3 6.3 4.5 7.8 6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  const STATE = { working: 'Working', blocked: 'Blocked', 'needs input': 'Needs input', done: 'Done', null: 'Delegated' };
  const slug = (s) => String(s || 'idle').replace(/\s+/g, '-');

  const labelsHtml = (E, i) => E.labels(i).map((l) =>
    `<span class="a-label" style="--h:${l.hue}"><i aria-hidden="true"></i>${esc(l.name)}</span>`).join('');

  const agentMark = (E, info) => !info ? '' :
    `<span class="a-agent ${info.live ? 'is-live' : ''}" data-state="${slug(info.state)}" title="${info.agent.name}: ${STATE[info.state]}">${av(info.agent)}</span>`;

  const links = (p) => (p.links || []).map((l) => `<a class="a-link" href="#pr">${prIcon}<span>${esc(l.title)}</span></a>`).join('');

  function row(E, i) {
    const S = E.S, info = E.agentInfo(i), parent = E.parent(i), subs = E.subIssues(i);
    const done = subs.filter((s) => E.status(s).category === 'done').length;
    return `<button type="button" class="a-row" data-act="open" data-id="${i.id}" data-focused="${S.focusId === i.id}"
        ${E.flashing(i.id) ? 'data-flash' : ''} ${S.peekId === i.id ? 'aria-current="true"' : ''}>
      <span class="a-c-pri">${E.icon.priority(i.priority)}</span>
      <span class="a-c-id">${i.id}</span>
      <span class="a-c-st">${E.icon.status(E.status(i))}</span>
      <span class="a-c-title">
        <span class="a-t">${E.mdInline(i.title)}</span>
        ${parent ? `<span class="a-meta">› ${parent.id}</span>` : ''}
        ${subs.length ? `<span class="a-meta">${done}/${subs.length}</span>` : ''}
        ${info && info.live ? `<span class="a-live-tag"><i aria-hidden="true"></i>${info.agent.name} working <span data-since="${info.since}">${E.clock(info.since)}</span></span>` : ''}
        ${info && info.state === 'needs input' ? `<span class="a-ask">${info.agent.name} needs input</span>` : ''}
      </span>
      <span class="a-c-labels">${labelsHtml(E, i)}</span>
      <span class="a-c-agent">${agentMark(E, info)}</span>
      <span class="a-c-who">${av(E.member(i.assignee))}</span>
      <span class="a-c-age">${E.ago(i.updatedAt)}</span>
    </button>`;
  }

  function list(E) {
    return `<div class="a-list">${E.groups().map((g) => `
      <section class="a-group" aria-label="${g.status.name}">
        <h2 class="a-group-h">${E.icon.status(g.status)}<span>${g.status.name}</span><span class="a-count">${g.issues.length}</span></h2>
        ${g.issues.map((i) => row(E, i)).join('')}
      </section>`).join('')}</div>`;
  }

  function card(E, i) {
    const S = E.S, info = E.agentInfo(i);
    return `<button type="button" class="a-card" data-act="open" data-id="${i.id}" data-focused="${S.focusId === i.id}"
        ${E.flashing(i.id) ? 'data-flash' : ''} ${S.peekId === i.id ? 'aria-current="true"' : ''}>
      <span class="a-card-top"><span class="a-c-id">${i.id}</span>${E.icon.priority(i.priority)}</span>
      <span class="a-card-title">${E.mdInline(i.title)}</span>
      <span class="a-card-foot"><span class="a-card-labels">${labelsHtml(E, i)}</span>${agentMark(E, info)}${av(E.member(i.assignee))}</span>
      ${info && info.live ? `<span class="a-live-tag"><i aria-hidden="true"></i>${info.agent.name} working <span data-since="${info.since}">${E.clock(info.since)}</span></span>` : ''}
    </button>`;
  }

  function board(E) {
    return `<div class="a-board">${E.columns().map((c) => `
      <section class="a-col" aria-label="${c.status.name}">
        <h2 class="a-group-h">${E.icon.status(c.status)}<span>${c.status.name}</span><span class="a-count">${c.issues.length}</span></h2>
        <div class="a-col-body">${c.issues.map((i) => card(E, i)).join('') || '<p class="a-empty">No issues</p>'}</div>
      </section>`).join('')}</div>`;
  }

  function miniRow(E, i) {
    return `<button type="button" class="a-mini" data-act="open" data-id="${i.id}">
      ${E.icon.status(E.status(i))}<span class="a-c-id">${i.id}</span><span class="a-t">${E.mdInline(i.title)}</span>
      ${agentMark(E, E.agentInfo(i))}${av(E.member(i.assignee))}</button>`;
  }

  function liveCard(E, i, info) {
    const { agent, latest, live, state } = info;
    const obo = info.onBehalfOf && E.member(info.onBehalfOf);
    return `<section class="a-livecard ${live ? 'is-live' : ''}" data-state="${slug(state)}" aria-label="${agent.name} progress">
      <div class="a-livecard-h">
        ${agentMark(E, info)}<b>${agent.name}</b>
        <span class="a-state">${STATE[state]}</span>
        ${live ? `<span class="a-clock" data-since="${info.since}">${E.clock(info.since)}</span>` : latest ? `<span class="a-clock">${E.ago(latest.at)}</span>` : ''}
        <span class="a-sp"></span>
        ${obo ? `<span class="a-obo">on behalf of ${obo.short}</span>` : ''}
      </div>
      ${latest
        ? `<div class="md a-livecard-msg" data-reveal="${latest.id}:card">${E.md(latest.msg)}</div>${links(latest)}`
        : `<p class="a-livecard-msg a-muted">Delegated. ${agent.name} picks it up when its runner wakes.</p>`}
    </section>`;
  }

  function feedItem(E, x) {
    const who = E.member(x.actor || x.author || x.agent);
    const when = `<time title="${new Date(x.at).toLocaleString()}">${E.ago(x.at)}</time>`;
    if (x.kind === 'event') {
      const obo = x.onBehalfOf ? ` <span class="a-muted">on behalf of ${E.member(x.onBehalfOf).short}</span>` : '';
      return `<li class="a-ev"><span class="a-ev-mark ${who.kind === 'agent' ? 'is-agent' : ''}" aria-hidden="true"></span><span><b>${who.short}</b>${obo} ${esc(x.text)}</span>${when}</li>`;
    }
    if (x.kind === 'comment') {
      return `<li class="a-cm">${av(who)}<div class="a-cm-body"><div class="a-cm-h"><b>${who.name}</b>${when}</div><div class="md">${E.md(x.body)}</div></div></li>`;
    }
    return `<li class="a-cm a-pg" data-state="${slug(x.state)}">${av(who)}<div class="a-cm-body">
      <div class="a-cm-h"><b>${who.name}</b><span class="a-state">${STATE[x.state]}</span>${when}</div>
      <div class="md" data-reveal="${x.id}:feed">${E.md(x.msg)}</div>${links(x)}</div></li>`;
  }

  window.VARIANTS = window.VARIANTS || {};
  window.VARIANTS.A = {
    name: 'Calm precision',

    shell: () => `
      <div class="a-app">
        <header class="a-top" data-region="top"></header>
        <div class="a-body">
          <main id="main" tabindex="-1" class="a-main" data-region="main" aria-label="Issues"></main>
          <aside class="a-peek" data-region="peek" aria-label="Issue"></aside>
        </div>
        <footer class="a-mode" data-region="mode"></footer>
      </div>`,

    top: (E) => {
      const S = E.S;
      return `
      <div class="a-crumbs">
        <span class="a-logo">${logo}<span>edict</span></span>
        <span class="a-sl" aria-hidden="true">/</span>
        <button type="button" class="a-team" data-act="team" title="Switch team">${S.team}<span class="a-muted">${E.team(S.team).name}</span></button>
        <span class="a-sl" aria-hidden="true">/</span>
        <span>Issues</span>
      </div>
      <div class="a-seg" role="group" aria-label="View">
        <button type="button" data-act="view" data-v="list" aria-pressed="${S.view === 'list'}">List</button>
        <button type="button" data-act="view" data-v="board" aria-pressed="${S.view === 'board'}">Board</button>
      </div>
      <span class="a-sp"></span>
      <button type="button" class="a-search" data-act="palette"><span>Search or run a command</span><kbd>${E.mod}K</kbd></button>
      <button type="button" class="a-primary" data-act="create">New issue <kbd>C</kbd></button>`;
    },

    main: (E) => (E.S.view === 'list' ? list(E) : board(E)),

    peek(E) {
      const i = E.issue(E.S.peekId);
      if (!i) return '';
      const st = E.status(i), info = E.agentInfo(i), parent = E.parent(i), subs = E.subIssues(i), rels = E.relations(i);
      const assignee = E.member(i.assignee);
      const done = subs.filter((s) => E.status(s).category === 'done').length;
      return `
      <header class="a-peek-h">
        <span class="a-c-id">${i.id}</span>
        ${parent ? `<span class="a-muted">in</span><button type="button" class="a-crumb" data-act="open" data-id="${parent.id}">${parent.id}</button>` : ''}
        <span class="a-sp"></span>
        ${info && info.hasScript ? `<button type="button" class="a-ghost" data-act="replay" data-id="${i.id}">Replay agent run</button>` : ''}
        <span class="a-hint"><kbd>J</kbd><kbd>K</kbd> next</span>
        <button type="button" class="a-ghost" data-act="close-peek" aria-label="Close issue">Close <kbd>Esc</kbd></button>
      </header>
      <div class="a-peek-scroll" data-scroll="peek-${i.id}">
        <h1 class="a-title">${E.mdInline(i.title)}</h1>
        <dl class="a-props">
          <div><dt>Status</dt><dd><button type="button" class="a-prop" data-act="status" data-id="${i.id}">${E.icon.status(st)}${st.name}<kbd>S</kbd></button></dd></div>
          <div><dt>Priority</dt><dd><span class="a-prop is-static">${E.icon.priority(i.priority)}${E.PRIORITY[i.priority]}</span></dd></div>
          <div><dt>Assignee</dt><dd><button type="button" class="a-prop" data-act="assignee" data-id="${i.id}">${av(assignee)}${assignee ? assignee.name : 'Unassigned'}<kbd>A</kbd></button></dd></div>
          <div><dt>Delegate</dt><dd><button type="button" class="a-prop" data-act="delegate" data-id="${i.id}">${info ? agentMark(E, info) + info.agent.name : '<span class="a-muted">No agent</span>'}<kbd>D</kbd></button></dd></div>
          <div><dt>Labels</dt><dd class="a-prop is-static">${labelsHtml(E, i) || '<span class="a-muted">None</span>'}</dd></div>
        </dl>
        ${info ? liveCard(E, i, info) : ''}
        <div class="md a-desc">${i.description ? E.md(i.description) : '<p class="a-muted">No description.</p>'}</div>
        ${subs.length ? `<section class="a-sec"><h2>Sub-issues <span class="a-count">${done}/${subs.length}</span></h2>${subs.map((s) => miniRow(E, s)).join('')}</section>` : ''}
        ${rels.length ? `<section class="a-sec"><h2>Relations</h2>${rels.map((r) => r.issues.map((x) =>
          `<div class="a-rel"><span class="a-rel-type">${r.type}</span>${miniRow(E, x)}</div>`).join('')).join('')}</section>` : ''}
        <section class="a-sec">
          <h2>Activity</h2>
          <ol class="a-feed">${E.activity(i).map((x) => feedItem(E, x)).join('')}</ol>
          <div class="a-composer">
            <label class="sr" for="a-composer">Comment</label>
            <textarea id="a-composer" data-keep="composer" rows="2" placeholder="Leave a comment. Markdown works."></textarea>
            <button type="button" class="a-btn" data-act="comment">Comment <kbd>${E.mod}↵</kbd></button>
          </div>
        </section>
      </div>`;
    },

    mode(E) {
      const S = E.S, live = E.liveIssues();
      const n = E.issues(S.team).length;
      return `
        <span class="a-mode-k">${S.team}</span>
        <span>${S.view === 'list' ? 'List' : 'Board'} · ${n} issues</span>
        ${S.focusId ? `<span class="a-mode-sep">·</span><span>${S.focusId}</span>` : ''}
        <span class="a-mode-live ${live.length ? 'is-on' : ''}"><i aria-hidden="true"></i>${live.length} agent run${live.length === 1 ? '' : 's'} live</span>
        <span class="a-sp"></span>
        <span class="a-keys"><kbd>J</kbd><kbd>K</kbd>${S.view === 'board' ? '<kbd>H</kbd><kbd>L</kbd>' : ''} move <kbd>↵</kbd> open <kbd>S</kbd> status <kbd>A</kbd> assign <kbd>D</kbd> delegate <kbd>C</kbd> create <kbd>V</kbd> view <kbd>${E.mod}K</kbd> commands</span>`;
    },

    paletteFrame(E) {
      const p = E.S.palette, i = E.issue(p.target);
      const mode = { status: 'Change status', assignee: 'Assign to', delegate: 'Delegate to agent' }[p.mode];
      const ph = { root: 'Type a command or search issues', status: 'Pick a status', assignee: 'Pick a person', delegate: 'Pick an agent' }[p.mode];
      return `<div class="a-scrim" data-act="backdrop"><div class="a-pal" role="dialog" aria-modal="true" aria-label="Command palette">
        ${i ? `<div class="a-pal-ctx"><span class="a-c-id">${i.id}</span><span class="a-pal-ctx-t">${E.mdInline(i.title)}</span>${mode ? `<span class="a-pal-mode">${mode}</span>` : ''}</div>` : ''}
        <input class="a-pal-input" data-palette-input role="combobox" aria-expanded="true" aria-controls="pal-list" aria-autocomplete="list"
          aria-label="${ph}" placeholder="${ph}" autocomplete="off" spellcheck="false">
        <div class="a-pal-list" id="pal-list" role="listbox" data-palette-list></div>
        <div class="a-pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> run</span>${p.mode !== 'root' && p.from === 'root' ? '<span><kbd>⌫</kbd> back</span>' : ''}<span><kbd>Esc</kbd> close</span></div>
      </div></div>`;
    },

    paletteList(E, items, idx) {
      if (!items.length) return `<p class="a-pal-empty">Nothing matches “${esc(E.S.palette.query)}”. Try a status, an agent or an identifier like ENG-142.</p>`;
      let html = '', group = null;
      items.forEach((it, ix) => {
        if (it.group !== group) { group = it.group; html += `<div class="a-pal-group" role="presentation">${esc(group)}</div>`; }
        const icon = it.icon || (it.member ? av(it.member) : it.agent ? '<span class="a-av a-av-agent" aria-hidden="true">·</span>' : '');
        html += `<div class="a-pal-item" role="option" id="pal-${ix}" data-ix="${ix}" data-act="pal-item" aria-selected="${ix === idx}">
          <span class="a-pal-ic">${icon}</span>
          ${it.idLabel ? `<span class="a-c-id">${it.idLabel}</span>` : ''}
          <span class="a-pal-label">${E.mdInline(it.label)}</span>
          ${it.sub ? `<span class="a-pal-sub">${esc(it.sub)}</span>` : ''}
          <span class="a-sp"></span>
          ${it.current ? '<span class="a-pal-cur">Current</span>' : ''}
          ${it.kbd ? `<kbd>${it.kbd}</kbd>` : ''}${it.to ? '<span class="a-pal-more" aria-hidden="true">›</span>' : ''}
        </div>`;
      });
      return html;
    },

    createFrame(E) {
      const S = E.S, todo = E.statuses(S.team)[1];
      return `<div class="a-scrim" data-act="backdrop"><form class="a-pal a-create" role="dialog" aria-modal="true" aria-labelledby="c-h" onsubmit="return false">
        <div class="a-pal-ctx"><span class="a-c-id">${S.team}</span><span id="c-h" class="a-pal-ctx-t">New issue</span></div>
        <label class="sr" for="c-title">Title</label>
        <input id="c-title" name="title" class="a-create-title" placeholder="Issue title" autocomplete="off">
        <label class="sr" for="c-desc">Description</label>
        <textarea id="c-desc" name="description" rows="5" placeholder="Add a description. Markdown works."></textarea>
        <div class="a-create-foot">
          <span class="a-prop is-static">${E.icon.status(todo)}${todo.name}</span>
          <span class="a-prop is-static">${av(E.member('amirali'))}Amirali Beigi</span>
          <span class="a-sp"></span>
          <button type="button" class="a-ghost" data-act="create-cancel">Cancel</button>
          <button type="button" class="a-primary" data-act="create-submit">Create issue <kbd>↵</kbd></button>
        </div>
      </form></div>`;
    },
  };
})();
