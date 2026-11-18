export const MAP_NEARBY_CATEGORIES = Object.freeze({
  gym: Object.freeze({
    label: "Gyms",
    photonTag: "leisure:fitness_centre",
    photonKey: "leisure",
    photonValues: ["fitness_centre", "gym"],
  }),
  store: Object.freeze({ label: "Stores", photonTag: "shop", photonKey: "shop" }),
  grocery: Object.freeze({
    label: "Grocery stores",
    photonTag: "shop",
    photonKey: "shop",
    photonValues: ["supermarket", "convenience", "greengrocer", "deli"],
  }),
  restaurant: Object.freeze({ label: "Restaurants", photonTag: "amenity:restaurant", photonKey: "amenity", photonValues: ["restaurant"] }),
  cafe: Object.freeze({ label: "Cafes", photonTag: "amenity:cafe", photonKey: "amenity", photonValues: ["cafe"] }),
  pharmacy: Object.freeze({ label: "Pharmacies", photonTag: "amenity:pharmacy", photonKey: "amenity", photonValues: ["pharmacy"] }),
  hotel: Object.freeze({
    label: "Hotels",
    photonTag: "tourism",
    photonKey: "tourism",
    photonValues: ["hotel", "guest_house", "hostel"],
  }),
  gas_station: Object.freeze({ label: "Gas stations", photonTag: "amenity:fuel", photonKey: "amenity", photonValues: ["fuel"] }),
  park: Object.freeze({ label: "Parks", photonTag: "leisure:park", photonKey: "leisure", photonValues: ["park"] }),
  bank: Object.freeze({ label: "Banks", photonTag: "amenity:bank", photonKey: "amenity", photonValues: ["bank"] }),
  school: Object.freeze({ label: "Schools", photonTag: "amenity:school", photonKey: "amenity", photonValues: ["school"] }),
  hospital: Object.freeze({ label: "Hospitals", photonTag: "amenity:hospital", photonKey: "amenity", photonValues: ["hospital"] }),
});

export const MAP_NEARBY_CATEGORY_IDS = Object.freeze(Object.keys(MAP_NEARBY_CATEGORIES));
