import { normalizeNearAccount } from "@/protocol/identifiers";
import { badRequest } from "@/server/errors";
import { accountExists } from "@/server/holdings";
import { requireSession, route } from "@/server/http";

// Does this account exist on the signed-in network? Used before sending, to catch typos.
export const GET = route(async (request) => {
  const session = await requireSession();
  const id = normalizeNearAccount(request.nextUrl.searchParams.get("id") ?? "");
  if (!id) throw badRequest("Enter a valid NEAR account.");
  return { accountId: id, exists: await accountExists(session.network, id) };
});
