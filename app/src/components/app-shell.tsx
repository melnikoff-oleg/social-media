"use client";

import { usePathname } from "next/navigation";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { TopBar } from "@/components/top-bar";

/** Sidebar + top bar around the page; the login page renders bare, without the shell. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname && (pathname === "/login" || pathname.startsWith("/login/"))) return <>{children}</>;

  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="flex-1 overflow-auto min-h-screen">
        <TopBar />
        <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
      </main>
    </SidebarProvider>
  );
}
