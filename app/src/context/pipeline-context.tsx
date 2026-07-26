"use client";

import { createContext, useContext, useState, useRef, useCallback } from "react";
import { useAuth } from "@/context/auth-context";
import { toast } from "sonner";
import { classifyError } from "@/lib/error-utils";
import type { PipelineProgress, ScrapedVideo, PipelineParams } from "@/lib/types";

interface PipelineContextValue {
  running: boolean;
  progress: PipelineProgress | null;
  candidates: ScrapedVideo[] | null;
  runPipeline: (params: PipelineParams) => void;
  resetPipeline: () => void;
}

const PipelineContext = createContext<PipelineContextValue | null>(null);

export function PipelineProvider({ children }: { children: React.ReactNode }) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<PipelineProgress | null>(null);
  const [candidates, setCandidates] = useState<ScrapedVideo[] | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { token, setShowCreditModal } = useAuth();

  const resetPipeline = useCallback(() => {
    setRunning(false);
    setProgress(null);
    setCandidates(null);
  }, []);

  const runPipeline = useCallback(async (params: PipelineParams) => {
    if (running) return;
    setRunning(true);
    
    // Set the initial progress state to reflect the loading screen
    if (!params.selectedVideos) {
      setProgress({
        status: "running",
        phase: "scraping",
        activeTasks: [{ id: "fetch", creator: params.usernames?.join(", ") || "", step: "Loading unanalyzed reels from database..." }],
        creatorsCompleted: 0,
        creatorsTotal: params.usernames?.length || 1,
        creatorsScraped: 0,
        videosAnalyzed: 0,
        videosTotal: 0,
        errors: [],
        log: [`Fetching unanalyzed reels for ${params.usernames?.length || 0} creators from database...`]
      });
      setCandidates(null);
    } else {
      setProgress({
        status: "running",
        phase: "analyzing",
        activeTasks: [{ id: "analyze", creator: params.selectedVideos.map(v => v.username).join(", "), step: "Running AI analysis..." }],
        creatorsCompleted: 0,
        creatorsTotal: 0,
        creatorsScraped: 0,
        videosAnalyzed: 0,
        videosTotal: params.selectedVideos?.length || 1,
        errors: [],
        log: [`Starting AI analysis for ${params.selectedVideos?.length || 0} videos... (This may take a minute without streaming)`]
      });
    }

    abortRef.current = new AbortController();

    try {
      console.log("[Pipeline] Fetching /api/pipeline with params:", params);
      const response = await fetch('/api/pipeline', {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        body: JSON.stringify(params),
        signal: abortRef.current.signal,
      });

      console.log("[Pipeline] API Response Status:", response.status);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || `API Request Failed: ${response.status}`);
      }
      const data = await response.json();
      console.log("[Pipeline] API Data Received:", data);

      if (data.phase === "fetching") {
        setCandidates(data.candidates);
        setProgress({ 
          status: "completed", 
          phase: "picking", 
          candidates: data.candidates, 
          log: data.log || ["Candidate fetching complete."], 
          activeTasks: [], 
          creatorsCompleted: params.usernames?.length || 0, 
          creatorsTotal: params.usernames?.length || 1, 
          creatorsScraped: params.usernames?.length || 0, 
          videosAnalyzed: 0, 
          videosTotal: 0,
          errors: []
        });
      } else if (data.phase === "accepted") {
        // Async bulk analysis accepted — backend is processing in background
        // The videos page polling mechanism will handle tracking progress
        setProgress({ 
          status: "completed", 
          phase: "done", 
          videosAnalyzed: 0, 
          log: [`${data.count} videos queued for analysis. Processing in background...`], 
          activeTasks: [], 
          creatorsCompleted: 0, 
          creatorsTotal: 0, 
          creatorsScraped: 0, 
          videosTotal: data.count || params.selectedVideos?.length || 0,
          errors: []
        });
      } else if (data.phase === "done") {
        setProgress({ 
          status: "completed", 
          phase: "done", 
          videosAnalyzed: data.videosAnalyzed, 
          log: data.log || ["Full pipeline execution complete!"], 
          activeTasks: [], 
          creatorsCompleted: 0, 
          creatorsTotal: 0, 
          creatorsScraped: 0, 
          videosTotal: params.selectedVideos?.length || 0,
          errors: []
        });
      }
    } catch (err: any) {
      if ((err as Error).name === "AbortError") return;
      
      const msg = err instanceof Error ? err.message : "Unknown error";
      const classified = classifyError({ message: msg });

      if (classified.action === "credits") {
        setShowCreditModal(true);
      }
      toast.error(`${classified.icon} ${classified.title}`, {
        description: classified.description,
        duration: classified.duration,
      });

      setProgress((prev) => ({
        ...(prev || { phase: "done" as const, activeTasks: [], creatorsCompleted: 0, creatorsTotal: 0, creatorsScraped: 0, videosAnalyzed: 0, videosTotal: 0, log: [] }),
        status: "error" as const,
        errors: [`${classified.icon} ${classified.title}: ${classified.description}`],
      }));  
    } finally {
      setRunning(false);
    }
  }, [running]);

  return (
    <PipelineContext.Provider value={{ running, progress, candidates, runPipeline, resetPipeline }}>
      {children}
    </PipelineContext.Provider>
  );
}

export function usePipeline() {
  const ctx = useContext(PipelineContext);
  if (!ctx) throw new Error("usePipeline must be used within PipelineProvider");
  return ctx;
}
