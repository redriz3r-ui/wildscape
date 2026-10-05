# WILDSCAPE — MASTER BUILD SPECIFICATION

You are building a complete working application named **Wildscape**.

Do not merely scaffold, write architecture notes, create placeholder modules, or stop after setting up the repository. Continue implementing, running, debugging, and testing until the acceptance criteria in this specification pass.

Optimize for:

1. correctness,
2. architectural consistency,
3. reproducibility,
4. spatial/data integrity,
5. a polished working demo,
6. lightweight browser runtime,
7. maintainability.

Do not optimize for fastest possible implementation.

Do not replace working implementation with TODO comments.

If a remote data service is unavailable, implement the adapter correctly, fail gracefully, and use deterministic fixture data so the complete application remains runnable and testable.

---

# 1. PRODUCT

Wildscape turns real geographic terrain into an explorable 3D biodiversity world.

The basic equation is:

REAL TERRAIN  
+ REAL AERIAL IMAGERY  
+ REAL VEGETATION DATA  
+ REAL BIODIVERSITY OCCURRENCES  
+ SPECIES METADATA  
= INTERACTIVE 3D ECOSYSTEM

A user should be able to:

- view Earth from a minimal Globe.GL interface,
- select a Wildscape world,
- transition from the globe into a real local landscape,
- explore actual DEM-derived terrain,
- see real aerial imagery draped across that terrain,
- see data-informed 3D vegetation,
- explore species recorded within the landscape,
- filter species,
- select individual occurrences,
- fly the camera to observations,
- click the physical landscape and ask “What has been found here?”,
- switch between useful geographic/environmental visualization modes,
- understand where every wildlife record came from.

This is not an enterprise GIS dashboard.

It should feel like:

**Google Earth × field guide × Globe.GL × interactive ecological exhibit.**

GIS should power the experience without dominating the user interface.

---

# 2. WORLD 001

The first canonical world is:

**Mojave Mid-Elevation Mixed Desert Scrub**

LANDFIRE Biophysical Setting:

**BpS 10820 / Mojave Mid-Elevation Mixed Desert Scrub**

This environment is the design, data, vegetation and visual target for World 001.

Do not render a generic desert.

The visual environment should emphasize:

- real Mojave topography,
- rocky midslopes,
- broad alluvial fans,
- washes,
- open desert ground,
- low dark shrub cover,
- blackbrush as the dominant visual shrub,
- Nevada ephedra,
- buckwheat,
- scattered grasses,
- Mojave yucca,
- occasional Joshua trees where appropriate,
- prickly pear / cactus accents,
- rocks and exposed ground.

Do not turn the environment into a dense Joshua-tree forest.

3D vegetation is a visualization informed by ecological datasets; do not represent it as a literal reconstruction of individual plants.

---

# 3. VISUAL DIRECTION

Use **Globe.GL** as the major interaction and information-design reference.

Visual principles:

- dark, quiet global interface,
- restrained UI,
- minimal chrome,
- spatial information does most of the visual work,
- muted natural Mojave colors,
- subtle atmospheric haze,
- soft directional sunlight,
- luminous species/data markers,
- smooth camera motion,
- clear depth,
- no giant floating GIS panels,
- no generic Bootstrap-dashboard aesthetic,
- no excessive gradients,
- no sci-fi neon overload.

The world itself should remain readable.

At long range, biodiversity appears as aggregated spatial information.

At medium range, clusters separate.

At close range, individual wildlife occurrences become interactive.

Conceptually:

GLOBAL

Earth
→ biodiversity density
→ Wildscape locations

REGIONAL

Mojave landscape
→ species clusters
→ habitat context

LOCAL

individual occurrence
→ species
→ observation metadata
→ source

Scale should reveal information progressively.

---

# 4. ARCHITECTURE PRINCIPLE

Follow:

**BUILD HEAVY, RUN LIGHT.**

Remote APIs, raster processing, reprojection, deduplication, taxonomy normalization, privacy filtering and asset generation happen at build time.

The deployed browser application should NOT:

- query GBIF directly,
- query LANDFIRE directly,
- download GeoTIFFs,
- run raster processing,
- contact PostGIS,
- depend on a production API server.

Production should primarily consist of:

HTML  
+ JavaScript  
+ CSS  
+ compressed static geographic assets.

PostGIS and Python are world-building infrastructure, not runtime requirements.

---

# 5. TECH STACK

Use:

## Front end

- Vite
- TypeScript
- Three.js
- Globe.GL
- iTowns where appropriate
- Turf.js
- Proj4js
- h3-js

Use these when they materially solve a problem:

- Supercluster
- three-mesh-bvh

Do not add React unless an unavoidable technical reason is discovered and documented.

Do not add Next.js.

Do not add a frontend state-management framework.

Use simple TypeScript modules and a small explicit app-state controller.

## GIS / ETL

Python 3.

Use:

- Rasterio
- NumPy
- GeoPandas
- Shapely
- PyProj
- Pillow
- httpx
- psycopg

Use GDAL command-line utilities where they are simpler or more reliable than custom Python.

## Spatial database

- PostgreSQL
- PostGIS
- Docker Compose

Use transparent SQL migration files rather than introducing a heavy ORM.

## Testing

Python:

- pytest

TypeScript:

- Vitest

Browser:

- Playwright

## Deployment

Static production build.

No mandatory production backend.

---

# 6. REUSE EXISTING LIBRARIES

Do not rebuild functionality already robustly provided by open-source geospatial libraries.

Use Globe.GL for the global experience.

Prefer iTowns for the local geospatial scene because it already solves significant terrain/GIS concerns.

However, hide the local renderer behind an interface.

Implement:

LocalWorldRenderer

with a default implementation:

ITownsWorldRenderer

If the currently stable iTowns APIs make the required static DEM/imagery setup fundamentally unreliable after genuine implementation effort, an allowed fallback is:

ThreeTerrainRenderer

using the same generated terrain/world assets.

Do not abandon the rest of the application if one renderer is problematic.

Document the fallback clearly.

The public APIs of the rest of Wildscape must not depend directly on iTowns implementation details.

---

# 7. REPOSITORY STRUCTURE

Create approximately:

wildscape/
│
├── README.md
├── Makefile
├── docker-compose.yml
├── .env.example
├── .gitignore
│
├── worlds/
│   ├── mojave-001/
│   │   ├── world.yaml
│   │   └── ecosystem.yaml
│   └── example/
│       └── world.yaml
│
├── data_raw/
│   └── .gitkeep
│
├── data_generated/
│   └── .gitkeep
│
├── db/
│   ├── migrations/
│   └── seeds/
│
├── pipeline/
│   ├── pyproject.toml
│   ├── wildscape/
│   │   ├── cli.py
│   │   ├── config.py
│   │   ├── database.py
│   │   │
│   │   ├── region/
│   │   │   ├── footprint.py
│   │   │   └── aoi.py
│   │   │
│   │   ├── terrain/
│   │   │   ├── dem.py
│   │   │   ├── hillshade.py
│   │   │   ├── normals.py
│   │   │   ├── imagery.py
│   │   │   └── tiles.py
│   │   │
│   │   ├── vegetation/
│   │   │   ├── landfire.py
│   │   │   └── placement.py
│   │   │
│   │   ├── biodiversity/
│   │   │   ├── adapters/
│   │   │   │   ├── base.py
│   │   │   │   ├── gbif.py
│   │   │   │   ├── inaturalist.py
│   │   │   │   ├── natureserve.py
│   │   │   │   └── usfws.py
│   │   │   ├── normalize.py
│   │   │   ├── taxonomy.py
│   │   │   ├── dedupe.py
│   │   │   ├── privacy.py
│   │   │   └── media.py
│   │   │
│   │   └── build/
│   │       ├── manifest.py
│   │       ├── observations.py
│   │       ├── species.py
│   │       └── world.py
│   │
│   └── tests/
│
├── web/
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   ├── src/
│   │   ├── main.ts
│   │   ├── app/
│   │   │   ├── App.ts
│   │   │   ├── State.ts
│   │   │   └── Router.ts
│   │   │
│   │   ├── globe/
│   │   │   └── GlobeView.ts
│   │   │
│   │   ├── world/
│   │   │   ├── LocalWorldRenderer.ts
│   │   │   ├── ITownsWorldRenderer.ts
│   │   │   └── ThreeTerrainRenderer.ts
│   │   │
│   │   ├── terrain/
│   │   ├── wildlife/
│   │   ├── vegetation/
│   │   ├── interaction/
│   │   ├── data/
│   │   └── ui/
│   │
│   └── tests/
│
├── fixtures/
│   ├── biodiversity/
│   ├── terrain/
│   └── worlds/
│
└── public/
    └── worlds/

Exact filenames may evolve if necessary, but preserve these architectural boundaries.

---

# 8. WORLD CONFIGURATION

Worlds must be data/config driven.

Do not hard-code Mojave logic throughout the application.

Example:

worlds/mojave-001/world.yaml

should conceptually contain:

id: mojave-001
name: Mojave Mid-Elevation Mixed Desert Scrub

ecosystem:
  system: LANDFIRE_BPS
  code: 10820

aoi:
  method: auto_or_configured

terrain:
  dem_source: usgs_3dep
  imagery_source: usgs_naip
  vertical_exaggeration: 1.0

vegetation:
  source: landfire
  use_evt: true
  use_evc: true
  use_evh: true

biodiversity:
  primary_occurrence_source: gbif
  start_date: 1990-01-01

privacy:
  protect_sensitive_taxa: true
  public_grid_m: 5000

media:
  enabled: true
  allowed_licenses:
    - CC0
    - CC-BY
    - CC-BY-SA

A world config must be replaceable without changing application code.

---

# 9. AOI / WORLD 001 LOCATION

Do NOT invent geographic coordinates.

Implement the AOI selection architecture first.

Support:

1. configured bbox,
2. configured polygon,
3. future automatic discovery.

Implement a command conceptually equivalent to:

wildscape find-aoi --bps 10820 --size-km 15

The goal is to identify candidate approximately 10–20 km landscapes dominated by BpS 10820 with visually meaningful topographic relief.

If authoritative LANDFIRE spatial access is available during implementation, use it.

Prefer candidates with:

- substantial BpS 10820 coverage,
- meaningful terrain relief,
- hills/midslopes/alluvial-fan transitions,
- manageable data volume,
- available USGS terrain,
- available NAIP imagery.

Do not silently hard-code an unverified location.

If automatic AOI discovery cannot be completed because of remote-service limitations, keep AOI fully configurable and provide clear instructions for setting the final bbox.

The application must still run with fixture data.

---

# 10. DEM PIPELINE

The DEM is the source of physical terrain geometry.

Input may be a GeoTIFF.

Pipeline:

DEM
→ validate CRS
→ validate NoData
→ calculate spatial footprint
→ preserve original CRS metadata
→ determine useful local projected CRS
→ clip AOI
→ resample for web rendering
→ create terrain representation
→ calculate elevation range
→ derive slope
→ derive aspect
→ derive hillshade
→ derive normals
→ generate terrain metadata
→ generate progressive/local assets

Never stretch arbitrary geographic degrees directly into a Three.js Cartesian world.

Maintain explicit transforms between:

geographic coordinates  
projected coordinates  
scene coordinates.

Use meters in the local scene whenever possible.

Conceptually:

scene X = projected easting relative to world origin

scene Z = negative projected northing relative to world origin

scene Y = physical elevation relative to a documented vertical origin.

Create automated coordinate round-trip tests.

---

# 11. TERRAIN SURFACE

DEM geometry alone is insufficient.

Primary World 001 ground appearance:

**USGS NAIP imagery.**

Use official imagery access.

The pipeline should:

AOI
→ determine imagery coverage
→ retrieve only required imagery
→ clip
→ reproject
→ mosaic if required
→ color process
→ resize/tile
→ compress
→ create browser-ready texture assets.

Do not ship source-scale giant orthophotos directly to the browser.

Generate progressive resolution.

The default visual mode should be a stylized real-world surface rather than untouched raw aerial photography.

Preserve real spatial information while applying subtle visual treatment such as:

- restrained saturation,
- moderate contrast,
- slight warm desert grade,
- hillshade integration.

Do not heavily alter imagery so that geographic features become misleading.

---

# 12. TERRAIN VISUAL MODES

Implement at minimum:

WORLD  
AERIAL  
VEGETATION  
ELEVATION  
SPECIES

WORLD:

NAIP
+ DEM lighting
+ hillshade/normal treatment
+ atmospheric effects
+ 3D vegetation.

AERIAL:

primarily NAIP.

VEGETATION:

visualize LANDFIRE-derived vegetation information.

ELEVATION:

hypsometric or otherwise clearly readable terrain elevation.

SPECIES:

subdue terrain slightly and emphasize biodiversity records.

Transitions should not require reloading the entire world.

---

# 13. LANDFIRE PIPELINE

Use LANDFIRE data for ecological context.

At minimum support:

BpS  
EVT  
EVC  
EVH

Roles:

BpS:
ecosystem classification / target-world definition.

EVT:
existing vegetation type.

EVC:
vegetation cover.

EVH:
vegetation height.

Do not treat raster cells as perfect ground truth for individual plants.

Use them as data-informed controls for scene generation.

All source raster metadata and provenance must be retained.

---

# 14. PROCEDURAL VEGETATION

3D vegetation should make the terrain feel physical without turning the browser into a game-engine stress test.

Use instancing.

Do NOT create thousands of independent Mesh objects.

Use InstancedMesh or equivalent batching.

Create simple procedural / low-poly representations for:

- blackbrush,
- Nevada ephedra,
- Mojave yucca,
- occasional Joshua tree,
- grasses,
- cactus accents,
- rocks.

The models should be lightweight.

Avoid downloading large photorealistic third-party 3D assets.

Placement should incorporate, where available:

- BpS,
- EVT,
- EVC,
- EVH,
- elevation,
- slope,
- deterministic pseudo-random distribution.

Use seeded deterministic generation so the same world build produces the same vegetation unless the seed/config changes.

EVC should influence density.

EVH should influence approximate scale.

Vegetation should visually communicate ecological character without claiming individual plant accuracy.

Document this distinction.

LOD rules:

far:
little/no 3D vegetation.

medium:
major shrubs/trees.

near:
additional plant/rock detail.

---

# 15. BIODIVERSITY DATA STRATEGY

Primary occurrence backbone:

**GBIF.**

Do not blindly merge full GBIF + full iNaturalist + full eBird datasets.

GBIF may already contain records originating from those publishers.

Use direct-source adapters only when they provide clearly additional/enrichment information.

Source roles:

GBIF:
canonical occurrence backbone.

iNaturalist:
optional enrichment / newer metadata / appropriate media.

NatureServe:
taxonomy/conservation/sensitivity enrichment.

USFWS:
federal ESA/conservation metadata.

User field data:
supported as a first-class import source.

CNDDB:
architecturally support future import, but do not scrape or redistribute protected/restricted records.

No generic website scraping.

Prefer:

official downloadable dataset  
then official API  
then official GIS service  
then licensed open-data feed.

---

# 16. INGESTION MODEL

Every ingestion must have an ingest run.

Never immediately transform remote responses into irreversible canonical records.

Pipeline:

REMOTE SOURCE  
→ RAW RECORD  
→ NORMALIZED RECORD  
→ CANONICAL OCCURRENCE  
→ PUBLIC OCCURRENCE

Raw data should remain immutable.

Record:

- source,
- retrieval timestamp,
- request parameters,
- source dataset,
- source identifier,
- source license where available,
- raw payload.

Cleaning/deduplication must never require re-downloading the source just to recover discarded information.

---

# 17. DATABASE

Implement core tables approximately equivalent to:

regions

ingest_runs

raw_records

taxa

taxon_xrefs

occurrences

occurrence_sources

media

conservation_status

sensitive_taxa

region_occurrences

builds

Use PostGIS geometry columns where appropriate.

Indexes should support:

- spatial containment,
- radius queries,
- taxon filtering,
- source ID matching,
- event date filtering,
- region selection.

Store precise geometry separately from public geometry where privacy rules require it.

---

# 18. CANONICAL OCCURRENCE MODEL

Normalized occurrence should contain fields conceptually equivalent to:

occurrence_id

taxon_id

accepted_scientific_name

reported_scientific_name

event_date

basis_of_record

latitude

longitude

geometry

coordinate_uncertainty_m

source

source_dataset

source_record_id

external_occurrence_id

license

has_geospatial_issue

is_sensitive

is_duplicate

duplicate_of

quality / validation flags

Retain original reported values where normalization changes them.

---

# 19. TAXONOMY

Canonicalize taxa.

Do not allow synonyms/common-name differences to create multiple fake species.

Pipeline:

reported taxon
→ external taxonomic identifier where available
→ accepted taxon
→ canonical internal taxon.

Preserve:

- original reported name,
- accepted scientific name,
- taxonomic rank,
- canonical taxon ID,
- source taxon IDs,
- common names,
- parent taxonomy.

For headline biodiversity counts, default to accepted **species rank**.

Preserve infraspecies information separately.

---

# 20. DEDUPLICATION

Be conservative.

Never deduplicate solely because two points are spatially close.

Implement tiers.

## Certain duplicate

Same source + same source record ID.

## Cross-provider certain/high confidence

A GBIF record contains the original provider occurrence ID and a direct-source record has the same provider ID.

## Probable duplicate candidate

Consider:

same accepted taxon  
+ same event timestamp/date  
+ nearly identical location  
+ matching event/collector/media/provider identifiers.

Probable candidates should initially remain preserved and marked.

When uncertain:

**retain both records.**

Do not assume two same-species animals seen near one another are the same individual.

Create tests for deduplication.

---

# 21. DATA QUALITY

Do not invent opaque “quality scores.”

Store transparent quality flags.

Examples:

coordinate_valid

date_valid

accepted_taxon_match

has_geospatial_issue

coordinate_uncertainty_m

basis_of_record

occurrence_status

source_type

has_media

is_historical

is_obscured

Build logical views such as:

standard observations

historical evidence

all usable evidence.

Museum specimens and historical records may be valuable but should not appear identical to a recent human observation.

---

# 22. SENSITIVE SPECIES

This is a hard requirement.

Sensitive wildlife locations must be protected before public assets are produced.

Use source sensitivity/obscuration information and NatureServe sensitivity metadata where available.

Never attempt to reverse-engineer obscured coordinates.

Private database:

may contain authorized precise geometry.

Public build:

must contain only appropriate public geometry.

Default configurable protection:

5 km generalization/grid for sensitive taxa unless authoritative source policy dictates otherwise.

Strip precise coordinates from public JSON.

Ensure precision cannot trivially leak through another field.

Do not export raw source payloads to the public website.

Create an automated privacy test that fails if sensitive public records expose precise geometry.

---

# 23. MEDIA

Media is optional enrichment, never a prerequisite for the site.

Every media row must retain:

URL

thumbnail URL if available

creator

source

license

attribution

taxon ID

occurrence ID if applicable.

Default allowed public licenses:

CC0  
CC-BY  
CC-BY-SA

Make allowed licenses configurable.

Do not display ambiguous/unlicensed media by default.

Lazy-load species imagery.

Provide visible attribution.

---

# 24. PUBLIC WORLD BUILD

Generate approximately:

public/worlds/mojave-001/
│
├── manifest.json
│
├── terrain/
│   ├── metadata.json
│   ├── elevation/
│   ├── imagery/
│   ├── hillshade/
│   └── normals/
│
├── vegetation/
│   ├── metadata.json
│   └── placement/
│
├── species/
│   ├── index.json
│   └── media/
│
├── observations/
│   ├── index.json
│   ├── clusters/
│   └── detail/
│
├── ecosystem/
│   └── metadata.json
│
└── attribution.json

Do not send database tables directly to the client.

manifest.json should include:

world ID

world name

build timestamp

ecosystem ID

bounding region

species count

occurrence count

earliest usable observation

latest usable observation

data source list

relevant source dataset identifiers

licenses

terrain metadata

build version.

If a GBIF DOI exists, retain it.

---

# 25. MULTI-RESOLUTION WILDLIFE DATA

Do not ship tens of thousands of DOM elements or independent Three.js meshes.

Precompute or efficiently aggregate biodiversity spatial data.

Use H3 or an equivalent robust geographic strategy.

At global distance:

biodiversity density / world markers.

At far local distance:

large spatial aggregates.

At medium distance:

smaller aggregates.

At close distance:

individual occurrence markers.

Supercluster may be used if runtime point clustering provides a simpler/better implementation.

Species occurrence objects should use efficient rendering/batching.

---

# 26. GLOBAL GLOBE

Use Globe.GL.

Global scene should be deliberately minimal.

Include:

Earth

atmosphere

Wildscape world markers

optional biodiversity visualization

world selection.

World 001 should appear as an available environment.

Selecting Mojave World 001 should:

1. identify the selected region,
2. begin loading local manifest/assets,
3. animate/fly toward it,
4. transition into local world mode.

Do not run Globe.GL and the full local terrain renderer simultaneously if doing so wastes resources.

Dispose/pause unused rendering systems appropriately.

---

# 27. LOCAL WORLD

Local world should feel physical.

Render:

real DEM topography,

real NAIP ground surface,

atmospheric lighting,

haze/fog where useful,

data-informed vegetation,

wildlife records,

subtle UI.

Camera should support:

orbit,

zoom,

pan,

smooth fly-to,

reset/home,

fit-to-species occurrences.

Do not default to first-person controls.

This is initially a cinematic exploratory terrain viewer.

---

# 28. SPECIES EXPLORER

Implement a field-guide-style species explorer.

Categories should derive from taxonomy, not hard-coded example lists.

Support categories such as:

Mammals  
Birds  
Reptiles  
Amphibians  
Plants  
Insects / Arthropods  
Other

Species cards should support:

common name

scientific name

taxonomic group

number of records in world

first record

latest record

observed elevation range if computable

conservation metadata if available

source summary

licensed image if available.

Selecting a species should:

dim/deemphasize unrelated occurrences,

highlight selected-species records,

update the species panel,

offer “fit to observations”,

allow selecting individual records.

Do not invent biological facts not present in the data.

---

# 29. “WHAT HAS BEEN FOUND HERE?”

This interaction is central.

User clicks terrain.

System determines geographic coordinate.

Then finds observations around the point.

Default radius:

approximately 2 km, configurable.

Display:

number of species

number of observations

species names

counts

useful temporal range.

Example interaction:

WHAT'S BEEN FOUND HERE?

Within 2 km

27 species  
119 records

Desert Tortoise — 14  
Chuckwalla — 8  
Sidewinder — 11  
Horned Lark — 37  
Black-tailed Jackrabbit — 19

Sensitive records must use public-safe geometry.

This query should operate against the static public dataset efficiently.

---

# 30. OCCURRENCE INTERACTION

Selecting an individual public occurrence should display only publishable information.

Possible fields:

species

observation date

observation type

coordinate uncertainty

dataset/source

license

media

source link where appropriate.

Include:

FLY TO RECORD

Camera should smoothly move to an appropriate viewpoint near the observation.

Do not move inside terrain.

---

# 31. APP STATE

Implement explicit application states such as:

GLOBE

WORLD_LOADING

WORLD

SPECIES_SELECTED

OCCURRENCE_SELECTED

LOCATION_QUERY

Avoid complicated implicit state spread across UI modules.

Keep state small and inspectable.

---

# 32. PERFORMANCE

This app must remain viable on an ordinary modern laptop.

Do not require CUDA or server-side GPU compute.

Use:

- code splitting,
- dynamic imports,
- progressive asset loading,
- texture compression,
- instancing,
- batching,
- spatial aggregation,
- lazy-loaded media,
- scene disposal,
- LOD.

Do not load the local terrain engine before it is needed.

Do not load full-resolution imagery immediately.

Do not load every occurrence detail on first render.

Treat these as performance targets rather than reasons to compromise correctness:

- lightweight initial application shell,
- dynamically loaded globe/local renderer chunks,
- small manifest/species summary payloads,
- progressively loaded terrain,
- progressively loaded imagery,
- progressively revealed observation detail.

Generate warnings during build for unexpectedly huge assets.

Add a build-size report.

---

# 33. ERROR HANDLING

The pipeline must provide understandable failures.

Examples:

DEM has no CRS

DEM has invalid bounds

remote source unavailable

remote source returns no records

database unavailable

GDAL unavailable

invalid world YAML

imagery missing

LANDFIRE layer unavailable

GBIF rate limited

media license unsupported.

Do not continue silently with corrupted data.

Optional enrichments may fail without killing an otherwise valid world build.

Differentiate:

required failure

optional-data warning.

---

# 34. OFFLINE / FIXTURE MODE

Create deterministic small fixtures.

Fixture world should include:

small DEM

small imagery texture

small wildlife occurrence dataset

several taxa

one intentionally duplicated record

one sensitive record

one historical record

one licensed media item.

This allows:

make demo

or equivalent

to run without remote services.

The fixture dataset should exercise the real normalization/privacy/build paths rather than bypassing them.

---

# 35. CLI

Create a coherent Wildscape CLI.

Commands should conceptually include:

wildscape validate-world WORLD

wildscape find-aoi ...

wildscape prepare-terrain WORLD

wildscape ingest WORLD

wildscape normalize WORLD

wildscape dedupe WORLD

wildscape protect WORLD

wildscape build-world WORLD

wildscape all WORLD

Expose them through Makefile conveniences.

Required Make targets:

make bootstrap

make db-up

make db-down

make test

make lint

make demo

make ingest REGION=mojave-001

make build-world REGION=mojave-001

make dev REGION=mojave-001

make build

make all REGION=mojave-001

`make bootstrap` should install project-local dependencies and validate required external tools.

Do not silently install arbitrary system packages without informing the user.

---

# 36. WEB UX

Primary screen should not look like a traditional website with a large header/navbar.

The visual experience is the content.

Keep persistent UI restrained.

Potential layout:

top-left:
Wildscape / world identity

left or compact drawer:
species explorer

bottom or corner:
map-style selector

right compact panel:
selected species / observation / location result

central:
3D scene.

UI should collapse intelligently on narrower screens.

Desktop is the primary target, but avoid completely unusable mobile layouts.

---

# 37. ACCESSIBILITY

Do not make all information accessible only by interacting with 3D points.

Provide keyboard-accessible species lists and controls.

Use semantic HTML buttons.

Provide accessible labels.

Maintain sufficient text contrast.

Support reduced-motion preference by reducing long camera/transition animations.

---

# 38. ATTRIBUTION

Create a visible “Data & Sources” interface.

List relevant sources used by a given build.

Include appropriate attribution/licensing information.

Do not strip provenance.

Each public world should be reproducible enough that another developer can determine:

which source datasets were used,

when they were fetched,

how they were transformed,

which build created the output.

---

# 39. TESTS

Implement actual tests.

## GIS tests

DEM metadata parsing.

DEM footprint correctness.

CRS transformation.

GIS → scene coordinates.

scene → GIS coordinates.

coordinate round-trip within documented tolerance.

terrain elevation sampling.

## Biodiversity tests

raw ingestion preservation.

normalization.

taxon canonicalization.

certain duplicate detection.

cross-provider duplicate matching.

non-duplicate nearby observations remain separate.

## Privacy tests

sensitive records never expose precise public geometry.

obscured records remain obscured.

raw payloads never appear in public assets.

## Media tests

disallowed licenses excluded.

required attribution preserved.

## Build tests

manifest schema valid.

species count consistent.

occurrence counts consistent.

all public records fall within expected world context or are explicitly documented.

generated asset references exist.

## Browser tests

app loads.

globe renders without fatal error.

World 001 can be entered.

local terrain renders.

map-style selector functions.

species list appears.

species selection filters/highlights records.

occurrence selection works.

fly-to completes.

terrain click produces location-query result.

no uncaught console errors during smoke path.

production build succeeds.

---

# 40. CODE QUALITY

Use strict TypeScript.

Use Python type hints where practical.

Keep modules focused.

Do not create 5,000-line classes.

Avoid premature abstraction, but preserve clear contracts around:

data sources

world configuration

renderers

coordinate transforms

privacy

public-build generation.

Write comments for WHY, not obvious syntax.

---

# 41. DOCUMENTATION

README must contain:

what Wildscape is

architecture diagram

requirements

quick start

fixture/demo instructions

real-world build instructions

database startup

environment variables

data-source descriptions

privacy/sensitive-species behavior

world configuration

development commands

testing

production build

known limitations.

Include an explicit statement that procedural vegetation represents a data-informed visualization and not exact mapped plant locations.

Include an explicit statement that occurrence data represents recorded evidence and not a complete inventory of all organisms living within the area.

---

# 42. NON-GOALS FOR V1

Do NOT implement:

user accounts

social features

multiplayer

LLMs

AI agents inside the app

animal behavioral simulation

photorealistic animals

global high-resolution terrain streaming

habitat suitability machine learning

species-distribution modeling

live production PostGIS API

mobile native app

CNDDB scraping

automatic proprietary-data redistribution

complex CMS

admin portal.

Do not add these because they seem impressive.

Finish the core product.

---

# 43. V1 DEFINITION OF DONE

Wildscape V1 is complete when:

1. repository can be bootstrapped from documented commands,

2. PostGIS development environment starts successfully,

3. fixture ingestion works end-to-end,

4. real source adapters are implemented cleanly,

5. DEM pipeline produces local terrain assets,

6. surface imagery pipeline exists,

7. LANDFIRE pipeline exists,

8. GBIF occurrence pipeline exists,

9. normalized canonical occurrence data is produced,

10. duplicate handling works,

11. sensitive-species public geometry protection works,

12. static world assets build successfully,

13. Globe.GL global experience renders,

14. user can enter Mojave World 001,

15. local DEM-derived 3D terrain renders,

16. terrain surface renders correctly,

17. procedural vegetation renders efficiently,

18. wildlife spatial data renders,

19. species explorer works,

20. “What has been found here?” works,

21. occurrence selection and fly-to work,

22. map-style switching works,

23. data attribution is visible,

24. automated tests pass,

25. production build succeeds,

26. README explains the full process,

27. the codebase contains no critical TODO placeholders standing in for required features.

---

# 44. IMPLEMENTATION ORDER

Use this order unless a dependency requires adjustment.

PHASE 1

Repository  
configuration  
Docker/PostGIS  
fixture data  
tests infrastructure.

PHASE 2

DEM processing  
coordinate system  
terrain asset generation  
basic local terrain render.

PHASE 3

NAIP imagery  
terrain styling  
hillshade / normals  
visual modes.

PHASE 4

GBIF adapter  
raw ingestion  
normalization  
taxonomy  
database.

PHASE 5

deduplication  
privacy  
NatureServe/USFWS enrichment  
public world build.

PHASE 6

Globe.GL global experience  
world transition  
local renderer integration.

PHASE 7

wildlife rendering  
aggregation  
species explorer  
occurrence interaction  
location query.

PHASE 8

LANDFIRE  
procedural vegetation  
LOD / instancing.

PHASE 9

performance optimization  
browser testing  
accessibility  
attribution  
documentation.

PHASE 10

run complete acceptance suite  
fix failures  
run production build.

Do not spend the entire execution polishing Phase 1 while leaving later phases as placeholders.

---

# 45. EXECUTION BEHAVIOR

You are authorized to inspect files, create files, install project dependencies, run commands, execute tests, refactor code, and debug the project.

Work autonomously.

When something fails:

inspect the error,

identify the real cause,

fix it,

rerun the smallest relevant test,

then rerun the broader suite.

Do not repeatedly retry the same failing command without changing anything.

Prefer established libraries over custom reimplementations.

Prefer official source APIs/services over scraping.

Do not fabricate successful API responses.

Do not fabricate real geographic coordinates.

Do not fabricate biological records.

Fixture records must be clearly identified as fixtures.

Do not stop simply because one optional third-party service requires credentials.

Implement graceful optional behavior and continue.

---

# 46. FINAL VALIDATION

Before considering the task complete, run:

lint

Python unit tests

TypeScript unit tests

integration tests

browser smoke tests

production build.

Then inspect the final application manually enough to verify:

terrain visible

imagery aligned

camera usable

species controls usable

wildlife visible

species selection works

location query works

no obvious visual catastrophe

no major console errors.

Report:

what was built,

which commands succeeded,

which remote data sources were verified live,

which features are operating on fixtures because of unavailable credentials/services,

known limitations,

how to launch the application,

how to build Mojave World 001 from real data.

Do not declare success if the core terrain/species experience does not function.

---

# 47. GUIDING PRODUCT PRINCIPLE

Wildscape should make someone feel:

> “I’m looking at a real landscape, and I can discover the life that has been recorded inside it.”

The data is the product.

The 3D world is how the data becomes understandable, memorable and fun.

Build that.