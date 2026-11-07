import { db } from "@/lib/db";
import { adminAudit } from "@/lib/db/schema";

export async function recordAdminAction(entry: {
  adminId: string;
  targetUserId: string;
  action: string;
  detail?: unknown;
}): Promise<void> {
  await db.insert(adminAudit).values({
    adminId: entry.adminId,
    targetUserId: entry.targetUserId,
    action: entry.action,
    detail: entry.detail ?? null,
  });
}
