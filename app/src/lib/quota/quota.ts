import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import { todayInSaoPaulo } from "./day";

// Limits are read from the users table inside each statement (not from the
// SessionUser snapshot), so an admin's quota change applies to the next reservation.
// Admin usage is still recorded (for the admin panel) but never limited.

export type RunReservation = { ok: true } | { ok: false; reason: "runs_exhausted" };

/**
 * Atomically reserves one pipeline run for today. A single upsert statement both
 * creates the day's row and increments it only while runs < daily_runs_limit, so
 * concurrent calls at the limit cannot both succeed.
 */
export async function reserveRun(user: SessionUser, now: Date = new Date()): Promise<RunReservation> {
  const day = todayInSaoPaulo(now);

  if (user.role === "admin") {
    await db.execute(sql`
      insert into usage_daily (user_id, day, runs, videos)
      values (${user.id}, ${day}::date, 1, 0)
      on conflict (user_id, day) do update set runs = usage_daily.runs + 1
    `);
    return { ok: true };
  }

  const result = await db.execute<{ runs: number }>(sql`
    insert into usage_daily (user_id, day, runs, videos)
    select u.id, ${day}::date, 1, 0
    from users u
    where u.id = ${user.id} and u.daily_runs_limit > 0
    on conflict (user_id, day) do update
      set runs = usage_daily.runs + 1
      where usage_daily.runs < (
        select u2.daily_runs_limit from users u2 where u2.id = excluded.user_id
      )
    returning runs
  `);
  return result.rows.length > 0 ? { ok: true } : { ok: false, reason: "runs_exhausted" };
}

/**
 * Reserves up to `requested` video analyses for today and returns how many were
 * granted (possibly 0) and how many remain afterwards. Concurrency-safe: the day's
 * usage row is created if missing and then locked with SELECT ... FOR UPDATE.
 * For admins, `granted` is always `requested` and `remaining` is Infinity.
 */
export async function reserveVideos(
  user: SessionUser,
  requested: number,
  now: Date = new Date()
): Promise<{ granted: number; remaining: number }> {
  const day = todayInSaoPaulo(now);
  const wanted = Number.isFinite(requested) ? Math.max(0, Math.floor(requested)) : 0;

  if (user.role === "admin") {
    await db.execute(sql`
      insert into usage_daily (user_id, day, runs, videos)
      values (${user.id}, ${day}::date, 0, ${wanted})
      on conflict (user_id, day) do update set videos = usage_daily.videos + ${wanted}
    `);
    return { granted: wanted, remaining: Number.POSITIVE_INFINITY };
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`
      insert into usage_daily (user_id, day, runs, videos)
      values (${user.id}, ${day}::date, 0, 0)
      on conflict (user_id, day) do nothing
    `);
    const locked = await tx.execute<{ videos: number; limit: number }>(sql`
      select ud.videos, u.daily_videos_limit as "limit"
      from usage_daily ud
      join users u on u.id = ud.user_id
      where ud.user_id = ${user.id} and ud.day = ${day}::date
      for update of ud
    `);
    const row = locked.rows[0];
    if (!row) throw new Error(`usage_daily row missing for user ${user.id} on ${day}`);

    const available = Math.max(0, Number(row.limit) - Number(row.videos));
    const granted = Math.min(wanted, available);
    if (granted > 0) {
      await tx.execute(sql`
        update usage_daily set videos = videos + ${granted}
        where user_id = ${user.id} and day = ${day}::date
      `);
    }
    return { granted, remaining: available - granted };
  });
}

/** Today's (São Paulo) usage for a user; zeros when nothing was recorded. */
export async function getUsageToday(
  userId: string,
  now: Date = new Date()
): Promise<{ runs: number; videos: number }> {
  const day = todayInSaoPaulo(now);
  const result = await db.execute<{ runs: number; videos: number }>(sql`
    select runs, videos from usage_daily where user_id = ${userId} and day = ${day}::date
  `);
  const row = result.rows[0];
  return row ? { runs: Number(row.runs), videos: Number(row.videos) } : { runs: 0, videos: 0 };
}
