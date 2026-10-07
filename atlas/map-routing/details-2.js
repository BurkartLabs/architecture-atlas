// Details for the map rendering & routing plate, part 2: route planning services, algorithms, costs.
ATLAS.details("map-routing", {
  "routing-orchestrator": {
    s: "Coordinates one routing request: snaps points, selects the profile and data version, runs the search, handles alternatives and failures, and assembles the response.",
    d: "The orchestrator is the service's brain for a request. It validates input, snaps each coordinate to candidate road positions, picks the right graph for the profile and region, calls the search for each leg, and merges the results. It applies time budgets, falls back from a fast method to a slower one when a query is outside what was precomputed, and attaches warnings. It is hard because requests cross region boundaries, because options change which precomputed structure is usable, and because it must fail with useful errors.",
    k: ["Fast precomputed search with a slow fallback vs one method for everything: fast covers most traffic, but the fallback path is rarely exercised and often has hidden bugs.", "Routing across shards by stitching vs requiring a single graph: stitching scales memory, but long routes depend on correct border handling."],
    p: ["Requests with unusual options silently skip the fast path and take ten times longer than the budget.", "Routes that cross a shard border use inconsistent data versions on each side."],
    v: "Send one request in every option combination the API documents, including one that crosses a regional border, and confirm each returns within its time budget with the same data version on both sides of the border.",
    dep: ["snap-to-road", "vehicle-profiles", "route-options", "contraction-hierarchies", "regional-sharding"]
  },
  "snap-to-road": {
    s: "Maps a raw coordinate to nearby positions on the road graph, with the road, side and offset, choosing candidates that a vehicle could actually start or end on.",
    d: "A spatial index returns edges within a radius of the point. Candidates are filtered by profile access (no motorways for pedestrians), ranked by distance, and sometimes by heading if supplied. The result is a position along an edge, not just a node, so routes can start mid-block. Several candidates are kept so the search can pick the cheapest. It is hard because the nearest road is often wrong: a service road, a parallel street, a different level of a bridge, or a road across a barrier.",
    k: ["Snapping to the nearest edge only vs keeping several candidates: nearest is fast, but a wrong nearest edge makes the route start on the wrong side of a divided road.", "Large search radius vs small: a large one finds roads for imprecise points, but silently snaps points far from any road to something unrelated."],
    p: ["A destination in a car park snaps to the busy road behind the building and routes the user to the wrong entrance.", "A point in the middle of a lake snaps to a distant shore road without warning."],
    v: "Snap one hundred test points placed at known entrances and in open water, and confirm the entrances land on the intended road and side while the water points are reported as unsnappable beyond the radius.",
    dep: ["spatial-snap-index", "vehicle-profiles", "access-rules"]
  },
  "vehicle-profiles": {
    s: "Named bundles of rules and costs for each mode of travel, such as car, truck, bicycle and walking: which roads are allowed, how fast, and what is penalized.",
    d: "A profile defines which edge and turn attributes are usable, a speed model, penalties such as for unpaved surfaces or stairs, and size limits for vehicles with height, weight and axle load. Each profile may need its own preprocessed graph, since costs are baked into precomputed shortcuts. Profiles are data-driven so new modes can be added without changing the search. It is hard because every profile multiplies build time and memory, and truck routing depends on attributes that maps often lack.",
    k: ["A separate preprocessed graph per profile vs one graph with runtime weights: separate is much faster per query, but multiplies storage and build time.", "Few broad profiles vs many specific ones: few are easy to operate, but a bus, a van and a small truck have genuinely different rules."],
    p: ["A truck profile relies on height limits that are missing for most bridges, so it routes under bridges it cannot pass.", "Adding a profile without resizing build infrastructure delays every map update."],
    v: "Route the same pair of points with car, bicycle and walking profiles and confirm each respects its own access rules, for example the bicycle route using a path closed to cars and the car route using a motorway closed to others.",
    dep: ["edge-cost-model", "access-rules", "speed-model"]
  },
  "route-options": {
    s: "User-selectable constraints and preferences: avoid tolls, ferries or motorways, prefer fastest or shortest, add departure time, and exclude areas, applied to the search.",
    d: "Options change which edges are allowed or how they are weighted. Cheap ones, like adding a penalty, can be applied at query time; others, like avoiding all motorways, change the structure and may require a different precomputed graph or a slower search that skips marked edges. The orchestrator decides which path to take. Hard parts are combinations, each of which could need its own preprocessing, and communicating when an option makes a route impossible.",
    k: ["Query-time edge filtering vs a preprocessed graph per option: filtering supports any combination but is slower, while preprocessing is fast for the common few.", "Hard avoidance vs a soft penalty: hard rules never use an avoided road, but can make a destination unreachable where a penalty would allow a short unavoidable stretch."],
    p: ["An avoid-tolls option that returns no route instead of a route with one unavoidable toll leaves the user with nothing.", "Combining several options takes a slow path that times out under load."],
    v: "Request routes with avoid-tolls and avoid-ferries on a pair that has toll-free and ferry-free alternatives and confirm the geometry contains neither, and that an impossible case returns an explained result.",
    dep: ["edge-cost-model", "access-rules", "toll-and-fee-costs"]
  },
  "alternative-routes": {
    s: "Finds several sensible routes between the same points that differ meaningfully, rather than the best route plus near-copies that change one block.",
    d: "Alternatives come from methods such as penalizing edges of the first route and searching again, or combining forward and backward search trees to find via points that give different paths. Each candidate is checked for sharing too much with the best, for being too much longer, and for avoiding detours and sharp local zigzags. The rest are ranked and returned. It is hard because the definition of a good alternative is a human judgment, and the checks cost time relative to a single search.",
    k: ["Penalty-and-repeat vs via-point selection: penalty is simple and works with any engine, but gives routes shaped by the penalty, while via-points find genuinely different corridors.", "Limiting overlap strictly vs allowing shared stretches: strict gives clear choices, but where one bridge is the only crossing no alternative can exist."],
    p: ["Alternatives that differ by a few blocks show the user three identical lines.", "A candidate with a loop or a long detour passes the length test but is clearly silly."],
    v: "Request alternatives for ten city pairs and confirm each returned route shares less than the configured portion with the best, none exceeds the length bound, and none contains a self-intersection.",
    dep: ["bidirectional-search", "edge-cost-model", "routing-orchestrator"]
  },
  "multi-stop-optimizer": {
    s: "Chooses the order to visit a set of stops, and optionally assigns stops to several vehicles, using a travel-time matrix and heuristics, subject to windows and capacities.",
    d: "This is the traveling salesman and vehicle routing family. The optimizer asks the matrix service for pairwise times, builds an initial tour with a construction heuristic, and improves it with local search moves such as swapping and reversing segments. Constraints include time windows, load limits, breaks and priorities. Exact solutions are infeasible beyond a few dozen stops, so quality is bounded by a time limit. It is hard because real problems have many constraints and users expect results in seconds.",
    k: ["Heuristic local search with a time limit vs exact solvers: heuristics give good answers for hundreds of stops quickly, but give no guarantee of optimality.", "Optimizing on straight-line distance vs a real road matrix: straight-line is free, but orders stops badly across rivers and one-way grids."],
    p: ["Ignoring time windows in the objective produces a tour that is short but arrives after a shop closes.", "Using stale matrix times from off-peak hours yields a rush-hour plan that cannot be met."],
    v: "Solve a fifty-stop instance with known best solution and time windows, and confirm the result satisfies every window and is within a few percent of the best known total time within the time limit.",
    dep: ["matrix-endpoint", "many-to-many-search", "travel-time-estimator"]
  },
  "map-matching": {
    s: "Takes a noisy sequence of position fixes and finds the most probable path along the road network that explains it, producing a clean trace and the roads traveled.",
    d: "For each fix, candidate road positions are found nearby. A hidden Markov style model scores each candidate by how close it is to the fix (emission) and how plausible the movement from the previous candidate is, comparing network distance against straight-line distance (transition). A search over the lattice picks the best sequence. Outputs include matched geometry, confidence, and speeds. It is hard because errors are correlated, because gaps in data need interpolation, and because it must run on millions of traces.",
    k: ["Probabilistic global matching vs greedy nearest-road snapping: global is far more accurate at junctions and parallel roads, but costs several routing queries per point.", "Offline matching with the whole trace vs online matching with a short delay: offline is more accurate, online is required for live navigation with a lag of a few fixes."],
    p: ["Sparse traces with minutes between points match to a plausible but wrong path along a different road.", "Tuning noise parameters on city traces fails in tunnels and under dense buildings."],
    v: "Match one thousand traces recorded along known routes and confirm the proportion of correctly identified road segments, including through a tunnel and across parallel roads, meets the target.",
    dep: ["spatial-snap-index", "edge-cost-model", "dijkstra-search"]
  },
  "instruction-generator": {
    s: "Turns a path of edges into human directions: maneuvers, street names, distances, roundabout exits and lane guidance, localized and phrased for the situation.",
    d: "The generator walks the path, detects where the traveler must act by comparing the turn angle, road class, names and alternatives at each junction, and merges trivial continuations. Each maneuver gets a type, an angle category, a street name or reference, and a distance. Text and voice are produced from templates per language, with ordinals and units adapted. It is hard because good directions depend on what a person perceives: obvious forks need no instruction, ambiguous ones do, and naming data is inconsistent.",
    k: ["Structured maneuvers rendered by the client vs finished text from the server: structured allows localization and voice on-device, but each client needs the phrasing logic.", "Announcing every junction vs only ambiguous ones: every junction is safe but noisy, while only ambiguous is natural but depends on trusting the geometry."],
    p: ["Instructions that say turn left onto a street whose sign shows a different name confuse drivers.", "A roundabout with several close exits is described with the wrong exit number."],
    v: "Generate directions for a route through a roundabout, a complex junction and a ramp, and have a person follow the text without a map, confirming each maneuver is unambiguous and names match the signs.",
    dep: ["node-edge-model", "lane-and-sign-data", "edge-based-expansion"]
  },
  "dijkstra-search": {
    s: "The baseline shortest-path search: expand nodes in order of cheapest known cost from the origin until the destination is settled, using a priority queue.",
    d: "Starting at the origin, the algorithm repeatedly removes the cheapest unsettled node, relaxes its outgoing edges and updates neighbors. Edge costs must be non-negative. The search expands a disc of nodes around the origin whose size grows with the route length, so continental queries touch most of the graph. It remains the reference all faster methods are compared against, and is still used on small graphs, for isochrones and for verification. Its challenges are queue performance and memory locality on huge graphs.",
    k: ["Binary heap vs bucket or radix queue: a binary heap is simple and general, while buckets exploit integer costs for lower overhead on large graphs.", "Settled-set array vs hash set: arrays are far faster but need resetting per query, which is solved with version stamps."],
    p: ["Negative or zero edge costs from bad data break assumptions and produce wrong or non-terminating searches.", "Allocating fresh arrays per query makes it slow due to memory churn."],
    v: "Compare its results against an independent reference implementation on random pairs and confirm identical costs, and compare faster algorithms' results against it as the correctness oracle.",
    dep: ["node-edge-model", "edge-cost-model"]
  },
  "bidirectional-search": {
    s: "Runs one search forward from the origin and one backward from the destination and stops when they meet, expanding far fewer nodes than a single search.",
    d: "Two frontiers grow toward each other; each covers a disc of half the route length, which together is about half the area of one large disc. The stopping rule is subtle: the first meeting is not necessarily the shortest, so the search continues until the sum of the two queue minimums exceeds the best meeting found. The backward search uses the reversed graph, which has to be stored. It also underlies many faster methods, which add a restriction to each direction.",
    k: ["Alternating the directions strictly vs by queue size: strict is simple, but balancing by frontier size handles asymmetric graphs better.", "Storing the reverse graph vs computing predecessors on the fly: storing doubles edge memory but makes the backward search as fast as the forward one."],
    p: ["Stopping at the first meeting node returns a path that is sometimes longer than optimal.", "Time-dependent costs break the backward search because arrival time is unknown."],
    v: "Run it against plain Dijkstra on ten thousand random pairs and confirm identical path costs and a substantial reduction in settled nodes, with no query returning a longer path.",
    dep: ["dijkstra-search", "node-edge-model"]
  },
  "a-star-heuristics": {
    s: "Guides the search toward the destination using an estimate of remaining cost that never overestimates, so fewer nodes are expanded while the result stays optimal.",
    d: "Each node is prioritized by cost so far plus an estimate to the target. With a heuristic that never overestimates, the result is optimal. The simplest estimate is the straight-line distance divided by the maximum speed, which works but is weak on road networks where speeds vary. Better estimates use precomputed distances to landmarks. The search expands an elongated region toward the target. The challenge is that cost models with time, tolls or penalties make a simple geometric bound too loose to help much.",
    k: ["Geometric bound vs a precomputed bound: geometric needs no preprocessing, but a precomputed bound is much tighter and saves more work.", "A guaranteed-admissible heuristic vs an inflated one: inflated is faster, but returns routes that may be a few percent longer than optimal."],
    p: ["A heuristic that overestimates after a speed limit data change silently returns suboptimal routes.", "Using straight-line distance with a high maximum speed on a graph with slow roads expands nearly everything."],
    v: "Compare costs against Dijkstra on many random pairs and confirm they are identical, and check that settled node counts fall substantially, including after changing the speed model.",
    dep: ["dijkstra-search", "speed-model"]
  },
  "landmark-bounds": {
    s: "Precomputes distances from every node to a few well-chosen landmark nodes, then uses the triangle inequality to produce tight lower bounds for the search.",
    d: "A few dozen landmarks are chosen on the graph periphery. Distances to and from each are stored per node. During a query, the difference between a node's and the target's landmark distances gives a bound on remaining cost, which is used as the search heuristic. Preprocessing is light, and updates for changed costs are straightforward because bounds only need to stay valid, not exact. It is hard because the quality depends on landmark choice, and bounds weaken as live costs diverge from those used at preprocessing.",
    k: ["Few landmarks vs many: few save memory and preprocessing, many tighten the bounds but cost memory per node and time per evaluation.", "Landmarks computed on free-flow times vs on live times: free-flow is stable, but with congestion the bound stays valid yet looser, only requiring lower costs to remain correct."],
    p: ["Edge costs that drop below the preprocessed values after an update make bounds invalid and results wrong.", "Poor landmark placement leaves some regions with weak bounds and slow queries."],
    v: "Verify the bounds against exact distances for random node pairs and confirm none exceeds the true cost, then measure the settled-node reduction against plain A* with geometric bounds.",
    dep: ["a-star-heuristics", "graph-serialization"]
  },
  "contraction-hierarchies": {
    s: "Ranks nodes by importance, removes them one by one adding shortcut edges to preserve distances, then answers queries with two small searches that only climb the hierarchy.",
    d: "Preprocessing contracts the least important node first: for each pair of its neighbors, a shortcut is added if the path through the node is the only shortest one. The result is an upward graph and a downward graph. A query runs a forward search up from the origin and a backward search up from the target and meets at the top, touching a few hundred nodes. Queries take well under a millisecond on continental graphs. It is hard because preprocessing takes minutes to hours, and changing a cost means redoing it or using a customizable variant.",
    k: ["Fast queries and long preprocessing vs slower queries with cheap updates: contraction gives the best query time, but live traffic changes force recomputation or a different method.", "Shortcut unpacking at query time vs storing full paths: unpacking saves memory, and a recursive expansion recovers the path with little extra work."],
    p: ["A cost change on a heavily used edge invalidates thousands of shortcuts that depend on it.", "A poor node ordering creates a dense top of the hierarchy and queries slow by orders of magnitude."],
    v: "On ten thousand random pairs compare costs with Dijkstra for equality, and confirm query time stays under the target and the number of nodes settled per query is a small fraction of the graph.",
    dep: ["node-ordering", "bidirectional-search", "graph-serialization"]
  },
  "multilevel-partitioning": {
    s: "Splits the graph into nested cells with few boundary edges, precomputes distances across each cell's boundary, and recomputes only the affected cells when costs change.",
    d: "The graph is recursively partitioned into balanced regions minimizing cut edges. For every cell, a small matrix of costs between its boundary nodes is precomputed in a metric step that takes seconds. A query searches the original graph near the origin and target and the overlay of boundary matrices elsewhere. Because the structure depends on topology and costs are applied in a separate cheap step, updating traffic weights is fast. It is hard because query time is slower than contraction and partition quality drives performance.",
    k: ["Separating topology from costs vs baking costs into shortcuts: a separate metric step allows new costs in seconds, but queries are a few times slower than hierarchies.", "More levels with small cells vs fewer larger cells: more levels lower query work, but increase the size of the overlay and the cost of customization."],
    p: ["Poorly balanced partitions leave one huge cell that dominates both memory and customization time.", "Metrics customized with a version of costs older than the one used for queries produce inconsistent results."],
    v: "Change costs on a thousand edges, run the customization step and confirm completion within the target seconds, then compare query results to Dijkstra with the new costs for equality.",
    dep: ["graph-serialization", "node-edge-model", "live-weight-reload"]
  },
  "hub-labels": {
    s: "Stores for each node a small set of hub nodes and distances to them, so a query is a single merge of two sorted lists with no graph search at all.",
    d: "Every node keeps a label: hubs lying on shortest paths from it, with distances. For two nodes, the shortest distance equals the minimum over common hubs of the summed distances, found by merging two sorted arrays. Queries take microseconds. Labels are derived from a contraction hierarchy by a search per node. The cost is memory: labels may take gigabytes for a country and are rarely used for continents. They suit matrices and heavy query loads, and are inflexible when costs change.",
    k: ["Label lookup vs hierarchy search: labels are an order of magnitude faster per query, but need much more memory and a full rebuild when costs change.", "Storing only distances vs also path information: distances alone are compact and enough for matrices, while paths need extra pointers to unpack."],
    p: ["Labels built from yesterday's costs return confident but stale travel times after a traffic update.", "Memory use that fits a country fails to fit when a larger region is added."],
    v: "Compare label query results to hierarchy results over a million random pairs for equality, and confirm the measured per-query time is in microseconds and memory fits the allocation.",
    dep: ["contraction-hierarchies", "node-ordering"]
  },
  "many-to-many-search": {
    s: "Computes costs between every origin and every target in a set far faster than separate queries, by sharing backward search results across all sources.",
    d: "With a hierarchy, a backward upward search from each target is run once and its results stored in buckets at the nodes reached. Then, for each source, a single forward upward search scans buckets at each visited node to find the best target distances. Total work is about the number of sources plus targets times a small search, not their product. Output is a table. It is hard because bucket memory grows with the target count and because large tables stress memory bandwidth, not computation.",
    k: ["Bucket-based sharing vs running a separate point-to-point query per pair: sharing scales linearly with the size of each set, while pairwise scales with the product.", "Storing the whole table vs streaming rows to the caller: whole is simple, but streaming bounds memory for very large requests."],
    p: ["Targets clustered in one dense area create very large buckets at a few nodes and slow every source.", "Returning distance and duration as separate passes doubles the work unnecessarily."],
    v: "Compute a one hundred by one hundred table and confirm each cell equals an individual route query, then time it against ten thousand separate queries to confirm a large speedup.",
    dep: ["contraction-hierarchies", "snap-to-road"]
  },
  "isochrone-expansion": {
    s: "Runs a cost-bounded expansion from an origin, collecting every node reachable within the limit, which is then converted into the reachable area.",
    d: "The expansion is Dijkstra that stops when the next node exceeds the limit, recording each node's cost and, for edges partly within reach, the fraction reachable. Hierarchies cannot be used directly since the whole reachable set is needed, not one target, though some structures can accelerate it. The output feeds polygon construction. It is hard because the work grows with the area covered, so long time limits in dense cities visit millions of nodes, and because the result depends on traffic and time of day.",
    k: ["Exact expansion vs sampling the area with a grid of sampled targets: exact is accurate on the network, while sampling is cheaper and gives only an approximate boundary.", "Expanding in both directions for arrive-by catchments vs one: the reverse expansion answers who can reach here, which is a different question with different results on one-way streets."],
    p: ["Using a long limit from the center of a megacity expands most of the graph and exhausts memory on a small server.", "Forgetting partially reached edges leaves the polygon visibly shorter than the true reach."],
    v: "For random points on the polygon boundary route directly from the origin and confirm each travel time is within a small tolerance of the requested limit, and that points just outside exceed it.",
    dep: ["dijkstra-search", "edge-cost-model"]
  },
  "edge-cost-model": {
    s: "Defines the number the search minimizes for each road piece: usually travel time, combined with distance, penalties and preferences for a given profile and time.",
    d: "Cost is computed from edge attributes (length, speed, road class, surface, slope), the profile, and optional live data. A typical formula is time plus a distance factor plus penalties for tolls, turns, unpaved roads or crossing traffic lights. Costs are stored as integers for speed and determinism. All search algorithms and preprocessing depend on it, so any change means rebuilding. It is hard because a cost that is only minimum time gives routes people dislike, and because tuning for realism is subjective.",
    k: ["Pure travel time vs a blended cost with distance and preferences: pure time gives defensible ETAs, but blended cost matches how people actually choose routes at the price of cost not equaling time.", "Integer deciseconds vs floating point: integers make results identical across machines and enable fast queues, but limit the precision of very short edges."],
    p: ["Optimizing a blended cost but reporting the cost as the ETA gives wrong arrival times.", "A penalty large enough to forbid a road in practice makes the destination unreachable when it is the only access."],
    v: "Route one hundred sampled trips with the production cost model and compare each route to what a local driver would choose, and confirm reported durations are computed from time, not from blended cost.",
    dep: ["speed-model", "turn-cost-model", "toll-and-fee-costs"]
  },
  "turn-cost-model": {
    s: "Charges time for the maneuver between two edges: left turns across traffic, U-turns, signals and crossings cost more than going straight, so routes avoid needless turns.",
    d: "Turn cost is a function of the angle between the incoming and outgoing edges, whether the turn crosses oncoming traffic given the driving side, the presence of a signal or stop sign, and the road classes involved. It is added when the search passes through a node. Because it depends on two edges, not one, the search must run on an edge-based graph or add turn handling at nodes. It is hard because real delays depend on volume and signal timing, which maps rarely contain.",
    k: ["An angle-based generic penalty vs measured delays per junction: generic works everywhere, and measured delays are more accurate where data exists but are costly to gather.", "Edge-based expansion vs node-based search with turn lookups: edge-based is simple and exact but multiplies graph size, while lookups save memory with more complex code."],
    p: ["Treating all left turns the same ignores that they are free on a protected signal and costly across a busy road.", "Ignoring the driving side applies right-hand rules in left-driving countries."],
    v: "Route between two points where the shortest path needs a left turn across a busy road and confirm the planner prefers a slightly longer route with a right turn when the turn penalty is enabled.",
    dep: ["edge-based-expansion", "edge-cost-model"]
  },
  "turn-restrictions": {
    s: "Prohibits specific maneuvers, such as no left turn or no U-turn, that are illegal or physically impossible even when both roads are open to the vehicle.",
    d: "Restrictions are stored as relations naming the from-road, the via node or road, and the to-road, with a type (prohibited or mandatory) and sometimes a time condition or a vehicle class. The graph build converts them into forbidden transitions, either by splitting nodes or by marking edge pairs. Multi-edge restrictions, where the ban applies to a longer sequence, need extra care. It is hard because they are a leading source of illegal routes, because data is incomplete, and because a missing one is invisible until someone drives it.",
    k: ["Modeling restrictions in an edge-based graph vs handling them at query time: baked-in is correct and fast, but the larger graph costs memory.", "Treating missing data as allowed vs forbidden: allowed gives more coverage, and forbidden is safer but creates unreachable places."],
    p: ["A turn ban that applies only on weekdays gets treated as permanent or ignored entirely.", "Restrictions attached to a road that is later split are silently dropped."],
    v: "Select fifty known banned turns, route between their endpoints and confirm no returned route makes the forbidden maneuver, including multi-road restrictions and those that apply only to trucks.",
    dep: ["edge-based-expansion", "graph-extraction", "access-rules"]
  },
  "access-rules": {
    s: "Decides who may use each road piece: vehicle class, direction, permits, private or restricted access, seasonal closures, and time-of-day rules.",
    d: "Edges carry access tags per mode: allowed, forbidden, destination only, permit needed. They come from the source data with inheritance from road class and region defaults, then are evaluated per profile. One-way streets with exceptions for bicycles and bus lanes are typical. Conditional rules depend on time. The result decides which edges the search may use at all. It is hard because defaults differ by country, because tagging is inconsistent, and because mistakes either hide legal roads or send people onto banned ones.",
    k: ["Default allow vs default deny when tags are missing: allow gives complete routing, deny is safer for restricted modes such as trucks but leaves gaps.", "Time conditions evaluated at query time vs ignored: evaluating gives legal routes at the given hour, but requires the departure time and makes caching harder."],
    p: ["Routing a car through a pedestrian zone because the tag is missing on one segment.", "Destination-only roads used as through routes put traffic on residential streets."],
    v: "Run the access test set per profile with known allowed and forbidden segments, including a one-way with a bicycle exception, and confirm routes never use forbidden segments and do use the exceptions.",
    dep: ["graph-extraction", "schema-mapping"]
  },
  "speed-model": {
    s: "Assigns a typical speed to every edge from the posted limit, road class, surface, curvature, region defaults and observed data, and adjusts it by profile.",
    d: "Where limits are posted they are used, scaled to a realistic driving fraction; where absent they are inferred from class and country defaults. Surface, width, curvature and urban setting reduce speeds. For bicycles and pedestrians it is a constant by surface and slope. Observed data from probes can replace modeled values. The speed model is the largest influence on route choice and ETA. It is hard because posted limits are not what people drive, and data gaps are widespread.",
    k: ["Posted limit as the speed vs a calibrated fraction of it: posted is easy to explain, but calibrated reflects real driving and gives better ETAs.", "Region-wide defaults vs learned per-road speeds: defaults cover every road, but only observation reflects a particular road's reality."],
    p: ["A single default for all rural roads makes narrow winding lanes look as fast as highways.", "Applying free-flow speeds in a city makes every ETA optimistic during the day."],
    v: "Compare model speeds to observed median speeds on a sample of ten thousand edges per road class and confirm the error is within target, and check that ETAs for a set of real trips are not biased.",
    dep: ["speed-limit-inference", "historical-speed-profiles"]
  },
  "travel-time-estimator": {
    s: "Produces the predicted duration of a route by summing edge times, turn delays and traffic effects, then calibrating against real trips to remove systematic bias.",
    d: "Raw route time is the sum of edge costs expressed as time. Corrections add expected delay at signals and stops, scale by the profile's behavior, and apply historical or live traffic for the departure time. A calibration layer compares predictions to measured trip durations by region, road mix and hour and applies correction factors. Users judge the product by this single number. It is hard because errors compound on long trips and because the distribution has a tail users remember.",
    k: ["Summing per-edge times vs a learned model over the whole route: summing is explainable and consistent, but learned models capture effects between edges and cost interpretability.", "Reporting a single time vs a range: a single value is easy to display, but a range tells the user how reliable it is at rush hour."],
    p: ["An ETA that is consistently two minutes short on every trip is reported as a service defect.", "Calibration tuned on one city's trips is applied nationwide and biases rural estimates."],
    v: "Compare predicted and measured durations for tens of thousands of real trips grouped by hour and distance and confirm median error and bias stay within the target, with no group consistently under- or over-estimating.",
    dep: ["edge-cost-model", "turn-cost-model", "historical-speed-profiles", "live-speed-aggregation"]
  },
  "toll-and-fee-costs": {
    s: "Represents charges for road use, such as tolls, congestion zones and ferries, so routes can price, avoid, or trade them against time according to the user's preference.",
    d: "Fee data attaches to edges or to gates between them: fixed tolls, distance-based charges, vehicle-class tables, time-varying rates and zone entry fees. Costs convert money into time with a value-of-time factor, or are minimized as a separate objective. Prices appear in the response. It is hard because pricing rules are intricate, differ by operator and vehicle, and change often, and because a toll may depend on both entry and exit points.",
    k: ["Converting money to time with a single factor vs a separate objective: a factor keeps one search, but a fixed factor does not fit every user's willingness to pay.", "Exact pricing vs a flag that a road is tolled: exact tables help users budget, but are a heavy data burden and quickly stale."],
    p: ["Tolled sections marked only as a flag make avoid-tolls work but cost estimates impossible.", "A stale rate table shows a price that is off by enough to surprise the user at the gate."],
    v: "Route through a known toll road with each vehicle class and confirm the listed price matches the operator's published fare, and that avoid-tolls removes it.",
    dep: ["edge-cost-model", "access-rules", "source-feeds"]
  },
  "time-dependent-search": {
    s: "Makes edge costs a function of the departure time, so the same route has different durations at different hours, and the search accounts for when each edge is reached.",
    d: "Each edge has a piecewise function from entry time to travel time, built from historical profiles. The search must follow the first-in-first-out property, where leaving later never arrives earlier. Forward search with time-dependent weights is straightforward, but backward search and precomputed hierarchies are harder, since shortcuts also become functions. Approaches include time-bucketed graphs or approximated profile shortcuts. It is hard because functions are large, and because live data overrides the profile.",
    k: ["Full profile functions on shortcuts vs a handful of fixed time buckets: full functions are exact, and buckets are far smaller and simpler but jump at bucket edges.", "Static graph with live corrections vs time-dependent throughout: static plus corrections is cheaper and handles the next hour, but cannot plan far ahead accurately."],
    p: ["Violating first-in-first-out through noisy data makes the search return paths that wait for no reason.", "Planning a route for next Monday morning with this morning's live traffic gives a wrong answer."],
    v: "Route the same pair for departure at 3 a.m. and 8 a.m. on a weekday and confirm the duration differs as the historical profile predicts, and the path may change.",
    dep: ["historical-speed-profiles", "dijkstra-search", "edge-cost-model"]
  }
});
