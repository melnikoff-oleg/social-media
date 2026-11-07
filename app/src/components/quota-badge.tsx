import type { Me } from "@/lib/client/use-me";

/** Today's runs and videos against the account limits; admins have none. */
export function QuotaBadge({ me }: { me: Me | null }) {
  if (!me) return null;

  if (me.role === "admin") {
    return (
      <div className="text-[11px] text-muted-foreground" data-testid="quota-badge">
        Uso hoje: <span className="text-foreground/70">sem limite</span>
      </div>
    );
  }

  return (
    <div className="space-y-0.5 text-[11px] text-muted-foreground" data-testid="quota-badge">
      <p>
        Execuções hoje:{" "}
        <span className="text-foreground/70">
          {me.usageToday.runs}/{me.dailyRunsLimit}
        </span>
      </p>
      <p>
        Vídeos hoje:{" "}
        <span className="text-foreground/70">
          {me.usageToday.videos}/{me.dailyVideosLimit}
        </span>
      </p>
    </div>
  );
}
