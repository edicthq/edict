import { createApp } from "./app.js";
import { readConfig } from "./env.js";

export function main(env: NodeJS.ProcessEnv): void {
  const config = readConfig(env);
  const { app, start, shutdown } = createApp(config);
  void start();

  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());
}

main(process.env);
