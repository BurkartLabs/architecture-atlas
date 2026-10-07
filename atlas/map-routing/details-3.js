// Details for the map rendering & routing plate, part 3: traffic, styling, tiles, offline.
ATLAS.details("map-routing", {
  "probe-data-intake": {
    s: "Receives streams of anonymous position reports from phones, vehicles and fleets, validates them and hands them to the pipeline at a rate that never backs up.",
    d: "Reports carry a coordinate, timestamp, speed, heading and a rotating identifier, sent in batches over HTTP or from a fleet gateway. The intake authenticates the source, drops malformed or implausible records, assigns a receive time, and writes to a durable queue partitioned by region. Volume is large and bursty, with peaks at commute hours. It is hard because devices have clock errors, send late batches after being offline, and sometimes send data from the wrong place, so the pipeline needs validation before anything trusts it.",
    k: ["Accepting late batches vs dropping data older than a window: accepting improves history and coverage, but live pipelines must not let old data look current.", "Per-device batching vs immediate sending: batching saves battery and requests, but adds latency that matters for live congestion."],
    p: ["Trusting device timestamps lets a device with a wrong clock inject speeds into the wrong hour.", "No backpressure means a burst after a network outage overwhelms the queue and delays live data."],
    v: "Replay a recorded hour of reports at ten times normal rate and confirm the queue drains without loss, malformed records are counted and dropped, and end-to-end latency stays within the live-data target.",
    dep: ["probe-privacy-processing", "regional-sharding"]
  },
  "probe-privacy-processing": {
    s: "Removes or limits information that could identify people from location reports before use: trimming trip ends, rotating identifiers, and aggregating only above a minimum count.",
    d: "Position traces are sensitive since they reveal homes and habits. The pipeline strips stable identifiers, rotates pseudonyms frequently, cuts the first and last stretch of every trip, discards sparse areas, and publishes only aggregates when enough distinct devices contributed. Retention is short and access is controlled and audited. It is hard because simply removing names is not enough: a unique trajectory identifies its owner, and strong privacy conflicts with data quality on quiet roads.",
    k: ["Minimum device count per segment before publishing vs publishing everything: the threshold protects individuals, but leaves quiet roads without live data.", "Trimming trip ends vs keeping full traces: trimming hides homes and workplaces, at the cost of losing data near origins such as parking exits."],
    p: ["Rotating the pseudonym less often than trips are long keeps the full path linkable.", "Raw traces retained for debugging become a breach target and a legal liability."],
    v: "Attempt to re-identify trips from the processed output using published trace data and confirm no trace's start or end is recoverable, and that no aggregate is published below the minimum device count.",
    dep: ["probe-data-intake"]
  },
  "probe-map-matching": {
    s: "Matches each anonymous trace to roads in bulk, producing per-segment travel times and speeds with an assessment of how trustworthy each match is.",
    d: "A streaming job takes cleaned traces, runs map matching with parameters tuned for sparse, noisy data, and emits for each road segment traversed an entry time, exit time and speed. Segment times are interpolated between sparse fixes. Matches with low confidence are dropped. It runs continuously at very high volume. It is hard because fixes can be thirty seconds or more apart, and a single mismatch to a parallel road pollutes the speed there.",
    k: ["Aggressive confidence filtering vs keeping marginal matches: filtering reduces noise, but cuts coverage on exactly the complex junctions where data is most needed.", "Matching against the live graph version vs a slightly older one: the live version is correct, but matching needs to tolerate a rollout in progress."],
    p: ["Interpolating speed linearly across a gap that included a red light attributes the delay to the wrong segment.", "Matching against an outdated graph assigns speeds to roads that no longer exist."],
    v: "Feed traces from a vehicle with known ground-truth segment times and confirm per-segment time error is within tolerance and low-confidence matches are discarded, not guessed.",
    dep: ["map-matching", "probe-privacy-processing", "spatial-snap-index"]
  },
  "live-speed-aggregation": {
    s: "Combines recent matched observations per road segment into a current speed estimate with a confidence, updated every minute or so and expired when data goes stale.",
    d: "For each segment, observations in a sliding window are combined with a robust statistic such as a trimmed or weighted mean, weighting by recency and by source quality. If too few observations exist, the estimate is blended with the historical profile or the free-flow speed. Results are published as a delta against the last version. It is hard because the signal is noisy, coverage is uneven, and a result must reflect a real jam within minutes without reacting to one slow vehicle.",
    k: ["A short window vs a long window: short reacts to a new jam quickly, and long is smoother and more stable but lags real conditions by minutes.", "Blending toward history when data is sparse vs reporting unknown: blending gives a complete map, but may show a jam that ended or miss a new one."],
    p: ["A single slow vehicle such as a delivery truck stopping makes the segment look jammed.", "Stale estimates not expired after the data stops keep showing a jam for hours after it cleared."],
    v: "Inject synthetic slow traffic on one segment and confirm the live speed drops within the target latency, then stop injecting and confirm it returns to normal within the expiry time.",
    dep: ["probe-map-matching", "historical-speed-profiles"]
  },
  "historical-speed-profiles": {
    s: "Typical speed per road segment by hour and day type, learned from months of observations, used for planning ahead and as a fallback when live data is missing.",
    d: "Observed segment speeds are bucketed into time slots, such as five or fifteen minutes by weekday type, and summarized as a median and spread. Segments with sparse data are smoothed using neighbors of the same class and region. Holidays, events and seasons are handled by special calendars. Profiles feed travel-time estimates for future departures and the time-dependent search. It is hard because the data is large, because rare events distort averages, and because roads change, which makes old data wrong.",
    k: ["Fine time slots vs coarse: fine captures the rush-hour ramp, but needs more data per segment than most roads have.", "Pooling neighboring segments for sparse roads vs leaving them empty: pooling gives estimates everywhere, but can attribute a highway's pattern to a quiet side street."],
    p: ["Averages that include an incident day shift the profile for every future Tuesday.", "Profiles not reset after a road is rebuilt describe traffic that no longer exists."],
    v: "Predict speeds for a held-out week from earlier months and confirm the error by hour and road class is within target, including a holiday handled by the calendar.",
    dep: ["probe-map-matching", "feature-store"]
  },
  "incident-and-closure-feed": {
    s: "Brings in accidents, roadworks, closures and events from authorities, partners and users, normalizes them, and applies them to the routing graph and displays.",
    d: "Sources send structured feeds or free text with location references that may use a different map. The service converts locations to graph edges with a location referencing method, assigns a type, severity, start and end, and deduplicates reports of the same event. Closures set edge costs to infinity, while slowdowns apply a speed factor. Events expire or are confirmed. It is hard because location matching is imprecise, because planned works end early or late, and because a wrong closure blocks a good road.",
    k: ["Trusting authority feeds fully vs requiring corroboration from probes: trusting is fast, but a wrong closure blocks the road, while corroboration delays real closures.", "Hard closure vs a heavy penalty: closure is simple and correct for physical blockage, but a penalty lets routes pass when the end of the closure is near."],
    p: ["A closure with an end time that is never removed keeps a reopened road blocked indefinitely.", "Location matching puts a closure on the parallel service road and leaves the real road open."],
    v: "Publish a test closure on a known road and confirm routes avoid it within the target delay and the reroute shows in traffic display, then remove it and confirm routes return.",
    dep: ["source-feeds", "spatial-snap-index", "live-weight-reload"]
  },
  "traffic-forecasting": {
    s: "Predicts speeds for the next minutes to hours by combining current conditions, historical patterns and known events, so routes account for traffic that will exist on arrival.",
    d: "Short horizons extrapolate the live state using models of how congestion propagates along the network; longer ones blend toward the historical profile, with adjustments for weather, events and holidays. A route's later segments are evaluated at the time the traveler will reach them, which links forecasting to time-dependent search. It is hard because congestion is nonlinear, because rare events dominate user perception, and because accuracy must be evaluated by horizon.",
    k: ["A learned model of network propagation vs blending the live value with history: learned captures how a jam grows, but needs training data, retraining and monitoring for drift.", "Forecasting every segment vs only major corridors: every segment is complete, but compute cost is high and quiet roads gain little."],
    p: ["A model trained before a major road opens predicts traffic patterns that no longer exist.", "Evaluating only the overall average hides large errors in the evening peak."],
    v: "Compare forecasts made at several horizons with the speeds later observed, grouped by road class and hour, and confirm forecast error is smaller than simply assuming current speeds persist.",
    dep: ["live-speed-aggregation", "historical-speed-profiles", "incident-and-closure-feed"]
  },
  "live-weight-reload": {
    s: "Applies fresh speeds and closures to the serving graph without a restart, by recomputing the affected cost data and swapping it in atomically.",
    d: "A new weight file or delta is produced every minute or so. The serving process loads it into a new buffer, runs the quick customization step for the overlay or updates edge costs directly, then flips a pointer so new queries use it while running queries finish on the old one. Old buffers are freed when no query holds them. Preprocessing approaches that bake costs into shortcuts cannot do this cheaply. It is hard because memory doubles during a swap, and because every server must switch around the same time.",
    k: ["Atomic swap of a full buffer vs in-place updates: swap is simple and gives consistent queries, but requires spare memory.", "Synchronized switch time across servers vs each switching on arrival: synchronized gives the same answer from any server, but needs coordination, while independent is simpler and briefly inconsistent."],
    p: ["A server that fails to load the new weights keeps serving old traffic with no alarm.", "Swapping during a heavy query load stalls on memory allocation and spikes latency."],
    v: "Publish new weights while load testing and confirm no query fails or sees mixed weights, latency stays within budget, and every server reports the same weight version within the target window.",
    dep: ["multilevel-partitioning", "mmap-graph-serving", "live-speed-aggregation", "data-versioning-and-rollout"]
  },
  "style-specification": {
    s: "A declarative document that maps tile data to visuals: which layers draw, in what order, with which colors, widths, fonts and zoom ranges, with no code.",
    d: "The style lists data sources and a stack of layers, each selecting features from a source layer by a filter and giving paint and layout properties. Properties can depend on zoom and on feature attributes through expressions. Because it is data, the same style works in every client, can be edited visually, and can be changed without redeploying tiles. It is hard because a style for a global map has hundreds of layers, and small changes affect performance and legibility at every zoom.",
    k: ["A declarative style shared by all clients vs per-platform styling code: shared gives identical maps everywhere, but limits what any one renderer can do beyond the common subset.", "Many specific layers vs fewer data-driven layers: many are easy to read and cheap to evaluate individually, but fewer reduce draw calls and style size."],
    p: ["A style depending on a source layer a newer tileset renamed renders empty maps silently.", "A style using features not supported by an old client breaks only on that client."],
    v: "Load the style in each supported client against a test tileset and compare screenshots at a dozen locations and zooms, confirming every layer renders and no layer is empty.",
    dep: ["expression-evaluator", "vector-tile-encoding", "glyph-service", "sprite-atlas"]
  },
  "expression-evaluator": {
    s: "Evaluates style expressions that compute a paint or layout value from the zoom level and each feature's attributes, so one layer can style many kinds of features.",
    d: "Expressions are small typed trees: arithmetic, comparisons, lookups, conditionals, interpolation over zoom and match-by-category. They are parsed and checked once, then evaluated per feature at tile load or per frame, or compiled to shader inputs. The same semantics must hold in every client implementation. It is hard because it sits in the hot path for millions of features, because consistent results across languages and platforms require a precise spec, and because errors should not blank the map.",
    k: ["Evaluating once per feature at load time vs on the GPU each frame: load time is flexible, while the GPU path makes zoom changes smooth with restrictions on expression types.", "Strict typing at parse time vs permissive runtime coercion: strict finds mistakes in a style early, but permissive tolerates sloppy attribute data."],
    p: ["Two client implementations that round interpolation differently show features with slightly different widths across platforms.", "A missing attribute that causes an error instead of a default makes a whole layer disappear."],
    v: "Run a shared conformance suite of expressions with expected outputs through every client implementation and confirm identical results, including cases with missing attributes and zoom interpolation.",
    dep: ["vector-tile-encoding"]
  },
  "glyph-service": {
    s: "Supplies the shapes of characters for map labels, as signed-distance or outline data in ranges, covering many scripts, weights and languages efficiently.",
    d: "Label text needs glyphs for each character. Instead of shipping whole fonts, the service serves ranges of glyphs, such as 256 code points each, rendered into distance fields that can be scaled and outlined on the GPU. Fonts are stacked as fallbacks so any script finds a glyph. Right-to-left and complex scripts need shaping before glyphs are placed. It is hard because the character set is huge, because some scripts require contextual shaping, and because missing glyphs produce visible gaps.",
    k: ["Distance-field glyphs vs prerendered bitmaps per size: distance fields scale and recolor from one asset, at the price of soft corners and limited detail for small text.", "Range-based loading vs full font packages: ranges send only what the visible labels need, at the cost of many small requests."],
    p: ["A script with no fallback font renders as empty boxes or blank labels.", "Text for languages needing shaping is drawn as isolated characters, which is unreadable."],
    v: "Render labels in Latin, Arabic, Devanagari and Han scripts at several sizes and confirm every glyph appears, text direction and joining are right, and no request for a missing range fails.",
    dep: ["style-specification", "tile-cdn-caching"]
  },
  "sprite-atlas": {
    s: "A packed image of every icon, shield and pattern used by the style, with a lookup of positions, so symbols draw in a single texture fetch.",
    d: "Symbols such as highway shields, POI icons and fill patterns are packed into one or two sheets at several pixel densities, with a JSON index giving each symbol's rectangle and anchor. The renderer loads the sheet once and draws by rectangle. Icons may be stretchable with defined content areas, such as shield backgrounds that fit text. It is hard because the set is large and region-specific, because high-density screens need extra assets, and because changes to one icon invalidate the whole sheet.",
    k: ["One big atlas vs several by region or theme: one is simple and loads once, but several keep downloads small and updates independent.", "Raster icons per density vs scalable vector icons: raster draws fastest, while vectors stay sharp at any density but need rasterizing at load."],
    p: ["Missing the high-density variant makes icons blurry on modern phones.", "An icon name in the style that is absent from the sheet draws nothing and gives no error."],
    v: "Load the style at one, two and three times pixel density and confirm every icon named in the style resolves, none is blurry, and a missing name is reported in a log.",
    dep: ["style-specification"]
  },
  "label-placement": {
    s: "Chooses which labels and icons to draw and where, so text does not overlap, follows roads, and the most important features win limited space at each zoom.",
    d: "Each candidate label has a priority, anchor positions and a size. A placement pass in screen space, run when the camera settles or each frame, tests candidates against a collision index of already placed labels and drops those that conflict. Line labels follow road curves with a minimum spacing. Fade-in avoids flicker. It is hard because it is a global layout problem with a tight time budget, because labels must not jump around as the user pans, and because languages have very different text lengths.",
    k: ["Placing labels in screen space at runtime vs baking positions into tiles: runtime adapts to rotation and tilt, but baked positions are consistent and cheap, with problems at tile edges.", "Priority-based greedy placement vs global optimization: greedy is fast and predictable, but may drop a good label to keep a worse one."],
    p: ["Labels cut at tile boundaries appear twice or half-drawn without careful handling.", "A label that flickers in and out while panning looks broken even though each frame is valid."],
    v: "Pan and rotate slowly through a dense city center and confirm no overlapping labels, no label flicker for important features, and consistent labels across tile borders.",
    dep: ["glyph-service", "style-specification", "gpu-vector-renderer"]
  },
  "gpu-vector-renderer": {
    s: "Draws decoded vector tiles on the graphics hardware: triangulated fills, thick lines, text and symbols, using the style's rules and the current camera.",
    d: "Decoded geometry is converted into vertex buffers per tile and layer, with style-dependent attributes. Each frame, the renderer sorts layers, binds shaders for fills, lines, symbols and extrusions, and draws visible tiles with their transforms. Tile geometry is built on worker threads and uploaded without stalling the frame. Smooth interpolation between zoom levels is possible because geometry is not fixed to pixels. It is hard because there are many tiles and layers per frame, and device capabilities differ widely.",
    k: ["Tessellating on the CPU and uploading once vs drawing straight from raw data on the GPU: tessellation is flexible and portable, and costs memory and load time for each tile.", "Redrawing every frame vs only when something changes: continuous drawing is smooth during animation, but wastes battery on a static map."],
    p: ["Uploading tile geometry on the render thread causes visible stutter whenever tiles arrive.", "A GPU driver bug on one device family corrupts line joins and cannot be seen on others."],
    v: "Play a recorded camera path across city and country scales on low-end and high-end devices and confirm frame time stays within budget, no missing geometry appears, and static maps draw nothing when idle.",
    dep: ["vector-tile-encoding", "expression-evaluator", "sprite-atlas", "glyph-service"]
  },
  "server-side-raster-renderer": {
    s: "Draws map images on the server from vector data and a style, for static maps, thumbnails, print output and clients that cannot render vectors.",
    d: "A headless renderer loads the style, fetches the vector tiles it needs, and draws them to an image buffer, encoded as a compressed image. It serves requests for a center and size, bounds, or a single raster tile. Output must match the client rendering closely. Caching is critical because rendering is expensive. It is hard because the renderer needs the full rendering stack on the server, produces much larger responses than vector tiles, and must handle bursts, so it is separated from the main tile path.",
    k: ["Rendering on demand and caching vs pregenerating raster pyramids: on demand supports any style and size, but pregenerated tiles are far cheaper to serve at volume.", "Same renderer code as clients vs a separate server implementation: shared code matches visually, but pulls graphics dependencies into servers."],
    p: ["Embedding static maps in a high-traffic page without caching overloads the renderer.", "Fonts or icons missing on the server give a static image that differs from the live map."],
    v: "Render fifty locations server-side and in a client and compare the images, confirming labels, colors and symbols match within a tolerance and render time stays under the limit.",
    dep: ["style-specification", "vector-tile-encoding", "tile-cdn-caching"]
  },
  "terrain-and-hillshade": {
    s: "Adds elevation to the map: shaded relief, contour lines, slope and optionally 3D terrain, built from elevation grids tiled like any other layer.",
    d: "Elevation grids are cut into tiles, with heights encoded in the color channels of an image so they travel as ordinary raster tiles. The renderer computes slope and light direction per pixel to shade relief, extracts contours, or displaces a mesh for 3D views. Elevation also feeds routing for slope and climb costs. It is hard because data resolution varies by region, the files are large, and encoding must keep enough precision for slopes without bloating the tiles.",
    k: ["Height encoded in image channels vs a dedicated terrain format: image encoding reuses all raster infrastructure, but limits precision and compression choices.", "Shading on the client from raw heights vs prerendered shaded tiles: client shading allows changing light and style, but costs computing on every device."],
    p: ["Seams appear between tiles of different source resolution as visible lines in the shading.", "Elevation data that includes buildings or treetops is shown as terrain, producing false ridges."],
    v: "Render a mountain region at several zooms and confirm tile seams are invisible, the shading direction is consistent, and spot heights match survey points within the stated vertical accuracy.",
    dep: ["pyramid-builder", "style-specification", "source-feeds"]
  },
  "web-mercator-tiling": {
    s: "The scheme that maps the globe to a square plane and cuts it into a power-of-two grid per zoom level, giving every tile a zoom, column and row address.",
    d: "A cylindrical projection maps latitude and longitude to a square, and each zoom level doubles the grid in both directions, so level z has four to the power z tiles. Addresses are computed by simple arithmetic, which makes caching, URL building and parent-child relations trivial. The projection stretches areas near the poles and is cut off near them. It is hard because it fixes decisions for everything built on top, such as the tile size and the origin, and because distances and areas measured in it are wrong away from the equator.",
    k: ["A single global projection vs per-region projections: global gives one pyramid and simple clients, but distorts area near the poles and cannot serve local accuracy needs.", "256-pixel vs 512-pixel tiles: larger tiles cut request counts and give more compression context, but waste bytes for areas not visible."],
    p: ["Measuring distance or area in projected coordinates gives large errors at high latitude.", "Clients and servers disagreeing on the row origin flip the map vertically."],
    v: "Convert a set of known coordinates to tile addresses and back, in both the server and each client library, and confirm identical results, with tiles at latitude 60 matching the reference positions.",
    dep: []
  },
  "vector-tile-encoding": {
    s: "A compact binary format for the features of one tile: layers of points, lines and polygons as integer coordinates relative to the tile, with attributes in shared tables.",
    d: "Each tile contains named layers; each layer has features with a geometry type, commands encoding moves and line segments in a small integer grid, and tags referring to shared key and value tables. Deltas and zigzag integers keep the bytes small, and tiles are compressed on the wire. Clients decode and draw them with a style. It is hard because choosing the grid precision balances size against accuracy, and because the format must stay stable across many readers and writers.",
    k: ["Integer grid of fixed resolution vs floating point: integers compress well and decode quickly, but limit precision to a grid fraction of a tile.", "Many layers with few attributes vs fewer layers with many: many layers let the style load only what it needs, but multiply per-layer overhead."],
    p: ["Dropping the precision too far makes curved roads visibly polygonal when zoomed past the tile's native level.", "Putting verbose attributes on every feature inflates tiles beyond the size budget."],
    v: "Encode a tile, decode it, and compare geometry with the source, confirming coordinate error is under one grid unit, and check the compressed size of dense urban tiles stays under the target.",
    dep: ["web-mercator-tiling", "feature-clipping"]
  },
  "zoom-level-generalization": {
    s: "Decides what each zoom level contains: dropping small features, merging and simplifying shapes, and reducing detail so tiles stay small and readable.",
    d: "At low zoom, only countries and major roads are included; at high zoom, every building and footpath. Rules by class and zoom decide inclusion, and geometry is simplified to tolerance proportional to the pixel size. Small polygons are dropped or merged, dense points thinned, and road networks reduced to the main arteries. It is as much cartography as engineering. It is hard because naive simplification breaks topology, such as shared borders creating gaps, and because a threshold that works in cities fails in the countryside.",
    k: ["Simplifying each feature separately vs keeping shared boundaries consistent: separate is simple, but yields slivers and gaps between neighboring polygons.", "Fixed per-zoom rules vs density-adaptive thinning: fixed is predictable, while adaptive keeps rural detail and thins dense cities, at the price of harder tuning."],
    p: ["Dropping features by class only leaves a dense city center solid black at mid zoom.", "Simplification that removes a narrow isthmus or bridge disconnects a coastline visually."],
    v: "Compare screenshots at consecutive zoom levels over a dense city and a sparse region and confirm detail increases gradually without gaps in shared borders or sudden appearance of large features.",
    dep: ["feature-store", "style-specification"]
  },
  "feature-clipping": {
    s: "Cuts geometry at tile boundaries and adds a margin of overlap, so features crossing a border draw seamlessly in both tiles without gaps or doubled edges.",
    d: "A feature that spans tiles is clipped to each tile's rectangle plus a buffer of some pixels, so line caps, joins, label anchors and fills extend slightly past the edge. Coordinates beyond the edge are still stored in the tile grid, allowing negative values. Polygons keep correct winding. Lines may be split at the border, and the renderer discards the buffer area when drawing. It is hard because the buffer enlarges tiles, labels near edges need the same decision on both sides, and clipping polygons correctly is subtle.",
    k: ["Larger buffer vs smaller: large buffers hide seams for wide strokes and shadows, but increase tile size and duplicate features.", "Clipping at generation vs sending whole features: clipping bounds tile size, while whole features avoid seams but make some tiles enormous."],
    p: ["Too small a buffer leaves thick road casings showing a visible notch at every tile edge.", "Clipped polygons with the wrong winding render as inverted holes."],
    v: "Render a thick road and a large polygon crossing a tile corner at several zooms and confirm no visible seam, no doubled edges, and tile size increase from the buffer stays within the budget.",
    dep: ["web-mercator-tiling", "vector-tile-encoding"]
  },
  "pyramid-builder": {
    s: "Batch job that turns the full map database into every tile at every zoom, in parallel, writing them to an archive, from coarse levels to the finest.",
    d: "The builder reads the feature store partitioned by tile, applies per-zoom inclusion and simplification, clips, encodes and compresses each tile, and writes results in bulk. Low zooms are built by merging data across the whole planet, while high zooms are embarrassingly parallel. Empty and duplicate tiles are detected and stored once. A planet build produces billions of tiles. It is hard because of the compute cost, the skew between dense and empty tiles, and because a failure late in the build must not waste days.",
    k: ["Rebuilding the whole pyramid vs only changed tiles: whole is simple and consistent, while incremental is far cheaper but needs dependency tracking up the zoom levels.", "Building top-down from lower zoom data vs always from the source: top-down is faster, but accumulates simplification error across levels."],
    p: ["A few dense city tiles take hours while the job waits for them, because work was split evenly by area.", "Deduplicated tiles stored without reference counting are deleted while still in use."],
    v: "Build a test region fully, then rebuild after a single road edit incrementally and confirm the changed tiles and their parent tiles at every zoom differ from the previous build and all other tiles are byte-identical.",
    dep: ["feature-store", "zoom-level-generalization", "vector-tile-encoding", "batch-compute-cluster"]
  },
  "tile-archive-format": {
    s: "A single-file container holding millions of tiles with a directory index, so tiles are fetched by byte range from object storage without a running database.",
    d: "Tiles are ordered along a space-filling curve so neighbors are adjacent in the file, compressed, and indexed by a directory mapping tile ids to offsets and lengths. A client or server reads the small header and directory first, then fetches individual tiles with range requests. Duplicate tiles share one stored copy. The result is a static file that can be hosted on plain object storage. It is hard because directory size must stay manageable for a planet, and range requests must be few per tile.",
    k: ["A single archive file with range reads vs one file per tile: a single file is easy to publish and move, while per-tile files create billions of objects to manage.", "Space-filling curve ordering vs row-major: curve ordering keeps neighbors close for fewer reads, at the cost of simpler row scans."],
    p: ["A directory that does not fit a small number of reads makes each tile need several round trips.", "Replacing an archive in place while servers have it open serves a mix of old and new tiles."],
    v: "Fetch one thousand random tiles from the archive over a real network with a cold cache and confirm each takes a bounded number of range requests, with all bytes identical to the source tiles.",
    dep: ["pyramid-builder", "web-mercator-tiling"]
  },
  "on-demand-tile-server": {
    s: "Generates tiles at request time from the geometry store when a prebuilt tile does not exist, for custom data, rare zoom levels and fast-changing layers.",
    d: "On a cache miss, the server queries features intersecting the tile, applies the same inclusion and simplification rules as the batch build, encodes the tile and stores it for later. Spatial indexes make the query fast. It suits layers that change quickly, such as traffic or user data, where prebuilding would be stale. It is hard because the generation must produce identical output to the batch path, because first-request latency is higher, and because a burst of misses can overload the database.",
    k: ["Generating on demand vs prebuilding everything: on demand saves build time and storage for rarely viewed areas, but exposes users to slow first loads.", "Coalescing concurrent requests for the same tile vs letting each compute: coalescing prevents a stampede, at the cost of lock handling and timeouts."],
    p: ["A popular new tile that missed the cache is generated hundreds of times at once.", "Different rules in the on-demand and batch paths show a visible change when a tile is served from one or the other."],
    v: "Request a tile that does not exist in the archive from many clients simultaneously and confirm one generation occurs, all receive identical bytes, and the result equals the batch-built tile for the same data.",
    dep: ["feature-store", "zoom-level-generalization", "vector-tile-encoding", "feature-clipping"]
  },
  "tile-cdn-caching": {
    s: "Distributes tiles through edge caches near users, so most requests never reach the origin, controlled by cache keys, lifetimes and purge rules.",
    d: "Tile URLs are cache-friendly: identical bytes for the same address. The edge stores tiles with long lifetimes; origin shields collapse misses from many edges into one. Versioning in the path or a purge by tag handles updates. Compression and range support reduce transfer. Hit rates above ninety-five percent are normal, and the cost of a miss grows with the size of the world. It is hard because invalidation across thousands of edges takes time, and because personalized parameters in URLs fragment the cache.",
    k: ["Long lifetimes with versioned URLs vs short lifetimes with revalidation: versioned URLs give maximum hit rate, but need clients to learn new version paths.", "A shield layer between edge and origin vs direct misses: a shield protects the origin from the edge fan-out, but adds a hop of latency for cold tiles."],
    p: ["Adding an API key to every tile URL makes each key's tiles cache separately and destroys the hit rate.", "A purge request that reaches only some edges leaves users seeing two different maps."],
    v: "Measure the cache hit ratio for a day of real traffic and confirm it exceeds the target, then publish a new tile version and confirm every region shows it within the stated propagation time.",
    dep: ["tile-endpoint", "tile-archive-format", "tile-invalidation"]
  },
  "offline-package-builder": {
    s: "Builds a downloadable bundle for a region: tiles, a trimmed road graph, a search index and style assets, sized to fit a device and versioned for updates.",
    d: "Given a region polygon and zoom range, the builder extracts the tiles, the routing graph for selected profiles, and the place index entries inside, plus fonts and icons. Data is compressed and written in formats that can be memory-mapped by the client. A manifest lists contents and the data version. It is hard because routes near the border need data beyond the region, because package size grows fast with zoom and detail, and because every component must come from the same data version.",
    k: ["Rectangular regions vs administrative regions: rectangles are simple to define, but administrative regions match what users understand and avoid duplicating shared edges.", "One package with everything vs separate packages for maps, routing and search: one is simple to install, while separate lets users skip what they do not need."],
    p: ["A package that includes tiles but not the graph for its border roads breaks navigation at the edge.", "Packages built from different data versions show roads that routing does not know."],
    v: "Download a regional package, disable the network, and confirm the app can draw the area, find a street, and route between two points in the region, including one near the border.",
    dep: ["pyramid-builder", "graph-serialization", "place-index", "data-versioning-and-rollout"]
  },
  "offline-routing-engine": {
    s: "A compact routing engine inside the app that loads a packaged graph and answers route requests on the device without network access.",
    d: "The engine memory-maps a compact graph with precomputed shortcuts, snaps coordinates, runs a hierarchical search and produces geometry and instructions locally. It supports few profiles, with no live traffic unless a recent update was cached. Memory and battery are tight, so structures are small and queries need low allocation. Long routes need several linked regions. It is hard because it must run on weak hardware, and because the same results as the online service are expected, within the limits of older data.",
    k: ["A reduced graph with simplified costs vs the full server graph: reduced fits on phones, but may produce routes that differ from online answers.", "Sharing code with the server engine vs a dedicated small engine: shared code matches behavior, but pulls in assumptions about memory that devices lack."],
    p: ["A route that spans two downloaded regions fails because the join between them was not packaged.", "Loading the whole graph into memory evicts the app on devices with little RAM."],
    v: "Compare fifty routes computed offline with the same routes from the online service on the same data version, confirm durations and geometry agree within tolerance, and confirm peak memory stays under the limit.",
    dep: ["contraction-hierarchies", "offline-package-builder", "instruction-generator"]
  },
  "offline-search-index": {
    s: "A compact on-device index of places and addresses in the region package, supporting prefix and typo-tolerant search without a server.",
    d: "The package contains a trimmed index: normalized names, address components, coordinates and importance, in a format searched directly from storage. It supports autocomplete and simple parsing, with a smaller vocabulary and fewer ranking features than online. Index size is controlled by dropping rare names and languages. It is hard because storage is limited, because on-device ranking must be good with less signal, and because the same query should give similar results online and offline.",
    k: ["A prebuilt compact index vs building one on the device after download: prebuilt is fast to install, but built on device adapts to the user's language at the cost of time and battery.", "Full multilingual names vs the user's language only: full supports travelers, but increases the package size markedly."],
    p: ["Dropping rare names removes the small village the user is actually traveling to.", "Ranking without a popularity signal puts obscure places above famous ones."],
    v: "Run the labeled search test set offline against the package and online, and confirm the share of queries with the correct first result offline is within a few points of online.",
    dep: ["place-index", "text-normalization", "offline-package-builder"]
  },
  "delta-package-updates": {
    s: "Updates an installed regional package by downloading only what changed, applied atomically so the app always has a complete, consistent map.",
    d: "The service compares the new package to the one the device holds, by version, and produces a patch of changed tiles, graph blocks and index segments. The client downloads, verifies checksums, applies it to a copy, then swaps. Updates run in the background on suitable networks. If the device is too many versions behind, a full download is cheaper. It is hard because deltas must be correct for every base version, and a failed or interrupted apply must leave a usable map.",
    k: ["Delta patches from the immediate previous version vs from any version: patches from the last version are small, while supporting any base version multiplies what must be stored.", "Applying in place vs on a copy: in place saves storage, but a crash mid-update leaves a corrupt map."],
    p: ["A patch applied against the wrong base version silently produces a broken package.", "Updating only when on mobile data uses up the user's plan."],
    v: "Apply a delta to a package one version behind and confirm the result is byte-identical to the full new package, then interrupt an update midway and confirm the old package still works.",
    dep: ["offline-package-builder", "data-versioning-and-rollout"]
  },
  "storage-budgeting": {
    s: "Manages how much device storage maps use: estimating package sizes, choosing what to keep, evicting unused regions and warning before a download that will not fit.",
    d: "The app shows estimated sizes per region and detail level, tracks usage by region, and applies a budget. Policies evict least recently used regions or cached tiles first, while pinned regions are kept. It checks free space before downloads and handles removable storage. Because maps compete with photos and apps, being conservative earns trust. It is hard because estimates must be accurate before the download, and because aggressive eviction deletes what a traveler needs on a trip.",
    k: ["Automatic eviction vs asking the user: automatic keeps the device healthy, but silently removing a region before a trip is worse than asking.", "Quality levels per region vs one fixed level: levels let users choose between size and detail, and add choices that most users do not understand."],
    p: ["An underestimated size leads to a download that fails at ninety percent for lack of space.", "Evicting a pinned or recently planned region before a trip leaves the user without a map."],
    v: "Fill a test device to near capacity, start a download and confirm a warning is shown before it begins, and that automatic eviction removes only unpinned, least recently used data.",
    dep: ["offline-package-builder", "client-tile-cache"]
  }
});
