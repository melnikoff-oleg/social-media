"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Video,
  Scissors,
  ArrowLeft,
  Wand2,
  Search,
  Loader2,
  Heart,
  MessageCircle,
  Play,
  ArrowRight,
  Save,
  Instagram,
  Trash2,
  History,
  CheckCircle2,
  AlertCircle,
  RotateCw
} from "lucide-react";
import { MarkdownContent } from "@/components/markdown-content";
import Image from "next/image";
import { toast } from "sonner";
import { classifyError } from "@/lib/error-utils";
import type { ReelAnalysisResult } from "@/lib/types";

function formatViews(n: number): string {
  if (n === undefined || n === null) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toString();
}

type TabType = "analysis" | "concepts" | "director" | "editor" | "recreate";

const TYPEWRITER_WORDS = [
  "viral reel.",
  "Reel hook.",
  "Reel edit.",
  "Reel script.",
  "Shoot style"
];

function TypewriterEffect({ words }: { words: string[] }) {
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [currentText, setCurrentText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const typeSpeed = isDeleting ? 50 : 100;
    const currentWord = words[currentWordIndex];

    if (!isDeleting && currentText === currentWord) {
      const timeout = setTimeout(() => setIsDeleting(true), 2000);
      return () => clearTimeout(timeout);
    }

    if (isDeleting && currentText === "") {
      setIsDeleting(false);
      setCurrentWordIndex((prev) => (prev + 1) % words.length);
      return;
    }

    const timeout = setTimeout(() => {
      setCurrentText((prev) =>
        isDeleting ? prev.slice(0, -1) : currentWord.slice(0, prev.length + 1)
      );
    }, typeSpeed);

    return () => clearTimeout(timeout);
  }, [currentText, isDeleting, currentWordIndex, words]);

  return (
    <span>
      {currentText}
      <span className="animate-pulse font-light ml-0.5 opacity-70">|</span>
    </span>
  );
}

export default function AnalyzePage() {
  const { token, setShowCreditModal } = useAuth();

  const [url, setUrl] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<string>("PENDING");
  const [result, setResult] = useState<ReelAnalysisResult | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("analysis");
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchHistory = useCallback(async () => {
    if (!token) return;
    setLoadingHistory(true);
    try {
      const res = await fetch("/api/instagram/reel-analyzer/history", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setHistory(data);
      }
    } catch (err) {
      console.error("Failed to fetch history:", err);
    } finally {
      setLoadingHistory(false);
    }
  }, [token]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleHistoryClick = (item: any) => {
    if (item.status !== "COMPLETED") return;
    setResult(mapPrismaToResult(item));
    setActiveTab("analysis");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDeleteHistory = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/instagram/reel-analyzer/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setHistory((prev) => prev.filter((h) => h.id !== id));
        toast.success("Analysis deleted");
      }
    } catch (err) {
      toast.error("Failed to delete analysis");
    }
  };

  const mapPrismaToResult = (data: any): ReelAnalysisResult => ({
    metadata: {
      creator: `@${data.creator}`,
      caption: data.caption,
      views: data.views,
      likes: data.likes,
      comments: data.comments,
      duration: data.duration,
      thumbnail: data.thumbnailUrl,
      reelUrl: data.reelUrl,
    },
    analysis: data.analysis,
    newConcepts: data.newConcepts,
    directorMode: data.directorMode,
    editorMode: data.editorMode,
    recreationGuide: data.recreationGuide,
  });

  const pollAnalysisStatus = async (id: number) => {
    const maxAttempts = 60; // 5 minutes at 5s interval
    let attempts = 0;

    const interval = setInterval(async () => {
      attempts++;
      if (attempts >= maxAttempts) {
        clearInterval(interval);
        setIsAnalyzing(false);
        toast.error("⏱️ Analysis Timed Out", {
          description: "The server took too long to respond. Your analysis may still be processing — check the History section in a few minutes.",
          duration: 8000,
        });
        return;
      }

      try {
        const response = await fetch(`/api/instagram/reel-analyzer/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) return;

        const data = await response.json();
        setAnalysisStatus(data.status);

        if (data.status === "COMPLETED") {
          clearInterval(interval);
          setResult(mapPrismaToResult(data));
          setIsAnalyzing(false);
          toast.success("Analysis complete!");
          fetchHistory();
        } else if (data.status === "FAILED") {
          clearInterval(interval);
          setIsAnalyzing(false);
          const classified = classifyError({ message: data.errorMessage || "Analysis failed" });
          toast.error(`${classified.icon} ${classified.title}`, {
            description: classified.description,
            duration: classified.duration,
          });
          if (classified.action === "credits") setShowCreditModal(true);
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 4000); // Poll every 4 seconds
  };

  const handleAnalyze = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!url.trim()) {
      toast.error("Please enter a reel URL");
      return;
    }

    // Basic validation
    if (!url.includes("instagram.com")) {
      toast.error("Please enter a valid Instagram URL");
      return;
    }

    setIsAnalyzing(true);
    setResult(null);
    setAnalysisStatus("PENDING");

    try {
      const response = await fetch("/api/instagram/reel-analyzer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reelUrl: url }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        if (response.status === 403 || errorData?.code === 'INSUFFICIENT_CREDITS') {
          toast.error("Insufficient credits. Please upgrade your plan.");
          setShowCreditModal(true);
          setIsAnalyzing(false);
          return;
        }
        throw new Error(errorData?.message || "Failed to analyze reel");
      }

      const data = await response.json();

      if (data.status === "COMPLETED") {
        setResult(mapPrismaToResult(data));
        setIsAnalyzing(false);
        toast.success("Analysis complete!");
      } else {
        // It's PENDING or in progress, start polling
        setAnalysisStatus(data.status || "PENDING");
        pollAnalysisStatus(data.id);
      }
    } catch (error: any) {
      setIsAnalyzing(false);
      const classified = classifyError({ message: error.message });
      if (classified.action === "credits") {
        setShowCreditModal(true);
      } else {
        toast.error(`${classified.icon} ${classified.title}`, {
          description: classified.description,
          duration: classified.duration,
        });
      }
    }
  };

  const handleExampleClick = (exampleUrl: string) => {
    setUrl(exampleUrl);
  };

  const handleAnalyzeNew = () => {
    setResult(null);
    setUrl("");
    setAnalysisStatus("PENDING");
    // Focus the input after React re-renders the form
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  return (
    <div className="flex flex-col gap-6 min-h-[calc(100vh-6rem)] relative w-full">
      {/* Background glow effects */}
      <div className="fixed top-20 left-[20%] w-[500px] h-[500px] bg-orange-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-20 right-[20%] w-[400px] h-[400px] bg-red-500/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Header section — switches between input form and "Analyze New" button */}
      {result && !isAnalyzing ? (
        <div className="flex items-center justify-between mb-2 animate-in fade-in duration-300">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleAnalyzeNew}
              className="h-9 w-9 p-0 rounded-xl glass border-border/30 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
              Reverse-engineer any  <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-red-600">viral reel.</span>
            </h1>
          </div>
          <Button
            onClick={handleAnalyzeNew}
            className="rounded-xl bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white shadow-lg shadow-orange-500/25 border-none gap-2 h-10 px-5 group"
          >
            <Sparkles className="h-4 w-4" />
            Analyze New Reel
            <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </Button>
        </div>
      ) : (
        <div className={`transition-all duration-500 ease-in-out ${isAnalyzing ? "mb-2" : "mt-12 md:mt-24 mb-12 text-center max-w-3xl mx-auto"}`}>
          <h1 className={`text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight mb-4 text-foreground ${isAnalyzing ? "text-left text-2xl md:text-3xl" : ""}`}>
            Reverse-engineer any <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-red-600 inline-block min-w-[200px] text-left"><TypewriterEffect words={TYPEWRITER_WORDS} /></span>
          </h1>

          {!isAnalyzing && (
            <p className="text-sm text-muted-foreground max-w-2xl mx-auto mb-10">
              Paste an Instagram Reel URL to get a deep, structured breakdown spanning viral psychology, director's shot list, editor's cuts, and a step-by-step recreation blueprint.
            </p>
          )}

          {/* Input form */}
          <form onSubmit={handleAnalyze} className={`relative flex items-center gap-2 max-w-2xl w-full ${isAnalyzing ? "" : "mx-auto"}`}>
            <div className="relative flex-1 group">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                <Instagram className="h-5 w-5 text-muted-foreground group-focus-within:text-orange-500 transition-colors" />
              </div>
              <Input
                ref={inputRef}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.instagram.com/reel/..."
                className="h-14 pl-10 pr-32 rounded-2xl bg-background/50 backdrop-blur-xl border-border/50 focus-visible:ring-orange-500/30 focus-visible:border-orange-500/50 text-base"
                disabled={isAnalyzing}
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground z-10 pointer-events-none" />
              <div className="absolute inset-y-2 right-2 flex items-center">
                <Button
                  type="submit"
                  disabled={isAnalyzing || !url}
                  className="h-10 rounded-xl bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white shadow-lg shadow-orange-500/25 border-none w-28 group"
                >
                  {isAnalyzing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Analyze <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Loading State */}
      {isAnalyzing && (
        <div className="flex-1 flex flex-col items-center justify-center min-h-[400px]">
          <div className="relative w-24 h-24 mb-8">
            <div className="absolute inset-0 rounded-full border-t-2 border-orange-500 animate-spin opacity-80 decoration-slice"></div>
            <div className="absolute inset-2 rounded-full border-r-2 border-red-500 animate-[spin_1.5s_linear_infinite_reverse] opacity-60"></div>
            <div className="absolute inset-4 rounded-full border-b-2 border-orange-500 animate-[spin_2s_linear_infinite] opacity-40"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <Sparkles className="h-8 w-8 text-orange-500 animate-pulse" />
            </div>
          </div>
          <h3 className="text-xl font-semibold mb-2">Deep Scanning Reel...</h3>
          <div className="flex flex-col gap-2 text-sm text-muted-foreground items-center">
            <p className={`transition-all duration-300 ${analysisStatus === 'SCRAPING' ? 'text-orange-500 font-bold' : 'opacity-40'}`}>
              {analysisStatus === 'SCRAPING' ? '→ ' : ''}Scraping metadata & engagement rates...
            </p>
            <p className={`transition-all duration-300 ${analysisStatus === 'UPLOADING' ? 'text-orange-500 font-bold' : 'opacity-40'}`}>
              {analysisStatus === 'UPLOADING' ? '→ ' : ''}Scaning video by AI...
            </p>
            <p className={`transition-all duration-300 ${analysisStatus === 'PROCESSING' || analysisStatus === 'PENDING' ? 'text-orange-500 font-bold' : 'opacity-40'}`}>
              {analysisStatus === 'PROCESSING' || analysisStatus === 'PENDING' ? '→ ' : ''}Processing visual patterns...
            </p>
            <p className={`transition-all duration-300 ${analysisStatus === 'ANALYZING' ? 'text-orange-500 font-bold' : 'opacity-40'}`}>
              {analysisStatus === 'ANALYZING' ? '→ ' : ''}Generating deep insights...
            </p>
          </div>
          <p className="mt-6 text-xs text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-full border border-border/30">
            Current Stage: <span className="font-bold text-foreground">{analysisStatus}</span>
          </p>
        </div>
      )}

      {/* Results Section */}
      {result && !isAnalyzing && (
        <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out fill-mode-both">

          {/* Metadata Card */}
          <Card className="p-4 rounded-2xl bg-background/40 backdrop-blur-md border-border/40 shadow-xl overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-red-500/5 pointer-events-none" />
            <div className="flex flex-col md:flex-row gap-6 items-start relative z-10">
              {/* Thumbnail */}
              <div className="relative w-full md:w-48 aspect-[9/16] rounded-xl overflow-hidden bg-muted border border-border/50 shadow-inner flex-shrink-0 group">
                {result.metadata.thumbnail ? (
                  <img
                    src={`/api/proxy-image?url=${encodeURIComponent(result.metadata.thumbnail)}`}
                    alt="Reel thumbnail"
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Video className="h-8 w-8 text-muted-foreground/30" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors duration-300" />
                <a
                  href={result.metadata.reelUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                >
                  <div className="h-12 w-12 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white border border-white/20">
                    <Play className="h-5 w-5 ml-1" />
                  </div>
                </a>
                {result.metadata.duration && (
                  <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-black/60 backdrop-blur-md text-white text-[10px] font-medium tracking-wide">
                    {result.metadata.duration}
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 flex flex-col h-full w-full">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-orange-500/20 to-red-500/20 flex items-center justify-center border border-orange-500/30">
                      <span className="text-xs font-bold text-orange-600 dark:text-orange-400">
                        {result.metadata.creator.charAt(1).toUpperCase()}
                      </span>
                    </div>
                    <span className="font-bold text-lg text-foreground">{result.metadata.creator}</span>
                  </div>
                  <Button variant="outline" size="sm" className="h-8 gap-2 rounded-lg bg-background/50 border-border/50 text-muted-foreground hover:text-foreground">
                    <Save className="h-4 w-4" />
                    Save to Videos
                  </Button>
                </div>

                <div className="flex gap-4 mb-4 mt-2">
                  <Badge variant="secondary" className="px-3 py-1 text-xs font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 rounded-lg flex gap-1.5 items-center">
                    <Play className="h-3.5 w-3.5" />
                    {formatViews(result.metadata.views)} Views
                  </Badge>
                  <Badge variant="secondary" className="px-3 py-1 text-xs font-medium bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20 rounded-lg flex gap-1.5 items-center">
                    <Heart className="h-3.5 w-3.5" />
                    {formatViews(result.metadata.likes)}
                  </Badge>
                  <Badge variant="secondary" className="px-3 py-1 text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 rounded-lg flex gap-1.5 items-center">
                    <MessageCircle className="h-3.5 w-3.5" />
                    {formatViews(result.metadata.comments)}
                  </Badge>
                </div>

                <div className="bg-muted/30 rounded-xl p-3 border border-border/30 max-h-[120px] overflow-y-auto mt-auto">
                  <p className="text-sm text-foreground/80 line-clamp-4 leading-relaxed">
                    {result.metadata.caption || "No caption."}
                  </p>
                </div>
              </div>
            </div>
          </Card>

          {/* Deep Analysis Tabs */}
          <div className="bg-background/40 backdrop-blur-md rounded-2xl border border-border/40 shadow-xl overflow-hidden flex flex-col md:flex-row min-h-[500px]">
            {/* Vertical Tab Navigation */}
            <div className="w-full md:w-56 lg:w-64 border-b md:border-b-0 md:border-r border-border/30 p-4 flex md:flex-col gap-2 overflow-x-auto md:overflow-visible shrink-0 bg-muted/10">
              <h3 className="hidden md:block text-xs font-bold tracking-wider text-muted-foreground uppercase mb-2 px-2">Deep Analysis</h3>

              <button
                onClick={() => setActiveTab("analysis")}
                className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 uppercase tracking-wide text-xs font-bold text-left min-w-[140px] md:min-w-0 ${activeTab === "analysis"
                  ? "bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 shadow-sm"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground border border-transparent"
                  }`}
              >
                <Sparkles className="h-4 w-4" />
                Analysis
              </button>

              <button
                onClick={() => setActiveTab("concepts")}
                className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 uppercase tracking-wide text-xs font-bold text-left min-w-[140px] md:min-w-0 ${activeTab === "concepts"
                  ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shadow-sm"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground border border-transparent"
                  }`}
              >
                <Wand2 className="h-4 w-4" />
                New Concepts
              </button>

              <div className="hidden md:block my-2 border-t border-border/20" />

              <button
                onClick={() => setActiveTab("director")}
                className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 uppercase tracking-wide text-xs font-bold text-left min-w-[140px] md:min-w-0 ${activeTab === "director"
                  ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 shadow-sm"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground border border-transparent"
                  }`}
              >
                <Video className="h-4 w-4" />
                Director Mode
              </button>

              <button
                onClick={() => setActiveTab("editor")}
                className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 uppercase tracking-wide text-xs font-bold text-left min-w-[140px] md:min-w-0 ${activeTab === "editor"
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-sm"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground border border-transparent"
                  }`}
              >
                <Scissors className="h-4 w-4" />
                Editor Mode
              </button>

              <div className="hidden md:block my-2 border-t border-border/20" />

              <button
                onClick={() => setActiveTab("recreate")}
                className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 uppercase tracking-wide text-xs font-bold text-left min-w-[140px] md:min-w-0 ${activeTab === "recreate"
                  ? "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 shadow-sm"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground border border-transparent"
                  }`}
              >
                <Save className="h-4 w-4" />
                Recreate Blueprint
              </button>
            </div>

            {/* Tab Content Area */}
            <div className="flex-1 p-6 md:p-8 overflow-y-auto max-h-[800px] min-h-[500px]">

              {/* === ANALYSIS === */}
              {activeTab === "analysis" && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 rounded-lg bg-orange-500/10 text-orange-500 border border-orange-500/20">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <h2 className="text-2xl font-bold">Reel Analysis</h2>
                  </div>
                  <div className="prose dark:prose-invert max-w-none bg-muted/20 p-6 rounded-2xl border border-border/30">
                    <MarkdownContent content={result.analysis || "Analysis not available for this reel."} />
                  </div>
                </div>
              )}

              {/* === NEW CONCEPTS === */}
              {activeTab === "concepts" && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20">
                      <Wand2 className="h-5 w-5" />
                    </div>
                    <h2 className="text-2xl font-bold">New Reel Concepts</h2>
                  </div>
                  <div className="prose dark:prose-invert max-w-none bg-muted/20 p-6 rounded-2xl border border-border/30">
                    <MarkdownContent content={result.newConcepts || "No concepts generated for this reel."} />
                  </div>
                </div>
              )}

              {/* === DIRECTOR MODE === */}
              {activeTab === "director" && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500 border border-blue-500/20">
                      <Video className="h-5 w-5" />
                    </div>
                    <h2 className="text-2xl font-bold">Director's Breakdown</h2>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-muted/30 p-4 rounded-xl border border-border/30">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground font-bold mb-2">Shot Types</div>
                      <div className="text-sm"><MarkdownContent content={result.directorMode?.shotTypes || "-"} /></div>
                    </div>
                    <div className="bg-muted/30 p-4 rounded-xl border border-border/30">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground font-bold mb-2">Angles</div>
                      <div className="text-sm"><MarkdownContent content={result.directorMode?.cameraAngles || "-"} /></div>
                    </div>
                    <div className="bg-muted/30 p-4 rounded-xl border border-border/30">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground font-bold mb-2">Movement</div>
                      <div className="text-sm"><MarkdownContent content={result.directorMode?.cameraMovement || "-"} /></div>
                    </div>
                    <div className="bg-muted/30 p-4 rounded-xl border border-border/30">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground font-bold mb-2">Lighting</div>
                      <div className="text-sm"><MarkdownContent content={result.directorMode?.lightingStyle || "-"} /></div>
                    </div>
                  </div>

                  <div className="bg-muted/30 p-5 rounded-2xl border border-border/30">
                    <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Composition</h4>
                    <MarkdownContent content={result.directorMode?.sceneComposition || "-"} />
                  </div>

                  <div className="bg-blue-500/5 p-6 rounded-2xl border border-blue-500/20">
                    <div className="flex items-center gap-2 mb-4">
                      <Video className="h-5 w-5 text-blue-500" />
                      <h4 className="text-lg font-bold text-foreground">Shooting Guide</h4>
                    </div>
                    <div className="prose-sm md:prose dark:prose-invert">
                      <MarkdownContent content={result.directorMode?.shootingGuide || "No shooting guide available."} />
                    </div>
                  </div>
                </div>
              )}

              {/* === EDITOR MODE === */}
              {activeTab === "editor" && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                      <Scissors className="h-5 w-5" />
                    </div>
                    <h2 className="text-2xl font-bold">Editor's Breakdown</h2>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-muted/30 p-5 rounded-2xl border border-border/30">
                      <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Cuts & Pacing</h4>
                      <MarkdownContent content={`**Style:** ${result.editorMode?.cutStyle || "-"}\n\n**Timing:** ${result.editorMode?.timingPacing || "-"}`} />
                    </div>

                    <div className="bg-muted/30 p-5 rounded-2xl border border-border/30">
                      <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Visuals & Text</h4>
                      <MarkdownContent content={`**Effects:** ${result.editorMode?.effectsUsed || "-"}\n\n**Text:** ${result.editorMode?.textAnimation || "-"}`} />
                    </div>

                    <div className="bg-muted/30 p-5 rounded-2xl border border-border/30 md:col-span-2">
                      <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Sound Design</h4>
                      <MarkdownContent content={result.editorMode?.soundDesign || "-"} />
                    </div>

                    <div className="bg-emerald-500/5 p-5 rounded-2xl border border-emerald-500/20 md:col-span-2">
                      <h4 className="text-sm font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-3">Toolkit Requirements</h4>
                      <MarkdownContent content={`**Software:** ${result.editorMode?.suggestedTools || "Any modern video editor"}\n\n**Plugins/Assets:** ${result.editorMode?.pluginsPresets || "None specific"}`} />
                    </div>
                  </div>
                </div>
              )}

              {/* === RECREATE === */}
              {activeTab === "recreate" && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 rounded-lg bg-red-500/10 text-red-500 border border-red-500/20">
                      <Wand2 className="h-5 w-5" />
                    </div>
                    <h2 className="text-2xl font-bold">Recreation Blueprint</h2>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
                    {/* Beginner Box */}
                    <div className="bg-gradient-to-b from-blue-500/5 to-transparent p-6 rounded-2xl border border-blue-500/20">
                      <h3 className="text-lg font-bold text-blue-600 dark:text-blue-400 mb-4 flex items-center gap-2 border-b border-blue-500/10 pb-3">
                        <span className="bg-blue-500/20 p-1.5 rounded-md">1</span>
                        Beginner Fast-Track
                      </h3>
                      <div className="prose-sm md:prose dark:prose-invert max-w-none">
                        <MarkdownContent content={result.recreationGuide?.beginnerVersion || "Beginner guide not available."} />
                      </div>
                    </div>

                    {/* Pro Box */}
                    <div className="bg-gradient-to-b from-orange-500/5 to-transparent p-6 rounded-2xl border border-orange-500/20">
                      <h3 className="text-lg font-bold text-orange-600 dark:text-orange-400 mb-4 flex items-center gap-2 border-b border-orange-500/10 pb-3">
                        <span className="bg-orange-500/20 p-1.5 rounded-md">2</span>
                        Advanced / Pro Workflow
                      </h3>
                      <div className="prose-sm md:prose dark:prose-invert max-w-none">
                        <MarkdownContent content={result.recreationGuide?.advancedVersion || "Pro guide not available."} />
                      </div>
                    </div>
                  </div>

                  {/* Brand Adaptation */}
                  <div className="bg-red-500/5 p-6 rounded-2xl border border-red-500/20 mt-4">
                    <h3 className="text-xl font-bold text-red-600 dark:text-red-400 mb-4">
                      Adapt to Your Brand
                    </h3>
                    <div className="text-lg leading-relaxed">
                      <MarkdownContent content={result.recreationGuide?.adaptToYourBrand || "Adaptation guide not available."} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ───── Recently Analyzed History ───── */}
      <div className="mt-12 mb-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted/50 border border-border/40">
              <History className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Recently Analyzed</h2>
              <p className="text-sm text-muted-foreground">Click any completed analysis to view its full breakdown</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchHistory}
            disabled={loadingHistory}
            className="gap-2 text-muted-foreground hover:text-foreground"
          >
            <RotateCw className={`h-4 w-4 ${loadingHistory ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {history.length === 0 && !loadingHistory && (
          <div className="text-center py-16 text-muted-foreground border border-dashed border-border/40 rounded-2xl bg-muted/10">
            <Search className="h-8 w-8 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No analyses yet. Paste a reel URL above to get started!</p>
          </div>
        )}

        {history.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {history.map((item) => (
              <div
                key={item.id}
                onClick={() => handleHistoryClick(item)}
                className={`group relative rounded-2xl border border-border/40 bg-background/40 backdrop-blur-md overflow-hidden transition-all duration-200 ${item.status === "COMPLETED"
                  ? "cursor-pointer hover:border-orange-500/40 hover:shadow-lg hover:shadow-orange-500/5"
                  : "opacity-70"
                  }`}
              >
                {/* Thumbnail */}
                <div className="relative aspect-video bg-muted/50">
                  {item.thumbnailUrl ? (
                    <img
                      src={`/api/proxy-image?url=${encodeURIComponent(item.thumbnailUrl)}`}
                      alt={`Reel by @${item.creator || "unknown"}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Video className="h-8 w-8 text-muted-foreground/30" />
                    </div>
                  )}
                  {/* Status overlay */}
                  <div className="absolute top-2 left-2">
                    {item.status === "COMPLETED" && (
                      <Badge className="bg-emerald-500/90 text-white border-none text-[10px] px-2 py-0.5 gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Done
                      </Badge>
                    )}
                    {item.status === "FAILED" && (
                      <Badge className="bg-red-500/90 text-white border-none text-[10px] px-2 py-0.5 gap-1">
                        <AlertCircle className="h-3 w-3" /> Failed
                      </Badge>
                    )}
                    {item.status !== "COMPLETED" && item.status !== "FAILED" && (
                      <Badge className="bg-amber-500/90 text-white border-none text-[10px] px-2 py-0.5 gap-1 animate-pulse">
                        <Loader2 className="h-3 w-3 animate-spin" /> {item.status}
                      </Badge>
                    )}
                  </div>
                  {/* Delete */}
                  <button
                    onClick={(e) => handleDeleteHistory(item.id, e)}
                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/40 backdrop-blur-sm text-white/70 hover:text-red-400 hover:bg-black/60 opacity-0 group-hover:opacity-100 transition-all duration-200"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Info */}
                <div className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm text-foreground truncate">
                      @{item.creator || "unknown"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {item.views > 0 && (
                      <span className="flex items-center gap-1">
                        <Play className="h-3 w-3" /> {formatViews(item.views)}
                      </span>
                    )}
                    {item.likes > 0 && (
                      <span className="flex items-center gap-1">
                        <Heart className="h-3 w-3" /> {formatViews(item.likes)}
                      </span>
                    )}
                    <span className="ml-auto text-[10px]">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
