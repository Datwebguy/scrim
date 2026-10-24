import { readJson, requireSession, route } from "@/server/http";
import { createTreasury, listTreasuries } from "@/server/treasuries";

export const GET = route(async () => ({ treasuries: await listTreasuries(await requireSession()) }));

export const POST = route(async (request) => {
  const session = await requireSession();
  const body = await readJson<{ name?: string; kind?: string; signers?: unknown; threshold?: unknown }>(request);
  const treasury = await createTreasury(session, {
    name: String(body.name ?? ""),
    kind: body.kind === "team" ? "team" : "individual",
    signers: Array.isArray(body.signers) ? body.signers.map(String) : [],
    threshold: body.threshold === undefined ? undefined : Number(body.threshold),
  });
  return { treasury };
});
