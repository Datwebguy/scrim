import type { Metadata } from "next";
import { PublicFrame } from "@/components/PublicFrame";
import { RoadmapPage } from "@/components/RoadmapPage";

export const metadata: Metadata = { title: "Roadmap", description: "What Scrim does today, what is being built next, and what comes after." };

export default function Page() {
  return <PublicFrame><RoadmapPage /></PublicFrame>;
}
