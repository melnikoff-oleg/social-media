import type { SessionUser } from "@/lib/auth/session";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TargetScope = { userId: string; viaAdmin: boolean } | { error: "forbidden" };

/**
 * Decides whose data a request operates on. Only admins may act on another account.
 */
export function resolveTargetUserId(
  session: SessionUser,
  requested: string | null
): TargetScope {
  if (requested === null) return { userId: session.id, viaAdmin: false };
  if (!UUID_RE.test(requested)) return { error: "forbidden" };
  if (requested.toLowerCase() === session.id.toLowerCase()) {
    return { userId: session.id, viaAdmin: false };
  }
  if (session.role === "admin") return { userId: requested, viaAdmin: true };
  return { error: "forbidden" };
}

/** True when the error is a Postgres unique violation (also when wrapped by drizzle). */
export function isUniqueViolation(err: unknown): boolean {
  let e: unknown = err;
  for (let i = 0; i < 3 && e && typeof e === "object"; i++) {
    if ((e as { code?: unknown }).code === "23505") return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}
