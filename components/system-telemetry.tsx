"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  Clock3,
  Cpu,
  Database,
  HardDrive,
  MemoryStick,
  Server,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  EndpointCheck,
  FilesystemValue,
  Reading,
  StorageReading,
  TelemetryResponse,
} from "@/lib/telemetry-types";

const POLL_INTERVAL_MS = 15_000;

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

function filesystemDisplay(reading: Reading<FilesystemValue>) {
  if (reading.state === "unavailable") {
    return {
      value: "Unavailable",
      detail: reading.message,
      unavailable: true,
    };
  }

  return {
    value: `${formatBytes(reading.value.availableBytes)} free`,
    detail: `${formatBytes(reading.value.totalBytes)} total · ${reading.value.path}`,
    unavailable: false,
  };
}

function storageDisplay(reading: StorageReading) {
  if (reading.state === "not-mounted") {
    return {
      value: "Not mounted",
      detail: `${reading.path} has no mounted filesystem`,
      unavailable: true,
    };
  }

  if (reading.state === "unavailable") {
    return {
      value: "Unavailable",
      detail: reading.message,
      unavailable: true,
    };
  }

  return {
    value: `${formatBytes(reading.value.availableBytes)} free`,
    detail: `${formatBytes(reading.value.totalBytes)} total · mounted at ${reading.value.path}`,
    unavailable: false,
  };
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
  unavailable = false,
}: {
  icon: typeof Cpu;
  label: string;
  value: string;
  detail: string;
  unavailable?: boolean;
}) {
  return (
    <div className="border border-cyan-100/10 bg-cyan-300/[0.025] p-4">
      <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] text-cyan-100/45 uppercase">
        <Icon className="size-3.5" aria-hidden="true" />
        {label}
      </div>
      <p
        className={`mt-3 text-lg font-medium tracking-tight ${
          unavailable ? "text-amber-200" : "text-[#f2fdff]"
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs leading-5 text-slate-300/60">{detail}</p>
    </div>
  );
}

function ReachabilityCheck({ check }: { check: EndpointCheck }) {
  const reachable = check.state === "reachable";

  return (
    <li className="border border-cyan-100/10 bg-[#03101b]/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[#f2fdff]">{check.label}</p>
          <code className="mt-1 block font-mono text-[11px] text-cyan-100/45">
            {check.host}:{check.port}
          </code>
        </div>
        <Badge
          variant="outline"
          className={`rounded-sm font-mono text-[10px] tracking-[0.12em] uppercase ${
            reachable
              ? "border-cyan-200/25 bg-cyan-300/[0.06] text-cyan-100"
              : "border-amber-200/25 bg-amber-300/[0.06] text-amber-100"
          }`}
        >
          {reachable ? "Reachable" : "Unreachable"}
        </Badge>
      </div>
      <p className="mt-3 text-xs text-slate-300/55">
        {reachable
          ? `Checked from Debian · ${check.latencyMs} ms`
          : `Checked from Debian · ${check.message ?? "Connection failed"}`}
      </p>
    </li>
  );
}

export function SystemTelemetry() {
  const [telemetry, setTelemetry] = useState<TelemetryResponse | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
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
    const clockTimer = window.setInterval(() => setNow(Date.now()), 1_000);

    return () => {
      cancelled = true;
      controller?.abort();
      window.clearInterval(refreshTimer);
      window.clearInterval(clockTimer);
    };
  }, []);

  const lastUpdateMs = telemetry ? Date.parse(telemetry.generatedAt) : 0;
  const stale = Boolean(
    telemetry &&
      now > 0 &&
      now - lastUpdateMs > telemetry.staleAfterSeconds * 1_000,
  );

  const loadAverage = telemetry?.system.loadAverage;
  const memory = telemetry?.system.memory;
  const uptime = telemetry?.system.uptime;
  const root = telemetry
    ? filesystemDisplay(telemetry.system.filesystems.root)
    : null;
  const storage = telemetry
    ? storageDisplay(telemetry.system.filesystems.storage)
    : null;

  return (
    <section className="mt-6" aria-labelledby="telemetry-heading">
      <Card className="hud-panel rounded-sm border border-cyan-200/15 bg-[#061523]/95 py-0 text-[#e8fbff] ring-0 shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
        <CardHeader className="gap-5 border-b border-cyan-100/10 p-5 sm:grid sm:grid-cols-[1fr_auto] sm:items-start sm:p-6">
          <div>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center border border-cyan-200/20 bg-cyan-300/[0.05] text-cyan-200">
                <Activity className="size-5" aria-hidden="true" />
              </div>
              <Badge
                variant="outline"
                className="rounded-sm border-cyan-200/15 bg-cyan-300/[0.04] font-mono text-[10px] tracking-[0.18em] text-cyan-100/70 uppercase"
              >
                TEL // READ ONLY
              </Badge>
            </div>
            <CardTitle className="text-2xl font-medium tracking-[-0.025em] text-[#f2fdff]">
              <h2 id="telemetry-heading">System Telemetry</h2>
            </CardTitle>
            <CardDescription className="mt-2 max-w-2xl leading-6 text-slate-300/70">
              Real readings collected on Debian. Refreshes every 15 seconds.
            </CardDescription>
          </div>

          <div className="sm:text-right">
            <Badge
              variant="outline"
              className={`rounded-sm font-mono text-[10px] tracking-[0.14em] uppercase ${
                stale || refreshError
                  ? "border-amber-200/25 bg-amber-300/[0.06] text-amber-100"
                  : telemetry
                    ? "border-cyan-200/25 bg-cyan-300/[0.06] text-cyan-100"
                    : "border-cyan-100/10 text-cyan-100/45"
              }`}
            >
              {loading
                ? "Acquiring"
                : stale
                  ? "Stale"
                  : refreshError
                    ? "Refresh failed"
                    : "Debian source"}
            </Badge>
            <p className="mt-2 font-mono text-[10px] leading-5 tracking-[0.12em] text-cyan-100/40 uppercase">
              Last successful update
              <br />
              {telemetry ? formatUpdateTime(telemetry.generatedAt) : "None"}
            </p>
          </div>
        </CardHeader>

        <CardContent className="p-5 sm:p-6">
          {refreshError && (
            <div
              role="status"
              className="mb-5 border border-amber-200/20 bg-amber-300/[0.05] px-4 py-3 text-sm text-amber-100"
            >
              {telemetry
                ? `Refresh failed. Showing the last successful reading. ${refreshError}`
                : `Telemetry unavailable. ${refreshError}`}
            </div>
          )}

          {stale && !refreshError && (
            <div
              role="status"
              className="mb-5 border border-amber-200/20 bg-amber-300/[0.05] px-4 py-3 text-sm text-amber-100"
            >
              These readings are stale. The last successful update was at {formatUpdateTime(telemetry!.generatedAt)}.
            </div>
          )}

          {!telemetry ? (
            <div className="border border-cyan-100/10 bg-cyan-300/[0.025] p-6 text-sm text-slate-300/65">
              {loading ? "Collecting Debian telemetry…" : "No telemetry data is available."}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <Metric
                  icon={Cpu}
                  label="CPU load"
                  value={
                    loadAverage?.state === "available"
                      ? `${loadAverage.value.oneMinute.toFixed(2)} / ${loadAverage.value.fiveMinutes.toFixed(2)} / ${loadAverage.value.fifteenMinutes.toFixed(2)}`
                      : "Unavailable"
                  }
                  detail={
                    loadAverage?.state === "available"
                      ? "1 / 5 / 15 minute load average"
                      : (loadAverage?.message ?? "Reading unavailable")
                  }
                  unavailable={loadAverage?.state !== "available"}
                />
                <Metric
                  icon={MemoryStick}
                  label="Available RAM"
                  value={
                    memory?.state === "available"
                      ? `${formatBytes(memory.value.availableBytes)} available`
                      : "Unavailable"
                  }
                  detail={
                    memory?.state === "available"
                      ? `${formatBytes(memory.value.totalBytes)} total`
                      : (memory?.message ?? "Reading unavailable")
                  }
                  unavailable={memory?.state !== "available"}
                />
                <Metric
                  icon={Clock3}
                  label="Uptime"
                  value={
                    uptime?.state === "available"
                      ? formatUptime(uptime.value.seconds)
                      : "Unavailable"
                  }
                  detail={
                    uptime?.state === "available"
                      ? "Debian system uptime"
                      : (uptime?.message ?? "Reading unavailable")
                  }
                  unavailable={uptime?.state !== "available"}
                />
                <Metric
                  icon={Server}
                  label="Root filesystem"
                  value={root?.value ?? "Unavailable"}
                  detail={root?.detail ?? "Reading unavailable"}
                  unavailable={root?.unavailable ?? true}
                />
                <Metric
                  icon={HardDrive}
                  label="Storage filesystem"
                  value={storage?.value ?? "Unavailable"}
                  detail={storage?.detail ?? "Reading unavailable"}
                  unavailable={storage?.unavailable ?? true}
                />
              </div>

              <div className="mt-6 border-t border-cyan-100/10 pt-5">
                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="font-mono text-[10px] tracking-[0.2em] text-cyan-100/45 uppercase">
                      Fixed endpoint reachability
                    </p>
                    <h3 className="mt-1 text-base font-medium text-[#f2fdff]">
                      Checks from Debian
                    </h3>
                  </div>
                  <p className="flex items-center gap-2 text-xs text-slate-300/50">
                    <Database className="size-3.5" aria-hidden="true" />
                    TCP connection checks with short timeouts
                  </p>
                </div>
                <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  {telemetry.reachability.map((check) => (
                    <ReachabilityCheck key={check.id} check={check} />
                  ))}
                </ul>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
