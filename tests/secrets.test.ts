// Changing the key that seals stored secrets: old values stay readable during the changeover,
// the re-seal script moves every one to the new key, and then the old key can be retired.
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rotateSecrets } from "../scripts/rotate-secrets";
import { agentFromApiKey, createAgent } from "@/server/agents";
import type { Session } from "@/server/auth";
import { sql } from "@/server/db";
import { needsResealing, open, seal } from "@/server/secrets";
import { createTreasury } from "@/server/treasuries";
import { mainnetImplicitWallet, resetDatabase, signInAs } from "./live";

const oldKey = randomBytes(32).toString("base64");
const newKey = randomBytes(32).toString("base64");
const saved = { key: process.env.SCRIM_SECRET_KEY, previous: process.env.SCRIM_SECRET_KEY_PREVIOUS };

function useKeys(current: string | undefined, previous?: string) {
  if (current) process.env.SCRIM_SECRET_KEY = current; else delete process.env.SCRIM_SECRET_KEY;
  if (previous) process.env.SCRIM_SECRET_KEY_PREVIOUS = previous; else delete process.env.SCRIM_SECRET_KEY_PREVIOUS;
}

afterAll(async () => {
  useKeys(saved.key, saved.previous);
  await sql.end();
});

describe("sealed values and key changes", () => {
  it("opens values sealed with an earlier key while it is still listed, and only then", () => {
    useKeys(oldKey);
    const sealed = seal({ secret: "one" }, "row:1");
    expect(needsResealing(sealed)).toBe(false);

    useKeys(newKey, oldKey);
    expect(open(sealed, "row:1")).toEqual({ secret: "one" });
    expect(needsResealing(sealed)).toBe(true);

    useKeys(newKey);
    expect(() => open(sealed, "row:1")).toThrow(/no longer configured/);
  });

  it("still opens values written before key ids existed", () => {
    useKeys(oldKey);
    const sealed = seal("x", "row:2");
    const [, , iv, body, tag] = sealed.split(".");
    const legacy = `v1.${iv}.${body}.${tag}`;
    useKeys(newKey, oldKey);
    expect(open(legacy, "row:2")).toBe("x");
    expect(needsResealing(legacy)).toBe(true);
    useKeys(newKey);
    expect(() => open(legacy, "row:2")).toThrow(/could not be opened/);
  });

  it("keeps a value tied to its row, whichever key sealed it", () => {
    useKeys(newKey);
    expect(() => open(seal("x", "row:3"), "row:4")).toThrow();
  });
});

describe("the re-seal script", () => {
  let session: Session;
  let agentId: string;
  beforeAll(async () => {
    await resetDatabase();
    useKeys(oldKey);
    session = (await signInAs(mainnetImplicitWallet())).session;
    const team = await createTreasury(session, { name: "Rotation", kind: "individual", signers: [], threshold: 1 });
    const { apiKey } = await createAgent(session, team.id, { name: "Keyed", perActionCap: "5", rollingCap: "20", windowHours: 24, counterparties: [{ address: "https://api.example.com", label: "Example" }] });
    agentId = (await agentFromApiKey(`Bearer ${apiKey}`)).id;
    await sql`UPDATE agents SET webhook_secret = ${seal("whsec_test", `agent-webhook:${agentId}`)} WHERE id = ${agentId}`;
  }, 60_000);

  it("moves every stored secret to the new key, changes nothing on a dry run, and is safe to repeat", async () => {
    useKeys(newKey, oldKey);
    const quiet = () => undefined;
    const dry = await rotateSecrets({ dryRun: true, log: quiet });
    expect(dry.changed).toBe(0);
    const [before] = await sql<{ webhook_secret: string }[]>`SELECT webhook_secret FROM agents WHERE id = ${agentId}`;
    expect(needsResealing(before.webhook_secret)).toBe(true);

    const done = await rotateSecrets({ log: quiet });
    expect(done.changed).toBeGreaterThanOrEqual(2); // the webhook secret and the private balance session
    const [after] = await sql<{ webhook_secret: string }[]>`SELECT webhook_secret FROM agents WHERE id = ${agentId}`;
    expect(needsResealing(after.webhook_secret)).toBe(false);
    expect((await rotateSecrets({ log: quiet })).changed).toBe(0);

    // With the old key retired, everything still opens.
    useKeys(newKey);
    expect(open(after.webhook_secret, `agent-webhook:${agentId}`)).toBe("whsec_test");
    const [access] = await sql<{ tokens_sealed: string }[]>`SELECT tokens_sealed FROM private_access WHERE session_id = ${session.id}`;
    expect(needsResealing(access.tokens_sealed)).toBe(false);
  });
});
