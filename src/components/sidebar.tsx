"use client";

import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import {
  LayoutDashboard,
  Terminal,
  FolderOpen,
  DollarSign,
  Activity,
  Wrench,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface MachineOption {
  id: string;
  label: string | null;
  hostname: string;
  os: string;
}

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/sessions", label: "Sessions", icon: Terminal },
  { href: "/projects", label: "Projects", icon: FolderOpen },
  { href: "/costs", label: "Costs", icon: DollarSign },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/tools", label: "Tools", icon: Wrench },
  { href: "/settings", label: "Settings", icon: Settings },
];

function SidebarInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [machines, setMachines] = useState<MachineOption[]>([]);
  const selectedMachine = searchParams.get("machine_id");

  useEffect(() => {
    fetch("/api/machines")
      .then((r) => r.json())
      .then((data) => setMachines(data.machines || []))
      .catch(() => {});
  }, []);

  const setMachineFilter = (machineId: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (machineId) {
      params.set("machine_id", machineId);
    } else {
      params.delete("machine_id");
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-border bg-card">
      <div className="flex h-14 items-center gap-2 border-b border-border px-5">
        <Terminal className="h-5 w-5 text-primary" />
        <span className="text-sm font-semibold tracking-tight text-foreground">
          Dev Tracker
        </span>
      </div>

      {machines.length > 0 && (
        <div className="border-b border-border px-3 py-3">
          <select
            value={selectedMachine || ""}
            onChange={(e) => setMachineFilter(e.target.value || null)}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground"
          >
            <option value="">All Machines</option>
            {machines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label || m.hostname}
              </option>
            ))}
          </select>
        </div>
      )}

      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const href = selectedMachine
            ? `${item.href}?machine_id=${selectedMachine}`
            : item.href;
          return (
            <Link
              key={item.href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border px-5 py-3">
        <p className="text-xs text-muted-foreground">v0.2.0</p>
      </div>
    </aside>
  );
}

export function Sidebar() {
  return (
    <Suspense>
      <SidebarInner />
    </Suspense>
  );
}
