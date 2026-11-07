import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { getSessionUser } from "@/lib/auth/session";
import { AdminUsers } from "./admin-users";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
  const user = await getSessionUser(token);
  if (!user || user.role !== "admin") redirect("/login");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground">Usuários, uso de hoje e limites diários.</p>
      </div>
      <AdminUsers currentUserId={user.id} />
    </div>
  );
}
