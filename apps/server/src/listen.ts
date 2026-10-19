import type { Pool, PoolClient } from "pg";

// Holds one connection that LISTENs on a Postgres channel and hands each
// notification's payload on. When the connection drops (Postgres restarted,
// a failover), it reconnects with backoff and calls onReconnect, since
// notifications sent in between are lost and the caller may need to catch up.
export async function listen(
  pool: Pool,
  channel: string,
  onNotify: (payload: string) => void,
  onReconnect: () => void = () => {},
): Promise<() => Promise<void>> {
  let client: PoolClient | undefined;
  let releaseClient = () => {};
  let stopped = false;
  let delay = 1000;

  const attach = async (): Promise<void> => {
    const next = await pool.connect();
    next.on("notification", (message) => {
      if (message.channel === channel) onNotify(message.payload ?? "");
    });
    let released = false;
    next.on("error", (error) => {
      if (released) return;
      released = true;
      console.error(`postgres: the ${channel} listener's connection closed:`, error.message);
      next.release(true);
      if (client === next) client = undefined;
      void retry();
    });
    await next.query(`LISTEN ${channel}`);
    client = next;
    releaseClient = () => {
      if (released) return;
      released = true;
      next.release();
    };
    delay = 1000;
  };

  const retry = async (): Promise<void> => {
    while (!stopped && !client) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, 30_000);
      try {
        await attach();
        onReconnect();
      } catch (error) {
        console.error(`postgres: reconnecting the ${channel} listener failed:`, (error as Error).message);
      }
    }
  };

  await attach();
  return async () => {
    stopped = true;
    const held = client;
    client = undefined;
    if (held) {
      await held.query(`UNLISTEN ${channel}`).catch(() => undefined);
      releaseClient();
    }
  };
}
