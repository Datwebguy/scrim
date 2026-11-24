import Link from "next/link";
import { notFound } from "next/navigation";
import { SendSwap } from "@/components/SendSwap";
import { getAiRequest } from "@/server/ai-requests";
import { HttpError } from "@/server/errors";
import { currentSession } from "@/server/http";
import { getT } from "@/i18n/server";

export const metadata = { title: "Review payment", robots: { index: false } };
export const dynamic = "force-dynamic";

const ENDED: Record<string, string> = {
  done: "This payment went through.",
  in_progress: "This payment is on its way.",
  failed: "This payment didn't go through. Nothing was taken.",
  declined: "You declined this payment.",
  expired: "This request expired. Ask your AI app to prepare it again.",
};

// A payment an AI app prepared: Scrim's own Send or Swap screen, filled in from the saved request.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const session = await currentSession();
  if (!session) return null; // signed out: the layout shows sign in
  const request = await getAiRequest(session, (await params).id).catch((e) => { if (e instanceof HttpError && e.status === 404) notFound(); throw e; });
  if (request.state !== "waiting_for_you") {
    const t = await getT();
    return <div className="narrow"><div className="notice" style={{ marginTop: 16 }}>{t(ENDED[request.state])} <Link href="/app/activity">{t("Activity")}</Link></div></div>;
  }
  const d = request.details;
  return <SendSwap initial={d.mode} aiRequest={{ id: request.id, app: request.app, details: { mode: d.mode, from: d.from, to: d.to, amount: d.amount, recipient: d.recipient, note: d.note } }} />;
}
