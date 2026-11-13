export type Reading<T> =
  | { state: "available"; value: T }
  | { state: "unavailable"; message: string };

export type LoadAverageValue = {
  oneMinute: number;
  fiveMinutes: number;
  fifteenMinutes: number;
};

export type MemoryValue = {
  availableBytes: number;
  totalBytes: number;
};

export type UptimeValue = {
  seconds: number;
};

export type FilesystemValue = {
  path: string;
  availableBytes: number;
  totalBytes: number;
};

export type StorageReading =
  | { state: "available"; value: FilesystemValue & { mounted: true } }
  | { state: "not-mounted"; path: string; message: "Not mounted" }
  | { state: "unavailable"; path: string; message: string };

export type EndpointCheck = {
  id: "cockpit" | "portainer" | "samba";
  label: string;
  host: string;
  port: number;
  state: "reachable" | "unreachable";
  latencyMs: number | null;
  message: string | null;
  checkedAt: string;
  checkedFrom: "Debian";
};

export type TelemetryResponse = {
  generatedAt: string;
  source: "Debian";
  refreshIntervalSeconds: 15;
  staleAfterSeconds: 45;
  system: {
    loadAverage: Reading<LoadAverageValue>;
    memory: Reading<MemoryValue>;
    uptime: Reading<UptimeValue>;
    filesystems: {
      root: Reading<FilesystemValue>;
      storage: StorageReading;
    };
  };
  reachability: EndpointCheck[];
};
