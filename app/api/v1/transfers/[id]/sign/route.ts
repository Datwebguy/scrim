import { readJson, requireSession, route } from "@/server/http";
import { submitSigned } from "@/server/transfers";

export const POST = route<{ id: string }>(async (request, { id }) => {
  const session = await requireSession();
  const body = await readJson(request);
  return { transfer: await submitSigned(session, id, { publicKey: String(body.publicKey ?? ""), signature: String(body.signature ?? "") }) };
});
