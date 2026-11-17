"use client";

import {
  Bike,
  CarFront,
  ChevronDown,
  Clock3,
  Footprints,
  LoaderCircle,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";

import { Button } from "@/components/ui/button";

type TravelMode = "driving" | "walking" | "cycling";
type RouteMapWidgetData = {
  type: "route-map";
  origin: string;
  destination: string;
  mode: TravelMode;
};
type PlaceResult = { label: string; lat: number; lon: number };
type RouteStep = { instruction: string; distanceMeters: number };
type RouteResult = {
  origin: PlaceResult;
  destination: PlaceResult;
  mode: TravelMode;
  distanceMeters: number;
  durationSeconds: number;
  geometry: Array<[number, number]>;
  steps: RouteStep[];
};
type RouteStatus = "loading" | "ready" | "error";

const modeOptions = [
  { value: "driving", label: "Driving", Icon: CarFront },
  { value: "walking", label: "Walking", Icon: Footprints },
  { value: "cycling", label: "Cycling", Icon: Bike },
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPlaceResult(value: unknown): value is PlaceResult {
  if (!isRecord(value)) return false;
  return (
    typeof value.label === "string" &&
    isCoordinate(value.lat) && value.lat >= -90 && value.lat <= 90 &&
    isCoordinate(value.lon) && value.lon >= -180 && value.lon <= 180
  );
}

function isRouteResult(value: unknown, mode: TravelMode): value is RouteResult {
  if (!isRecord(value) || value.mode !== mode) return false;
  if (!isPlaceResult(value.origin) || !isPlaceResult(value.destination)) return false;
  if (
    typeof value.distanceMeters !== "number" || !Number.isFinite(value.distanceMeters) || value.distanceMeters < 0 ||
    typeof value.durationSeconds !== "number" || !Number.isFinite(value.durationSeconds) || value.durationSeconds < 0
  ) return false;
  if (
    !Array.isArray(value.geometry) || value.geometry.length < 2 ||
    value.geometry.some((point) =>
      !Array.isArray(point) || point.length !== 2 ||
      !isCoordinate(point[0]) || point[0] < -90 || point[0] > 90 ||
      !isCoordinate(point[1]) || point[1] < -180 || point[1] > 180
    )
  ) return false;
  return Array.isArray(value.steps) && value.steps.every((step) =>
    isRecord(step) && typeof step.instruction === "string" &&
    typeof step.distanceMeters === "number" && Number.isFinite(step.distanceMeters) && step.distanceMeters >= 0
  );
}

function responseError(payload: unknown, fallback: string) {
  if (!isRecord(payload) || !isRecord(payload.error)) return fallback;
  return typeof payload.error.message === "string" && payload.error.message.trim()
    ? payload.error.message.trim()
    : fallback;
}

function formatDistance(distanceMeters: number) {
  if (distanceMeters < 1_000) return `${Math.round(distanceMeters)} m`;
  return `${(distanceMeters / 1_000).toFixed(1).replace(/\.0$/, "")} km`;
}

function formatDuration(durationSeconds: number) {
  const totalMinutes = Math.max(0, Math.round(durationSeconds / 60));
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
}

function tooltipText(text: string) {
  const element = document.createElement("span");
  element.textContent = text;
  return element;
}

function markerIcon(L: typeof import("leaflet"), letter: string, variant: "start" | "end") {
  return L.divIcon({
    className: "cartman-route-marker-host",
    html: `<span class="cartman-route-marker cartman-route-marker--${variant}" aria-hidden="true">${letter}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

export function CartmanRouteMapWidget({ widget }: { widget: RouteMapWidgetData }) {
  const [mode, setMode] = useState<TravelMode>(widget.mode);
  const [routeData, setRouteData] = useState<RouteResult | null>(null);
  const [status, setStatus] = useState<RouteStatus>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [tileError, setTileError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const mapId = useId();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<LeafletMap | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    void fetch("/api/map-route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origin: widget.origin, destination: widget.destination, mode }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new Error(responseError(payload, "Could not calculate that route."));
        if (!isRouteResult(payload, mode)) throw new Error("The map service returned an invalid route.");
        return payload;
      })
      .then((route) => {
        if (controller.signal.aborted) return;
        setRouteData(route);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setErrorMessage(error instanceof Error ? error.message : "Could not calculate that route.");
        setStatus("error");
      });

    return () => controller.abort();
  }, [widget.origin, widget.destination, mode, retryCount]);

  useEffect(() => {
    if (!routeData || !mapContainerRef.current) return;

    let cancelled = false;
    let map: LeafletMap | null = null;
    let resizeObserver: ResizeObserver | null = null;

    void import("leaflet")
      .then((L) => {
        if (cancelled || !mapContainerRef.current) return;
        map = L.map(mapContainerRef.current, {
          zoomControl: false,
          scrollWheelZoom: false,
          keyboard: true,
          preferCanvas: true,
        });
        leafletMapRef.current = map;

        const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
        });
        tiles.on("tileerror", () => {
          if (!cancelled) setTileError(true);
        });
        tiles.addTo(map);

        L.polyline(routeData.geometry, {
          color: "#ad342d",
          weight: 5,
          opacity: 0.9,
          lineCap: "round",
          lineJoin: "round",
        }).addTo(map);

        const start = L.marker([routeData.origin.lat, routeData.origin.lon], {
          icon: markerIcon(L, "A", "start"),
          title: `Start: ${routeData.origin.label}`,
          alt: `Start: ${routeData.origin.label}`,
          keyboard: true,
          riseOnHover: true,
        }).addTo(map);
        start.bindTooltip(tooltipText(`Start · ${routeData.origin.label}`), {
          direction: "top",
          offset: [0, -12],
        });

        const end = L.marker([routeData.destination.lat, routeData.destination.lon], {
          icon: markerIcon(L, "B", "end"),
          title: `Destination: ${routeData.destination.label}`,
          alt: `Destination: ${routeData.destination.label}`,
          keyboard: true,
          riseOnHover: true,
        }).addTo(map);
        end.bindTooltip(tooltipText(`Destination · ${routeData.destination.label}`), {
          direction: "top",
          offset: [0, -12],
        });

        const bounds = L.latLngBounds([
          ...routeData.geometry.map(([lat, lon]) => L.latLng(lat, lon)),
          L.latLng(routeData.origin.lat, routeData.origin.lon),
          L.latLng(routeData.destination.lat, routeData.destination.lon),
        ]);
        map.fitBounds(bounds, { padding: [38, 38], maxZoom: 13 });
        requestAnimationFrame(() => map?.invalidateSize());
        resizeObserver = new ResizeObserver(() => map?.invalidateSize());
        resizeObserver.observe(mapContainerRef.current);
      })
      .catch(() => {
        if (!cancelled) setTileError(true);
      });

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      map?.remove();
      leafletMapRef.current = null;
    };
  }, [routeData]);

  function chooseMode(nextMode: TravelMode) {
    if (nextMode === mode) return;
    setRouteData(null);
    setStatus("loading");
    setErrorMessage("");
    setTileError(false);
    setMode(nextMode);
  }

  function retryRoute() {
    setRouteData(null);
    setStatus("loading");
    setErrorMessage("");
    setTileError(false);
    setRetryCount((count) => count + 1);
  }

  return (
    <section className="my-4 w-full min-w-0 overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm" aria-label="Route planner">
      <header className="flex flex-col gap-4 border-b border-border bg-muted/55 p-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Route map · OpenStreetMap</p>
          <h3 className="mt-1.5 text-sm font-semibold leading-5 text-foreground">Trip overview</h3>
          <div className="mt-3 grid min-w-0 grid-cols-[1rem_minmax(0,1fr)] gap-x-2.5">
            <div className="mt-1 flex flex-col items-center" aria-hidden="true">
              <span className="size-2.5 rounded-full border-2 border-primary bg-card" />
              <span className="my-1 min-h-4 w-px bg-border" />
              <span className="size-2.5 rounded-full bg-foreground" />
            </div>
            <div className="grid gap-2">
              <p className="min-w-0 truncate text-sm leading-5 text-foreground" title={routeData?.origin.label ?? widget.origin}>{routeData?.origin.label ?? widget.origin}</p>
              <p className="min-w-0 truncate text-sm leading-5 text-foreground" title={routeData?.destination.label ?? widget.destination}>{routeData?.destination.label ?? widget.destination}</p>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Travel mode</span>
          <div className="flex gap-2" role="group" aria-label="Travel mode">
            {modeOptions.map(({ value, label, Icon }) => (
              <Button
                key={value}
                type="button"
                variant={mode === value ? "default" : "outline"}
                className="min-h-11 min-w-11 gap-1 px-1 text-[11px] sm:gap-1.5 sm:px-3 sm:text-xs"
                aria-pressed={mode === value}
                onClick={() => chooseMode(value)}
              >
                <Icon className="size-3 sm:size-4" aria-hidden="true" />
                <span>{label}</span>
              </Button>
            ))}
          </div>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden="true">
            <span className="size-2.5 rounded-full bg-primary" />
          </span>
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {routeData ? formatDistance(routeData.distanceMeters) : status === "loading" ? "Calculating…" : "—"}
          </span>
          <span className="text-xs text-muted-foreground">distance</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-full bg-secondary text-secondary-foreground" aria-hidden="true">
            <Clock3 className="size-4" />
          </span>
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {routeData ? formatDuration(routeData.durationSeconds) : status === "loading" ? "Calculating…" : "—"}
          </span>
          <span className="text-xs text-muted-foreground">estimated · no live traffic</span>
        </div>
      </div>

      <div className="relative h-[260px] w-full bg-muted sm:h-[320px]">
        <div
          ref={mapContainerRef}
          id={mapId}
          className="absolute inset-0"
          role="region"
          aria-label={`Interactive route map from ${routeData?.origin.label ?? widget.origin} to ${routeData?.destination.label ?? widget.destination}`}
          aria-roledescription="map"
        />

        {status === "loading" ? (
          <div className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center bg-muted/80" role="status">
            <div className="flex items-center gap-2 rounded-full border border-border bg-card/95 px-4 py-2 text-sm text-muted-foreground shadow-sm">
              <LoaderCircle className="size-4 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
              Finding the route…
            </div>
          </div>
        ) : null}

        {status === "error" ? (
          <div className="absolute inset-0 z-[500] flex items-center justify-center bg-muted/95 p-5">
            <div className="max-w-sm text-center">
              <p className="text-sm font-medium text-foreground">Couldn’t load this route</p>
              <p className="mt-1 text-sm text-muted-foreground">{errorMessage}</p>
              <Button
                type="button"
                variant="outline"
                className="mt-3 min-h-11"
                onClick={retryRoute}
              >
                <RotateCcw className="size-4" aria-hidden="true" />
                Try again
              </Button>
            </div>
          </div>
        ) : null}

        {status === "ready" && routeData ? (
          <div className="absolute right-3 top-3 z-[1000] flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              className="min-h-11 min-w-11 bg-card/95 shadow-sm backdrop-blur-sm"
              aria-label="Zoom in"
              aria-controls={mapId}
              onClick={() => leafletMapRef.current?.zoomIn()}
            >
              <ZoomIn aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              className="min-h-11 min-w-11 bg-card/95 shadow-sm backdrop-blur-sm"
              aria-label="Zoom out"
              aria-controls={mapId}
              onClick={() => leafletMapRef.current?.zoomOut()}
            >
              <ZoomOut aria-hidden="true" />
            </Button>
          </div>
        ) : null}

        {status === "ready" && tileError ? (
          <p className="absolute left-3 top-3 z-[1000] rounded-md border border-border bg-card/95 px-3 py-2 text-xs text-muted-foreground shadow-sm" role="status">
            Map tiles are unavailable; the route is still shown.
          </p>
        ) : null}
      </div>

      {routeData?.steps.length ? (
        <details className="border-t border-border">
          <summary className="group flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-[-2px]">
            <span>Turn-by-turn directions <span className="ml-1 text-xs font-normal text-muted-foreground">({routeData.steps.length})</span></span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
          </summary>
          <ol className="grid gap-0 border-t border-border px-4 py-2">
            {routeData.steps.map((step, index) => (
              <li key={`${index}-${step.instruction}`} className="flex min-h-11 items-start gap-3 border-b border-border/70 py-2.5 last:border-b-0">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums text-muted-foreground" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 text-sm leading-5 text-foreground">{step.instruction}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatDistance(step.distanceMeters)}</span>
              </li>
            ))}
          </ol>
        </details>
      ) : null}

      <p className="border-t border-border px-4 py-2 text-xs leading-4 text-muted-foreground">
        Route lookup sends these locations to OpenStreetMap and OSRM.
      </p>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {status === "loading" ? "Calculating route." : status === "error" ? errorMessage : routeData ? `${formatDistance(routeData.distanceMeters)} route loaded.` : ""}
      </p>
    </section>
  );
}
