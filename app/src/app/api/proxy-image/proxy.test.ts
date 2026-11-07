import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { resetDb } from "@/test/db";
import { createSession } from "@/lib/auth/session";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { isAllowedImageUrl } from "@/lib/api/image-url";
import { GET } from "./route";

describe("isAllowedImageUrl", () => {
  it("accepts https Instagram/Facebook CDN hosts", () => {
    expect(isAllowedImageUrl("https://scontent.cdninstagram.com/x.jpg")).toBe(true);
    expect(isAllowedImageUrl("https://instagram.fgru1-1.fna.fbcdn.net/v/x.jpg?a=1")).toBe(true);
    expect(isAllowedImageUrl("https://SCONTENT.CDNINSTAGRAM.COM/x.jpg")).toBe(true);
  });

  it("refuses everything else", () => {
    for (const raw of [
      "http://scontent.cdninstagram.com/x.jpg",
      "https://evil.com/x.jpg",
      "https://cdninstagram.com.evil.com/x.jpg",
      "https://evilcdninstagram.com/x.jpg",
      "https://cdninstagram.com/x.jpg",
      "https://fbcdn.net/x.jpg",
      "https://169.254.169.254/latest",
      "https://scontent.cdninstagram.com:8443/x.jpg",
      "https://user:pw@scontent.cdninstagram.com/x.jpg",
      "file:///etc/passwd",
      "not a url",
      "",
    ]) {
      expect(isAllowedImageUrl(raw), raw).toBe(false);
    }
  });
});

describe("GET /api/proxy-image", () => {
  let cookie: string;
  const fetchMock = vi.fn();

  beforeEach(async () => {
    await resetDb();
    const [u] = await db
      .insert(users)
      .values({ email: "a@x.com", name: "a", passwordHash: "x", role: "user" })
      .returning();
    const { token } = await createSession(u.id);
    cookie = `${SESSION_COOKIE}=${token}`;
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const get = (url: string, withSession = true) =>
    GET(
      new Request(`http://localhost/api/proxy-image?url=${encodeURIComponent(url)}`, {
        headers: withSession ? { cookie } : {},
      })
    );

  it("returns 401 without a session and fetches nothing", async () => {
    const res = await get("https://scontent.cdninstagram.com/x.jpg", false);
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a URL outside the allow-list and fetches nothing", async () => {
    for (const url of ["https://evil.com", "https://169.254.169.254/latest", "http://scontent.cdninstagram.com/x.jpg"]) {
      const res = await get(url);
      expect(res.status, url).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("proxies an allowed image without following redirects and with a timeout", async () => {
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } })
    );
    const res = await get("https://scontent.cdninstagram.com/x.jpg");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.redirect).toBe("error");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("refuses to relay a non-image body (502)", async () => {
    fetchMock.mockResolvedValue(
      new Response("<script>x</script>", { headers: { "content-type": "text/html" } })
    );
    const res = await get("https://scontent.cdninstagram.com/x.jpg");
    expect(res.status).toBe(502);
  });

  it("returns 502 with no detail when the upstream fetch throws", async () => {
    fetchMock.mockRejectedValue(new Error("secret internal detail"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await get("https://scontent.cdninstagram.com/x.jpg");
    errSpy.mockRestore();
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain("secret");
  });
});
