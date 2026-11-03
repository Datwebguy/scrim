// Every short link (scrim.exchange/swap) must point at a screen that really exists in the app.
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import config, { SHORT_LINKS } from "../next.config";

describe("short links", () => {
  it("each opens an existing app screen and does not shadow another page", async () => {
    for (const [source, screen] of SHORT_LINKS) {
      expect(existsSync(`app/app/${screen}/page.tsx`), `${source} -> /app/${screen}`).toBe(true);
      expect(existsSync(`app${source}`), `${source} would shadow a real page`).toBe(false);
    }
    const rules = await config.redirects!();
    for (const [source, screen] of SHORT_LINKS) {
      expect(rules).toContainEqual({ source, destination: `/app/${screen}`, permanent: false });
    }
  });
});
