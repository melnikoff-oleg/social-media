"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/context/auth-context";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Plus,
    Pencil,
    Trash2,
    Settings2,
    Loader2,
    Search,
    MessageSquare,
    Sparkles,
    Zap
} from "lucide-react";
// import { toast } from "sonner";
import { toast } from "sonner";
import { handleCatchError, classifyError } from "@/lib/error-utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import type { PromptTemplate as Template } from "@/lib/types";

export default function TemplatesPage() {
    const { token } = useAuth();
    const [templates, setTemplates] = useState<Template[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<Template | null>(null);
    const [form, setForm] = useState({
        templateName: "",
        creatorsCategory: "",
        analysisInstruction: "",
        newConceptsInstruction: ""
    });
    const [description, setDescription] = useState("");
    const [isGenerating, setIsGenerating] = useState(false);
    const [saving, setSaving] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [pendingGenerated, setPendingGenerated] = useState<{ analysis: string; concepts: string } | null>(null);

    const loadTemplates = async () => {
        if (!token) return;
        setIsLoading(true);
        try {
            const response = await fetch("/api/templates", {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await response.json();
            if (Array.isArray(data)) {
                setTemplates(data);
            }
        } catch (err) {
            handleCatchError(err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (token) loadTemplates();
    }, [token]);

    const filteredTemplates = templates.filter((c) =>
        c.templateName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.creatorsCategory?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const openNew = () => {
        setEditing(null);
        setForm({
            templateName: "",
            creatorsCategory: "",
            analysisInstruction: "",
            newConceptsInstruction: ""
        });
        setDialogOpen(true);
        setPendingGenerated(null);
    };

    const openEdit = (template: Template) => {
        setEditing(template);
        setForm({
            templateName: template.templateName,
            creatorsCategory: template.creatorsCategory || "",
            analysisInstruction: template.analysisInstruction,
            newConceptsInstruction: template.newConceptsInstruction
        });
        setDialogOpen(true);
    };

    const handleSave = async () => {
        if (!form.templateName || !form.analysisInstruction || !form.newConceptsInstruction) {
            toast.error("⚠️ Missing Fields", { description: "Please fill in template name, analysis focus, and concept guidance." });
            return;
        }
        setSaving(true);
        try {
            const method = editing ? "PUT" : "POST";
            const url = editing ? `/api/templates/${editing.templateName}` : "/api/templates";

            const response = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(form),
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.message || "Save failed");
            }

            toast.success(editing ? "Template updated successfully!" : "Template created!");
            setDialogOpen(false);
            loadTemplates();
        } catch (err) {
            handleCatchError(err);
        } finally {
            setSaving(false);
        }
    };

    const handleGenerateAI = async () => {
        if (!description.trim()) {
            toast.error("⚠️ Description Required", { description: "Please describe your brand or niche so AI can generate relevant instructions." });
            return;
        }

        if (form.analysisInstruction || form.newConceptsInstruction) {
            if (!confirm("This will overwrite your current instructions. Continue?")) return;
        }

        setIsGenerating(true);
        try {
            const response = await fetch("/api/templates/generate", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ description }),
            });

            if (!response.ok) throw new Error("Generation failed");

            const data = await response.json();
            setPendingGenerated({
                analysis: data.analysisInstruction,
                concepts: data.newConceptsInstruction
            });
        } catch (err) {
            handleCatchError(err);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleDelete = async (templateName: string) => {
        if (!confirm(`Are you sure you want to delete template "${templateName}"?`)) return;
        try {
            const response = await fetch(`/api/templates/${templateName}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!response.ok) throw new Error("Delete failed");
            toast.success("🗑️ Template deleted");
            loadTemplates();
        } catch (err) {
            handleCatchError(err);
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex flex-wrap items-center gap-3">
                        Prompt Templates
                        <Badge variant="outline" className="text-[9px] sm:text-[10px] uppercase tracking-widest text-orange-600 dark:text-orange-400 border-orange-500/20 bg-orange-500/5 px-2">Intelligence</Badge>
                    </h1>
                    <p className="text-muted-foreground mt-1 text-xs sm:text-sm">
                        Manage Instagram analysis and concept generation guidelines
                    </p>
                </div>
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogTrigger asChild>
                        <Button onClick={openNew} className="w-full sm:w-auto rounded-xl h-10 sm:h-11 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 border-0 gap-2 shadow-lg shadow-orange-500/20 px-6 text-xs sm:text-sm">
                            <Plus className="h-4 w-4" />
                            New Template
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="w-[95vw] sm:max-w-[750px] max-h-[90vh] flex flex-col glass-strong border-border/50 rounded-2xl p-0 overflow-hidden">
                        <div className="shrink-0 bg-gradient-to-br from-orange-600/15 via-orange-500/10 to-transparent p-5 sm:p-7 border-b border-white/5 relative overflow-hidden">
                            {/* Decorative background flare */}
                            <div className="absolute -top-10 -right-10 h-32 w-32 bg-orange-500/10 rounded-full blur-3xl" />
                            <DialogHeader className="relative z-10">
                                <DialogTitle className="text-xl sm:text-2xl font-black tracking-tight text-foreground flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shadow-inner">
                                        {editing ? <Pencil className="h-5 w-5 text-orange-400" /> : <Plus className="h-5 w-5 text-orange-400" />}
                                    </div>
                                    <div className="flex flex-col">
                                        <span>{editing ? "Update Template" : "New Strategy"}</span>
                                        <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground/60 leading-none mt-1">Intelligence Prompt Configuration</span>
                                    </div>
                                </DialogTitle>
                            </DialogHeader>
                        </div>

                        <div className="flex-1 overflow-y-auto min-h-0">
                            <div className="p-5 sm:p-10 space-y-10">
                                {/* --- Section 1: Core Identity --- */}
                                <div className="space-y-6">
                                    <div className="flex items-center gap-3 border-b border-border/40 pb-2">
                                        <Settings2 className="h-4 w-4 text-orange-400" />
                                        <h3 className="text-xs font-bold uppercase tracking-widest text-foreground/70">1. Core Identity</h3>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                        <div className="grid gap-2.5">
                                            <Label htmlFor="name" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/80 px-1 ml-0.5">Template Name</Label>
                                            <Input
                                                id="name"
                                                placeholder="e.g. Dubai Luxury Real Estate"
                                                value={form.templateName}
                                                onChange={(e) => setForm({ ...form, templateName: e.target.value })}
                                                className="rounded-xl bg-foreground/[0.03] border-border/50 h-12 text-sm focus:ring-orange-500/50 focus:border-orange-500/30 transition-all font-medium"
                                            />
                                        </div>
                                        <div className="grid gap-2.5">
                                            <Label htmlFor="category" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/80 px-1 ml-0.5">Niche / Category</Label>
                                            <Input
                                                id="category"
                                                placeholder="e.g. real-estate"
                                                value={form.creatorsCategory}
                                                onChange={(e) => setForm({ ...form, creatorsCategory: e.target.value })}
                                                className="rounded-xl bg-foreground/[0.03] border-border/50 h-12 text-sm focus:ring-orange-500/50 focus:border-orange-500/30 transition-all font-medium"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* --- Section 2: AI Orchestration --- */}
                                <div className="space-y-6">
                                    <div className="flex items-center justify-between border-b border-border/40 pb-2">
                                        <div className="flex items-center gap-3">
                                            <Sparkles className="h-4 w-4 text-orange-400" />
                                            <h3 className="text-xs font-bold uppercase tracking-widest text-foreground/70">2. Strategy Generation</h3>
                                        </div>
                                        <Badge variant="outline" className="text-[8px] uppercase font-black border-orange-500/30 text-orange-400 bg-orange-500/5 px-2">AI Pilot</Badge>
                                    </div>

                                    <div className="relative group p-6 rounded-2xl bg-gradient-to-br from-orange-600/[0.03] to-orange-600/[0.03] border border-orange-500/10 hover:border-orange-500/20 transition-all duration-300">
                                        <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity">
                                            <Zap className="h-24 w-24" />
                                        </div>

                                        <div className="space-y-4 relative z-10">
                                            <div className="space-y-2">
                                                <Label htmlFor="brand-desc" className="text-[10px] font-bold text-orange-400 uppercase tracking-widest px-1">Describe your Brand or Objective</Label>
                                                <Textarea
                                                    id="brand-desc"
                                                    placeholder="e.g. A high-end demi-fine jewellery brand in India specializing in anti-tarnish gold plating..."
                                                    value={description}
                                                    onChange={(e) => setDescription(e.target.value)}
                                                    className="min-h-[100px] rounded-xl bg-background/50 border-border/50 resize-none p-4 text-sm focus:ring-orange-500/50 leading-relaxed font-medium"
                                                />
                                            </div>

                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={handleGenerateAI}
                                                disabled={isGenerating || !description.trim()}
                                                className="w-full rounded-xl border-orange-500/30 hover:bg-orange-500/10 text-orange-400 text-xs font-bold gap-2 h-11 transition-all duration-300 active:scale-95 shadow-sm"
                                            >
                                                {isGenerating ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Zap className="h-4 w-4 fill-orange-400" />
                                                )}
                                                {isGenerating ? "Gemini is Thinking..." : "Craft AI Instructions"}
                                            </Button>
                                        </div>
                                    </div>
                                </div>

                                {pendingGenerated && (
                                    <div className="space-y-4 p-5 rounded-2xl bg-orange-500/5 border border-orange-500/20 animate-in zoom-in duration-300">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Sparkles className="h-4 w-4 text-orange-400" />
                                                <span className="text-xs font-bold text-orange-300">New Strategy Preview</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => setPendingGenerated(null)}
                                                    className="h-8 rounded-lg text-[10px] font-bold text-muted-foreground hover:text-red-400"
                                                >
                                                    Discard
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    onClick={() => {
                                                        setForm(prev => ({
                                                            ...prev,
                                                            analysisInstruction: pendingGenerated.analysis,
                                                            newConceptsInstruction: pendingGenerated.concepts
                                                        }));
                                                        setPendingGenerated(null);
                                                    }}
                                                    className="h-8 rounded-lg text-[10px] font-bold bg-orange-500 hover:bg-orange-600 text-white px-4"
                                                >
                                                    Apply to Template
                                                </Button>
                                            </div>
                                        </div>

                                        <div className="grid gap-3 opacity-60 pointer-events-none scale-[0.98] origin-top">
                                            <div className="bg-background/40 rounded-lg p-3 border border-border/30">
                                                <p className="text-[9px] font-black text-orange-400/50 uppercase tracking-widest mb-1">Analysis</p>
                                                <p className="text-[11px] line-clamp-2 italic font-mono">{pendingGenerated.analysis}</p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* --- Section 3: Fine-Tuning --- */}
                                <div className="space-y-8">
                                    <div className="flex items-center gap-3 border-b border-border/40 pb-2">
                                        <MessageSquare className="h-4 w-4 text-emerald-400" />
                                        <h3 className="text-xs font-bold uppercase tracking-widest text-foreground/70">3. Instruction Fine-Tuning</h3>
                                    </div>

                                    <div className="grid gap-8">
                                        <div className="grid gap-3">
                                            <div className="flex items-center justify-between px-1">
                                                <Label htmlFor="analysis" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/80">Analysis Focus</Label>
                                                <span className="text-[9px] font-bold text-muted-foreground/40 italic">Determines how metrics & tactics are weighted</span>
                                            </div>
                                            <Textarea
                                                id="analysis"
                                                placeholder="Specific instructions for analyzing the viral elements..."
                                                value={form.analysisInstruction}
                                                onChange={(e) => setForm({ ...form, analysisInstruction: e.target.value })}
                                                className="min-h-[220px] rounded-2xl bg-foreground/[0.02] border-border/50 resize-none p-5 leading-relaxed font-mono text-[12px] focus:ring-orange-500/20 shadow-inner"
                                            />
                                        </div>

                                        <div className="grid gap-3">
                                            <div className="flex items-center justify-between px-1">
                                                <Label htmlFor="concepts" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/80">Concept Guidance</Label>
                                                <span className="text-[9px] font-bold text-muted-foreground/40 italic">Guidelines for the AI concept engine</span>
                                            </div>
                                            <Textarea
                                                id="concepts"
                                                placeholder="Guidance for creating new hybrid concepts..."
                                                value={form.newConceptsInstruction}
                                                onChange={(e) => setForm({ ...form, newConceptsInstruction: e.target.value })}
                                                className="min-h-[220px] rounded-2xl bg-foreground/[0.02] border-border/50 resize-none p-5 leading-relaxed font-mono text-[12px] focus:ring-orange-500/20 shadow-inner"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="shrink-0 p-3 sm:p-4 bg-foreground/[0.02] border-t border-border/30 flex flex-col sm:flex-row justify-end gap-2 px-6">
                            <Button
                                variant="ghost"
                                onClick={() => setDialogOpen(false)}
                                className="w-full sm:w-auto rounded-xl px-4 h-9 sm:h-10 text-[11px]"
                            >
                                Discard
                            </Button>
                            <Button
                                onClick={handleSave}
                                disabled={saving || !form.templateName || !form.analysisInstruction || !form.newConceptsInstruction}
                                className="w-full sm:w-auto rounded-xl h-9 sm:h-10 min-w-[120px] bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 border-0 shadow-lg shadow-orange-500/10 text-[11px] font-semibold"
                            >
                                {saving ? (
                                    <>
                                        <Loader2 className="mr-2 h-3.5 w-4 animate-spin" />
                                        Saving...
                                    </>
                                ) : (
                                    editing ? "Update Changes" : "Save Template"
                                )}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="relative w-full sm:max-w-md group">
                <Input
                    placeholder="Filter prompt templates..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 h-10 sm:h-11 rounded-xl glass border-border/50 focus:ring-1 focus:ring-orange-500/50 bg-foreground/[0.02] text-xs sm:text-sm"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground z-10 pointer-events-none" />
            </div>

            {isLoading ? (
                <div className="flex h-64 items-center justify-center rounded-2xl glass border-border/50">
                    <Loader2 className="h-8 w-8 animate-spin text-orange-500/50" />
                </div>
            ) : filteredTemplates.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
                    {filteredTemplates.map((template) => (
                        <Card key={template.templateName} className="group glass border-border rounded-2xl overflow-hidden transition-all duration-500 hover:border-orange-500/30 hover:shadow-xl hover:shadow-orange-500/5 flex flex-col">
                            <CardHeader className="pb-4 relative">
                                <div className="flex items-start justify-between">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-500 shadow-inner group-hover:scale-105 transition-transform duration-500">
                                        <Zap className="h-5 w-5" />
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => openEdit(template)}
                                            className="h-10 w-10 rounded-xl text-muted-foreground hover:text-foreground hover:bg-foreground/10 glass border border-transparent hover:border-border/40"
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleDelete(template.templateName)}
                                            className="h-10 w-10 rounded-xl text-muted-foreground hover:text-red-400 hover:bg-red-400/10 glass border border-transparent hover:border-red-400/20"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                                <div className="mt-4">
                                    <CardTitle className="text-xl text-foreground font-bold group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors uppercase tracking-tight">{template.templateName}</CardTitle>
                                    <div className="flex items-center gap-2 mt-2">
                                        <Badge variant="secondary" className="rounded-md text-[10px] bg-muted/60 border border-border text-muted-foreground">
                                            {template.creatorsCategory || "General"}
                                        </Badge>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="flex-1 space-y-4">
                                <div className="space-y-1.5">
                                    <p className="text-[10px] font-bold text-orange-400 uppercase tracking-widest pl-1">Analysis Focus</p>
                                    <ScrollArea className="h-[80px] rounded-xl bg-muted/60 border border-border p-3 text-xs text-muted-foreground/80 leading-relaxed font-mono italic shadow-sm">
                                        {template.analysisInstruction}
                                    </ScrollArea>
                                </div>
                                <div className="space-y-1.5">
                                    <p className="text-[10px] font-bold text-orange-400 uppercase tracking-widest pl-1">Concept Guidance</p>
                                    <ScrollArea className="h-[80px] rounded-xl bg-foreground/[0.02] border border-border/40 p-3 text-xs text-muted-foreground/80 leading-relaxed font-mono italic">
                                        {template.newConceptsInstruction}
                                    </ScrollArea>
                                </div>
                            </CardContent>
                            <CardFooter className="pt-4 pb-6 flex items-center justify-between border-t border-border/30 mt-2 bg-muted/30 px-6">
                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                    <Settings2 className="h-3 w-3" />
                                    Pipeline Ready
                                </div>
                                <div className="flex items-center gap-1">
                                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
                                    <span className="text-[10px] text-muted-foreground/60">Active</span>
                                </div>
                            </CardFooter>
                        </Card>
                    ))}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center py-32 rounded-3xl glass border-border/50 text-center bg-gradient-to-b from-transparent to-orange-500/5 shadow-2xl shadow-inner">
                    <div className="h-20 w-20 rounded-3xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mb-6 shadow-xl shadow-orange-500/5 animate-pulse">
                        <Zap className="h-10 w-10 text-orange-400" />
                    </div>
                    <h3 className="text-2xl font-bold text-foreground">No templates found</h3>
                    <p className="text-muted-foreground mt-2 max-w-sm mx-auto text-sm">
                        {searchQuery ? "Try refining your search terms" : "Create your first prompt template to start generating viral concept strategies."}
                    </p>
                    {!searchQuery && (
                        <Button onClick={openNew} className="mt-10 rounded-xl h-12 px-10 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 border-0 shadow-lg shadow-orange-500/20">
                            <Plus className="h-5 w-5 mr-2" />
                            Get Started
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
}
