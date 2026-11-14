"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  Clock3,
  Cpu,
  Database,
  HardDrive,
  MemoryStick,
  RefreshCw,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  EndpointCheck,
  TelemetryResponse,
} from "@/lib/telemetry-types";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 15_000;
const CLOCK_INTERVAL_MS = 10_000;

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "Unavailable";
  }

  const gibibytes = bytes / 1024 ** 3;
  if (gibibytes >= 1) {
    return `${gibibytes.toFixed(gibibytes >= 100 ? 0 : 1)} GiB`;
  }

  return `${(bytes / 1024 ** 2).toFixed(0)} MiB`;
}

function formatUptime(seconds: number) {
  const totalMinutes = Math.max(0, Math.floor(seconds / 60));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatUpdateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function ReachabilityBadge({ check }: { check: EndpointCheck }) {
  const reachable = check.state === "reachable";
  const latency = check.latencyMs;

  return (
    <div className="glass-card-static flex items-center justify-between rounded-xl p-3.5 transition-colors hover:border-white/15">
      <div className="flex items-center gap-3">
        <span className="relative flex size-2.5 shrink-0">
          {reachable ? (
            <>
              <span className="animate-live-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
            </>
          ) : (
            <span className="relative inline-flex size-2.5 rounded-full bg-rose-500" />
          )}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-white tracking-tight">{check.label}</p>
          <p className="font-mono text-[11px] text-zinc-400 truncate">
            {check.host}:{check.port}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {reachable && latency !== null ? (
          <span
            className={cn(
              "font-mono text-[11px] font-medium px-2 py-0.5 rounded-md",
              latency < 30
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
            )}
          >
            {latency} ms
          </span>
        ) : (
          <span className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20">
            {check.message ?? "Offline"}
          </span>
        )}
      </div>
    </div>
  );
}

export function SystemTelemetry() {
  const [telemetry, setTelemetry] = useState<TelemetryResponse | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let controller: AbortController | null = null;

    async function refresh() {
      controller?.abort();
      controller = new AbortController();

      try {
        const response = await fetch("/api/telemetry", {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Telemetry request failed (${response.status})`);
        }

        const nextTelemetry = (await response.json()) as TelemetryResponse;
        if (!nextTelemetry.generatedAt || !nextTelemetry.system) {
          throw new Error("Telemetry response was incomplete");
        }

        if (!cancelled) {
          setTelemetry(nextTelemetry);
          setRefreshError(null);
          setLoading(false);
          setNow(Date.now());
        }
      } catch (error) {
        if (cancelled || (error instanceof DOMException && error.name === "AbortError")) {
          return;
        }

        setRefreshError(
          error instanceof Error ? error.message : "Telemetry refresh failed",
        );
        setLoading(false);
        setNow(Date.now());
      }
    }

    void refresh();
    const refreshTimer = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    const clockTimer = window.setInterval(() => setNow(Date.now()), CLOCK_INTERVAL_MS);

    return () => {
      cancelled = true;
      controller?.abort();
      window.clearInterval(refreshTimer);
      window.clearInterval(clockTimer);
    };
  }, []);

  async function handleManualRefresh() {
    setRefreshing(true);
    try {
      const response = await fetch("/api/telemetry", { cache: "no-store" });
      if (response.ok) {
        const data = (await response.json()) as TelemetryResponse;
        setTelemetry(data);
        setRefreshError(null);
        setNow(Date.now());
      }
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : "Manual refresh failed");
    } finally {
      setRefreshing(false);
    }
  }

  const lastUpdateMs = telemetry ? Date.parse(telemetry.generatedAt) : 0;
  const stale = Boolean(
    telemetry && now > 0 && now - lastUpdateMs > telemetry.staleAfterSeconds * 1_000
  );

  const memory = telemetry?.system.memory;
  const loadAverage = telemetry?.system.loadAverage;
  const uptimeSeconds = telemetry?.system.uptime?.state === "available"
    ? telemetry.system.uptime.value.seconds
    : null;
  const rootFs = telemetry?.system.filesystems.root;
  const storageFs = telemetry?.system.filesystems.storage;

  // Calculate memory usage %
  let memPercentage = 0;
  let memUsedFormatted = "Unavailable";
  let memTotalFormatted = "Unavailable";
  if (memory?.state === "available") {
    const total = memory.value.totalBytes;
    const available = memory.value.availableBytes;
    const used = Math.max(0, total - available);
    memPercentage = Math.min(100, Math.round((used / total) * 100));
    memUsedFormatted = formatBytes(used);
    memTotalFormatted = formatBytes(total);
  }

  // Calculate root fs usage %
  let rootPercentage = 0;
  let rootUsedFormatted = "Unavailable";
  let rootTotalFormatted = "Unavailable";
  if (rootFs?.state === "available") {
    const total = rootFs.value.totalBytes;
    const available = rootFs.value.availableBytes;
    const used = Math.max(0, total - available);
    rootPercentage = Math.min(100, Math.round((used / total) * 100));
    rootUsedFormatted = formatBytes(used);
    rootTotalFormatted = formatBytes(total);
  }

  // Calculate storage fs usage %
  let storagePercentage = 0;
  let storageUsedFormatted = "Unavailable";
  let storageTotalFormatted = "Unavailable";
  let storageMounted = false;
  if (storageFs?.state === "available") {
    storageMounted = true;
    const total = storageFs.value.totalBytes;
    const available = storageFs.value.availableBytes;
    const used = Math.max(0, total - available);
    storagePercentage = Math.min(100, Math.round((used / total) * 100));
    storageUsedFormatted = formatBytes(used);
    storageTotalFormatted = formatBytes(total);
  }

  return (
    <section aria-labelledby="telemetry-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-cyan-400" aria-hidden="true" />
          <h2 id="telemetry-heading" className="text-sm font-semibold tracking-wide text-zinc-300 uppercase">
            Live System Telemetry
          </h2>
          {stale ? (
            <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-300 text-[10px]">
              Stale Data
            </Badge>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-zinc-400 hidden sm:inline">
            Updated {telemetry ? formatUpdateTime(telemetry.generatedAt) : "..."}
          </span>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={handleManualRefresh}
            disabled={refreshing || loading}
            className="tactile-button focus-ring-glow rounded-lg border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08] hover:text-white"
          >
            <RefreshCw
              className={cn("size-3", (refreshing || loading) && "animate-spin text-cyan-400")}
              aria-hidden="true"
            />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {refreshError ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-300 flex items-center gap-2.5">
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          <span>{refreshError}</span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* RAM Usage Card */}
        <div className="glass-panel rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">Memory (RAM)</span>
              <MemoryStick className="size-4 text-cyan-400" aria-hidden="true" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-white">{memPercentage}%</span>
              <span className="text-xs text-zinc-400">used</span>
            </div>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-500"
                style={{ width: `${memPercentage}%` }}
              />
            </div>
          </div>
          <p className="mt-4 font-mono text-[11px] text-zinc-400">
            {memUsedFormatted} / {memTotalFormatted}
          </p>
        </div>

        {/* Root Filesystem Card */}
        <div className="glass-panel rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">Root Storage (/)</span>
              <HardDrive className="size-4 text-indigo-400" aria-hidden="true" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-white">{rootPercentage}%</span>
              <span className="text-xs text-zinc-400">used</span>
            </div>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500"
                style={{ width: `${rootPercentage}%` }}
              />
            </div>
          </div>
          <p className="mt-4 font-mono text-[11px] text-zinc-400">
            {rootUsedFormatted} / {rootTotalFormatted}
          </p>
        </div>

        {/* Shared Storage (/srv/storage) */}
        <div className="glass-panel rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">Pool (/srv/storage)</span>
              <Database className="size-4 text-amber-400" aria-hidden="true" />
            </div>
            {storageMounted ? (
              <>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-2xl font-bold tracking-tight text-white">{storagePercentage}%</span>
                  <span className="text-xs text-zinc-400">used</span>
                </div>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-500"
                    style={{ width: `${storagePercentage}%` }}
                  />
                </div>
              </>
            ) : (
              <div className="mt-3">
                <span className="text-sm font-semibold text-amber-300">Not Mounted</span>
                <p className="text-[11px] text-zinc-400 mt-1">Standby mountpoint</p>
              </div>
            )}
          </div>
          <p className="mt-4 font-mono text-[11px] text-zinc-400">
            {storageMounted ? `${storageUsedFormatted} / ${storageTotalFormatted}` : "/srv/storage"}
          </p>
        </div>

        {/* CPU Load & Uptime */}
        <div className="glass-panel rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">CPU Load Average</span>
              <Cpu className="size-4 text-emerald-400" aria-hidden="true" />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-center">
                <span className="block font-mono text-sm font-bold text-white">
                  {loadAverage?.state === "available" ? loadAverage.value.oneMinute.toFixed(2) : "--"}
                </span>
                <span className="text-[10px] text-zinc-400">1m</span>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-center">
                <span className="block font-mono text-sm font-bold text-zinc-200">
                  {loadAverage?.state === "available" ? loadAverage.value.fiveMinutes.toFixed(2) : "--"}
                </span>
                <span className="text-[10px] text-zinc-400">5m</span>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-center">
                <span className="block font-mono text-sm font-bold text-zinc-400">
                  {loadAverage?.state === "available" ? loadAverage.value.fifteenMinutes.toFixed(2) : "--"}
                </span>
                <span className="text-[10px] text-zinc-400">15m</span>
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-1.5 text-xs text-zinc-400">
            <Clock3 className="size-3.5 text-zinc-400" aria-hidden="true" />
            <span>Uptime: {uptimeSeconds !== null ? formatUptime(uptimeSeconds) : "..."}</span>
          </div>
        </div>
      </div>

      {/* Network Endpoint Reachability List */}
      <div className="glass-panel rounded-2xl p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-semibold tracking-wide text-zinc-300 uppercase">
            Service Endpoint Reachability (Debian Ping)
          </span>
          <span className="font-mono text-[11px] text-zinc-400">TCP Socket Health</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {telemetry?.reachability ? (
            telemetry.reachability.map((check) => (
              <ReachabilityBadge key={check.id} check={check} />
            ))
          ) : (
            <div className="col-span-3 py-4 text-center text-xs text-zinc-400">
              Checking endpoint status...
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
