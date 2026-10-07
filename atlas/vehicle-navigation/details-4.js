// Details for the in-vehicle navigation plate, part 4: map matching, map data, map rendering.
ATLAS.details("vehicle-navigation", {
  "candidate-segment-search": {
    s: "Finds the road segments near the estimated position, within a radius scaled to the position error, as the starting candidates for matching.",
    d: "Each position update queries the spatial index for edges within a search radius, typically a few tens of meters, widened when confidence is low. For each candidate it computes the distance to the segment, the projection point and the angle difference between vehicle heading and segment direction. Only edges legally traversable in the travel direction are kept. It is hard because the query runs at every update on a slow processor, and because too small a radius misses the right road while too large a radius floods the tracker.",
    k: ["Radius from position accuracy vs fixed radius: scaled adapts to canyons and costs more candidates there; fixed is cheap and fails when error grows.", "Including both directions of a road vs only the plausible one: both is robust to heading error and doubles candidates."],
    p: ["A radius smaller than the true error excludes the correct road and the vehicle snaps to the wrong neighbor.", "Candidates missing because the road lies in a tile not loaded yet."],
    v: "Replay drives with ground-truth road assignment and measure the fraction of updates where the true road is in the candidate set, by position accuracy bucket. Measure query time per update on target hardware.",
    dep: ["spatial-index","position-confidence-output","road-network-model"]
  },
  "path-hypothesis-tracker": {
    s: "Maintains several possible paths the vehicle might be on and scores each over time, choosing the most probable path, instead of snapping each position to the nearest road independently.",
    d: "Each hypothesis is a sequence of connected segments. For each new position the tracker extends hypotheses along the network and scores them with how well position and heading fit, and how plausible the transition is between segments given speed and distance. Low-scoring hypotheses are pruned. A probabilistic model such as a hidden Markov chain is typical. It is hard because the best hypothesis at a junction is ambiguous for a few seconds, and decisions should not flip back and forth.",
    k: ["Multiple hypotheses vs greedy nearest-road snapping: hypotheses resolve ambiguity from later evidence and cost memory and time; greedy is cheap and wrong at parallel roads.", "Delaying commitment vs reporting immediately: delay is accurate and lags; immediate is responsive and revisable only by jumping."],
    p: ["Pruning too aggressively discards the correct path at a junction before evidence arrives.", "Hypotheses that never die when the vehicle drives off the mapped network."],
    v: "Evaluate on recorded drives with ground-truth paths, reporting the share of correctly matched edges and the number of path corrections after commitment. Include parallel roads and complex interchanges.",
    dep: ["candidate-segment-search","heading-and-speed-evidence","topology-constraints"]
  },
  "heading-and-speed-evidence": {
    s: "Scores how well the vehicle's heading and speed fit a candidate road, using the segment's direction, speed limit and class as evidence beyond distance alone.",
    d: "A vehicle's heading should align with the road's direction in its travel direction, within a tolerance that depends on heading accuracy. Speed should be plausible for the road class: 120 kilometers per hour on a footpath is unlikely. Turn rates should match curvature. These add likelihood terms to the hypothesis score and help separate parallel roads with different speeds, such as a highway and its service road. It is hard because evidence is weak at low speed, when heading is unreliable.",
    k: ["Hard heading cutoff vs soft likelihood: a cutoff is simple and rejects good matches at noisy heading; a likelihood is smooth and needs tuning.", "Using speed limit as evidence vs ignoring it: it separates roads of different class and misleads where drivers exceed or crawl."],
    p: ["Using heading at standstill matches the vehicle to a road at random.", "Penalizing speed above the limit pushes a fast vehicle off the right highway onto a slower parallel road."],
    v: "Test on parallel road pairs such as an elevated road over a ground-level road, replaying drives with ground truth and measuring accuracy with and without the evidence terms.",
    dep: ["candidate-segment-search","road-attribute-layers","position-confidence-output"]
  },
  "topology-constraints": {
    s: "Uses connectivity and legal movement rules of the road network, so that a path must follow connected segments and permitted turns, to reject impossible jumps between candidates.",
    d: "Transitions between consecutive matched edges must be reachable in the graph within the distance traveled. One-way streets and turn restrictions limit them further. The tracker computes the network distance between candidate positions and compares it with the distance measured by odometry; a large mismatch lowers the transition probability. It is hard because shortest-path checks at every update are costly and because map errors, such as a missing link, can make a real move look impossible.",
    k: ["Strict legality vs tolerance for map errors: strict rejects wrong matches and gets stuck at a mapping error; tolerance recovers and permits illegal paths.", "Exact network distance vs straight-line approximation: exact is correct and slow; approximation is cheap and ambiguous near loops."],
    p: ["A recently built road missing from the map makes the vehicle appear to jump between disconnected roads.", "Following a one-way constraint from outdated data keeps the vehicle off a road that has reversed."],
    v: "Replay drives that include newly built roads and temporary diversions and measure how long the tracker takes to recover. Compare network and odometry distance for matched transitions on ordinary drives.",
    dep: ["routing-graph","path-hypothesis-tracker","turn-restrictions-and-penalties"]
  },
  "layer-disambiguation": {
    s: "Tells apart roads at different levels that overlap in the horizontal plane, such as bridges, tunnels and multi-level interchanges, using altitude, entry history and context.",
    d: "A flat position is ambiguous when one road crosses over another or runs above it. The matcher uses the sequence of entries and exits, altitude or barometric pressure change, and the map's level attributes to choose. Hypotheses entered on a ramp stay on the elevated level until an exit. It is hard because satellite altitude is much less accurate than horizontal position, and because an error persists: the vehicle stays on the wrong level until the next junction.",
    k: ["Continuity from entry vs altitude evidence: continuity is robust and fails after an outage; altitude helps recovery and is noisy.", "Barometer input vs satellite altitude only: barometer is precise for relative changes and needs a sensor and drift handling."],
    p: ["A vehicle on a viaduct matched to the road beneath it, so guidance and traffic data apply to the wrong road.", "Level information missing from the map for multi-story interchanges."],
    v: "Drive an elevated road above a parallel ground road and a multi-level interchange, and record the matched level in each case. Compare with ground truth, and check recovery after a tunnel outage on the elevated road.",
    dep: ["path-hypothesis-tracker","road-attribute-layers","inertial-sensor-driver"]
  },
  "off-road-and-parking-detection": {
    s: "Recognizes when the vehicle is no longer on a mapped public road, in a parking lot, private road or drive-through, and stops forcing it onto the nearest road.",
    d: "When no candidate fits within a tolerance for long enough, the matcher switches to a free-position mode and uses the fused position directly. It uses speed, turn patterns and map data on parking areas to recognize lots. When the vehicle returns to a road, it re-enters matching with a wide candidate search. It is hard because parking facilities are mapped poorly, so leaving a car park and joining a road is a common failure, and because the choice between off-road and noisy fix is ambiguous.",
    k: ["Staying snapped to roads vs free mode: snapped looks clean and wrong in a lot; free mode is honest and shows an unmatched marker.", "Mapped parking areas vs inferring from behavior: mapped data is precise where it exists; inference works everywhere and can misfire in congestion."],
    p: ["A vehicle crossing a car park is dragged along an adjacent road for the whole crossing.", "After leaving a car park the matcher snaps to the wrong road and guidance starts from there."],
    v: "Drive into and out of a multi-storey car park, a private lot and a drive-through, and verify that the matcher reports off-road within a set distance and rejoins the correct road on exit.",
    dep: ["path-hypothesis-tracker","place-and-address-data","position-confidence-output"]
  },
  "matched-position-output": {
    s: "Publishes the map-matched position: the road segment, offset along it, travel direction, heading and a confidence, and keeps the raw position beside it for components that need it.",
    d: "Consumers include route following, guidance timing, the map display, traffic reporting and speed limit lookup. The output carries the edge identifier, position along the edge, snapped coordinates, matched heading, speed and a match confidence that includes the chance that the road is wrong. Updates come at the matcher rate, with timestamps. It is hard because consumers have different needs: the display wants smooth positions, while guidance wants the correct road.",
    k: ["Snapped position vs raw position for display: snapped keeps the marker on the road and hides errors; raw is truthful and looks off-road.", "Publishing the best hypothesis only vs several: the best is simple; several let consumers handle ambiguity and complicate every consumer."],
    p: ["Consumers using the snapped coordinate where the raw one was needed, for example to detect parking.", "Confidence field omitted, so downstream components act on uncertain matches."],
    v: "Check on replayed drives that matched edge, offset and direction agree with ground truth and that the published confidence is lower at junctions and parallel roads. Confirm time stamps are monotonic.",
    dep: ["path-hypothesis-tracker","position-confidence-output","off-road-and-parking-detection"]
  },
  "road-network-model": {
    s: "The map's representation of roads as links between nodes with direction, class, geometry and connectivity, which all routing, matching and display functions read.",
    d: "A road is split into links at junctions and wherever attributes change. Each link has geometry as a polyline, a class such as motorway or residential, a functional importance, direction of travel, number of lanes and a stable identifier. Nodes are junctions with connected links. Separate carriageways of a divided road are separate links. It is hard because the model must serve routing, which wants a simple graph, matching, which wants accurate geometry, and display, which wants a hierarchy of detail.",
    k: ["Link per carriageway vs one centerline: separate links enable correct turns and matching; one centerline is compact and loses lane-level detail.", "Stable identifiers across versions vs regenerated: stable identifiers keep references from traffic and favorites valid; regeneration is simpler and breaks them."],
    p: ["Splitting links inconsistently between map versions invalidates identifiers held by the traffic store.", "Missing links for new roads, which leaves them unroutable and unmatchable."],
    v: "Load a tile and check that every link has endpoint nodes, that connectivity is symmetric where roads are two-way and that geometry endpoints equal node positions. Compare the network with a survey in a sample area.",
    dep: ["compiled-map-format","geometry-compression"]
  },
  "tile-partitioning": {
    s: "Divides the map into tiles, regular cells or adaptive regions, so that only the needed pieces are read from storage and held in memory at a time.",
    d: "Tiles are chosen by a grid, a quadtree, or by data density so that each tile is a similar size in bytes. Each tile holds roads, attributes and places for its area, at one or more levels of detail. Road links that cross a boundary are split or referenced from both sides. The scheme sets how much data is read per query and how often neighboring tiles must be loaded together. It is hard because dense cities and empty countryside have very different amounts of data per area.",
    k: ["Uniform grid vs data-adaptive tiles: a grid is simple to address and gives uneven sizes; adaptive tiles are balanced and need an index of tiles.", "Large tiles vs small: large tiles mean fewer reads and more waste; small tiles are efficient in memory and cause many reads and seams."],
    p: ["A very dense city tile exceeds the memory budget and fails to load.", "Links crossing tile boundaries stored differently on each side cause seams in routing and display."],
    v: "Report the distribution of tile sizes in bytes across a region, and confirm the largest fits the memory budget. Route and render across tile boundaries and confirm no seams in geometry or connectivity.",
    dep: ["road-network-model","compiled-map-format"]
  },
  "road-attribute-layers": {
    s: "Properties attached to roads, such as speed limits, road class, tolls, surface, restrictions, names and the legal rules of that region, stored in separable layers.",
    d: "Attributes are stored in layers keyed by link, so a unit can load only the layers it needs and so layers can be updated independently. Some are static, such as class and names, while others are conditional on time, weather or vehicle type. Speed limit and restriction attributes are used by routing, matching and display. It is hard because attributes are sourced from many suppliers with differing quality, and because conditional values, for example a limit that applies on school days, are hard to represent.",
    k: ["Separate layers vs attributes embedded in links: layers allow selective loading and updates with an extra join; embedded is fast to read and rigid.", "Conditional attributes as rules vs expanded values: rules are compact and need an evaluator; expanded values are simple and large."],
    p: ["A speed limit attribute that is out of date makes warnings and ETA wrong on a changed road.", "Conditional restrictions ignored because the evaluator lacks the vehicle's date or time."],
    v: "Sample roads in the field and compare speed limit, class and restriction attributes with the map. Confirm that a time-conditioned rule evaluates differently at two times of day.",
    dep: ["road-network-model","compiled-map-format"]
  },
  "lane-and-sign-data": {
    s: "Map content describing lane count, lane directions, lane connectivity at junctions and the text and type of signs, used by lane guidance and by maneuver naming.",
    d: "For each link it stores number of lanes, allowed directions per lane, where lanes begin or end and which lane connects to which at the junction. Signs include exit numbers, destination names and shield types. Compared with the road network, this data is costly to collect, so coverage is partial and concentrated on highways and big junctions. It is hard because the data is detailed and changes often with roadworks, and because incorrect lane data is worse than none.",
    k: ["Lane connectivity per lane vs per link: per lane enables exact advice and takes much more data; per link is compact and coarse.", "Authoring from surveys vs deriving from probe data: surveys are accurate and slow to refresh; probe-derived is current and noisy."],
    p: ["Lane data preserved across a road rebuild that changes the layout.", "Sign text in a different language order than the road sign leads to instructions that the driver cannot match."],
    v: "Survey a sample of junctions and compare lane counts and directions with the data. Verify that coverage reporting tells guidance which junctions lack lane data.",
    dep: ["road-network-model","compiled-map-format"]
  },
  "place-and-address-data": {
    s: "Searchable content: place names and categories, address points and ranges, postal areas, administrative boundaries and the links from each to a drivable access point.",
    d: "Places come with names in several languages and scripts, categories, coordinates, entrance positions, and sometimes opening hours and attributes. Addresses are stored as points or as ranges of numbers along a street. Boundaries support disambiguation by city, district or country. Each item references the road segment where one can reach it. It is hard because the sources differ in coverage and quality, because naming conventions vary, and because place data changes much faster than roads.",
    k: ["Address points vs ranges with interpolation: points are exact and heavy; ranges are compact and approximate.", "Multilingual names stored in full vs primary plus transliteration: full is searchable in any language and larger; transliteration is compact and imperfect."],
    p: ["Access point linked to a road segment that cannot be reached from the destination's side.", "Postal area boundaries out of date, so searches by postal code return the wrong district."],
    v: "Check a sample of addresses and places against field survey: position, access road and name. Search by the alternate names and by postal code and confirm correct results.",
    dep: ["compiled-map-format","road-network-model"]
  },
  "geometry-compression": {
    s: "Stores road shapes compactly, using delta coding, simplification by level of detail and quantized coordinates, so that a continent's roads fit in the storage and memory available.",
    d: "Shape points are stored as small offsets from the previous point in a tile-local coordinate system, then packed with variable-length integers. Lines are simplified at coarser zoom levels using a tolerance in meters. The decoder reconstructs coordinates on demand. The result trades size against accuracy, and must preserve topology, such as nodes shared by connected roads. It is hard because quantization errors accumulate along long roads and because simplification must not make parallel roads cross.",
    k: ["Lossy quantization vs lossless: lossy reduces size by a large factor and limits accuracy to the quantum; lossless is exact and larger.", "Per-level simplified copies vs on-the-fly simplification: copies are fast to draw and use storage; on-the-fly saves space and costs time."],
    p: ["A quantization step that is too large moves a junction enough that matching tolerances fail.", "Simplified geometry used for distance calculations underestimates route length."],
    v: "Decode compressed tiles and measure maximum deviation from the source geometry, which should be below the stated tolerance. Compare computed route lengths from compressed and uncompressed data.",
    dep: ["compiled-map-format","tile-partitioning"]
  },
  "spatial-index": {
    s: "A structure that finds map features near a point or inside a rectangle quickly, used by matching, search, rendering and incident decoding.",
    d: "Typical forms are grids, quadtrees and trees of bounding rectangles, stored per tile so that a query first selects tiles and then features within them. Queries ask for nearest roads, places in a radius or everything in a viewport. The index is built at compile time and is read-only at run time. It is hard because queries come at high rate from several components, because it must not pull in unneeded tiles, and because index size competes with data.",
    k: ["Grid cells vs tree structure: grids are simple and fast for uniform density; trees adapt to density and cost more to traverse.", "One index for all feature types vs one per type: one saves space; per type is faster to search and consumes more."],
    p: ["A query at a tile edge missing features in the neighboring tile because only one tile was searched.", "An index that is larger than available memory causes thrashing during matching."],
    v: "Compare nearest-feature and radius query results with a brute-force scan on a large random sample and require identical output. Measure queries per second on target hardware.",
    dep: ["tile-partitioning","compiled-map-format"]
  },
  "junction-and-landmark-assets": {
    s: "Authored visual content bundled with the map: junction pictures, 3D landmark models, signposts and building footprints keyed to map features.",
    d: "Assets are attached to nodes or links by identifier, with a position and orientation. A junction asset includes the picture plus lane and arrow anchor points that the overlay aligns to. Landmarks, such as a recognizable building, are used both in the map and in instructions, in the form of turn after the tower. They are produced by a content pipeline, often with manual work. It is hard because assets are expensive, partial and must be revised when the road changes.",
    k: ["Raster images vs vector or 3D assets: images look as designed and scale poorly; vector and 3D scale to any display and need more rendering work.", "Landmarks in instructions vs only on the map: in instructions they help drivers and require high data quality."],
    p: ["An asset keyed to an identifier that changed in a new map version, so the wrong junction picture is shown.", "Assets that exceed the memory budget when many are loaded together."],
    v: "Load each asset in a map region and confirm its identifier resolves to the intended feature and its anchor points align with lane geometry. Compare against the road on site for a sample.",
    dep: ["compiled-map-format","road-network-model","lane-and-sign-data"]
  },
  "compiled-map-format": {
    s: "The binary layout of the map on the device: headers, tile directory, layers and indexes, designed for memory-mapped read access without parsing and for forward-compatible versions.",
    d: "The file starts with a header giving version, region and a directory of tiles with offsets and sizes. Each tile contains layers with fixed-width structures and relative offsets, so it can be used in place after being mapped. Checksums guard against corruption. The format fixes what the software can ask, and changing it forces every consumer and every installed map to change together. It is hard to design for both fast access and later extension.",
    k: ["Memory-mapped in-place structures vs parsed objects: in-place is fast to open and low on memory, and fixes the layout; parsing is flexible and slow to start.", "Strict version match vs tolerant readers: strict is safe and forces coordinated updates; tolerant lets old software read newer maps and ignore what it does not know."],
    p: ["A format change without a version bump makes old software misread new maps as valid.", "Alignment and byte-order assumptions that differ between build machines and the unit."],
    v: "Open maps of the current and previous format versions with the shipped software, and confirm correct acceptance or rejection with a clear error. Run a checksum verification across all tiles of an installed region.",
    dep: ["map-storage-and-io"]
  },
  "map-compiler-pipeline": {
    s: "The offline process that turns source map data, from many suppliers and surveys, into validated compiled tiles with routing structures, indexes and speed profiles.",
    d: "Stages import and merge sources, conflate duplicate features, repair geometry, build the routing graph and stable identifiers, compute hierarchies and indexes, simplify for levels of detail and package tiles. Automated checks verify connectivity, one-way consistency, attribute ranges and routing between sample points. Output is signed and versioned. It is hard because errors in source data scale into millions of faulty roads, and because a full build takes many hours so fixes arrive slowly.",
    k: ["Full rebuild vs incremental compile: full is simple and consistent; incremental is quick and risks drift between tiles.", "Strict validation that blocks release vs warnings: strict prevents bad maps and delays updates; warnings ship faster with known defects."],
    p: ["A conflation rule that merges two distinct roads removes a real route from the map.", "Validation covering structure only, not driving behavior, so errors pass that routing tests would catch."],
    v: "Run a regression set of thousands of routes between sample points on the new compiled data and compare with the previous release, reviewing every large change in distance or time and every unroutable pair.",
    dep: ["road-network-model","tile-partitioning","geometry-compression","compiled-map-format"]
  },
  "tile-decoder": {
    s: "Reads a tile's drawable content, roads, areas, labels and points, from the compiled map or a vector tile and converts it into buffers the renderer can draw.",
    d: "Decoding unpacks delta-coded geometry, applies the tile origin, reads feature classes and attributes and triangulates filled areas. Roads become strips with width by class and zoom. The work runs on a background thread so that frames are not blocked, and results are handed to the render thread. It is hard because decode cost is spiky when the vehicle crosses into a dense area, and because a tile decoded for one zoom level should be reused for neighbors.",
    k: ["Decoding on demand vs pre-built draw buffers on disk: on-demand saves storage and uses processor time; pre-built is fast and large.", "One decode for all styles vs per-style output: one is cheaper and the renderer must restyle; per-style is direct and repeats work."],
    p: ["Decoding on the render thread stalls frames when entering a dense city tile.", "Triangulation errors on complex polygons produce visible holes in areas such as water."],
    v: "Measure decode time per tile across a dense city and record frame times during a fast pan. Compare rendered output with a reference for tiles with complex polygons and confirm no holes.",
    dep: ["compiled-map-format","geometry-compression","tile-cache-and-prefetch"]
  },
  "style-engine": {
    s: "Applies a style, rules that give each feature a color, width, pattern and visibility by type and zoom level, so that one map can be drawn in several looks.",
    d: "A style is a set of rules matching on feature class and attributes and giving drawing properties at each zoom. The engine evaluates the rules for decoded features, caching results per tile. Styles are swapped for day and night, for different regions, and for simplified guidance views. It is hard because rule evaluation is expensive when repeated for every feature, and because designers want rich styles while the display needs to stay readable at a glance and at speed.",
    k: ["Data-driven style rules vs hard-coded drawing: rules let designers change looks without code and need an interpreter; hard-coded is fast and inflexible.", "Per-feature evaluation at decode time vs at draw time: decode time is cheap per frame and fixes the style; draw time allows live theme changes at higher cost."],
    p: ["A new style that lacks rules for a feature class silently hides it, such as a ferry route.", "Styles authored for one screen size unreadable on another."],
    v: "Render a reference set of tiles with each style and compare images with approved ones. Confirm that every feature class in the map has a rule in every style, with a static check over the style and the data schema.",
    dep: ["tile-decoder","day-night-theming"]
  },
  "label-placement": {
    s: "Chooses where to put street names, place names and icons so that they do not overlap, follow road curves, remain readable and stay stable while the map moves.",
    d: "The placer generates candidate positions for each label, along lines for streets or around points for places, ranks labels by importance and greedily picks positions without collision. It must respect rotation with heading-up display and keep chosen positions stable across frames so labels do not flicker. Placement runs on the processor each time zoom changes. It is hard because it is a global layout problem under a time limit, and because text needs different widths in different languages.",
    k: ["Greedy placement vs optimizing globally: greedy is fast and acceptable; global optimization places more labels and is too slow for each frame.", "Placing labels per frame vs caching positions per zoom step: per frame adapts to rotation and costs time; cached is cheap and shows steps."],
    p: ["Labels that flicker when two labels of equal importance trade the same space between frames.", "Upside-down street names after rotation in heading-up mode."],
    v: "Pan, zoom and rotate through a dense city map while recording frames, count label overlaps and label appearance changes between consecutive frames, and measure placement time per frame.",
    dep: ["tile-decoder","style-engine","localization-and-units"]
  },
  "gpu-scene-renderer": {
    s: "Draws the decoded map, the route and the vehicle marker to the screen using the graphics processor, with a fixed per-frame budget to keep movement smooth.",
    d: "The renderer batches geometry by style, draws background areas, roads, buildings, labels and overlays in layer order, and applies the camera transform. It uploads new tile buffers between frames, and evicts old ones. A frame must complete in about 16 to 33 milliseconds while sharing the processor with guidance and audio. It is hard because embedded graphics hardware is limited in memory and fill rate, and because the display may be large, with high resolution, and viewed in sun glare.",
    k: ["Rendering every frame vs on change: every frame is smooth for animation and uses power; on change saves power and risks stutter when something moves.", "Fixed layers vs dynamic depth ordering: fixed order is fast; depth ordering handles overpasses and 3D and costs more."],
    p: ["Uploading large buffers during a frame causes a visible hitch.", "Running out of graphics memory in a dense area, leading to missing roads or a crash."],
    v: "Record frame times over a scripted drive through dense and sparse areas on target hardware and report the share of frames within the budget. Look at the output screenshots for missing features.",
    dep: ["tile-decoder","style-engine","label-placement","tile-cache-and-prefetch"]
  },
  "terrain-and-3d-buildings": {
    s: "Adds relief, elevation shading and extruded building shapes to the map, giving the driver a view closer to what they see, at the price of data and rendering cost.",
    d: "Terrain comes from elevation grids rendered as shaded relief or meshes, and buildings from footprints with heights, drawn as extrusions or detailed models for landmarks. The view can be tilted into a perspective with a horizon. Level of detail reduces cost with distance. It is hard because extra geometry multiplies data and draw load, because it can obscure roads when not designed carefully, and because the data is often incomplete.",
    k: ["Simple extruded footprints vs detailed models: extrusions cover a whole city cheaply; detailed models look real and exist for a few landmarks.", "Perspective view vs top-down: perspective shows what is ahead; top-down is clearer for planning."],
    p: ["Tall buildings drawn in front of the route in a tilted view hide the next turn.", "Elevation data resolution too coarse, so roads appear to run through hills."],
    v: "Drive or replay through hilly and high-rise areas in tilted view and confirm the route and next turn stay visible. Measure additional memory and frame time compared with the flat map.",
    dep: ["gpu-scene-renderer","tile-decoder","map-storage-and-io"]
  },
  "route-and-traffic-overlay": {
    s: "Draws the active route, its alternatives and live traffic coloring over the base map, and highlights the next maneuver, incidents and charging or fuel stops.",
    d: "Overlay geometry comes from the route object and the traffic store, not from map tiles. The route draws as a wide line with outline and arrows, traffic as colored segments along roads, and incidents as icons. It updates when the route or traffic changes without reloading tiles. Drawing order places the route above roads and below labels. It is hard because the overlay must align exactly with the map, and because color choices for traffic must be readable by color-blind drivers.",
    k: ["Coloring the road itself vs a colored line beside it: coloring the road reads naturally and conflicts with road styling; a side line is separate and clutters.", "Showing all incidents vs only those on the route: all gives context and clutter; route-only is clean and misses nearby alternatives."],
    p: ["Overlay computed on simplified geometry misaligned with detailed road shapes at zoom.", "Traffic colors that rely only on red and green."],
    v: "Display a route with known congestion and compare the colored segments with the traffic store's per-edge data. Verify overlay alignment at several zoom levels and check readability with a color-blindness simulation.",
    dep: ["route-geometry-assembly","traffic-store-and-expiry","gpu-scene-renderer"]
  },
  "tile-cache-and-prefetch": {
    s: "Keeps recently used tiles in memory and loads the ones the vehicle is about to need, along the route and ahead of the heading, so the map never shows holes.",
    d: "A cache holds decoded tiles under a memory budget with least-recently-used eviction, with a bias to keep tiles on the active route. Prefetch predicts needed tiles from position, heading, speed and the route, and requests them early. Without a route it uses likely continuation. It is hard because storage reads are slow and bursty, because prefetching wastes memory and bandwidth when the driver turns, and because routing, matching and rendering all need tiles.",
    k: ["Prefetching along the route vs a radius around the vehicle: route-based is efficient and misses off-route driving; radius is robust and wasteful.", "Shared tile cache for all consumers vs per-component caches: shared saves memory and needs coordination; separate is simple and duplicates."],
    p: ["Eviction of tiles that routing still holds references to, causing a crash or a wrong route.", "Prefetch competing with rendering for storage bandwidth and causing stutter."],
    v: "Drive a long route at speed and count tile misses seen by renderer and matcher, and the memory high-water mark. Confirm misses stay near zero on the route and memory remains under budget.",
    dep: ["map-storage-and-io","compiled-map-format","tile-partitioning"]
  },
});
