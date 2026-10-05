# Habitat & species screening prototype — acceptance audit

Goal: a usable local consulting workflow with real Mojave context, source traceability and reviewable exports.

- [x] Reproducible screening data pack: `scripts/build_screening_pack.py`, `public/screening/mojave-001/pack.json`, raster grids/overlays, source manifest hash and provisional regional references. Verified 670 CC0/CC BY records; 240 excluded by license.
- [x] Project creation, persistent storage, polygon import/drawing and explicit coverage limits. Browser tests exercise drawing, GeoJSON import, reload and separate-ID backup restoration; geometry tests cover holes and invalid topology.
- [x] Species evidence: regional candidates survive missing records; public record uncertainty, buffer/date filters, cited additions and review decisions. Unit tests verify uncertain overlap and distant exclusion; browser tests add candidates and retain decisions after reload.
- [x] Habitat inspection and approximate area summaries from three real raster grids. Tests account for class cells plus NoData and compare footprint area with raster accounting. UI/report disclose resolution and method.
- [x] Field import and entry: WGS84 points, survey lines/polygons, observer/date, method/effort, sensitivity, removal and map display. Browser tests import a survey track, restore it from backup and remove it. Invalid dates and missing survey effort are rejected.
- [x] Consultant review: rationale, next actions, author, source checks, habitat interpretation and change history. Browser test records all species decisions, completes review, changes search distance, then verifies Draft state and reopened decisions/checks.
- [x] CSV, shared GeoJSON, private backup and printable HTML report. Browser test inspects downloaded content, confirms sensitive geometry is omitted from shared output and retained in private backup, and renders the report. Portable report map contains no local image dependencies.
- [x] Scientific interface, separate 3D context, responsive layout and local operating documentation. Desktop/mobile and report images inspected; mobile overflow/section positioning tested. Operating instructions in `docs/SCREENING_GUIDE.md`.
- [x] Unit and browser tests plus a real-data workflow pilot. Pilot uses real regional occurrence/raster data with a clearly synthetic footprint, reviewer and field entries. It proves software workflow, not field validation or agency approval.

## Verification record — 2026-10-01

- Python: 37 passed, one optional PostGIS integration test skipped; no database needed for this static/local screening workflow.
- TypeScript unit tests: 16 passed, including seven scientific screening tests.
- Browser suite: eight passed (three screening workflows, five legacy exploration/terrain tests), including real terrain, detailed imagery tiles and DEM shadows.
- Final cleanup: screening suite rerun for report map annotations and mobile layout; see Playwright output and `web/test-results`.
- Production TypeScript/Vite build succeeds; approximately 84 MiB total static output, including existing terrain and imagery assets.
- Ruff checks pass for pipeline and screening pack builder.

Scope: local browser prototype, one supplied Mojave regional data pack. No multiuser hosting or official agency determinations. New regions require a prepared data pack. Example footprints and synthetic test evidence are explicitly marked. A real client application still requires the actual project boundary, current agency/regional records and biologist field validation. These are inputs to using the product, not simulated completed assessments.
