"use client";

import { useEffect, useState } from "react";
import { usePipeline } from "@/context/pipeline-context";
import { apiFetch } from "@/lib/client/api";

export type Me = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "user";
  dailyRunsLimit: number;
  dailyVideosLimit: number;
  usageToday: { runs: number; videos: number };
};

function isMe(v: unknown): v is Me {
  if (!v || typeof v !== "object") return false;
  const m = v as Partial<Me>;
  return (
    typeof m.email === "string" &&
    (m.role === "admin" || m.role === "user") &&
    typeof m.dailyRunsLimit === "number" &&
    typeof m.dailyVideosLimit === "number" &&
    !!m.usageToday &&
    typeof m.usageToday.runs === "number" &&
    typeof m.usageToday.videos === "number"
  );
}

/** The signed-in user from /api/auth/me; refreshed whenever a pipeline run starts or ends. */
export function useMe(): Me | null {
  const { running } = usePipeline();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((body: unknown) => {
        if (!cancelled && isMe(body)) setMe(body);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [running]);

  return me;
}
