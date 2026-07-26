"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, CreditCard, ArrowRight } from "lucide-react";
import Link from "next/link";

interface CreditModalProps {
  isOpen: boolean;
  onClose: () => void;
  type?: string;
}

export function CreditModal({ isOpen, onClose, type = "analysis" }: CreditModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[420px] rounded-3xl glass-card p-0 overflow-hidden border-orange-500/20 shadow-2xl shadow-orange-500/10">
        <div className="relative h-32 w-full overflow-hidden bg-gradient-to-br from-orange-500/20 via-red-500/20 to-orange-500/20">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="p-4 rounded-2xl bg-background/60 backdrop-blur-xl border border-white/20 shadow-xl">
              <Sparkles className="h-10 w-10 text-orange-500 animate-pulse" />
            </div>
          </div>
          {/* Animated particles or glow */}
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-from)_0%,_transparent_70%)] from-orange-500/10" />
        </div>

        <div className="p-6 text-center">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-center mb-2">
              Out of Credits!
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-center">
              You've used all your free {type} credits for this period. 
              Upgrade your plan now to unlock unlimited AI power and continue your research.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-8 space-y-3">
            <Link href="/pricing" className="block" onClick={onClose}>
              <Button className="w-full h-12 rounded-xl bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white font-bold text-base shadow-lg shadow-orange-500/25 gap-2 border-none">
                View Pricing Plans
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Button 
               variant="ghost" 
               onClick={onClose}
               className="w-full h-11 rounded-xl text-muted-foreground hover:text-foreground"
            >
              Maybe later
            </Button>
          </div>

          <div className="mt-6 flex items-center justify-center gap-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest bg-muted/30 py-3 rounded-2xl border border-border/30">
             <div className="flex items-center gap-1.5">
               <CreditCard className="h-3 w-3" />
               Secure Checkout
             </div>
             <div className="w-px h-3 bg-border" />
             <div className="flex items-center gap-1.5">
               <Sparkles className="h-3 w-3" />
               Instant Activation
             </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
