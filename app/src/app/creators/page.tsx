"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Users, Eye, Film, UserCheck, RefreshCw, Loader2, ExternalLink } from "lucide-react";
import Link from "next/link";
import type { Creator } from "@/lib/types";
import { apiFetch, fetchList, readError } from "@/lib/client/api";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toString();
}

export default function CreatorsPage() {
  const [creators, setCreators] = useState<Creator[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Creator | null>(null);
  const [form, setForm] = useState({ username: "", category: "" });
  const [filterCategory, setFilterCategory] = useState("all");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  const [pageError, setPageError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadCreators = async () => {
    const r = await fetchList<Creator>("/api/creators");
    setCreators(r.items);
    setPageError(r.error);
  };

  useEffect(() => { loadCreators(); }, []);

  const uniqueCategories = [...new Set(creators.map((c) => c.category))].sort();

  const filtered = filterCategory === "all"
    ? creators
    : creators.filter((c) => c.category === filterCategory);

  const openNew = () => {
    setEditing(null);
    setForm({ username: "", category: "" });
    setSaveError(null);
    setDialogOpen(true);
  };

  const openEdit = (creator: Creator) => {
    setEditing(creator);
    setForm({ username: creator.username, category: creator.category });
    setSaveError(null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await apiFetch("/api/creators", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { id: editing.id, ...form } : form),
      });
      if (res.status === 401) return;
      if (!res.ok) {
        // 409 carries the duplicate message from the API.
        setSaveError(await readError(res, "Não foi possível salvar"));
        return;
      }
      setDialogOpen(false);
      loadCreators();
    } catch {
      setSaveError("Não foi possível salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este criador?")) return;
    try {
      const res = await apiFetch(`/api/creators?id=${id}`, { method: "DELETE" });
      if (res.status === 401) return;
      if (!res.ok) {
        setPageError(await readError(res, "Não foi possível excluir"));
        return;
      }
    } catch {
      setPageError("Não foi possível excluir");
      return;
    }
    loadCreators();
  };

  const skippedNotice = (n: number) =>
    n > 0 ? `${n} criador(es) atualizado(s) há menos de 10 minutos não foram buscados de novo.` : null;

  const handleRefreshAll = async () => {
    setRefreshing(true);
    setNotice(null);
    let skipped = 0;
    try {
      const response = await apiFetch("/api/creators/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [] }),
      });
      if (!response.ok) {
        if (response.status !== 401) setPageError(await readError(response, "Não foi possível atualizar"));
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
              if (data.type === "progress" && data.status === "scraping") {
                const c = creators.find((cr) => cr.username === data.username);
                if (c) setRefreshingId(c.id);
              } else if (data.type === "progress" && data.status === "done") {
                loadCreators();
              } else if (data.type === "progress" && data.status === "skipped") {
                skipped++;
              } else if (data.type === "complete") {
                setRefreshingId(null);
              }
            } catch { /* skip */ }
          }
        }
      }
    } finally {
      setRefreshing(false);
      setRefreshingId(null);
      setNotice(skippedNotice(skipped));
      loadCreators();
    }
  };

  const handleRefreshOne = async (id: string) => {
    setRefreshingId(id);
    setNotice(null);
    try {
      const response = await apiFetch("/api/creators/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      if (!response.ok) {
        if (response.status !== 401) setPageError(await readError(response, "Não foi possível atualizar"));
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
      }
      buffer += decoder.decode();
      setNotice(skippedNotice(buffer.includes('"status":"skipped"') ? 1 : 0));
      loadCreators();
    } finally {
      setRefreshingId(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Criadores</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gerencie as contas de concorrentes no Instagram que você acompanha
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={handleRefreshAll}
            disabled={refreshing}
            className="rounded-xl glass border-white/[0.08] gap-1.5 text-xs"
          >
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Atualizar todos
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNew} className="rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 border-0 gap-1.5">
                <Plus className="h-4 w-4" />
                Adicionar criador
              </Button>
            </DialogTrigger>
            <DialogContent className="glass-strong rounded-2xl border-white/[0.08]">
              <DialogHeader>
                <DialogTitle>{editing ? "Editar criador" : "Adicionar criador"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-5 pt-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Usuário do Instagram</Label>
                  <Input
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    placeholder="ex.: marcel.remus"
                    className="mt-1.5 rounded-xl glass border-white/[0.08] h-11"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Categoria</Label>
                  <Input
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    placeholder="ex.: imoveis-dubai"
                    className="mt-1.5 rounded-xl glass border-white/[0.08] h-11"
                  />
                </div>
                {!editing && (
                  <p className="text-[11px] text-muted-foreground">
                    A foto de perfil, os seguidores e as métricas de atividade serão buscados automaticamente no Instagram.
                  </p>
                )}
                {saveError && (
                  <p role="alert" className="text-sm text-red-400">{saveError}</p>
                )}
                <Button
                  onClick={handleSave}
                  disabled={saving || !form.username || !form.category}
                  className="w-full rounded-xl h-11 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 border-0"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {editing ? "Salvando..." : "Adicionando e buscando dados..."}
                    </>
                  ) : (
                    editing ? "Salvar alterações" : "Adicionar criador"
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {pageError && (
        <p role="alert" className="text-sm text-red-400">{pageError}</p>
      )}
      {notice && <p className="text-sm text-muted-foreground">{notice}</p>}

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[220px] rounded-xl glass border-white/[0.08] h-10">
            <SelectValue placeholder="Filtrar por categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {uniqueCategories.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="secondary" className="rounded-lg px-3 py-1.5 text-xs bg-white/[0.05] border border-white/[0.08]">
          {filtered.length} criadores
        </Badge>
      </div>

      {/* Creator Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((creator) => {
          const isRefreshing = refreshingId === creator.id;
          return (
            <div
              key={creator.id}
              className={`group glass rounded-2xl p-5 transition-all duration-300 hover:bg-white/[0.05] hover:border-white/[0.1] ${isRefreshing ? "animate-pulse" : ""}`}
            >
              {/* Header: avatar + name + actions */}
              <div className="flex items-start justify-between">
                <a
                  href={`https://www.instagram.com/${creator.username}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                >
                  {/* Profile pic */}
                  <div className="relative h-12 w-12 shrink-0 rounded-full overflow-hidden bg-gradient-to-br from-pink-500/20 to-purple-500/20 border border-white/[0.1]">
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
                    <p className="text-sm font-semibold hover:text-purple-400 transition-colors">@{creator.username}</p>
                    <Badge variant="secondary" className="mt-0.5 rounded-md text-[10px] bg-white/[0.05] border border-white/[0.06]">
                      {creator.category}
                    </Badge>
                  </div>
                </a>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRefreshOne(creator.id)}
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

              {/* Stats */}
              {(creator.followers > 0 || creator.lastScrapedAt) ? (
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-black/20 border border-white/[0.04] p-2.5 text-center">
                    <UserCheck className="mx-auto h-3.5 w-3.5 text-blue-400 mb-1" />
                    <p className="text-sm font-bold">{formatNumber(creator.followers)}</p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Seguidores</p>
                  </div>
                  <div className="rounded-xl bg-black/20 border border-white/[0.04] p-2.5 text-center">
                    <Film className="mx-auto h-3.5 w-3.5 text-purple-400 mb-1" />
                    <p className="text-sm font-bold">{creator.reelsCount30d}</p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Reels/30d</p>
                  </div>
                  <div className="rounded-xl bg-black/20 border border-white/[0.04] p-2.5 text-center">
                    <Eye className="mx-auto h-3.5 w-3.5 text-emerald-400 mb-1" />
                    <p className="text-sm font-bold">{formatNumber(creator.avgViews30d)}</p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Média de views</p>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-xl bg-black/20 border border-white/[0.04] p-3 text-center">
                  <p className="text-[11px] text-muted-foreground">
                    Sem estatísticas ainda &mdash; clique em <RefreshCw className="inline h-3 w-3" /> para buscar
                  </p>
                </div>
              )}

              {/* Footer: last scraped + view videos */}
              <div className="mt-3 flex items-center justify-between">
                {creator.lastScrapedAt ? (
                  <p className="text-[10px] text-muted-foreground/60">
                    Atualizado em {new Date(creator.lastScrapedAt).toLocaleDateString("pt-BR")}
                  </p>
                ) : <span />}
                <Link
                  href={`/videos?creator=${creator.username}`}
                  className="inline-flex items-center gap-1 text-[11px] text-purple-400 hover:text-purple-300 transition-colors"
                >
                  Ver vídeos <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="col-span-full glass rounded-2xl p-12 text-center">
            <Users className="mx-auto h-10 w-10 text-muted-foreground/30" />
            <h3 className="mt-4 font-semibold">Nenhum criador ainda</h3>
            <p className="mt-1 text-sm text-muted-foreground">Adicione um para começar.</p>
          </div>
        )}
      </div>
    </div>
  );
}
