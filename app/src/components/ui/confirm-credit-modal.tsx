"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2 } from "lucide-react";

interface ConfirmCreditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  creditCost?: string;  
  confirmText?: string;
  loading?: boolean;
}

export function ConfirmCreditModal({
  open,
  onOpenChange,
  onConfirm,
  title = "Confirm Action",
  description = "This action will consume system API credits.",
  creditCost = "1 Credit",
  confirmText = "Proceed",
  loading = false,
}: ConfirmCreditModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong rounded-2xl border-orange-500/30 w-[95%] sm:max-w-md mx-auto shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-orange-500">
            <AlertTriangle className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground mt-2">
            {description}
          </DialogDescription>
        </DialogHeader>
        
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 my-4 flex justify-between items-center">
          <span className="text-sm font-semibold text-orange-200">Estimated Cost:</span>
          <span className="text-sm font-bold text-orange-400 bg-orange-500/20 px-3 py-1 rounded-full">
            {creditCost}
          </span>
        </div>

        <div className="flex gap-3 justify-end mt-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="rounded-xl border border-border/40 hover:bg-muted/50"
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              onConfirm();
            }}
            disabled={loading}
            className="rounded-xl bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white border-0"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {confirmText}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
