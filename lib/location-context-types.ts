export type LocationResolutionState = "UNRESOLVED" | "SEARCHING" | "RESOLVED" | "USER_CONFIRMED" | "ROUTE_VALIDATED" | "FAILED";
export type LocationTravelMode = "driving" | "walking" | "cycling";

export type NearbyLocationContext = {
  center: string;
  categories: string[];
  radiusMeters: number;
  candidateNames: string[];
  routeOrigin?: string;
  routeMode?: LocationTravelMode;
};

export type DirectRouteLocationContext = {
  origin: string;
  destination: string;
  mode: LocationTravelMode;
};

export type LocationContext = {
  nearby?: NearbyLocationContext;
  route?: DirectRouteLocationContext;
};

export type LocationContextUpdate =
  | { kind: "nearby"; value: NearbyLocationContext }
  | { kind: "route"; value: DirectRouteLocationContext };

export type LocationContextChangeHandler = (messageId: string, update: LocationContextUpdate) => void;
