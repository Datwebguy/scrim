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

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["postgres"],
  // The Team screen is now Accounts; old links keep working.
  async redirects() {
    return [
      { source: "/app/team", destination: "/app/accounts", permanent: true },
      { source: "/app/team/:path*", destination: "/app/accounts/:path*", permanent: true },
    ];
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default config;
