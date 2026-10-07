// Details for the map rendering & routing plate, part 5: update pipeline, infrastructure, cross-cutting concerns.
ATLAS.details("map-routing", {
  "build-orchestrator": {
    s: "Runs the dependency graph of build steps that turns fresh source data into tiles, routing graphs and search indexes, with retries, parallelism and a record of every run.",
    d: "A workflow engine models steps such as import, validate, extract, preprocess, build tiles and index, with the data each consumes and produces. It schedules them on the batch cluster, retries failures, resumes from the last good step, and stores intermediate outputs by content hash so unchanged work is skipped. Every run has a manifest naming inputs and outputs. It is hard because a full build takes many hours, because steps have different resource shapes, and because failures at the end must not force a restart from the beginning.",
    k: ["Content-addressed caching of step outputs vs always rebuilding: caching makes incremental builds cheap, but demands deterministic steps and correct dependency declarations.", "One monolithic pipeline vs independent pipelines for tiles, routing and search: one is consistent, but independent ones ship updates faster at the risk of mismatched data versions."],
    p: ["A nondeterministic step defeats caching so every build recomputes everything.", "A build that passes every step but mixes output from two different input snapshots ships inconsistent data."],
    v: "Run the pipeline twice on unchanged input and confirm the second run reuses cached steps and produces byte-identical outputs, then kill a worker mid-build and confirm the run resumes.",
    dep: ["batch-compute-cluster", "source-feeds", "pyramid-builder", "graph-serialization"]
  },
  "incremental-updates": {
    s: "Rebuilds only the parts of tiles, graph and indexes that are touched by changed data, so urgent fixes reach users in minutes rather than after a full build.",
    d: "Changes are mapped to affected tiles by geometry, to graph regions by edges, and to index documents by id. The pipeline rebuilds those pieces and patches the published artifacts. Tiles at lower zooms that contain the change are also rebuilt. Hierarchy and partition structures may need a local repair or a deferred full rebuild. It is hard because dependencies fan out unpredictably, and because the patched result must equal what a full rebuild would give, or the two drift apart.",
    k: ["Patching published artifacts vs publishing a whole new version: patching is fast, but accumulates differences from a clean build until a periodic full rebuild.", "Immediate application of edits vs batching them for a few minutes: immediate is fresher, while batching dedupes churn and allows validation."],
    p: ["An incremental update that misses the parent tiles leaves low zooms showing the old map.", "Patches applied without a clean rebuild occasionally drift until routing and tiles disagree."],
    v: "Apply a road change incrementally and also by full rebuild on a test region, then compare tiles, graph and index outputs for equality, and measure time from edit to visible change.",
    dep: ["change-diff-import", "pyramid-builder", "tile-invalidation", "geocoder-reindexing"]
  },
  "tile-invalidation": {
    s: "Marks tiles as outdated after a data change and gets caches to drop or revalidate them, so users see the update without waiting for lifetimes to expire.",
    d: "From the set of changed tiles the system issues purge requests to the edge, bumps a version marker for versioned URLs, or publishes a new archive. Purges are batched, rate-limited and ordered so that parents and children are consistent. Clients with long local caches are told through a version in the style or metadata. It is hard because there are many caches in different hands, and because purging too much throws away hit rate while too little leaves visible stale tiles.",
    k: ["Purge by tile list vs versioned URLs that make old tiles unreachable: purge keeps URLs stable, while versioned URLs never serve stale data, but need the client to learn the version.", "Invalidating the exact changed tiles vs a surrounding area: exact preserves cache, while a margin accounts for labels and buffers that extend past the changed geometry."],
    p: ["Forgetting that labels and buffers extend beyond a feature leaves a neighboring tile showing a half-old road name.", "Purging a large area at once sends all misses to the origin together and overloads it."],
    v: "Change one road, run invalidation and confirm the tile shows the change from a clean client and an edge in every region within the target time, while the cache hit ratio of other tiles stays unchanged.",
    dep: ["tile-cdn-caching", "incremental-updates"]
  },
  "geocoder-reindexing": {
    s: "Rebuilds or updates the place index from new data and swaps it in, so new addresses and names become searchable without disrupting live queries.",
    d: "Documents are generated from the merged data: normalized names, hierarchy, coordinates and signals. A bulk build writes a fresh index, which is warmed and validated before replacing the live one. Smaller changes can be applied as real-time updates to a running index and merged in the background. The index version must agree with the data version used for display. It is hard because the build is heavy, the swap must be atomic across replicas, and relevance can change unexpectedly with new data.",
    k: ["Blue-green index swap vs updating in place: a swap is safe and easy to roll back, but needs twice the storage briefly.", "Real-time document updates vs batch rebuilds only: real-time gives freshness within minutes, but adds complexity and slowly fragments the index."],
    p: ["Swapping an index that was never warmed makes the first minutes of queries slow.", "A bulk rebuild with a changed analyzer silently changes matching for every query."],
    v: "Build a new index, run the labeled query set against old and new, and confirm quality does not regress, then swap it under load and confirm no failed or slow queries.",
    dep: ["place-index", "build-orchestrator", "data-versioning-and-rollout"]
  },
  "data-versioning-and-rollout": {
    s: "Gives every published dataset a version, rolls it out gradually across servers and caches, checks health, and can return to the previous version quickly.",
    d: "A release bundles tile archive, routing graph, search index and style under one version identifier. Servers load the new version beside the old, and traffic is shifted progressively by region or percentage while automated checks compare errors, latency and result quality. The old version stays loaded until the rollout is confirmed. Response headers and logs carry the version. It is hard because components must switch consistently, clients may hold old data, and rollback has to include caches.",
    k: ["One version for all components vs independent versions: one guarantees the map, routes and search agree, but forces the slowest component to gate every release.", "Gradual rollout with automated gates vs all at once: gradual limits damage from bad data, but means two versions answer at once for hours."],
    p: ["Routing moves to the new graph while tiles remain on the old one, so the route line passes through a closed road.", "Rolling back servers without purging caches keeps serving the bad version's responses."],
    v: "Release a deliberately flawed test version to one region, confirm the automated gate halts the rollout, and that rollback restores the previous results from every server and cache.",
    dep: ["serving-autoscaling", "route-regression-testing", "observability-and-slos"]
  },
  "route-regression-testing": {
    s: "Compares routes and travel times from the new data against the current version over a large set of real trips, flagging changes that are large, odd or unexplained.",
    d: "A corpus of sampled origin-destination pairs is routed on both versions. Differences in duration, distance, geometry and instructions are computed and clustered. Large changes in a place where no edit was made point to a data or algorithm bug, while changes near known edits are expected. Reports show the worst cases on a map. It is hard because most differences are legitimate, because the corpus must cover many regions and modes, and because a human must be able to review results quickly.",
    k: ["Replaying real traffic samples vs synthetic pairs: real samples reflect what users ask, while synthetic pairs cover unusual areas that real data misses.", "Blocking on any large difference vs blocking on unexplained ones: blocking on all is safe but stalls releases, so differences are linked to the edits that cause them."],
    p: ["A corpus of mostly city trips misses a regression on rural roads.", "Thresholds set so loose that a single changed bridge is lost in the average."],
    v: "Introduce a deliberate error, such as a reversed one-way street, into a test build and confirm the comparison flags the affected trips and ranks them near the top of the report.",
    dep: ["routing-orchestrator", "build-orchestrator"]
  },
  "provenance-and-licensing": {
    s: "Tracks where every feature and attribute came from and under what license, so attribution is correct and data can be removed or restricted when terms require.",
    d: "Each record carries source identifiers and license class through merging and into published artifacts. The system can answer which features derive from a given source, and generate the attribution text for a region or product. If a source is withdrawn, affected features can be found and replaced. Licenses define what may be combined, cached, shown or sold. It is hard because merged features have several sources, because license terms interact, and because requirements differ by customer and country.",
    k: ["Feature-level provenance vs per-dataset records: feature-level supports precise removal, but multiplies metadata size and merge complexity.", "Separating restricted data into its own layer vs mixing: separation makes withdrawal and license rules easy, but needs more complex tiles and graph builds."],
    p: ["A restricted source merged into the main dataset with no tag cannot be removed without a full rebuild.", "Attribution text missing for a region in the client fails a license obligation."],
    v: "Pick a source, query every feature derived from it, remove it in a test build, and confirm that no feature, tile or index entry still carries its data and the attribution list updates.",
    dep: ["source-feeds"]
  },
  "feature-store": {
    s: "The spatially indexed database of every map feature with attributes and history, the master copy from which tiles, graph and search index are all derived.",
    d: "Features are stored with geometry, attributes, stable identifiers and version history, partitioned and indexed by space. It must support bulk scans for builds, fast spatial queries for on-demand tiles and editors, and applying change streams. It may combine a relational spatial database for editing with columnar files for batch reads. It is hard because of the size, planet scale at tens of terabytes with history, and because many consumers read it at once while changes arrive.",
    k: ["A spatial database for everything vs columnar files for batch plus a database for edits: one system is simpler, but the split lets scans run fast without loading the editing store.", "Keeping full history vs current state only: history supports audit and rollback, but multiplies storage and slows queries unless separated."],
    p: ["Heavy build scans on the same database as live tile generation slow user requests.", "Dropping history makes it impossible to trace when a wrong road was introduced."],
    v: "Run a full-planet scan while serving on-demand tiles and confirm tile latency stays within budget, and retrieve the history of one feature showing each change with its source and time.",
    dep: ["batch-compute-cluster"]
  },
  "mmap-graph-serving": {
    s: "Serves routing straight from memory-mapped graph files, so startup is quick, data is shared between processes and the operating system manages what stays resident.",
    d: "Server processes map the serialized graph read-only. The first queries fault pages in from disk; hot parts of the hierarchy stay resident. Several worker processes on one machine share the same pages. Warmup touches all pages before traffic arrives. Updates map a new file and switch. It is hard because the working set must fit in RAM or tail latency spikes, because page faults are invisible in application metrics, and because a file replaced under a running process can crash it.",
    k: ["Memory-mapped files vs loading into process memory: mapped is shared and starts instantly, while loaded memory gives predictable latency but multiplies per-process use.", "Locking pages into RAM vs letting the operating system decide: locking guarantees latency, but fails the process when memory is short."],
    p: ["A cold server after a deploy has slow first queries because pages were never touched.", "Overwriting a mapped file in place crashes running processes with bus errors."],
    v: "Start a server, run warmup, then load test and confirm the major fault rate is near zero and tail latency stays within budget; replace the file by atomic rename and confirm no crash.",
    dep: ["graph-serialization", "serving-autoscaling"]
  },
  "regional-sharding": {
    s: "Splits serving by geography so each group of servers holds only the data for a set of regions, with a router sending each request to the right group.",
    d: "A continental graph with several profiles does not fit one machine comfortably, and users mostly travel locally. Regions are assigned to server pools sized to demand. A front router inspects the coordinates and forwards, and for routes crossing regions, the orchestrator uses border handling or a coarse overlay. Hot regions get more replicas. It is hard because load is uneven, because long routes involve several shards, and because shard boundaries shift as data grows.",
    k: ["Geographic shards vs replicating the full dataset on every server: geographic fits memory and caches better, but cross-region requests are complicated and load is uneven.", "Fixed region borders vs dynamic assignment by load: fixed is simple and cache-friendly, while dynamic balances load and moves data around."],
    p: ["A single metro area's evening traffic overwhelms its shard while others are idle.", "A request spanning three shards fails entirely when one shard is slow."],
    v: "Load test a rush-hour pattern concentrated on one metro and confirm its shard scales out without affecting others, and a cross-border route returns correctly while one neighbor shard is degraded.",
    dep: ["mmap-graph-serving", "serving-autoscaling"]
  },
  "batch-compute-cluster": {
    s: "A pool of machines for the heavy offline work: importing data, preprocessing graphs, building tiles and indexes, with scheduling and temporary storage.",
    d: "Jobs vary: tile building is parallel across many small tasks, graph preprocessing needs a few machines with a lot of memory, and imports need fast storage. The cluster schedules by resource shape, uses cheaper interruptible capacity where jobs can restart, and keeps intermediate data on fast storage close to compute. Costs concentrate in a few large builds each day. It is hard because resource shapes conflict, preemptions waste progress, and capacity must handle peaks without sitting idle.",
    k: ["Interruptible machines vs on-demand: interruptible are far cheaper, but jobs need checkpoints to avoid losing hours of work.", "A shared cluster vs dedicated machines for the build: shared uses capacity well, but a long build can be starved by other jobs and miss a release window."],
    p: ["A memory-hungry preprocessing job lands on a small machine and fails after hours.", "Checkpoints written to slow shared storage make the build slower than recomputing."],
    v: "Run a full build on interruptible capacity with random preemptions and confirm it completes with outputs identical to an undisturbed run, and report cost and wall time against the budget.",
    dep: []
  },
  "serving-autoscaling": {
    s: "Adds and removes serving capacity with demand and prepares new instances so they take traffic only once their data is loaded and warm.",
    d: "Metrics such as queue depth, latency and CPU drive scaling decisions per service and shard. New instances load graphs and indexes, run warmup queries, and only then register with the load balancer. Scale-down drains in-flight requests. Predictive scaling anticipates daily commute and event peaks. It is hard because startup takes minutes for large data, so reactive scaling is too slow for sudden spikes, and because scaling tile servers, routers and routing engines have very different shapes.",
    k: ["Predictive scaling on daily patterns vs reactive on live metrics: predictive prepares ahead for known peaks, but misses unexpected events that reactive catches late.", "Keeping spare warm capacity vs scaling from zero: spare gives resilience and quick response, but pays for idle machines."],
    p: ["An instance added to the pool before warmup serves its first requests ten times slower and fails health checks.", "Scaling on average CPU misses a queue building on a hot shard."],
    v: "Double the request rate within a minute in a load test and confirm latency stays within budget using spare capacity while new instances warm, and verify scale-down drains without errors.",
    dep: ["observability-and-slos"]
  },
  "observability-and-slos": {
    s: "Measures what users experience, such as tile latency, route success and ETA accuracy, with alerting on objectives, and traces that explain slow or wrong requests.",
    d: "Metrics are collected per endpoint, region and data version: latency percentiles, error rates, cache hit ratios and queue depths. Quality signals go beyond uptime: the share of routing requests that return a route, the ETA error against completed trips, and geocoder results that users select. Distributed traces follow a request across services. Alerts fire on burn rate against objectives. It is hard because quality failures such as a wrong route return successfully, and because data and code changes both cause regressions.",
    k: ["Service-level objectives on user outcomes vs on infrastructure metrics: outcomes catch what users feel, but need indirect measures and are noisier.", "Tagging every metric by data version vs not: tags make a bad release obvious, but multiply series and cost."],
    p: ["A healthy dashboard hides that one region's routes all take a detour because the data was wrong.", "High-cardinality labels such as coordinates in metrics overwhelm the monitoring system."],
    v: "Deploy a data version that degrades routes in one region and confirm an alert fires on the quality signal within minutes, naming the region and version, even though error rates and latency are normal.",
    dep: []
  },
  "coordinate-systems-and-precision": {
    s: "Every layer must agree on datums, projections, units and the precision of stored coordinates, because small mismatches become visible offsets and wrong distances.",
    d: "Source data arrives in many datums and projections and is converted to one working datum, with a projection for tiles and different calculations for distances on the globe. Coordinates are stored as integers at a chosen resolution, which sets the accuracy at the edge. Antimeridian crossing, poles and wraparound need explicit handling in every algorithm. Elevation uses a vertical reference. Decisions made here propagate into tiles, graph snapping, geocoding and matching, and are costly to change after data is built.",
    k: ["Integer fixed-point coordinates vs floating point: integers are compact, exact and comparable across machines, but fix a resolution and need conversions everywhere.", "Distance on the sphere or ellipsoid vs in projected space: spherical formulas are right everywhere, while projected ones are quick and distort away from the equator."],
    p: ["A source in a different datum is loaded without conversion and appears shifted by tens of meters.", "Routes and bounding boxes that cross the antimeridian invert and cover the wrong half of the world."],
    v: "Load control points with surveyed positions through the whole pipeline and confirm each appears within the allowed error in tiles, snap results and geocodes, including points near the antimeridian and a pole.",
    dep: []
  },
  "data-freshness": {
    s: "How quickly a change in the world reaches users shapes the architecture of ingestion, builds, caches and rollouts, and different data types need different answers.",
    d: "Traffic must be live within a minute, closures within minutes, road edits within hours, the base map within days, and imagery within months. Each target dictates a different pipeline: streaming for traffic, incremental patches for edits, full rebuilds for the rest. Caches and offline packages lengthen the delay seen by users. Tight freshness raises cost and risk: more validation is skipped, and more systems hold partial states. The target should be set per data type, measured end to end and published.",
    k: ["Streaming and incremental updates vs periodic full builds: streaming is fresh and complex, while periodic is simple, consistent and stale between builds.", "One freshness target for all data vs per type: one is simple to explain, but forces the expensive path on data that does not need it."],
    p: ["Measuring freshness at the database rather than at the user hides hours of delay in caches.", "Promising minute-level updates without validation lets a vandalized edit reach every route."],
    v: "Make a marked change at the source for each data type and measure the time until it appears to a real client, and confirm each stays within its stated target across ten trials.",
    dep: []
  },
  "latency-budgets": {
    s: "Each request type gets a time budget split among its stages, and the architecture is chosen to fit: tiles in milliseconds from cache, routes in tens, matrices in seconds.",
    d: "Interactive use sets the limits: autocomplete under about fifty milliseconds, tiles that feel instant, routes under a few hundred milliseconds, navigation reroutes within a second or two. Budgets are divided among network, queueing, snapping, search, and response formatting, and each component is measured against its share. Precomputation, caching and sharding exist mainly to meet them. Tail latency matters more than the average, since one slow tile or route is what a user notices.",
    k: ["Optimizing for tail percentiles vs the median: tail targets force hedging, load shedding and warm capacity, but the median is what is cheap to tune.", "Rejecting slow requests early vs trying to finish them: rejecting protects everyone else, but gives some users an error where waiting would have worked."],
    p: ["Measuring only the median hides that one request in a hundred takes several seconds.", "A budget not split by stage leaves no one responsible when the total slips."],
    v: "Load test each endpoint at expected peak and confirm the ninety-ninth percentile is within its budget, with a per-stage breakdown showing each component's share.",
    dep: []
  },
  "location-privacy": {
    s: "Search terms, routes and position traces reveal where people live, work and go, so collection, retention, access and aggregation are designed to expose as little as possible.",
    d: "Queries and routes often include a home or workplace; probe data shows movement. Practices include not tying requests to accounts where unnecessary, short log retention, trimming and coarsening stored locations, aggregation thresholds before publishing traffic, and strict internal access with audit. On-device routing keeps trips local. Legal requirements vary by region. It is hard because the same data that improves the service is the most sensitive, and anonymized traces are often re-identifiable.",
    k: ["Collecting detailed data to improve quality vs minimizing collection: detail improves maps and traffic, but increases risk and legal exposure.", "Processing on the device vs on the server: on-device keeps trips private, but limits what shared services can learn and improve."],
    p: ["Debug logs containing full routes retained for months become the most sensitive data the company holds.", "Anonymized traces with long unbroken paths can still be linked to a home address."],
    v: "Audit the stored data and logs of a test account's day of use, and confirm raw positions are absent or coarsened past the retention limit, and that access attempts by unauthorized roles are denied and recorded.",
    dep: []
  },
  "licensing-and-attribution": {
    s: "Map data is combined from sources with conflicting license terms, and what may be shown, cached, mixed or resold shapes the data model, the build and the user interface.",
    d: "Open licenses may require attribution or sharing derived data; commercial ones may limit storage, caching duration, offline use or redistribution; government data may restrict specific uses. These rules decide whether sources can be merged into one dataset or must be kept as separate layers, how long tiles can be cached, and what text appears on screen. The interface must always show required attributions. It is hard because obligations differ by customer plan, and violations are discovered late and expensively.",
    k: ["A single merged dataset vs separate layers per license: merged is simpler and faster to serve, but one restricted source can taint everything.", "Showing attribution in the map corner vs in a linked page: the corner is clearer and meets most terms, but takes space and must adapt to small screens."],
    p: ["Attribution hidden by an app's own overlay breaches the data license.", "Caching tiles from a restricted source for longer than the license allows."],
    v: "Check the attribution text shown in every client against the list of sources in the viewport region, and confirm license rules, such as the cache lifetime limits for restricted layers, are enforced in headers.",
    dep: ["provenance-and-licensing"]
  },
  "ground-truth-errors": {
    s: "The map is a model of a changing world and is always partly wrong. The architecture assumes errors exist and is built to find, contain and correct them.",
    d: "Roads are built, closed and renamed daily; sources disagree; mistakes and vandalism enter the data. Consequences differ by layer: a wrong label is cosmetic, a wrong turn restriction is illegal, a missing bridge sends trucks the wrong way. The design answers this with validation, confidence on every result, user reports, comparison of routes against real traces, regression testing, and fast correction paths. Knowing which errors are tolerable determines how much each stage may trust its input.",
    k: ["Trusting recent edits quickly vs holding them for validation: fast trust corrects errors sooner, but spreads vandalism, while holding delays real fixes.", "Reporting uncertainty in results vs presenting every answer with equal confidence: uncertainty is honest and helps apps decide, but complicates the interface."],
    p: ["Treating the map as correct causes a confident instruction to go the wrong way down a one-way street.", "Fixing individual errors without finding the data pattern behind them leaves the same error elsewhere."],
    v: "Compare a sample of computed routes with the paths actually driven by users along the same trips, and confirm deviations are measured, clustered and traced to data errors that are fixed in the next release.",
    dep: []
  }
});
