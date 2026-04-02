"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Laptop,
  Server,
  Monitor,
  Trash2,
  Pencil,
  Check,
  X,
} from "lucide-react";

interface MachineRow {
  id: string;
  hostname: string;
  os: string;
  label: string | null;
  architecture: string | null;
  first_seen_at: string;
  last_seen_at: string;
  session_count: number;
  total_cost_usd: number;
}

function getMachineIcon(os: string) {
  if (os === "darwin") return Laptop;
  if (os === "linux") return Server;
  return Monitor;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function MachinesPage() {
  const [machines, setMachines] = useState<MachineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [apiKey, setApiKey] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/machines")
      .then((r) => r.json())
      .then((data) => {
        setMachines(data.machines || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    fetch("/api/machines/key")
      .then((r) => r.json())
      .then((data) => setApiKey(data.key || null))
      .catch(() => {});
  }, []);

  const startEdit = (machine: MachineRow) => {
    setEditingId(machine.id);
    setEditLabel(machine.label || machine.hostname);
  };

  const saveLabel = async (id: string) => {
    await fetch(`/api/machines/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: editLabel }),
    });
    setMachines((prev) =>
      prev.map((m) => (m.id === id ? { ...m, label: editLabel } : m)),
    );
    setEditingId(null);
  };

  const deleteMachine = async (id: string) => {
    if (
      !confirm("Remove this machine? Its sessions will be kept but unlinked.")
    )
      return;
    await fetch(`/api/machines/${id}`, { method: "DELETE" });
    setMachines((prev) => prev.filter((m) => m.id !== id));
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Machines</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm">Add a Machine</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Run this on any machine to start sending session data here:
          </p>
          <pre className="bg-muted/50 rounded-md p-3 text-xs font-mono overflow-x-auto">
            {`npx dev-tracker setup --server ${typeof window !== "undefined" ? window.location.origin : "http://localhost:3020"} --key ${apiKey || "<api-key>"}`}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            Registered Machines ({machines.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : machines.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No machines registered yet. Run the setup command above on a
              machine to get started.
            </p>
          ) : (
            <div className="space-y-3">
              {machines.map((machine) => {
                const Icon = getMachineIcon(machine.os);
                return (
                  <div
                    key={machine.id}
                    className="flex items-center justify-between rounded-md border border-border p-3"
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="h-5 w-5 text-muted-foreground" />
                      <div>
                        {editingId === machine.id ? (
                          <div className="flex items-center gap-2">
                            <Input
                              value={editLabel}
                              onChange={(e) => setEditLabel(e.target.value)}
                              className="h-7 w-48 text-sm"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveLabel(machine.id);
                                if (e.key === "Escape") setEditingId(null);
                              }}
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={() => saveLabel(machine.id)}
                            >
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={() => setEditingId(null)}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">
                              {machine.label || machine.hostname}
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0"
                              onClick={() => startEdit(machine)}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground font-mono">
                            {machine.id}
                          </span>
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0"
                          >
                            {machine.os}
                          </Badge>
                          {machine.architecture && (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0"
                            >
                              {machine.architecture}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">
                          Sessions
                        </p>
                        <p className="text-sm font-medium">
                          {machine.session_count}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Cost</p>
                        <p className="text-sm font-medium">
                          ${machine.total_cost_usd.toFixed(2)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">
                          Last seen
                        </p>
                        <p className="text-sm">
                          {timeAgo(machine.last_seen_at)}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-destructive"
                        onClick={() => deleteMachine(machine.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
