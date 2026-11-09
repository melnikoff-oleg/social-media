import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/require-session";
import type { SessionUser } from "@/lib/auth/session";
import { resolveTargetUserId } from "@/lib/repo/scope";
import { recordAdminAction } from "@/lib/repo/admin-audit";

/** Any 8-4-4-4-12 hex id (what a Postgres uuid column accepts). */
export const idSchema = z.guid();

export function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status });
}

export const invalidId = () => jsonError("id inválido", 400);
export const invalidBody = () => jsonError("Dados inválidos", 400);
export const notFound = () => jsonError("Não encontrado", 404);
export const duplicate = () => jsonError("Já existe um registro com esse nome", 409);

/** Wraps a handler so unexpected errors become a generic 500 (no stack traces leak). */
export function withErrors(
  handler: (request: Request) => Promise<Response>
): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      return await handler(request);
    } catch (err) {
      console.error(`[api] ${request.method} ${new URL(request.url).pathname} failed:`, err);
      return jsonError("Erro interno", 500);
    }
  };
}

export type RouteScope = { user: SessionUser; userId: string; viaAdmin: boolean };

/**
 * Authenticates the request and resolves whose data it acts on (`?userId=`, admin only).
 * 401 without a session, 403 when the target is not allowed, 404 when an admin targets a
 * user that does not exist.
 */
export async function authorize(
  request: Request
): Promise<RouteScope | { response: Response }> {
  const session = await requireSession(request);
  if ("response" in session) return session;
  const requested = new URL(request.url).searchParams.get("userId");
  const target = resolveTargetUserId(session.user, requested);
  if ("error" in target) return { response: jsonError("Acesso negado", 403) };
  if (target.viaAdmin) {
    const [row] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, target.userId))
      .limit(1);
    if (!row) return { response: jsonError("usuário não encontrado", 404) };
  }
  return { user: session.user, userId: target.userId, viaAdmin: target.viaAdmin };
}

/** Parses a JSON body; returns undefined when the body is not valid JSON. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

/** Validates an `id` taken from a body or the query string. */
export function parseId(value: unknown): string | undefined {
  const r = idSchema.safeParse(value);
  return r.success ? r.data : undefined;
}

/** Records an admin action when the request acts on another account. */
export async function auditIfAdmin(
  scope: RouteScope,
  action: "create" | "update" | "delete",
  detail: Record<string, unknown>
): Promise<void> {
  if (!scope.viaAdmin) return;
  await recordAdminAction({
    adminId: scope.user.id,
    targetUserId: scope.userId,
    action,
    detail,
  });
}
