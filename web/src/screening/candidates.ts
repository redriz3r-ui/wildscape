import type { Candidate } from "./types";
/** Curated starting references, not an exhaustive or official project species list. */
export const regionalCandidates: Candidate[] = [
  {
    id: "regional-tortoise",
    name: "Gopherus agassizii",
    common: "Mojave desert tortoise",
    group: "Reptiles",
    reason:
      "Regional Mojave screening reference. Evaluate geographic applicability and current agency information for this project.",
    habitat:
      "Desert scrub and wash context; assess burrow substrate, forage and disturbance in the field. A mapped vegetation class alone does not establish suitable habitat.",
    source: "https://www.ndow.org/species/desert-tortoise/",
    sourceTitle: "Nevada Department of Wildlife · Desert Tortoise",
    checked: "2026-09-29",
    origin: "regional",
  },
  {
    id: "regional-gila",
    name: "Heloderma suspectum",
    common: "Gila monster",
    group: "Reptiles",
    reason:
      "Southern Nevada regional screening reference; range and project relevance require biologist review.",
    habitat:
      "NDOW describes rocky desert scrub and semi-desert grassland. Burrows and local rock structure are not resolved by the habitat rasters.",
    source: "https://www.ndow.org/species/gila-monster/",
    sourceTitle: "Nevada Department of Wildlife · Gila Monster",
    checked: "2026-09-29",
    origin: "regional",
  },
  {
    id: "regional-owl",
    name: "Athene cunicularia",
    common: "Western burrowing owl",
    group: "Birds",
    reason:
      "Nevada regional screening reference. Review local records and project habitat even when public records are absent.",
    habitat:
      "NDOW describes open areas with short vegetation, including grasslands and sagebrush. Burrow availability and nesting evidence require field verification.",
    source: "https://www.ndow.org/species/western-burrowing-owl/",
    sourceTitle: "Nevada Department of Wildlife · Western Burrowing Owl",
    checked: "2026-09-29",
    origin: "regional",
  },
];
