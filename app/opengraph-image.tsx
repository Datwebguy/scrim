import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// The card that shows when a Scrim link is shared on X, Telegram, Discord, Slack and the rest.
export const alt = "Scrim: the private payments layer for every chain and every agent";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const mark = await readFile(join(process.cwd(), "public", "scrim-mark.png"));
  const markSrc = `data:image/png;base64,${mark.toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#151512", color: "#f5f4ef", padding: "72px 80px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={markSrc} width={72} height={72} alt="" />
          <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1 }}>Scrim</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2, display: "flex", flexWrap: "wrap" }}>
            <span style={{ color: "#ff5b2d", marginRight: 18 }}>The private payments layer</span>
            <span>for every chain and every agent.</span>
          </div>
          <div style={{ fontSize: 32, color: "#b9b8ae", display: "flex" }}>Hold, swap, pay and get paid. Agents spend within your limits.</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 28, color: "#8d8c82" }}>
          <div style={{ display: "flex" }}>scrim.exchange</div>
          <div style={{ display: "flex" }}>Built on NEAR</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
