"use client";

import dynamic from "next/dynamic";
import { useId } from "react";

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

const PinMapCanvas = dynamic(
  () => import("./mapcn-map-renderer").then((module) => module.PinMapRenderer),
  { ssr: false, loading: () => null },
);

export function RoutePinMap(props: PinMapProps) {
  const mapId = useId();

  return (
    <PinMapCanvas
      id={mapId}
      center={props.center}
      resolvedEndpoints={props.resolvedEndpoints}
      confirmedCoordinates={props.confirmedCoordinates}
      activeEndpoint={props.activeEndpoint}
      draftCoordinate={props.draftCoordinate}
      onMapPoint={props.onMapPoint}
      onMapError={props.onTileError}
    />
  );
}
