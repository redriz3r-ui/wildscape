# Mojave point planner

Open `http://127.0.0.1:5173/?planner=mojave` with the web and API services running. The project workspace header also links to the planner.

Click anywhere inside the outlined EPA Mojave Basin and Range ecoregion, enter WGS84 longitude/latitude, or inspect the map center. The outline defines pilot coverage, not the species range. Locations outside it are rejected explicitly. Global coverage is not implemented.

## Point attributes

| Attribute | Provider | Interpretation |
|---|---|---|
| Ground elevation | USGS Elevation Point Query Service | Resolution and acquisition date returned by the source |
| Vegetation type, cover, height | LANDFIRE 2025 EVT/EVC/EVH | Mapped 30 m classes decoded using official legends; not field measurements |
| Final critical-habitat intersection | USFWS critical habitat GIS | Point intersection for Gopherus agassizii; review the governing rule separately |
| Public tortoise record count | GBIF | CC0 and CC BY records with usable public coordinates in an approximate rectangular search box |

Counts are records, not individuals or occupancy probabilities. Generalized coordinates may be displaced; records centered outside the box are excluded even if uncertainty overlaps it. Zero records does not indicate absence. No exact animal locations are returned. No suitability score is calculated.

Aerial/topographic basemaps use USGS tiled services. Additional zoom enlarges the available imagery; it cannot create finer source detail. The initial imagery provider is historical and does not establish current ground conditions.

Each source result includes retrieval time and a link. A source failure appears as unavailable, never as zero or no intersection. Complete responses are cached for 24 hours per API worker; partial responses for 60 seconds. Inspecting a point sends its coordinates to the cited services. Lookup time and coverage depend on those external services.

## Team workflow

Sign in to save a candidate site, its source snapshot, team assessment and rationale. Members can reopen the snapshot; owners/editors can update the name, rationale and status. Viewer permissions and concurrent-edit conflicts are enforced on the server. The snapshot is signed by the API and cannot be replaced by arbitrary client-supplied source data when saved. A new lookup is needed if the signing token is older than 24 hours.

Unsaved assessments trigger a warning before changing locations or leaving the page. Location changes and duplicate submissions are blocked while saving. A failed save leaves the form available, with a private GeoJSON draft export containing the current rationale and status. Drafts are labeled unsaved and are not automatically stored in browser storage. Browser/process crashes can still lose edits that have not been saved or exported.

Private GeoJSON exports contain the selected candidate point, source attributes and current assessment attributes. They do not represent surveyed tortoise locations. Candidate sites are currently separate from the original bounded project pack; regional field-survey execution, transects, effort and detection/non-detection records need a further workflow before this can be used as a complete survey system.

## Validation

Live provider checks and browser tests are recorded during implementation. Automated API tests cover coverage rejection, service failures, vegetation coordinate reference handling, signed snapshots, workspace isolation, viewer permissions and stale updates. Professional ecological validation remains a release gate.

## Find recorded areas

Use **Find recorded areas** after moving the map to a Mojave location. WildScape checks up to 16 nearby, equal-sized 25 × 25 km or 50 × 50 km areas and ranks them by public desert tortoise record count. Choose all available years, 2015 onward, or 2020 onward. The search is centered on the map view; pan and run it again to examine another part of the Mojave. Cells are included when their centers lie in the EPA pilot region, so some boxes can cross its edge.

The ranking uses GBIF count-only queries for *Gopherus agassizii* records with public coordinates, present status, no flagged geospatial issue, and CC0/CC BY licenses. Individual record coordinates are never requested or displayed. A failed source query appears as **Count unavailable** and is excluded from count ranking. Results are cached for 24 hours when complete, or one minute when partial.

Export the ranked broad-area polygons as GeoJSON for review in GIS; each feature retains its count or unavailable state, with source and retrieval metadata in the collection. Select a ranked area to focus the map. **Inspect area center** runs the regular point evidence lookup at the center of that broad box; it is not a sighting location. Counts reflect published records, including effects of repeated survey effort, duplicate event reporting, generalized coordinates and missing data. They do not measure tortoise density, occupancy or habitat suitability. Zero published records does not establish absence. Biologists should pair this context with access, substrate, habitat, survey methods and project-specific agency guidance.
