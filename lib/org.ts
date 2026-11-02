import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { memberships } from "@/lib/db/schema";

export async function getSession() {
  return auth.api.getSession({
    headers: await headers(),
  });
}

export async function requireOrg() {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }
  const membership = await db.query.memberships.findFirst({
    where: eq(memberships.userId, session.user.id),
    with: { organization: true },
  });
  if (!membership?.organization) {
    redirect("/login");
  }
  return {
    session,
    user: session.user,
    org: membership.organization,
    membership,
  };
}
