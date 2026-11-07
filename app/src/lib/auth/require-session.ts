import { SESSION_COOKIE } from "./constants";
import { getSessionUser, type SessionUser } from "./session";

export { SESSION_COOKIE };

const SESSION_MAX_AGE_SEC = 7 * 24 * 60 * 60;

function cookieAttrs(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `Path=/; HttpOnly; SameSite=Lax${secure}`;
}

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; ${cookieAttrs()}; Max-Age=${SESSION_MAX_AGE_SEC}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; ${cookieAttrs()}; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

export function getSessionToken(request: Request): string {
  const header = request.headers.get("cookie");
  if (!header) return "";
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === SESSION_COOKIE) return part.slice(idx + 1).trim();
  }
  return "";
}

function json(body: unknown, status: number, setCookie?: string): Response {
  const headers = new Headers({ "content-type": "application/json" });
  if (setCookie) headers.append("set-cookie", setCookie);
  return new Response(JSON.stringify(body), { status, headers });
}

export async function requireSession(
  request: Request
): Promise<{ user: SessionUser } | { response: Response }> {
  const user = await getSessionUser(getSessionToken(request));
  if (!user) {
    return { response: json({ error: "Não autenticado" }, 401, clearSessionCookie()) };
  }
  return { user };
}

export async function requireAdmin(
  request: Request
): Promise<{ user: SessionUser } | { response: Response }> {
  const result = await requireSession(request);
  if ("response" in result) return result;
  if (result.user.role !== "admin") {
    return { response: json({ error: "Acesso restrito ao administrador" }, 403) };
  }
  return result;
}
