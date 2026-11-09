import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { pipelineRuns } from "@/lib/db/schema";
import {
  defaultPipelineDeps,
  runPipeline,
  type PipelineDeps,
  type PipelineEvent,
  type PipelineOwner,
  type PipelineResult,
} from "@/lib/pipeline";
import type { PipelineParams } from "@/lib/types";

/** A run still `running` this long after it started is considered dead at boot. */
export const STALE_RUN_MS = 15 * 60 * 1000;

/**
 * Opens a run for the user, or reports `busy` if one is already running. The check
 * and the insert happen in one transaction under a per-user advisory lock, so two
 * simultaneous starts cannot both succeed. A run of this user left `running` for more
 * than 15 minutes is first marked `timed_out`, so an orphaned row never blocks forever.
 */
export async function startRun(
  userId: string,
  params: PipelineParams,
  now: Date = new Date()
): Promise<{ runId: string } | { error: "busy" }> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${"pipeline_run:" + userId}, 0))`
    );
    await tx
      .update(pipelineRuns)
      .set({ status: "timed_out", finishedAt: now })
      .where(
        and(
          eq(pipelineRuns.userId, userId),
          eq(pipelineRuns.status, "running"),
          lt(pipelineRuns.startedAt, new Date(now.getTime() - STALE_RUN_MS))
        )
      );
    const [running] = await tx
      .select({ id: pipelineRuns.id })
      .from(pipelineRuns)
      .where(and(eq(pipelineRuns.userId, userId), eq(pipelineRuns.status, "running")))
      .limit(1);
    if (running) return { error: "busy" as const };
    const [row] = await tx
      .insert(pipelineRuns)
      .values({ userId, status: "running", params })
      .returning({ id: pipelineRuns.id });
    return { runId: row.id };
  });
}

/** Closes a run. Only a run still `running` is updated (a timed-out run stays so). */
export async function finishRun(
  runId: string,
  status: "done" | "failed",
  log: unknown[]
): Promise<void> {
  await db
    .update(pipelineRuns)
    .set({ status, log, finishedAt: new Date() })
    .where(and(eq(pipelineRuns.id, runId), eq(pipelineRuns.status, "running")));
}

/** Marks as `timed_out` every run left `running` for more than 15 minutes. */
export async function markStaleRuns(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - STALE_RUN_MS);
  const rows = await db
    .update(pipelineRuns)
    .set({ status: "timed_out", finishedAt: now })
    .where(and(eq(pipelineRuns.status, "running"), lt(pipelineRuns.startedAt, cutoff)))
    .returning({ id: pipelineRuns.id });
  return rows.length;
}

/**
 * Runs the pipeline for an opened run and always closes it: `done` when the pipeline
 * completed, `failed` otherwise. Independent of any client connection.
 */
export async function executeRun(
  runId: string,
  params: PipelineParams,
  onEvent: (event: PipelineEvent) => void,
  owner: PipelineOwner,
  deps: PipelineDeps = defaultPipelineDeps
): Promise<PipelineEvent | undefined> {
  let result: PipelineResult | undefined;
  try {
    result = await runPipeline(params, onEvent, owner, deps);
  } finally {
    const status = result?.final.status === "completed" ? "done" : "failed";
    await finishRun(runId, status, result?.serverLog ?? []);
  }
  return result?.final;
}
