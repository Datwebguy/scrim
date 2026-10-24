import type { Metadata } from "next";
import { PayPage } from "@/components/PayPage";
import { PublicFrame } from "@/components/PublicFrame";
import { ToastProvider } from "@/components/ui";

export const metadata: Metadata = { title: "Pay", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <PublicFrame><ToastProvider><PayPage code={code} /></ToastProvider></PublicFrame>;
}
