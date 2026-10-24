import { NextResponse } from "next/server";
import { NETWORKS, NETWORK_INFO } from "@/protocol/networks";
import { config, privateTransfersEnabled } from "@/server/config";
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
  const ready = database === "ok" && missing.length === 0;
  return NextResponse.json(
    {
      service: "scrim",
      database,
      ready,
      ...(missing.length ? { missing } : {}),
      networks: Object.fromEntries(
        NETWORKS.map((network) => [
          network,
          {
            enabled: config.enabledNetworks.includes(network),
            signIn: true,
            teams: true,
            privateBalance: NETWORK_INFO[network].privateMoney,
            movingMoney: privateTransfersEnabled(network),
            paymentLinks: privateTransfersEnabled(network),
            proofs: NETWORK_INFO[network].privateMoney,
          },
        ]),
      ),
    },
    { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
