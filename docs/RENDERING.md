# Local renderer decisions

The default iTowns implementation was tested with the actual generated DEM and texture assets in Chrome. No renderer fallback was required.

- PlanarView uses the world's projected UTM CRS.
- FileSource returns static Three.js DataTextures for DEM values and WebP textures for surface imagery.
- ElevationLayer produces native iTowns terrain; a hidden CPU copy of the same DEM geometry supports repeatable terrain picking.
- A root transform maps meter-based app coordinates into iTowns easting/northing/elevation coordinates.
- iTowns disables scene-wide automatic world-matrix updates; overlay matrices are updated explicitly.
- Wildlife shaders include logarithmic-depth chunks to match the terrain depth buffer.
- iTowns' unused DOM label overlay has pointer-events disabled so orbit and terrain clicks reach the canvas.
- Globe and local renderers share a pinned Three.js release. They are disposed between modes.
- The standalone ThreeTerrainRenderer implements the same contract and shared behaviors, but is not selected automatically to hide errors.

The fixture validates coordinate and texture alignment, filtering, ray picking, camera movement and static asset loading. It does not substitute for field validation of an authoritative AOI.
