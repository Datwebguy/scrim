import type { Metadata, Viewport } from "next";
import { DM_Mono, Manrope } from "next/font/google";
import "./globals.css";

const sans = Manrope({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Scrim — Money on NEAR, private when you want it", template: "%s · Scrim" },
  description:
    "Hold, send, swap and get paid on NEAR, in public or in private, your choice. Set limits, share approvals, and let agents pay within your rules.",
};

export const viewport: Viewport = { themeColor: "#151512" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
