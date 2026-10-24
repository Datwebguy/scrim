import type { Metadata, Viewport } from "next";
import { DM_Mono, Manrope } from "next/font/google";
import "./globals.css";

const sans = Manrope({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Scrim — Private treasury rails for teams and agents", template: "%s · Scrim" },
  description:
    "Give agents hard spending mandates, approve payments with your NEAR wallet, and settle USDC across chains through NEAR Intents.",
};

export const viewport: Viewport = { themeColor: "#151512" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
