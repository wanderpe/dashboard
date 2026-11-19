"use client";

import { Component, useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  Map,
  MapControls,
  MapMarker,
  MapRoute,
  MarkerContent,
  MarkerPopup,
  MarkerTooltip,
  useMap,
  type MapStyleOption,
} from "@/components/ui/map";
import {
  canPlacePinFromMap,
  endpointMarkerPoint,
  initialPinMapView,
  isValidCoordinates,
} from "@/lib/route-map-request.mjs";
import {
  latLonPointToMapLibre,
  latLonRouteToMapLibre,
} from "@/lib/map-coordinate-adapter.mjs";

const OSM_STYLE: MapStyleOption = {
  version: 8,
  sources: {
    openstreetmap: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
    },
  },
  layers: [{ id: "openstreetmap-raster", type: "raster", source: "openstreetmap" }],
};

const OSM_STYLES = { light: OSM_STYLE, dark: OSM_STYLE };

type Coordinates = { lat: number; lon: number };
type Endpoint = "origin" | "destination";
type EndpointPlace = Coordinates & { label: string };
type RouteMapData = {
  origin: EndpointPlace;
  destination: EndpointPlace;
  geometry: Array<[number, number]>;
};
type PinMapCenter = Coordinates & { label: string; zoom: number };
type NearbyMapCenter = Coordinates & { label: string };

type NearbyMapPlace = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  address: string | null;
  markerLabel: string;
  color: string;
};
export type NearbyMapRoute = {
  origin: EndpointPlace;
  route: {
    lat: number;
    lon: number;
    name: string;
    geometry: Array<[number, number]> | null;
  };
};

function MapResizeObserver() {
  const { map, isLoaded } = useMap();

  useEffect(() => {
    if (!map || !isLoaded) return;
    const container = map.getContainer();
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container);
    requestAnimationFrame(() => map.resize());
    return () => observer.disconnect();
  }, [map, isLoaded]);

  return null;
}

function MapErrorReporter({ onError }: { onError: () => void }) {
  const { map } = useMap();

  useEffect(() => {
    if (!map) return;
    const handleError = () => onError();
    map.on("error", handleError);
    return () => {
      map.off("error", handleError);
    };
  }, [map, onError]);

  return null;
}

class MapInitializationBoundary extends Component<
  { children: ReactNode; message: string },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div
          className="absolute inset-0 flex items-center justify-center bg-muted px-4 text-center text-sm text-muted-foreground"
          role="status"
        >
          {this.props.message}
        </div>
      );
    }
    return this.props.children;
  }
}

function OpenStreetMap({
  center,
  zoom,
  onError,
  fallbackMessage,
  children,
  showControls = true,
}: {
  center: [number, number];
  zoom: number;
  onError: () => void;
  fallbackMessage: string;
  children: ReactNode;
  showControls?: boolean;
}) {
  return (
    <MapInitializationBoundary message={fallbackMessage}>
      <Map
        className="absolute inset-0"
        center={center}
        zoom={zoom}
        maxZoom={19}
        keyboard
        scrollZoom={false}
        styles={OSM_STYLES}
      >
        {children}
        <MapResizeObserver />
        <MapErrorReporter onError={onError} />
        {showControls ? <MapControls position="top-right" className="cartman-map-controls" /> : null}
      </Map>
    </MapInitializationBoundary>
  );
}

function mapBounds(points: Array<[number, number]>) {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const [longitude, latitude] of points) {
    west = Math.min(west, longitude);
    south = Math.min(south, latitude);
    east = Math.max(east, longitude);
    north = Math.max(north, latitude);
  }
  return [[west, south], [east, north]] as [[number, number], [number, number]];
}

function FitPoints({
  points,
  maxZoom,
  padding,
}: {
  points: Array<[number, number]>;
  maxZoom: number;
  padding: number;
}) {
  const { map, isLoaded } = useMap();
  const pointsKey = points.map(([longitude, latitude]) => `${longitude},${latitude}`).join(";");

  useEffect(() => {
    if (!map || !isLoaded || points.length === 0) return;
    if (points.length === 1 || points.every((point) => point[0] === points[0][0] && point[1] === points[0][1])) {
      map.jumpTo({ center: points[0], zoom: maxZoom });
      return;
    }
    map.fitBounds(mapBounds(points), { padding, maxZoom, duration: 0 });
  }, [map, isLoaded, pointsKey, maxZoom, padding, points]);

  return null;
}

function RouteEndpointMarker({
  point,
  name,
  letter,
  variant,
}: {
  point: EndpointPlace;
  name: "Start" | "Destination";
  letter: "A" | "B";
  variant: "start" | "end";
}) {
  const markerLabel = `${name} · ${point.label}`;
  const title = `${name}: ${point.label}`;

  return (
    <MapMarker longitude={point.lon} latitude={point.lat} anchor="center">
      <MarkerContent className="cartman-route-marker-host">
        <span
          title={title}
          className={`cartman-route-marker cartman-route-marker--${variant}`}
          role="img"
          aria-label={markerLabel}
          tabIndex={0}
        >
          {letter}
        </span>
      </MarkerContent>
      <MarkerTooltip offset={[0, -12]}>{markerLabel}</MarkerTooltip>
    </MapMarker>
  );
}

export function RouteMapRenderer({
  id,
  route,
  onMapError,
}: {
  id: string;
  route: RouteMapData;
  onMapError: () => void;
}) {
  const geometry = useMemo(() => latLonRouteToMapLibre(route.geometry), [route.geometry]);
  const points = useMemo(
    () => [
      ...geometry,
      latLonPointToMapLibre(route.origin),
      latLonPointToMapLibre(route.destination),
    ],
    [geometry, route.origin, route.destination],
  );
  const start = latLonPointToMapLibre(route.origin);

  return (
    <div
      id={id}
      className="absolute inset-0"
      role="region"
      aria-label={`Interactive route map from ${route.origin.label} to ${route.destination.label}`}
      aria-roledescription="map"
    >
      <OpenStreetMap
        center={start}
        zoom={11}
        onError={onMapError}
        fallbackMessage="The interactive map is unavailable in this browser; route details are still available."
      >
        <MapRoute coordinates={geometry} color="#ad342d" width={5} opacity={0.9} interactive={false} />
        <RouteEndpointMarker point={route.origin} name="Start" letter="A" variant="start" />
        <RouteEndpointMarker point={route.destination} name="Destination" letter="B" variant="end" />
        <FitPoints points={points} maxZoom={13} padding={38} />
      </OpenStreetMap>
    </div>
  );
}

function PinMapClickHandler({
  activeEndpoint,
  onMapPoint,
}: {
  activeEndpoint: Endpoint | null;
  onMapPoint: (point: Coordinates) => void;
}) {
  const { map, isLoaded } = useMap();

  useEffect(() => {
    if (!map || !isLoaded) return;
    const handleClick = (event: { lngLat: { lng: number; lat: number } }) => {
      if (!canPlacePinFromMap(activeEndpoint)) return;
      const longitude = ((event.lngLat.lng + 180) % 360 + 360) % 360 - 180;
      const point = { lat: event.lngLat.lat, lon: longitude };
      if (isValidCoordinates(point)) onMapPoint(point);
    };
    map.on("click", handleClick);
    return () => {
      map.off("click", handleClick);
    };
  }, [map, isLoaded, activeEndpoint, onMapPoint]);

  return null;
}

function PinMapViewport({
  center,
  draftCoordinate,
}: {
  center: PinMapCenter | null;
  draftCoordinate: Coordinates | null;
}) {
  const { map, isLoaded } = useMap();
  const view = initialPinMapView(center, draftCoordinate);
  const centerKey = center ? `${center.lat},${center.lon},${center.zoom}` : "";
  const draftKey = isValidCoordinates(draftCoordinate)
    ? `${draftCoordinate.lat},${draftCoordinate.lon}`
    : "";
  const previousCenterKey = useRef(centerKey);
  const previousDraftKey = useRef(draftKey);

  useEffect(() => {
    if (!map || !isLoaded) return;
    const centerChanged = previousCenterKey.current !== centerKey;
    const draftChanged = previousDraftKey.current !== draftKey;
    previousCenterKey.current = centerKey;
    previousDraftKey.current = draftKey;

    if (draftKey && (draftChanged || centerChanged)) {
      map.jumpTo({ center: [view.lon, view.lat], zoom: view.zoom });
    } else if (!draftKey && centerChanged && center) {
      const centerView = initialPinMapView(center, null);
      map.jumpTo({ center: [centerView.lon, centerView.lat], zoom: centerView.zoom });
    }
  }, [map, isLoaded, center, centerKey, draftCoordinate, draftKey, view.lat, view.lon, view.zoom]);

  return null;
}

function PinEndpointMarker({
  endpoint,
  resolved,
  confirmed,
}: {
  endpoint: Endpoint;
  resolved?: EndpointPlace;
  confirmed?: Coordinates;
}) {
  const result = endpointMarkerPoint(confirmed, resolved);
  if (!result) return null;

  const name = endpoint === "origin" ? "Start" : "Destination";
  const letter = endpoint === "origin" ? "A" : "B";
  const variant = endpoint === "origin" ? "start" : "end";
  const label = result.confirmed
    ? `${name} pin · confirmed`
    : `${name} · located by OpenStreetMap · ${resolved?.label ?? ""}`;

  return (
    <MapMarker longitude={result.coordinates.lon} latitude={result.coordinates.lat} anchor="center">
      <MarkerContent className="cartman-route-marker-host">
        <span
          title={label}
          className={`cartman-route-marker cartman-route-marker--${variant}`}
          role="img"
          aria-label={label}
          tabIndex={0}
        >
          {letter}
        </span>
      </MarkerContent>
      <MarkerTooltip offset={[0, -12]}>{label}</MarkerTooltip>
    </MapMarker>
  );
}

function PinDraftMarker({ endpoint, point }: { endpoint: Endpoint; point: Coordinates }) {
  const label = `Unconfirmed ${endpoint === "origin" ? "start" : "destination"} pin`;
  const letter = endpoint === "origin" ? "A" : "B";

  return (
    <MapMarker longitude={point.lon} latitude={point.lat} anchor="center">
      <MarkerContent className="cartman-route-marker-host">
        <span
          title={label}
          className="cartman-route-marker cartman-route-marker--draft"
          role="img"
          aria-label={label}
          tabIndex={0}
        >
          {letter}
        </span>
      </MarkerContent>
      <MarkerTooltip offset={[0, -12]}>{label}</MarkerTooltip>
    </MapMarker>
  );
}

export function PinMapRenderer({
  id,
  center,
  resolvedEndpoints,
  confirmedCoordinates,
  activeEndpoint,
  draftCoordinate,
  onMapPoint,
  onMapError,
}: {
  id: string;
  center: PinMapCenter | null;
  resolvedEndpoints: Partial<Record<Endpoint, EndpointPlace>>;
  confirmedCoordinates: Partial<Record<Endpoint, Coordinates>>;
  activeEndpoint: Endpoint | null;
  draftCoordinate: Coordinates | null;
  onMapPoint: (point: Coordinates) => void;
  onMapError: () => void;
}) {
  const initialView = initialPinMapView(center, draftCoordinate);
  const activeConfirmed = activeEndpoint ? confirmedCoordinates[activeEndpoint] : null;
  const draftMatchesConfirmed = isValidCoordinates(activeConfirmed) &&
    isValidCoordinates(draftCoordinate) &&
    draftCoordinate.lat === activeConfirmed.lat &&
    draftCoordinate.lon === activeConfirmed.lon;

  return (
    <div
      id={id}
      className="absolute inset-0"
      role="region"
      aria-label="Pin selector map"
      aria-roledescription="map"
    >
      <OpenStreetMap
        center={[initialView.lon, initialView.lat]}
        zoom={initialView.zoom}
        onError={onMapError}
        fallbackMessage="The interactive map is unavailable; enter coordinates above to set pins."
      >
        <PinMapClickHandler activeEndpoint={activeEndpoint} onMapPoint={onMapPoint} />
        <PinMapViewport center={center} draftCoordinate={draftCoordinate} />
        {(["origin", "destination"] as const).map((endpoint) => (
          <PinEndpointMarker
            key={endpoint}
            endpoint={endpoint}
            resolved={resolvedEndpoints[endpoint]}
            confirmed={confirmedCoordinates[endpoint]}
          />
        ))}
        {activeEndpoint !== null && canPlacePinFromMap(activeEndpoint) && isValidCoordinates(draftCoordinate) && !draftMatchesConfirmed ? (
          <PinDraftMarker endpoint={activeEndpoint} point={draftCoordinate} />
        ) : null}
      </OpenStreetMap>
      {activeEndpoint ? (
        <p className="pointer-events-none absolute left-3 right-16 top-3 z-20 rounded-md border border-border bg-card/95 px-3 py-2 text-xs leading-4 text-foreground shadow-sm">
          Tap or click the map to place the {activeEndpoint === "origin" ? "start" : "destination"} pin. Or enter coordinates above, then confirm before routing.
        </p>
      ) : null}
    </div>
  );
}

function NearbyPlaceMarker({
  place,
  selected,
  onSelect,
}: {
  place: NearbyMapPlace;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <MapMarker
      longitude={place.lon}
      latitude={place.lat}
      anchor="center"
      onClick={onSelect}
    >
      <MarkerContent className="cartman-nearby-marker-host">
        <button
          type="button"
          title={place.markerLabel}
          className={`cartman-nearby-marker${selected ? " cartman-nearby-marker--selected" : ""}`}
          style={{ backgroundColor: place.color }}
          aria-label={`Show ${place.name} on map`}
          aria-pressed={selected}
        />
      </MarkerContent>
      <MarkerTooltip>{place.markerLabel}</MarkerTooltip>
      <MarkerPopup closeButton>
        <div className="space-y-1 text-sm">
          <p className="font-medium">{place.name}</p>
          {place.address ? <p className="text-xs text-muted-foreground">{place.address}</p> : null}
        </div>
      </MarkerPopup>
    </MapMarker>
  );
}

function NearbyViewport({
  center,
  places,
  route,
  selectedPlaceId,
  ariaHidden,
}: {
  center: NearbyMapCenter;
  places: NearbyMapPlace[];
  route: NearbyMapRoute | null;
  selectedPlaceId: string | null;
  ariaHidden: boolean;
}) {
  const { map, isLoaded } = useMap();
  const selectedPlace = places.find((place) => place.id === selectedPlaceId) ?? null;
  const points = useMemo(() => {
    const next: Array<[number, number]> = [latLonPointToMapLibre(center)];
    next.push(...places.map((place) => [place.lon, place.lat] as [number, number]));
    if (route) {
      next.push(latLonPointToMapLibre(route.origin));
      if (route.route.geometry) next.push(...latLonRouteToMapLibre(route.route.geometry));
      next.push([route.route.lon, route.route.lat]);
    }
    return next;
  }, [center, places, route]);
  const pointsKey = points.map(([longitude, latitude]) => `${longitude},${latitude}`).join(";");

  useEffect(() => {
    if (!map || !isLoaded || ariaHidden) return;
    if (selectedPlace) {
      map.jumpTo({
        center: [selectedPlace.lon, selectedPlace.lat],
        zoom: Math.max(map.getZoom(), 16),
      });
      return;
    }
    if (places.length > 0 || route) {
      map.fitBounds(mapBounds(points), { padding: 36, maxZoom: 16, duration: 0 });
      return;
    }
    map.jumpTo({ center: latLonPointToMapLibre(center), zoom: 14 });
  }, [map, isLoaded, ariaHidden, selectedPlace, places.length, route, pointsKey, points, center]);

  return null;
}

export function NearbyMapRenderer({
  id,
  center,
  places,
  route,
  selectedPlaceId,
  ariaHidden,
  onMapError,
  onSelectPlace,
}: {
  id: string;
  center: NearbyMapCenter;
  places: NearbyMapPlace[];
  route: NearbyMapRoute | null;
  selectedPlaceId: string | null;
  ariaHidden: boolean;
  onMapError: () => void;
  onSelectPlace: (placeId: string) => void;
}) {
  const selectedPlace = places.find((place) => place.id === selectedPlaceId) ?? null;
  const routeGeometry = useMemo(
    () => route?.route.geometry ? latLonRouteToMapLibre(route.route.geometry) : [],
    [route],
  );
  const initialCenter = latLonPointToMapLibre(center);

  return (
    <div className="absolute inset-0">
      <div
        id={id}
        className="absolute inset-0"
        role="region"
        aria-label={`Map showing nearby places around ${center.label}${selectedPlace ? `, focused on ${selectedPlace.name}` : ""}`}
        aria-hidden={ariaHidden}
        inert={ariaHidden}
        aria-roledescription="map"
      >
        <OpenStreetMap
          center={initialCenter}
          zoom={14}
          onError={onMapError}
          fallbackMessage="The interactive map is unavailable; nearby places remain listed."
          showControls={!ariaHidden}
        >
          {!ariaHidden ? (
            <>
              {route && routeGeometry.length >= 2 ? (
                <MapRoute coordinates={routeGeometry} color="#ad342d" width={5} opacity={0.9} interactive={false} />
              ) : null}
              {route ? (
                <>
                  <MapMarker longitude={route.origin.lon} latitude={route.origin.lat} anchor="center">
                    <MarkerContent>
                      <span className="cartman-nearby-dot cartman-nearby-dot--origin" role="img" aria-label={`Route origin · ${route.origin.label}`} title={`Route origin · ${route.origin.label}`} />
                    </MarkerContent>
                    <MarkerTooltip>{`Route origin · ${route.origin.label}`}</MarkerTooltip>
                  </MapMarker>
                  <MapMarker longitude={route.route.lon} latitude={route.route.lat} anchor="center">
                    <MarkerContent>
                      <span className="cartman-nearby-dot cartman-nearby-dot--destination" role="img" aria-label={`Route destination · ${route.route.name}`} title={`Route destination · ${route.route.name}`} />
                    </MarkerContent>
                    <MarkerTooltip>{`Route destination · ${route.route.name}`}</MarkerTooltip>
                  </MapMarker>
                </>
              ) : null}
              <MapMarker longitude={center.lon} latitude={center.lat} anchor="center">
                <MarkerContent>
                  <span className="cartman-nearby-dot cartman-nearby-dot--center" role="img" aria-label={`Search center · ${center.label}`} title={`Search center · ${center.label}`} />
                </MarkerContent>
                <MarkerTooltip>{`Search center · ${center.label}`}</MarkerTooltip>
              </MapMarker>
              {places.map((place) => (
                <NearbyPlaceMarker
                  key={place.id}
                  place={place}
                  selected={place.id === selectedPlaceId}
                  onSelect={() => onSelectPlace(place.id)}
                />
              ))}
              <NearbyViewport
                center={center}
                places={places}
                route={route}
                selectedPlaceId={selectedPlaceId}
                ariaHidden={ariaHidden}
              />
            </>
          ) : (
            <NearbyViewport
              center={center}
              places={places}
              route={route}
              selectedPlaceId={selectedPlaceId}
              ariaHidden={ariaHidden}
            />
          )}
        </OpenStreetMap>
      </div>
    </div>
  );
}
