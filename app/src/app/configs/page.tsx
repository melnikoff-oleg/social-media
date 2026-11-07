"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Settings2, Sparkles, Search, Users, Film } from "lucide-react";
import type { Config, Creator, Video } from "@/lib/types";
import { apiFetch, fetchList, readError } from "@/lib/client/api";

const emptyConfig = {
  configName: "",
  creatorsCategory: "",
  analysisInstruction: "",
  newConceptsInstruction: "",
};

export default function ConfigsPage() {
  const [configs, setConfigs] = useState<Config[]>([]);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Config | null>(null);
  const [form, setForm] = useState(emptyConfig);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadConfigs = async () => {
    const r = await fetchList<Config>("/api/configs");
    setConfigs(r.items);
    setLoadError(r.error);
  };

  useEffect(() => {
    fetchList<Config>("/api/configs").then((r) => {
      setConfigs(r.items);
      setLoadError(r.error);
    });
    fetchList<Creator>("/api/creators").then((r) => setCreators(r.items));
    fetchList<Video>("/api/videos").then((r) => setVideos(r.items));
  }, []);

  const openNew = () => {
    setEditing(null);
    setForm(emptyConfig);
    setSaveError(null);
    setDialogOpen(true);
  };

  const openEdit = (config: Config) => {
    setEditing(config);
    setForm({
      configName: config.configName,
      creatorsCategory: config.creatorsCategory,
      analysisInstruction: config.analysisInstruction,
      newConceptsInstruction: config.newConceptsInstruction,
    });
    setSaveError(null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaveError(null);
    try {
      const res = await apiFetch("/api/configs", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { id: editing.id, ...form } : form),
      });
      if (res.status === 401) return;
      if (!res.ok) {
        // 409 carries the duplicate-name message from the API.
        setSaveError(await readError(res, "Não foi possível salvar"));
        return;
      }
      setDialogOpen(false);
      loadConfigs();
    } catch {
      setSaveError("Não foi possível salvar");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta configuração?")) return;
    try {
      const res = await apiFetch(`/api/configs?id=${id}`, { method: "DELETE" });
      if (res.status === 401) return;
      if (!res.ok) {
        setLoadError(await readError(res, "Não foi possível excluir"));
        return;
      }
    } catch {
      setLoadError("Não foi possível excluir");
      return;
    }
    loadConfigs();
  };

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gerencie as configurações do pipeline e os prompts de IA
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew} className="rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 border-0 gap-1.5">
              <Plus className="h-4 w-4" />
              Nova configuração
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto glass-strong rounded-2xl border-white/[0.08]">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar configuração" : "Nova configuração"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-5 pt-2">
              <div>
                <Label className="text-xs text-muted-foreground">Nome da configuração</Label>
                <Input
                  value={form.configName}
                  onChange={(e) => setForm({ ...form, configName: e.target.value })}
                  placeholder="ex.: Vídeos de imóveis para a Anja"
                  className="mt-1.5 rounded-xl glass border-white/[0.08] h-11"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Categoria dos criadores</Label>
                <Input
                  value={form.creatorsCategory}
                  onChange={(e) => setForm({ ...form, creatorsCategory: e.target.value })}
                  placeholder="ex.: imoveis-dubai"
                  className="mt-1.5 rounded-xl glass border-white/[0.08] h-11"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Search className="h-3 w-3 text-purple-400" />
                  Instrução de análise (prompt do Gemini)
                </Label>
                <Textarea
                  value={form.analysisInstruction}
                  onChange={(e) => setForm({ ...form, analysisInstruction: e.target.value })}
                  placeholder="Prompt que diz ao Gemini como analisar o vídeo..."
                  rows={10}
                  className="mt-1.5 rounded-xl glass border-white/[0.08] font-mono text-xs leading-relaxed"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3 text-indigo-400" />
                  Instrução de novos conceitos (prompt do Claude)
                </Label>
                <Textarea
                  value={form.newConceptsInstruction}
                  onChange={(e) => setForm({ ...form, newConceptsInstruction: e.target.value })}
                  placeholder="Prompt que diz ao Claude como gerar novos conceitos..."
                  rows={10}
                  className="mt-1.5 rounded-xl glass border-white/[0.08] font-mono text-xs leading-relaxed"
                />
              </div>
              {saveError && (
                <p role="alert" className="text-sm text-red-400">{saveError}</p>
              )}
              <Button
                onClick={handleSave}
                className="w-full rounded-xl h-11 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 border-0"
              >
                {editing ? "Salvar alterações" : "Criar configuração"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loadError && (
        <p role="alert" className="text-sm text-red-400">{loadError}</p>
      )}

      {/* Config Cards */}
      <div className="grid gap-4">
        {configs.map((config) => {
          const creatorCount = creators.filter((c) => c.category === config.creatorsCategory).length;
          const videoCount = videos.filter((v) => v.configName === config.configName).length;

          return (
            <div key={config.id} className="glass rounded-2xl p-5 transition-all duration-300 hover:bg-white/[0.05] hover:border-white/[0.1]">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500/20 to-indigo-500/20 border border-purple-500/20">
                    <Settings2 className="h-4 w-4 text-purple-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">{config.configName}</h3>
                    <div className="mt-1.5 flex items-center gap-2">
                      <Badge variant="secondary" className="rounded-md text-[10px] bg-white/[0.05] border border-white/[0.06]">
                        {config.creatorsCategory}
                      </Badge>
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Users className="h-3 w-3" />
                        {creatorCount}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Film className="h-3 w-3" />
                        {videoCount}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEdit(config)}
                    className="h-8 w-8 p-0 rounded-lg text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(config.id)}
                    className="h-8 w-8 p-0 rounded-lg text-muted-foreground hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl bg-black/20 border border-white/[0.04] p-3">
                  <p className="text-[10px] font-medium text-purple-400 uppercase tracking-wider mb-1.5">Prompt de análise</p>
                  <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
                    {config.analysisInstruction}
                  </p>
                </div>
                <div className="rounded-xl bg-black/20 border border-white/[0.04] p-3">
                  <p className="text-[10px] font-medium text-indigo-400 uppercase tracking-wider mb-1.5">Prompt de conceitos</p>
                  <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
                    {config.newConceptsInstruction}
                  </p>
                </div>
              </div>
            </div>
          );
        })}

        {configs.length === 0 && (
          <div className="glass rounded-2xl p-12 text-center">
            <Settings2 className="mx-auto h-10 w-10 text-muted-foreground/30" />
            <h3 className="mt-4 font-semibold">Nenhuma configuração ainda</h3>
            <p className="mt-1 text-sm text-muted-foreground">Crie uma para começar.</p>
          </div>
        )}
      </div>
    </div>
  );
}
