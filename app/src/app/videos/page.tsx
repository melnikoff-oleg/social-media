"use client";

import { useEffect, useState, Suspense, useMemo, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { usePipeline } from "@/context/pipeline-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Heart,
  MessageCircle,
  Film,
  Sparkles,
  Search,
  ChevronUp,
  Star,
  Play,
  ArrowUpDown,
  X,
  RefreshCw,
  ExternalLink,
  ScanSearch,
  CheckSquare,
  Square,
  Loader2,
  Zap,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Terminal,
  Plus,
  ChevronDown,
} from "lucide-react";
import { MarkdownContent } from "@/components/markdown-content";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { handleCatchError, classifyError } from "@/lib/error-utils";
import type { Video, PromptTemplate as Template } from "@/lib/types";
import Link from "next/link";

function formatViews(n: number): string {
  if (n === undefined || n === null) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toString();
}

type SortOption = "views" | "date-posted" | "date-added" | "starred";
type ViewTab = "all" | "analyzed";

export default function VideosPage() {
  return (
    <Suspense>
      <VideosContent />
    </Suspense>
  );
}

function VideosContent() {
  const { token, setShowCreditModal } = useAuth();
  const searchParams = useSearchParams();
  const { running, progress, runPipeline, resetPipeline } = usePipeline();

  // Data
  const [videos, setVideos] = useState<Video[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);

  // Filters
  const [filterTemplate, setFilterTemplate] = useState<string>("all");
  const [filterCreator, setFilterCreator] = useState<string>(searchParams.get("creator") || "all");
  const [sortBy, setSortBy] = useState<SortOption>("views");
  const [activeTab, setActiveTab] = useState<ViewTab>("all");

  // Selection
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [analysisTemplate, setAnalysisTemplate] = useState<string>("");

  // Analysis options modal
  const [analysisTarget, setAnalysisTarget] = useState<Video | 'bulk' | null>(null);
  const [customInstructions, setCustomInstructions] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);

  // Modal
  const [modalVideo, setModalVideo] = useState<Video | null>(null);
  const [modalSection, setModalSection] = useState<"analysis" | "concepts">("analysis");

  // Progress
  const [showSuccess, setShowSuccess] = useState(false);
  const [showLog, setShowLog] = useState(false);

  // Fetch all videos (not just analyzed)
  const loadVideos = () => {
    if (!token) return;
    const creatorParam = filterCreator !== "all" ? `&username=${filterCreator}` : "";
    fetch(`/api/videos?_t=${Date.now()}${creatorParam}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setVideos(data.map((p: any) => ({
            id: p.postId,
            link: p.url,
            thumbnail: p.thumbnailUrl,
            creator: p.username,
            views: p.videoPlayCount,
            likes: p.likesCount,
            comments: p.commentsCount,
            analysis: p.analysis,
            newConcepts: p.newConcepts,
            datePosted: p.timestamp ? new Date(p.timestamp).toLocaleDateString() : "",
            dateAdded: new Date(p.createdAt).toLocaleDateString(),
            templateName: p.templateName,
            starred: p.starred,
          })));
        }
      });
  };

  useEffect(() => {
    if (!token) return;
    loadVideos();

    fetch("/api/templates", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setTemplates(data);
          if (data.length > 0 && !analysisTemplate) {
            setAnalysisTemplate(data[0].templateName);
          }
        }
      });
  }, [token, filterCreator]);

  // When pipeline completes analysis, reload videos
  useEffect(() => {
    if (
      progress?.status === "completed" &&
      progress.phase === "done" &&
      (progress.videosAnalyzed ?? 0) > 0
    ) {
      setShowSuccess(true);
      setSelectedIds(new Set());
      setIsSelectionMode(false);
      const timer = setTimeout(() => {
        setShowSuccess(false);
        loadVideos();
        resetPipeline();
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [progress]);

  // ─── POLLING: Auto-refresh when any video is being processed ───────────
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasProcessingVideos = useMemo(
    () => videos.some((v) => v.analysis?.startsWith("🔄")),
    [videos]
  );

  useEffect(() => {
    // Start polling if there are processing videos and no active interval
    if (hasProcessingVideos && !pollingRef.current) {
      pollingRef.current = setInterval(() => {
        loadVideos();
      }, 3000);
    }

    // Stop polling when nothing is processing
    if (!hasProcessingVideos && pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [hasProcessingVideos]);

  const uniqueCreators = [...new Set(videos.map((v) => v.creator))].sort();

  const isAnalyzed = (v: Video) => 
    !!v.analysis && 
    !v.analysis.startsWith("🔄") && 
    !v.analysis.startsWith("Error") && 
    !v.analysis.includes("Analysis failed");

  const isError = (v: Video) => 
    !!v.analysis && (v.analysis.startsWith("Error") || v.analysis.includes("Analysis failed"));

  const isProcessing = (v: Video) => 
    !!v.analysis && (v.analysis.startsWith("🔄") || v.analysis.includes("Analyzing") || v.analysis.includes("re-analyzing"));

  const filtered = videos
    .filter((v) => {
      if (activeTab === "analyzed" && !isAnalyzed(v)) return false;
      if (filterTemplate !== "all" && v.templateName !== filterTemplate) return false;
      if (filterCreator !== "all" && v.creator !== filterCreator) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "starred") {
        if (a.starred !== b.starred) return a.starred ? -1 : 1;
        return b.views - a.views;
      }
      if (sortBy === "views") return b.views - a.views;
      if (sortBy === "date-posted") return (b.datePosted || "").localeCompare(a.datePosted || "");
      if (sortBy === "date-added") return (b.dateAdded || "").localeCompare(a.dateAdded || "");
      return 0;
    });

  const analyzedCount = filtered.filter((v) => isAnalyzed(v)).length;

  const openModal = (video: Video, section: "analysis" | "concepts") => {
    setModalVideo(video);
    setModalSection(section);
  };

  const triggerAnalysisDialog = (target: Video | 'bulk') => {
    setAnalysisTarget(target);
    setCustomInstructions("");
    setShowCustomInput(false);
  };

  const confirmAnalysis = async () => {
    if (!token || !analysisTemplate) {
      toast.error("⚠️ No Template Selected", { description: "Please select a prompt template before running analysis." });
      return;
    }

    const instructionsToPass = showCustomInput ? customInstructions : undefined;

    if (analysisTarget === 'bulk') {
      handleBulkAnalyzeExecute(instructionsToPass);
      setAnalysisTarget(null);
      return;
    }

    if (!analysisTarget) return;

    const postId = analysisTarget.id || analysisTarget.link;
    setAnalysisTarget(null); // close dialog immediately

    // Optimistic UI: show processing state locally
    setVideos((prev) =>
      prev.map((v) =>
        v.id === postId
          ? { ...v, analysis: "🔄 Processing... AI is analyzing this reel.", newConcepts: "🔄 Generating concepts..." }
          : v
      )
    );

    if (modalVideo?.id === postId) {
      setModalVideo((prev) => prev ? {
        ...prev,
        analysis: "🔄 Processing... AI is analyzing this reel.",
        newConcepts: "🔄 Generating concepts..."
      } : null);
    }

    try {
      // Fire-and-forget: API returns instantly with 202 Accepted
      const res = await fetch("/api/pipeline/re-analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ postId, templateName: analysisTemplate, customInstructions: instructionsToPass }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 403 || errData.code === "INSUFFICIENT_CREDITS" || errData.message?.toLowerCase().includes("credits") || errData.message?.toLowerCase().includes("insufficient")) {
          toast.error("Insufficient credits. Please upgrade your plan.");
          setShowCreditModal(true);
        }
        throw new Error(errData.message || "Failed to queue analysis");
      }

      // The polling mechanism (useEffect above) will automatically
      // re-fetch videos every 3s and update the UI when analysis completes.
      console.log(`[Analysis] Queued successfully for ${postId}. Polling will pick up the result.`);

    } catch (err) {
      console.error("Failed to queue analysis:", err);
      const classified = classifyError({ message: err instanceof Error ? err.message : String(err) });
      if (classified.action === "credits") {
        setShowCreditModal(true);
      }
      const errorMsg = `${classified.icon} ${classified.title}: ${classified.description}`;
      setVideos((prev) =>
        prev.map((v) =>
          v.id === postId
            ? { ...v, analysis: errorMsg, newConcepts: "" }
            : v
        )
      );
      if (modalVideo?.id === postId) {
        setModalVideo((prev) => prev ? { ...prev, analysis: errorMsg, newConcepts: "" } : null);
      }
      toast.error(`${classified.icon} ${classified.title}`, {
        description: classified.description,
        duration: classified.duration,
      });
    }
  };

  const toggleStar = async (id: string, currentStarred: boolean) => {
    const newStarred = !currentStarred;
    setVideos((prev) =>
      prev.map((v) => (v.id === id ? { ...v, starred: newStarred } : v))
    );
    await fetch(`/api/videos/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "Authorization": `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ starred: newStarred }),
    });
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const selectAllFiltered = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((v) => v.id)));
    }
  };

  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    if (isSelectionMode) {
      setSelectedIds(new Set());
    }
  };

  const handleBulkAnalyzeExecute = (instructions?: string) => {
    if (selectedIds.size === 0 || !analysisTemplate) return;

    // Mark specifically as processing locally
    setVideos(prev => prev.map(v =>
      selectedIds.has(v.id)
        ? { ...v, analysis: "🔄 Bulk analyzing...", newConcepts: "🔄..." }
        : v
    ));

    const selectedVideos = videos
      .filter((v) => selectedIds.has(v.id))
      .map((v) => ({
        id: v.id,
        postId: v.id,
        videoUrl: v.link,
        postUrl: v.link,
        url: v.link,
        thumbnail: v.thumbnail,
        username: v.creator,
        views: v.views,
        likes: v.likes,
        comments: v.comments,
        datePosted: v.datePosted,
      }));

    runPipeline({
      templateName: analysisTemplate,
      maxVideos: selectedVideos.length,
      topK: selectedVideos.length,
      nDays: 30,
      selectedVideos: selectedVideos as any,
      customInstructions: instructions,
    });
  };

  const totalProgress = useMemo(() => {
    if (!progress) return 0;
    if (progress.phase === "analyzing") {
      const analyzed = progress.videosAnalyzed ?? 0;
      const total = progress.videosTotal ?? 1;
      return (analyzed / total) * 100;
    }
    if (progress.phase === "done") return 100;
    return 0;
  }, [progress]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Videos</h1>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
            {filterCreator !== "all"
              ? `All scraped reels for @${filterCreator}`
              : "Browse and analyze competitor reels"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={isSelectionMode ? "secondary" : "ghost"}
            onClick={toggleSelectionMode}
            className={`h-10 rounded-xl glass border-border/50 gap-2 ${isSelectionMode ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' : ''}`}
          >
            {isSelectionMode ? <X className="h-4 w-4" /> : <CheckSquare className="h-4 w-4" />}
            {isSelectionMode ? "Cancel Select" : "Bulk Select"}
          </Button>
          <Button asChild className="h-10 rounded-xl bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white shadow-lg shadow-orange-500/25 border-none">
            <Link href="/analyze">
              <ScanSearch className="h-4 w-4 mr-2" />
              Single Reel Deep Analyzer
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="flex rounded-xl glass border border-border/50 p-0.5 h-10">
          <button
            onClick={() => setActiveTab("all")}
            className={`px-4 rounded-lg text-xs font-semibold transition-all duration-200 ${activeTab === "all"
              ? "bg-orange-500/15 text-orange-400 shadow-sm"
              : "text-muted-foreground hover:text-foreground"
              }`}
          >
            All ({filtered.length})
          </button>
          <button
            onClick={() => setActiveTab("analyzed")}
            className={`px-4 rounded-lg text-xs font-semibold transition-all duration-200 ${activeTab === "analyzed"
              ? "bg-emerald-500/15 text-emerald-400 shadow-sm"
              : "text-muted-foreground hover:text-foreground"
              }`}
          >
            Analyzed ({analyzedCount})
          </button>
        </div>

        <Select value={filterTemplate} onValueChange={setFilterTemplate}>
          <SelectTrigger className="w-full sm:w-[200px] rounded-xl glass border-border/50 h-10 text-xs">
            <SelectValue placeholder="Filter by template" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Templates</SelectItem>
            {templates.map((t) => (
              <SelectItem key={t.templateName} value={t.templateName}>{t.templateName}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterCreator} onValueChange={setFilterCreator}>
          <SelectTrigger className="w-[150px] sm:w-[200px] flex-1 sm:flex-none rounded-xl glass border-border/50 h-10 text-xs">
            <SelectValue placeholder="Filter by creator" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Creators</SelectItem>
            {uniqueCreators.map((c) => (
              <SelectItem key={c} value={c}>@{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
          <SelectTrigger className="w-[140px] sm:w-[180px] flex-1 sm:flex-none rounded-xl glass border-border/50 h-10 text-xs text-left">
            <div className="flex items-center gap-2">
              <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="views">Most Views</SelectItem>
            <SelectItem value="date-posted">Date Posted</SelectItem>
            <SelectItem value="date-added">Date Added</SelectItem>
            <SelectItem value="starred">Starred First</SelectItem>
          </SelectContent>
        </Select>

        <Badge variant="secondary" className="rounded-lg px-3 py-1.5 text-[10px] sm:text-xs bg-foreground/[0.05] border border-border/40 h-10 sm:h-auto flex items-center">
          {filtered.length} videos
        </Badge>
      </div>

      {isSelectionMode && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-3 rounded-xl glass border border-orange-500/20 bg-orange-500/[0.03] animate-in slide-in-from-top duration-300">
          <Button
            variant="ghost"
            size="sm"
            onClick={selectAllFiltered}
            className="text-[10px] sm:text-xs gap-1.5 rounded-lg h-8"
          >
            {selectedIds.size === filtered.length && filtered.length > 0
              ? <CheckSquare className="h-3.5 w-3.5" />
              : <Square className="h-3.5 w-3.5" />}
            {selectedIds.size === filtered.length && filtered.length > 0
              ? "Deselect All"
              : `Select All (${filtered.length})`}
          </Button>

          {selectedIds.size > 0 && (
            <>
              <span className="text-[10px] sm:text-xs text-muted-foreground">
                {selectedIds.size} selected
              </span>
              <div className="flex items-center gap-2 ml-auto">
                <Select value={analysisTemplate} onValueChange={setAnalysisTemplate}>
                  <SelectTrigger className="w-[180px] rounded-xl glass border-border/50 h-8 text-xs">
                    <Zap className="h-3 w-3 mr-1.5 text-orange-400" />
                    <SelectValue placeholder="Pick template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.templateName} value={t.templateName}>{t.templateName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => triggerAnalysisDialog('bulk')}
                  disabled={!analysisTemplate || running}
                  className="rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 border-0 h-8 px-4 text-xs gap-1.5 shadow-lg shadow-orange-500/20"
                >
                  {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 fill-current" />}
                  Analyze {selectedIds.size} Reels
                  <ArrowRight className="h-3 w-3" />
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {(running || showSuccess || progress?.status === "error") && progress && (
        <div className="glass rounded-2xl p-5 space-y-4 relative overflow-hidden animate-in fade-in duration-300">
          {showSuccess && (
            <div className="absolute inset-0 bg-emerald-500/10 backdrop-blur-md z-50 flex flex-col items-center justify-center p-4 animate-in fade-in duration-500 text-center">
              <div className="h-16 w-16 rounded-full bg-emerald-500/20 flex items-center justify-center mb-4 border border-emerald-500/30">
                <CheckCircle2 className="h-8 w-8 text-emerald-400 animate-in zoom-in duration-500" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Analysis Complete!</h2>
              <p className="text-emerald-100/70 text-xs">Refreshing videos...</p>
              <Loader2 className="h-4 w-4 text-emerald-400/50 animate-spin mt-4" />
            </div>
          )}

          <div className={showSuccess ? "opacity-0" : "opacity-100 transition-opacity duration-500"}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {progress.status === "running" && <Loader2 className="h-4 w-4 text-orange-400 animate-spin" />}
                <h2 className="text-sm font-semibold">
                  {progress.status === "running" && `Analyzing ${progress.videosTotal} videos...`}
                  {progress.status === "completed" && "Analysis complete"}
                  {progress.status === "error" && "Analysis failed"}
                </h2>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {(progress.phase === "analyzing" || progress.phase === "done") && (
                  <span>Analyzed: <span className="text-foreground">{progress.videosAnalyzed}/{progress.videosTotal}</span></span>
                )}
                {(progress?.errors?.length ?? 0) > 0 && (
                  <span className="inline-flex items-center gap-1 text-red-400">
                    <AlertTriangle className="h-3 w-3" />
                    {progress?.errors?.length}
                  </span>
                )}
              </div>
            </div>

            <div className="mt-4">
              <div className="h-2 rounded-full bg-muted border border-border/20 overflow-hidden shadow-inner">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${progress?.status === "completed"
                    ? "bg-gradient-to-r from-emerald-500 to-teal-500"
                    : progress?.status === "error"
                      ? "bg-gradient-to-r from-red-500 to-orange-500"
                      : "bg-gradient-to-r from-orange-500 to-orange-500"
                    }`}
                  style={{ width: `${totalProgress}%` }}
                />
              </div>
            </div>

            <button
              onClick={() => setShowLog(!showLog)}
              className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <Terminal className="h-3 w-3" />
              <span className="font-medium">{showLog ? "Hide" : "Show"} Log</span>
              <Badge variant="secondary" className="rounded-md text-[9px] bg-muted/80 border border-border ml-1">
                {progress?.log?.length ?? 0}
              </Badge>
            </button>

            {showLog && (
              <ScrollArea className="h-[120px] mt-2 rounded-xl glass border border-border/30 p-3">
                <div className="space-y-0.5 font-mono text-[10px]">
                  {(progress?.log ?? []).map((line, i) => (
                    <div
                      key={i}
                      className={`leading-5 ${line.includes("Error") || line.includes("error")
                        ? "text-red-400"
                        : line.includes("done") || line.includes("complete") || line.includes("Complete")
                          ? "text-emerald-400/80"
                          : "text-muted-foreground"
                        }`}
                    >
                      {line}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-3 grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        {filtered.map((video) => {
          const id = video.id || video.link;
          const analyzed = isAnalyzed(video);
          const hasError = isError(video);
          const isSelected = selectedIds.has(id);

          return (
            <div key={id} className="group relative">
              <div
                onClick={() => isSelectionMode && toggleSelect(id)}
                className={`glass rounded-2xl overflow-hidden transition-all duration-300 hover:border-border ${isSelected ? "ring-2 ring-orange-500/50 border-orange-500/30" : ""
                  } ${!analyzed && !hasError ? "opacity-90" : ""} ${isSelectionMode ? "cursor-pointer" : ""}`}
              >
                <div className="relative block aspect-[9/16] w-full bg-foreground/[0.02] overflow-hidden">
                  {isSelectionMode ? (
                    video.thumbnail ? (
                      <img
                        src={`/api/proxy-image?url=${encodeURIComponent(video.thumbnail)}`}
                        alt={`@${video.creator}`}
                        className={`absolute inset-0 h-full w-full object-cover ${isSelected ? 'scale-105' : ''}`}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <Film className="h-10 w-10 text-muted-foreground/20" />
                      </div>
                    )
                  ) : (
                    <a
                      href={video.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block h-full w-full"
                    >
                      {video.thumbnail ? (
                        <img
                          src={`/api/proxy-image?url=${encodeURIComponent(video.thumbnail)}`}
                          alt={`@${video.creator}`}
                          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <Film className="h-10 w-10 text-muted-foreground/20" />
                        </div>
                      )}
                    </a>
                  )}

                  <div className="absolute top-2 left-2 z-20">
                    {(isSelectionMode || isSelected) ? (
                      <div className={`h-6 w-6 rounded-lg border-2 flex items-center justify-center transition-all duration-200 ${isSelected
                        ? "border-orange-500 bg-orange-500 shadow-lg shadow-orange-500/30"
                        : "border-white/40 bg-black/30 hover:border-white/60"
                        }`}>
                        {isSelected && <CheckSquare className="h-3.5 w-3.5 text-white" />}
                      </div>
                    ) : null}
                  </div>

                  {analyzed && (
                    <div className="absolute top-2 right-2">
                      <Badge className="rounded-md text-[9px] bg-emerald-500/90 text-white border-0 shadow-lg px-2 py-0.5 flex items-center gap-1">
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        Analyzed
                      </Badge>
                    </div>
                  )}

                  {isProcessing(video) && (
                    <div className="absolute top-2 right-2">
                      <Badge className="rounded-md text-[9px] bg-blue-500/90 text-white border-0 shadow-lg px-2 py-0.5 flex items-center gap-1">
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        Processing...
                      </Badge>
                    </div>
                  )}

                  {hasError && (
                    <div className="absolute top-2 right-2">
                      <Badge className="rounded-md text-[9px] bg-red-500/90 text-white border-0 shadow-lg px-2 py-0.5 flex items-center gap-1">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        Error
                      </Badge>
                    </div>
                  )}

                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent pt-8 pb-2.5 px-3 pointer-events-none">
                    <div className="flex items-center gap-1.5">
                      <Play className="h-4 w-4 text-white fill-white" />
                      <span className="text-[15px] font-bold text-white">
                        {formatViews(video.views)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-3 space-y-2" onClick={(e) => isSelectionMode && e.stopPropagation()}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold truncate">@{video.creator}</p>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleStar(id, video.starred); }}
                      className="shrink-0 ml-1.5 transition-colors"
                    >
                      <Star
                        className={`h-4 w-4 ${video.starred ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40 hover:text-yellow-400/60"}`}
                      />
                    </button>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Heart className="h-3 w-3" />
                      {formatViews(video.likes)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MessageCircle className="h-3 w-3" />
                      {formatViews(video.comments)}
                    </span>
                    <span className="ml-auto text-[10px]">{video.datePosted}</span>
                  </div>

                  {video.templateName && (
                    <Badge variant="secondary" className="rounded-md text-[10px] bg-foreground/[0.05] border border-border/30 text-muted-foreground">
                      {video.templateName}
                    </Badge>
                  )}

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {analyzed && (
                      <div className="flex gap-1.5 w-full">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openModal(video, "analysis")}
                          className="flex-1 rounded-xl text-[11px] h-7 gap-1 transition-all duration-200 glass border-border/20 text-muted-foreground hover:text-foreground"
                        >
                          <Search className="h-3 w-3" />
                          Analysis
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openModal(video, "concepts")}
                          className="flex-1 rounded-xl text-[11px] h-7 gap-1 transition-all duration-200 glass border-border/20 text-muted-foreground hover:text-foreground"
                        >
                          <Sparkles className="h-3 w-3" />
                          Concepts
                        </Button>
                      </div>
                    )}

                    {!analyzed && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isProcessing(video)}
                        onClick={() => triggerAnalysisDialog(video)}
                        className={`flex-1 rounded-xl text-[11px] h-7 gap-1 transition-all duration-200 ${
                          isProcessing(video)
                            ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                            : hasError
                              ? "bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20"
                              : "bg-orange-500/10 text-orange-400 border border-orange-500/20 hover:bg-orange-500/20"
                        }`}
                      >
                        {isProcessing(video) ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Zap className={`h-3 w-3 ${!hasError ? 'fill-current' : ''}`} />
                        )}
                        {isProcessing(video) ? "Processing..." : hasError ? "Retry" : "Analyze Now"}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="glass rounded-2xl p-12 text-center">
          <Film className="mx-auto h-10 w-10 text-muted-foreground/30" />
          <h3 className="mt-4 font-semibold">No videos found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {filterCreator !== "all"
              ? `No scraped videos for @${filterCreator} yet. Click "Refresh" on the creator card to scrape reels.`
              : "Run a pipeline analysis to generate results, or adjust your filters."}
          </p>
        </div>
      )}

      <Dialog open={!!modalVideo} onOpenChange={(open) => { if (!open) setModalVideo(null); }}>
        <DialogContent className="w-[95vw] sm:max-w-4xl max-h-[90vh] overflow-hidden glass-strong rounded-2xl border-border p-0 gap-0">
          <DialogTitle className="sr-only">
            {modalSection === "analysis" ? "Video Analysis" : "New Concepts"}
          </DialogTitle>
          {modalVideo && (
            <>
              <div className="flex flex-col sm:flex-row items-center sm:items-center gap-4 p-4 sm:p-5 border-b border-border/20">
                <div className="relative h-20 w-16 sm:h-16 sm:w-12 shrink-0 rounded-lg overflow-hidden bg-foreground/[0.02] shadow-lg">
                  {modalVideo.thumbnail ? (
                    <img
                      src={`/api/proxy-image?url=${encodeURIComponent(modalVideo.thumbnail)}`}
                      alt={`@${modalVideo.creator}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Film className="h-4 w-4 text-muted-foreground/30" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 text-center sm:text-left">
                  <div className="flex items-center justify-center sm:justify-start gap-2">
                    <p className="text-sm font-semibold">@{modalVideo.creator}</p>
                    <a
                      href={modalVideo.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-orange-400 transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                  <div className="mt-1 flex items-center justify-center sm:justify-start gap-3 text-xs text-foreground/70">
                    <span className="inline-flex items-center gap-1">
                      <Play className="h-3 w-3 fill-orange-400 text-orange-400" />
                      <span className="font-medium text-foreground">{formatViews(modalVideo.views)}</span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Heart className="h-3 w-3 text-red-400" />
                      <span className="font-medium text-foreground">{formatViews(modalVideo.likes)}</span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MessageCircle className="h-3 w-3 text-blue-400" />
                      <span className="font-medium text-foreground">{formatViews(modalVideo.comments)}</span>
                    </span>
                  </div>
                </div>
                {/* Section toggle & Retry button */}
                <div className="flex items-center gap-1.5 w-full sm:w-auto mt-2 sm:mt-0">
                  {modalVideo.analysis?.startsWith("Error") && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setModalVideo(null); triggerAnalysisDialog(modalVideo); }}
                      className="rounded-xl text-xs h-8 gap-1.5 transition-all duration-200 bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20"
                    >
                      <Sparkles className="h-3 w-3" />
                      Retry Analysis
                    </Button>
                  )}
                  <div className="flex gap-1.5 flex-1 sm:flex-none">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setModalSection("analysis")}
                      className={`flex-1 sm:flex-none rounded-xl text-xs h-8 gap-1.5 transition-all duration-200 ${modalSection === "analysis"
                        ? "bg-orange-500/15 text-orange-600 border border-orange-500/30 dark:bg-orange-500/25 dark:text-orange-200 dark:border-orange-500/40 shadow-lg shadow-orange-500/10"
                        : "text-foreground/50 hover:text-foreground hover:bg-foreground/5"
                        }`}
                    >
                      <Search className="h-3 w-3" />
                      Analysis
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setModalSection("concepts")}
                      className={`flex-1 sm:flex-none rounded-xl text-xs h-8 gap-1.5 transition-all duration-200 ${modalSection === "concepts"
                        ? "bg-orange-500/15 text-orange-600 border border-orange-500/30 dark:bg-orange-500/25 dark:text-orange-200 dark:border-orange-500/40 shadow-lg shadow-orange-500/10"
                        : "text-foreground/50 hover:text-foreground hover:bg-foreground/5"
                        }`}
                    >
                      <Sparkles className="h-3 w-3" />
                      Concepts
                    </Button>
                    <div className="w-px h-4 bg-border/40 mx-0.5" />
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Re-run Analysis"
                      onClick={() => { setModalVideo(null); triggerAnalysisDialog(modalVideo); }}
                      className="rounded-xl text-foreground/40 hover:text-orange-400 hover:bg-orange-500/10 h-8 w-8 p-0"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Modal body — scrollable */}
              <div className="overflow-y-auto max-h-[calc(90vh-100px)] p-6">
                <MarkdownContent
                  content={modalSection === "analysis" ? modalVideo.analysis : modalVideo.newConcepts}
                  variant={modalSection === "analysis" ? "analysis" : "concepts"}
                />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Analysis Options Dialog */}
      <Dialog open={!!analysisTarget} onOpenChange={(open) => { if (!open) setAnalysisTarget(null); }}>
        <DialogContent className="sm:max-w-md glass-strong rounded-2xl border-border p-6 overflow-hidden">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <ScanSearch className="h-5 w-5 text-orange-400" />
            {analysisTarget === 'bulk' ? "Bulk Analysis Options" : "Analyze Reel"}
          </DialogTitle>
          <div className="space-y-4 py-4">
            <div className="flex items-start gap-2 bg-orange-500/10 border border-orange-500/20 rounded-lg p-3 mb-2">
              <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-orange-200/90 leading-relaxed">
                Running this AI analysis will consume your system credits. <br/>
                <span className="font-semibold text-orange-300">
                  Estimated Cost: {analysisTarget === 'bulk' ? `${selectedIds.size} Credits` : "1 Credit"}
                </span>
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">1. Select AI Template</label>
              <Select value={analysisTemplate} onValueChange={setAnalysisTemplate}>
                <SelectTrigger className="w-full rounded-xl glass border-border/50">
                  <SelectValue placeholder="Choose a template..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.templateName} value={t.templateName}>{t.templateName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="text-xs text-muted-foreground flex items-center justify-between mt-1 px-1">
                <span>Select the blueprint for extracting insights.</span>
                <Link href="/templates" className="text-orange-400 hover:text-orange-300 flex items-center gap-1 font-medium">
                  <Plus className="h-3 w-3" /> Add Template
                </Link>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-border/20">
              <button
                onClick={() => setShowCustomInput(!showCustomInput)}
                className="flex items-center justify-between w-full text-sm font-medium hover:text-orange-400 transition-colors"
              >
                <span>2. Additional Instructions (Optional)</span>
                {showCustomInput ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <Plus className="h-4 w-4 text-muted-foreground" />}
              </button>

              {showCustomInput && (
                <div className="animate-in slide-in-from-top-2 duration-200 mt-2">
                  <Textarea
                    placeholder="E.g., 'Focus specifically on how they script their hooks' or 'Look for the underlying product being sold.'"
                    value={customInstructions}
                    onChange={(e) => setCustomInstructions(e.target.value)}
                    className="min-h-[100px] resize-none rounded-xl glass border-border/50 text-sm focus-visible:ring-orange-500/50"
                  />
                  <p className="text-[10px] sm:text-xs text-muted-foreground mt-2 px-1">
                    These instructions will be appended to your active template for this run only.
                  </p>
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setAnalysisTarget(null)} className="rounded-xl">
              Cancel
            </Button>
            <Button
              disabled={!analysisTemplate}
              onClick={confirmAnalysis}
              className="rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white shadow-lg shadow-orange-500/25 border-none"
            >
              <Zap className="h-4 w-4 mr-1.5 fill-current" />
              {analysisTarget === 'bulk' ? `Run ${selectedIds.size} Videos` : 'Start Analysis'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
