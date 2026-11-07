"use client";

import { createContext, useContext, useState, useRef, useCallback } from "react";
import type { PipelineProgress } from "@/lib/types";
import { readErrorCode, redirectToLogin } from "@/lib/client/api";

export function limitedToMessage(n: number): string {
  return `Limite diário de vídeos: analisando ${n} vídeos hoje`;
}

const failedProgress: PipelineProgress = {
  status: "error",
  phase: "done",
  activeTasks: [],
  creatorsCompleted: 0,
  creatorsTotal: 0,
  creatorsScraped: 0,
  videosAnalyzed: 0,
  videosTotal: 0,
  errors: [],
  log: [],
};

interface PipelineContextValue {
  running: boolean;
  progress: PipelineProgress | null;
  runPipeline: (params: { configName: string; maxVideos: number; topK: number; nDays: number }) => void;
}

const PipelineContext = createContext<PipelineContextValue | null>(null);

export function PipelineProvider({ children }: { children: React.ReactNode }) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<PipelineProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const runPipeline = useCallback(async (params: { configName: string; maxVideos: number; topK: number; nDays: number }) => {
    if (running) return;
    setRunning(true);
    setProgress(null);

    abortRef.current = new AbortController();

    try {
      const response = await fetch("/api/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        if (response.status === 401) {
          redirectToLogin();
          return;
        }
        const code = await readErrorCode(response);
        let message = "Não foi possível iniciar a execução";
        if (response.status === 409) message = "Já existe uma execução em andamento";
        else if (response.status === 429 && code === "runs_exhausted")
          message = "Você atingiu o limite de execuções de hoje";
        else if (response.status === 429 && code === "videos_exhausted")
          message = limitedToMessage(0);
        setProgress({ ...failedProgress, errors: [message] });
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              setProgress(data);
            } catch {
              // skip
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setProgress((prev) => ({
        ...(prev || { phase: "done" as const, activeTasks: [], creatorsCompleted: 0, creatorsTotal: 0, creatorsScraped: 0, videosAnalyzed: 0, videosTotal: 0, log: [] }),
        status: "error" as const,
        errors: [err instanceof Error ? err.message : "Unknown error"],
      }));
    } finally {
      setRunning(false);
    }
  }, [running]);

  return (
    <PipelineContext.Provider value={{ running, progress, runPipeline }}>
      {children}
    </PipelineContext.Provider>
  );
}

export function usePipeline() {
  const ctx = useContext(PipelineContext);
  if (!ctx) throw new Error("usePipeline must be used within PipelineProvider");
  return ctx;
}
