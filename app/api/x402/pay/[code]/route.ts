import { NextResponse, type NextRequest } from "next/server";
import { HttpError } from "@/server/errors";
import { rateLimit } from "@/server/rate-limit";
import { encodeHeader, handleX402 } from "@/server/x402";

// x402 address of a Scrim payment link. An agent pays it with the `exact` scheme and the
// `near-intents` upfront method; the money arrives in the link owner's private balance.
async function handle(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const headers: Record<string, string> = { "cache-control": "no-store" };
  try {
    await rateLimit(request.headers, request.nextUrl.pathname);
    const { code } = await params;
    const resource = `${request.nextUrl.origin}/api/x402/pay/${code}`;
    const result = await handleX402(code, resource, request.headers.get("payment-signature") ?? request.headers.get("x-payment"));
    if (result.kind === "required") {
      return NextResponse.json(result.body, { status: 402, headers: { ...headers, "payment-required": encodeHeader(result.body) } });
    }
    if (result.kind === "paid") {
      return NextResponse.json(result.body, { status: 200, headers: { ...headers, "payment-response": encodeHeader(result.receipt) } });
    }
    const extra: Record<string, string> = result.receipt ? { "payment-response": encodeHeader(result.receipt) } : {};
    if ("accepts" in result.body) extra["payment-required"] = encodeHeader(result.body);
    return NextResponse.json(result.body, { status: result.status, headers: { ...headers, ...extra } });
  } catch (error) {
    if (error instanceof HttpError) return NextResponse.json({ error: error.code, message: error.message }, { status: error.status, headers });
    console.error("[x402]", error);
    return NextResponse.json({ error: "internal", message: "Something went wrong. Try again." }, { status: 500, headers });
  }
}

export const GET = handle;
export const POST = handle;
