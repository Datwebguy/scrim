// "Ask your money": questions about your own records, answered by a model running inside NEAR AI Cloud's
// secure hardware (Intel TDX + NVIDIA confidential GPUs). Scrim gathers only the signed-in person's own
// records, sends them with the question, and stores neither. Before asking, Scrim fetches the model's
// attestation report with a fresh nonce; after, it checks the answer's signature against the exact bytes
// sent and received, and that the signing key is the one the attestation report names.
import { createHash, randomBytes } from "node:crypto";
import { recoverMessageAddress } from "viem";
import { formatAmount } from "@/protocol/amount";
import { corridorFor } from "@/protocol/corridor";
import type { Session } from "./auth";
import { overview } from "./balances";
import { askAccount, chargeQuestion, type AskAccount } from "./ask-credits";
import { badRequest, HttpError } from "./errors";
import { publicHoldings } from "./holdings";
import { listPayments } from "./payments";
import { listTransfers } from "./transfers";
import { listTreasuries } from "./treasuries";
import { walletActivity } from "./wallet-activity";

const API = "https://cloud-api.near.ai/v1";
// A model NEAR AI runs in its own attested hardware (not routed to a third party).
const MODEL = () => process.env.NEARAI_MODEL || "z-ai/glm-5.3-flash";

export type AskAnswer = {
  account: AskAccount;
  answer: string;
  model: string;
  verification: { signed: boolean; attested: boolean; signingAddress: string | null; chatId: string; detail: string };
};

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const day = (d: Date | string) => new Date(d).toISOString().slice(0, 10);

// The person's own records, compact. Nothing else is sent.
async function records(session: Session) {
  const unit = corridorFor(session.network);
  const [holdings, transfers, teams, wallet] = await Promise.all([
    session.network === "mainnet"
      ? overview(session).then((o) => o.holdings.map((h) => ({ coin: h.symbol, network: h.chainName, amount: h.display, usd: h.usd })))
      : publicHoldings("testnet", session.accountId).then((hs) => hs.map((h) => ({ coin: h.symbol, amount: h.display }))).catch(() => []),
    listTransfers(session).catch(() => []),
    listTreasuries(session).catch(() => []),
    walletActivity(session.network, session.accountId, 30).catch(() => []),
  ]);
  const teamPayments = (
    await Promise.all(
      teams.map(async (t) =>
        (await listPayments(session, t.id).catch(() => [])).slice(0, 60).map((p) => ({
          team: t.name, date: day(p.createdAt), amount: `${formatAmount(BigInt(p.amount), unit.decimals, 2)} ${unit.symbol}`,
          to: p.recipient, memo: p.memo, status: p.status, requestedBy: p.createdBy.name ?? p.createdBy.type,
        })),
      ),
    )
  ).flat();
  return {
    network: session.network,
    today: day(new Date()),
    privateBalance: holdings,
    privateActivity: transfers.filter((t) => t.status !== "cancelled").map((t) => ({
      date: day(t.createdAt), what: t.kind, status: t.status,
      sent: `${formatAmount(BigInt(t.amountIn), t.fromAsset.decimals, 2)} ${t.fromAsset.symbol} (${t.fromAsset.chainName})`,
      received: `${formatAmount(BigInt(t.amountOut), t.toAsset.decimals, 2)} ${t.toAsset.symbol} (${t.toAsset.chainName})`,
      to: t.recipient, note: t.note || undefined,
    })),
    teamPayments,
    walletTransactions: wallet.map((w) => ({
      date: day(w.at), what: w.label, with: w.counterparty, amount: w.amount && w.token ? `${formatAmount(BigInt(w.amount), w.token.decimals, 2)} ${w.token.symbol}` : undefined, ok: w.ok,
    })),
  };
}

async function nearai(path: string, init: { method?: string; body?: string; headers?: Record<string, string> } = {}) {
  const key = process.env.NEARAI_API_KEY;
  if (!key) throw new HttpError(503, "not_enabled", "Ask your money isn't switched on for this site yet.");
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: { authorization: `Bearer ${key}`, ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers },
    body: init.body,
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  if (!res.ok) {
    const message = (() => { try { return (JSON.parse(text) as { error?: { message?: string } }).error?.message; } catch { return null; } })();
    throw new HttpError(res.status === 429 ? 429 : 502, "upstream", message ? `NEAR AI: ${message}` : `NEAR AI answered ${res.status}.`);
  }
  return text;
}

type Report = { model_attestations?: { signing_address?: string; request_nonce?: string }[] };

export async function ask(session: Session, question: string): Promise<AskAnswer> {
  const q = question.trim();
  if (q.length < 3 || q.length > 500) throw badRequest("Ask a question of 3 to 500 characters.");
  const model = MODEL();
  if (!process.env.NEARAI_API_KEY) throw new HttpError(503, "not_enabled", "Ask your money isn't switched on for this site yet.");

  // Paid for first (the free question, or from the person's own credits), and given back if it fails.
  const refund = await chargeQuestion(session);
  try {
    return await answer(session, q, model);
  } catch (error) {
    await refund().catch((e) => console.error("[ask] refund", e));
    throw error;
  }
}

async function answer(session: Session, q: string, model: string): Promise<AskAnswer> {

  // 1. Which key does the model's secure hardware sign with? Asked with a fresh nonce, before sending anything.
  const nonce = randomBytes(32).toString("hex");
  const report = JSON.parse(await nearai(`/attestation/report?${new URLSearchParams({ signing_algo: "ecdsa", nonce, model, provider: "near" })}`, { headers: { "x-no-aliasing": "true" } })) as Report;
  const attestedKeys = new Set((report.model_attestations ?? []).filter((a) => a.request_nonce === nonce && a.signing_address).map((a) => a.signing_address!.toLowerCase()));

  // 2. The question, with the person's own records.
  const body = JSON.stringify({
    model,
    temperature: 0.2,
    max_tokens: 700,
    messages: [
      { role: "system", content: "You answer questions about one person's money in Scrim, using only the records given. Plain, short sentences. Use the amounts and dates exactly as written; add them up when asked. If the records don't contain the answer, say so. Never invent payments, people or numbers. Statuses: settled means paid, policy_rejected means stopped by the agent's limits, awaiting_approval means waiting for approval." },
      { role: "user", content: `My records (JSON):\n${JSON.stringify(await records(session))}\n\nQuestion: ${q}` },
    ],
  });
  const raw = await nearai("/chat/completions", { body, headers: { "x-no-aliasing": "true" } });
  const completion = JSON.parse(raw) as { id: string; choices?: { message?: { content?: string } }[] };
  const answer = completion.choices?.[0]?.message?.content?.trim() || "No answer came back. Try asking again.";

  // 3. Check the answer's signature over these exact bytes, by the attested key.
  let verification: AskAnswer["verification"] = { signed: false, attested: false, signingAddress: null, chatId: completion.id, detail: "The signature wasn't available yet." };
  for (let i = 0; i < 3 && !verification.signed; i++) {
    try {
      const sig = JSON.parse(await nearai(`/signature/${encodeURIComponent(completion.id)}?signing_algo=ecdsa`)) as { text: string; signature: `0x${string}`; signing_address: string };
      const parts = sig.text.split(":");
      const [reqHash, resHash] = parts.slice(-2);
      const recovered = await recoverMessageAddress({ message: sig.text, signature: sig.signature });
      const bytesMatch = reqHash === sha256(body) && resHash === sha256(raw);
      const signed = bytesMatch && recovered.toLowerCase() === sig.signing_address.toLowerCase();
      const attested = signed && attestedKeys.has(recovered.toLowerCase());
      verification = {
        signed, attested, signingAddress: recovered, chatId: completion.id,
        detail: attested
          ? "Signed inside NEAR AI's secure hardware, by the key its attestation report names, over exactly this question and answer."
          : signed ? "Signed over exactly this question and answer, but the key wasn't in the attestation report Scrim fetched." : bytesMatch ? "The signature didn't match its key." : "The signature covers different bytes than this answer.",
      };
    } catch {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  return { account: await askAccount(session), answer, model, verification };
}
