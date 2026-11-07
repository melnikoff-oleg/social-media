"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserQuotaRow, type AdminUser } from "./user-quota-row";
import { AccountPanel } from "./account-panel";

export function AdminUsers({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");

  useEffect(() => {
    fetch("/api/admin/users")
      .then(async (r) => {
        if (!r.ok) throw new Error();
        setUsers(await r.json());
      })
      .catch(() => setError("Não foi possível carregar os usuários"));
  }, []);

  const term = search.trim().toLowerCase();
  const visible = (users ?? []).filter((u) => u.email.toLowerCase().includes(term));
  const selected = (users ?? []).find((u) => u.id === selectedId);

  return (
    <div className="space-y-4">
      <Input
        placeholder="Buscar por e-mail"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      {users && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuário</TableHead>
              <TableHead>Papel</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Uso hoje</TableHead>
              <TableHead>Limite runs/dia</TableHead>
              <TableHead>Limite vídeos/dia</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((u) => (
              <UserQuotaRow
                key={u.id}
                user={u}
                isSelf={u.id === currentUserId}
                onChange={(upd) =>
                  setUsers((prev) => prev && prev.map((x) => (x.id === upd.id ? { ...x, ...upd } : x)))
                }
              />
            ))}
          </TableBody>
        </Table>
      )}
      {users && (
        <div className="space-y-3 pt-4">
          <div>
            <h2 className="text-lg font-semibold">Gerenciar conta</h2>
            <p className="text-sm text-muted-foreground">
              Escolha uma conta para ver e alterar configs, criadores, vídeos e execuções.
            </p>
          </div>
          <select
            aria-label="Conta a gerenciar"
            className="h-9 w-full max-w-sm rounded-md border bg-background px-3 text-sm"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            <option value="">Selecione uma conta…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.email}
                {u.id === currentUserId ? " (você)" : ""}
              </option>
            ))}
          </select>
          {selected && <AccountPanel key={selected.id} account={selected} />}
        </div>
      )}
    </div>
  );
}
