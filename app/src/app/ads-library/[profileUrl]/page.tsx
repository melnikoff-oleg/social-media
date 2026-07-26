"use client";

import { useEffect, useState, use, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/context/auth-context";
import {
  ArrowLeft, Loader2, PlayCircle, Image as ImageIcon, Copy, ExternalLink,
  Facebook, Sparkles, BarChart3, CheckCircle2, RefreshCw, FileText,
  Brain, ChevronDown, ChevronUp, AlertCircle, Eye, Film,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { handleCatchError, handleSSEError, classifyError } from "@/lib/error-utils";
import { ConfirmCreditModal } from "@/components/ui/confirm-credit-modal";

// ─── Simple Markdown renderer (shared with reports) ───────────────────────────
function renderMarkdown(md: string): string {
  if (!md) return "";
  let html = md
    // headings
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-bold mt-5 mb-1.5 text-foreground">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold mt-6 mb-2 text-foreground border-b border-border/40 pb-1">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold mt-7 mb-2.5 text-violet-500 dark:text-violet-300">$1</h1>')
    // bold + italic
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>')
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // HR
    .replace(/^---$/gm, '<hr class="border-border/30 my-5">')
    // blockquote
    .replace(/^> (.+)$/gm, '<blockquote class="border-l-2 border-violet-500/50 pl-3 text-muted-foreground italic my-2">$1</blockquote>')
    // bullet lists
    .replace(/^\s*[-*] (.+)$/gm, '<li class="ml-4 list-disc text-foreground/85 mb-0.5">$1</li>')
    .replace(/^\s*\d+\. (.+)$/gm, '<li class="ml-4 list-decimal text-foreground/85 mb-0.5">$1</li>')
    // paragraphs (double newline)
    .replace(/\n\n/g, "</p><p class='mb-3 text-foreground/80 leading-relaxed'>")
    // wrap list items
    .replace(/(<li.*<\/li>(\n|$))+/g, (match) => `<ul class="mb-3 space-y-0.5">${match}</ul>`);

  return `<p class='mb-3 text-foreground/80 leading-relaxed'>${html}</p>`;
}

type AdAnalysisState = "idle" | "loading" | "done" | "error";

export default function ProfileAdsPage({ params }: { params: Promise<{ profileUrl: string }> }) {
  const resolvedParams = use(params);
  const profileUrl = decodeURIComponent(resolvedParams.profileUrl);

  const { token, setShowCreditModal } = useAuth();
  const router = useRouter();

  const [ads, setAds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterFormat, setFilterFormat] = useState<string>("ALL");
  const [sortDuration, setSortDuration] = useState<string>("NONE");
  // const [isMock, setIsMock] = useState(false);
  const [report, setReport] = useState<any>(null);

  // Per-ad analysis state: Map<adArchiveId, state>
  const [adAnalysisStatus, setAdAnalysisStatus] = useState<Record<string, AdAnalysisState>>({});
  // Per-ad analysis content: Map<adArchiveId, markdown>
  const [adAnalysisContent, setAdAnalysisContent] = useState<Record<string, string>>({});
  // Per-ad expanded panel
  const [adAnalysisExpanded, setAdAnalysisExpanded] = useState<Record<string, boolean>>({});
  // Per-ad error message
  const [adAnalysisError, setAdAnalysisError] = useState<Record<string, string>>({});

  const [confirmBatchAnalysis, setConfirmBatchAnalysis] = useState(false);
  const [confirmSingleAnalysisId, setConfirmSingleAnalysisId] = useState<string | null>(null);

  const adsRef = useRef<any[]>([]);
  adsRef.current = ads;

  // Load ads + report + batch analysis status
  useEffect(() => {
    if (!token) return;

    // Load ads
    fetch(`/api/facebook-ads/profiles/${encodeURIComponent(profileUrl)}/ads`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then(async (data) => {
        if (!Array.isArray(data)) return;
        setAds(data);

        // Batch-load analysis status for video ads only
        const videoAdIds: string[] = data
          .filter((ad: any) => ad.displayFormat === "VIDEO" && ad.isActive)
          .map((ad: any) => ad.adArchiveId);

        if (videoAdIds.length > 0) {
          try {
            const statusRes = await fetch(`/api/facebook-ads/ads/batch-analysis-status`, {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ adArchiveIds: videoAdIds }),
            });
            const statusData = await statusRes.json();

            const newStatus: Record<string, AdAnalysisState> = {};
            for (const id of videoAdIds) {
              newStatus[id] = statusData[id]?.hasAnalysis ? "done" : "idle";
            }
            setAdAnalysisStatus(newStatus);
          } catch {
            // Non-critical — just leave all as idle
          }
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));

    // Load report status
    fetch(`/api/facebook-ads/report?profileUrl=${encodeURIComponent(profileUrl)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => { if (data.report) setReport(data.report); })
      .catch(() => { });
  }, [token, profileUrl]);

  const handleAnalyse = () => {
    router.push(`/ads-library/${encodeURIComponent(profileUrl)}/analysing?mock=false`);
  };

  const getRunningDays = (ad: any) => {
    if (!ad.startDate) return 0;
    const start = new Date(ad.startDate).getTime();
    let end = Date.now();
    if (ad.endDate && !ad.isActive) {
      const parsedEnd = new Date(ad.endDate).getTime();
      if (parsedEnd < end) end = parsedEnd;
    }
    return Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
  };

  let processedAds = ads
    .filter((ad) => {
      if (!ad.isActive) return false;
      if (filterFormat !== "ALL") {
        if (filterFormat === "DCA") {
          if (ad.displayFormat !== "DCA" && ad.displayFormat !== "DCO") return false;
        } else if (ad.displayFormat !== filterFormat) return false;
      }
      return true;
    })
    .map((ad) => ({ ...ad, runningDays: getRunningDays(ad) }));

  if (sortDuration === "DESC") processedAds.sort((a, b) => b.runningDays - a.runningDays);
  else if (sortDuration === "ASC") processedAds.sort((a, b) => a.runningDays - b.runningDays);
  else processedAds.sort((a, b) => new Date(b.startDate || 0).getTime() - new Date(a.startDate || 0).getTime());

  const getMediaUrl = (ad: any) => {
    if (ad.displayFormat === "VIDEO" && ad.videos && ad.videos.length > 0) {
      return ad.videos[0].videoHdUrl || ad.videos[0].videoSdUrl || null;
    }
    if (ad.images && ad.images.length > 0) {
      return ad.images[0].originalImageUrl || ad.images[0].resizedImageUrl || null;
    }
    return null;
  };

  const getPreviewUrl = (ad: any) => {
    if (ad.displayFormat === "VIDEO" && ad.videos && ad.videos.length > 0) {
      return ad.videos[0].videoPreviewImageUrl || null;
    }
    return getMediaUrl(ad);
  };

  // ─── Per-Ad: Trigger analysis ──────────────────────────────────────────────
  const handleAnalyzeAd = useCallback(async (adArchiveId: string) => {
    setAdAnalysisStatus((prev) => ({ ...prev, [adArchiveId]: "loading" }));
    setAdAnalysisError((prev) => ({ ...prev, [adArchiveId]: "" }));

    try {
      const res = await fetch(`/api/facebook-ads/ads/${encodeURIComponent(adArchiveId)}/analyze-stream`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const errText = await res.text();
        let errData: any = {};
        try { errData = JSON.parse(errText); } catch { errData = { message: errText }; }
        throw new Error(errData.message || errData.error || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === "ping") {
              continue;
            } else if (evt.type === "done") {
              setAdAnalysisContent((prev) => ({ ...prev, [adArchiveId]: evt.analysis }));
              setAdAnalysisStatus((prev) => ({ ...prev, [adArchiveId]: "done" }));
              setAdAnalysisExpanded((prev) => ({ ...prev, [adArchiveId]: true }));
            } else if (evt.type === "error") {
              throw new Error(evt.message || evt.error || "Analysis failed");
            }
          } catch (e: any) {
            if (e.message && e.message !== "Unexpected end of JSON input" && !e.message.includes("Unexpected end of JSON")) {
              throw e;
            }
          }
        }
      }
    } catch (err: any) {
      const classified = classifyError({ message: err.message });
      if (classified.action === "credits") {
        setShowCreditModal(true);
      }
      toast.error(`${classified.icon} ${classified.title}`, {
        description: classified.description,
        duration: classified.duration,
      });
      setAdAnalysisStatus((prev) => ({ ...prev, [adArchiveId]: "error" }));
      setAdAnalysisError((prev) => ({ ...prev, [adArchiveId]: classified.description }));
    }
  }, [token, setShowCreditModal]);

  // ─── Per-Ad: Load analysis and open Dialog ────────────────────────────────
  const handleToggleAnalysis = useCallback(async (adArchiveId: string) => {
    setAdAnalysisExpanded((prev) => ({ ...prev, [adArchiveId]: true }));

    if (!adAnalysisContent[adArchiveId]) {
      // Lazy-load the content
      try {
        const res = await fetch(`/api/facebook-ads/ads/${encodeURIComponent(adArchiveId)}/analysis`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.analysis) {
          setAdAnalysisContent((prev) => ({ ...prev, [adArchiveId]: data.analysis }));
        }
      } catch {
        toast.error("⚠️ Failed to load analysis", {
          description: "Could not fetch the saved analysis. Please try again.",
          duration: 4000,
        });
      }
    }
  }, [token, adAnalysisContent]);

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/ads-library" className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground transition-colors mb-4">
            <ArrowLeft className="mr-1 h-3 w-3" /> Back to Library
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/20 border border-blue-500/30 text-blue-400">
              <Facebook className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Ads for Profile</h1>
              <p className="mt-1 text-xs text-muted-foreground break-all max-w-xl">{profileUrl}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 items-end">
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-blue-500/10 text-blue-300 border-blue-500/20 px-3 py-1.5 text-sm">
              Total Active Ads: {ads.filter((a) => a.isActive).length}
            </Badge>
          </div>

          {/* Analyse Button */}
          <div className="flex items-center gap-3">
            {report ? (
              <>
                <Button asChild className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 text-white font-semibold shadow-lg shadow-violet-500/20 px-5">
                  <Link href={`/ads-library/${encodeURIComponent(profileUrl)}/report`}>
                    <FileText className="mr-2 h-4 w-4" /> View Report
                  </Link>
                </Button>
                <Button onClick={() => setConfirmBatchAnalysis(true)} variant="outline" className="border-violet-500/30 text-violet-300 hover:bg-violet-500/10">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <Button onClick={() => setConfirmBatchAnalysis(true)} className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 text-white font-semibold shadow-lg shadow-violet-500/20 px-5">
                <><BarChart3 className="mr-2 h-4 w-4" /> Analyse Ads</>
              </Button>
            )}
          </div>

          {report && (
            <div className="text-xs text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="h-3 w-3" />
              {report.isMock ? "Mock report" : "AI report"} — {new Date(report.generatedAt).toLocaleDateString()}
              {" · "}
              <Link href={`/ads-library/${encodeURIComponent(profileUrl)}/report`} className="underline hover:text-emerald-300">
                View Report →
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 bg-muted/40 p-4 rounded-xl border border-border/50">
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider mr-2 self-center">Format</span>
          {(["ALL", "VIDEO", "IMAGE", "DPA", "DCA"] as const).map((fmt) => (
            <button
              key={fmt}
              onClick={() => setFilterFormat(fmt)}
              className={[
                "inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-sm font-medium transition-colors",
                filterFormat === fmt
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "border border-border bg-transparent text-foreground hover:bg-muted",
              ].join(" ")}
            >
              {fmt === "VIDEO" && <PlayCircle className="h-3.5 w-3.5" />}
              {fmt === "IMAGE" && <ImageIcon className="h-3.5 w-3.5" />}
              {fmt === "ALL" ? "All" : fmt}
            </button>
          ))}
        </div>

        <div className="w-px h-6 bg-border mx-2 hidden sm:block" />

        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider mr-2 self-center">Duration</span>
          {(["NONE", "DESC", "ASC"] as const).map((dur) => (
            <button
              key={dur}
              onClick={() => setSortDuration(dur)}
              className={[
                "inline-flex items-center h-8 px-3 rounded-md text-sm font-medium transition-colors",
                sortDuration === dur
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "border border-border bg-transparent text-foreground hover:bg-muted",
              ].join(" ")}
            >
              {dur === "NONE" ? "Default" : dur === "DESC" ? "Longest Running" : "Shortest Running"}
            </button>
          ))}
        </div>
      </div>

      {/* Ad Grid */}
      <div className="grid gap-6 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        {processedAds.map((ad) => {
          const preview = getPreviewUrl(ad);
          const media = getMediaUrl(ad);
          const isVideo = ad.displayFormat === "VIDEO" && !!media;
          const analysisState = adAnalysisStatus[ad.adArchiveId] ?? "idle";
          const isExpanded = adAnalysisExpanded[ad.adArchiveId] ?? false;
          const analysisText = adAnalysisContent[ad.adArchiveId] ?? "";
          const analysisErr = adAnalysisError[ad.adArchiveId] ?? "";

          return (
            <div key={ad.adArchiveId} className="group glass rounded-2xl overflow-hidden border border-border/50 hover:border-blue-500/30 transition-all duration-300 flex flex-col">
              {/* Media Header */}
              {(isVideo ? !!media : !!preview) && (
                <div className="relative aspect-[4/5] bg-muted/30 flex items-center justify-center overflow-hidden border-b border-border/40">
                  {isVideo && media ? (
                    <>
                      {preview && (
                        <img
                          src={`/api/proxy-image?url=${encodeURIComponent(preview)}`}
                          alt="Ad Preview Blur"
                          className="absolute inset-0 w-full h-full object-cover blur-md opacity-30"
                        />
                      )}
                      <video
                        src={media}
                        controls
                        poster={preview ? `/api/proxy-image?url=${encodeURIComponent(preview)}` : undefined}
                        className="relative z-10 w-full h-full object-contain"
                      />
                    </>
                  ) : (
                    <>
                      <img
                        src={`/api/proxy-image?url=${encodeURIComponent(preview!)}`}
                        alt="Ad Preview Blur"
                        className="absolute inset-0 w-full h-full object-cover blur-md opacity-30"
                      />
                      <img
                        src={`/api/proxy-image?url=${encodeURIComponent(preview!)}`}
                        alt="Ad Content"
                        className="relative z-10 max-h-full max-w-full object-contain"
                      />
                    </>
                  )}

                  <div className="absolute top-3 right-3 z-30 flex gap-2">
                    <Badge className="bg-background/80 backdrop-blur-md border-border/40 text-foreground font-medium shadow-sm">
                      {ad.runningDays} {ad.runningDays === 1 ? "Day" : "Days"}
                    </Badge>
                    {ad.displayFormat && (
                      <Badge variant="secondary" className="bg-background/80 backdrop-blur-md border-border/40 font-medium shadow-sm">
                        {ad.displayFormat}
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              {/* Content Body */}
              <div className="p-5 flex-1 flex flex-col">
                {/* Format badge row when no media header */}
                {!(isVideo ? !!media : !!preview) && (
                  <div className="flex gap-2 mb-3">
                    <Badge className="bg-muted text-muted-foreground border-border/60 font-medium">
                      {ad.runningDays} {ad.runningDays === 1 ? "Day" : "Days"}
                    </Badge>
                    {ad.displayFormat && (
                      <Badge variant="secondary" className="font-medium">{ad.displayFormat}</Badge>
                    )}
                  </div>
                )}

                <div className="flex items-start gap-3 mb-4">
                  {ad.snapshot?.pageProfilePictureUrl ? (
                    <img
                      src={`/api/proxy-image?url=${encodeURIComponent(ad.snapshot.pageProfilePictureUrl)}`}
                      alt={ad.pageName || "Page"}
                      className="h-10 w-10 rounded-full border border-border/50"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center border border-border/50">
                      <Facebook className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{ad.pageName || "Unknown Page"}</p>
                    <p className="text-[10px] text-muted-foreground truncate">Started: {new Date(ad.startDate).toLocaleDateString()}</p>
                  </div>
                </div>

                <div className="text-sm text-foreground/90 whitespace-pre-wrap line-clamp-6 mb-4 flex-1">
                  {ad.bodyText || <span className="text-muted-foreground italic">No ad copy text provided.</span>}
                </div>

                <div className="mt-auto pt-3 border-t border-border/40 space-y-3">
                  {/* Destination link */}
                  {ad.linkUrl ? (
                    <div className="flex items-center justify-between bg-muted/30 p-3 rounded-xl border border-border/40">
                      <div className="flex flex-col min-w-0 mr-3">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Destination</span>
                        <span className="text-xs text-foreground/80 truncate font-medium mt-0.5">
                          {ad.linkUrl.replace(/^(?:https?:\/\/)?(?:www\.)?/i, "").split("/")[0]}
                        </span>
                      </div>
                      <Button asChild className="shrink-0 h-9 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs capitalize px-4">
                        <a href={ad.linkUrl} target="_blank" rel="noopener noreferrer">
                          {ad.ctaText ? ad.ctaText.replace(/_/g, " ") : "Visit Link"}
                        </a>
                      </Button>
                    </div>
                  ) : ad.ctaText ? (
                    <div className="flex justify-between items-center bg-muted/30 p-2.5 rounded-lg border border-border/40">
                      <span className="text-xs text-muted-foreground">Call to Action</span>
                      <span className="text-xs font-semibold text-blue-400 capitalize">{ad.ctaText.replace(/_/g, " ")}</span>
                    </div>
                  ) : null}

                  {/* Action buttons row */}
                  <div className="flex gap-2 flex-wrap">
                    {media && (
                      <Button variant="secondary" asChild className="flex-1 h-8 text-[11px]">
                        <a href={media} target="_blank" rel="noopener noreferrer">
                          Source Media <ExternalLink className="ml-1.5 h-2.5 w-2.5" />
                        </a>
                      </Button>
                    )}
                    {ad.linkUrl && (
                      <Button
                        onClick={() => { navigator.clipboard.writeText(ad.linkUrl); }}
                        variant="outline"
                        className="flex-1 h-8 text-[11px] border-border/50"
                      >
                        Copy Link <Copy className="ml-1.5 h-2.5 w-2.5" />
                      </Button>
                    )}
                  </div>

                  {/* ── Per-Ad Analyze / View Analysis (VIDEO only) ── */}
                  {isVideo && (
                    <div className="space-y-2">
                      {analysisState === "idle" && (
                        <Button
                          onClick={() => setConfirmSingleAnalysisId(ad.adArchiveId)}
                          className="w-full h-9 bg-gradient-to-r from-violet-600 to-orange-600 hover:from-violet-700 hover:to-orange-700 text-white text-xs font-semibold shadow-md shadow-violet-500/20"
                        >
                          <Brain className="mr-1.5 h-3.5 w-3.5" />
                          Analyze This Ad
                        </Button>
                      )}

                      {analysisState === "loading" && (
                        <div className="w-full h-9 flex items-center justify-center gap-2 rounded-lg bg-violet-500/10 border border-violet-500/20 text-xs text-violet-300">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Uploading & Analyzing with Gemini…</span>
                        </div>
                      )}

                      {analysisState === "error" && (
                        <div className="space-y-1.5">
                          <div className="w-full flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 p-2.5">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{analysisErr || "Analysis failed"}</span>
                          </div>
                          <Button
                            onClick={() => setConfirmSingleAnalysisId(ad.adArchiveId)}
                            variant="outline"
                            className="w-full h-8 text-[11px] border-violet-500/30 text-violet-300 hover:bg-violet-500/10"
                          >
                            <RefreshCw className="mr-1.5 h-3 w-3" /> Retry
                          </Button>
                        </div>
                      )}

                      {analysisState === "done" && (
                        <div className="flex gap-2">
                          <Button
                            onClick={() => handleToggleAnalysis(ad.adArchiveId)}
                            className="flex-1 h-9 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-semibold"
                          >
                            <Eye className="mr-1.5 h-3.5 w-3.5" />
                            View Analysis
                          </Button>
                          <Button
                            onClick={() => handleAnalyzeAd(ad.adArchiveId)}
                            variant="outline"
                            size="sm"
                            className="h-9 px-3 border-violet-500/30 text-violet-300 hover:bg-violet-500/10"
                            title="Re-analyze"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Popup Analysis Dialog ────────────────────────────────── */}
              {isVideo && analysisState === "done" && (
                <Dialog
                  open={isExpanded}
                  onOpenChange={(open) => setAdAnalysisExpanded((prev) => ({ ...prev, [ad.adArchiveId]: open }))}
                >
                  <DialogContent className="w-[95vw] sm:max-w-4xl max-h-[90vh] overflow-hidden glass-strong rounded-2xl border-violet-500/30 p-0 gap-0 shadow-2xl shadow-violet-500/10">
                    <DialogTitle className="sr-only">
                      Ad Analysis
                    </DialogTitle>

                    <div className="flex flex-col sm:flex-row items-center sm:items-center gap-4 p-4 sm:p-5 border-b border-border/20 bg-violet-500/[0.02]">
                      <div className="relative h-20 w-16 sm:h-16 sm:w-16 shrink-0 rounded-lg overflow-hidden bg-foreground/[0.02] shadow-lg flex items-center justify-center">
                        {getPreviewUrl(ad) ? (
                          <img
                            src={`/api/proxy-image?url=${encodeURIComponent(getPreviewUrl(ad))}`}
                            alt={ad.pageName}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <Film className="h-6 w-6 text-violet-500/50" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 text-center sm:text-left">
                        <div className="flex items-center justify-center sm:justify-start gap-2">
                          <p className="text-sm font-semibold">{ad.pageName}</p>
                          {ad.snapshot_url && (
                            <a
                              href={ad.snapshot_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-violet-400 transition-colors"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                        <div className="mt-1 flex items-center justify-center sm:justify-start gap-3 text-xs text-foreground/70">
                          <span className="inline-flex items-center gap-1">
                            <span className="font-medium text-foreground">Started: {new Date(ad.startDate).toLocaleDateString()}</span>
                          </span>
                        </div>
                      </div>

                      {/* Section toggle & Retry button */}
                      <div className="flex items-center gap-1.5 w-full sm:w-auto mt-2 sm:mt-0">
                        <div className="flex gap-1.5 flex-1 sm:flex-none">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="flex-1 sm:flex-none rounded-xl text-xs h-8 gap-1.5 transition-all duration-200 bg-violet-500/10 text-violet-600 border border-violet-500/20 dark:bg-violet-500/20 dark:text-violet-300 dark:border-violet-500/40 shadow-lg shadow-violet-500/10 pointer-events-none"
                          >
                            <Brain className="h-3 w-3" />
                            Analysis
                          </Button>
                          <div className="w-px h-4 bg-border/40 mx-0.5" />
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Re-run Analysis"
                            onClick={() => { setAdAnalysisExpanded((prev) => ({ ...prev, [ad.adArchiveId]: false })); handleAnalyzeAd(ad.adArchiveId); }}
                            className="rounded-xl text-foreground/40 hover:text-violet-400 hover:bg-violet-500/10 h-8 w-8 p-0"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Modal body — scrollable */}
                    <div className="overflow-y-auto max-h-[calc(90vh-100px)] p-6 custom-scrollbar">
                      {analysisText ? (
                        <div
                          className="prose-sm sm:prose-base dark:prose-invert max-w-none text-foreground/90 
                            [&_h1]:text-violet-500 dark:[&_h1]:text-violet-400 [&_h1]:text-2xl [&_h1]:mt-0
                            [&_h2]:text-violet-600 dark:[&_h2]:text-violet-200 [&_h2]:border-b [&_h2]:border-border/30 [&_h2]:pb-2 [&_h2]:mt-8
                            [&_strong]:text-foreground"
                          dangerouslySetInnerHTML={{ __html: renderMarkdown(analysisText) }}
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center p-12 text-muted-foreground text-sm gap-3">
                          <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
                          <span>Fetching detailed analysis...</span>
                        </div>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          );
        })}

        {processedAds.length === 0 && (
          <div className="col-span-full glass rounded-2xl p-12 text-center flex flex-col items-center">
            <div className="h-16 w-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mb-4 border border-blue-500/20">
              <Sparkles className="h-8 w-8 text-blue-400" />
            </div>
            <h3 className="text-xl font-semibold">No ads found</h3>
            <p className="mt-2 text-sm text-muted-foreground max-w-md">
              We couldn't find any ads matching your current filters. If you haven't scraped any ads yet, go back to the library and start scraping.
            </p>
            <Button asChild className="mt-6 bg-blue-600 hover:bg-blue-700">
              <Link href="/ads-library">Back to Library</Link>
            </Button>
          </div>
        )}
      </div>

      {/* ── Report Action Banner ─────────────────────────────────────────────── */}
      {!report && (
        <div className="rounded-2xl border border-dashed border-violet-500/20 p-8 text-center flex flex-col items-center gap-4 bg-violet-500/[0.02]">
          <div className="h-12 w-12 rounded-2xl bg-violet-500/10 flex items-center justify-center border border-violet-500/20">
            <BarChart3 className="h-6 w-6 text-violet-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">No Intelligence Report Yet</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              Generate a full competitor AI report — creative strategy, spend estimation, funnel analysis, and competitive gaps.
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setConfirmBatchAnalysis(true)} className="bg-violet-600 hover:bg-violet-700 text-xs h-8">
              <BarChart3 className="mr-1.5 h-3.5 w-3.5" /> Generate AI Report
            </Button>
          </div>
        </div>
      )}

      {report && (
        <div className="rounded-2xl border border-violet-500/30 bg-violet-500/[0.05] p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-violet-500/20 flex items-center justify-center border border-violet-500/30 shrink-0">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {report.isMock ? "⚠️ Mock Report Ready" : "✦ AI Report Ready"}
              </p>
              <p className="text-xs text-muted-foreground">
                Generated {new Date(report.generatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleAnalyse}
              variant="outline"
              size="sm"
              className="border-violet-500/20 text-violet-300 hover:bg-violet-500/10 text-xs"
            >
              <RefreshCw className="mr-1.5 h-3 w-3" /> Regenerate
            </Button>
            <Button asChild size="sm" className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 text-white text-xs">
              <Link href={`/ads-library/${encodeURIComponent(profileUrl)}/report`}>
                <FileText className="mr-1.5 h-3 w-3" /> View Report
              </Link>
            </Button>
          </div>
        </div>
      )}

      <ConfirmCreditModal
        open={confirmBatchAnalysis}
        onOpenChange={setConfirmBatchAnalysis}
        onConfirm={() => {
          setConfirmBatchAnalysis(false);
          handleAnalyse();
        }}
        title="Generate Batch AI Report"
        description="This will analyze all active scraped ads for this profile to generate a comprehensive strategy report."
        creditCost="Multiple Credits (Depends on Ad volume)"
        confirmText="Confirm Batch Analysis"
      />

      <ConfirmCreditModal
        open={confirmSingleAnalysisId !== null}
        onOpenChange={(open) => !open && setConfirmSingleAnalysisId(null)}
        onConfirm={() => {
          if (confirmSingleAnalysisId) handleAnalyzeAd(confirmSingleAnalysisId);
          setConfirmSingleAnalysisId(null);
        }}
        title="Analyze Single Ad"
        description="This will use AI to perform a deep analysis of this specific ad's hook and strategy."
        creditCost="1 Credit"
        confirmText="Confirm Analysis"
      />
    </div>
  );
}
