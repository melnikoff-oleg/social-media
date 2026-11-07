/**
 * Runs once when the Next.js server starts. Runs left `running` by a crash or restart
 * (older than 15 minutes) are marked `timed_out`, so their users can start again.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { markStaleRuns } = await import("./lib/pipeline/runs");
    const count = await markStaleRuns();
    if (count > 0) console.log(`[pipeline] marked ${count} stale run(s) as timed_out`);
  } catch (err) {
    console.error("[pipeline] could not mark stale runs at startup:", err);
  }
}
