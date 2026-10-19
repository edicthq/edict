import pg from "pg";
import { startCollector } from "./collector.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: databaseUrl });
const port = Number(process.env.PORT ?? 3000);

startCollector({ pool, port })
  .then(({ close }) => {
    console.info(`telemetry collector on :${port}`);
    const stop = () => void close().then(() => pool.end());
    process.once("SIGTERM", stop);
    process.once("SIGINT", stop);
  })
  .catch((error: unknown) => {
    console.error("the telemetry collector failed to start", error);
    process.exit(1);
  });
