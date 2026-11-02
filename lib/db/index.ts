import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  sql?: ReturnType<typeof postgres>;
};

function getSql() {
  if (!globalForDb.sql) {
    const url = process.env.DATABASE_URL || "postgres://aicost:aicost@127.0.0.1:5432/aicost";
    globalForDb.sql = postgres(url, { max: 10, idle_timeout: 20, connect_timeout: 10 });
  }
  return globalForDb.sql;
}

export const db = drizzle(getSql(), { schema });
export { schema };
