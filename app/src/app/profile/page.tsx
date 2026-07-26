"use client";

import { useState, useEffect } from "react";
import { BASE_URL } from "@/lib/config";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Mail,
  Calendar,
  Instagram,
  Linkedin,
  Pencil,
  Check,
  X,
  Loader2,
  Users,
  Layout,
  Globe,
  Facebook,
  Zap,
  UserCircle,
  TrendingUp,
  Files
} from "lucide-react";
import { toast } from "sonner";

interface ProfileStats {
  instagram: {
    creators: number;
    reelsAnalyzed: number;
    standardAnalyzed: number;
  };
  linkedin: {
    profiles: number;
    reports: number;
  };
  facebook: {
    ads: number;
  };
  total: number;
}

interface ProfileData {
  id: number;
  email: string;
  fullName: string;
  createdAt: string;
  instagramHandle: string | null;
  linkedInHandle: string | null;
  stats: ProfileStats;
}

export default function ProfilePage() {
  const { token, user, login } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Edit states
  const [editing, setEditing] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});

  // const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

  const fetchProfile = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.data) {
        setProfile(json.data);
      } else {
        toast.error("Failed to load profile data");
      }
    } catch {
      toast.error("Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [token]);

  const saveField = async (field: string, value: string) => {
    if (!token) return;
    setSaving(true);
    try {
      const res = await fetch(`${BASE_URL}/auth/profile`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ [field]: value }),
      });
      const json = await res.json();

      if (json.data) {
        setProfile((prev) => prev ? { ...prev, ...json.data } : null);
        setEditing(null);
        toast.success("Profile updated");

        if (field === "fullName" && user) {
          login(token, { ...user, fullName: value }, user.loginSource || "thehooklab");
        }
      } else {
        toast.error(json.message || "Failed to update profile");
      }
    } catch {
      toast.error("Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (field: string, currentValue: string) => {
    setEditing(field);
    setEditValues({ ...editValues, [field]: currentValue || "" });
  };

  const cancelEdit = () => setEditing(null);

  const confirmEdit = async (field: string) => {
    await saveField(field, editValues[field] || "");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
      </div>
    );
  }

  if (!profile) return null;

  const memberSince = new Date(profile.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
  });

  return (
    <div className="max-w-6xl mx-auto space-y-12 pb-24 pt-4">
      {/* ── Simple Minimalist Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between px-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Profile</h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-lg">
            Manage your account details and view your platform-wide content performance statistics.
          </p>
        </div>
      </div>

      <div className="grid gap-8 px-4">
        {/* Account Essentials */}
        <div className="rounded-3xl bg-background/50 backdrop-blur-xl border border-border/50 p-8 shadow-sm">
          <div className="flex flex-col md:flex-row gap-12 items-start">
            <div className="flex-1 space-y-8 w-full">
              <div className="space-y-6">
                <div className="group">
                  <div className="flex items-center gap-3 mb-2">
                    <UserCircle className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">Full Name</span>
                  </div>
                  {editing === 'fullName' ? (
                    <div className="flex items-center gap-2">
                      <Input
                        autoFocus
                        value={editValues.fullName}
                        onChange={(e) => setEditValues({ ...editValues, fullName: e.target.value })}
                        className="h-10 w-full max-w-sm rounded-xl border-orange-500/30 font-bold"
                      />
                      <Button size="icon" variant="ghost" className="h-10 w-10 text-emerald-500" onClick={() => confirmEdit('fullName')}>
                        <Check className="h-5 w-5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-10 w-10 text-red-500" onClick={cancelEdit}>
                        <X className="h-5 w-5" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <p className="text-2xl font-bold">{profile.fullName}</p>
                      <button onClick={() => startEdit('fullName', profile.fullName)} className="p-1 opacity-20 hover:opacity-100 transition-opacity">
                        <Pencil className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">Email Address</span>
                    </div>
                    <p className="text-sm font-medium text-foreground">{profile.email}</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">Account Created</span>
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">{memberSince}</p>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-border/30 grid gap-4 sm:grid-cols-2">
                <div className="p-5 rounded-2xl bg-foreground/[0.02] border border-border/30 group hover:border-orange-500/20 transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <Instagram className="h-4 w-4 text-red-500" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">Handle</span>
                  </div>
                  <SocialLink field="instagramHandle" value={profile.instagramHandle} onSave={(v: string) => saveField('instagramHandle', v)} />
                </div>
                <div className="p-5 rounded-2xl bg-foreground/[0.02] border border-border/30 group hover:border-sky-500/20 transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <Linkedin className="h-4 w-4 text-sky-500" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">Handle</span>
                  </div>
                  <SocialLink field="linkedInHandle" value={profile.linkedInHandle} prefix="in/" onSave={(v: string) => saveField('linkedInHandle', v)} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Analytics Hub */}
        <div className="space-y-8">
          <div className="flex items-center gap-3">
            <TrendingUp className="h-5 w-5 text-orange-500" />
            <h2 className="text-xl font-bold">Content Growth Statistics</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Instagram Block */}
            <div className="relative group overflow-hidden p-8 rounded-[2rem] bg-red-500/[0.02] border border-red-500/10">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Instagram className="h-20 w-20" />
              </div>
              <h3 className="text-sm font-black uppercase tracking-widest text-red-600/60 mb-8">Instagram</h3>
              <div className="space-y-6 relative">
                <DetailedStat value={profile.stats.instagram.creators} label="Creators Tracked" />
                <DetailedStat value={profile.stats.instagram.standardAnalyzed} label="Reels Scanned" />
                <DetailedStat value={profile.stats.instagram.reelsAnalyzed} label="Deep Analyses" highlight />
              </div>
            </div>

            {/* LinkedIn Block */}
            <div className="relative group overflow-hidden p-8 rounded-[2rem] bg-sky-500/[0.02] border border-sky-500/10">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Linkedin className="h-20 w-20" />
              </div>
              <h3 className="text-sm font-black uppercase tracking-widest text-sky-600/60 mb-8">LinkedIn</h3>
              <div className="space-y-6 relative">
                <DetailedStat value={profile.stats.linkedin.profiles} label="Profiles Scans" />
                <DetailedStat value={profile.stats.linkedin.reports} label="Strategy Reports" highlight />
              </div>
            </div>

            {/* Facebook Block */}
            <div className="relative group overflow-hidden p-8 rounded-[2rem] bg-blue-600/[0.02] border border-blue-600/10">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Facebook className="h-20 w-20" />
              </div>
              <h3 className="text-sm font-black uppercase tracking-widest text-blue-600/60 mb-8">Facebook Ads</h3>
              <div className="space-y-6 relative">
                <DetailedStat value={profile.stats.facebook.ads} label="Ads Analyzed" highlight />
                <div className="pt-2">
                  <p className="text-[10px] font-bold text-muted-foreground/30 leading-relaxed uppercase tracking-widest">Comparative engine is currently in beta mode.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailedStat({ value, label, highlight = false }: { value: number; label: string; highlight?: boolean }) {
  return (
    <div>
      <p className={`text-4xl font-black tracking-tighter ${highlight ? "text-foreground" : "text-foreground/80"}`}>{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mt-1">{label}</p>
    </div>
  );
}

function SocialLink({ field, value, prefix = "@", onSave }: any) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value || "");

  if (editing) {
    return (
      <div className="flex items-center gap-2 mt-1">
        <Input value={val} onChange={(e) => setVal(e.target.value)} className="h-8 w-full max-w-[180px] rounded-lg text-xs" />
        <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-500" onClick={() => { onSave(val); setEditing(false); }}>
          <Check className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <button onClick={() => setEditing(true)} className="mt-1 flex items-center justify-between w-full text-foreground group">
      <span className="text-sm font-bold tracking-tight">
        {value ? (
          <>
            <span className="opacity-20 mr-0.5">{prefix}</span>
            {value}
          </>
        ) : "Unlinked"}
      </span>
      <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-40 transition-opacity" />
    </button>
  );
}
