import { normalizeNearAccount } from "@/protocol/identifiers";
import { badRequest } from "@/server/errors";
import { accountExists } from "@/server/holdings";
import { requireSession, route } from "@/server/http";
import { viewCall } from "@/server/near-rpc";

// Does this account exist on the signed-in network? Used before sending, to catch typos.
// With ?token=<contract>, also says whether the account is registered with that token: a NEAR token can only
// be delivered to an account registered with it, so the wallet registers it first when it isn't.
export const GET = route(async (request) => {
  const session = await requireSession();
  const id = normalizeNearAccount(request.nextUrl.searchParams.get("id") ?? "");
  if (!id) throw badRequest("Enter a valid NEAR account.");
  const tokenParam = request.nextUrl.searchParams.get("token");
  const token = tokenParam ? normalizeNearAccount(tokenParam) : null;
  if (tokenParam && !token) throw badRequest("Unknown token.");
  const exists = await accountExists(session.network, id);
  if (!token) return { accountId: id, exists };
  const registered = await viewCall<unknown>(session.network, token, "storage_balance_of", { account_id: id }).then((r) => r !== null, () => false);
  return { accountId: id, exists, registered };
});
