// AI apps connected to a person's own account: the whole OAuth flow, personal keys, the MCP tools they get,
// and the walls around them. Real database, real signatures, real NEAR Intents for the private balance.
import { createHash, randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { connectorSessionFromToken, sessionFromToken } from "@/server/auth";
import { approve, createPersonalKey, disconnect, exchangeCode, listConnectors, readAuthorizeRequest, registerClient } from "@/server/connectors";
import { handleMcp } from "@/server/mcp";
import { mainnetImplicitWallet, resetDatabase, signInAs } from "./live";

const verifier = randomBytes(32).toString("base64url");
const challenge = createHash("sha256").update(verifier).digest("base64url");
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";

const rpc = (token: string, method: string, params: Record<string, unknown> = {}) =>
  handleMcp({ jsonrpc: "2.0", id: 1, method, params }, `Bearer ${token}`) as Promise<{ status: number; body: { result?: { tools?: { name: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean; instructions?: string }; error?: { message: string } } }>;

describe("connecting an AI app to your own account", () => {
  beforeAll(resetDatabase);

  it("registers, asks the person, swaps the code for a session and reads the account", async () => {
    const { session, token: browserToken } = await signInAs(mainnetImplicitWallet());
    const app = await registerClient({ client_name: "Claude", redirect_uris: [REDIRECT] });
    const params = { client_id: app.client_id, redirect_uri: REDIRECT, response_type: "code", code_challenge: challenge, code_challenge_method: "S256", state: "xyz" };
    expect((await readAuthorizeRequest(params)).client.name).toBe("Claude");

    const { redirect } = await approve(session, params, "https://scrim.exchange");
    const back = new URL(redirect);
    expect(back.origin + back.pathname).toBe(REDIRECT);
    expect(back.searchParams.get("state")).toBe("xyz");
    const code = back.searchParams.get("code")!;

    await expect(exchangeCode({ grant_type: "authorization_code", code, code_verifier: "x".repeat(43), redirect_uri: REDIRECT, client_id: app.client_id })).rejects.toThrow(/verifier/);
    // A code is good once: the failed try above used it up, so approve again.
    const again = new URL((await approve(session, params, "https://scrim.exchange")).redirect).searchParams.get("code")!;
    const issued = await exchangeCode({ grant_type: "authorization_code", code: again, code_verifier: verifier, redirect_uri: REDIRECT, client_id: app.client_id });
    expect(issued.token_type).toBe("Bearer");
    await expect(exchangeCode({ grant_type: "authorization_code", code: again, code_verifier: verifier })).rejects.toThrow(/already used|expired/);

    // The app's token works only for MCP, never as a browser login, and the browser's only as a browser login.
    expect(await sessionFromToken(issued.access_token)).toBeNull();
    expect(await connectorSessionFromToken(browserToken)).toBeNull();

    const list = await rpc(issued.access_token, "tools/list");
    expect(list.body.result!.tools!.map((t) => t.name)).toEqual(["get_account", "get_balance", "get_activity", "find_coin", "quote_swap"]);
    const account = await rpc(issued.access_token, "tools/call", { name: "get_account", arguments: {} });
    expect(account.body.result!.structuredContent).toMatchObject({ account: session.accountId, network: "mainnet", private_balance: "unlocked" });
    const balance = await rpc(issued.access_token, "tools/call", { name: "get_balance", arguments: {} });
    expect(balance.body.result!.isError).toBe(false);
    expect(balance.body.result!.structuredContent).toMatchObject({ total_usd: 0, holdings: [] });
    const coins = await rpc(issued.access_token, "tools/call", { name: "find_coin", arguments: { query: "USDC" } });
    expect((coins.body.result!.structuredContent!.coins as { symbol: string }[])[0].symbol).toBe("USDC");

    const [connected] = await listConnectors(session);
    expect(connected).toMatchObject({ name: "Claude", kind: "app" });
    await disconnect(session, connected.id);
    expect((await rpc(issued.access_token, "tools/list")).status).toBe(401);
  });

  it("refuses unknown apps, other redirect addresses and plain PKCE", async () => {
    const app = await registerClient({ redirect_uris: [REDIRECT] });
    const base = { client_id: app.client_id, redirect_uri: REDIRECT, response_type: "code", code_challenge: challenge, code_challenge_method: "S256" };
    await expect(readAuthorizeRequest({ ...base, client_id: "scl_nope" })).rejects.toThrow(/isn't registered/);
    await expect(readAuthorizeRequest({ ...base, redirect_uri: "https://evil.example/cb" })).rejects.toThrow(/didn't register/);
    await expect(readAuthorizeRequest({ ...base, code_challenge_method: "plain" })).rejects.toThrow(/S256/);
    await expect(registerClient({ redirect_uris: ["http://evil.example/cb"] })).rejects.toThrow(/https/);
  });

  it("gives agents that can't sign in a personal key that only reads, and another person's app sees nothing", async () => {
    const me = await signInAs(mainnetImplicitWallet());
    const other = await signInAs(mainnetImplicitWallet());
    const { key, name } = await createPersonalKey(me.session, "Hermes Agent");
    expect(key.startsWith("scrim_pk_")).toBe(true);
    expect(name).toBe("Hermes Agent");
    const account = await rpc(key, "tools/call", { name: "get_account", arguments: {} });
    expect(account.body.result!.structuredContent!.account).toBe(me.session.accountId);
    expect(await listConnectors(other.session)).toEqual([]);
    const [mine] = await listConnectors(me.session);
    await expect(disconnect(other.session, mine.id)).rejects.toThrow(/isn't connected/);
    expect((await rpc(key, "tools/call", { name: "send", arguments: {} })).body.error!.message).toMatch(/Unknown tool/);
  });

  it("asks AI apps with no token to sign in", async () => {
    const r = await handleMcp({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, null);
    expect(r.status).toBe(401);
  });
});
