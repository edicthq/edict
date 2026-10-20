// The switcher (ADR 0028): the saved instances, most recently used first, and
// a form to add one. Picking an instance loads it in the main window and the
// shell closes this one (src-tauri/src/lib.rs). Only this bundled page may
// list or change the saved instances; an instance's page can only open it.
const { invoke } = window.__TAURI__.core;
const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? "⌘" : "Ctrl+";

const filter = document.getElementById("filter");
const list = document.getElementById("list");
const empty = document.getElementById("empty");
const form = document.getElementById("add");
const address = document.getElementById("address");
const addButton = form.querySelector("button");
const error = document.getElementById("error");

const state = {
  instances: [],
  active: null,
  cursor: 0,
  // The url being renamed, and what has been typed so far.
  renaming: null,
  draft: "",
  // The url waiting for a second "Remove".
  confirming: null,
  // The url whose ⋯ menu is open.
  menu: null,
  loaded: false,
};

const icons = {
  check: '<svg class="check" viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="m3.5 8.5 3 3 6-7"/></svg>',
  more: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="3.5" cy="8" r="1.25" fill="currentColor"/><circle cx="8" cy="8" r="1.25" fill="currentColor"/><circle cx="12.5" cy="8" r="1.25" fill="currentColor"/></svg>',
};

function host(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

// The instances the filter lets through, each with its place in the full
// list, which is what ⌘1…⌘9 and the menus count by.
function shown() {
  const query = filter.value.trim().toLowerCase();
  return state.instances
    .map((instance, index) => ({ instance, index }))
    .filter(({ instance }) => !query || instance.name.toLowerCase().includes(query) || host(instance.url).includes(query));
}

function apply(listing) {
  const first = !state.loaded;
  state.instances = listing.instances;
  state.active = listing.active;
  state.loaded = true;
  if (first) {
    // The cursor starts on the instance used before the one in front, so
    // Enter goes back to it, like ⌘Tab. The rows keep their saved order, so
    // ⌘1 to ⌘9 always name the same instance.
    let previous = -1;
    state.instances.forEach((instance, index) => {
      if (instance.url === state.active) return;
      if (previous < 0 || instance.lastUsedAt >= state.instances[previous].lastUsedAt) previous = index;
    });
    state.cursor = previous < 0 ? 0 : previous;
  }
  if (state.renaming && !state.instances.some((instance) => instance.url === state.renaming)) state.renaming = null;
  render();
}

async function load() {
  try {
    apply(await invoke("list_instances"));
  } catch (message) {
    error.textContent = String(message);
  }
}

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const child of children) node.append(child);
  return node;
}

function render() {
  const rows = shown();
  state.cursor = Math.max(0, Math.min(state.cursor, rows.length - 1));
  list.replaceChildren(...rows.map((row, position) => renderRow(row, position)));
  const query = filter.value.trim();
  empty.hidden = rows.length > 0 || !state.loaded;
  empty.textContent = query
    ? `No saved instance matches “${query}”. Press Enter to add it.`
    : "No instances saved yet. Add one below.";
  const current = rows[state.cursor];
  if (current) filter.setAttribute("aria-activedescendant", `row-${current.index}`);
  else filter.removeAttribute("aria-activedescendant");
  const rename = list.querySelector(".rename");
  if (rename && document.activeElement !== rename) {
    rename.focus();
    rename.select();
  }
  list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
}

function renderRow({ instance, index }, position) {
  const isActive = instance.url === state.active;
  const row = el("li", { id: `row-${index}`, className: "row" });
  row.setAttribute("role", "option");
  row.setAttribute("aria-selected", String(position === state.cursor));
  row.dataset.url = instance.url;
  row.dataset.position = String(position);

  if (state.confirming === instance.url) {
    const cancel = el("button", { type: "button", className: "quiet", textContent: "Cancel" });
    const remove = el("button", { type: "button", className: "quiet", textContent: "Remove" });
    cancel.addEventListener("click", () => {
      state.confirming = null;
      render();
      filter.focus();
    });
    remove.addEventListener("click", () => removeInstance(instance));
    row.append(el("span", { className: "confirm", textContent: `Remove ${instance.name} from the app?` }), cancel, remove);
    queueMicrotask(() => remove.focus());
    return row;
  }

  if (state.renaming === instance.url) {
    const input = el("input", {
      className: "field rename",
      value: state.draft,
      maxLength: 60,
      spellcheck: false,
    });
    input.setAttribute("aria-label", `Rename ${instance.name}`);
    input.addEventListener("input", () => (state.draft = input.value));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        saveRename();
      }
    });
    input.addEventListener("blur", () => saveRename());
    row.append(input);
    return row;
  }

  const name = el("span", { className: "name", textContent: instance.name });
  const label = el("span", { className: "label" }, [name]);
  if (instance.name !== host(instance.url)) label.append(el("span", { className: "host", textContent: host(instance.url) }));
  row.append(label);
  if (index < 9) row.append(el("kbd", { textContent: `${mod}${index + 1}` }));
  // The check's slot stays when empty, so the shortcuts line up.
  if (isActive) {
    row.insertAdjacentHTML("beforeend", icons.check);
    row.append(el("span", { className: "visually-hidden", textContent: "In front" }));
  } else {
    row.append(el("span", { className: "check" }));
  }
  const more = el("button", { type: "button", className: "more", tabIndex: -1, innerHTML: icons.more });
  more.setAttribute("aria-label", `More for ${instance.name}`);
  more.setAttribute("aria-haspopup", "menu");
  more.setAttribute("aria-expanded", String(state.menu === instance.url));
  more.addEventListener("click", (event) => {
    event.stopPropagation();
    state.menu = state.menu === instance.url ? null : instance.url;
    render();
    list.querySelector(".menu button")?.focus();
  });
  row.append(more);
  if (state.menu === instance.url) row.append(renderMenu(instance));
  return row;
}

function renderMenu(instance) {
  const item = (text, shortcut, action) => {
    const button = el("button", { type: "button" }, [el("span", { textContent: text }), el("kbd", { textContent: shortcut })]);
    button.setAttribute("role", "menuitem");
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      state.menu = null;
      action();
    });
    return el("li", {}, [button]);
  };
  const menu = el("ul", { className: "menu" }, [
    item("Rename", isMac ? "⌘↩" : "F2", () => startRename(instance)),
    item("Remove", isMac ? "⌘⌫" : "Ctrl+Del", () => confirmRemove(instance)),
  ]);
  menu.setAttribute("role", "menu");
  menu.addEventListener("keydown", (event) => {
    const items = [...menu.querySelectorAll("button")];
    const at = items.indexOf(document.activeElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      const step = event.key === "ArrowDown" ? 1 : -1;
      items[(at + step + items.length) % items.length].focus();
    }
  });
  return menu;
}

function closeMenu() {
  state.menu = null;
  render();
  filter.focus();
}

function startRename(instance) {
  state.renaming = instance.url;
  state.draft = instance.name;
  state.confirming = null;
  render();
}

let saving = false;
async function saveRename() {
  if (!state.renaming || saving) return;
  const url = state.renaming;
  const name = state.draft;
  saving = true;
  state.renaming = null;
  try {
    apply(await invoke("rename_instance", { url, name }));
  } catch (message) {
    error.textContent = String(message);
    render();
  } finally {
    saving = false;
    filter.focus();
  }
}

function cancelRename() {
  state.renaming = null;
  render();
  filter.focus();
}

function confirmRemove(instance) {
  state.confirming = instance.url;
  state.renaming = null;
  render();
}

async function removeInstance(instance) {
  state.confirming = null;
  try {
    apply(await invoke("remove_instance", { url: instance.url }));
  } catch (message) {
    error.textContent = String(message);
    render();
  }
  filter.focus();
}

async function pick(instance) {
  if (!instance) return;
  try {
    // The shell closes this window once the main window has it.
    await invoke("switch_instance", { url: instance.url });
  } catch (message) {
    error.textContent = String(message);
    load();
  }
}

function focusAdd() {
  address.focus();
  address.select();
}

function close() {
  window.__TAURI__.window.getCurrentWindow().close();
}

filter.addEventListener("input", () => {
  state.cursor = 0;
  state.menu = null;
  state.confirming = null;
  render();
});

filter.addEventListener("keydown", (event) => {
  const rows = shown();
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    if (!rows.length) return;
    const step = event.key === "ArrowDown" ? 1 : -1;
    state.cursor = (state.cursor + step + rows.length) % rows.length;
    state.menu = null;
    render();
  } else if (event.key === "Enter" && !event.isComposing) {
    event.preventDefault();
    const row = rows[state.cursor];
    if (row && !(isMac && (event.metaKey || event.ctrlKey))) pick(row.instance);
    else if (row) startRename(row.instance);
    else if (filter.value.trim()) {
      address.value = filter.value.trim();
      focusAdd();
    }
  } else if (event.key === "F2" && rows[state.cursor]) {
    event.preventDefault();
    startRename(rows[state.cursor].instance);
  } else if (
    (isMac ? event.metaKey && event.key === "Backspace" : event.ctrlKey && event.key === "Delete") &&
    rows[state.cursor]
  ) {
    event.preventDefault();
    confirmRemove(rows[state.cursor].instance);
  }
});

list.addEventListener("pointermove", (event) => {
  const row = event.target.closest(".row");
  if (!row || state.renaming || state.confirming) return;
  const position = Number(row.dataset.position);
  if (position === state.cursor) return;
  state.cursor = position;
  for (const other of list.querySelectorAll(".row")) {
    other.setAttribute("aria-selected", String(other === row));
  }
  filter.setAttribute("aria-activedescendant", row.id);
});

// A click on a row picks it. A click on the name waits a moment, since a
// double click there renames.
let pending = null;
list.addEventListener("click", (event) => {
  const row = event.target.closest(".row");
  if (!row || event.target.closest("button, input, .menu")) return;
  if (state.renaming || state.confirming) return;
  const instance = state.instances.find((item) => item.url === row.dataset.url);
  clearTimeout(pending);
  if (event.target.closest(".name")) pending = setTimeout(() => pick(instance), 250);
  else pick(instance);
});

list.addEventListener("dblclick", (event) => {
  const row = event.target.closest(".row");
  if (!row || !event.target.closest(".name")) return;
  clearTimeout(pending);
  const instance = state.instances.find((item) => item.url === row.dataset.url);
  if (instance) startRename(instance);
});

document.addEventListener("pointerdown", (event) => {
  if (state.menu && !event.target.closest(".menu, .more")) closeMenu();
});

document.addEventListener("keydown", (event) => {
  // ⌘1…⌘9 (Ctrl elsewhere) pick by place in the full list, as the menus do.
  const ctrl = isMac ? event.metaKey : event.ctrlKey;
  if (ctrl && !event.shiftKey && !event.altKey && /^[1-9]$/.test(event.key)) {
    event.preventDefault();
    pick(state.instances[Number(event.key) - 1]);
    return;
  }
  if (event.key !== "Escape") return;
  event.preventDefault();
  if (state.menu) closeMenu();
  else if (state.renaming) cancelRename();
  else if (state.confirming) {
    state.confirming = null;
    render();
    filter.focus();
  } else if (document.activeElement === filter && filter.value) {
    filter.value = "";
    state.cursor = 0;
    render();
  } else close();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  error.textContent = "";
  addButton.disabled = true;
  addButton.textContent = "Checking…";
  try {
    // The shell checks the address, saves it, loads it in the main window
    // and closes this one.
    await invoke("add_instance", { address: address.value });
  } catch (message) {
    error.textContent = String(message);
    addButton.disabled = false;
    addButton.textContent = "Add";
    address.focus();
  }
});

// Each time the switcher comes back to the front, the list may have changed
// from the menus.
window.addEventListener("focus", () => {
  if (!state.renaming) load();
});

window.edictSwitcher = { focusAdd };
// Not resizable, so close is its only window button.
window.edictChrome.controls(document.getElementById("window-controls"), ["close"]);
load();
if (location.hash === "#add") focusAdd();
