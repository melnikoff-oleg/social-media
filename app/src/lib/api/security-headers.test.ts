import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config";

describe("security headers (next.config.ts)", () => {
  it("applies nosniff, referrer policy and frame denial to every route", async () => {
    const rules = await nextConfig.headers!();
    const all = rules.find((r) => r.source === "/:path*");
    expect(all).toBeDefined();
    const map = Object.fromEntries(all!.headers.map((h) => [h.key, h.value]));
    expect(map).toMatchObject({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY",
    });
  });
});
