"use client";

import { useEffect, useState, useMemo } from "react";
import { Film, Sparkles, Wand2, CheckCircle2, RotateCcw, Play, Heart, MessageCircle, X, CheckSquare, Square, ChevronRight, Layers, ArrowRight, History, Calendar, User, Eye, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { MarkdownContent } from "@/components/markdown-content";
import { toast } from "sonner";
import { handleCatchError, classifyError } from "@/lib/error-utils";
import { ConfirmCreditModal } from "@/components/ui/confirm-credit-modal";
import type { Video } from "@/lib/types";

function formatViews(n: number): string {
  if (n === undefined || n === null) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toString();
}

export default function ContentMixPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [mixCount, setMixCount] = useState<2 | 3>(2);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [confirmMerge, setConfirmMerge] = useState(false);
  const { token, setShowCreditModal } = useAuth();

  const fetchVideos = () => {
    fetch("/api/videos?onlyAnalyzed=true", {
      headers: token ? { "Authorization": `Bearer ${token}` } : {}
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
            starred: p.starred
          })));
        }
      });
  };

  const fetchHistory = () => {
    fetch("/api/content-mix", {
      headers: token ? { "Authorization": `Bearer ${token}` } : {}
    }).then((r) => r.json()).then(setHistory);
  };

  useEffect(() => {
    fetchVideos();
    fetchHistory();
  }, []);

  const toggleVideo = (id: string) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(i => i !== id);
      if (prev.length >= mixCount) return prev; // Don't allow more than mixCount
      return [...prev, id];
    });
  };

  const handleMerge = async () => {
    if (selectedIds.length !== mixCount) return;
    
    setLoading(true);
    setError(null);
    setResult(null);
    
    const selectedVideos = videos.filter(v => selectedIds.includes(v.id || v.link));
    
    try {
      const response = await fetch("/api/content-mix", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ videos: selectedVideos }),
      });
      
      const data = await response.json();
      if (!response.ok) {
        if (data.code === "INSUFFICIENT_CREDITS" || data.error?.toLowerCase().includes("credits") || data.error?.toLowerCase().includes("insufficient")) {
          toast.error("Insufficient credits. Please upgrade your plan.");
          setShowCreditModal(true);
          setLoading(false);
          return;
        }
        throw new Error(data.error || "Synthesis failed");
      }
      
      setResult(data.mixedConcept);
      fetchHistory();
    } catch (err: any) {
      const classified = classifyError({ message: err.message });
      setError(`${classified.icon} ${classified.title}: ${classified.description}`);
      if (classified.action === "credits") setShowCreditModal(true);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setSelectedIds([]);
    setResult(null);
    setError(null);
  };

  const isReady = selectedIds.length === mixCount;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Content Mix</h1>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
            Synthesize the best strategies from multiple viral reels into a new hybrid concept
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setShowHistory(!showHistory)} 
            className={`flex-1 sm:flex-none gap-2 text-[10px] sm:text-xs h-8 sm:h-8 rounded-xl border-border/50 ${showHistory ? "bg-orange-500/10 border-orange-500/30 text-orange-300" : ""}`}
          >
            <History className="h-3.5 w-3.5" />
            {showHistory ? "Back to Mix" : "View History"}
          </Button>

          {(result || selectedIds.length > 0) && !loading && (
            <Button variant="ghost" size="sm" onClick={reset} className="flex-1 sm:flex-none gap-2 text-[10px] sm:text-xs h-8">
              <RotateCcw className="h-3.5 w-3.5" />
              Clear & Reset
            </Button>
          )}
        </div>
      </div>

      {showHistory ? (
        /* History Section */
        <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
           {history.length === 0 ? (
             <div className="glass rounded-2xl p-12 text-center">
                <History className="mx-auto h-10 w-10 text-muted-foreground/30 mb-4" />
                <h3 className="font-semibold text-lg">No history yet</h3>
                <p className="text-sm text-muted-foreground mt-1">Generate your first content mix to see it here.</p>
                <Button onClick={() => setShowHistory(false)} className="mt-6 rounded-xl" variant="outline">
                   Start Mixing
                </Button>
             </div>
           ) : (
             <div className="grid gap-6">
                {history.map((item) => (
                  <div key={item.id} className="glass rounded-2xl overflow-hidden border-border/50 flex flex-col md:flex-row">
                     <div className="p-6 flex-1 space-y-4">
                        <div className="flex items-start justify-between">
                           <div>
                              <div className="flex items-center gap-2 mb-1">
                                 <Badge className="bg-orange-500/10 text-orange-300 border-orange-500/20 rounded-full">Saved #{item.id}</Badge>
                                 <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    {new Date(item.createdAt).toLocaleDateString()}
                                 </span>
                              </div>
                              <h3 className="text-lg font-bold">Hybrid Strategy Concept</h3>
                           </div>
                           <div className="flex -space-x-3">
                              {(item.sourceVideos || []).map((v: any, i: number) => (
                                 <div key={i} className="h-10 w-8 rounded-md border border-background overflow-hidden relative shadow-lg">
                                    <img 
                                       src={`/api/proxy-image?url=${encodeURIComponent(v.thumbnail || "")}`} 
                                       alt="" 
                                       className="h-full w-full object-cover"
                                    />
                                 </div>
                              ))}
                           </div>
                        </div>
                        
                        <div className="bg-foreground/[0.02] rounded-xl p-6 border border-border/40">
                           <div className="prose prose-invert prose-sm max-w-none">
                              <MarkdownContent content={item.mixedConcept} variant="concepts" />
                           </div>
                        </div>
                     </div>
                  </div>
                ))}
             </div>
           )}
        </div>
      ) : !result ? (
        <div className="space-y-8">
          {/* Step 1: Select Count */}
          <div className="glass rounded-2xl p-6 border-border relative overflow-hidden shadow-md">
             <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
                <Layers className="h-48 w-48" />
             </div>
             
             <div className="relative z-10 space-y-6">
                <div className="flex items-center gap-2.5">
                  <div className="bg-orange-500/20 p-2 rounded-lg">
                    <Wand2 className="h-4 w-4 text-orange-400" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold">Step 1: Choose Mix Mode</h2>
                    <p className="text-[11px] text-muted-foreground">How many viral elements would you like to fuse?</p>
                  </div>
                </div>

                <div className="flex gap-3">
                  {[2, 3].map((count) => (
                    <button
                      key={count}
                      onClick={() => { setMixCount(count as 2 | 3); setSelectedIds([]); }}
                      className={`flex-1 flex flex-col items-center justify-center p-4 rounded-xl border transition-all duration-300 ${
                        mixCount === count 
                          ? "bg-orange-500/10 border-orange-500/40 text-orange-700 dark:text-orange-200 glow-sm" 
                          : "glass border-border text-muted-foreground hover:border-border shadow-sm"
                      }`}
                    >
                      <span className="text-2xl font-bold">{count}</span>
                      <span className="text-[10px] uppercase tracking-wider font-medium opacity-60">Videos Mix</span>
                    </button>
                  ))}
                </div>
             </div>
          </div>

          {/* Step 2: Selection Grid */}
          <div className="space-y-4">
             <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between px-2">
                <div className="flex items-center gap-2">
                   <h2 className="text-sm font-semibold">Step 2: Select {mixCount} Videos</h2>
                   <Badge variant="secondary" className="rounded-lg px-2 py-0.5 text-[10px] bg-muted/60 border border-border">
                      {selectedIds.length} / {mixCount}
                   </Badge>
                </div>
                
                <Button 
                   onClick={() => setConfirmMerge(true)}
                   disabled={!isReady || loading}
                   className="w-full sm:w-auto h-10 sm:h-9 px-6 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 border-0 glow-sm disabled:opacity-30 transition-all font-semibold text-xs gap-2"
                >
                  {loading ? (
                    <>
                      <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                      Synthesizing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" />
                      Merge Concepts
                      <ArrowRight className="h-3.5 w-3.5 ml-1" />
                    </>
                  )}
                </Button>
             </div>

             <div className="grid gap-3 grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
               {videos.map((video) => {
                 const id = video.id || video.link;
                 const isSelected = selectedIds.includes(id);
                 const isDisabled = !isSelected && selectedIds.length >= mixCount;

                 return (
                   <div 
                     key={id} 
                     onClick={() => !isDisabled && toggleVideo(id)}
                     className={`group relative glass rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 border ${
                       isSelected 
                         ? "border-orange-500/50 ring-1 ring-orange-500/20 glow-sm" 
                         : isDisabled 
                         ? "opacity-30 grayscale pointer-events-none" 
                         : "border-border shadow-sm hover:border-orange-500/30 transition-shadow"
                     }`}
                   >
                     <div className="relative aspect-[9/16] w-full bg-foreground/[0.02] overflow-hidden">
                       {video.thumbnail ? (
                         // eslint-disable-next-line @next/next/no-img-element
                         <img
                           src={`/api/proxy-image?url=${encodeURIComponent(video.thumbnail)}`}
                           alt={`@${video.creator}`}
                           className="absolute inset-0 h-full w-full object-cover grayscale-[0.3] group-hover:grayscale-0 transition-transform duration-500 group-hover:scale-105"
                         />
                       ) : (
                         <div className="flex h-full items-center justify-center">
                            <Film className="h-10 w-10 text-muted-foreground/20" />
                         </div>
                       )}

                       {/* Selection Overlay */}
                       <div className="absolute top-3 left-3 z-20">
                          {isSelected ? (
                            <div className="bg-orange-500 text-white rounded-md p-1 shadow-lg border border-white/20 animate-in zoom-in duration-200">
                               <CheckCircle2 className="h-4 w-4" />
                            </div>
                          ) : (
                            <div className="bg-background/40 backdrop-blur-md text-foreground/50 rounded-md h-6 w-6 flex items-center justify-center border border-border/40 group-hover:border-border transition-all">
                               <Square className="h-4 w-4" />
                            </div>
                          )}
                       </div>

                       {/* Views overlay — Instagram style */}
                       <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent pt-8 pb-3 px-3">
                          <div className="flex items-center gap-1.5">
                             <Play className="h-4 w-4 text-white fill-white" />
                             <span className="text-[15px] font-bold text-white">
                                {formatViews(video.views)}
                             </span>
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                             <p className="text-xs font-semibold text-white/90 truncate">@{video.creator}</p>
                          </div>
                       </div>
                     </div>
                     
                     {/* Info Bar below */}
                     <div className="p-3 space-y-2 border-t border-border/20">
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                           <span className="inline-flex items-center gap-1">
                              <Heart className="h-3 w-3" />
                              {formatViews(video.likes)}
                           </span>
                           <span className="inline-flex items-center gap-1">
                              <MessageCircle className="h-3 w-3" />
                              {formatViews(video.comments)}
                           </span>
                        </div>
                        <Badge variant="secondary" className="rounded-md text-[10px] bg-muted/60 border border-border text-muted-foreground w-full justify-center">
                           {video.templateName}
                        </Badge>
                     </div>
                   </div>
                 );
               })}
             </div>
          </div>
        </div>
      ) : (
        /* Step 3: Results Display */
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-700">
           {/* Summary Header */}
           <div className="flex flex-col sm:flex-row items-center sm:items-end gap-4 glass-strong rounded-2xl p-4 sm:p-6 border-border relative shadow-lg">
              <div className="flex -space-x-3 mb-2 sm:mb-0">
                 {videos.filter(v => selectedIds.includes(v.id || v.link)).map((v, i) => (
                    <div key={i} className="h-14 w-10 sm:h-16 sm:w-12 rounded-lg border-2 border-background overflow-hidden relative shadow-xl">
                       <img 
                          src={`/api/proxy-image?url=${encodeURIComponent(v.thumbnail)}`} 
                          alt="" 
                          className="h-full w-full object-cover"
                       />
                       <div className="absolute inset-0 bg-orange-500/20" />
                    </div>
                 ))}
              </div>
              <div className="flex-1 text-center sm:text-left">
                 <Badge className="bg-orange-500/10 text-orange-300 border-orange-500/20 rounded-full mb-2">Hybrid Concept Generated</Badge>
                 <h2 className="text-lg sm:text-x font-bold text-foreground/90">Successfully Synced {mixCount} Strategies</h2>
              </div>
              <Button variant="outline" size="sm" onClick={reset} className="w-full sm:w-auto rounded-xl border-border/50 text-xs h-9">
                 New Mix
                 <RotateCcw className="ml-2 h-3 w-3" />
              </Button>
           </div>

           <div className="glass rounded-3xl p-8 border-border shadow-xl overflow-hidden relative">
              {/* Artistic flare */}
              <div className="absolute -top-32 -right-32 h-64 w-64 bg-orange-500/10 rounded-full blur-[100px]" />
              <div className="absolute -bottom-32 -left-32 h-64 w-64 bg-orange-500/10 rounded-full blur-[100px]" />
              
              <div className="relative z-10 prose prose-invert prose-sm max-w-none">
                 <MarkdownContent content={result} variant="concepts" />
              </div>
           </div>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-red-400/5 border border-red-400/10 text-red-400 text-sm flex items-center gap-3">
           <X className="h-4 w-4" />
           {error}
        </div>
      )}

      <ConfirmCreditModal
        open={confirmMerge}
        onOpenChange={setConfirmMerge}
        onConfirm={() => {
          setConfirmMerge(false);
          handleMerge();
        }}
        title="Merge Concepts"
        description="This will use AI to synthesize the selected viral videos into a single new hybrid concept."
        creditCost="1 Credit"
        confirmText="Confirm Merge"
      />
    </div>
  );
}
