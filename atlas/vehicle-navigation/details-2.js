// Details for the in-vehicle navigation plate, part 2: guidance and trip management, route calculation.
ATLAS.details("vehicle-navigation", {
  "route-follower": {
    s: "Tracks where the vehicle is along the active route by projecting the matched position onto the route geometry, and reports progress, remaining distance and the upcoming maneuvers.",
    d: "The follower keeps an index into the route's ordered segments and advances it as matched positions arrive. It computes distance to the next maneuver, remaining distance and time, and the current road and speed limit. Because the route can contain loops or pass the same road twice, it searches forward from the last known index in a window rather than the whole route. It is hard because a wrong projection near a self-overlapping route gives wrong distances, and because it must handle the driver doing a legal detour that rejoins.",
    k: ["Forward-window search vs global nearest point: a window stays correct on loops and costs little; global search recovers from jumps and can snap to a later overlap.", "Distance by geometry vs by wheel odometry: geometry is repeatable, odometry tracks fine movement and drifts."],
    p: ["On a route that crosses itself, the follower jumps ahead to the later crossing and skips maneuvers.", "Progress computed from raw position instead of the matched one jitters by lane width at junctions."],
    v: "Replay a recorded drive on a route that contains a loop and a U-turn, and compare reported distance to the next maneuver against a surveyed value at several points. Confirm no maneuver is skipped.",
    dep: ["matched-position-output","route-geometry-assembly"]
  },
  "maneuver-extractor": {
    s: "Reads the route's geometry and road attributes and produces the list of discrete maneuvers, with type, angle, street names, exit numbers and a position along the route.",
    d: "At every junction on the route it compares the incoming and outgoing directions, counts the alternatives and classifies the move as continue, slight turn, turn, sharp turn, merge, fork, exit or roundabout with an exit index. Trivial junctions with no choice are dropped, and close maneuvers are grouped. It attaches road names and sign text, which is better to say than a name that does not appear on signs. It is hard because a junction's complexity is not in the angle alone and wrong classification causes missed turns.",
    k: ["Geometry-based classification vs map-supplied maneuver hints: geometry works on any data and misreads odd junctions; hints are accurate where present and often missing.", "Merging near maneuvers vs listing separately: merging eases the driver's load and complicates timing and rerouting."],
    p: ["A slight bend at a junction with a hidden side street is classified as continue and the driver passes the turn.", "Sign text and road names mismatch, so the spoken name does not match what the driver sees."],
    v: "Extract maneuvers for routes through known complex junctions and roundabouts and compare each type, angle and exit number with a hand-checked list. Drive some to confirm the instruction matches the physical junction.",
    dep: ["route-geometry-assembly","lane-and-sign-data","road-attribute-layers"]
  },
  "guidance-event-timing": {
    s: "Computes when each guidance event, such as a preview, a main instruction or a lane advisory, should trigger, from vehicle speed, road type and the time the driver needs to react.",
    d: "Each maneuver has several trigger points: an early preview, a main call and a last-moment reminder. Distances scale with speed, so the highway preview comes kilometers earlier than a city one. The timing uses the filtered speed and the expected deceleration before a turn. Events are published to display, voice and cluster consumers, each of which may apply its own rule. It is hard because a single timing must suit speech length, screen changes and lane advice, and because speed estimates lag at low speed.",
    k: ["Speed-scaled distances vs fixed distances by road class: scaled gives constant reaction time and varies with traffic; fixed is simple and wrong at extreme speeds.", "One shared timeline vs per-consumer timing: a shared timeline is consistent and each output compromises; separate timing suits each and can disagree."],
    p: ["Using instantaneous speed in stop-and-go traffic makes triggers jump forward and back.", "Triggers that ignore a short segment between two maneuvers fire the second event before the first is complete."],
    v: "Replay drives at several speeds and verify that each event fires within a tolerance of its intended seconds before the maneuver. Check consumers receive the same event times, with logs from display and voice.",
    dep: ["route-follower","maneuver-extractor"]
  },
  "lane-level-guidance": {
    s: "Combines lane data from the map with the vehicle's position to recommend, and where possible confirm, the lane to be in for the next maneuver.",
    d: "The map gives lane counts, lane directions and where lanes split or end. Guidance chooses the lane set that serves the route's next maneuvers, accounting for lane changes that need distance. With ordinary positioning accuracy it cannot say which lane the vehicle is in, so it advises the lane without confirming. With high-accuracy positioning or camera input it can compare the actual and the recommended lane. It is hard because lane data coverage is partial and the next two maneuvers can ask for opposite lanes.",
    k: ["Advice only vs lane-confirmed guidance: advice works with common hardware; confirmation needs accurate positioning or a camera and can alert the driver to errors.", "Planning lanes for the next two maneuvers vs only the next: two maneuvers avoid late lane changes and complicate the display."],
    p: ["Recommending a lane that ends before the maneuver because the lane data is older than the road.", "Position error larger than a lane width makes a confirmed-lane display wrong and credible."],
    v: "On a surveyed route with lane changes, record the lane advice at each approach and compare to the ideal lane. For systems with lane confirmation, compare the reported lane with video ground truth.",
    dep: ["lane-and-sign-data","matched-position-output","maneuver-extractor"]
  },
  "off-route-detection": {
    s: "Decides that the vehicle has left the planned route, quickly enough to help and cautiously enough to ignore position noise, parking maneuvers and legal detours.",
    d: "The detector compares matched position and heading with the route. It requires evidence over distance or time: the vehicle is off the route's road, moving away, and not on a candidate that rejoins. Thresholds depend on position confidence and road type. It also distinguishes a deliberate deviation from lost matching. It is hard because too eager detection reroutes on every GNSS jump or lane drift, and too slow detection leaves the driver without guidance after a missed turn.",
    k: ["Short evidence window vs long: short reacts fast to a missed turn and triggers on noise; long is stable and leaves the driver lost for seconds.", "Using position confidence to scale the threshold vs a fixed threshold: scaled avoids false reroutes in canyons and is more complex to tune."],
    p: ["A position jump in an urban canyon triggers a reroute for a vehicle that never left the route.", "Detection fails to fire on a parallel road, so the vehicle follows a road next to the route with no warning."],
    v: "Replay recorded drives that include intentional deviations, noisy segments and parallel roads. Measure the time from leaving the route to detection and count false detections on drives that stayed on route.",
    dep: ["route-follower","position-confidence-output","matched-position-output"]
  },
  "reroute-controller": {
    s: "Starts and manages recalculation of the route when the vehicle leaves it, when traffic changes enough to matter or when the driver changes preferences, and swaps in the new route without confusing guidance.",
    d: "A reroute starts from the current matched position and heading, with the original destination and waypoints. The controller prefers returning to the old route when that is cheap, uses cached search data to compute quickly, and shows a result in a second or so. For traffic reroutes it only proposes a new route when it saves more than a threshold and may ask the driver. It is hard because the route must be valid for the road the vehicle is moving along and because repeated switching between near-equal routes is annoying.",
    k: ["Automatic reroute vs asking the driver: automatic is effortless and can change the plan unexpectedly; asking respects control and adds distraction.", "Savings threshold in minutes vs a percentage: minutes are easy to explain; a percentage handles long and short trips in proportion."],
    p: ["A new route that begins by turning the vehicle around on a road where it cannot, because heading was ignored.", "Flapping between two near-equal routes as traffic fluctuates."],
    v: "Force deviations at several speeds and measure the time to a new route and that its first maneuver is legal from the vehicle's heading. Inject a traffic change and confirm switching occurs only above the threshold.",
    dep: ["off-route-detection","shortest-path-search","route-cache-and-reuse","eta-computation"]
  },
  "waypoints-and-multi-stop": {
    s: "Manages trips with intermediate stops: ordering, adding and removing stops, treating each leg as a route, and advancing automatically as the driver arrives at each one.",
    d: "A trip holds an ordered list of stops with optional stay times. Each leg is a separate route calculation, or the whole is calculated in one request with penalties at stops. The component decides when a stop is reached, using distance and speed, and then moves to the next leg. A driver may insert a stop on the way, such as a fuel station, which creates a detour estimate. It is hard because arrival is ambiguous near parking, and because reordering stops is an optimization that quickly grows beyond a few stops.",
    k: ["One route over all stops vs separate legs: one route optimizes jointly and complicates reroutes; legs are simple and independent.", "Fixed stop order vs optimizing order: fixed is predictable; optimizing saves distance and may surprise the driver."],
    p: ["A stop reached by a passing vehicle but not by arrival rules is skipped and guidance continues to the wrong leg.", "Adding a stop discards the cached route and delays guidance for several seconds."],
    v: "Build a trip with three stops, drive or replay it, and confirm each leg starts automatically when its stop is reached and that insertion of a new stop produces the expected detour and ETA.",
    dep: ["route-follower","shortest-path-search","reroute-controller"]
  },
  "arrival-and-parking-assist": {
    s: "Detects arrival, announces it, and then helps with the last stretch: showing the entrance, nearby parking and walking direction to the destination.",
    d: "Arrival is declared when the vehicle is close to the destination access point and slows or stops, not just by distance. After that the screen can offer parking options with availability, show the building entrance and, if the vehicle will be left, save the parking location for the return. It uses place data with entrance points and parking attributes. It is hard because the best parking is not at the destination coordinate, because destination geometry differs from the access road, and because the final tens of meters are rarely mapped in detail.",
    k: ["Announcing arrival by distance vs by stopping: distance is predictable and fires at a passing junction; stopping is reliable and later.", "Suggesting parking automatically vs on request: automatic helps in cities and clutters when the destination has a driveway."],
    p: ["Announcing arrival on the opposite side of a divided road where the vehicle cannot turn directly.", "Parking availability that is minutes old directs the driver to a full lot."],
    v: "Drive to destinations with a driveway, a divided road and a parking garage and confirm arrival fires at the correct point in each. Verify the saved parking position is within a few meters of where the vehicle stopped.",
    dep: ["route-follower","poi-index","place-and-address-data"]
  },
  "trip-state-persistence": {
    s: "Saves the active trip, including destination, stops and chosen route, so guidance resumes after the ignition is turned off and on or after a restart, without re-entering anything.",
    d: "The state is written to non-volatile storage when a trip changes and at power-down, with enough information to rebuild the route: destination, waypoints, preferences and the route's identity. On resume the system checks that the vehicle is near the old path, recalculates if needed and asks whether to continue if the vehicle has stayed parked for long. It is hard because shutdown may be abrupt, because the map may have changed between sessions, and because the stored trip is private location history.",
    k: ["Store the route vs store only the destination: storing the route resumes identically and can be invalid after updates; storing the destination recomputes and may differ.", "Resume automatically vs ask: automatic saves interaction; asking prevents guiding to an old destination after a long break."],
    p: ["A power loss during write leaves a corrupt trip file, and the unit fails to start guidance on the next drive.", "A stored trip is resumed for a new driver, exposing the previous destination."],
    v: "Start a trip, cut power at random moments and restart, then confirm the system either resumes correctly or starts clean, never crashes. Check the trip is cleared when the profile is deleted.",
    dep: ["map-storage-and-io","power-state-handling","secure-storage-and-keys"]
  },
  "routing-graph": {
    s: "The in-memory graph of the road network used for search: nodes at junctions, directed edges for road segments, with length, class, speed and attributes needed by the cost model.",
    d: "The graph is built from map tiles. Each directed edge stores its end node, length, free-flow speed, road class and flags such as toll, ferry or one-way. Tiles are loaded on demand during a search and linked at their borders by shared node identifiers, so a route can span many tiles. Compact layouts matter because a long route touches millions of edges on a unit with little memory. It is hard because tile boundaries, versioned identifiers and cache behavior dominate performance.",
    k: ["Edge-based vs node-based graph: edge-based represents turn costs and restrictions exactly and has more states; node-based is smaller and needs workarounds for turns.", "Tile-local identifiers vs global identifiers: local is compact and complicates cross-tile joins; global is simple and bigger."],
    p: ["Border nodes that disagree between neighboring tiles of different versions create impassable seams.", "Loading too many tiles for a long route exhausts memory and the search aborts."],
    v: "Route between points in distant tiles and across tile boundaries and compare results with a reference router on the same data. Monitor peak memory for the longest supported route.",
    dep: ["road-network-model","tile-partitioning","compiled-map-format"]
  },
  "turn-restrictions-and-penalties": {
    s: "Encodes which turns are forbidden, such as no left turn or no U-turn, and which are legal but costly, such as crossing traffic or turning at a signal, so the router follows real rules.",
    d: "Restrictions are stored as sequences of edges: from this edge you may not go to that edge, sometimes by time or vehicle type. Penalties add cost to a turn by angle, signal presence or crossing oncoming traffic. The search checks the incoming edge and candidate outgoing edge at every junction. It is hard because restrictions can span several edges, because many apply only at certain times, and because missing a restriction yields an illegal route that drivers notice immediately.",
    k: ["Modeling restrictions in the graph vs checking at search time: in the graph keeps search simple and grows the graph; checking at search time keeps data small and slows the inner loop.", "Hard bans vs very large penalties: hard bans never route illegally; penalties allow a route when no legal path exists, which is sometimes needed."],
    p: ["Time-restricted turns treated as always on, which removes valid routes at off-peak times.", "A restriction applied to the wrong direction of a two-way road blocks the legal direction."],
    v: "Route through a set of junctions with known restrictions and confirm none is violated, including time-dependent ones at specific hours. Compare with a field survey for several intersections.",
    dep: ["routing-graph","road-attribute-layers"]
  },
  "cost-model": {
    s: "Assigns each edge and turn a cost, usually travel time with adjustments for preferences such as avoiding tolls or highways, so that the cheapest path is the one the driver would call best.",
    d: "Base cost is length divided by expected speed, which depends on road class, speed limit, curvature and, when available, traffic. Preferences add penalties or exclusions for tolls, ferries, unpaved roads and highways. Turn penalties and traffic signals add fixed delays. The model is a single function used by every search, so any change affects every route. It is hard because the best weighting for time, distance and simplicity differs between drivers, and because small cost changes can make routes unexpectedly different.",
    k: ["Time-only cost vs blended time and distance: time-only matches expectation of the fastest route and chooses long ways; blending favors shorter routes and takes longer on average.", "Penalizing complexity vs ignoring it: penalizing turns gives easier routes and a few minutes longer."],
    p: ["Using speed limits as speeds makes routes through slow roads with high limits look better than they are.", "Preferences implemented as penalties are overridden when the penalty is smaller than a long detour."],
    v: "Compare computed travel times with observed drive times for a set of routes and check the error distribution. Change each preference and confirm the route avoids the chosen feature where an alternative exists.",
    dep: ["routing-graph","road-attribute-layers","turn-restrictions-and-penalties"]
  },
  "shortest-path-search": {
    s: "The core algorithm that finds the lowest-cost path between two points, a best-first search over the graph that stops as soon as the destination is settled.",
    d: "A priority queue holds frontier nodes ordered by cost so far, optionally plus a heuristic estimate to the goal. The search pops the cheapest node, relaxes its outgoing edges using the cost model and stops at the destination. Bidirectional variants search from both ends. Without speed-ups the search visits a large part of the graph for a long route, which is too slow on a small processor. It is hard because the heuristic must never overestimate and memory access patterns decide speed.",
    k: ["Unidirectional vs bidirectional search: bidirectional visits fewer nodes and needs a reverse graph and a correct stopping rule; unidirectional is simpler.", "Heuristic goal direction vs plain Dijkstra: a heuristic prunes the search and breaks if it is not admissible under the cost model."],
    p: ["A heuristic based on straight-line distance divided by too low a top speed makes the search slow, and one with too high a speed returns suboptimal routes.", "A stopping rule that exits when the first meeting node is found in bidirectional search returns a worse route."],
    v: "For random pairs of points, compare the route cost with a reference exact search and confirm equality. Measure search time and nodes visited for short, medium and cross-country routes on target hardware.",
    dep: ["routing-graph","cost-model","turn-restrictions-and-penalties"]
  },
  "hierarchical-speedup": {
    s: "Precomputed structure, such as road hierarchies or shortcuts, that lets long routes be found by searching mostly the major roads, cutting search time by orders of magnitude.",
    d: "At map compile time, nodes are ranked by importance and shortcut edges are added that skip over less important ones, or roads are classified into levels so that the search climbs to highways and descends near the end. The search then explores only a small fraction of nodes. The cost is extra data and a requirement that the cost model be known at build time. It is hard because dynamic changes such as traffic, closures or user preferences invalidate precomputed shortcuts.",
    k: ["Precomputed shortcuts vs plain search: shortcuts give millisecond routes and take build time and storage; plain search is flexible and slow on long routes.", "Fixed cost model vs customizable: fixed is fastest and ignores preferences; customizable supports them at the price of a more complex search."],
    p: ["A closure or traffic penalty applied only to base edges is bypassed by a shortcut that still includes the closed road.", "Shortcut data compiled for one cost model is used after a preference change, and returns a route that ignores the preference."],
    v: "Compare routes and costs from the accelerated search with the exact search on a large sample and require identical cost. Apply a closure and confirm no returned route uses the closed edge.",
    dep: ["routing-graph","map-compiler-pipeline","cost-model"]
  },
  "time-dependent-routing": {
    s: "Uses edge costs that change with the time of departure, from daily traffic patterns or live data, so the route chosen is the best one for when the vehicle will actually be on each road.",
    d: "Each edge has a speed profile, a function from time of day to speed, taken from historical data and adjusted by live conditions. The search tracks the arrival time at each node and evaluates edge cost at that time. A route for a trip tomorrow morning uses different costs from one now. It is hard because the search must keep the first-in-first-out property or it loses correctness, because profiles take storage, and because the live adjustments decay over the length of the trip.",
    k: ["Time-dependent edge costs vs static averages: time-dependent is more accurate for long trips and slower; static is fast and wrong in rush hour.", "Blending live data only near the start vs along the whole route: near-term blending is trustworthy; distant live data is probably stale by the time it matters."],
    p: ["A profile that makes a later departure arrive earlier than an earlier one breaks the search's assumptions and yields odd routes.", "Applying a live incident to a road the vehicle reaches two hours later when it will have cleared."],
    v: "Compute routes for the same pair at different departure times and compare their times with historical travel data for those times. Confirm arrival times never decrease as departure time increases.",
    dep: ["shortest-path-search","speed-profile-predictor","traffic-store-and-expiry"]
  },
  "alternative-routes": {
    s: "Produces a few reasonably different routes besides the best one, so the driver can choose, by limiting how much they overlap and how much longer each is.",
    d: "Common methods penalize edges of the best route and search again, or combine forward and reverse searches to find via-points that give paths with little sharing. Each candidate is checked for overlap, a maximum detour, and local optimality so it has no silly loops. The result is two or three options with labeled differences. It is hard because a route can be formally different and practically identical, and because every candidate costs a search on a small processor.",
    k: ["Penalty method vs via-point method: penalties are simple and may produce odd detours; via-points give cleaner alternatives and need extra data from both searches.", "Showing more alternatives vs fewer: more offers choice and clutters; one or two is easy to read and omits options."],
    p: ["Alternatives that differ in a single block, offered as separate choices.", "An alternative with an unlikely long detour on minor roads is accepted by the overlap test and offered."],
    v: "For a set of routes compute alternatives and measure overlap, extra time and local optimality for each. Review a sample on a map to confirm each is a plausible choice a driver would take.",
    dep: ["shortest-path-search","cost-model","hierarchical-speedup"]
  },
  "vehicle-profile-constraints": {
    s: "Applies the vehicle's physical and legal limits, such as height, weight, width, length and hazardous load, so the route avoids roads the vehicle cannot use.",
    d: "A profile gives dimensions and class, from the vehicle or from the driver. The router compares them with attributes on edges, such as bridge clearance, weight limits, narrow lanes, restricted zones and turning radius at junctions. Edges that fail are excluded or heavily penalized. Trucks, vans, motorcycles and trailers use different profiles. It is hard because restriction data is incomplete, because a missing limit looks the same as no limit, and because the consequence of an error is physical.",
    k: ["Excluding restricted edges vs penalizing: excluding is safe and can leave no route; penalizing always returns a route that may break a rule.", "Profile entered by the driver vs read from the vehicle: reading is automatic and accurate; entering supports trailers and loads the vehicle cannot sense."],
    p: ["A missing clearance attribute is treated as unlimited, so a tall vehicle is routed under a low bridge.", "A stale profile from a previous trailer stays in force and blocks valid roads."],
    v: "Plan routes for a tall and a heavy profile through an area with known low bridges and weight limits and confirm each restricted edge is avoided. Check the route is flagged when no compliant route exists.",
    dep: ["routing-graph","road-attribute-layers","cost-model"]
  },
  "energy-aware-routing": {
    s: "For electric vehicles, estimates energy use along candidate routes and plans charging stops so the vehicle arrives with a safe reserve at minimum total time.",
    d: "The energy model uses speed, elevation, temperature, vehicle mass and battery state to predict consumption per edge, including regeneration on descents. The planner then inserts charger stops, choosing stations by availability, power and detour, and decides how much to charge at each. This is a constrained search over time and battery level. It is hard because consumption depends strongly on conditions, because charger availability changes, and because under-estimating means a stranded vehicle.",
    k: ["Detailed physics model vs learned consumption: physics generalizes to new conditions and needs vehicle parameters; learned models fit real use and need data per vehicle.", "Charging to full vs to the amount needed: partial charging is faster overall since charging slows near full, and needs accurate predictions."],
    p: ["Assuming a charger is free at arrival leaves the vehicle queued with a low battery.", "Ignoring cold-weather consumption leads to a plan that fails on winter trips."],
    v: "Compare predicted and measured battery use over a set of real trips in different temperatures and check error against a stated tolerance. Confirm planned arrival charge stays above the configured reserve.",
    dep: ["cost-model","routing-graph","vehicle-signal-gateway","poi-index"]
  },
  "route-geometry-assembly": {
    s: "Turns the path of edges found by the search into a continuous route: ordered shape points, per-segment attributes, distances and timings, ready for guidance and display.",
    d: "The search returns edge identifiers. Assembly gathers each edge's shape, merges adjacent segments, trims the first and last segments to the actual start and end positions on the road, and records road names, classes, speed limits, signs and cumulative distance and time. Attributes needed later for maneuvers and lanes are carried along. The result is the object every downstream component reads. It is hard because geometry in different tiles must join exactly and shape simplification must not change distances.",
    k: ["Carrying full attributes in the route vs looking them up later: carrying is fast and consumes memory; lookup keeps the route small and depends on tiles staying loaded.", "Simplifying shape for display vs keeping full detail: simplification saves memory and may cut corners that guidance needs."],
    p: ["Start and end points not trimmed to the vehicle's position make the first distance wrong by the length of the segment.", "A route whose geometry references tiles that have been evicted fails during guidance."],
    v: "Assemble routes and check cumulative distance equals the sum of edge lengths and that route shape joins continuously across tile borders. Compare route length and time with the search's cost.",
    dep: ["shortest-path-search","routing-graph","geometry-compression"]
  },
  "route-cache-and-reuse": {
    s: "Keeps search results and tile data from the current route so a reroute or a small change can be computed much faster than a fresh search.",
    d: "After a route is computed, the cache keeps the loaded tiles, the search tree toward the destination and the route itself. When the vehicle leaves the route, a reverse search tree from the destination, if kept, lets the system find the cost from any node to the destination in a lookup, so only a short local search from the vehicle is needed. It is hard because the cache is invalid when costs change, such as new traffic, and because it competes for memory with maps and rendering.",
    k: ["Keeping the destination tree vs recomputing: keeping gives near-instant reroutes and holds memory; recomputing is lean and takes seconds on long routes.", "Invalidating on any traffic change vs on large ones: any change is correct and recomputes often; large only is cheaper and slightly stale."],
    p: ["A cached tree built before a closure was applied produces a reroute through the closed road.", "Cache memory not released after the trip ends starves the next trip's tile loading."],
    v: "Trigger reroutes at several points on a long route and compare their computation time with and without the cache, and confirm identical results after cache invalidation by a cost change.",
    dep: ["shortest-path-search","routing-graph","traffic-store-and-expiry"]
  },
});
