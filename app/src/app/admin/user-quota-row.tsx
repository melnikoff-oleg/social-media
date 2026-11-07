"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableCell, TableRow } from "@/components/ui/table";

export type AdminUser = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "user";
  active: boolean;
  dailyRunsLimit: number;
  dailyVideosLimit: number;
  usageToday: { runs: number; videos: number };
};

const MAX_QUOTA = 10000;

function validQuota(v: string): boolean {
  return /^\d+$/.test(v) && Number(v) <= MAX_QUOTA;
}

export function UserQuotaRow({
  user,
  isSelf,
  onChange,
}: {
  user: AdminUser;
  isSelf: boolean;
  onChange: (updated: Partial<AdminUser> & { id: string }) => void;
}) {
  const isAdmin = user.role === "admin";
  const [runs, setRuns] = useState(String(user.dailyRunsLimit));
  const [videos, setVideos] = useState(String(user.dailyVideosLimit));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const dirty = runs !== String(user.dailyRunsLimit) || videos !== String(user.dailyVideosLimit);
  const valid = validQuota(runs) && validQuota(videos);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: user.id, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Falha ao salvar");
        return;
      }
      onChange({
        id: user.id,
        active: data.active,
        dailyRunsLimit: data.dailyRunsLimit,
        dailyVideosLimit: data.dailyVideosLimit,
      });
      setRuns(String(data.dailyRunsLimit));
      setVideos(String(data.dailyVideosLimit));
    } catch {
      setError("Falha ao salvar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{user.email}</div>
        <div className="text-xs text-muted-foreground">{user.name}</div>
        {error && <div className="text-xs text-red-400">{error}</div>}
      </TableCell>
      <TableCell>
        <Badge variant={isAdmin ? "default" : "secondary"}>{isAdmin ? "admin" : "usuário"}</Badge>
      </TableCell>
      <TableCell>
        <Badge variant={user.active ? "secondary" : "destructive"}>
          {user.active ? "ativo" : "inativo"}
        </Badge>
      </TableCell>
      <TableCell>
        {user.usageToday.runs} runs / {user.usageToday.videos} vídeos
      </TableCell>
      {isAdmin ? (
        <TableCell colSpan={2} className="text-muted-foreground">
          sem limite
        </TableCell>
      ) : (
        <>
          <TableCell>
            <Input
              aria-label={`Limite diário de runs de ${user.email}`}
              className="w-24"
              inputMode="numeric"
              value={runs}
              onChange={(e) => setRuns(e.target.value)}
            />
          </TableCell>
          <TableCell>
            <Input
              aria-label={`Limite diário de vídeos de ${user.email}`}
              className="w-24"
              inputMode="numeric"
              value={videos}
              onChange={(e) => setVideos(e.target.value)}
            />
          </TableCell>
        </>
      )}
      <TableCell className="space-x-2 text-right">
        {!isAdmin && (
          <Button
            size="sm"
            disabled={busy || !dirty || !valid}
            onClick={() => patch({ dailyRunsLimit: Number(runs), dailyVideosLimit: Number(videos) })}
          >
            Salvar
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={busy || isSelf}
          title={isSelf ? "Você não pode desativar a própria conta" : undefined}
          onClick={() => patch({ active: !user.active })}
        >
          {user.active ? "Desativar" : "Ativar"}
        </Button>
      </TableCell>
    </TableRow>
  );
}
