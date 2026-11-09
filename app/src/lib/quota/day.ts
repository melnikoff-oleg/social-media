export const QUOTA_TIME_ZONE = "America/Sao_Paulo";

const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: QUOTA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The calendar day in São Paulo for `now`, as "YYYY-MM-DD". Quotas reset at that midnight. */
export function todayInSaoPaulo(now: Date = new Date()): string {
  const parts = formatter.formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
