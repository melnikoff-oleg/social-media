"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/auth-context";
import { toast } from "sonner";
import { handleCatchError, handleSSEError, classifyError } from "@/lib/error-utils";
import {
  ArrowLeft, Loader2, PlayCircle, Heart, MessageCircle,
  Eye, Sparkles, TrendingUp, Calendar, Zap, Instagram, Film, RefreshCw, Users
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { ConfirmCreditModal } from "@/components/ui/confirm-credit-modal";

type CreatorDetailed = {
  username: string;
  name?: string;
  category?: string;
  bio?: string;
  profilePicUrl?: string;
  followersCount: number;
  totalPosts: number;
  reelsCount30d: number;
  avgViews30d: number;
  engagementRate?: number;
  activeSince?: string;
  lastScrapedAt?: string;
  aiInsights?: any;
};

type Video = {
  postId: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  caption?: string;
  likesCount: number;
  commentsCount: number;
  videoPlayCount: number;
  timestamp?: string;
};

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString();
}

function formatDate(dateStr?: string) {
  if (!dateStr) return "Unknown";
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

export default function CreatorDetailPage({ params }: { params: Promise<{ username: string }> }) {
  const resolvedParams = use(params);
  const username = resolvedParams.username;
  const router = useRouter();
  const { token, setShowCreditModal } = useAuth();

  const [creator, setCreator] = useState<CreatorDetailed | null>(null);
  const [posts, setPosts] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [confirmAnalysis, setConfirmAnalysis] = useState(false);

  const loadData = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      // Fetch creator details
      const cRes = await fetch(`/api/creators/${username}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!cRes.ok) throw new Error("Failed to load creator");
      const cData = await cRes.json();
      setCreator(cData);

      // Fetch posts
      const pRes = await fetch(`/api/videos?username=${username}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (pRes.ok) {
        const pData = await pRes.json();
        setPosts(pData);
      }
    } catch (err: any) {
      handleCatchError(err, setShowCreditModal);
    } finally {
      setLoading(false);
    }
  }, [token, username]);

  useEffect(() => {
    if (token) loadData();
  }, [token, loadData]);

  const handleDeepAnalysis = async () => {
    if (!token) return;
    try {
      setAnalyzing(true);
      const res = await fetch(`/api/creators/${username}/deep-analysis-stream`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        const text = await res.text();
        let data: any = {};
        try { data = JSON.parse(text); } catch { data = { message: text }; }

        if (res.status === 403 || data?.code === 'INSUFFICIENT_CREDITS' || text.toLowerCase().includes('credits') || text.toLowerCase().includes('insufficient')) {
          const classified = classifyError({ code: 'INSUFFICIENT_CREDITS' });
          toast.error(`${classified.icon} ${classified.title}`, { description: classified.description, duration: classified.duration });
          setShowCreditModal(true);
          return;
        }
        throw new Error(data.message || data.error || "Failed to analyze");
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
            if (evt.type === "ping" || evt.type === "progress") {
              // ignore pings and progress (could show progress if needed)
            } else if (evt.type === "done") {
              toast.success("Deep analysis complete!");
              loadData();
            } else if (evt.type === "error") {
               handleSSEError(evt, setShowCreditModal);
            }
          } catch (e) {
            // ignore parse errors for partial chunks
          }
        }
      }
    } catch (err: any) {
      handleCatchError(err, setShowCreditModal);
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (!creator) {
    return (
      <div className="text-center py-20">
        <h2 className="text-xl font-semibold opacity-70">Creator not found.</h2>
        <Button onClick={() => router.back()} className="mt-4" variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
        </Button>
      </div>
    );
  }

  const topPerformances = posts
    .filter(p => p.videoPlayCount > (creator.avgViews30d || 0))
    .sort((a, b) => b.videoPlayCount - a.videoPlayCount)
    .slice(0, 7);

  const avgLikes = posts.length > 0 ? Math.round(posts.reduce((sum, p) => sum + p.likesCount, 0) / posts.length) : 0;
  const avgComments = posts.length > 0 ? Math.round(posts.reduce((sum, p) => sum + p.commentsCount, 0) / posts.length) : 0;
  const weeklyPosts = Math.round((creator.reelsCount30d || 0) / 4.3); // Average weeks in a month
  const engagementRate = creator.engagementRate ? (creator.engagementRate * 100).toFixed(2) : "0.00";
  
  const growthStatus = 
    topPerformances.length >= 5 ? { label: "Explosive", color: "text-emerald-500", bg: "bg-emerald-500/10" } :
    topPerformances.length >= 2 ? { label: "Trending", color: "text-orange-500", bg: "bg-orange-500/10" } :
    creator.reelsCount30d > 15 ? { label: "Aggressive", color: "text-blue-500", bg: "bg-blue-500/10" } :
    { label: "Steady", color: "text-emerald-500", bg: "bg-emerald-500/10" };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10">
      {/* Top Nav */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => router.push("/creators")} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Creators
        </Button>
        <div className="flex items-center gap-3">
          {creator.lastScrapedAt && (
            <span className="text-xs text-muted-foreground hidden sm:inline-block">
              Last synced: {new Date(creator.lastScrapedAt).toLocaleDateString()}
            </span>
          )}
           {creator.aiInsights && (
            <div className="flex justify-center sm:justify-start">
              <Button 
                onClick={() => setConfirmAnalysis(true)} 
                disabled={analyzing}
                variant="outline"
                size="sm"
                className="rounded-xl border-orange-500/20 hover:bg-orange-500/5 text-orange-500 gap-1.5"
              >
                {analyzing ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Syncing &amp; Analyzing...</>
                ) : (
                  <><RefreshCw className="h-3.5 w-3.5" /> Refresh Profile &amp; AI (1 Credit)</>
                )}
              </Button>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/videos?creator=${username}`)}
            className="flex items-center gap-2 rounded-lg border-border/50 hover:bg-muted/50 text-sm font-medium"
          >
            <Film className="h-4 w-4" />
            <span>All Scraped Reels</span>
          </Button>
          <a
            href={`https://www.instagram.com/${creator.username}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-1.5 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 hover:text-rose-600 rounded-lg transition-colors text-sm font-medium"
          >
            <Instagram className="h-4 w-4" />
            <span>Visit Profile</span>
          </a>
        </div>
      </div>

      {/* Hero Profile Section */}
      <div className="relative rounded-3xl overflow-hidden border border-border/50 bg-card shadow-sm">
        <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 via-transparent to-transparent opacity-50" />
        <div className="relative p-6 sm:p-10 flex flex-col sm:flex-row items-center sm:items-start gap-6 sm:gap-8">

          <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full overflow-hidden border-4 border-background shadow-xl shrink-0 flex items-center justify-center bg-muted">
            {creator.profilePicUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/proxy-image?url=${encodeURIComponent(creator.profilePicUrl)}`}
                alt={creator.username}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-4xl font-bold opacity-30">{creator.username.charAt(0).toUpperCase()}</span>
            )}
          </div>

          <div className="flex flex-col items-center sm:items-start text-center sm:text-left flex-1 min-w-0">
            <div className="flex flex-col mb-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground truncate">@{creator.username}</h1>
                {creator.aiInsights && <Sparkles className="h-5 w-5 text-orange-400 fill-orange-400/20" />}
              </div>
              {creator.name && <span className="text-lg font-medium text-muted-foreground">{creator.name}</span>}
            </div>

            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-4">
              <Badge variant="secondary" className="bg-orange-500/10 text-orange-600 hover:bg-orange-500/20 border-orange-500/20">{creator.category}</Badge>
            </div>

            <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed whitespace-pre-wrap mb-4">
              {creator.bio || "No biography provided."}
            </p>

            {creator.activeSince && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                <span>Active since {formatDate(creator.activeSince)}</span>
              </div>
            )}
          </div>

          <div className="w-full sm:w-auto grid grid-cols-2 sm:grid-cols-2 gap-3 shrink-0">
            <div className="flex flex-col items-center justify-center p-4 bg-muted/40 rounded-2xl border border-border/40">
              <span className="text-2xl font-bold text-foreground">{formatNumber(creator.followersCount)}</span>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider mt-1">Followers</span>
            </div>
            <div className="flex flex-col items-center justify-center p-4 bg-muted/40 rounded-2xl border border-border/40">
              <span className="text-2xl font-bold text-foreground">{formatNumber(creator.totalPosts)}</span>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider mt-1">Total Posts</span>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full focus-visible:outline-none">
        <TabsList className="w-full sm:w-auto grid grid-cols-2 bg-muted/50 p-1 mb-8 rounded-xl">
          <TabsTrigger value="overview" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">Overview</TabsTrigger>
          <TabsTrigger value="content" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">Top Performances</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 focus-visible:outline-none">
          {/* Quick Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <Card className="bg-card shadow-sm border-border/40">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2 uppercase tracking-wide text-xs">
                  <Film className="h-4 w-4 text-orange-500" /> Recent Volume
                </CardDescription>
                <CardTitle className="text-3xl">{creator.reelsCount30d}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Reels posted in the last 30 days.</p>
              </CardContent>
            </Card>

            <Card className="bg-card shadow-sm border-border/40">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2 uppercase tracking-wide text-xs">
                  <Eye className="h-4 w-4 text-emerald-500" /> Avg Views
                </CardDescription>
                <CardTitle className="text-3xl">{formatNumber(creator.avgViews30d)}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Average per reel in the last 30 days.</p>
              </CardContent>
            </Card>

            <Card className="bg-card shadow-sm border-border/40">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2 uppercase tracking-wide text-xs">
                  <TrendingUp className="h-4 w-4 text-blue-500" /> Engagement Rate
                </CardDescription>
                <CardTitle className="text-3xl">
                  {engagementRate}%
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Interactions per view ratio.</p>
              </CardContent>
            </Card>
          </div>

          {/* Key Benchmarks Section */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-muted/30 rounded-2xl p-4 border border-border/50 flex flex-col items-center justify-center text-center">
              <div className="p-2 bg-pink-500/10 rounded-full mb-2">
                <Heart className="h-4 w-4 text-pink-500" />
              </div>
              <span className="text-xl font-bold">{formatNumber(avgLikes)}</span>
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Avg Likes</span>
            </div>
            <div className="bg-muted/30 rounded-2xl p-4 border border-border/50 flex flex-col items-center justify-center text-center">
              <div className="p-2 bg-blue-500/10 rounded-full mb-2">
                <MessageCircle className="h-4 w-4 text-blue-500" />
              </div>
              <span className="text-xl font-bold">{formatNumber(avgComments)}</span>
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Avg Comments</span>
            </div>
            <div className="bg-muted/30 rounded-2xl p-4 border border-border/50 flex flex-col items-center justify-center text-center">
              <div className="p-2 bg-orange-500/10 rounded-full mb-2">
                <Film className="h-4 w-4 text-orange-500" />
              </div>
              <span className="text-xl font-bold">{weeklyPosts}</span>
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Weekly Posts</span>
            </div>
            <div className="bg-muted/30 rounded-2xl p-4 border border-border/50 flex flex-col items-center justify-center text-center relative overflow-hidden group">
              <div className={`absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity`} />
              <div className={`p-2 ${growthStatus.bg} rounded-full mb-2`}>
                <TrendingUp className={`h-4 w-4 ${growthStatus.color}`} />
              </div>
              <span className={`text-xl font-bold ${growthStatus.color}`}>{growthStatus.label}</span>
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Growth Pace</span>
            </div>
          </div>

          {/* AI Insights Section (Moved from separate tab) */}
          {creator.aiInsights ? (
            <div className="space-y-6 pt-4 border-t border-border/10">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-orange-500" />
                  Deep Analysis Breakdown
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="shadow-sm border-border/40">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-emerald-500" />
                      Why They Are Successful
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-4">
                      {creator.aiInsights?.successFactors?.map((reason: string, i: number) => (
                        <li key={i} className="flex gap-3 text-sm">
                          <span className="flex shrink-0 w-6 h-6 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 font-bold text-xs">{i + 1}</span>
                          <span className="pt-0.5 leading-relaxed font-medium text-foreground/80">{reason}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                <div className="space-y-6 flex flex-col">
                  <Card className="shadow-sm border-border/40 flex-1">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Film className="h-5 w-5 text-blue-500" />
                        Content Themes & Niche
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {creator.aiInsights?.contentThemes?.map((theme: string, i: number) => (
                          <Badge key={i} variant="secondary" className="px-3 py-1.5 bg-blue-500/10 text-blue-600 border-none font-medium hover:bg-blue-500/20 text-xs">
                            {theme}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="shadow-sm border-border/40">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Eye className="h-5 w-5 text-purple-500" />
                        Consistency & Evolution
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm">
                      {creator.aiInsights?.evolution && (
                        <div>
                          <span className="font-semibold block mb-1">Growth Path:</span>
                          <span className="text-muted-foreground">{creator.aiInsights.evolution}</span>
                        </div>
                      )}
                      {creator.aiInsights?.consistencyFeedback && (
                        <div className="bg-muted/30 p-3 rounded-xl border border-border/50">
                          <span className="font-semibold block mb-1">Posting Habit:</span>
                          <span className="text-muted-foreground">{creator.aiInsights.consistencyFeedback}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* New Insights Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                <Card className="shadow-sm border-border/40 bg-gradient-to-br from-orange-500/5 to-transparent">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Zap className="h-5 w-5 text-orange-500" />
                      Hook Strategy Analysis
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed text-foreground/80 font-medium italic">
                      &quot;{creator.aiInsights?.hookAnalysis || "Analyzing how they capture attention in the first 3 seconds..."}&quot;
                    </p>
                  </CardContent>
                </Card>

                <Card className="shadow-sm border-border/40 bg-gradient-to-br from-emerald-500/5 to-transparent">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Users className="h-5 w-5 text-emerald-500" />
                      Target Audience Profile
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed text-foreground/80 font-medium">
                      {creator.aiInsights?.audienceArchetype || "Identifying the core demographic and interest groups..."}
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : (
            <Card className="bg-gradient-to-br from-orange-500/5 to-rose-500/5 border-orange-500/20 overflow-hidden relative">
               <div className="absolute right-0 top-0 opacity-10 translate-x-1/4 -translate-y-1/4">
                <Sparkles className="h-64 w-64 text-orange-500" />
              </div>
              <CardHeader>
                <CardTitle className="text-xl flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-orange-500" />
                  Unlock Deep Analytics
                </CardTitle>
                <CardDescription className="text-base text-muted-foreground/80 max-w-2xl">
                  Generate a comprehensive AI report identifying this creator&apos;s hidden content strategy, hook mechanisms, and exact reasons why their audience engages.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={() => setConfirmAnalysis(true)}
                  disabled={analyzing}
                  className="bg-orange-500 hover:bg-orange-600 text-white border-0 shadow-lg shadow-orange-500/20 rounded-xl"
                  size="lg"
                >
                  {analyzing ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Syncing &amp; Analyzing...</>
                  ) : (
                    <><Zap className="mr-2 h-4 w-4" /> Sync Profile &amp; Generate Report (1 Credit)</>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>



        <TabsContent value="content" className="space-y-6 focus-visible:outline-none">
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
            {topPerformances.map((post) => (
              <PostCard key={post.postId} post={post} type="viral" />
            ))}
            {topPerformances.length === 0 && <p className="text-muted-foreground text-sm col-span-full">No performances tracked yet.</p>}
          </div>
        </TabsContent>
      </Tabs>

      <ConfirmCreditModal
        open={confirmAnalysis}
        onOpenChange={setConfirmAnalysis}
        onConfirm={() => {
          setConfirmAnalysis(false);
          handleDeepAnalysis();
        }}
        title="Generate AI Report"
        description="This will analyze the creator's content strategy using AI."
        creditCost="1 Credit"
        confirmText="Confirm Analysis"
      />
    </div>
  );
}

function PostCard({ post, type }: { post: Video, type: 'viral' | 'engagement' }) {
  return (
    <Card className="overflow-hidden group flex flex-col bg-card border-border/40 shadow-sm transition-all hover:shadow-xl hover:border-orange-500/30">
      <div className="relative aspect-[10/16] bg-black/5 overflow-hidden">
        {post.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/proxy-image?url=${encodeURIComponent(post.thumbnailUrl)}`}
            alt="Thumbnail"
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <Film className="h-6 w-6 opacity-20" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

        <a
          href={post.videoUrl || `https://instagram.com/reel/${post.postId}`}
          target="_blank"
          rel="noreferrer"
          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 backdrop-blur-[2px]"
        >
          <PlayCircle className="h-10 w-10 text-white drop-shadow-lg" />
        </a>

        <div className="absolute bottom-0 left-0 right-0 p-2 flex justify-between items-end">
          <div className="flex flex-col gap-1">
            <Badge variant="secondary" className="bg-black/50 text-white backdrop-blur-md border-0 w-fit text-[8px] px-1.5 h-4">
              {formatDate(post.timestamp)}
            </Badge>
            {type === 'viral' ? (
              <span className="text-white font-bold text-[10px] flex items-center gap-1 drop-shadow-md">
                <Eye className="h-2.5 w-2.5 text-orange-400" /> {formatNumber(post.videoPlayCount)}
              </span>
            ) : (
              <span className="text-white font-bold text-[10px] flex items-center gap-1 drop-shadow-md">
                <Heart className="h-2.5 w-2.5 text-rose-400 fill-rose-400" /> {formatNumber(post.likesCount)}
              </span>
            )}
          </div>
        </div>
      </div>
      {(post.caption) && (
        <div className="p-2">
          <p className="text-[10px] text-muted-foreground line-clamp-1">
            {post.caption}
          </p>
        </div>
      )}
    </Card>
  );
}
