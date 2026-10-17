import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { openApiDocument } from "../src/api/index.js";

// Writes the /api/v1 OpenAPI document into packages/client. Run through
// `pnpm api:generate` at the root, which also regenerates the client types.
const out = join(import.meta.dirname, "../../../packages/client/openapi.json");
writeFileSync(out, `${JSON.stringify(openApiDocument(), null, 2)}\n`);
console.log(`wrote ${out}`);
