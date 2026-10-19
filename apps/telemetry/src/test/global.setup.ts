import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";

let container: StartedPostgreSqlContainer;

export default async function globalSetup(): Promise<() => Promise<void>> {
  container = await new PostgreSqlContainer("postgres:18-alpine").start();
  process.env.DATABASE_URL = container.getConnectionUri();
  return async () => {
    await container.stop();
  };
}
