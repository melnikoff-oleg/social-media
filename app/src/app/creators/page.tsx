"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/auth-context";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Users, Eye, Film, UserCheck, RefreshCw, Loader2, ExternalLink, Check, Search, Instagram, AlertTriangle, Download } from "lucide-react";
import { toast } from "sonner";
import { handleSSEError, handleCatchError } from "@/lib/error-utils";
import Link from "next/link";
import type { Creator } from "@/lib/types";
import { ConfirmCreditModal } from "@/components/ui/confirm-credit-modal";

type CreatorApiRecord = {
  username: string;
  category?: string | null;
  profilePicUrl?: string | null;
  followersCount?: number | null;
  reelsCount30d?: number | null;
  avgViews30d?: number | null;
  lastScrapedAt?: string | null;
};

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toString();
}

export default function CreatorsPage() {
  const { token, setShowCreditModal } = useAuth();
  const router = useRouter();
  const [creators, setCreators] = useState<Creator[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Creator | null>(null);
  const [form, setForm] = useState({ username: "", category: "" });
  const [filterCategory, setFilterCategory] = useState("all");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [scrapeConfirmId, setScrapeConfirmId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState("lastScrapedAt");
  const [confirmAction, setConfirmAction] = useState<{ type: "all" | "one", id?: string } | null>(null);

  // Advanced Animation State
  const [scrapingModalOpen, setScrapingModalOpen] = useState(false);
  const [scrapingCreator, setScrapingCreator] = useState<string | null>(null);
  const [scrapingPhase, setScrapingPhase] = useState<"connecting" | "fetching" | "analyzing" | "done">("connecting");

  const loadCreators = useCallback(async () => {
    if (!token) return;
    try {
      setLoadError(null);
      const response = await fetch(`/api/creators?_t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text || `Failed to load creators (HTTP ${response.status})`);
      }

      const data = await response.json();
      if (!Array.isArray(data)) {
        throw new Error("Invalid creators response");
      }

      const creatorsData = data as CreatorApiRecord[];
      setCreators(creatorsData.map((c) => ({
        id: c.username,
        username: c.username,
        category: c.category || "",
        profilePicUrl: c.profilePicUrl || "",
        followers: c.followersCount || 0,
        reelsCount30d: c.reelsCount30d || 0,
        avgViews30d: c.avgViews30d || 0,
        lastScrapedAt: c.lastScrapedAt || "",
      })));
    } catch (err) {
      console.error("Failed to load creators:", err);
      setCreators([]);
      setLoadError(err instanceof Error ? err.message : "Failed to load creators");
    }
  }, [token]);

  useEffect(() => {
    if (token) void loadCreators();
  }, [token, loadCreators]);

  const uniqueCategories = [...new Set(creators.map((c) => c.category || "General"))].sort();

  const filtered = creators
    .filter((c) => {
      if (filterCategory === "unscraped") {
        if (c.followers > 0 || c.lastScrapedAt) return false;
      } else if (filterCategory !== "all" && c.category !== filterCategory) {
        return false;
      }

      if (searchQuery && !c.username.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "unscrapedFirst":
          const aIsUnscraped = !a.lastScrapedAt && a.followers === 0;
          const bIsUnscraped = !b.lastScrapedAt && b.followers === 0;
          if (aIsUnscraped && !bIsUnscraped) return -1;
          if (!aIsUnscraped && bIsUnscraped) return 1;
          return a.username.localeCompare(b.username);
        case "followers":
          return b.followers - a.followers;
        case "avgViews30d":
          return b.avgViews30d - a.avgViews30d;
        case "reelsCount30d":
          return b.reelsCount30d - a.reelsCount30d;
        case "username":
          return a.username.localeCompare(b.username);
        case "lastScrapedAt":
        default:
          if (!a.lastScrapedAt) return 1;
          if (!b.lastScrapedAt) return -1;
          return new Date(b.lastScrapedAt).getTime() - new Date(a.lastScrapedAt).getTime();
      }
    });

  const openNew = () => {
    setEditing(null);
    setForm({ username: "", category: "" });
    setDialogOpen(true);
  };

  const openEdit = (creator: Creator) => {
    setEditing(creator);
    setForm({ username: creator.username, category: creator.category });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);

    // Payload for the API
    const finalForm = {
      username: form.username.trim(),
      category: editing ? form.category.trim() : "General"
    };

    try {
      if (editing) {
        const response = await fetch(`/api/creators/${encodeURIComponent(editing.username)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(finalForm),
        });
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          if (response.status === 403 || errData?.code === 'INSUFFICIENT_CREDITS') {
            toast.error("Insufficient credits. Please upgrade your plan.");
            setShowCreditModal(true);
            setDialogOpen(false);
            return;
          }
          throw new Error(errData.message || "Failed to update creator");
        }
      } else {
        const response = await fetch("/api/creators", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(finalForm),
        });
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.message || "Failed to add creator");
        }
        toast.success(`@${finalForm.username} added successfully!`);
        setDialogOpen(false);
        // Start immersive scraping stream instead of reloading statically
        startScrapingStream(finalForm.username);
        return; // Don't trigger standard loadCreators
      }
      setDialogOpen(false);
      loadCreators();
    } catch (err: any) {
      handleCatchError(err, setShowCreditModal);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (username: string) => {
    if (!token || !confirm(`Delete creator @${username}?`)) return;
    try {
      const response = await fetch(`/api/creators/${encodeURIComponent(username)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || `Failed to delete creator (Status: ${response.status})`);
      }
      loadCreators();
    } catch (err: any) {
      handleCatchError(err);
    }
  };

  const startScrapingStream = async (username: string) => {
    setScrapingCreator(username);
    setScrapingPhase("connecting");
    setScrapingModalOpen(true);

    // Simulate data-fetching progression visually
    const phases: ("connecting" | "fetching" | "analyzing")[] = ["connecting", "fetching", "analyzing"];
    let phaseIdx = 0;
    const visualInterval = setInterval(() => {
      if (phaseIdx < 2) {
        phaseIdx++;
        setScrapingPhase(phases[phaseIdx]);
      }
    }, 5000);

    try {
      const response = await fetch(`/api/creators/refresh-stream?usernames=${username}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

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
              if (data.type === "progress" && data.status === "done") {
                clearInterval(visualInterval);
                setScrapingPhase("done");
                setTimeout(() => {
                  setScrapingModalOpen(false);
                  setScrapingCreator(null);
                  loadCreators();
                }, 1500);
              } else if (data.type === "error") {
                handleSSEError(data, setShowCreditModal);
                clearInterval(visualInterval);
                setScrapingModalOpen(false);
              }
            } catch { /* skip */ }
          }
        }
      }

      // Fallback: If the stream terminates normally (or Drops by Next.js proxy timeout)
      // without hitting 'done', we simulate a successful done state and close the UI.
      clearInterval(visualInterval);
      setScrapingPhase("done");
      setTimeout(() => {
        setScrapingModalOpen(false);
        setScrapingCreator(null);
        loadCreators();
      }, 1500);

    } catch (err: any) {
      handleCatchError(err, setShowCreditModal);
      clearInterval(visualInterval);
      setScrapingModalOpen(false);
    }
  };

  const handleRefreshAll = async () => {
    setRefreshing(true);
    try {
      const usernamesArray = creators.map(c => c.username);
      const usernamesStr = usernamesArray.join(",");
      const response = await fetch(`/api/creators/refresh-stream?usernames=${usernamesStr}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

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
              if (data.type === "progress" && data.status === "done") {
                loadCreators();
              } else if (data.type === "error") {
                handleSSEError(data, setShowCreditModal);
              }
            } catch { /* skip */ }
          }
        }
      }
    } catch (err: any) {
      handleCatchError(err, setShowCreditModal);
    } finally {
      setRefreshing(false);
      loadCreators();
    }
  };

  const handleRefreshOne = async (username: string) => {
    setRefreshingId(username);
    try {
      const response = await fetch(`/api/creators/refresh-stream?usernames=${username}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

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
              if (data.type === "progress" && data.status === "done") {
                loadCreators();
              } else if (data.type === "error") {
                handleSSEError(data, setShowCreditModal);
              }
            } catch { /* skip */ }
          }
        }
      }
    } catch (err: any) {
      handleCatchError(err, setShowCreditModal);
    } finally {
      setRefreshingId(null);
      loadCreators();
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Creators</h1>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
            Manage competitor Instagram accounts to track
          </p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button
            variant="ghost"
            onClick={() => setConfirmAction({ type: "all" })}
            disabled={refreshing}
            className="flex-1 sm:flex-none rounded-xl glass border-border/50 gap-1.5 text-[10px] sm:text-xs"
          >
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh All
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNew} className="flex-1 sm:flex-none rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 border-0 gap-1.5 text-[10px] sm:text-xs">
                <Plus className="h-4 w-4" />
                Add Creator
              </Button>
            </DialogTrigger>
            <DialogContent className="glass-strong rounded-2xl border-border/50 w-[95%] sm:max-w-md mx-auto shadow-2xl">
              <DialogHeader>
                <DialogTitle>{editing ? "Edit Creator" : "Add Creator"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-5 pt-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Instagram Username</Label>
                  <Input
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    placeholder="e.g. marcel.remus"
                    className="mt-1.5 rounded-xl glass border-border/50 h-11"
                  />
                </div>
                {editing && (
                  <div className="relative">
                    <Label className="text-xs text-muted-foreground">Category (Optional)</Label>
                    <Input
                      value={form.category}
                      onChange={(e) => {
                        setForm({ ...form, category: e.target.value });
                        setShowSuggestions(true);
                      }}
                      onFocus={() => setShowSuggestions(true)}
                      onBlur={() => {
                        // Small delay to allow click on suggestion to register
                        setTimeout(() => setShowSuggestions(false), 200);
                      }}
                      placeholder="e.g. dubai-real-estate"
                      className="mt-1.5 rounded-xl glass border-border/50 h-11"
                      autoComplete="off"
                    />

                    {showSuggestions && uniqueCategories.length > 0 && (
                      <div className="absolute z-50 left-0 right-0 mt-2 max-h-[160px] overflow-y-auto rounded-xl glass-strong border border-border shadow-2xl p-1 animate-in fade-in zoom-in-95 duration-200">
                        {uniqueCategories
                          .filter(cat =>
                            !form.category ||
                            cat.toLowerCase().includes(form.category.toLowerCase())
                          )
                          .map((cat) => (
                            <button
                              key={cat}
                              type="button"
                              onMouseDown={(e) => {
                                // Use onMouseDown instead of onClick to beat the onBlur event
                                e.preventDefault();
                                setForm({ ...form, category: cat });
                                setShowSuggestions(false);
                              }}
                              className="w-full text-left px-3 py-2.5 rounded-lg text-xs hover:bg-foreground/[0.04] transition-colors flex items-center justify-between group"
                            >
                              <span className={form.category === cat ? "text-orange-400 font-medium" : "text-foreground/80"}>
                                {cat}
                              </span>
                              {form.category === cat && <span className="h-1.5 w-1.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(168,85,247,0.5)]" />}
                            </button>
                          ))}
                        {uniqueCategories.filter(cat =>
                          !form.category ||
                          cat.toLowerCase().includes(form.category.toLowerCase())
                        ).length === 0 && (
                            <div className="px-3 py-2.5 text-[10px] text-muted-foreground italic">
                              No matching categories. Type to create &quot;{form.category}&quot;
                            </div>
                          )}
                      </div>
                    )}
                  </div>
                )}
                {!editing && (
                  <div className="flex items-start gap-2 bg-orange-500/10 border border-orange-500/20 rounded-lg p-3">
                    <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-orange-200/90 leading-relaxed">
                      Profile picture, followers, and activity metrics will be scraped automatically from Instagram. <span className="font-semibold text-orange-300">This will consume 1 Creator Credit.</span>
                    </p>
                  </div>
                )}
                <Button
                  onClick={handleSave}
                  disabled={saving || !form.username}
                  className="w-full rounded-xl h-11 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 border-0"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {editing ? "Saving..." : "Adding & scraping..."}
                    </>
                  ) : (
                    editing ? "Save Changes" : "Add Creator"
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 sm:flex-none sm:w-[220px]">
          <Input
            placeholder="Search creators..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-10 rounded-xl glass border-border/50 text-xs"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10 pointer-events-none" />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-full sm:w-[220px] rounded-xl glass border-border/50 h-10 text-xs">
            <SelectValue placeholder="Filter by category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {uniqueCategories.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
            <SelectItem value="unscraped" className="font-medium italic">Not Scraped Yet</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-full sm:w-[180px] rounded-xl glass border-border/50 h-10 text-xs">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="lastScrapedAt">Newest Scraped</SelectItem>
            <SelectItem value="followers">Most Followers</SelectItem>
            <SelectItem value="avgViews30d">Highest Avg Views</SelectItem>
            <SelectItem value="reelsCount30d">Most Active (Reels)</SelectItem>
            <SelectItem value="username">Alphabetical (A-Z)</SelectItem>
            <SelectItem value="unscrapedFirst" className="font-medium italic">Not Scraped First</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="secondary" className="rounded-xl px-4 py-2.5 text-xs bg-foreground/[0.03] border border-border/80">
          {filtered.length} creators
        </Badge>
      </div>

      {loadError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          Could not load creators: {loadError}
        </div>
      )}

      {/* Creator Grid */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((creator) => {
          const isRefreshing = refreshingId === creator.id;
          return (
            <Card
              key={creator.id}
              onClick={() => router.push(`/creators/${creator.username}`)}
              className={`group glass border-border rounded-2xl p-5 shadow-xl hover:shadow-orange-500/10 transition-all duration-500 cursor-pointer ${isRefreshing ? "animate-pulse" : ""}`}
            >
              {/* Header: avatar + name + actions */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  {/* Profile pic */}
                  <div className="relative h-12 w-12 shrink-0 rounded-full overflow-hidden bg-gradient-to-br from-red-500/10 to-orange-500/10 border border-border/30">
                    {creator.profilePicUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/proxy-image?url=${encodeURIComponent(creator.profilePicUrl)}`}
                        alt={`@${creator.username}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-lg font-bold text-muted-foreground/50">
                        {creator.username.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-foreground group-hover:text-orange-400 transition-colors">@{creator.username}</p>
                    <Badge variant="secondary" className="mt-0.5 rounded-md text-[10px] bg-foreground/[0.03] border border-border/30">
                      {creator.category}
                    </Badge>
                  </div>
                </div>

                {/* Actions area */}
                <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                  <div className="flex gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmAction({ type: "one", id: creator.id })}
                      disabled={isRefreshing}
                      className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-foreground"
                    >
                      {isRefreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(creator)}
                      className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(creator.id)}
                      className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-red-400"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Stats Grid ... (unchanged) */}
              {(creator.followers > 0 || creator.lastScrapedAt) ? (
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-muted/60 border border-border p-2.5 text-center shadow-sm">
                    <UserCheck className="mx-auto h-3.5 w-3.5 text-blue-400 mb-1" />
                    <p className="text-sm font-bold">{formatNumber(creator.followers)}</p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Followers</p>
                  </div>
                  <div className="rounded-xl bg-muted/60 border border-border p-2.5 text-center shadow-sm">
                    <Film className="mx-auto h-3.5 w-3.5 text-orange-400 mb-1" />
                    <p className="text-sm font-bold">{creator.reelsCount30d}</p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Reels/30d</p>
                  </div>
                  <div className="rounded-xl bg-muted/60 border border-border p-2.5 text-center shadow-sm">
                    <Eye className="mx-auto h-3.5 w-3.5 text-emerald-400 mb-1" />
                    <p className="text-sm font-bold">{formatNumber(creator.avgViews30d)}</p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Avg Views</p>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-xl bg-muted/60 border border-border/50 p-4 shadow-sm" onClick={(e) => e.stopPropagation()}>
                  {scrapeConfirmId === creator.id ? (
                    /* Confirmation state */
                    <div className="flex flex-col gap-2.5 animate-in fade-in duration-200">
                      <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
                        <p className="text-[10px] text-amber-300/90 leading-relaxed">
                          This will use your <span className="font-semibold text-amber-300">Apify credits</span> to scrape profile data, followers, and 30-day reel activity.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setScrapeConfirmId(null)}
                          className="flex-1 h-8 rounded-lg text-[10px] border border-border/40 text-muted-foreground hover:text-foreground"
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            setScrapeConfirmId(null);
                            handleRefreshOne(creator.id);
                          }}
                          disabled={isRefreshing}
                          className="flex-1 h-8 rounded-lg text-[10px] bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 border-0 text-white gap-1.5"
                        >
                          {isRefreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                          Confirm Scrape
                        </Button>
                      </div>
                    </div>
                  ) : (
                    /* Default state — show scrape button */
                    <div className="flex flex-col items-center gap-2.5">
                      <p className="text-[10px] text-muted-foreground/60">No profile data scraped yet</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setScrapeConfirmId(creator.id)}
                        disabled={isRefreshing}
                        className="h-8 rounded-lg text-[10px] bg-orange-500/10 text-orange-400 border border-orange-500/20 hover:bg-orange-500/20 gap-1.5 px-4"
                      >
                        {isRefreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                        Scrape Data
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Footer: Line Instagram + Scraped Date & Analysis link */}
              <div className="mt-4 flex items-end justify-between">
                <a
                  href={`https://www.instagram.com/${creator.username}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="group/insta transition-transform hover:scale-110 active:scale-95"
                  title="Open Instagram Profile"
                >
                  <Instagram className="h-8 w-8 text-red-500/80 hover:text-red-500 transition-colors stroke-[1.5]" />
                </a>

                <div className="flex flex-col items-end gap-1.5">
                  {creator.lastScrapedAt && (
                    <span className="text-[10px] text-muted-foreground/40 font-medium">
                      Scraped {new Date(creator.lastScrapedAt).toLocaleDateString()}
                    </span>
                  )}
                  <div className="flex gap-4">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/videos?creator=${creator.username}`);
                      }}
                      className="inline-flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground hover:text-orange-400 transition-colors"
                    >
                      <span>Library</span>
                      <Film className="h-3.5 w-3.5" />
                    </button>
                    <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-orange-400 group-hover:text-orange-300 transition-colors">
                      <span>Analytics</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}

        {filtered.length === 0 && (
          <div className="col-span-full glass rounded-2xl p-12 text-center">
            <Users className="mx-auto h-10 w-10 text-muted-foreground/30" />
            <h3 className="mt-4 font-semibold">No creators yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">Add one to get started.</p>
          </div>
        )}
      </div>

      {/* Advanced Scraping Modal */}
      <Dialog open={scrapingModalOpen} onOpenChange={(open) => !open && setScrapingModalOpen(false)}>
        <DialogContent className="glass-strong rounded-[2rem] border-border/50 w-[95%] sm:max-w-md mx-auto shadow-2xl p-10 overflow-hidden outline-none">
          <DialogTitle className="sr-only">Scraping Progress</DialogTitle>
          <div className="absolute inset-0 bg-gradient-to-tr from-orange-500/5 to-orange-500/5 pointer-events-none" />

          <div className="flex flex-col items-center justify-center min-h-[300px] relative z-10 w-full mt-4">
            <div className="relative w-24 h-24 mb-8">
              {scrapingPhase === "done" ? (
                <div className="absolute inset-0 bg-emerald-500 rounded-full flex items-center justify-center animate-in zoom-in duration-500 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                  <Check className="w-10 h-10 text-white" strokeWidth={3} />
                </div>
              ) : (
                <>
                  <div className="absolute inset-0 rounded-full border-t-2 border-orange-500 animate-spin opacity-80 decoration-slice"></div>
                  <div className="absolute inset-2 rounded-full border-r-2 border-red-500 animate-[spin_1.5s_linear_infinite_reverse] opacity-60"></div>
                  <div className="absolute inset-4 rounded-full border-b-2 border-orange-500 animate-[spin_2s_linear_infinite] opacity-40"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Users className="h-8 w-8 text-orange-500 animate-pulse" />
                  </div>
                </>
              )}
            </div>

            <h3 className="text-xl font-semibold mb-2 tracking-tight">
              {scrapingPhase === "done" ? "Sync Complete!" : `Fetching @${scrapingCreator}`}
            </h3>

            <div className="flex flex-col gap-2 text-sm text-muted-foreground items-center mt-4 pb-4">
              <p className={`transition-all duration-300 ${scrapingPhase === 'connecting' ? 'text-orange-500 font-bold' : (scrapingPhase === 'done' ? 'opacity-0' : 'opacity-40')}`}>
                {scrapingPhase === 'connecting' ? '→ ' : ''}Connecting to Instagram Network...
              </p>
              <p className={`transition-all duration-300 ${scrapingPhase === 'fetching' ? 'text-orange-500 font-bold' : (scrapingPhase === 'done' ? 'opacity-0' : 'opacity-40')}`}>
                {scrapingPhase === 'fetching' ? '→ ' : ''}Extracting Follower & Profile Data...
              </p>
              <p className={`transition-all duration-300 ${scrapingPhase === 'analyzing' ? 'text-orange-500 font-bold' : (scrapingPhase === 'done' ? 'opacity-0' : 'opacity-40')}`}>
                {scrapingPhase === 'analyzing' ? '→ ' : ''}Scraping 30-Day Video Feed...
              </p>
            </div>

            {scrapingPhase !== "done" && (
              <p className="mt-8 text-[10px] text-muted-foreground uppercase tracking-[0.2em] font-bold opacity-50 animate-pulse">
                Please wait
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmCreditModal
        open={confirmAction !== null}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        onConfirm={() => {
          if (confirmAction?.type === "all") handleRefreshAll();
          if (confirmAction?.type === "one" && confirmAction.id) handleRefreshOne(confirmAction.id);
          setConfirmAction(null);
        }}
        title={confirmAction?.type === "all" ? "Refresh All Creators" : "Refresh Creator"}
        description={confirmAction?.type === "all" ? "This will scrape data for all tracked creators." : "This will scrape the latest data for this creator."}
        creditCost={confirmAction?.type === "all" ? "1 Credit per creator" : "1 Credit"}
        confirmText={confirmAction?.type === "all" ? "Confirm Bulk Scrape" : "Confirm Scrape"}
      />
    </div>
  );
}
