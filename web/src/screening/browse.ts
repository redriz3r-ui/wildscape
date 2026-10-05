import type { Species } from "../data/types";

export const groupIcons: Record<string, string> = {
  Birds: "🐦",
  Plants: "🌿",
  Mammals: "🐾",
  Reptiles: "🦎",
  Arthropods: "🦋",
};

const orderLabels: Record<string, string> = {
  Passeriformes: "Perching birds",
  Accipitriformes: "Hawks and eagles",
  Falconiformes: "Falcons",
  Strigiformes: "Owls",
  Galliformes: "Ground birds",
  Columbiformes: "Doves and pigeons",
  Piciformes: "Woodpeckers",
  Cuculiformes: "Cuckoos",
  Caprimulgiformes: "Nightjars",
  Apodiformes: "Swifts and hummingbirds",
  Asterales: "Daisies and allies",
  Fabales: "Peas and allies",
  Boraginales: "Borages and allies",
  Caryophyllales: "Cacti and allies",
  Poales: "Grasses and allies",
  Fagales: "Oaks and allies",
  Asparagales: "Agaves and allies",
  Lamiales: "Mints and allies",
  Brassicales: "Mustards and allies",
};

export const taxonOrder = (species: Species) =>
  species.parent_taxonomy?.order || "Unclassified";
export const taxonFamily = (species: Species) =>
  species.parent_taxonomy?.family || "Family unrecorded";
export const orderLabel = (order: string) =>
  orderLabels[order] ? `${orderLabels[order]} · ${order}` : order;

export interface PhotoReference {
  name: string;
  image: string;
  source: string;
  credit: string;
  license: "CC0" | "CC BY";
  provider: string;
  match: string;
}

export interface MediaCatalogue {
  schema: number;
  world: string;
  built_at: string;
  note: string;
  photos: Record<string, PhotoReference>;
}

export function verifiedPhoto(
  catalogue: MediaCatalogue | undefined,
  species: Species,
): PhotoReference | undefined {
  const photo = catalogue?.photos?.[species.id];
  return photo?.name === species.name &&
    (photo.license === "CC0" || photo.license === "CC BY") &&
    /^media\/[A-Za-z0-9-]+\.webp$/.test(photo.image) &&
    /^https:\/\/www\.inaturalist\.org\/photos\/\d+$/.test(photo.source)
    ? photo
    : undefined;
}
