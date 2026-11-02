import { count } from "drizzle-orm";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { signupAllowed } from "@/lib/signup";

export async function accountExists() {
  const [row] = await db.select({ value: count() }).from(user);
  return !signupAllowed(row?.value ?? 0);
}
