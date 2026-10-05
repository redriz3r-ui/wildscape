# World 001 AOI verification

Selected from official LF2016_BPS_CONUS raster using its published bounds and official LF16_BPS.csv raster attribute table. BPS_CODE 10820 maps to VALUEs [395, 400, 501, 533, 605, 938, 1027, 1063, 1093, 1197].

Selected bounding box: [-114.67988923651437, 37.14668101361359, -114.50677725062955, 37.28503316828937]. Candidate projected window: 15 km, EPSG:32611. Sampled BpS coverage: 0.880126953125. Source rasters and request provenance are preserved in data_raw/mojave-001; discovery raster and candidate ranking are in data_generated.

USGS 3DEP and NAIP exported with a 0.025 degree context margin. Both have complete valid coverage. DEM context elevations range 791–1886 meters. Existing vegetation uses LF2025 EVT/EVC/EVH. Cover and height are decoded from official LF2025 attribute tables; nonvegetated classes are mapped to zero. Capped classes use their published boundary value.

Verification establishes source coverage and BpS dominance, not a field survey. Vegetation models remain ecological visualization, not mapped individuals.

Final terrain-grid check: 87.19% BpS 10820 coverage; bounds approximately 15.69 × 15.68 km; terrain elevation range 942–1717 m. Candidate discovery used a 15 km projected window; the geographic bounding rectangle adds a small context margin.
