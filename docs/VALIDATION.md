# Wildscape V1 validation

Validated on 2026-09-27 in the requested WildScape folder. The disk-space blocker is resolved. Both the real World 001 and independent synthetic fixture build and run locally.

## Delivered data

- Real terrain footprint: approximately 15.7 × 15.7 km, EPSG:32611, selected from official LANDFIRE BpS coverage. Final BpS 10820 coverage: 87.19%.
- USGS 3DEP terrain: 1025 × 1025 final elevation grid, approximately 940–1728 m. Real NAIP imagery is reprojected to the same footprint.
- LANDFIRE 2016 BpS and 2025 EVT/EVC/EVH, decoded using official attribute tables; 12,037 deterministic instanced vegetation models.
- GBIF: 910 canonical/public records, 198 species. Twelve records use protected public geometry. NatureServe context is available for 179 taxa; 181 have enriched common names.
- Independent synthetic fixture: 12 taxa, 180 public records after deduplication. It remains explicitly labeled and provides offline reproducible tests.
- Production static distribution: 81.46 MiB uncompressed, including both worlds, offline globe assets, and renderer chunks.

## Acceptance coverage

| Specification criteria | Evidence |
| --- | --- |
| 1–4: bootstrap, PostGIS, fixture, source adapters | Documented Make commands; healthy PostGIS container; immutable raw-run and database integration tests; successful official source retrievals |
| 5–12: terrain, imagery, ecology, normalization, deduplication, privacy, static assets | Both worlds built; CRS and interpolation tests; categorical mappings; raw provenance; public allowlist and privacy tests; checksummed static assets |
| 13–23: globe, local landscape, vegetation, wildlife, explorer, query, fly-to, modes, attribution | Desktop and mobile fixture browser flows plus real-world browser flow; manual visual inspection of real terrain, imagery and clusters |
| 24–27: tests, production build, documentation, implemented features | Python and TypeScript checks; Playwright workflows; successful Vite production build; README reproduction steps; no critical TODO/NotImplemented placeholders in application sources |

The final browser suite covers globe entry/return, visualization switching, species filtering, record detail/fly-to, geodesic radius queries, terrain clicks, source attribution, narrow layouts and keyboard operation. Browser tests use installed Chrome with software WebGL; this does not establish a frame-rate guarantee for every GPU/device.

## Important interpretation and limits

Vegetation is a data-informed visualization, not a reconstruction of individual plants. Records are evidence, not a complete ecological inventory. Generalized positions are not exact observation locations. NAIP imagery is served through six local pyramid levels, with finest export spacing approximately 0.96 m/pixel; native source detail varies. Optional licensed species media may depend on external image hosts. The USFWS adapter is configurable but has no verified live layer supplied; NatureServe conservation enrichment is active. No DOI is claimed for the GBIF search-API ingest. No vertical datum conversion or field-survey validation is claimed.

See AOI_VERIFICATION.md for selection evidence and README.md for setup, regeneration, public/private data boundaries and deployment instructions.


## Sun and imagery update — 2026-09-28

Added manual solar azimuth and altitude, slope illumination (hillshade), DEM terrain cast shadows, and approximate shadow area in km² and percent. Computation runs in a worker on a 257 × 257 analysis grid (about 61 m). The display DEM uses about 15 m spacing. Shadows exclude trees, buildings and terrain outside the world boundary; image acquisition shadows remain in the photography. This is a bounded terrain model, not a date/time solar ephemeris or a survey measurement.

Built 1,365 local NAIP WebP tiles across zoom levels 0–5 from 64 official export patches, with acquisition provenance retained outside the public bundle. Close zoom requests level 5 successfully. Before/after screenshots confirm fine imagery remains visible with sun shading enabled. Shadow sampling is applied directly in the terrain shader so it does not replace or reduce the resolution of the imagery texture.

Validation: 37 Python tests passed (one optional database test skipped in this run), nine TypeScript tests passed, all five browser regression checks passed (including sun controls, close zoom, mobile navigation and real-world evidence), and production compilation succeeded. The final static distribution is 81.46 MiB; only visible imagery tiles are fetched during exploration.
