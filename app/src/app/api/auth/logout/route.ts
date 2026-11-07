import { clearSessionCookie, getSessionToken } from "@/lib/auth/require-session";
import { deleteSession } from "@/lib/auth/session";
import { withErrors } from "@/lib/api/route-helpers";

export const POST = withErrors(async (request) => {
  const token = getSessionToken(request);
  if (token) await deleteSession(token);
  const headers = new Headers();
  headers.append("set-cookie", clearSessionCookie());
  return Response.json({ ok: true }, { status: 200, headers });
});
