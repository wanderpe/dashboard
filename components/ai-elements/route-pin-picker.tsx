"use client";

import { useEffect, useId, useLayoutEffect, useRef } from "react";
import type { LayerGroup, Map as LeafletMap } from "leaflet";
import { ZoomIn, ZoomOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { canPlacePinFromMap, endpointMarkerPoint, initialPinMapView, isValidCoordinates } from "@/lib/route-map-request.mjs";

type Endpoint = "origin" | "destination";
type Point = { lat: number; lon: number };
type PlaceResult = Point & { label: string };
type MapCenter = Point & { label: string; zoom: number };
type PinMapProps = {
  center: MapCenter | null;
  resolvedEndpoints: Partial<Record<Endpoint, PlaceResult>>;
  confirmedCoordinates: Partial<Record<Endpoint, Point>>;
  activeEndpoint: Endpoint | null;
  draftCoordinate: Point | null;
  onMapPoint: (point: Point) => void;
  onTileError: () => void;
};

type PinMapRuntime = {
  L: typeof import("leaflet");
  map: LeafletMap;
  markerLayer: LayerGroup;
  syncMarkers: () => void;
};

const endpoints: Endpoint[] = ["origin", "destination"];

function tooltipText(text: string) {
  const element = document.createElement("span");
  element.textContent = text;
  return element;
}

function markerIcon(L: typeof import("leaflet"), letter: string, variant: "start" | "end" | "draft") {
  return L.divIcon({
    className: "cartman-route-marker-host",
    html: `<span class="cartman-route-marker cartman-route-marker--${variant}" aria-hidden="true">${letter}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

export function RoutePinMap({
  center,
  resolvedEndpoints,
  confirmedCoordinates,
  activeEndpoint,
  draftCoordinate,
  onMapPoint,
  onTileError,
}: PinMapProps) {
  const mapId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<PinMapRuntime | null>(null);
  const propsRef = useRef({ resolvedEndpoints, confirmedCoordinates, activeEndpoint, draftCoordinate });
  const callbacksRef = useRef({ onMapPoint, onTileError });

  useLayoutEffect(() => {
    propsRef.current = { resolvedEndpoints, confirmedCoordinates, activeEndpoint, draftCoordinate };
    callbacksRef.current = { onMapPoint, onTileError };
  }, [resolvedEndpoints, confirmedCoordinates, activeEndpoint, draftCoordinate, onMapPoint, onTileError]);

  useEffect(() => {
    let cancelled = false;
    let map: LeafletMap | null = null;
    let resizeObserver: ResizeObserver | null = null;

    function syncMarkers(L: typeof import("leaflet"), markerLayer: LayerGroup) {
      markerLayer.clearLayers();
      const current = propsRef.current;
      for (const endpoint of endpoints) {
        const letter = endpoint === "origin" ? "A" : "B";
        const variant = endpoint === "origin" ? "start" : "end";
        const markerPoint = endpointMarkerPoint(
          current.confirmedCoordinates[endpoint],
          current.resolvedEndpoints[endpoint],
        );
        if (markerPoint) {
          const { coordinates: point, confirmed } = markerPoint;
          const label = confirmed
            ? `${endpoint === "origin" ? "Start" : "Destination"} pin · confirmed`
            : `${endpoint === "origin" ? "Start" : "Destination"} · located by OpenStreetMap · ${current.resolvedEndpoints[endpoint]?.label ?? ""}`;
          L.marker([point.lat, point.lon], {
            icon: markerIcon(L, letter, variant),
            title: label,
            alt: label,
            keyboard: false,
            riseOnHover: true,
          })
            .addTo(markerLayer)
            .bindTooltip(tooltipText(label), { direction: "top", offset: [0, -12] });
        }
      }

      const active = current.activeEndpoint;
      const activeConfirmed = active ? current.confirmedCoordinates[active] : null;
      const draftMatchesConfirmed = isValidCoordinates(activeConfirmed) &&
        isValidCoordinates(current.draftCoordinate) &&
        current.draftCoordinate.lat === activeConfirmed.lat &&
        current.draftCoordinate.lon === activeConfirmed.lon;
      if (canPlacePinFromMap(active) && isValidCoordinates(current.draftCoordinate) && !draftMatchesConfirmed) {
        const letter = active === "origin" ? "A" : "B";
        const label = `Unconfirmed ${active === "origin" ? "start" : "destination"} pin`;
        L.marker([current.draftCoordinate.lat, current.draftCoordinate.lon], {
          icon: markerIcon(L, letter, "draft"),
          title: label,
          alt: label,
          keyboard: false,
          riseOnHover: true,
        })
          .addTo(markerLayer)
          .bindTooltip(tooltipText(label), { direction: "top", offset: [0, -12] });
      }
    }

    void import("leaflet")
      .then((L) => {
        if (cancelled || !containerRef.current) return;
        map = L.map(containerRef.current, {
          zoomControl: false,
          scrollWheelZoom: false,
          keyboard: true,
          preferCanvas: true,
        });
        const initialView = initialPinMapView(center, propsRef.current.draftCoordinate);
        map.setView([initialView.lat, initialView.lon], initialView.zoom);
        const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
        });
        tiles.on("tileerror", () => callbacksRef.current.onTileError());
        tiles.addTo(map);
        const markerLayer = L.layerGroup().addTo(map);
        map.on("click", (event) => {
          if (!canPlacePinFromMap(propsRef.current.activeEndpoint)) return;
          const longitude = ((event.latlng.lng + 180) % 360 + 360) % 360 - 180;
          const point = { lat: event.latlng.lat, lon: longitude };
          if (!isValidCoordinates(point)) return;
          callbacksRef.current.onMapPoint(point);
        });
        const sync = () => syncMarkers(L, markerLayer);
        runtimeRef.current = { L, map, markerLayer, syncMarkers: sync };
        sync();
        requestAnimationFrame(() => map?.invalidateSize());
        resizeObserver = new ResizeObserver(() => map?.invalidateSize());
        resizeObserver.observe(containerRef.current);
      })
      .catch(() => {
        if (!cancelled) callbacksRef.current.onTileError();
      });

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      map?.remove();
      runtimeRef.current = null;
    };
  }, [center, mapId]);

  useEffect(() => {
    runtimeRef.current?.syncMarkers();
  }, [resolvedEndpoints, confirmedCoordinates, activeEndpoint, draftCoordinate]);

  useEffect(() => {
    if (isValidCoordinates(draftCoordinate)) runtimeRef.current?.map.panTo([draftCoordinate.lat, draftCoordinate.lon]);
  }, [draftCoordinate]);

  return (
    <div className="absolute inset-0">
      <div
        ref={containerRef}
        id={mapId}
        className="absolute inset-0"
        role="region"
        aria-label="Pin selector map"
        aria-roledescription="map"
      />
      {activeEndpoint ? (
        <p className="pointer-events-none absolute left-3 right-16 top-3 z-[900] rounded-md border border-border bg-card/95 px-3 py-2 text-xs leading-4 text-foreground shadow-sm">
          Tap or click the map to place the {activeEndpoint === "origin" ? "start" : "destination"} pin. Or enter coordinates above, then confirm before routing.
        </p>
      ) : null}
      <div className="absolute right-3 top-3 z-[1000] flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          className="min-h-11 min-w-11 bg-card/95 shadow-sm backdrop-blur-sm"
          aria-label="Zoom in on pin map"
          aria-controls={mapId}
          onClick={() => runtimeRef.current?.map.zoomIn()}
        >
          <ZoomIn aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          className="min-h-11 min-w-11 bg-card/95 shadow-sm backdrop-blur-sm"
          aria-label="Zoom out on pin map"
          aria-controls={mapId}
          onClick={() => runtimeRef.current?.map.zoomOut()}
        >
          <ZoomOut aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
