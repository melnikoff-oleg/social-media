"use client";

import { useCallback, useEffect, useState } from "react";
import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Config, Creator, Video } from "@/lib/types";
import { apiFetch, fetchList, readError } from "@/lib/client/api";
import type { AdminUser } from "./user-quota-row";

type Run = {
  id: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  params: Record<string, unknown> | null;
};

type ConfigForm = Omit<Config, "id">;

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("pt-BR") : "—";
}

function fmtParams(params: Run["params"]): string {
  if (!params) return "—";
  const p = params as { configName?: unknown; maxVideos?: unknown; topK?: unknown; nDays?: unknown };
  return `${String(p.configName ?? "?")} · max ${String(p.maxVideos ?? "?")} · top ${String(p.topK ?? "?")} · ${String(p.nDays ?? "?")} dias`;
}

/**
 * Admin view of one account: edit/delete its configs and creators, star its videos and
 * list its recent runs. Every call carries `?userId=` so the API acts on (and audits) it.
 */
export function AccountPanel({ account }: { account: AdminUser }) {
  const q = `userId=${encodeURIComponent(account.id)}`;
  const [configs, setConfigs] = useState<Config[]>([]);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editingConfig, setEditingConfig] = useState<string | null>(null);
  const [configForm, setConfigForm] = useState<ConfigForm | null>(null);
  const [editingCreator, setEditingCreator] = useState<string | null>(null);
  const [creatorCategory, setCreatorCategory] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [c, cr, v, r] = await Promise.all([
      fetchList<Config>(`/api/configs?${q}`),
      fetchList<Creator>(`/api/creators?${q}`),
      fetchList<Video>(`/api/videos?${q}`),
      fetchList<Run>(`/api/admin/runs?${q}`),
    ]);
    setConfigs(c.items);
    setCreators(cr.items);
    setVideos(v.items);
    setRuns(r.items);
    setError(c.error ?? cr.error ?? v.error ?? r.error);
  }, [q]);

  useEffect(() => {
    setEditingConfig(null);
    setEditingCreator(null);
    setError(null);
    load();
  }, [load]);

  /** Sends a write for the selected account; reloads on success, shows the error otherwise. */
  async function write(path: string, init: RequestInit, fallback: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const sep = path.includes("?") ? "&" : "?";
      const res = await apiFetch(`${path}${sep}${q}`, {
        ...init,
        headers: { "Content-Type": "application/json" },
      });
      if (res.status === 401) return false;
      if (!res.ok) {
        setError(await readError(res, fallback));
        return false;
      }
      await load();
      return true;
    } catch {
      setError(fallback);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveConfig(id: string) {
    if (!configForm) return;
    const ok = await write(
      "/api/configs",
      { method: "PUT", body: JSON.stringify({ id, ...configForm }) },
      "Não foi possível salvar a config"
    );
    if (ok) setEditingConfig(null);
  }

  async function deleteConfig(c: Config) {
    if (!confirm(`Excluir a config "${c.configName}" da conta ${account.email}?`)) return;
    await write(`/api/configs?id=${c.id}`, { method: "DELETE" }, "Não foi possível excluir a config");
  }

  async function saveCreator(id: string) {
    const ok = await write(
      "/api/creators",
      { method: "PUT", body: JSON.stringify({ id, category: creatorCategory }) },
      "Não foi possível salvar o criador"
    );
    if (ok) setEditingCreator(null);
  }

  async function deleteCreator(c: Creator) {
    if (!confirm(`Excluir @${c.username} da conta ${account.email}?`)) return;
    await write(`/api/creators?id=${c.id}`, { method: "DELETE" }, "Não foi possível excluir o criador");
  }

  async function toggleStar(v: Video) {
    await write(
      "/api/videos",
      { method: "PATCH", body: JSON.stringify({ id: v.id, starred: !v.starred }) },
      "Não foi possível marcar o vídeo"
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-amber-500/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Conta selecionada:</span>
        <span className="font-semibold">{account.email}</span>
        <span className="text-sm text-muted-foreground">({account.name})</span>
        {!account.active && <Badge variant="destructive">inativa</Badge>}
        <span className="text-xs text-amber-500">
          Alterações feitas aqui valem para esta conta e ficam registradas na auditoria.
        </span>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}

      <Tabs defaultValue="configs">
        <TabsList>
          <TabsTrigger value="configs">Configs ({configs.length})</TabsTrigger>
          <TabsTrigger value="creators">Criadores ({creators.length})</TabsTrigger>
          <TabsTrigger value="videos">Vídeos ({videos.length})</TabsTrigger>
          <TabsTrigger value="runs">Execuções ({runs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="configs" className="space-y-3">
          {configs.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma config.</p>}
          {configs.map((c) =>
            editingConfig === c.id && configForm ? (
              <div key={c.id} className="space-y-2 rounded-md border p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor={`cfg-name-${c.id}`}>Nome</Label>
                    <Input
                      id={`cfg-name-${c.id}`}
                      maxLength={200}
                      value={configForm.configName}
                      onChange={(e) => setConfigForm({ ...configForm, configName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`cfg-cat-${c.id}`}>Categoria de criadores</Label>
                    <Input
                      id={`cfg-cat-${c.id}`}
                      maxLength={200}
                      value={configForm.creatorsCategory}
                      onChange={(e) => setConfigForm({ ...configForm, creatorsCategory: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`cfg-an-${c.id}`}>Instrução de análise</Label>
                  <Textarea
                    id={`cfg-an-${c.id}`}
                    rows={6}
                    maxLength={20000}
                    value={configForm.analysisInstruction}
                    onChange={(e) => setConfigForm({ ...configForm, analysisInstruction: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`cfg-nc-${c.id}`}>Instrução de novos conceitos</Label>
                  <Textarea
                    id={`cfg-nc-${c.id}`}
                    rows={6}
                    maxLength={20000}
                    value={configForm.newConceptsInstruction}
                    onChange={(e) => setConfigForm({ ...configForm, newConceptsInstruction: e.target.value })}
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" disabled={busy || !configForm.configName.trim()} onClick={() => saveConfig(c.id)}>
                    Salvar
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => setEditingConfig(null)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <div key={c.id} className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <div className="font-medium">{c.configName}</div>
                  <div className="text-xs text-muted-foreground">
                    categoria: {c.creatorsCategory || "—"}
                  </div>
                </div>
                <div className="space-x-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      setEditingConfig(c.id);
                      setConfigForm({
                        configName: c.configName,
                        creatorsCategory: c.creatorsCategory,
                        analysisInstruction: c.analysisInstruction,
                        newConceptsInstruction: c.newConceptsInstruction,
                      });
                    }}
                  >
                    Editar
                  </Button>
                  <Button size="sm" variant="destructive" disabled={busy} onClick={() => deleteConfig(c)}>
                    Excluir
                  </Button>
                </div>
              </div>
            )
          )}
        </TabsContent>

        <TabsContent value="creators">
          {creators.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum criador.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Seguidores</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {creators.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>@{c.username}</TableCell>
                    <TableCell>
                      {editingCreator === c.id ? (
                        <Input
                          aria-label={`Categoria de @${c.username}`}
                          className="w-48"
                          maxLength={200}
                          value={creatorCategory}
                          onChange={(e) => setCreatorCategory(e.target.value)}
                        />
                      ) : (
                        c.category || "—"
                      )}
                    </TableCell>
                    <TableCell>{c.followers.toLocaleString("pt-BR")}</TableCell>
                    <TableCell className="space-x-2 text-right">
                      {editingCreator === c.id ? (
                        <>
                          <Button size="sm" disabled={busy} onClick={() => saveCreator(c.id)}>
                            Salvar
                          </Button>
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => setEditingCreator(null)}>
                            Cancelar
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => {
                              setEditingCreator(c.id);
                              setCreatorCategory(c.category);
                            }}
                          >
                            Editar
                          </Button>
                          <Button size="sm" variant="destructive" disabled={busy} onClick={() => deleteCreator(c)}>
                            Excluir
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="videos">
          {videos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum vídeo.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Criador</TableHead>
                  <TableHead>Config</TableHead>
                  <TableHead>Views</TableHead>
                  <TableHead>Adicionado</TableHead>
                  <TableHead className="text-right">Destaque</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {videos.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell>
                      {/^https:\/\//i.test(v.link) ? (
                        <a href={v.link} target="_blank" rel="noopener noreferrer" className="underline">
                          @{v.creator}
                        </a>
                      ) : (
                        `@${v.creator}`
                      )}
                    </TableCell>
                    <TableCell>{v.configName}</TableCell>
                    <TableCell>{v.views.toLocaleString("pt-BR")}</TableCell>
                    <TableCell>{v.dateAdded || "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        aria-label={v.starred ? "Remover destaque" : "Destacar"}
                        onClick={() => toggleStar(v)}
                      >
                        <Star className={v.starred ? "h-4 w-4 fill-amber-400 text-amber-400" : "h-4 w-4"} />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="runs">
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma execução.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Início</TableHead>
                  <TableHead>Fim</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Parâmetros</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{fmtDate(r.startedAt)}</TableCell>
                    <TableCell>{fmtDate(r.finishedAt)}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === "failed" || r.status === "timed_out" ? "destructive" : "secondary"}>
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{fmtParams(r.params)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
