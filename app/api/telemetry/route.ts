import { readFile, statfs } from "node:fs/promises";
import { createConnection } from "node:net";
import { loadavg, uptime } from "node:os";

import type {
  EndpointCheck,
  FilesystemValue,
  MemoryValue,
  Reading,
  StorageReading,
  TelemetryResponse,
} from "@/lib/telemetry-types";

const STORAGE_PATH = "/srv/storage";
const CHECK_TIMEOUT_MS = 1200;

const ENDPOINTS = [
  { id: "cockpit", label: "Cockpit", host: "100.115.141.25", port: 9090 },
  { id: "portainer", label: "Portainer", host: "100.115.141.25", port: 9443 },
  { id: "samba", label: "Samba", host: "100.115.141.25", port: 445 },
] as const;

function unavailable<T>(error: unknown): Reading<T> {
  return {
    state: "unavailable",
    message: error instanceof Error ? error.message : "Reading unavailable",
  };
}

function normalizeConnectionError(error: NodeJS.ErrnoException) {
  switch (error.code) {
    case "ECONNREFUSED":
      return "Connection refused";
    case "EHOSTUNREACH":
      return "Host unreachable";
    case "ENETUNREACH":
      return "Network unreachable";
    case "ETIMEDOUT":
      return "Timed out";
    default:
      return "Connection failed";
  }
}

function decodeMountField(value: string) {
  return value.replace(/\\([0-7]{3})/g, (_, octal: string) =>
    String.fromCharCode(Number.parseInt(octal, 8)),
  );
}

async function isExactMountPoint(path: string) {
  const mountInfo = await readFile("/proc/self/mountinfo", "utf8");

  return mountInfo.split("\n").some((line) => {
    const separatorIndex = line.indexOf(" - ");
    if (separatorIndex === -1) {
      return false;
    }

    const fields = line.slice(0, separatorIndex).split(" ");
    const mountPoint = fields[4];
    return mountPoint ? decodeMountField(mountPoint) === path : false;
  });
}

async function readFilesystem(path: string): Promise<FilesystemValue> {
  const stats = await statfs(path);

  return {
    path,
    availableBytes: stats.bavail * stats.bsize,
    totalBytes: stats.blocks * stats.bsize,
  };
}

async function readRootFilesystem(): Promise<Reading<FilesystemValue>> {
  try {
    return { state: "available", value: await readFilesystem("/") };
  } catch (error) {
    return unavailable(error);
  }
}

async function readStorageFilesystem(): Promise<StorageReading> {
  try {
    const mounted = await isExactMountPoint(STORAGE_PATH);

    if (!mounted) {
      return {
        state: "not-mounted",
        path: STORAGE_PATH,
        message: "Not mounted",
      };
    }

    return {
      state: "available",
      value: {
        ...(await readFilesystem(STORAGE_PATH)),
        mounted: true,
      },
    };
  } catch (error) {
    return {
      state: "unavailable",
      path: STORAGE_PATH,
      message: error instanceof Error ? error.message : "Reading unavailable",
    };
  }
}

async function readMemory(): Promise<Reading<MemoryValue>> {
  try {
    const memInfo = await readFile("/proc/meminfo", "utf8");
    const totalMatch = memInfo.match(/^MemTotal:\s+(\d+)\s+kB$/m);
    const availableMatch = memInfo.match(/^MemAvailable:\s+(\d+)\s+kB$/m);

    if (!totalMatch || !availableMatch) {
      throw new Error("MemAvailable is not present in /proc/meminfo");
    }

    return {
      state: "available",
      value: {
        totalBytes: Number(totalMatch[1]) * 1024,
        availableBytes: Number(availableMatch[1]) * 1024,
      },
    };
  } catch (error) {
    return unavailable(error);
  }
}

function checkEndpoint(endpoint: (typeof ENDPOINTS)[number]): Promise<EndpointCheck> {
  const startedAt = performance.now();

  return new Promise((resolve) => {
    const socket = createConnection({ host: endpoint.host, port: endpoint.port });
    let settled = false;

    const finish = (
      state: EndpointCheck["state"],
      message: string | null = null,
    ) => {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();
      resolve({
        ...endpoint,
        state,
        latencyMs:
          state === "reachable"
            ? Math.max(1, Math.round(performance.now() - startedAt))
            : null,
        message,
        checkedAt: new Date().toISOString(),
        checkedFrom: "Debian",
      });
    };

    socket.setTimeout(CHECK_TIMEOUT_MS);
    socket.once("connect", () => finish("reachable"));
    socket.once("timeout", () => finish("unreachable", "Timed out"));
    socket.once("error", (error: NodeJS.ErrnoException) =>
      finish("unreachable", normalizeConnectionError(error)),
    );
  });
}

export async function GET() {
  const [oneMinute, fiveMinutes, fifteenMinutes] = loadavg();
  const [memory, root, storage] = await Promise.all([
    readMemory(),
    readRootFilesystem(),
    readStorageFilesystem(),
  ]);
  const reachability = await Promise.all(ENDPOINTS.map(checkEndpoint));

  const response: TelemetryResponse = {
    generatedAt: new Date().toISOString(),
    source: "Debian",
    refreshIntervalSeconds: 15,
    staleAfterSeconds: 45,
    system: {
      loadAverage: {
        state: "available",
        value: { oneMinute, fiveMinutes, fifteenMinutes },
      },
      memory,
      uptime: {
        state: "available",
        value: { seconds: uptime() },
      },
      filesystems: { root, storage },
    },
    reachability,
  };

  return Response.json(response, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
