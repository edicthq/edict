// The window chrome of the app's own pages. The shell sets
// window.__EDICT_DESKTOP__ before any script runs (src-tauri/src/chrome.rs):
// on macOS the traffic lights sit over the 44px top strip, so the strip leaves
// room for them; on Windows and Linux there is no native frame, so the page
// draws the window's buttons.
(() => {
  const desktop = window.__EDICT_DESKTOP__ ?? { platform: "web", titleBar: "none" };
  document.documentElement.dataset.platform = desktop.platform;
  document.documentElement.dataset.titleBar = desktop.titleBar;

  const icons = {
    minimize: '<path d="M3.5 8h9" />',
    maximize: '<rect x="3.5" y="3.5" width="9" height="9" rx="1" />',
    close: '<path d="m4 4 8 8M12 4l-8 8" />',
  };
  const labels = { minimize: "Minimize", maximize: "Maximize", close: "Close" };

  // Fills `container` with the window's buttons when the page draws them.
  function controls(container, buttons) {
    if (!container || desktop.titleBar !== "custom") return;
    const current = window.__TAURI__.window.getCurrentWindow();
    const actions = {
      minimize: () => current.minimize(),
      maximize: () => current.toggleMaximize(),
      close: () => current.close(),
    };
    for (const name of buttons) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "window-button";
      button.setAttribute("aria-label", labels[name]);
      button.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round">${icons[name]}</svg>`;
      button.addEventListener("click", actions[name]);
      container.append(button);
    }
  }

  window.edictChrome = { desktop, controls };
})();
