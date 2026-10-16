// PROTOTYPE (M0). Shared state, keyboard, command palette, agent runs and the
// direction/theme switcher. Directions only render; everything they show comes
// from `E` (the read model) and every interaction goes through `data-act`.
(() => {
  const D = window.EDICT_DATA;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const params = new URLSearchParams(location.search);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

  let seq = 0;
  const nextId = () => `p${++seq}`;
  D.progress.forEach((p) => (p.id = nextId()));

  const S = {
    dir: params.get('d') === 'C' ? 'C' : 'A',
    theme: params.get('theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
    view: params.get('view') === 'board' ? 'board' : 'list',
    team: params.get('team') === 'OPS' ? 'OPS' : 'ENG',
    focusId: null,
    peekId: params.get('issue'),
    palette: null,
    create: null,
    toast: null,
    undo: null,
    runs: {},
    revealed: new Set(),
    flash: {},
    scrollFocus: false,
  };

  // ---------- read model ----------
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const allStatuses = Object.values(D.statuses).flat();
  const PRIORITY = ['No priority', 'Urgent', 'High', 'Medium', 'Low'];
  const prioRank = (p) => (p === 0 ? 5 : p);
  const sortIssues = (a, b) => prioRank(a.priority) - prioRank(b.priority) || b.number - a.number;
  const LIST_ORDER = [3, 2, 1, 0, 4, 5]; // In Review, In Progress, Todo, Backlog, Done, Canceled

  const E = {
    S, D, esc, isMac,
    mod: isMac ? '⌘' : 'Ctrl ',
    PRIORITY,
    md: (s) => window.md(s),
    mdInline: (s) => window.mdInline(s),
    member: (id) => D.members.find((m) => m.id === id) || null,
    humans: () => D.members.filter((m) => m.kind === 'human'),
    agents: () => D.members.filter((m) => m.kind === 'agent'),
    team: (key) => D.teams.find((t) => t.key === key),
    issue: (id) => D.issues.find((i) => i.id === id) || null,
    status: (issue) => allStatuses.find((s) => s.id === issue.status),
    statuses: (team) => D.statuses[team],
    labels: (issue) => issue.labels.map((id) => D.labels.find((l) => l.id === id)),
    issues: (team) => D.issues.filter((i) => i.team === team),
    groups(team = S.team) {
      const st = D.statuses[team];
      return LIST_ORDER.map((ix) => ({ status: st[ix], issues: E.issues(team).filter((i) => i.status === st[ix].id).sort(sortIssues) }))
        .filter((g) => g.issues.length);
    },
    columns(team = S.team) {
      return D.statuses[team].map((status) => ({ status, issues: E.issues(team).filter((i) => i.status === status.id).sort(sortIssues) }));
    },
    order() {
      return S.view === 'list'
        ? E.groups().flatMap((g) => g.issues.map((i) => i.id))
        : E.columns().flatMap((c) => c.issues.map((i) => i.id));
    },
    parent: (issue) => (issue.parent ? E.issue(issue.parent) : null),
    subIssues: (issue) => D.issues.filter((i) => i.parent === issue.id).sort((a, b) => a.number - b.number),
    relations(issue) {
      const out = { 'Blocked by': [], Blocks: [], Related: [], 'Duplicate of': [], 'Duplicated by': [] };
      for (const r of D.relations) {
        if (r.from === issue.id) out[{ blocks: 'Blocks', related: 'Related', duplicate: 'Duplicate of' }[r.type]].push(E.issue(r.to));
        if (r.to === issue.id) out[{ blocks: 'Blocked by', related: 'Related', duplicate: 'Duplicated by' }[r.type]].push(E.issue(r.from));
      }
      return Object.entries(out).filter(([, v]) => v.length).map(([type, issues]) => ({ type, issues }));
    },
    comments: (issue) => D.comments.filter((c) => c.issueId === issue.id).sort((a, b) => a.at - b.at),
    events: (issue) => D.events.filter((e) => e.issueId === issue.id).sort((a, b) => a.at - b.at),
    progress: (issue) => D.progress.filter((p) => p.issueId === issue.id).sort((a, b) => a.at - b.at),
    activity(issue) {
      return [
        ...E.comments(issue).map((x) => ({ kind: 'comment', ...x })),
        ...E.events(issue).map((x) => ({ kind: 'event', ...x })),
        ...E.progress(issue).map((x) => ({ kind: 'progress', ...x })),
      ].sort((a, b) => a.at - b.at);
    },
    // The delegate's live state on an issue, or null when nothing is delegated.
    agentInfo(issue) {
      if (!issue.delegate) return null;
      const agent = E.member(issue.delegate);
      const ps = E.progress(issue).filter((p) => p.agent === agent.id);
      const latest = ps[ps.length - 1] || null;
      const run = S.runs[issue.id];
      const live = !!(run && run.active);
      const state = live ? (latest && latest.state !== 'done' ? latest.state : 'working') : latest ? latest.state : null;
      return { agent, latest, live, state, since: run ? run.startedAt : latest ? latest.at : null,
               onBehalfOf: run ? run.onBehalfOf : null, hasScript: !!D.scripts[issue.id] };
    },
    liveIssues: () => D.issues.filter((i) => S.runs[i.id] && S.runs[i.id].active),
    agentNow(agentId) {
      const live = E.liveIssues().filter((i) => i.delegate === agentId);
      const waiting = D.issues.filter((i) => i.delegate === agentId && !live.includes(i))
        .map((i) => ({ issue: i, info: E.agentInfo(i) }))
        .filter((x) => x.info.state === 'needs input' || x.info.state === 'blocked');
      return { live, waiting };
    },
    flashing: (id) => S.flash[id] && Date.now() - S.flash[id] < 1600,
    ago(ts) {
      const s = Math.max(0, (Date.now() - ts) / 1000);
      if (s < 45) return 'now';
      if (s < 3600) return `${Math.round(s / 60)}m`;
      if (s < 86400) return `${Math.round(s / 3600)}h`;
      return `${Math.round(s / 86400)}d`;
    },
    clock(ts) {
      const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
      const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = String(s % 60).padStart(2, '0');
      return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
    },
    time: (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
    icon: {
      status(st) {
        const svg = (inner) => `<svg class="ic-st" viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">${inner}</svg>`;
        const ring = (dash) => `<circle cx="7" cy="7" r="5.6" fill="none" stroke="currentColor" stroke-width="1.5"${dash ? ' stroke-dasharray="1.75 1.75"' : ''}/>`;
        let inner;
        if (st.category === 'backlog') inner = ring(true);
        else if (st.category === 'todo') inner = ring(false);
        else if (st.category === 'started') {
          const a = (st.fill || 0.5) * 2 * Math.PI, x = 7 + 3.2 * Math.sin(a), y = 7 - 3.2 * Math.cos(a);
          inner = ring(false) + `<path d="M7 7 L7 3.8 A3.2 3.2 0 ${st.fill > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)} Z" fill="currentColor"/>`;
        } else if (st.category === 'done')
          inner = `<circle cx="7" cy="7" r="6.4" fill="currentColor"/><path d="M4.4 7.2l1.8 1.8 3.5-3.7" fill="none" stroke="var(--on-status, #fff)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`;
        else inner = `<circle cx="7" cy="7" r="6.4" fill="currentColor"/><path d="M5 5l4 4M9 5l-4 4" stroke="var(--on-status, #fff)" stroke-width="1.5" stroke-linecap="round"/>`;
        return `<span class="st st-${st.category}" title="${esc(st.name)}">${svg(inner)}</span>`;
      },
      priority(p) {
        const svg = (inner) => `<span class="pri pri-${p}" title="${PRIORITY[p]}"><svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">${inner}</svg></span>`;
        if (p === 1) return svg(`<rect x="1" y="1" width="12" height="12" rx="3" fill="currentColor"/><path d="M7 3.9v3.7M7 10v.1" stroke="var(--on-urgent, #fff)" stroke-width="1.7" stroke-linecap="round"/>`);
        if (p === 0) return svg([2, 6, 10].map((x) => `<rect x="${x}" y="6.3" width="2.2" height="1.4" rx=".7" fill="currentColor" opacity=".5"/>`).join(''));
        const on = { 2: 3, 3: 2, 4: 1 }[p];
        return svg([[1.5, 9, 4], [5.5, 6, 7], [9.5, 3, 10]].map(([x, y, h], i) =>
          `<rect x="${x}" y="${y}" width="3" height="${h}" rx="1" fill="currentColor" opacity="${i < on ? 1 : 0.25}"/>`).join(''));
      },
    },
  };
  window.E = E;

  // ---------- mutations ----------
  function addEvent(issueId, actor, text, onBehalfOf, live) {
    D.events.push({ issueId, actor, text, onBehalfOf, at: Date.now(), live });
  }

  function setStatus(id, value, actor = 'amirali', onBehalfOf, live) {
    const issue = E.issue(id);
    const st = D.statuses[issue.team].find((s) => s.id === value || s.name === value);
    if (!st || st.id === issue.status) return null;
    const prev = issue.status;
    issue.status = st.id;
    issue.updatedAt = Date.now();
    S.flash[id] = Date.now();
    addEvent(id, actor, `moved to ${st.name}`, onBehalfOf, live);
    return () => { issue.status = prev; S.flash[id] = Date.now(); };
  }

  function setAssignee(id, memberId) {
    const issue = E.issue(id);
    if (issue.assignee === memberId) return null;
    const prev = issue.assignee;
    issue.assignee = memberId;
    addEvent(id, 'amirali', memberId ? `assigned to ${E.member(memberId).short}` : 'removed the assignee');
    return () => { issue.assignee = prev; };
  }

  function setDelegate(id, agentId) {
    const issue = E.issue(id);
    if (issue.delegate === agentId) return null;
    const prev = issue.delegate;
    stopRun(id);
    issue.delegate = agentId;
    addEvent(id, 'amirali', agentId ? `delegated to ${E.member(agentId).short}` : 'removed the delegate');
    if (agentId) setTimeout(() => startRun(id, agentId, 'amirali'), 900);
    return () => { stopRun(id); issue.delegate = prev; };
  }

  function createIssue(title, description) {
    const team = S.team;
    const number = Math.max(...E.issues(team).map((i) => i.number)) + 1;
    const issue = {
      id: `${team}-${number}`, team, number, title, description, priority: 0, labels: [],
      status: D.statuses[team][1].id, assignee: 'amirali', delegate: null, parent: null,
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    D.issues.push(issue);
    addEvent(issue.id, 'amirali', 'created the issue');
    S.flash[issue.id] = Date.now();
    S.focusId = issue.id;
    S.scrollFocus = true;
    return issue;
  }

  function act(undoFn, msg) {
    if (!undoFn) return;
    S.undo = undoFn;
    toast(msg, true);
    paint();
  }

  function undo() {
    if (!S.undo) return;
    S.undo();
    S.undo = null;
    toast('Undone');
    paint();
  }

  // ---------- agent runs ----------
  function genericScript(issue, agentId) {
    const started = D.statuses[issue.team].find((s) => s.category === 'started');
    const review = D.statuses[issue.team].filter((s) => s.category === 'started')[1];
    const ops = agentId === 'sable';
    const steps = [];
    if (['backlog', 'todo'].includes(E.status(issue).category)) steps.push({ at: 600, status: started.name });
    steps.push(
      { at: 900, state: 'working', msg: `Picked up ${issue.id}. Reading the description, relations and the last comments.` },
      { at: 4800, state: 'working', msg: ops
          ? 'Found the runbook for this. Dry run against the scratch instance first.'
          : 'Reproduced it locally. Writing a failing test before touching the code.' },
      { at: 9000, state: 'working', msg: ops
          ? 'Dry run clean. Applying the change on the dogfood instance.'
          : 'Change made. `pnpm test`: **all green**, contract tests included.' },
      { at: 12500, state: 'working', msg: ops ? 'Watching error rates for ten minutes.' : 'Opened a pull request.',
        links: ops ? undefined : [{ kind: 'pr', title: `#${330 + issue.number % 40} ${issue.title.replace(/`/g, '')}`, url: '#' }] },
      { at: 15500, state: 'done', msg: ops ? 'Error rates flat. Handing back to the assignee.' : 'Ready for review.' },
      { at: 15800, status: review.name },
    );
    return steps;
  }

  function startRun(id, agentId, onBehalfOf) {
    stopRun(id);
    const issue = E.issue(id);
    const script = D.scripts[id] || genericScript(issue, agentId);
    const run = (S.runs[id] = { agent: agentId, onBehalfOf, startedAt: Date.now(), active: true, timers: [] });
    const agent = E.member(agentId);
    script.forEach((step, i) => {
      run.timers.push(setTimeout(() => {
        if (step.status) {
          setStatus(id, step.status, agentId, onBehalfOf, true);
          toast(`${agent.name} moved ${id} to ${step.status}`);
        }
        if (step.sub) setStatus(step.sub[0], step.sub[1], agentId, onBehalfOf, true);
        if (step.msg) {
          D.progress.push({ id: nextId(), issueId: id, agent: agentId, state: step.state, msg: step.msg, links: step.links, at: Date.now(), live: true });
          if (step.links) addEvent(id, agentId, `linked ${step.links[0].title}`, onBehalfOf, true);
        }
        if (i === script.length - 1) run.active = false;
        paint();
      }, step.at));
    });
    paint();
  }

  function stopRun(id) {
    const run = S.runs[id];
    if (!run) return;
    run.timers.forEach(clearTimeout);
    run.active = false;
    if (run.interval) clearInterval(run.interval);
  }

  // Put a scripted issue back to where it started and run it again.
  const initial = {};
  for (const id of Object.keys(D.scripts)) {
    const ids = [id, ...D.issues.filter((i) => i.parent === id).map((i) => i.id)];
    initial[id] = ids.map((x) => [x, E.issue(x).status]);
  }
  function replay(id) {
    if (!initial[id]) return;
    stopRun(id);
    const ids = initial[id].map(([x]) => x);
    initial[id].forEach(([x, st]) => (E.issue(x).status = st));
    E.issue(id).delegate = D.scripts[id] ? E.issue(id).delegate || 'ferro' : null;
    for (const key of ['progress', 'events']) D[key] = D[key].filter((p) => !(p.live && ids.includes(p.issueId)));
    paint();
    setTimeout(() => startRun(id, E.issue(id).delegate, 'amirali'), 500);
  }

  function startAmbient() {
    for (const [id, a] of Object.entries(D.ambient)) {
      const first = D.progress.filter((p) => p.issueId === id)[0];
      const run = (S.runs[id] = { agent: a.agent, startedAt: first ? first.at : Date.now(), active: true, timers: [], ambient: true });
      let n = 0;
      run.interval = setInterval(() => {
        const issue = E.issue(id);
        if (issue.delegate !== a.agent || E.status(issue).category !== 'started') return;
        D.progress.push({ id: nextId(), issueId: id, agent: a.agent, state: 'working', msg: a.msgs[n++ % a.msgs.length], at: Date.now(), live: true });
        paint();
      }, a.every + Math.random() * 2000);
    }
  }

  // ---------- rendering ----------
  const V = () => window.VARIANTS[S.dir];
  const REGIONS = ['side', 'top', 'main', 'peek', 'mode'];

  function mount() {
    const html = document.documentElement;
    html.dataset.dir = S.dir;
    html.dataset.theme = S.theme;
    document.title = `ENG issues · Edict M0 · ${S.dir}`;
    $('#app').innerHTML = V().shell(E);
    paint();
    renderBar();
  }

  function paint(...parts) {
    const regions = parts.length ? parts : REGIONS;
    for (const r of regions) {
      const el = $(`#app [data-region="${r}"]`);
      if (!el || !V()[r]) continue;
      // Keep scroll, typed text and focus across repaints; agent updates repaint often.
      const scrolls = [el, ...$$('[data-scroll]', el)].map((s) => ({
        key: s === el ? '__region' : s.dataset.scroll, top: s.scrollTop,
        fromBottom: s.scrollHeight - s.scrollTop - s.clientHeight,
      }));
      const kept = $$('[data-keep]', el).map((k) => ({
        key: k.dataset.keep, value: k.value, focused: document.activeElement === k,
        start: k.selectionStart, end: k.selectionEnd,
      }));
      if (r === 'peek') el.dataset.open = S.peekId ? 'true' : 'false';
      el.innerHTML = V()[r](E);
      for (const s of scrolls) {
        const t = s.key === '__region' ? el : $(`[data-scroll="${s.key}"]`, el);
        if (!t) continue;
        t.scrollTop = t.hasAttribute('data-stick-bottom') && s.fromBottom < 60 ? t.scrollHeight : s.top;
      }
      for (const k of kept) {
        const t = $(`[data-keep="${k.key}"]`, el);
        if (!t) continue;
        t.value = k.value;
        if (k.focused) { t.focus(); t.setSelectionRange(k.start, k.end); }
      }
    }
    if (S.scrollFocus) {
      const f = $('#app [data-region="main"] [data-focused="true"]');
      if (f) f.scrollIntoView({ block: 'nearest' });
      S.scrollFocus = false;
    }
    $$('#app [data-stick-bottom]').forEach((t) => { if (!t.dataset.stuck) { t.dataset.stuck = '1'; t.scrollTop = t.scrollHeight; } });
    reveal();
    syncUrl();
  }

  // Fresh progress updates type themselves in. Each element animates once.
  function reveal() {
    if (reduceMotion) return;
    for (const el of $$('#app [data-reveal]')) {
      const key = el.dataset.reveal;
      if (S.revealed.has(key)) continue;
      S.revealed.add(key);
      const p = D.progress.find((x) => x.id === key.split(':')[0]);
      if (!p || !p.live || Date.now() - p.at > 2500) continue;
      typewrite(el);
    }
  }

  function typewrite(el) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push([walker.currentNode, walker.currentNode.textContent]);
    const total = nodes.reduce((n, [, t]) => n + t.length, 0);
    nodes.forEach(([n]) => (n.textContent = ''));
    el.classList.add('is-typing');
    const t0 = performance.now();
    const frame = (t) => {
      let left = Math.floor((t - t0) * 0.11); // about 110 characters a second
      const shown = left;
      for (const [n, full] of nodes) { n.textContent = full.slice(0, Math.max(0, left)); left -= full.length; }
      if (shown < total && el.isConnected) requestAnimationFrame(frame);
      else el.classList.remove('is-typing');
    };
    requestAnimationFrame(frame);
  }

  setInterval(() => $$('[data-since]').forEach((el) => (el.textContent = E.clock(+el.dataset.since))), 1000);

  function syncUrl() {
    const q = new URLSearchParams({ d: S.dir, theme: S.theme, view: S.view });
    if (S.team !== 'ENG') q.set('team', S.team);
    if (S.peekId) q.set('issue', S.peekId);
    history.replaceState(null, '', `?${q}`);
  }

  // ---------- navigation ----------
  function ensureFocus() {
    const order = E.order();
    if (!order.includes(S.focusId)) S.focusId = order[0];
  }

  function move(dy, dx) {
    ensureFocus();
    if (S.view === 'list' || dx === 0) {
      if (S.view === 'board') {
        const cols = E.columns().map((c) => c.issues.map((i) => i.id));
        const ci = cols.findIndex((c) => c.includes(S.focusId));
        const col = cols[ci];
        S.focusId = col[Math.max(0, Math.min(col.length - 1, col.indexOf(S.focusId) + dy))];
      } else {
        const order = E.order();
        S.focusId = order[Math.max(0, Math.min(order.length - 1, order.indexOf(S.focusId) + dy))];
      }
    } else {
      const cols = E.columns().map((c) => c.issues.map((i) => i.id));
      let ci = cols.findIndex((c) => c.includes(S.focusId));
      const ri = cols[ci].indexOf(S.focusId);
      for (let n = ci + dx; n >= 0 && n < cols.length; n += dx) {
        if (cols[n].length) { ci = n; break; }
      }
      S.focusId = cols[ci][Math.min(ri, cols[ci].length - 1)];
    }
    S.scrollFocus = true;
    if (S.peekId) S.peekId = S.focusId;
    paint();
  }

  function open(id) {
    const issue = E.issue(id);
    if (!issue) return;
    if (issue.team !== S.team) S.team = issue.team;
    S.focusId = id;
    S.peekId = id;
    S.scrollFocus = true;
    paint();
  }

  function closePeek() {
    S.peekId = null;
    paint();
  }

  function setView(v) {
    S.view = v || (S.view === 'list' ? 'board' : 'list');
    paint();
    S.scrollFocus = true;
    paint('main');
  }

  function setTeam(key) {
    S.team = key || (S.team === 'ENG' ? 'OPS' : 'ENG');
    S.focusId = null;
    S.peekId = null;
    ensureFocus();
    paint();
  }

  function setTheme(t) {
    document.documentElement.classList.add('no-tx');
    S.theme = t || (S.theme === 'light' ? 'dark' : 'light');
    document.documentElement.dataset.theme = S.theme;
    renderBar();
    syncUrl();
    requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.remove('no-tx')));
  }

  function setDir(v) {
    S.dir = v === 'prev' || v === 'next' || !v ? (S.dir === 'A' ? 'C' : 'A') : v;
    document.documentElement.classList.add('no-tx');
    mount();
    requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.remove('no-tx')));
  }

  // ---------- toast ----------
  let toastTimer;
  function toast(msg, withUndo) {
    S.toast = { msg, undo: !!withUndo };
    const el = $('#toast');
    el.innerHTML = `<div class="toast"><span>${esc(msg)}</span>${withUndo ? `<button type="button" data-act="undo">Undo <kbd>${E.mod}Z</kbd></button>` : ''}</div>`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.innerHTML = ''; S.toast = null; }, withUndo ? 6000 : 3500);
  }

  // ---------- command palette ----------
  function fuzzy(q, s) {
    if (!q) return 1;
    q = q.toLowerCase(); s = s.toLowerCase();
    const at = s.indexOf(q);
    if (at === 0) return 3;
    if (at > 0) return 2 - at / 200;
    let i = 0;
    for (const ch of s) if (ch === q[i]) i++;
    return i === q.length ? 0.5 : 0;
  }

  function paletteItems() {
    const p = S.palette;
    const issue = E.issue(p.target);
    const items = [];
    const add = (group, item) => items.push({ group, ...item });

    if (p.mode === 'status') {
      E.statuses(issue.team).forEach((st) => add('Status', {
        label: st.name, icon: E.icon.status(st), current: issue.status === st.id,
        run: () => act(setStatus(issue.id, st.id), `${issue.id} moved to ${st.name}`),
      }));
    } else if (p.mode === 'assignee') {
      E.humans().forEach((m) => add('Assignee', {
        label: m.name, member: m, current: issue.assignee === m.id,
        run: () => act(setAssignee(issue.id, m.id), `${issue.id} assigned to ${m.short}`),
      }));
      add('Assignee', { label: 'Unassigned', current: !issue.assignee, run: () => act(setAssignee(issue.id, null), `${issue.id} unassigned`) });
    } else if (p.mode === 'delegate') {
      E.agents().forEach((m) => add('Delegate to an agent', {
        label: m.name, sub: m.about, member: m, agent: true, current: issue.delegate === m.id,
        run: () => act(setDelegate(issue.id, m.id), `${issue.id} delegated to ${m.name}`),
      }));
      if (issue.delegate) add('Delegate to an agent', { label: 'Remove delegate', run: () => act(setDelegate(issue.id, null), `Removed the delegate from ${issue.id}`) });
    } else {
      if (issue) {
        const g = `Issue ${issue.id}`;
        add(g, { label: 'Change status…', kbd: 'S', icon: E.icon.status(E.status(issue)), sub: E.status(issue).name, to: 'status' });
        add(g, { label: 'Assign to…', kbd: 'A', sub: issue.assignee ? E.member(issue.assignee).short : 'Unassigned', to: 'assignee' });
        add(g, { label: 'Delegate to agent…', kbd: 'D', agent: true, sub: issue.delegate ? E.member(issue.delegate).name : 'No delegate', to: 'delegate' });
        if (D.scripts[issue.id]) add(g, { label: `Replay ${E.member(issue.delegate || 'ferro').name}'s run`, agent: true, run: () => replay(issue.id) });
        if (S.peekId !== issue.id) add(g, { label: 'Open issue', kbd: '↵', run: () => open(issue.id) });
      }
      add('Create', { label: 'Create issue', kbd: 'C', run: () => openCreate() });
      add('View', { label: S.view === 'list' ? 'Switch to board view' : 'Switch to list view', kbd: 'V', run: () => setView() });
      add('View', { label: `Go to ${S.team === 'ENG' ? 'OPS' : 'ENG'} issues`, run: () => setTeam() });
      add('View', { label: S.theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme', kbd: 'T', run: () => setTheme() });
      add('Prototype', { label: `Show direction ${S.dir === 'A' ? 'C · Agent-native' : 'A · Calm precision'}`, kbd: '\\', run: () => setDir() });
      if (p.query) {
        D.issues.map((i) => ({ i, s: Math.max(fuzzy(p.query, i.id), fuzzy(p.query, i.title)) }))
          
          .filter((x) => x.s >= 1).sort((a, b) => b.s - a.s).slice(0, 8)
          .forEach(({ i }) => add('Issues', { label: i.title, idLabel: i.id, icon: E.icon.status(E.status(i)), issueRef: i, score: 1.5, run: () => open(i.id) }));
      }
    }
    if (!p.query) return items;
    return items
      .map((it) => ({ it, s: it.score || fuzzy(p.query, it.label) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.it);
  }

  function openPalette(mode = 'root', targetId) {
    const target = targetId || S.peekId || S.focusId;
    if (mode !== 'root' && !E.issue(target)) return;
    S.palette = { mode, query: '', idx: 0, target, from: mode };
    renderPaletteFrame();
  }

  function renderPaletteFrame() {
    const root = $('#palette');
    root.innerHTML = V().paletteFrame(E);
    root.hidden = false;
    $('#app').inert = true;
    const input = $('[data-palette-input]', root);
    input.value = S.palette.query;
    input.focus();
    input.addEventListener('input', () => { S.palette.query = input.value; S.palette.idx = 0; renderPaletteList(); });
    input.addEventListener('keydown', onPaletteKey);
    renderPaletteList();
  }

  function renderPaletteList() {
    const p = S.palette;
    p.items = paletteItems();
    p.idx = Math.min(p.idx, Math.max(0, p.items.length - 1));
    const list = $('#palette [data-palette-list]');
    list.innerHTML = V().paletteList(E, p.items, p.idx);
    markActive();
  }

  function markActive() {
    const p = S.palette;
    $$('#palette [data-ix]').forEach((el) => el.setAttribute('aria-selected', String(+el.dataset.ix === p.idx)));
    const active = $(`#palette [data-ix="${p.idx}"]`);
    $('#palette [data-palette-input]').setAttribute('aria-activedescendant', active ? active.id : '');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  function runItem(ix) {
    const it = S.palette.items[ix];
    if (!it) return;
    if (it.to) {
      S.palette = { ...S.palette, mode: it.to, query: '', idx: 0 };
      renderPaletteFrame();
      return;
    }
    closePalette();
    it.run();
  }

  function onPaletteKey(e) {
    const p = S.palette;
    const n = p.items.length;
    const down = e.key === 'ArrowDown' || (e.ctrlKey && (e.key === 'n' || e.key === 'j'));
    const up = e.key === 'ArrowUp' || (e.ctrlKey && (e.key === 'p' || e.key === 'k'));
    if (down || up) {
      e.preventDefault();
      if (n) p.idx = (p.idx + (down ? 1 : -1) + n) % n;
      markActive();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runItem(p.idx);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closePalette();
    } else if (e.key === 'Backspace' && !p.query && p.mode !== 'root' && p.from === 'root') {
      e.preventDefault();
      S.palette = { ...p, mode: 'root', idx: 0 };
      renderPaletteFrame();
    }
  }

  function closePalette() {
    S.palette = null;
    const root = $('#palette');
    root.hidden = true;
    root.innerHTML = '';
    $('#app').inert = false;
  }

  // ---------- create issue ----------
  function openCreate() {
    S.create = { team: S.team };
    const root = $('#modal');
    root.innerHTML = V().createFrame(E);
    root.hidden = false;
    $('#app').inert = true;
    const title = $('[name="title"]', root);
    title.focus();
    root.addEventListener('keydown', onCreateKey);
  }

  function onCreateKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); closeCreate(); }
    else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || e.target.name === 'title')) { e.preventDefault(); submitCreate(); }
  }

  function submitCreate() {
    const root = $('#modal');
    const title = $('[name="title"]', root).value.trim();
    if (!title) {
      $('[name="title"]', root).setAttribute('aria-invalid', 'true');
      $('[name="title"]', root).focus();
      return;
    }
    const issue = createIssue(title, $('[name="description"]', root).value.trim());
    closeCreate();
    S.undo = () => { D.issues = D.issues.filter((i) => i !== issue); ensureFocus(); };
    toast(`Created ${issue.id}`, true);
    paint();
  }

  function closeCreate() {
    S.create = null;
    const root = $('#modal');
    root.removeEventListener('keydown', onCreateKey);
    root.hidden = true;
    root.innerHTML = '';
    $('#app').inert = false;
  }

  function postComment() {
    const ta = $('#app [data-keep="composer"]');
    if (!ta || !ta.value.trim()) return;
    D.comments.push({ issueId: S.peekId, author: 'amirali', at: Date.now(), body: ta.value.trim() });
    ta.value = '';
    paint('peek');
  }

  // ---------- switcher bar ----------
  const DIRS = { A: 'Calm precision', C: 'Agent-native' };
  function renderBar() {
    $('#proto-bar').innerHTML = `
      <span class="pb-tag">M0 prototype</span>
      <button type="button" data-act="dir" data-v="prev" aria-label="Previous direction">‹</button>
      <span class="pb-label" aria-live="polite"><b>${S.dir}</b> ${DIRS[S.dir]}</span>
      <button type="button" data-act="dir" data-v="next" aria-label="Next direction">›</button>
      <span class="pb-sep" aria-hidden="true"></span>
      <button type="button" data-act="theme" class="pb-theme">${S.theme === 'light' ? 'Light' : 'Dark'}</button>
      <span class="pb-keys"><kbd>\\</kbd> direction <kbd>T</kbd> theme</span>`;
  }

  // ---------- input ----------
  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (S.palette) closePalette();
      else if (!S.create) openPalette('root');
      return;
    }
    if (S.palette || S.create) return;
    const t = e.target;
    if (t.matches && t.matches('input, textarea, [contenteditable]')) {
      if (e.key === 'Escape') t.blur();
      if (e.key === 'Enter' && mod && t.dataset.keep === 'composer') { e.preventDefault(); postComment(); }
      return;
    }
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    if (mod || e.altKey) return;
    const board = S.view === 'board';
    const keys = {
      j: () => move(1, 0), ArrowDown: () => move(1, 0),
      k: () => move(-1, 0), ArrowUp: () => move(-1, 0),
      h: () => board && move(0, -1), ArrowLeft: () => board && move(0, -1),
      l: () => board && move(0, 1), ArrowRight: () => board && move(0, 1),
      Enter: () => { ensureFocus(); open(S.focusId); },
      Escape: () => S.peekId && closePeek(),
      s: () => openPalette('status'),
      a: () => openPalette('assignee'),
      d: () => openPalette('delegate'),
      c: () => openCreate(),
      v: () => setView(),
      t: () => setTheme(),
      '\\': () => setDir(),
    };
    const fn = keys[e.key];
    if (!fn) return;
    if (e.key === 'Enter' && t.closest && t.closest('button, a') && !t.closest('[data-act="open"]')) return;
    e.preventDefault();
    fn();
  });

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const { act: a, id, v, ix } = el.dataset;
    const actions = {
      open: () => open(id),
      'close-peek': closePeek,
      palette: () => openPalette('root'),
      status: () => openPalette('status', id),
      assignee: () => openPalette('assignee', id),
      delegate: () => openPalette('delegate', id),
      create: openCreate,
      'create-submit': submitCreate,
      'create-cancel': closeCreate,
      view: () => setView(v),
      team: () => setTeam(v),
      theme: () => setTheme(),
      dir: () => setDir(v),
      undo,
      replay: () => replay(id),
      comment: postComment,
      'pal-item': () => runItem(+ix),
      backdrop: () => { if (e.target === el) { S.palette ? closePalette() : closeCreate(); } },
    };
    if (!actions[a]) return;
    if (el.tagName === 'A') e.preventDefault();
    actions[a]();
  });

  document.addEventListener('mousemove', (e) => {
    if (!S.palette) return;
    const el = e.target.closest('#palette [data-ix]');
    if (el && +el.dataset.ix !== S.palette.idx) { S.palette.idx = +el.dataset.ix; markActive(); }
  });

  // ---------- boot ----------
  window.addEventListener('DOMContentLoaded', () => {
    ensureFocus();
    if (S.peekId && E.issue(S.peekId)) S.focusId = S.peekId;
    else S.peekId = null;
    mount();
    startAmbient();
    setTimeout(() => startRun('ENG-142', 'ferro', 'amirali'), 2500);
  });

  window.EDICT = { S, replay, startRun, open, setDir, setTheme, setView, openPalette };
})();
