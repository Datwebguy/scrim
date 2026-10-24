import { createOwnershipChallenge } from "@/server/auth";
import { sql } from "@/server/db";
import { requireSession, route } from "@/server/http";

export const POST = route(async () => {
  const session = await requireSession();
  return createOwnershipChallenge(sql, session.accountId, session.network, "private_access", session.id);
});
