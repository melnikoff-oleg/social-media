"use client";

import { useState, useEffect } from "react";
import { BASE_URL } from "@/lib/config";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, Trash2, CheckCircle2, Loader2, Eye, EyeOff, RefreshCw, ExternalLink } from "lucide-react";

const KNOWN_KEYS = [
  {
    key: "GEMINI_API_KEY",
    label: "Gemini API Key",
    description: "Used by the AI analysis pipeline to generate viral content strategy reports",
    placeholder: "AIza...",
    helpUrl: "https://aistudio.google.com/app/apikey",
    helpText: "Get key from Google AI Studio",
  },
  {
    key: "CLAUDE_API_KEY",
    label: "Claude API Key",
    description: "Used by the LinkedIn analysis engine and advanced content strategy generation via Anthropic Claude",
    placeholder: "sk-ant-api...",
    helpUrl: "https://console.anthropic.com/settings/keys",
    helpText: "Get key from Anthropic Console",
  },
  {
    key: "APIFY_API_TOKEN",
    label: "Apify API Token",
    description: "Used to scrape Instagram Reels and Creator profiles via the Apify platform",
    placeholder: "apify_api_...",
    helpUrl: "https://console.apify.com/account/integrations",
    helpText: "Get token from Apify Console",
  },
];

interface ConfigEntry {
  key: string;
  isSet: boolean;
  isSystemSet?: boolean;
  maskedValue: string;
}

export default function SettingsPage() {
  const { token } = useAuth();
  const [configs, setConfigs] = useState<ConfigEntry[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [showValues, setShowValues] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  // const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

  const fetchConfigs = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/auth/user-configs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setConfigs(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchConfigs(); }, [token]);

  const getConfigEntry = (key: string) => configs.find((c) => c.key === key);

  const handleSave = async (key: string) => {
    const value = values[key]?.trim();
    if (!value || !token) return;
    setSaving((s) => ({ ...s, [key]: true }));
    try {
      await fetch(`${BASE_URL}/auth/user-configs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ key, value }),
      });
      setValues((v) => ({ ...v, [key]: "" }));
      setSaved((s) => ({ ...s, [key]: true }));
      setTimeout(() => setSaved((s) => ({ ...s, [key]: false })), 2000);
      await fetchConfigs();
    } finally {
      setSaving((s) => ({ ...s, [key]: false }));
    }
  };

  const handleDelete = async (key: string) => {
    if (!token) return;
    setDeleting((d) => ({ ...d, [key]: true }));
    try {
      await fetch(`${BASE_URL}/auth/user-configs/${key}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchConfigs();
    } finally {
      setDeleting((d) => ({ ...d, [key]: false }));
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Settings</h2>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
          Manage your personal API keys used by the analysis pipeline
        </p>
      </div>

      <div className="rounded-2xl border border-border/40 bg-foreground/[0.02] p-4 sm:p-6">
        <div className="flex items-center gap-3 mb-6 sm:mb-8">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400/20 to-orange-500/20 border border-amber-400/20 shrink-0">
            <KeyRound className="h-4 w-4 text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Your API Keys</h3>
            <p className="text-[10px] sm:text-xs text-muted-foreground">
              These keys are private and encrypted
            </p>
          </div>
          <button onClick={fetchConfigs} className="ml-auto text-muted-foreground hover:text-foreground transition-colors p-2">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            {KNOWN_KEYS.map(({ key, label, description, placeholder, helpUrl, helpText }) => {
              const entry = getConfigEntry(key);
              const isSet = !!entry?.isSet;
              return (
                <div key={key} className="rounded-xl border border-border/40 bg-foreground/[0.03] p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                    <div className="flex-1 w-full">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="font-mono text-[10px] sm:text-xs font-semibold text-amber-400">{key}</span>
                        {isSet ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[9px] sm:text-[10px] font-semibold text-emerald-400">
                            <CheckCircle2 className="h-2.5 w-2.5" /> Active
                          </span>
                        ) : entry?.isSystemSet ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 text-[9px] sm:text-[10px] font-semibold text-orange-400">
                            <CheckCircle2 className="h-2.5 w-2.5" /> Global Active
                          </span>
                        ) : null}
                      </div>
                      <p className="text-sm font-bold text-foreground/90">{label}</p>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
                      <a
                        href={helpUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 transition-colors mt-1"
                      >
                        <ExternalLink className="h-3 w-3" />
                        {helpText}
                      </a>
                    {(isSet || entry?.isSystemSet) && (
                        <p className="font-mono text-xs text-muted-foreground mt-2">
                          {showValues[key] ? entry?.maskedValue : "••••••••••••••••••••"}
                          <button
                            onClick={() => setShowValues((s) => ({ ...s, [key]: !s[key] }))}
                            className="ml-2 text-muted-foreground/60 hover:text-muted-foreground"
                          >
                            {showValues[key] ? <EyeOff className="inline h-3 w-3" /> : <Eye className="inline h-3 w-3" />}
                          </button>
                        </p>
                      )}
                    </div>
                    {isSet && (
                      <button
                        onClick={() => handleDelete(key)}
                        disabled={deleting[key]}
                        className="self-end sm:self-start text-red-400/60 hover:text-red-400 transition-colors p-2"
                      >
                        {deleting[key] ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    )}
                  </div>

                  <div className="mt-5 flex flex-col sm:flex-row gap-2">
                    <Input
                      type="password"
                      placeholder={isSet ? `Update ${placeholder}` : placeholder}
                      value={values[key] || ""}
                      onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                      className="h-11 sm:h-10 rounded-xl border-border/50 bg-foreground/[0.03] font-mono text-[10px] sm:text-xs flex-1"
                    />
                    <Button
                      size="sm"
                      onClick={() => handleSave(key)}
                      disabled={!values[key]?.trim() || saving[key]}
                      className="h-11 sm:h-10 rounded-xl bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 border-0 px-6 text-xs font-bold"
                    >
                      {saving[key] ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : saved[key] ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                        : isSet ? "Update Key" : "Save Key"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 px-5 py-4">
        <p className="text-xs text-orange-300/80">
          <span className="font-semibold text-orange-300">Global vs Personal keys:</span>{" "}
          "Global Active" means the platform provides a default key for all users. You can still provide your own personal key to override it.
        </p>
      </div>
    </div>
  );
}
