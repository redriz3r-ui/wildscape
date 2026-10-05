import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  nearbyRecords,
  regionalSpecies,
  sampleHabitat,
} from "../src/screening/explore";
import type { Pack } from "../src/screening/types";
import { verifiedPhoto, taxonFamily, taxonOrder } from "../src/screening/browse";
import type { MediaCatalogue } from "../src/screening/browse";

const pack: Pack = JSON.parse(
  readFileSync("../public/screening/mojave-001/pack.json", "utf8"),
);
for (const layer of pack.layers) {
  const raw = readFileSync(`../public/screening/mojave-001/${layer.data}`);
  layer.values = Int16Array.from({ length: layer.size * layer.size }, (_, i) =>
    raw.readInt16LE(i * 2),
  );
}

describe("regional map exploration", () => {
  it("samples each real mapped habitat grid at a selected location", () => {
    const point: [number, number] = [-114.5933, 37.2159];
    const samples = pack.layers.map((layer) => sampleHabitat(layer, point));
    expect(samples).toHaveLength(3);
    for (const sample of samples) {
      expect(sample.code).not.toBeNull();
      expect(
        sample.layer.legend.some(
          (entry) => entry.code === sample.code && entry.label === sample.label,
        ),
      ).toBe(true);
    }
  });
  it("reports outside coverage instead of inventing a habitat class", () => {
    for (const layer of pack.layers)
      expect(sampleHabitat(layer, [-115, 37]).code).toBeNull();
  });
  it("finds known public evidence and retains coordinate uncertainty", () => {
    const record = pack.records.find((r) => !r.is_sensitive && !r.is_obscured)!;
    const found = nearbyRecords(
      pack,
      [record.longitude, record.latitude],
      1000,
    );
    expect(
      found.some(
        (entry) => entry.record.id === record.id && entry.distance < 1,
      ),
    ).toBe(true);
    const census = regionalSpecies(pack);
    expect(census.length).toBeGreaterThan(100);
    expect(census.every((entry) => entry.records.length > 0)).toBe(true);
  });
  it("categorizes all shareable-record taxa and verifies photo attribution", () => {
    const species = regionalSpecies(pack).map((item) => item.species);
    expect(species.length).toBe(124);
    expect(species.filter((item) => item.group === "Birds")).toHaveLength(64);
    expect(species.filter((item) => item.group === "Plants")).toHaveLength(57);
    expect(species.every((item) => taxonFamily(item) && taxonOrder(item))).toBe(
      true,
    );
    const catalogue: MediaCatalogue = JSON.parse(
      readFileSync("../public/screening/mojave-001/media.json", "utf8"),
    );
    expect(Object.keys(catalogue.photos)).toHaveLength(120);
    for (const speciesItem of species) {
      const photo = verifiedPhoto(catalogue, speciesItem);
      if (!photo) continue;
      expect(["CC0", "CC BY"]).toContain(photo.license);
      expect(photo.credit).toBeTruthy();
      expect(photo.source).toMatch(
        /^https:\/\/www\.inaturalist\.org\/photos\/\d+$/,
      );
      expect(
        readFileSync(`../public/screening/mojave-001/${photo.image}`)
          .byteLength,
      ).toBeGreaterThan(1000);
    }
    const first = species[0];
    const changed = {
      ...catalogue,
      photos: {
        ...catalogue.photos,
        [first.id]: {
          ...catalogue.photos[first.id],
          name: "Wrong taxon",
          license: "CC BY-NC",
        },
      },
    } as MediaCatalogue;
    expect(verifiedPhoto(changed, first)).toBeUndefined();
  });
});
