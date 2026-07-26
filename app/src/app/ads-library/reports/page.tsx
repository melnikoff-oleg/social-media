"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/auth-context";
import { ArrowLeft, Loader2, BarChart3, ExternalLink, FileDown, Search, Library, Package } from "lucide-react";
import { classifyError } from "@/lib/error-utils";
import Link from 'next/link';
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function AllReportsPage() {
  const { token } = useAuth();
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [exportingId, setExportingId] = useState<number | null>(null);
  const [bulkExporting, setBulkExporting] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });

  useEffect(() => {
    if (!token) return;
    fetch('/api/facebook-ads/all-reports', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load reports (HTTP ${r.status})`);
        return r.json();
      })
      .then((data) => {
        if (data.reports) setReports(data.reports);
      })
      .catch((err) => {
        const classified = classifyError({ message: err instanceof Error ? err.message : String(err) });
        setError(`${classified.icon} ${classified.title}: ${classified.description}`);
      })
      .finally(() => setLoading(false));
  }, [token]);

  const handleExportPdf = async (report: any) => {
    setExportingId(report.id);
    try {
      const { exportReportAsPdf } = await import('@/lib/pdf-export');
      exportReportAsPdf({
        markdown: report.reportMarkdown,
        brandName: report.pageName || report.profileUrl.split('/').pop() || 'Unknown Brand',
        generatedAt: new Date(report.generatedAt).toLocaleDateString('en-IN', {
          day: 'numeric', month: 'long', year: 'numeric',
        }),
        isMock: report.isMock,
      });
      toast.success("PDF exported successfully!");
    } catch (err) {
      console.error('PDF export failed:', err);
      toast.error("Failed to export PDF.");
    } finally {
      setExportingId(null);
    }
  };

  const handleBulkExportPdf = async () => {
    if (filteredReports.length === 0) {
      toast.error("No reports to export.");
      return;
    }
    setBulkExporting(true);
    setBulkProgress({ current: 0, total: filteredReports.length });

    try {
      // Fetch full report data from backend in one request
      const reportIds = filteredReports.map((r) => r.id);
      const res = await fetch('/api/facebook-ads/bulk-export', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reportIds }),
      });

      if (!res.ok) throw new Error(`Failed to fetch reports (HTTP ${res.status})`);
      const data = await res.json();
      const bulkReports = data.reports || [];

      if (bulkReports.length === 0) {
        toast.error("No report data returned.");
        setBulkExporting(false);
        return;
      }

      const { exportReportAsPdf } = await import('@/lib/pdf-export');

      // Generate PDFs sequentially to avoid memory overload
      for (let i = 0; i < bulkReports.length; i++) {
        const report = bulkReports[i];
        setBulkProgress({ current: i + 1, total: bulkReports.length });

        exportReportAsPdf({
          markdown: report.reportMarkdown,
          brandName: report.pageName || report.profileUrl.split('/').pop() || 'Unknown Brand',
          generatedAt: new Date(report.generatedAt).toLocaleDateString('en-IN', {
            day: 'numeric', month: 'long', year: 'numeric',
          }),
          isMock: report.isMock,
        });

        // Small delay between downloads so browser doesn't block them
        if (i < bulkReports.length - 1) {
          await new Promise((r) => setTimeout(r, 600));
        }
      }

      toast.success(`Successfully exported ${bulkReports.length} report${bulkReports.length > 1 ? 's' : ''} as PDF!`);
    } catch (err) {
      console.error('Bulk PDF export failed:', err);
      toast.error("Bulk export failed. Please try again.");
    } finally {
      setBulkExporting(false);
      setBulkProgress({ current: 0, total: 0 });
    }
  };

  const handleExportMd = (report: any) => {
    const blob = new Blob([report.reportMarkdown], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ad-intelligence-report-${report.profileUrl.split('/').pop() || report.id}-${Date.now()}.md`;
    a.click();
    toast.success("Markdown exported successfully!");
  };

  const filteredReports = reports.filter(r => 
    r.profileUrl.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (r.pageName && r.pageName.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link
            href="/ads-library"
            className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
          >
            <ArrowLeft className="mr-1 h-3 w-3" /> Back to Ads Library
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/20 border border-violet-500/30">
              <BarChart3 className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                All Intelligence Reports
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
                View and download previously generated analysis reports
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Bulk Export Button */}
          {reports.length > 0 && (
            <Button
              onClick={handleBulkExportPdf}
              disabled={bulkExporting || filteredReports.length === 0}
              className="h-10 px-4 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white shadow-lg shadow-violet-500/25 transition-all duration-300 hover:shadow-violet-500/40 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:shadow-none whitespace-nowrap"
            >
              {bulkExporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Exporting {bulkProgress.current}/{bulkProgress.total}
                </>
              ) : (
                <>
                  <Package className="mr-2 h-4 w-4" />
                  Export All ({filteredReports.length})
                </>
              )}
            </Button>
          )}

          <div className="relative w-full sm:w-72">
            <Input 
              placeholder="Search reports..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-10 rounded-xl glass border-border/50"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10 pointer-events-none" />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex h-[40vh] items-center justify-center flex-col gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-violet-600 dark:text-violet-400" />
          <p className="text-sm text-muted-foreground">Loading reports...</p>
        </div>
      ) : error ? (
        <div className="flex h-[40vh] items-center justify-center flex-col gap-4 text-center">
          <div className="text-red-400 bg-red-400/10 p-4 rounded-full">
            <BarChart3 className="h-8 w-8" />
          </div>
          <p className="text-foreground font-medium">{error}</p>
          <Button onClick={() => window.location.reload()} variant="outline">Try Again</Button>
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="glass rounded-3xl p-12 text-center border border-border/40 flex flex-col items-center">
          <div className="h-16 w-16 bg-muted/20 rounded-full flex items-center justify-center mb-4">
            <Library className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <h3 className="text-lg font-semibold mb-1">No reports found</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            {searchQuery ? "No reports match your search query." : "You haven't generated any ad intelligence reports yet. Go to a competitor's profile to generate one."}
          </p>
          {!searchQuery && (
            <Button asChild className="mt-6 bg-violet-600 hover:bg-violet-700">
              <Link href="/ads-library">Go to Ads Library</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {filteredReports.map((report) => (
            <div key={report.id} className="glass rounded-2xl p-5 border border-border/40 hover:border-violet-500/30 hover:bg-foreground/[0.03] transition-all flex flex-col justify-between group">
              <div>
                <div className="flex items-start mb-3 w-full min-w-0">
                  <div className="flex items-center gap-2 w-full min-w-0">
                    <div className="h-10 w-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-600 dark:text-violet-400 shrink-0">
                      <BarChart3 className="h-5 w-5" />
                    </div>
                    <div className="overflow-hidden min-w-0 flex-1">
                      <h3 className="font-semibold text-sm truncate" title={report.pageName || report.profileUrl.split('/').pop()}>
                        {report.pageName || report.profileUrl.split('/').pop() || 'Unknown Brand'}
                      </h3>
                      <p className="text-[10px] text-muted-foreground truncate" title={report.profileUrl}>
                        {report.profileUrl}
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 flex-wrap mb-4">
                  {report.isMock && (
                    <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-[9px] px-1.5">
                      Mock Report
                    </Badge>
                  )}
                  {!report.isMock && (
                    <Badge className="bg-violet-500/10 text-violet-600 dark:text-violet-300 border-violet-500/20 text-[9px] px-1.5">
                      ✦ AI Generated
                    </Badge>
                  )}
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(report.generatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-auto">
                <Button asChild variant="outline" size="sm" className="w-full text-[11px] h-8 border-border/50 bg-background/50 hover:bg-foreground/5">
                  <Link href={`/ads-library/${encodeURIComponent(report.profileUrl)}/report`}>
                    <ExternalLink className="mr-1.5 h-3 w-3" /> View
                  </Link>
                </Button>
                <div className="flex gap-1 relative group/export">
                  <Button 
                    variant="default" 
                    size="sm" 
                    className="flex-1 min-w-0 text-[11px] h-8 bg-violet-600 hover:bg-violet-700 text-white"
                    onClick={() => handleExportPdf(report)}
                    disabled={exportingId === report.id}
                  >
                    {exportingId === report.id ? (
                      <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> PDF</>
                    ) : (
                      <><FileDown className="mr-1 h-3 w-3" /> PDF</>
                    )}
                  </Button>
                  <Button 
                    variant="outline" 
                    size="icon" 
                    className="shrink-0 h-8 w-8 border-border/50 bg-background/50"
                    title="Export as Markdown"
                    onClick={() => handleExportMd(report)}
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
