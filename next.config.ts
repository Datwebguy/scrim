import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Scripts and connections are left open for wallets (each wallet talks to its own hosts); what can be
  // locked without breaking them is: no framing, no plugins, no <base> rewriting, forms post only here.
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
];

// Short address -> app screen. Kept as temporary redirects so a short link can change later.
export const SHORT_LINKS: [string, string][] = [
  ["/add", "add"],
  ["/send", "send"],
  ["/swap", "swap"],
  ["/get-paid", "requests"],
  ["/getpaid", "requests"],
  ["/sell", "sell"],
  ["/proofs", "proofs"],
  ["/activity", "activity"],
  ["/ask", "ask"],
  ["/accounts", "accounts"],
];

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["postgres"],
  // The Team screen is now Accounts; old links keep working.
  async redirects() {
    return [
      // Short links to the app's screens: scrim.exchange/swap opens the Swap screen.
      ...SHORT_LINKS.map(([source, screen]) => ({ source, destination: `/app/${screen}`, permanent: false })),
      { source: "/app/team", destination: "/app/accounts", permanent: true },
      { source: "/app/team/:path*", destination: "/app/accounts/:path*", permanent: true },
      // The site moved from scrim-alpha.vercel.app. Pages follow it; API calls stay put, so agents,
      // x402 buyers and wallets set up with the old address keep working.
      {
        source: "/:path((?!api/).*)",
        has: [{ type: "host", value: "scrim-alpha.vercel.app" }],
        destination: "https://scrimfinance.vercel.app/:path",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default config;
