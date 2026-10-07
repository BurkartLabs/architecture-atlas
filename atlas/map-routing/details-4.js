// Details for the map rendering & routing plate, part 4: data ingestion and road graph construction.
ATLAS.details("map-routing", {
  "source-feeds": {
    s: "The intake of raw geographic data from community edits, government releases, commercial suppliers and satellite imagery, each with its own format, license and update rhythm.",
    d: "Each source has an adapter that fetches on a schedule, verifies integrity, records the version and license, and writes the raw data to storage unchanged. Formats range from bulk planet files to per-region shapefiles to streaming change feeds. Sources differ in coverage, accuracy and freshness, so each is assigned a trust level used later in merging. It is hard because feeds fail, change format without notice, and arrive with licenses that restrict how data may be combined or shown.",
    k: ["Pulling all sources into one raw store untouched vs transforming on arrival: untouched allows reprocessing when rules change, but multiplies storage.", "Many small regional feeds vs one global feed: regional feeds are fresher and more detailed locally, but each adds adapter code and licensing work."],
    p: ["A supplier changes a field name and the adapter silently loads nulls into the next build.", "A source license that forbids derived works is mixed into the shared dataset and cannot be separated later."],
    v: "Run every adapter against its latest release, and confirm each produces the expected record count within a tolerance of the previous run, records its version and license, and fails loudly on a changed schema.",
    dep: ["provenance-and-licensing"]
  },
  "change-diff-import": {
    s: "Applies a stream of small edits to the stored map instead of reloading everything, keeping the map fresh within minutes of an upstream change.",
    d: "Upstream sources publish diffs as lists of created, modified and deleted objects over fixed intervals. The importer applies them in order to the working store, tracking the sequence number so none are skipped or repeated, and marks the affected areas for downstream rebuilds. Dependent objects, such as ways and relations referring to moved nodes, are also touched. It is hard because ordering errors corrupt the state, because deletions must propagate, and because the changes must be mapped to the tiles and graph pieces they affect.",
    k: ["Continuous minute-level diffs vs daily snapshots: minute diffs give fresh data, but the pipeline must handle constant small changes and vandalism quickly.", "Applying diffs in place vs rebuilding from a periodic full extract: in place is quick, but errors accumulate until a rebuild resets them."],
    p: ["A missed sequence number silently leaves a deleted road in the map for months.", "Applying a bad edit immediately sends vandalized data into routing before anyone reviews it."],
    v: "Apply a recorded day of diffs to a snapshot and compare the result with the next full extract, confirming no object differs, and confirm the affected-area list covers every changed tile.",
    dep: ["source-feeds", "feature-store", "incremental-updates"]
  },
  "schema-mapping": {
    s: "Translates every source's categories and attributes into one common schema: road classes, names, access, speeds and place types, with defined defaults and per-source rules.",
    d: "Each source labels the same things differently: highway classes, address fields, one-way markers. Mapping tables and rules convert them to the internal schema, handling units, languages and value ranges. Unmappable values are logged, not dropped silently. The common schema is versioned, since downstream tiles, routing and search depend on it. It is hard because categories do not align one to one, because the schema must be rich enough for routing yet simple enough to maintain, and because rule changes alter the whole map.",
    k: ["A fixed internal schema vs passing source attributes through: a fixed schema keeps downstream code simple, but loses attributes it did not anticipate.", "Rule tables as data vs code: data lets cartographers change mappings without a release, but is harder to test than code."],
    p: ["A source's new road class falls to a default and is routed as a minor road.", "Changing a mapping rule alters thousands of features and surprises every consumer."],
    v: "Run the mapping over a sample from each source and confirm all values map to known categories, the unmapped value report is empty or reviewed, and a rule change shows an expected diff in feature counts.",
    dep: ["source-feeds"]
  },
  "conflation-and-merge": {
    s: "Combines overlapping data about the same real-world object from several sources into one record, choosing the best geometry and attributes and keeping the links back.",
    d: "Objects from different sources are matched by position, shape, name and type, scored for similarity and merged when above a threshold. Conflicts are resolved by source trust, freshness and completeness, field by field. The merged feature records its sources so changes can be traced. Geometry may be taken from one source and names from another. It is hard because matching is probabilistic, because errors create duplicates or wrongly merge neighbors, and because re-running must give stable identifiers.",
    k: ["Automatic merging with a high threshold vs manual review: automatic scales to the planet, but low-confidence matches need human review or a conservative default.", "Stable internal identifiers vs regenerating on each run: stable ids let downstream references persist, but need a matching step to carry them across rebuilds."],
    p: ["Merging two different shops in the same building into one hides one of them from search.", "Identifiers regenerated each build break saved places and links in client apps."],
    v: "Merge a labeled sample of overlapping features and confirm precision and recall of matches against the labels, and confirm the ids of unchanged features are identical between two consecutive builds.",
    dep: ["schema-mapping", "source-feeds", "provenance-and-licensing"]
  },
  "topology-validation": {
    s: "Checks the combined data for errors that break downstream use: disconnected roads, impossible geometry, overlaps, missing attributes and one-way contradictions.",
    d: "Rules run in bulk: roads that nearly touch but do not connect, islands in the road network, polygons that self-intersect, speeds or names that are implausible, one-way streets that trap vehicles. Results are scored by severity; blocking errors stop a build, while others are reported to editors. Checks run on changes and on the whole dataset, using spatial joins. It is hard because there are many rules, because rare real conditions look like errors, and because feedback to the data source has to be sent in a form that gets fixed.",
    k: ["Blocking the build on errors vs reporting and continuing: blocking keeps bad data out of production, but one error could stall a planet update.", "Fixing automatically vs reporting only: automatic fixes are fast, but may change something that was correct and are hard to audit."],
    p: ["A rule too strict for a real-world special case blocks every release until someone adds an exception.", "A road disconnected by one missing node makes a whole neighborhood unreachable."],
    v: "Inject known faults, such as a gap in a road and a self-intersecting polygon, into a test region and confirm each is detected, classified correctly and, if blocking, stops the build.",
    dep: ["conflation-and-merge", "feature-store"]
  },
  "boundary-import": {
    s: "Brings in administrative areas such as countries, regions, cities and postal zones as polygons with hierarchy, names and codes, used for search, display and rules.",
    d: "Boundaries come from authoritative and community sources and must nest correctly: a city inside a region inside a country. The importer cleans geometry, aligns shared edges so there are no gaps, assigns levels and codes, and stores names in many languages. Disputed areas get policy-based treatment, possibly different per viewer region. It is hard because boundaries change, because adjacent polygons never agree perfectly in raw data, and because displaying a border is a political act.",
    k: ["Shared-edge topological storage vs independent polygons: shared edges prevent gaps and simplify consistently, but are harder to build and update.", "One version of disputed borders vs per-viewer versions: one is simpler, but per-viewer follows the legal rules of each country in which the service operates."],
    p: ["Gaps between neighboring polygons make a point on the border belong to no city.", "Showing a border in one way for all users causes a legal problem in a country that requires another."],
    v: "Run a point-in-polygon check over a grid of points and confirm every land point belongs to exactly one polygon per level, nesting is consistent, and a disputed area renders as the policy specifies per region.",
    dep: ["source-feeds", "conflation-and-merge", "provenance-and-licensing"]
  },
  "address-point-import": {
    s: "Loads house-level address points from authoritative registers and community data, with number, street, unit and postal code, normalized and linked to streets and buildings.",
    d: "Address points give an exact location for a number. The importer normalizes components, validates against the street and postal data, links each point to its street, building or parcel, and detects duplicates across sources. Units within a building and entrances are handled where data exists. Coverage varies greatly by country. It is hard because address formats differ, because points can be at the centroid of the parcel rather than the entrance, and because registers update on their own schedule.",
    k: ["Parcel centroid vs entrance location: centroids exist almost everywhere, but entrances are what delivery and navigation need.", "Authoritative register first vs the freshest source first: registers are consistent and legal, while community data is often newer for new buildings."],
    p: ["A point at the center of a large parcel sends deliveries across a field instead of to the gate.", "Street names that differ between the register and the road data stop the point from linking to its street."],
    v: "Import a country's register and confirm every point links to a street within a tolerance distance, report unlinked ones, and geocode a sample of addresses to verify entrance-level accuracy where entrance data exists.",
    dep: ["schema-mapping", "source-feeds"]
  },
  "poi-feed-import": {
    s: "Loads points of interest such as shops, restaurants and services from business data providers and open data, with categories, hours, contact details and quality scores.",
    d: "Feeds provide millions of records with names, addresses, categories, phone numbers, opening hours and sometimes ratings. The importer maps categories to a common taxonomy, geocodes records that lack coordinates, deduplicates against existing places, and scores freshness and reliability. Closed businesses must be removed. It is hard because the data decays fast, as businesses open and close constantly, and because duplicate and fake listings degrade search.",
    k: ["A fixed category taxonomy vs the providers' categories: a fixed one gives consistent search and display, but loses provider-specific detail.", "Removing places not confirmed recently vs keeping them: removal reduces closed places, but also drops real places with stale records."],
    p: ["Closed businesses staying in the data send customers to an empty storefront.", "Merging chains' branches by name collapses many locations into one."],
    v: "Sample five hundred imported places across categories, check each against reality or an independent source, and confirm the share that are open, correct and correctly categorized meets the quality target.",
    dep: ["schema-mapping", "conflation-and-merge", "forward-geocoder"]
  },
  "user-error-reports": {
    s: "Collects reports of wrong data from users and drivers, such as a missing road or a bad turn instruction, and routes them to review and to the data sources.",
    d: "Reports arrive from in-app buttons, support and navigation traces where drivers consistently deviate from the route. Each is deduplicated, located on the map, classified, and prioritized by number of reports and potential harm. Many are fixed by editors, some are passed upstream, and some are rejected with a reason. Fixed items close the loop to the reporter. It is hard because reports are often vague and wrong, because volume is high, and because fixing in one place must not be overwritten by the next import.",
    k: ["Treating deviations in traces as implicit reports vs waiting for explicit ones: implicit finds errors nobody reports, but needs filtering since drivers deviate for many reasons.", "Local corrections that persist across imports vs fixing only upstream: local fixes are immediate, but need an override layer and a way to retire them."],
    p: ["A fix applied locally is overwritten at the next import because it was not recorded as an override.", "Acting on a single unverified report closes a road that is open."],
    v: "Submit a test report for a wrong turn restriction, follow it through review, and confirm the correction appears in a later build, routes change as expected, and the reporter is notified.",
    dep: ["conflation-and-merge", "topology-validation", "incremental-updates"]
  },
  "graph-extraction": {
    s: "Reads the merged map and produces the routable network: road pieces as edges, junctions as nodes, with only the features and attributes that routing needs.",
    d: "The extractor selects drivable and walkable ways, splits them at every junction, assigns nodes with coordinates, and copies attributes: class, speed, access, surface, names, restrictions, tolls. Roads that intersect without a connection, such as a bridge over another road, are not joined. Profiles filter what each mode sees. Output is deterministic so builds can be compared. It is hard because the geometry is only implicitly a graph, because connectivity rules depend on tagging, and because a single wrong connection creates routes through walls.",
    k: ["Splitting ways at every junction vs at only the shared nodes: every junction is simple and general, but only shared nodes gives fewer edges and a smaller graph.", "One graph for all modes vs one per mode: one is compact and simple to update, but separate graphs are faster and avoid cross-mode leakage."],
    p: ["Connecting two roads that cross on different levels creates a junction in the middle of a flyover.", "Dropping access attributes while extracting makes restricted roads open to everyone."],
    v: "Extract a test city and confirm the node and edge counts match a reference, the connectivity of known flyovers and tunnels is correct, and routes between ten known pairs match the expected paths.",
    dep: ["topology-validation", "schema-mapping", "node-edge-model"]
  },
  "node-edge-model": {
    s: "The in-memory representation of the road network: nodes with coordinates, directed edges with costs and attributes, stored in compact arrays for fast traversal.",
    d: "Edges are stored in compressed sparse row form: for each node, a contiguous block of outgoing edges with target, cost, flags and an index into geometry. Reverse adjacency is kept separately for backward search. Attributes that are not needed in the hot loop live in side tables. Ids are dense integers, so arrays replace hash tables. It is hard because memory layout dominates query speed, because a continental graph has hundreds of millions of edges, and because the layout must serve both build and query.",
    k: ["Compact arrays by dense id vs pointer-based objects: arrays are cache-friendly and small, but a change in topology needs a rebuild, not an insert.", "Separate hot and cold attribute storage vs one record per edge: separation keeps the search loop in cache, but complicates code that needs both."],
    p: ["Using wide records for each edge pushes the graph out of RAM and the machine begins paging.", "Renumbering nodes after a build without updating side tables corrupts attributes."],
    v: "Load the graph, traverse every edge and compare totals of length and count with the build report, and measure bytes per edge against the memory budget.",
    dep: []
  },
  "degree-two-contraction": {
    s: "Removes nodes that have exactly one way in and one way out, merging their edges into longer ones while keeping the full shape for display, to shrink the graph.",
    d: "Many nodes only exist to give a road its curve. They cannot be turn choices, so the graph can drop them and keep the geometry as a polyline attached to the merged edge. The result is often half the size, which speeds up everything after it. Merging requires the attributes of the combined pieces to match, such as speed and class, or the edge is kept separate. It is hard because attribute changes along the way, such as a change in speed limit, must be preserved.",
    k: ["Merging edges with differing attributes by averaging vs keeping them separate: averaging shrinks the graph further, but corrupts speed or access that changes mid-road.", "Keeping the dropped nodes' geometry on the edge vs discarding: keeping supports drawing and snapping, but increases storage."],
    p: ["Merging across a speed limit change makes the whole stretch use one speed and misestimates the time.", "Dropping a node where an address or a signal is attached loses that data."],
    v: "Compare the graph before and after contraction by routing ten thousand random pairs and confirm identical costs, and report the reduction in node and edge counts.",
    dep: ["node-edge-model", "graph-extraction"]
  },
  "edge-based-expansion": {
    s: "Transforms the graph so each road piece becomes a node and each allowed turn becomes an edge, which lets turn costs and restrictions be modeled exactly.",
    d: "In the edge-based graph, a node represents a directed road piece, and an edge represents the transition onto the next piece, carrying the turn cost and absent where a turn is forbidden. A search over this graph then handles restrictions and penalties without special cases. The graph is larger, often two to three times, and hierarchical preprocessing works unchanged on it. It is hard because the size increase pushes memory limits, and because distinguishing the original geometry from the expanded structure complicates path unpacking.",
    k: ["Edge-based graph vs node-based graph with turn tables: edge-based is conceptually simple and correct for all restrictions, but uses more memory.", "Expanding every junction vs only those with restrictions or costs: selective expansion saves memory, but complicates the model and the code."],
    p: ["U-turns allowed by an unrestricted expansion send routes into a dead end and back.", "Mapping expanded paths back to original road pieces for instructions loses the junction details."],
    v: "Route across junctions with banned left turns and compare against a node-based search with turn tables on ten thousand pairs, confirming identical costs and no forbidden transitions.",
    dep: ["node-edge-model", "turn-restrictions", "turn-cost-model"]
  },
  "spatial-snap-index": {
    s: "A spatial index over road geometry that returns the nearest edges to any coordinate in microseconds, used to attach points to the graph.",
    d: "Edge segments are stored in a structure such as an R-tree or a regular grid, organized so a point query touches a handful of nodes. Queries return edges within a radius with distance and projection position. The index is memory-resident and read-only after build, and may be sorted along a space-filling curve for locality. It serves routing, map matching, reverse geocoding and probe processing. It is hard because query volume is very high, and because corridors with many parallel roads need good tie-breaking.",
    k: ["R-tree vs uniform grid: an R-tree adapts to density and wastes little, while a grid is faster and simpler where density is even but suffers in cities.", "Indexing every segment vs only simplified edge geometry: every segment is accurate at high zoom, and simplified is smaller but may snap to the wrong side."],
    p: ["A grid cell size tuned for rural areas makes city queries scan thousands of segments.", "An index built from a different geometry version than the graph attaches points to edges that no longer exist."],
    v: "Query one million random points against the index and a brute-force scan on a sample and confirm identical nearest edges, then measure per-query time against the target.",
    dep: ["node-edge-model", "graph-extraction"]
  },
  "speed-limit-inference": {
    s: "Fills in missing speed limits by combining posted values nearby, road class, country and area rules, and observed speeds, flagging inferred values as such.",
    d: "Many roads carry no speed tag. Inference rules look at neighbors along the same road, the class and the urban or rural setting, and apply the legal defaults of the country. Probe data refines or overrides them where observed speeds are consistent. Results are stored with their source so users and editors can tell. It is hard because legal defaults depend on context, such as a built-up area or a residential zone, and because wrong values directly change routes and ETAs.",
    k: ["Legal defaults by class vs learned values from observation: defaults are explainable and always available, while observation captures reality but is absent on quiet roads.", "Smoothing along a road from neighbors vs treating each piece alone: smoothing fills gaps sensibly, but can carry a limit across a real change."],
    p: ["Applying the rural default on a street in a school zone makes it look fast and attractive for routing.", "Inferred values treated as posted ones are shown to the driver as the limit."],
    v: "Hold out posted limits on a sample of roads, run the inference and compare, confirming accuracy by class and region meets the target and every inferred value is flagged with its source.",
    dep: ["schema-mapping", "historical-speed-profiles"]
  },
  "lane-and-sign-data": {
    s: "Detailed attributes of junctions: lane counts and arrows, which lanes lead where, signs, exit names and shields, used for clear guidance in instructions.",
    d: "Lane data describes at each approach how many lanes exist and which turns each allows, together with the destinations printed on signs and the route numbers. The builder attaches it to edges and turns so the instruction generator can say use the left two lanes. Coverage is patchy and costly to collect. It is hard because lane information must match the real road exactly, because it changes with roadworks, and because mistakes are directly dangerous when a driver acts on them.",
    k: ["Using lane data only where verified vs inferring it from road geometry: verified is reliable but sparse, and inferred covers more but invents guidance that might be wrong.", "Sign text as stored vs normalized: stored matches what the driver reads, but is inconsistent for matching and localization."],
    p: ["Outdated lane guidance after roadworks tells drivers to get in a lane that no longer turns.", "Sign destinations in one language shown to a visitor who cannot read it."],
    v: "Drive a test route through ten multi-lane junctions and confirm the lane guidance and sign names in the instructions match what is physically there, and no guidance is given where data is absent.",
    dep: ["graph-extraction", "source-feeds"]
  },
  "region-stitching": {
    s: "Joins separately built regional graphs along their borders, matching nodes and edges across the seam so routes can cross regions as if there were one network.",
    d: "Large maps are built by region for parallelism and ownership. Each region's graph includes border nodes with stable identifiers. Stitching matches roads that leave one region and enter another, reconciles attributes, and builds either one merged graph or a cross-region overlay for the orchestrator. It is hard because regions may be built from different data versions, because roads are named and classified differently across borders, and because a mismatch at a seam can disconnect a whole region.",
    k: ["Merging into one global graph vs routing across separately served regions: one graph is simplest to query, but needs a huge machine, while separate regions scale out and need border handling.", "Overlapping regions by a margin vs exact borders: overlap makes seams easy to match, but duplicates data and risks inconsistency."],
    p: ["A road that stops exactly at the border in one region and is a hundred meters off in the neighboring one is not connected.", "Building neighboring regions from different data versions makes border roads disagree."],
    v: "Route between ten pairs of points on opposite sides of each border type and confirm the routes cross at the real crossing, with costs equal to a route computed on a single merged graph.",
    dep: ["graph-extraction", "regional-sharding", "data-versioning-and-rollout"]
  },
  "node-ordering": {
    s: "Computes the importance ranking of nodes used to build contraction hierarchies, so contraction adds few shortcuts and queries stay small.",
    d: "Importance combines several estimates: how many shortcuts contracting a node would add versus the edges it removes, how many neighbors have been contracted, and how deep the node sits in the hierarchy. A priority queue contracts the least important first and updates neighbors lazily. Alternatively, nested dissection uses graph separators for a good ordering that also supports fast customization. It is hard because ordering quality is decisive, yet tuning needs experiments on real graphs, and it takes most of the preprocessing time.",
    k: ["Greedy local importance vs separator-based ordering: greedy is simple and works well on road graphs, while separators allow cost updates without a full reorder.", "Lazy priority updates vs exact recomputation: lazy is much faster to compute, but yields a slightly worse ordering."],
    p: ["A poor ordering on a dense city causes shortcut counts to explode and preprocessing to run out of memory.", "Not reusing the ordering when only costs change repeats hours of work."],
    v: "Build hierarchies with the ordering on a test region and report shortcut count and average search space, confirming they are within a factor of the known best for similar graphs.",
    dep: ["node-edge-model"]
  },
  "graph-serialization": {
    s: "Writes the finished graph and its precomputed data to disk in a layout that can be memory-mapped directly, so servers start instantly and share pages between processes.",
    d: "Arrays of nodes, edges, shortcuts, geometry and indexes are written with alignment, a header giving versions, sizes and checksums, and no pointers, only offsets. A server maps the file and starts answering immediately, and several processes share the same physical memory. Files are written once and never modified. It is hard because the format must be versioned against the reading code, because disk layout affects cache behavior at query time, and because files are many gigabytes.",
    k: ["Memory-mappable flat layout vs a parsed in-memory structure: flat starts instantly and shares memory, but is harder to evolve and endian-sensitive.", "Compressing data on disk vs leaving it raw: compression saves storage and transfer, but costs CPU on every access or forces a decompress at load."],
    p: ["Loading a file written by a different format version produces garbage instead of an error without a version check.", "A truncated copy of a multi-gigabyte file passes a size check and crashes the server at query time."],
    v: "Write, copy and load the graph on a clean server, verify the checksum, and confirm the process answers its first query within seconds of starting and memory is shared between two server processes.",
    dep: ["node-edge-model", "contraction-hierarchies"]
  }
});
