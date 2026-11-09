"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Play, Loader2, CheckCircle2, XCircle, Terminal, Zap, ChevronDown, ArrowRight, Film, AlertTriangle } from "lucide-react";
import { usePipeline, limitedToMessage } from "@/context/pipeline-context";
import { QuotaBadge } from "@/components/quota-badge";
import { fetchList } from "@/lib/client/api";
import { useMe } from "@/lib/client/use-me";
import { DEFAULT_CONCEPT_PROVIDER, type Config, type ConceptProvider } from "@/lib/types";

const PROVIDER_OPTIONS: { value: ConceptProvider; label: string }[] = [
  { value: "claude", label: "Claude (Anthropic)" },
  { value: "deepseek", label: "DeepSeek" },
];

function formatViews(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toString();
}

export default function RunPage() {
  const [configs, setConfigs] = useState<Config[]>([]);
  const [selectedConfig, setSelectedConfig] = useState("");
  const [maxVideos, setMaxVideos] = useState(20);
  const [topK, setTopK] = useState(3);
  const [nDays, setNDays] = useState(30);
  const [provider, setProvider] = useState<ConceptProvider>(DEFAULT_CONCEPT_PROVIDER);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  const { running, progress, runPipeline } = usePipeline();

  const me = useMe();
  const [configsError, setConfigsError] = useState<string | null>(null);

  useEffect(() => {
    fetchList<Config>("/api/configs").then((r) => {
      setConfigs(r.items);
      setConfigsError(r.error);
    });
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [progress?.log.length]);

  const handleRun = () => {
    if (!selectedConfig) return;
    runPipeline({ configName: selectedConfig, maxVideos, topK, nDays, provider });
  };

  const totalProgress = progress
    ? progress.phase === "scraping"
      ? progress.creatorsTotal > 0 ? (progress.creatorsScraped / progress.creatorsTotal) * 40 : 0
      : progress.videosTotal > 0 ? 40 + (progress.videosAnalyzed / progress.videosTotal) * 60 : 40
    : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Executar pipeline</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Analise o conteúdo dos concorrentes e gere novos conceitos de vídeo
        </p>
        <div className="mt-3">
          <QuotaBadge me={me} />
        </div>
      </div>

      {/* Config Form */}
      <div className="glass rounded-2xl p-6 space-y-6">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-purple-400" />
          <h2 className="text-sm font-semibold">Configuração do pipeline</h2>
        </div>

        <div className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">Configuração</Label>
            <Select value={selectedConfig} onValueChange={setSelectedConfig}>
              <SelectTrigger className="mt-1.5 rounded-xl glass border-white/[0.08] h-11">
                <SelectValue placeholder="Selecione uma configuração..." />
              </SelectTrigger>
              <SelectContent>
                {configs.map((c) => (
                  <SelectItem key={c.id} value={c.configName}>{c.configName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {configsError && (
              <p role="alert" className="mt-1.5 text-xs text-red-400">{configsError}</p>
            )}
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Modelo de conceitos</Label>
            <Select value={provider} onValueChange={(v) => setProvider(v as ConceptProvider)}>
              <SelectTrigger className="mt-1.5 rounded-xl glass border-white/[0.08] h-11">
                <SelectValue placeholder="Selecione um modelo..." />
              </SelectTrigger>
              <SelectContent>
                {PROVIDER_OPTIONS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${showAdvanced ? "rotate-180" : ""}`} />
            Configurações avançadas
          </button>

          {showAdvanced && (
            <div className="grid gap-4 md:grid-cols-3 animate-in fade-in slide-in-from-top-2 duration-200">
              <div>
                <Label className="text-xs text-muted-foreground">Máx. de vídeos por criador</Label>
                <Input
                  type="number"
                  value={maxVideos}
                  onChange={(e) => setMaxVideos(Number(e.target.value))}
                  min={1}
                  max={100}
                  className="mt-1.5 rounded-xl glass border-white/[0.08] h-11"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Top K para analisar</Label>
                <Input
                  type="number"
                  value={topK}
                  onChange={(e) => setTopK(Number(e.target.value))}
                  min={1}
                  max={10}
                  className="mt-1.5 rounded-xl glass border-white/[0.08] h-11"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Dias de histórico</Label>
                <Input
                  type="number"
                  value={nDays}
                  onChange={(e) => setNDays(Number(e.target.value))}
                  min={1}
                  max={365}
                  className="mt-1.5 rounded-xl glass border-white/[0.08] h-11"
                />
              </div>
            </div>
          )}

          <Button
            onClick={handleRun}
            disabled={running || !selectedConfig}
            size="lg"
            className="w-full rounded-xl h-12 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 border-0 glow-sm transition-all duration-300 hover:glow text-sm font-semibold"
          >
            {running ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Executando pipeline...
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Executar pipeline
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Progress */}
      {progress && (
        <div className="space-y-4">
          {/* Status card */}
          <div className="glass rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {progress.status === "running" && <Loader2 className="h-4 w-4 text-purple-400 animate-spin" />}
                {progress.status === "completed" && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                {progress.status === "error" && <XCircle className="h-4 w-4 text-red-400" />}
                <h2 className="text-sm font-semibold">
                  {progress.status === "running" && progress.phase === "scraping" && "Buscando criadores..."}
                  {progress.status === "running" && progress.phase === "analyzing" && "Analisando vídeos..."}
                  {progress.status === "completed" && "Pipeline concluído"}
                  {progress.status === "error" && "Falha no pipeline"}
                </h2>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {progress.phase === "scraping" && (
                  <span>Criadores: <span className="text-foreground">{progress.creatorsScraped}/{progress.creatorsTotal}</span></span>
                )}
                {(progress.phase === "analyzing" || progress.phase === "done") && (
                  <span>Vídeos: <span className="text-foreground">{progress.videosAnalyzed}/{progress.videosTotal}</span></span>
                )}
                {progress.errors.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-red-400">
                    <AlertTriangle className="h-3 w-3" />
                    {progress.errors.length}
                  </span>
                )}
              </div>
            </div>

            {/* Progress bar */}
            <div>
              <div className="h-2 rounded-full bg-white/[0.05] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    progress.status === "completed"
                      ? "bg-gradient-to-r from-emerald-500 to-teal-500"
                      : progress.status === "error"
                      ? "bg-gradient-to-r from-red-500 to-orange-500"
                      : "bg-gradient-to-r from-purple-500 to-indigo-500"
                  }`}
                  style={{ width: `${progress.status === "completed" ? 100 : totalProgress}%` }}
                />
              </div>
            </div>

            {/* Active tasks */}
            {progress.activeTasks.length > 0 && (
              <div className="space-y-2">
                {progress.activeTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-3 rounded-xl bg-white/[0.03] border border-white/[0.04] px-3 py-2"
                  >
                    <Loader2 className="h-3 w-3 text-purple-400 animate-spin shrink-0" />
                    <span className="text-xs font-medium text-foreground/80">@{task.creator}</span>
                    <span className="text-[11px] text-muted-foreground">{task.step}</span>
                    {task.views && (
                      <span className="ml-auto text-[11px] text-muted-foreground/60">
                        {formatViews(task.views)} visualizações
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Daily video quota cut the selection short */}
            {progress.limitedTo !== undefined && (
              <p className="rounded-xl bg-amber-500/5 border border-amber-500/10 p-3 text-[11px] text-amber-400">
                {limitedToMessage(progress.limitedTo)}
              </p>
            )}

            {/* Completion CTA */}
            {progress.status === "completed" && progress.videosAnalyzed > 0 && (
              <Button asChild className="w-full rounded-xl h-11 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 border-0 font-semibold gap-2">
                <Link href="/videos">
                  <Film className="h-4 w-4" />
                  Ver {progress.videosAnalyzed} novos vídeos
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            )}

            {/* Errors summary */}
            {progress.errors.length > 0 && (
              <div className="rounded-xl bg-red-500/5 border border-red-500/10 p-3 space-y-1">
                <p className="text-[11px] font-medium text-red-400">Erros ({progress.errors.length})</p>
                {progress.errors.map((err, i) => (
                  <p key={i} className="text-[11px] text-red-400/70 leading-relaxed">{err}</p>
                ))}
              </div>
            )}
          </div>

          {/* Log — collapsible */}
          <details className="glass rounded-2xl overflow-hidden">
            <summary className="p-4 flex items-center gap-2 cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors">
              <Terminal className="h-4 w-4" />
              <span className="font-medium">Registro</span>
              <Badge variant="secondary" className="ml-auto rounded-md text-[10px] bg-white/[0.05] border border-white/[0.06]">
                {progress.log.length} entradas
              </Badge>
            </summary>
            <div className="border-t border-white/[0.06]">
              <ScrollArea className="h-[300px] p-4">
                <div className="space-y-0.5 font-mono text-[11px]">
                  {progress.log.map((line, i) => (
                    <div
                      key={i}
                      className={`leading-5 ${
                        /erro|error/i.test(line)
                          ? "text-red-400"
                          : /conclu[ií]d|done|complete/i.test(line)
                          ? "text-emerald-400/80"
                          : "text-muted-foreground"
                      }`}
                    >
                      {line}
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </div>
              </ScrollArea>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
