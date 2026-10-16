import { createDatabase, createPool } from "@edict/db";
import { createAuth } from "../src/auth.js";

const pool = createPool("postgres://localhost/generate-only");
export const auth = createAuth(
  { secret: "generate-only", baseURL: "http://localhost:3000" },
  createDatabase(pool),
);
