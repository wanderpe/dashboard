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
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RoutePinMap } from "@/components/ai-elements/route-pin-picker";
import { coordinatesForCurrentRoute, isValidCoordinates, routeContextForInputs, routeRequestContextMatches, routeSessionMatches } from "@/lib/route-map-request.mjs";

type TravelMode = "driving" | "walking" | "cycling";
type Endpoint = "origin" | "destination";
type Coordinates = { lat: number; lon: number };
type PendingRouteCoordinates = {
  origin: string;
  destination: string;
  generation: number;
  coordinates: Partial<Record<Endpoint, Coordinates>>;
};
type PinSelectionSession = {
  origin: string;
  destination: string;
  generation: number;
  details: PinSelectionDetails;
};
type PinDraft = { coordinate: Coordinates | null; latitude: string; longitude: string };
type MapCenter = Coordinates & { label: string; zoom: number };
type RouteMapWidgetData = {
  type: "route-map";
  origin: string;
  destination: string;
  mode: TravelMode;
};
type PlaceResult = { label: string; lat: number; lon: number; source?: "nominatim" | "map_pin" };
type PinSelectionDetails = {
  unresolvedEndpoints: Endpoint[];
  resolvedEndpoints: Partial<Record<Endpoint, PlaceResult>>;
  mapCenter: MapCenter | null;
};
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
type RouteResultSession = {
  origin: string;
  destination: string;
  mode: TravelMode;
  revision: number;
  generation: number;
  route: RouteResult;
};
type RouteStatus = "loading" | "pinning" | "ready" | "error";

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
  const sourceIsValid = value.source === undefined || value.source === "nominatim" || value.source === "map_pin";
  return (
    typeof value.label === "string" && sourceIsValid &&
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

function isEndpoint(value: unknown): value is Endpoint {
  return value === "origin" || value === "destination";
}

function isMapCenter(value: unknown): value is MapCenter {
  if (!isRecord(value)) return false;
  return (
    typeof value.label === "string" &&
    isCoordinate(value.lat) && value.lat >= -90 && value.lat <= 90 &&
    isCoordinate(value.lon) && value.lon >= -180 && value.lon <= 180 &&
    typeof value.zoom === "number" && Number.isFinite(value.zoom) && value.zoom >= 2 && value.zoom <= 19
  );
}

function isPinSelectionDetails(value: unknown): value is PinSelectionDetails {
  if (!isRecord(value) || !Array.isArray(value.unresolvedEndpoints) || !isRecord(value.resolvedEndpoints)) return false;
  const unresolved = value.unresolvedEndpoints;
  if (
    unresolved.length < 1 || unresolved.length > 2 ||
    unresolved.some((endpoint) => !isEndpoint(endpoint)) || new Set(unresolved).size !== unresolved.length
  ) return false;
  if (Object.entries(value.resolvedEndpoints).some(([endpoint, place]) => !isEndpoint(endpoint) || !isPlaceResult(place))) return false;
  return value.mapCenter === null || isMapCenter(value.mapCenter);
}

function pinSelectionResponse(payload: unknown): { message: string; details: PinSelectionDetails } | null {
  if (!isRecord(payload) || !isRecord(payload.error) || payload.error.code !== "place_not_found") return null;
  if (!isPinSelectionDetails(payload.error.details)) return null;
  const message = typeof payload.error.message === "string" && payload.error.message.trim()
    ? payload.error.message.trim()
    : "OpenStreetMap couldn't find every route location. Confirm the missing point on the map.";
  return { message, details: payload.error.details };
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

function parseCoordinates(latitude: string, longitude: string): Coordinates | null {
  if (!latitude.trim() || !longitude.trim()) return null;
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

function sameCoordinates(left: Coordinates | undefined | null, right: Coordinates | undefined | null) {
  return Boolean(left && right && left.lat === right.lat && left.lon === right.lon);
}

function endpointLabel(endpoint: Endpoint) {
  return endpoint === "origin" ? "Start point" : "Destination";
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
  const [routeDataSession, setRouteDataSession] = useState<RouteResultSession | null>(null);
  const [status, setStatus] = useState<RouteStatus>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [tileError, setTileError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [pinSelectionSession, setPinSelectionSession] = useState<PinSelectionSession | null>(null);
  const [confirmedCoordinatesSession, setConfirmedCoordinatesSession] = useState<PendingRouteCoordinates | null>(null);
  const [activeEndpoint, setActiveEndpoint] = useState<Endpoint | null>(null);
  const [draftCoordinate, setDraftCoordinate] = useState<Coordinates | null>(null);
  const [draftNeedsConfirmation, setDraftNeedsConfirmation] = useState<Partial<Record<Endpoint, boolean>>>({});
  const [latitudeInput, setLatitudeInput] = useState("");
  const [longitudeInput, setLongitudeInput] = useState("");
  const [draftsByEndpoint, setDraftsByEndpoint] = useState<Partial<Record<Endpoint, PinDraft>>>({});
  const [inputGeneration, setInputGeneration] = useState(0);
  const requestContextRef = useRef({ origin: widget.origin, destination: widget.destination, mode, revision: retryCount, generation: 0 });
  const requestCoordinatesRef = useRef<PendingRouteCoordinates | null>(null);
  const routeInputsRef = useRef({ origin: widget.origin, destination: widget.destination });
  const renderContext = {
    origin: widget.origin,
    destination: widget.destination,
    mode,
    revision: retryCount,
    generation: inputGeneration,
  };
  const routeData = routeDataSession && routeSessionMatches(routeDataSession, renderContext, {
    matchMode: true,
    matchRevision: true,
  })
    ? routeDataSession.route
    : null;
  const currentPinSession = pinSelectionSession !== null && routeSessionMatches(pinSelectionSession, renderContext);
  const pinSelection = currentPinSession ? pinSelectionSession?.details ?? null : null;
  const confirmedCoordinates = coordinatesForCurrentRoute(
    confirmedCoordinatesSession,
    widget.origin,
    widget.destination,
    renderContext.generation,
  ) ?? {};
  const mapId = useId();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<LeafletMap | null>(null);

  useLayoutEffect(() => {
    const nextInputs = { origin: widget.origin, destination: widget.destination };
    const currentContext = requestContextRef.current;
    const nextContext = routeContextForInputs(currentContext, nextInputs, mode, retryCount);
    requestContextRef.current = nextContext;
    if (nextContext.generation !== currentContext.generation) setInputGeneration(nextContext.generation);
  }, [widget.origin, widget.destination, mode, retryCount]);

  useEffect(() => {
    const previous = routeInputsRef.current;
    if (previous.origin === widget.origin && previous.destination === widget.destination) return;
    routeInputsRef.current = { origin: widget.origin, destination: widget.destination };
    requestCoordinatesRef.current = null;
    setRouteDataSession(null);
    setPinSelectionSession(null);
    setConfirmedCoordinatesSession(null);
    setActiveEndpoint(null);
    setDraftCoordinate(null);
    setDraftNeedsConfirmation({});
    setDraftsByEndpoint({});
    setLatitudeInput("");
    setLongitudeInput("");
    setErrorMessage("");
    setTileError(false);
    setStatus("loading");
  }, [widget.origin, widget.destination]);

  useEffect(() => {
    const controller = new AbortController();
    const requestContext = { ...requestContextRef.current };
    const isCurrentRequest = () => routeRequestContextMatches(requestContext, requestContextRef.current);
    const requestBody: Record<string, unknown> = {
      origin: requestContext.origin,
      destination: requestContext.destination,
      mode: requestContext.mode,
    };
    const requestCoordinates = coordinatesForCurrentRoute(
      requestCoordinatesRef.current,
      widget.origin,
      widget.destination,
      requestContext.generation,
    );
    if (requestCoordinatesRef.current && !requestCoordinates) requestCoordinatesRef.current = null;
    if (requestCoordinates && Object.keys(requestCoordinates).length > 0) {
      requestBody.confirmedCoordinates = requestCoordinates;
    }

    void fetch("/api/map-route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const pinResponse = pinSelectionResponse(payload);
          if (pinResponse) return { kind: "pin" as const, ...pinResponse };
          throw new Error(responseError(payload, "Could not calculate that route."));
        }
        if (!isRouteResult(payload, requestContext.mode)) throw new Error("The map service returned an invalid route.");
        return { kind: "route" as const, route: payload };
      })
      .then((result) => {
        if (controller.signal.aborted || !isCurrentRequest()) return;
        if (result.kind === "pin") {
          requestCoordinatesRef.current = null;
          setRouteDataSession(null);
          setPinSelectionSession({
            origin: requestContext.origin,
            destination: requestContext.destination,
            generation: requestContext.generation,
            details: result.details,
          });
          setConfirmedCoordinatesSession(null);
          setDraftNeedsConfirmation({});
          setDraftsByEndpoint({});
          setActiveEndpoint(result.details.unresolvedEndpoints[0] ?? null);
          setDraftCoordinate(null);
          setLatitudeInput("");
          setLongitudeInput("");
          setErrorMessage(result.message);
          setStatus("pinning");
          return;
        }
        requestCoordinatesRef.current = null;
        setRouteDataSession({
          origin: requestContext.origin,
          destination: requestContext.destination,
          mode: requestContext.mode,
          revision: requestContext.revision,
          generation: requestContext.generation,
          route: result.route,
        });
        setPinSelectionSession(null);
        setConfirmedCoordinatesSession(null);
        setDraftNeedsConfirmation({});
        setDraftsByEndpoint({});
        setActiveEndpoint(null);
        setDraftCoordinate(null);
        setErrorMessage("");
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || !isCurrentRequest()) return;
        setErrorMessage(error instanceof Error ? error.message : "Could not calculate that route.");
        setStatus("error");
      });

    return () => controller.abort();
  }, [widget.origin, widget.destination, retryCount]);

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
    const confirmedPins = coordinatesForCurrentRoute(
      requestCoordinatesRef.current,
      widget.origin,
      widget.destination,
      requestContextRef.current.generation,
    );
    const pinsMatchCurrentConfirmation = Boolean(
      pinSelection &&
      allPinsConfirmed &&
      confirmedPins &&
      Object.keys(confirmedPins).length === pinSelection.unresolvedEndpoints.length &&
      pinSelection.unresolvedEndpoints.every((endpoint) =>
        sameCoordinates(confirmedPins[endpoint], confirmedCoordinates[endpoint])
      ),
    );
    if (pinSelection && status === "loading" && !pinsMatchCurrentConfirmation) return;
    if (status === "error" && !pinSelection) {
      requestContextRef.current = { ...requestContextRef.current, origin: widget.origin, destination: widget.destination, mode: nextMode, revision: retryCount };
      setMode(nextMode);
      return;
    }
    const retryPinRoute = Boolean(pinSelection && status === "loading" && pinsMatchCurrentConfirmation);
    const revision = pinSelection && !retryPinRoute ? retryCount : retryCount + 1;
    requestContextRef.current = { ...requestContextRef.current, origin: widget.origin, destination: widget.destination, mode: nextMode, revision };
    setMode(nextMode);
    if (pinSelection && !retryPinRoute) return;

    if (!pinSelection) {
      const currentPins = coordinatesForCurrentRoute(
        requestCoordinatesRef.current,
        widget.origin,
        widget.destination,
        requestContextRef.current.generation,
      );
      const pinnedEndpoints: Partial<Record<Endpoint, Coordinates>> = { ...currentPins };
      if (!pinnedEndpoints.origin && routeData?.origin.source === "map_pin") {
        pinnedEndpoints.origin = { lat: routeData.origin.lat, lon: routeData.origin.lon };
      }
      if (!pinnedEndpoints.destination && routeData?.destination.source === "map_pin") {
        pinnedEndpoints.destination = { lat: routeData.destination.lat, lon: routeData.destination.lon };
      }
      requestCoordinatesRef.current = Object.keys(pinnedEndpoints).length > 0
        ? {
            origin: widget.origin,
            destination: widget.destination,
            generation: requestContextRef.current.generation,
            coordinates: pinnedEndpoints,
          }
        : null;
    }
    setRouteDataSession(null);
    setStatus("loading");
    setErrorMessage("");
    setTileError(false);
    setRetryCount(revision);
  }

  function retryRoute() {
    if (pinSelection) {
      if (!allPinsConfirmed) return;
      requestCoordinatesRef.current = {
        origin: widget.origin,
        destination: widget.destination,
        generation: requestContextRef.current.generation,
        coordinates: { ...confirmedCoordinates },
      };
    }
    requestContextRef.current = { ...requestContextRef.current, revision: retryCount + 1 };
    setRouteDataSession(null);
    setStatus("loading");
    setErrorMessage("");
    setTileError(false);
    setRetryCount((count) => count + 1);
  }

  function updateDraftCoordinates(latitude: string, longitude: string) {
    const endpoint = activeEndpoint;
    if (!currentPinSession || status === "loading" || !endpoint) return;
    const coordinate = parseCoordinates(latitude, longitude);
    setDraftNeedsConfirmation((current) => ({ ...current, [endpoint]: true }));
    setLatitudeInput(latitude);
    setLongitudeInput(longitude);
    setDraftCoordinate(coordinate);
    setDraftsByEndpoint((current) => ({ ...current, [endpoint]: { coordinate, latitude, longitude } }));
  }

  function choosePinEndpoint(endpoint: Endpoint) {
    if (status === "loading" || !currentPinSession || !pinSelection?.unresolvedEndpoints.includes(endpoint)) return;
    setActiveEndpoint(endpoint);
    const savedDraft = draftsByEndpoint[endpoint];
    const confirmed = confirmedCoordinates[endpoint] ?? null;
    const nextDraft = savedDraft ?? {
      coordinate: confirmed,
      latitude: confirmed ? String(confirmed.lat) : "",
      longitude: confirmed ? String(confirmed.lon) : "",
    };
    setDraftCoordinate(nextDraft.coordinate);
    setLatitudeInput(nextDraft.latitude);
    setLongitudeInput(nextDraft.longitude);
  }

  function setDraftFromMap(point: Coordinates) {
    const endpoint = activeEndpoint;
    if (status === "loading" || !currentPinSession || !endpoint || !isValidCoordinates(point)) return;
    const latitude = point.lat.toFixed(6);
    const longitude = point.lon.toFixed(6);
    setDraftNeedsConfirmation((current) => ({ ...current, [endpoint]: true }));
    setDraftCoordinate(point);
    setLatitudeInput(latitude);
    setLongitudeInput(longitude);
    setDraftsByEndpoint((current) => ({ ...current, [endpoint]: { coordinate: point, latitude, longitude } }));
  }

  function confirmActivePin() {
    if (status === "loading" || !currentPinSession || !activeEndpoint || !draftCoordinate || !pinSelection?.unresolvedEndpoints.includes(activeEndpoint)) return;
    const activeDraft = { coordinate: draftCoordinate, latitude: latitudeInput, longitude: longitudeInput };
    const nextCoordinates = { ...confirmedCoordinates, [activeEndpoint]: draftCoordinate };
    setDraftsByEndpoint((current) => ({ ...current, [activeEndpoint]: activeDraft }));
    setConfirmedCoordinatesSession({
      origin: widget.origin,
      destination: widget.destination,
      generation: requestContextRef.current.generation,
      coordinates: nextCoordinates,
    });
    setDraftNeedsConfirmation((current) => ({ ...current, [activeEndpoint]: false }));
    const nextEndpoint = pinSelection.unresolvedEndpoints.find(
      (endpoint) => endpoint !== activeEndpoint && !nextCoordinates[endpoint],
    );
    if (nextEndpoint) {
      setActiveEndpoint(nextEndpoint);
      const savedDraft = draftsByEndpoint[nextEndpoint];
      const nextPoint = savedDraft ? savedDraft.coordinate : nextCoordinates[nextEndpoint] ?? null;
      setDraftCoordinate(nextPoint);
      setLatitudeInput(savedDraft ? savedDraft.latitude : nextPoint ? String(nextPoint.lat) : "");
      setLongitudeInput(savedDraft ? savedDraft.longitude : nextPoint ? String(nextPoint.lon) : "");
    }
  }

  const allPinsConfirmed = Boolean(
    pinSelection && pinSelection.unresolvedEndpoints.every((endpoint) =>
      confirmedCoordinates[endpoint] &&
      !draftNeedsConfirmation[endpoint] &&
      (endpoint !== activeEndpoint || sameCoordinates(draftCoordinate, confirmedCoordinates[endpoint]))
    ),
  );

  function calculateRouteWithPins() {
    if (!currentPinSession || !pinSelection || !allPinsConfirmed) return;
    requestContextRef.current = { ...requestContextRef.current, revision: retryCount + 1 };
    requestCoordinatesRef.current = {
      origin: widget.origin,
      destination: widget.destination,
      generation: requestContextRef.current.generation,
      coordinates: { ...confirmedCoordinates },
    };
    setRouteDataSession(null);
    setStatus("loading");
    setErrorMessage("");
    setTileError(false);
    setRetryCount((count) => count + 1);
  }

  const selectedEndpoint = activeEndpoint ?? pinSelection?.unresolvedEndpoints[0] ?? null;

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

      {pinSelection ? (
        <div className="grid min-w-0 gap-3 border-b border-border bg-card p-4">
          <div>
            <h4 className="text-sm font-semibold text-foreground">Confirm locations on the map</h4>
            <p className="mt-1 text-sm text-muted-foreground">{errorMessage}</p>
            <p className="mt-1 text-sm text-muted-foreground">Choose each missing stop, place its pin on the map or enter coordinates, then confirm it. No route is calculated until you confirm the pins and continue.</p>
          </div>
          {pinSelection.mapCenter ? (
            <p className="text-xs leading-5 text-muted-foreground">
              Map centered near {pinSelection.mapCenter.label} for pin placement. The center itself is not assumed to be a route stop; only independently resolved locations and pins you confirm are used.
            </p>
          ) : (
            <p className="text-xs leading-5 text-muted-foreground">The map center is only for pin placement. Pan and zoom to the right area, or enter coordinates directly.</p>
          )}
          <div className="flex flex-wrap gap-2" role="group" aria-label="Route locations that need pins">
            {pinSelection.unresolvedEndpoints.map((endpoint) => {
              const confirmed = confirmedCoordinates[endpoint];
              const isDraftDifferent = draftNeedsConfirmation[endpoint] || (
                endpoint === selectedEndpoint && !sameCoordinates(draftCoordinate, confirmed)
              );
              return (
                <Button
                  key={endpoint}
                  type="button"
                  variant={selectedEndpoint === endpoint ? "default" : "outline"}
                  className="min-h-11 min-w-0 whitespace-normal text-center"
                  aria-pressed={selectedEndpoint === endpoint}
                  onClick={() => choosePinEndpoint(endpoint)}
                  disabled={status === "loading"}
                >
                  {endpointLabel(endpoint)} · {confirmed && !isDraftDifferent ? "pin confirmed" : "needs pin"}
                </Button>
              );
            })}
          </div>
          {selectedEndpoint ? (
            <div className="grid gap-3">
              <p className="text-sm text-foreground" aria-live="polite">
                Place the {endpointLabel(selectedEndpoint).toLowerCase()} pin. Click the map or type its latitude and longitude.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="grid min-w-0 gap-1.5 text-xs font-medium text-muted-foreground">
                  <span>{endpointLabel(selectedEndpoint)} latitude</span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={-90}
                    max={90}
                    step="any"
                    className="h-11 min-h-11 w-full min-w-0 rounded-md text-sm"
                    value={latitudeInput}
                    onChange={(event) => updateDraftCoordinates(event.target.value, longitudeInput)}
                    aria-label={`${endpointLabel(selectedEndpoint)} latitude`}
                    disabled={status === "loading"}
                  />
                </label>
                <label className="grid min-w-0 gap-1.5 text-xs font-medium text-muted-foreground">
                  <span>{endpointLabel(selectedEndpoint)} longitude</span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={-180}
                    max={180}
                    step="any"
                    className="h-11 min-h-11 w-full min-w-0 rounded-md text-sm"
                    value={longitudeInput}
                    onChange={(event) => updateDraftCoordinates(latitudeInput, event.target.value)}
                    aria-label={`${endpointLabel(selectedEndpoint)} longitude`}
                    disabled={status === "loading"}
                  />
                </label>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 w-full whitespace-normal text-center sm:w-auto"
                  onClick={confirmActivePin}
                  disabled={!draftCoordinate || status === "loading"}
                >
                  Confirm {selectedEndpoint === "origin" ? "start" : "destination"} pin
                </Button>
                <Button
                  type="button"
                  className="min-h-11 w-full whitespace-normal text-center sm:w-auto"
                  onClick={calculateRouteWithPins}
                  disabled={!allPinsConfirmed || status === "loading"}
                >
                  Calculate route with confirmed pins
                </Button>
              </div>
            </div>
          ) : null}
          {status === "loading" ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <LoaderCircle className="size-4 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
              Calculating route from the confirmed locations…
            </p>
          ) : null}
          {status === "error" ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3" role="alert">
              <p className="min-w-0 flex-1 text-sm text-foreground">{errorMessage}</p>
              <Button type="button" variant="outline" className="min-h-11" onClick={retryRoute} disabled={!allPinsConfirmed}>
                <RotateCcw className="size-4" aria-hidden="true" />
                Try route again
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="relative h-[260px] w-full bg-muted sm:h-[320px]">
        {pinSelection ? (
          <RoutePinMap
            center={pinSelection.mapCenter}
            resolvedEndpoints={pinSelection.resolvedEndpoints}
            confirmedCoordinates={confirmedCoordinates}
            activeEndpoint={activeEndpoint}
            draftCoordinate={draftCoordinate}
            onMapPoint={setDraftFromMap}
            onTileError={() => setTileError(true)}
          />
        ) : (
          <div
            ref={mapContainerRef}
            id={mapId}
            className="absolute inset-0"
            role="region"
            aria-label={`Interactive route map from ${routeData?.origin.label ?? widget.origin} to ${routeData?.destination.label ?? widget.destination}`}
            aria-roledescription="map"
          />
        )}

        {status === "loading" ? (
          <div className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center bg-muted/80" role="status">
            <div className="flex items-center gap-2 rounded-full border border-border bg-card/95 px-4 py-2 text-sm text-muted-foreground shadow-sm">
              <LoaderCircle className="size-4 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
              {pinSelection ? "Routing from the confirmed locations…" : "Finding the route…"}
            </div>
          </div>
        ) : null}

        {status === "error" && !pinSelection ? (
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

        {tileError && (status === "ready" || Boolean(pinSelection)) ? (
          <p className="absolute left-3 top-3 z-[1000] rounded-md border border-border bg-card/95 px-3 py-2 text-xs text-muted-foreground shadow-sm" role="status">
            {pinSelection ? "Map tiles are unavailable; use the coordinate fields to set pins." : "Map tiles are unavailable; the route is still shown."}
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
        Place lookup sends text to OpenStreetMap. Routing sends resolved or confirmed coordinates to OSRM; map tiles are served by OpenStreetMap.
      </p>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {status === "loading"
          ? "Calculating route."
          : pinSelection
            ? "Confirm the missing route locations with map pins or coordinates."
            : status === "error"
              ? errorMessage
              : routeData
                ? `${formatDistance(routeData.distanceMeters)} route loaded.`
                : ""}
      </p>
    </section>
  );
}
