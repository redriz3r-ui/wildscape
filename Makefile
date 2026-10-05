REGION ?= mojave-001
PY = .venv/bin/python
CLI = .venv/bin/wildscape
.PHONY: bootstrap db-up db-down test lint demo ingest build-world dev build all integration
bootstrap:
	python3 -m venv .venv
	.venv/bin/pip install -e './pipeline[dev]'
	cd web && npm ci
	@if [ -d "/Applications/Google Chrome.app" ]; then echo "Browser tests will use installed Chrome."; else cd web && npx playwright install chromium; fi
	@command -v docker >/dev/null || echo "Docker is required only for PostGIS; install Docker Desktop separately."
	@command -v gdalinfo >/dev/null || echo "GDAL CLI absent; Rasterio's bundled GDAL performs raster processing."
db-up:
	docker compose up -d --wait
	$(CLI) db-migrate
db-down:
	docker compose down
lint:
	.venv/bin/ruff check pipeline scripts/build_screening_pack.py scripts/build_species_media.py
	cd web && npm run lint
test:
	$(PY) -m pytest pipeline/tests -q
	cd web && npm test
integration:
	WILDSCAPE_DB_TEST=1 $(PY) -m pytest pipeline/tests/test_database.py -q
	cd web && npm run test:browser
demo:
	$(CLI) all mojave-fixture
	cd web && npm run dev
all:
	$(CLI) all $(REGION)
ingest:
	$(CLI) ingest $(REGION)
build-world:
	$(CLI) normalize $(REGION)
	$(CLI) enrich $(REGION)
	$(CLI) dedupe $(REGION)
	$(CLI) protect $(REGION)
	$(CLI) build-world $(REGION)
dev:
	cd web && npm run dev
build:
	cd web && npm run build

.PHONY: screening-pack
screening-pack:
	$(PY) scripts/build_screening_pack.py

.PHONY: species-media
species-media:
	$(PY) scripts/build_species_media.py

.PHONY: api workspace-test local
api:
	$(PY) server/manage.py migrate --noinput
	$(PY) server/manage.py runserver 127.0.0.1:8000
workspace-test:
	$(PY) server/manage.py test workspaces
	cd web && npm run test:browser -- --config playwright.workspace.config.ts

local:
	sh scripts/run_local.sh
