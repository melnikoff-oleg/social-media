"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PipelineProvider } from "@/context/pipeline-context";
import { CreditModal } from "@/components/credit-modal";
import { PageTransition } from "@/components/page-transition";
import { Loader2 } from "lucide-react";

const PUBLIC_PATHS = ["/login", "/signup"];

export function RouteGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, showCreditModal, setShowCreditModal } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname?.startsWith(p + "/"));
  useEffect(() => {
    if (isLoading) return;
    
    if (!isAuthenticated && !isPublic) {
      router.replace("/login");
    }
    
    // Redirect away from login/signup if already authenticated
    if (isAuthenticated && isPublic) {
      router.replace("/");
    }
  }, [isAuthenticated, isLoading, isPublic, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050508]">
        <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
      </div>
    );
  }

  // Auth pages — plain, no sidebar
  if (isPublic) {
    return <PageTransition>{children}</PageTransition>;
  }

  // Not authenticated — spinner while redirect fires
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050508]">
        <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
      </div>
    );
  }


  // ── User routes — standard dashboard shell ──
  return (
    <PipelineProvider>
      <div className="flex flex-col min-h-screen bg-background">
        <AppSidebar />
        <main className="flex-1 w-full flex flex-col items-center">
          <div className="w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
            <PageTransition>{children}</PageTransition>
          </div>
        </main>
        
        <CreditModal
          isOpen={showCreditModal}
          onClose={() => setShowCreditModal(false)}
        />
      </div>
    </PipelineProvider>
  );
}
