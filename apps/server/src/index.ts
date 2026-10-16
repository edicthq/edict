import { randomBytes } from "node:crypto";
import { createApp } from "./app.js";
import { readConfig } from "./env.js";

export function main(env: NodeJS.ProcessEnv): void {
  const config = readConfig(env);
  const { app, start, shutdown } = createApp(config, {
    auth: readAuthSecret(env),
  });
  void start();

  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());
}

function readAuthSecret(env: NodeJS.ProcessEnv): { secret: string } {
  const secret = env.BETTER_AUTH_SECRET;
  if (secret) {
    return { secret };
  }

  console.warn(
    "BETTER_AUTH_SECRET is not set; generating an ephemeral secret. Sessions reset on restart. Set BETTER_AUTH_SECRET to keep them.",
  );
  return { secret: randomBytes(48).toString("hex") };
}

main(process.env);
