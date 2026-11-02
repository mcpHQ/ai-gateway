import { resolve } from "node:path";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), ".env.local") });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required to run migrations");
  }

  const sql = postgres(url, {
    max: 1,
    onnotice(notice) {
      if (notice.code === "42P06" || notice.code === "42P07") {
        return;
      }
      console.log(notice.message);
    },
  });
  const db = drizzle(sql);
  const migrationsFolder = resolve(process.cwd(), "drizzle");
  await migrate(db, { migrationsFolder });
  await sql.end();
  console.log("Migrations applied from", migrationsFolder);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
