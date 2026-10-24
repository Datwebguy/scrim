import type { Metadata } from "next";
import { PublicFrame } from "@/components/PublicFrame";
import { VerifyPage } from "@/components/VerifyPage";

export const metadata: Metadata = { title: "Check a proof" };

export default function Page() {
  return <PublicFrame><VerifyPage /></PublicFrame>;
}
