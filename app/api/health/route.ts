import { NextResponse } from "next/server";
import { config } from "@/server/config";
import { sql } from "@/server/db";

export const dynamic = "force-dynamic";

// Names of required settings that are missing. Never includes values.
function missingSettings(): string[] {
  const required = ["DATABASE_URL", "SCRIM_SECRET_KEY", "SCRIM_PROOF_KEY"];
  return process.env.NODE_ENV === "production" ? required.filter((name) => !process.env[name]) : [];
}

export async function GET() {
  const missing = missingSettings();
  let database = "ok";
  try {
    await sql`SELECT 1`;
  } catch {
    database = "unavailable";
  }
  return NextResponse.json(
    {
      service: "scrim",
      network: config.network,
      database,
      ready: database === "ok" && missing.length === 0,
      ...(missing.length ? { missing } : {}),
      capabilities: {
        walletSignIn: true,
        treasuries: true,
        agentMandates: true,
        walletSignedApprovals: true,
        privateBalances: config.network === "mainnet",
        privateTransfers: config.privateTransfersEnabled,
        paymentLinks: true,
        proofs: "signed-by-scrim",
        deviceProofs: false,
      },
    },
    { status: database === "ok" && missing.length === 0 ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
