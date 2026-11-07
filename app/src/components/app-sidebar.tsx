"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Film, Play, Users, Settings2, ShieldCheck, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuotaBadge } from "@/components/quota-badge";
import { fetchList } from "@/lib/client/api";
import { useMe } from "@/lib/client/use-me";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";

const navItems = [
  { title: "Videos", href: "/videos", icon: Film },
  { title: "Run Pipeline", href: "/run", icon: Play },
  { title: "Creators", href: "/creators", icon: Users },
  { title: "Configs", href: "/configs", icon: Settings2 },
];
const adminItem = { title: "Admin", href: "/admin", icon: ShieldCheck };

export function AppSidebar() {
  const pathname = usePathname();
  const [lastRun, setLastRun] = useState<string | null>(null);
  const me = useMe();
  const isAdmin = me?.role === "admin";
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    fetchList<{ dateAdded: string }>("/api/videos").then(({ items }) => {
      if (items.length > 0 && items[0].dateAdded) {
        setLastRun(items[0].dateAdded);
      }
    });
  }, []);

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // the cookie may still be valid, but leave for /login either way
    }
    window.location.assign("/login");
  }

  return (
    <Sidebar className="border-r border-white/[0.06]">
      <SidebarHeader className="px-5 py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 glow-sm">
            <Film className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight">Virality System</h1>
            <p className="text-[11px] text-muted-foreground">Instagram Reels AI</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="px-3">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {(isAdmin ? [...navItems, adminItem] : navItems).map((item) => {
                const isActive = pathname === item.href;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      className="h-10 rounded-xl px-3 transition-all duration-200"
                    >
                      <Link href={item.href}>
                        <item.icon className="h-4 w-4" />
                        <span className="text-[13px]">{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="space-y-3 px-5 py-4">
        {me && (
          <p className="truncate text-xs font-medium" title={me.email}>
            {me.name || me.email}
          </p>
        )}
        <QuotaBadge me={me} />
        {lastRun && (
          <p className="text-[11px] text-muted-foreground">
            Last pipeline: <span className="text-foreground/70">{lastRun}</span>
          </p>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={logout}
          disabled={loggingOut}
          className="w-full justify-start gap-2 rounded-xl text-xs text-muted-foreground hover:text-foreground"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sair
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
