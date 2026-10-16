import { createApp } from "./app.js";
import { readConfig } from "./env.js";

const { start, shutdown } = createApp(readConfig(process.env));

start().catch((error: unknown) => {
  console.error("edict failed to start", error);
  process.exitCode = 1;
  void shutdown();
});

process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());
