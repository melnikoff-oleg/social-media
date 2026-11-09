import { requireSession } from "@/lib/auth/require-session";
import { withErrors } from "@/lib/api/route-helpers";
import { getUsageToday } from "@/lib/quota/quota";

export const GET = withErrors(async (request) => {
  const result = await requireSession(request);
  if ("response" in result) return result.response;
  const { id, email, name, role, dailyRunsLimit, dailyVideosLimit } = result.user;
  const usageToday = await getUsageToday(id);
  return Response.json({ id, email, name, role, dailyRunsLimit, dailyVideosLimit, usageToday });
});
