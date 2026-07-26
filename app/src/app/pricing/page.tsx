
"use client";

import { useState, useEffect } from "react";
import { BASE_URL } from "@/lib/config";
import { useAuth } from "@/context/auth-context";
import { 
  Check, 
  Zap, 
  Crown, 
  Sparkles, 
  Rocket, 
  CreditCard,
  ShieldCheck,
  ChevronRight,
  ArrowRight,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Plan {
  id: number;
  name: string;
  price: number;
  description: string | null;
  igReelCredits: number;
  igCreatorCredits: number;
  fbAdCredits: number;
  liAnalysisCredits: number;
  isDefault: boolean;
  durationDays: number | null;
}

export default function PricingPage() {
  const { token, user } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  // const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

  useEffect(() => {
    fetch(`${BASE_URL}/admin/plans`) // Publicly accessible or through user token
      .then(r => r.json())
      .then(json => {
        if (Array.isArray(json.data)) {
          setPlans(json.data);
        }
      })
      .finally(() => setLoading(false));
  }, [BASE_URL]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-16 sm:px-6 lg:px-8 space-y-16">
      {user && <UsageDashboard user={user} />}

      <div className="text-center space-y-4">
        <Badge variant="secondary" className="rounded-full px-4 py-1 bg-orange-500/10 text-orange-400 border-orange-500/20 text-xs font-bold uppercase tracking-widest">
          Pricing Plans
        </Badge>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">
          Scale your content strategy
        </h1>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
          Choose the perfect plan to supercharge your competitor research and AI analysis.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {plans.map((plan) => (
          <PlanCard 
            key={plan.id} 
            plan={plan} 
            isCurrent={user?.planId === plan.id || (!user?.planId && plan.isDefault)}
          />
        ))}

        {/* Custom Solution Card if no plans or as a placeholder */}
        {plans.length === 0 && (
          <div className="col-span-full py-20 text-center glass rounded-[2.5rem] border-dashed border-2 border-border/50">
            <Rocket className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
            <h3 className="text-xl font-bold">No public plans available</h3>
            <p className="text-muted-foreground text-sm">Contact our team for a custom enterprise solution.</p>
          </div>
        )}
      </div>

      <div className="glass rounded-[3rem] p-10 md:p-16 border border-orange-500/20 bg-gradient-to-br from-orange-500/[0.05] via-transparent to-red-500/[0.05] relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/10 blur-[100px] rounded-full -mr-32 -mt-32 transition-all group-hover:bg-orange-500/20" />
        <div className="relative flex flex-col md:flex-row items-center justify-between gap-12">
          <div className="space-y-6 text-center md:text-left max-w-xl">
            <div className="flex justify-center md:justify-start">
              <div className="p-3 rounded-2xl bg-orange-500/10 text-orange-400">
                <Rocket className="h-8 w-8" />
              </div>
            </div>
            <h3 className="text-3xl md:text-4xl font-black tracking-tight">Enterprise & Custom Needs?</h3>
            <p className="text-muted-foreground text-lg leading-relaxed">
              Need more credits for a large agency? We offer custom volume-based pricing, dedicated support, and higher rate limits for teams requiring high-frequency analysis.
            </p>
          </div>
          <Button className="h-16 px-10 rounded-2xl bg-foreground text-background hover:bg-foreground/90 font-black text-lg gap-3 shadow-2xl shadow-foreground/10 transition-all active:scale-95 shrink-0">
            Contact Sales
            <ArrowRight className="h-6 w-6" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function UsageDashboard({ user }: { user: any }) {
  return (
    <div className="glass rounded-[2.5rem] border-orange-500/20 p-8 md:p-10 mb-20 relative overflow-hidden bg-gradient-to-br from-background/80 to-muted/20">
      <div className="absolute top-0 right-4 p-4">
        <Sparkles className="h-12 w-12 text-orange-500/10 opacity-50" />
      </div>
      
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10 pb-8 border-b border-border/10">
        <div>
          <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/20 mb-3 px-3">Active Account Status</Badge>
          <h2 className="text-3xl font-black tracking-tight">Current Usage & Credits</h2>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-1">Total Available Balance</p>
          <p className="text-xs font-medium text-orange-400">Calculated based on your {user.plan?.name || "current"} plan</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <CreditStatCard 
          label="IG Reels & Analysis" 
          value={user.igReelCredits} 
          color="orange" 
          description="Consolidated Instagram credits"
        />
        <CreditStatCard 
          label="Ad Insights" 
          value={user.fbAdCredits} 
          color="blue" 
          description="Facebook Ads processed"
        />
        <CreditStatCard 
          label="LinkedIn Strategy" 
          value={user.liAnalysisCredits} 
          color="purple" 
          description="B2B analysis reports"
        />
        <CreditStatCard 
          label="Instagram Info" 
          value={user.igCreatorCredits} 
          color="red" 
          description="Creator profile scrapes"
        />
      </div>
    </div>
  );
}

function CreditStatCard({ label, value, color, description }: { label: string; value: number; color: string; description: string }) {
  const colorMap: Record<string, string> = {
    orange: "from-orange-500/20 to-orange-500/5 text-orange-400 border-orange-500/20",
    blue: "from-blue-500/20 to-blue-500/5 text-blue-400 border-blue-500/20",
    purple: "from-violet-500/20 to-violet-500/5 text-violet-400 border-violet-500/20",
    red: "from-red-500/20 to-red-500/5 text-red-400 border-red-500/20",
  };

  return (
    <div className={`p-6 rounded-3xl border bg-gradient-to-br ${colorMap[color]} transition-all duration-300 hover:scale-[1.02] shadow-sm`}>
      <p className="text-[10px] font-black uppercase tracking-widest mb-4 opacity-70">{label}</p>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-4xl font-black tracking-tighter text-foreground">{value ?? 0}</span>
        <span className="text-[10px] opacity-60 font-bold uppercase">Left</span>
      </div>
      <p className="text-[9px] font-medium opacity-50">{description}</p>
    </div>
  );
}

function PlanCard({ plan, isCurrent }: { plan: Plan; isCurrent: boolean }) {
  const isPaid = plan.price > 0;
  
  return (
    <div className={`relative flex flex-col p-8 rounded-[2.5rem] border transition-all duration-300 ${
      isCurrent 
        ? "border-orange-500/50 bg-orange-500/[0.03] shadow-2xl shadow-orange-500/10 ring-1 ring-orange-500/20" 
        : "border-border/50 bg-background/50 hover:border-orange-500/20 hover:bg-foreground/[0.01]"
    }`}>
      {isCurrent && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2">
          <Badge className="bg-orange-500 text-white border-0 py-1 px-4 rounded-full text-[10px] font-black uppercase tracking-widest">
            Your Current Plan
          </Badge>
        </div>
      )}

      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className={`p-3 rounded-2xl ${isPaid ? "bg-orange-500/10 text-orange-400" : "bg-muted text-muted-foreground"}`}>
            {isPaid ? <Crown className="h-6 w-6" /> : <Zap className="h-6 w-6" />}
          </div>
        </div>
        <h3 className="text-2xl font-black">{plan.name}</h3>
        <p className="text-sm text-muted-foreground mt-2 min-h-[40px]">{plan.description || "The baseline for individual creators."}</p>
      </div>

      <div className="mb-8 flex items-baseline gap-1">
        <span className="text-5xl font-black">${plan.price}</span>
        <span className="text-muted-foreground font-medium">/{plan.durationDays || 30} days</span>
      </div>

      <div className="flex-1 space-y-4 mb-8">
        <FeatureItem label={`${plan.igReelCredits} IG Reels & Deep Analysis`} />
        <FeatureItem label={`${plan.igCreatorCredits} Creator Profile Scrapes`} />
        <FeatureItem label={`${plan.fbAdCredits} Facebook Ads Analyzed`} />
        <FeatureItem label={`${plan.liAnalysisCredits} LinkedIn Strategy Reports`} />
      </div>

      <Button 
        disabled={isCurrent}
        className={`w-full h-14 rounded-2xl font-black text-sm transition-all duration-300 ${
          isCurrent 
            ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 cursor-default" 
            : isPaid
              ? "bg-orange-500 text-white hover:bg-orange-600 shadow-lg shadow-orange-500/25"
              : "bg-foreground text-background hover:bg-foreground/90 shadow-lg"
        }`}
      >
        {isCurrent ? (
          <span className="flex items-center gap-2">
            <Check className="h-5 w-5" /> Active
          </span>
        ) : (
          plan.price > 0 ? "Upgrade Now" : "Get Started"
        )}
      </Button>
    </div>
  );
}

function FeatureItem({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-5 w-5 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
        <Check className="h-3 w-3 text-emerald-500" />
      </div>
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}
