# Wildscape screening prototype — local operating guide

Start from the repository with `npm --prefix web run dev`, then open http://127.0.0.1:5173. The default workspace is ecological screening. “3D context” opens the existing exploration viewer separately; that viewer is contextual, and its decorative vegetation is not mapped habitat or surveyed trees.

## Explore the regional data

The default Explore view works without a project boundary. Click the aerial map to inspect mapped LANDFIRE classes at that cell and public occurrence evidence within 1, 2 or 5 km. Search the nearby taxa or switch to the complete regional catalogue. Filter taxa by birds, plants, mammals, reptiles or arthropods, then by taxonomic order. Photos are reference images of the taxon and are not evidence from the selected location. Selecting a taxon shows its record dates, basis, coordinate uncertainty, dataset links, and a curated habitat reference only where one is available. Generalized records may overlap a search area from far away. This is evidence exploration, not a species presence, habitat suitability or absence determination.

## First project

1. Create a project and enter its client/owner, reference and screening purpose. Import a WGS84 GeoJSON Polygon, draw a boundary, or enter bounding coordinates. Holes are supported. A worked example uses real regional evidence with an explicitly illustrative footprint.
2. Set occurrence search distance and optional earliest date. The prepared Mojave pack covers approximately −114.680 to −114.507 longitude and 37.147 to 37.285 latitude. Boundaries outside it are rejected. Search coverage beyond the pack prevents completed review. A different location needs a new prepared pack; this build is not a worldwide data service.
3. Inspect candidate species and public occurrences. Add species from project-specific agency lists or other cited sources. The three regional references are deliberately provisional and not comprehensive. Date filtering affects public records, not regional candidates or submitted field evidence.
4. Inspect all three habitat layers and record interpretation and limitations. LANDFIRE BpS is potential vegetation; canopy height/cover are raster classifications. Neither identifies individual plants. Summary areas use cell-center membership on an approximately 31 m analysis grid from nominal 30 m data; NoData and boundary approximation remain visible.
5. Import field GeoJSON or enter observations. Points require name/species, date and observer; survey lines and polygons also require method and effort. Keep sensitive locations marked sensitive. Local maps and private backups contain them; shared GIS and reports omit their geometry and field detail. Field counts and species names may remain in screening tables: review outputs before sharing where even occurrence disclosure is restricted.
6. Review every species with rationale and reviewer; survey/further-assessment decisions also require a next action. Record agency checks with dates and findings, habitat limitations and the reviewing biologist. Only then record completed review. This is a recorded professional review, not agency approval or a protocol-compliant survey certification.
7. Export assessment CSV, occurrence attribution CSV, shared GeoJSON and printable HTML report. Open the HTML and use Print / Save as PDF. Its map is a portable vector overview without imagery. Include the evidence CSV with the report for per-record licensing and attribution. Export the **private backup** to preserve full project state.

## Persistence and evidence changes

In local demo mode, projects live in browser local storage. Team workspace mode instead saves to the authenticated consultancy server; see `SAAS_OPERATIONS.md` for accounts, save conflicts and recovery. Clearing that storage removes projects. Maintain private backups in your organization's controlled project storage. Restoring a backup creates a separate project ID. Evidence changes reopen species decisions and habitat/source checks; prior rationale remains available for reconsideration. Project history records the most recent 100 actions, not a tamper-proof audit trail.

Field imports must lie within regional coverage. A field entry can be removed and reimported to correct it. Submitted evidence is not automatically verified. Survey effort describes what the observer supplied and does not establish complete detection coverage.

## Species photo catalogue

The current screening catalogue has 124 taxa with reusable occurrence records, grouped from their source taxonomy. `public/screening/mojave-001/media.json` contains reference photos for 120 of them, with local thumbnails, the original iNaturalist photo link, creator credit and license for each. Four taxa use a visual placeholder. Photos are taxon illustrations from other observations; none is presented as a photograph taken at this project site. The licensed photos are CC0 or CC BY only. The interface links each displayed photo to its source and license and notes that the image was resized to WebP. They are not silently inserted into exported reports.

Rebuild the catalogue with `make species-media`. The builder checks exact scientific names and image license metadata, accepts only images from the iNaturalist open-data host, and saves a private lookup cache in `data_generated` so reruns avoid unnecessary API queries. It stays below iNaturalist's requested API rate. Review taxonomic identification and attribution before publication in a client product; a reference photo does not independently establish field identification.

## Data and commercial-use boundary

Rebuild the screening pack with `.venv/bin/python scripts/build_screening_pack.py` from the repository root, using existing raw rasters and generated lookup tables. The resulting `public/screening/mojave-001/pack.json` records source lineage and the source manifest hash. Its 670 occurrence records use CC0 or CC BY; 240 records with other licenses are excluded. Provider attribution is retained in the evidence export. Source imagery acquisition dates are not established for every tile. The separate legacy exploration view has a broader source mix and should not be treated as the commercial screening export dataset.

The prototype requires a biologist to obtain and assess current agency/regional records, land access, survey requirements, habitat conditions, species identification and project applicability. Absence of a public record is not absence of a species. Generalized coordinates and missing uncertainty cannot establish occupancy. There is no fitted habitat suitability model or automated regulatory determination.

## Verification

`npm --prefix web test` checks geometry, raster accounting, uncertain records, candidate retention, licensing and shared-export privacy, alongside the existing terrain tests. `npm --prefix web run test:browser` exercises the interface and existing 3D exploration. `npm --prefix web run build` checks TypeScript and production output. Browser verification uses test observations clearly labeled as synthetic; the regional occurrence and habitat data are real. This does not replace field validation on the first client project.
