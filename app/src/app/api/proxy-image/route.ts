import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { isAllowedImageUrl } from "@/lib/api/image-url";
import { withErrors } from "@/lib/api/route-helpers";

const FETCH_TIMEOUT_MS = 15_000;

export const GET = withErrors(async (request) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;

  const url = new URL(request.url).searchParams.get("url");
  if (!url || !isAllowedImageUrl(url)) {
    return NextResponse.json({ error: "URL não permitida" }, { status: 400 });
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
      // A redirect could lead off the allow-list, so it is treated as a failure.
      redirect: "error",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      return new Response(null, { status: response.status === 404 ? 404 : 502 });
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("image/")) {
      return new Response(null, { status: 502 });
    }

    const buffer = await response.arrayBuffer();
    return new Response(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (err) {
    console.error("[proxy-image] upstream fetch failed:", err);
    return new Response(null, { status: 502 });
  }
});
