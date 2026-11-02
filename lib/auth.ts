import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { count } from "drizzle-orm";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { memberships, organizations, user as userTable } from "@/lib/db/schema";
import { signupAllowed } from "@/lib/signup";
import { createGatewayRecord } from "@/lib/gateway-record";
import { originsForRequest } from "@/lib/auth-origins";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  secret: process.env.BETTER_AUTH_SECRET || "build-placeholder-secret-not-for-production-use",
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  trustedOrigins: originsForRequest,
  emailAndPassword: {
    enabled: true,
  },
  plugins: [nextCookies()],
  databaseHooks: {
    user: {
      create: {
        before: async () => {
          const [row] = await db.select({ value: count() }).from(userTable);
          if (!signupAllowed(row?.value ?? 0)) {
            throw APIError.fromStatus("FORBIDDEN", { message: "An account already exists" });
          }
        },
        after: async (user) => {
          const orgId = crypto.randomUUID();
          await db.insert(organizations).values({
            id: orgId,
            name: user.name ? `${user.name}'s workspace` : "Workspace",
            slug: `org-${orgId.slice(0, 8)}`,
          });
          await db.insert(memberships).values({
            id: crypto.randomUUID(),
            organizationId: orgId,
            userId: user.id,
            role: "owner",
          });
          await createGatewayRecord(orgId, "Default");
        },
      },
    },
  },
});
