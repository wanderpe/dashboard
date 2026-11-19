"use client";

import dynamic from "next/dynamic";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { LoaderCircle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MAP_NEARBY_CATEGORIES } from "@/lib/map-nearby-categories.mjs";
import type { LocationContextChangeHandler, LocationResolutionState } from "@/lib/location-context-types";
import { isCurrentLocationOriginLabel } from "@/lib/route-map-request.mjs";

type NearbyCategory = keyof typeof MAP_NEARBY_CATEGORIES;
type LocationSource = "nominatim" | "photon" | "map_pin";
type LocationState = "RESOLVED" | "USER_CONFIRMED" | "ROUTE_VALIDATED";
type NearbyPlace = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  source: LocationSource;
  resolutionState: LocationState;
  userConfirmed: boolean;
  categories: string[];
  straightLineDistanceMeters: number;
  address: string | null;
};
type NearbyCenter = {
  label: string;
  lat: number;
  lon: number;
  source: LocationSource;
  resolutionState: LocationState;
  userConfirmed: boolean;
};
type NearbyResult = {
  center: NearbyCenter;
  radiusMeters: number;
  categories: string[];
  places: NearbyPlace[];
  truncated: boolean;
};
type NearbyMapWidgetData = {
  center: string;
  categories: string[];
  radiusMeters: number;
  routeOrigin?: string;
  routeMode?: "driving" | "walking" | "cycling";
};
type ComparisonRoute = {
  id: string;
  name: string;
  address: string | null;
  categories: string[];
  lat: number;
  lon: number;
  straightLineDistanceMeters: number | null;
  roadDistanceMeters: number | null;
  estimatedTravelTimeSeconds: number | null;
  geometry: Array<[number, number]> | null;
  resolutionState: "RESOLVED" | "ROUTE_VALIDATED";
  routeState: "FAILED" | "ROUTE_VALIDATED";
  rank: number | null;
  failureReason: string | null;
};
type RouteComparisonResult = {
  origin: NearbyCenter;
  center: NearbyCenter;
  categories: string[];
  radiusMeters: number;
  mode: "driving" | "walking" | "cycling";
  candidateCount: number;
  truncated: boolean;
  routes: ComparisonRoute[];
};
type RouteOverlay = { origin: NearbyCenter; route: ComparisonRoute };
type ComparisonState = {
  requestKey: string;
  status: "loading" | "ready" | "error";
  errorMessage: string;
  originCoordinates: { lat: number; lon: number } | null;
};
const NearbyMapCanvas = dynamic(
  () => import("./mapcn-map-renderer").then((module) => module.NearbyMapRenderer),
  { ssr: false, loading: () => null },
);
type NearbyPlacesMapProps = {
  center: NearbyCenter;
  places: NearbyPlace[];
  route: RouteOverlay | null;
  selectedPlaceId: string | null;
  ariaHidden: boolean;
  onTileError: () => void;
  onSelectPlace: (place: NearbyPlace) => void;
};

const CATEGORY_COLORS: Partial<Record<NearbyCategory, string>> = {
  gym: "#b44537",
  store: "#315d70",
  grocery: "#42815d",
  restaurant: "#b36a28",
  cafe: "#805a8e",
  pharmacy: "#327a8a",
  hotel: "#576b9b",
  gas_station: "#7c6647",
  park: "#458458",
  bank: "#52636e",
  school: "#a14d68",
  hospital: "#bc4646",
};
const RADIUS_OPTIONS = [500, 1_000, 1_500, 3_000, 5_000];

function isNearbyCategory(value: string): value is NearbyCategory {
  return Object.hasOwn(MAP_NEARBY_CATEGORIES, value);
}

function categoryLabel(value: string) {
  return isNearbyCategory(value) ? MAP_NEARBY_CATEGORIES[value].label : "Place";
}

function formatDistance(meters: number) {
  if (meters < 1_000) return `${Math.round(meters)} m`;
  const kilometers = meters / 1_000;
  return `${Number.isInteger(kilometers) ? kilometers.toFixed(0) : kilometers.toFixed(1)} km`;
}

function formatDuration(seconds: number) {
  const minutes = Math.max(0, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} h ${remainder} min` : `${hours} h`;
}

function isNearbyResult(value: unknown): value is NearbyResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Partial<NearbyResult>;
  return Boolean(
    result.center &&
      typeof result.center.label === "string" &&
      isValidLocationPoint(result.center) &&
      result.center.source === "nominatim" &&
      result.center.resolutionState === "RESOLVED" &&
      result.center.userConfirmed === false &&
      Number.isInteger(result.radiusMeters) &&
      typeof result.truncated === "boolean" &&
      Array.isArray(result.places) &&
      result.places.every((place) =>
        place &&
        typeof place.id === "string" &&
        typeof place.name === "string" &&
        isValidLocationPoint(place) &&
        place.source === "photon" &&
        place.resolutionState === "RESOLVED" &&
        place.userConfirmed === false &&
        Array.isArray(place.categories) &&
        Number.isFinite(place.straightLineDistanceMeters) && place.straightLineDistanceMeters >= 0,
      ),
  );
}

function isValidLocationPoint(value: unknown): value is { lat: number; lon: number } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const point = value as { lat?: unknown; lon?: unknown };
  return typeof point.lat === "number" && Number.isFinite(point.lat) && point.lat >= -90 && point.lat <= 90 &&
    typeof point.lon === "number" && Number.isFinite(point.lon) && point.lon >= -180 && point.lon <= 180;
}

function isRouteComparisonResult(value: unknown, allowConfirmedOrigin: boolean): value is RouteComparisonResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Partial<RouteComparisonResult>;
  const isValidPlace = (place: unknown) => Boolean(
    place && typeof place === "object" && !Array.isArray(place) &&
    typeof (place as NearbyCenter).label === "string" && isValidLocationPoint(place) &&
    (place as NearbyCenter).source === "nominatim" && (place as NearbyCenter).userConfirmed === false,
  );
  const isValidOrigin = (place: unknown) => isValidPlace(place) || (allowConfirmedOrigin && Boolean(
    place && typeof place === "object" && !Array.isArray(place) &&
    typeof (place as NearbyCenter).label === "string" && isValidLocationPoint(place) &&
    (place as NearbyCenter).source === "map_pin" &&
    (place as NearbyCenter).resolutionState === "USER_CONFIRMED" &&
    (place as NearbyCenter).userConfirmed === true,
  ));
  return Boolean(
    isValidOrigin(result.origin) && isValidPlace(result.center) &&
    Array.isArray(result.categories) && result.categories.length > 0 &&
    Number.isInteger(result.radiusMeters) &&
    ["driving", "walking", "cycling"].includes(result.mode ?? "") &&
    Number.isInteger(result.candidateCount) && result.candidateCount! >= 0 &&
    typeof result.truncated === "boolean" && Array.isArray(result.routes) &&
    result.routes.length <= result.candidateCount! &&
    result.routes.every((route) => {
      if (!route || typeof route.id !== "string" || typeof route.name !== "string" || !isValidLocationPoint(route)) return false;
      if (route.routeState === "ROUTE_VALIDATED") {
        return route.resolutionState === "ROUTE_VALIDATED" && Number.isInteger(route.rank) && route.rank! > 0 &&
          typeof route.straightLineDistanceMeters === "number" && Number.isFinite(route.straightLineDistanceMeters) && route.straightLineDistanceMeters >= 0 &&
          typeof route.roadDistanceMeters === "number" && Number.isFinite(route.roadDistanceMeters) && route.roadDistanceMeters >= 0 &&
          typeof route.estimatedTravelTimeSeconds === "number" && Number.isFinite(route.estimatedTravelTimeSeconds) && route.estimatedTravelTimeSeconds >= 0 &&
          Array.isArray(route.geometry) && route.geometry.length >= 2 && route.geometry.every((point) =>
            Array.isArray(point) && point.length === 2 && Number.isFinite(point[0]) && Math.abs(point[0]) <= 90 && Number.isFinite(point[1]) && Math.abs(point[1]) <= 180
          ) && route.failureReason === null;
      }
      return route.routeState === "FAILED" && route.resolutionState === "RESOLVED" && route.rank === null &&
        (route.straightLineDistanceMeters === null || (typeof route.straightLineDistanceMeters === "number" && Number.isFinite(route.straightLineDistanceMeters) && route.straightLineDistanceMeters >= 0)) &&
        route.roadDistanceMeters === null && route.estimatedTravelTimeSeconds === null && route.geometry === null &&
        typeof route.failureReason === "string" && route.failureReason.length > 0;
    }),
  );
}

export function NearbyPlacesMap({ center, places, route, selectedPlaceId, ariaHidden, onTileError, onSelectPlace }: NearbyPlacesMapProps) {
  const mapId = useId();
  const mapPlaces = useMemo(
    () => places.map((place) => {
      const primaryCategory = place.categories.find(isNearbyCategory);
      return {
        id: place.id,
        name: place.name,
        lat: place.lat,
        lon: place.lon,
        address: place.address,
        markerLabel: `${place.name} · ${place.categories.map(categoryLabel).join(", ")}`,
        color: primaryCategory ? CATEGORY_COLORS[primaryCategory] ?? "#315d70" : "#315d70",
      };
    }),
    [places],
  );

  return (
    <NearbyMapCanvas
      id={mapId}
      center={{ label: center.label, lat: center.lat, lon: center.lon }}
      places={mapPlaces}
      route={route}
      selectedPlaceId={selectedPlaceId}
      ariaHidden={ariaHidden}
      onMapError={onTileError}
      onSelectPlace={(placeId: string) => {
        const place = places.find((candidate) => candidate.id === placeId);
        if (place) onSelectPlace(place);
      }}
    />
  );
}

export function CartmanNearbyMapWidget({
  widget,
  messageId,
  routeOriginCoordinates = null,
  onLocationContextChange,
}: {
  widget: NearbyMapWidgetData;
  messageId: string;
  routeOriginCoordinates?: { lat: number; lon: number } | null;
  onLocationContextChange?: LocationContextChangeHandler;
}) {
  const radiusId = useId();
  const requestSequenceRef = useRef(0);
  const comparisonSequenceRef = useRef(0);
  const [categories, setCategories] = useState<NearbyCategory[]>(() => {
    const valid = widget.categories.filter(isNearbyCategory);
    return valid.length > 0 ? valid.slice(0, 5) : ["gym"];
  });
  const [radiusMeters, setRadiusMeters] = useState(() =>
    Number.isInteger(widget.radiusMeters) && widget.radiusMeters >= 500 && widget.radiusMeters <= 5_000
      ? widget.radiusMeters
      : 1_500,
  );
  const [resultSession, setResultSession] = useState<{ requestKey: string; result: NearbyResult } | null>(null);
  const [comparisonResult, setComparisonResult] = useState<RouteComparisonResult | null>(null);
  const [comparisonState, setComparisonState] = useState<ComparisonState>({
    requestKey: "",
    status: "loading",
    errorMessage: "",
    originCoordinates: null,
  });
  const [searchState, setSearchState] = useState<{
    requestKey: string;
    status: "loading" | "ready" | "error";
    errorMessage: string;
  }>({ requestKey: "", status: "loading", errorMessage: "" });
  const [tileError, setTileError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const categoriesKey = categories.join("|");
  const requestKey = JSON.stringify([widget.center, categoriesKey, radiusMeters, retryCount]);
  const result = resultSession?.requestKey === requestKey ? resultSession.result : null;
  const status = searchState.requestKey === requestKey ? searchState.status : "loading";
  const errorMessage = searchState.requestKey === requestKey ? searchState.errorMessage : "";
  const routeMode = widget.routeMode ?? "driving";
  const currentLocationIsRouteOrigin = Boolean(
    widget.routeOrigin && isCurrentLocationOriginLabel(widget.routeOrigin),
  );
  const routeOriginLat = currentLocationIsRouteOrigin ? routeOriginCoordinates?.lat : undefined;
  const routeOriginLon = currentLocationIsRouteOrigin ? routeOriginCoordinates?.lon : undefined;
  const currentRouteOriginCoordinates = useMemo(() => {
    if (
      typeof routeOriginLat !== "number" || !Number.isFinite(routeOriginLat) || routeOriginLat < -90 || routeOriginLat > 90 ||
      typeof routeOriginLon !== "number" || !Number.isFinite(routeOriginLon) || routeOriginLon < -180 || routeOriginLon > 180
    ) return null;
    return { lat: routeOriginLat, lon: routeOriginLon };
  }, [routeOriginLat, routeOriginLon]);
  const hasValidCurrentLocationCoordinates = currentLocationIsRouteOrigin && currentRouteOriginCoordinates !== null;
  const comparisonRequestKey = JSON.stringify([
    requestKey,
    widget.routeOrigin ?? "",
    routeMode,
    hasValidCurrentLocationCoordinates ? currentRouteOriginCoordinates : null,
  ]);
  const comparisonMatchesCurrentRequest = comparisonState.requestKey === comparisonRequestKey &&
    (!currentLocationIsRouteOrigin || comparisonState.originCoordinates === currentRouteOriginCoordinates);
  if (
    currentLocationIsRouteOrigin && !hasValidCurrentLocationCoordinates &&
    (comparisonResult !== null || comparisonState.requestKey !== "" || comparisonState.originCoordinates !== null || selectedRouteId !== null)
  ) {
    setComparisonResult(null);
    setComparisonState({ requestKey: "", status: "loading", errorMessage: "", originCoordinates: null });
    setSelectedRouteId(null);
  }
  const missingCurrentLocationError = "Enable location in the chat controls above to compare routes from your current location.";
  const comparisonNeedsLocation = currentLocationIsRouteOrigin && status === "ready" &&
    !hasValidCurrentLocationCoordinates;
  const comparisonStatus = comparisonNeedsLocation
    ? "error"
    : comparisonMatchesCurrentRequest
      ? comparisonState.status
      : "loading";
  const comparisonError = comparisonNeedsLocation
    ? missingCurrentLocationError
    : comparisonMatchesCurrentRequest
      ? comparisonState.errorMessage
      : "";
  const contextCandidateNames = status === "ready" && result
    ? result.places.map((place) => place.name)
    : [];
  const contextCandidateNamesKey = JSON.stringify(contextCandidateNames);
  const locationResolutionState: LocationResolutionState = status === "loading"
    ? "SEARCHING"
    : status === "error"
      ? "FAILED"
      : result
        ? "RESOLVED"
        : "UNRESOLVED";

  useEffect(() => {
    const controller = new AbortController();
    const sequence = ++requestSequenceRef.current;
    const selectedCategories = categoriesKey.split("|").filter(isNearbyCategory);

    void fetch("/api/map-nearby", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ center: widget.center, categories: selectedCategories, radiusMeters }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const message =
            body && typeof body === "object" && "error" in body &&
            body.error && typeof body.error === "object" && "message" in body.error &&
            typeof body.error.message === "string"
              ? body.error.message
              : "Could not search nearby places.";
          throw new Error(message);
        }
        if (!isNearbyResult(body)) throw new Error("Nearby places returned an invalid response.");
        if (sequence === requestSequenceRef.current) {
          setResultSession({ requestKey, result: body });
          setSearchState({ requestKey, status: "ready", errorMessage: "" });
          setSelectedPlaceId(null);
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || sequence !== requestSequenceRef.current) return;
        setSearchState({
          requestKey,
          status: "error",
          errorMessage: error instanceof Error ? error.message : "Could not search nearby places.",
        });
      });

    return () => controller.abort();
  }, [widget.center, categoriesKey, radiusMeters, retryCount, requestKey]);

  useEffect(() => {
    if (!widget.routeOrigin || status !== "ready") return;
    const sequence = ++comparisonSequenceRef.current;
    if (currentLocationIsRouteOrigin && !hasValidCurrentLocationCoordinates) return;
    const controller = new AbortController();
    const selectedCategories = categoriesKey.split("|").filter(isNearbyCategory);
    void fetch("/api/map-route/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origin: widget.routeOrigin,
        center: widget.center,
        categories: selectedCategories,
        radiusMeters,
        mode: routeMode,
        ...(currentLocationIsRouteOrigin && currentRouteOriginCoordinates
          ? { confirmedCoordinates: { origin: currentRouteOriginCoordinates } }
          : {}),
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const message =
            body && typeof body === "object" && "error" in body &&
            body.error && typeof body.error === "object" && "message" in body.error &&
            typeof body.error.message === "string"
              ? body.error.message
              : "Could not compare routes to nearby places.";
          throw new Error(message);
        }
        if (!isRouteComparisonResult(body, currentLocationIsRouteOrigin) || body.mode !== routeMode ||
            body.radiusMeters !== radiusMeters || body.categories.join("|") !== selectedCategories.join("|")) {
          throw new Error("Route comparison returned an invalid response.");
        }
        if (sequence === comparisonSequenceRef.current) {
          setComparisonResult(body);
          setComparisonState({
            requestKey: comparisonRequestKey,
            status: "ready",
            errorMessage: "",
            originCoordinates: currentLocationIsRouteOrigin ? currentRouteOriginCoordinates : null,
          });
          setSelectedRouteId(body.routes.find((route) => route.routeState === "ROUTE_VALIDATED")?.id ?? null);
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || sequence !== comparisonSequenceRef.current) return;
        setComparisonState({
          requestKey: comparisonRequestKey,
          status: "error",
          errorMessage: error instanceof Error ? error.message : "Could not compare routes to nearby places.",
          originCoordinates: currentLocationIsRouteOrigin ? currentRouteOriginCoordinates : null,
        });
        setComparisonResult(null);
        setSelectedRouteId(null);
      });

    return () => controller.abort();
  }, [
    widget.routeOrigin,
    widget.center,
    routeMode,
    categoriesKey,
    radiusMeters,
    status,
    comparisonRequestKey,
    currentLocationIsRouteOrigin,
    hasValidCurrentLocationCoordinates,
    currentRouteOriginCoordinates,
  ]);

  useEffect(() => {
    onLocationContextChange?.(messageId, {
      kind: "nearby",
      value: {
        center: widget.center,
        categories: categoriesKey.split("|").filter(isNearbyCategory),
        radiusMeters,
        candidateNames: JSON.parse(contextCandidateNamesKey) as string[],
        ...(widget.routeOrigin && !currentLocationIsRouteOrigin
          ? { routeOrigin: widget.routeOrigin, routeMode }
          : {}),
      },
    });
  }, [
    onLocationContextChange,
    messageId,
    widget.center,
    widget.routeOrigin,
    routeMode,
    currentLocationIsRouteOrigin,
    categoriesKey,
    radiusMeters,
    contextCandidateNamesKey,
  ]);

  const mapResult = result ?? resultSession?.result ?? null;
  const places = result?.places ?? [];
  const selectedPlace = places.find((place) => place.id === selectedPlaceId) ?? null;
  const currentComparison = comparisonMatchesCurrentRequest && comparisonState.status === "ready"
    ? comparisonResult
    : null;
  const selectedRoute = currentComparison?.routes.find((route) =>
    route.id === selectedRouteId && route.routeState === "ROUTE_VALIDATED",
  ) ?? currentComparison?.routes.find((route) => route.routeState === "ROUTE_VALIDATED") ?? null;

  function selectPlace(place: NearbyPlace) {
    setSelectedPlaceId(place.id);
    if (currentComparison?.routes.some((route) => route.id === place.id && route.routeState === "ROUTE_VALIDATED")) {
      setSelectedRouteId(place.id);
    }
  }

  function toggleCategory(category: NearbyCategory, checked: boolean) {
    setCategories((current) => {
      if (checked) {
        if (current.includes(category) || current.length >= 5) return current;
        return [...current, category];
      }
      if (current.length <= 1) return current;
      return current.filter((candidate) => candidate !== category);
    });
  }

  return (
    <section className="my-4 w-full min-w-0 overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm" aria-label="Nearby places">
      <header className="border-b border-border bg-muted/55 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Nearby search · Photon + OpenStreetMap</p>
        <p className="mt-1 text-[11px] text-muted-foreground">Location resolution · {locationResolutionState}</p>
        <h3 className="mt-1.5 text-sm font-semibold leading-5 text-foreground">Places near {result?.center.label ?? widget.center}</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">Searches OpenStreetMap data within {formatDistance(radiusMeters)} of the selected center.</p>
      </header>

      <div className="grid gap-4 border-b border-border p-4">
        <fieldset>
          <legend className="text-xs font-medium text-muted-foreground">Place categories · choose up to 5</legend>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">
            {Object.entries(MAP_NEARBY_CATEGORIES).map(([category, metadata]) => {
              const typedCategory = category as NearbyCategory;
              const checked = categories.includes(typedCategory);
              const disabled = !checked && categories.length >= 5;
              const inputId = `${radiusId}-${category}`;
              return (
                <label key={category} htmlFor={inputId} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-sm text-foreground hover:bg-muted/50">
                  <input
                    id={inputId}
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={checked}
                    disabled={disabled}
                    onChange={(event) => toggleCategory(typedCategory, event.target.checked)}
                  />
                  <span>{metadata.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <label htmlFor={radiusId} className="grid max-w-xs gap-1.5 text-xs font-medium text-muted-foreground">
          Search radius
          <select
            id={radiusId}
            className="min-h-11 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-primary"
            value={radiusMeters}
            onChange={(event) => setRadiusMeters(Number(event.target.value))}
          >
            {RADIUS_OPTIONS.map((radius) => (
              <option key={radius} value={radius}>{formatDistance(radius)}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="relative h-[260px] w-full bg-muted sm:h-[320px]">
        {mapResult ? (
          <NearbyPlacesMap
            center={mapResult.center}
            places={places}
            route={result && selectedRoute && currentComparison ? { origin: currentComparison.origin, route: selectedRoute } : null}
            selectedPlaceId={result ? selectedPlaceId : null}
            ariaHidden={status !== "ready"}
            onTileError={() => setTileError(true)}
            onSelectPlace={selectPlace}
          />
        ) : null}
        {status === "loading" ? (
          <div className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center bg-muted" role="status">
            <div className="flex items-center gap-2 rounded-full border border-border bg-card/95 px-4 py-2 text-sm text-muted-foreground shadow-sm">
              <LoaderCircle className="size-4 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
              Finding nearby places…
            </div>
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
              className="pointer-events-auto absolute bottom-2 right-2 z-[1000] rounded border border-border bg-card px-2 py-1 text-[10px] font-medium text-foreground underline underline-offset-2 shadow-sm focus-visible:outline-2 focus-visible:outline-primary"
            >
              © OpenStreetMap contributors
            </a>
          </div>
        ) : null}
        {status === "error" && !result ? (
          <div className="absolute inset-0 z-[500] flex items-center justify-center bg-muted p-5">
            <div className="max-w-sm text-center">
              <p className="text-sm font-medium text-foreground">Couldn’t load nearby places</p>
              <p className="mt-1 text-sm text-muted-foreground">{errorMessage}</p>
              <Button type="button" variant="outline" className="mt-3 min-h-11" onClick={() => setRetryCount((count) => count + 1)}>
                <RotateCcw className="size-4" aria-hidden="true" />
                Try again
              </Button>
            </div>
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
              className="absolute bottom-2 right-2 z-[1000] rounded border border-border bg-card px-2 py-1 text-[10px] font-medium text-foreground underline underline-offset-2 shadow-sm focus-visible:outline-2 focus-visible:outline-primary"
            >
              © OpenStreetMap contributors
            </a>
          </div>
        ) : null}
        {tileError && result ? (
          <p className="absolute left-3 top-3 z-[1000] rounded-md border border-border bg-card/95 px-3 py-2 text-xs text-muted-foreground shadow-sm" role="status">
            Map tiles are unavailable; place results are still shown.
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 border-t border-border p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="text-sm font-semibold text-foreground">{status === "loading" && !result ? "Searching…" : `${places.length} nearby ${places.length === 1 ? "place" : "places"}`}</h4>
          <span className="text-xs text-muted-foreground">{formatDistance(radiusMeters)} radius</span>
        </div>
        {status === "error" && result ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3" role="alert">
            <p className="min-w-0 flex-1 text-sm text-foreground">{errorMessage}</p>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setRetryCount((count) => count + 1)}>
              <RotateCcw className="size-4" aria-hidden="true" />
              Try again
            </Button>
          </div>
        ) : null}
        {status === "ready" && places.length === 0 ? (
          <p className="text-sm text-muted-foreground">No named places in OpenStreetMap match these categories in this area.</p>
        ) : null}
        {status === "ready" && result?.truncated ? (
          <p className="rounded-md border border-amber-300/50 bg-amber-50/60 p-3 text-sm text-foreground" role="status">
            More than 40 places matched. Showing and comparing the first 40; additional provider results were omitted by the response limit.
          </p>
        ) : null}
        {places.length > 0 ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {places.map((place) => (
              <li key={place.id}>
                <button
                  type="button"
                  className={`flex min-h-14 w-full items-start gap-3 rounded-md border px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-primary ${selectedPlaceId === place.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
                  aria-label={`Show ${place.name} on map`}
                  aria-pressed={selectedPlaceId === place.id}
                  onClick={() => selectPlace(place)}
                >
                  <span
                    className="mt-1.5 size-3 shrink-0 rounded-full border-2 border-white shadow"
                    style={{ backgroundColor: CATEGORY_COLORS[place.categories.find(isNearbyCategory) ?? "store"] }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{place.name}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {place.categories.map(categoryLabel).join(" · ")}{place.address ? ` · ${place.address}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">Straight-line · {formatDistance(place.straightLineDistanceMeters)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {widget.routeOrigin ? (
          <section className="grid gap-2 border-t border-border pt-3" aria-label="Route comparison">
            <div>
              <h4 className="text-sm font-semibold text-foreground">Routes from {currentComparison?.origin.label ?? widget.routeOrigin}</h4>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Ranked by road distance. Straight-line distance and estimated travel time are shown separately.</p>
            </div>
            {comparisonStatus === "loading" ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                <LoaderCircle className="size-4 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
                Calculating a road route for each discovered place…
              </p>
            ) : null}
            {comparisonStatus === "error" ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-foreground" role="alert">
                Route comparison is unavailable: {comparisonError} Nearby places remain listed.
              </p>
            ) : null}
            {currentComparison ? (
              <>
                {currentComparison.truncated ? (
                  <p className="rounded-md border border-amber-300/50 bg-amber-50/60 p-3 text-sm text-foreground" role="status">
                    The provider returned more candidates than the comparison limit. The displayed routes cover the first {currentComparison.routes.length} candidates only.
                  </p>
                ) : null}
                {currentComparison.routes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No discovered places could be compared.</p>
                ) : (
                  <ol className="grid gap-2" role="group" aria-label={`Routes from ${currentComparison.origin.label}`}>
                    {currentComparison.routes.map((route) => (
                      <li key={route.id}>
                        {route.routeState === "ROUTE_VALIDATED" ? (
                          <button
                            type="button"
                            className={`flex min-h-14 w-full flex-col items-start gap-1 rounded-md border px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-primary ${selectedRoute?.id === route.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
                            aria-label={`Show route to ${route.name}, road distance ${formatDistance(route.roadDistanceMeters!)}`}
                            aria-pressed={selectedRoute?.id === route.id}
                            onClick={() => {
                              setSelectedRouteId(route.id);
                              setSelectedPlaceId(route.id);
                            }}
                          >
                            <span className="text-sm font-medium text-foreground">#{route.rank} · {route.name}</span>
                            <span className="text-xs tabular-nums text-muted-foreground">
                              Straight-line · {formatDistance(route.straightLineDistanceMeters!)} · Road · {formatDistance(route.roadDistanceMeters!)} · Estimated · {formatDuration(route.estimatedTravelTimeSeconds!)}
                            </span>
                          </button>
                        ) : (
                          <div className="grid gap-1 rounded-md border border-border bg-muted/30 px-3 py-2" aria-label={`${route.name}: route unavailable`}>
                            <span className="text-sm font-medium text-foreground">{route.name} · Route unavailable</span>
                            <span className="text-xs text-muted-foreground">{route.failureReason}</span>
                            {route.straightLineDistanceMeters !== null ? (
                              <span className="text-xs text-muted-foreground">Straight-line · {formatDistance(route.straightLineDistanceMeters)}</span>
                            ) : null}
                          </div>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </>
            ) : null}
          </section>
        ) : null}
      </div>

      {selectedPlace ? (
        <div className="sr-only" aria-live="polite">Selected {selectedPlace.name} on the map.</div>
      ) : null}
      <p className="border-t border-border px-4 py-2 text-xs leading-4 text-muted-foreground">
        Nearby searches use Photon with OpenStreetMap data. Place names and points may be incomplete; business hours and current availability are not verified.
      </p>
    </section>
  );
}
