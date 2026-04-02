"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface SecurityFlag {
  id: string;
  tool_name: string;
  input_summary: string | null;
  session_id: string;
  started_at: string;
  project: string;
  pattern: string;
}

export default function SettingsPage() {
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [securityFlags, setSecurityFlags] = useState<SecurityFlag[]>([]);
  const [securityCount, setSecurityCount] = useState(0);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [securityLoading, setSecurityLoading] = useState(true);
  const [importStatus, setImportStatus] = useState<{
    files_processed: number;
    files_total: number;
    sessions_imported: number;
    errors: number;
    status: string;
  } | null>(null);

  useEffect(() => {
    fetch("/api/stats/security")
      .then((r) => r.json())
      .then((data) => {
        setSecurityCount(data.count || 0);
        setSecurityFlags(data.flagged || []);
        setSecurityLoading(false);
      })
      .catch(() => setSecurityLoading(false));
  }, []);

  const startImport = async () => {
    setImporting(true);
    setImportStatus(null);

    try {
      const res = await fetch("/api/import/start", { method: "POST" });
      const data = await res.json();
      setImportStatus({
        files_processed: 0,
        files_total: 0,
        sessions_imported: 0,
        errors: 0,
        status: data.status || "started",
      });

      // Poll with a simple timeout — import takes ~60s
      setTimeout(() => {
        setImporting(false);
        setImportStatus((prev) =>
          prev
            ? { ...prev, status: "completed (check console for details)" }
            : null,
        );
      }, 65000);
    } catch {
      setImporting(false);
    }
  };

  const exportData = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/export");
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dev-tracker-export-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silently fail
    } finally {
      setExporting(false);
    }
  };

  const progress =
    importStatus && importStatus.files_total > 0
      ? (importStatus.files_processed / importStatus.files_total) * 100
      : 0;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      {/* Import */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm">Data Import</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Import historical session data from ~/.claude/projects/. Only new
            sessions (not already imported) will be processed.
          </p>

          <Button onClick={startImport} disabled={importing}>
            {importing ? "Importing..." : "Import New Sessions"}
          </Button>

          {importStatus && (
            <div className="space-y-2">
              <Progress value={progress} />
              <div className="grid grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Files</p>
                  <p className="font-medium">
                    {importStatus.files_processed} / {importStatus.files_total}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Imported</p>
                  <p className="font-medium">
                    {importStatus.sessions_imported}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Errors</p>
                  <p className="font-medium">{importStatus.errors}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Status</p>
                  <p className="font-medium capitalize">
                    {importStatus.status}
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Hook status */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm">Hook Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between p-2 bg-muted/30 rounded">
              <span className="font-mono">dev-tracker-prompt.sh</span>
              <span className="text-xs text-emerald-400">UserPromptSubmit</span>
            </div>
            <div className="flex items-center justify-between p-2 bg-muted/30 rounded">
              <span className="font-mono">dev-tracker-log.sh</span>
              <span className="text-xs text-emerald-400">Stop</span>
            </div>
            <p className="text-muted-foreground text-xs mt-2">
              Hooks POST to http://localhost:3020/api/ingest/. Make sure the
              dev-tracker server is running when using Claude Code.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Multi-Machine Tracking */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm">Multi-Machine Tracking</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Track Claude Code usage across multiple machines. Configure remote
            machines to push session data here.
          </p>
          <Link href="/settings/machines">
            <Button variant="outline" size="sm">
              Manage Machines
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* Export */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm">Data Export</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Export all session data, project stats, tool usage, and model stats
            as a single JSON file for portability and backup.
          </p>
          <Button onClick={exportData} disabled={exporting}>
            {exporting ? "Exporting..." : "Export Data (JSON)"}
          </Button>
        </CardContent>
      </Card>

      {/* Security Audit Log */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            Security Audit Log
            {!securityLoading && (
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${securityCount > 0 ? "bg-yellow-500/20 text-yellow-400" : "bg-emerald-500/20 text-emerald-400"}`}
              >
                {securityCount} flagged
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Scans tool usage for suspicious patterns: destructive commands,
            secret/credential access, force pushes, and authenticated curl
            requests.
          </p>

          {securityLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : securityCount === 0 ? (
            <p className="text-sm text-emerald-400">
              No suspicious patterns detected.
            </p>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSecurityOpen(!securityOpen)}
              >
                {securityOpen ? "Hide Details" : "Show Details"}
              </Button>

              {securityOpen && (
                <div className="border rounded-lg overflow-hidden mt-2">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left p-2 font-medium">Pattern</th>
                        <th className="text-left p-2 font-medium">Tool</th>
                        <th className="text-left p-2 font-medium">Summary</th>
                        <th className="text-left p-2 font-medium">Project</th>
                        <th className="text-left p-2 font-medium">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {securityFlags.map((flag) => (
                        <tr key={flag.id} className="border-t">
                          <td className="p-2">
                            <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 font-mono">
                              {flag.pattern}
                            </span>
                          </td>
                          <td className="p-2 font-mono text-xs">
                            {flag.tool_name}
                          </td>
                          <td className="p-2 text-xs text-muted-foreground max-w-[300px] truncate">
                            {flag.input_summary || "—"}
                          </td>
                          <td className="p-2 text-xs">{flag.project}</td>
                          <td className="p-2 text-xs text-muted-foreground">
                            {new Date(flag.started_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">About</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              <span className="text-foreground font-medium">Database:</span>{" "}
              ~/Documents/infra/dev-tracker/data/dev-tracker.db
            </p>
            <p>
              <span className="text-foreground font-medium">Port:</span> 3020
            </p>
            <p>
              <span className="text-foreground font-medium">Source:</span>{" "}
              ~/.claude/projects/
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
