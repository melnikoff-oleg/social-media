import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { normalizeEmail } from "@/lib/auth/normalize";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { rateLimit } from "@/lib/auth/rate-limit";
import { sessionCookie } from "@/lib/auth/require-session";
import { createSession } from "@/lib/auth/session";
import { withErrors } from "@/lib/api/route-helpers";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const INVALID = "E-mail ou senha inválidos";

// Verified against when the account does not exist, so response time does not reveal it.
let dummyHash: Promise<string> | undefined;

function getDummyHash(): Promise<string> {
  if (!dummyHash) {
    dummyHash = hashPassword("dummy-password-for-timing").catch((err) => {
      dummyHash = undefined; // do not cache a failure
      throw err;
    });
  }
  return dummyHash;
}

function fail(): Response {
  return Response.json({ error: INVALID }, { status: 401 });
}

function clientIp(request: Request): string {
  // The reverse proxy appends the real client address as the LAST value; earlier ones are client-controlled.
  const parts = request.headers.get("x-forwarded-for")?.split(",") ?? [];
  const last = parts[parts.length - 1]?.trim();
  return last || "127.0.0.1";
}

export const POST = withErrors(async (request) => {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json\s*(;|$)/i.test(contentType.trim())) {
    return Response.json({ error: "Tipo de conteúdo inválido" }, { status: 415 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail();
  }
  const { email, password } = (body ?? {}) as { email?: unknown; password?: unknown };
  if (typeof email !== "string" || typeof password !== "string") return fail();

  const normalized = normalizeEmail(email);
  const byEmail = rateLimit(`email:${normalized}`, MAX_ATTEMPTS, WINDOW_MS);
  const byIp = rateLimit(`ip:${clientIp(request)}`, MAX_ATTEMPTS, WINDOW_MS);
  if (!byEmail.allowed || !byIp.allowed) {
    const retryAfter = Math.max(byEmail.retryAfterSec, byIp.retryAfterSec);
    return Response.json(
      { error: "Muitas tentativas. Tente novamente mais tarde." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  const [user] = await db.select().from(users).where(eq(users.email, normalized)).limit(1);
  if (!user) {
    await verifyPassword(await getDummyHash(), password);
    return fail();
  }
  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok || !user.active) return fail();

  const { token } = await createSession(user.id);
  const headers = new Headers();
  headers.append("set-cookie", sessionCookie(token));
  return Response.json(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    { status: 200, headers }
  );
});
