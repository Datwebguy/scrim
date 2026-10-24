import { NextResponse } from "next/server";
import { config } from "@/server/config";
import { sql } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET() {
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
      capabilities: {
        walletSignIn: true,
        treasuries: true,
        agentMandates: true,
        walletSignedApprovals: true,
        settlementQuotes: config.oneClickJwt ? "confidential" : "public-indicative",
        settlementExecution: false,
        selectiveDisclosure: false,
        shieldedPool: false,
      },
    },
    { status: database === "ok" ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
