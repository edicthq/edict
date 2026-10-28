// The page the main window shows until an instance is saved: it asks for the
// first one, and the shell checks it, saves it and loads it in this window
// (src-tauri/src/lib.rs, add_instance). More instances come from the switcher.
const form = document.getElementById("connect");
const error = document.getElementById("error");
const button = form.querySelector("button");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  error.textContent = "";
  button.disabled = true;
  button.textContent = "Connecting…";
  try {
    await window.__TAURI__.core.invoke("add_instance", { address: form.address.value });
  } catch (message) {
    error.textContent = String(message);
    button.disabled = false;
    button.textContent = "Connect";
  }
});

window.edictChrome.controls(document.getElementById("window-controls"), ["minimize", "maximize", "close"]);
