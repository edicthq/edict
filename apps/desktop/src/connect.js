// The one page the app bundles: it asks for the server, and the shell checks
// it and switches the window to it (src-tauri/src/lib.rs, connect).
const form = document.getElementById("connect");
const error = document.getElementById("error");
const button = form.querySelector("button");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  error.textContent = "";
  button.disabled = true;
  button.textContent = "Connecting…";
  try {
    await window.__TAURI__.core.invoke("connect", { address: form.address.value });
  } catch (message) {
    error.textContent = String(message);
    button.disabled = false;
    button.textContent = "Connect";
  }
});
