// Details for the ride-hailing plate, part 1: location ingestion, geospatial index, platform.
ATLAS.details("ride-hailing", {
  "device-location-sdk": {
    s: "Code inside the driver app that samples position and motion sensors, adapts the sampling rate to the trip state, and survives background restrictions and battery limits.",
    d: "The SDK reads satellite fixes, network-derived positions and motion sensors, and attaches accuracy, speed, heading and a device timestamp to each sample. It samples faster during a trip or an open offer and slower when the driver is idle. It must keep running when the app is in the background, which operating systems actively restrict. It is hard because the best battery setting and the best data quality pull in opposite directions, and every phone model behaves differently.",
    k: ["High-rate sampling vs adaptive sampling: constant high rate gives smooth traces but drains batteries and radio; adapting by trip state saves power but can miss the first seconds of a new trip.", "Device timestamps vs server timestamps: device time is accurate about when a fix happened but clocks drift; server time is trustworthy but includes network delay."],
    p: ["Background restrictions pause updates on some phones, so a driver appears online but never moves and gets no offers.", "Trusting raw accuracy fields that vary by device makes bad fixes look as reliable as good ones."],
    v: "Drive a test phone through a tunnel and a parking structure with the app backgrounded, then confirm the server trace has timestamps, accuracy values and no gap longer than the configured interval outside the tunnel.",
    dep: []
  },
  "uplink-batching": {
    s: "Groups several location samples into one request or one persistent-connection message, trading a little freshness for far fewer radio wakeups and requests.",
    d: "Rather than a request per fix, the client buffers samples for a few seconds and sends them together over a long-lived connection, compressing coordinates as deltas from the previous point. When the network drops it keeps a bounded buffer and flushes on reconnect, tagging older points so the server knows they are late. Batch size and interval change with trip state. It is hard because a longer interval raises battery efficiency and lowers matching accuracy at the same time.",
    k: ["Short batch window vs long batch window: short keeps the index fresh for matching; long cuts radio use and server load.", "Drop oldest vs drop newest when the buffer fills: dropping oldest preserves the present position; dropping newest preserves a continuous trace for later analysis."],
    p: ["A reconnect flushes minutes of stale points that the server applies as if they were current, teleporting the driver backward.", "Unbounded retry buffers fill device memory during long outages."],
    v: "Disable the network for 60 seconds during a simulated drive, restore it, and check the server received every point once in order, marked as late, without moving the live position backward.",
    dep: ["device-location-sdk"]
  },
  "ingest-gateway": {
    s: "The fleet-facing edge that terminates driver connections, authenticates them, validates payloads and forwards location updates into the stream at very high rate.",
    d: "It holds long-lived connections from every online driver, authenticates each message against a session, checks that fields are plausible, and writes accepted updates to the location stream. It also pushes messages the other way, such as offers, over the same connection. It is partitioned by driver so one driver always reaches the same instance. It is hard because it is the highest-volume input in the system, because connections churn constantly, and because it has to shed load without dropping offers.",
    k: ["Persistent connections vs request per update: persistent connections cut handshake cost and allow server push; they need connection-aware load balancing and reconnect storms handling.", "Validate at the edge vs downstream: edge validation protects the stream but costs gateway CPU; downstream validation keeps the edge simple but lets bad data travel."],
    p: ["After a gateway restart every client reconnects at once, and the thundering herd overloads authentication.", "Shedding load by dropping random messages also drops offers and acceptances."],
    v: "Kill one gateway instance under load and verify its drivers reconnect to others within the target time, with offers still delivered and no sustained rise in update lag.",
    dep: ["location-stream"]
  },
  "location-stream": {
    s: "A partitioned, ordered log of every location update, so the index, the history store, fraud checks and traffic models can each consume the same data independently.",
    d: "Updates are keyed by driver and written to an append-only log with short retention. Consumers keep their own offsets: the spatial index applies updates, the history writer archives them, traffic estimation aggregates speeds, and fraud models read patterns. Ordering within a driver is guaranteed, and across drivers it is not. It is hard because consumers have different freshness needs, and a slow consumer must never hold back the one that feeds dispatch.",
    k: ["Partition by driver vs by geography: driver keys preserve per-driver order and balance load; geographic keys help locality but concentrate hot cities onto few partitions.", "Short retention vs long retention: short saves storage and forces slow consumers to catch up fast; long enables replay for recovery at a higher cost."],
    p: ["One consumer's backlog is mistaken for a stream problem and the whole pipeline is scaled when only that consumer needed attention.", "Reprocessing after an outage replays old positions into the live index, if consumers do not check timestamps."],
    v: "Stop the history consumer for ten minutes during load and confirm the spatial index lag stays under its target, then restart it and confirm it catches up without gaps.",
    dep: ["event-bus"]
  },
  "gps-quality-filtering": {
    s: "Removes or smooths bad fixes such as jumps, stale points and low-accuracy readings, so downstream components see a plausible path instead of raw noise.",
    d: "Each update is checked against the previous one: implied speed above what a road vehicle can reach, accuracy radius too large, timestamps out of order, or positions inside a building outline. Accepted points may be smoothed with a motion model that blends prediction and measurement. Rejected points are kept for diagnosis rather than deleted. It is hard because urban canyons produce errors that look plausible, and over-aggressive filtering makes a real driver appear frozen.",
    k: ["Hard rejection vs down-weighting: rejecting is simple to reason about but discards information; down-weighting keeps a noisy point as weak evidence at the cost of complexity.", "Filter at ingestion vs at consumers: one shared filter gives every consumer the same truth; per-consumer filtering lets each tune tolerance to its use."],
    p: ["A tuned speed limit rejects genuine fast highway driving, and the driver disappears from matching.", "Smoothing lags behind sharp turns, so pickup arrival is reported seconds late."],
    v: "Replay a recorded trace with injected 2 km jumps and a tunnel gap, and confirm the output path keeps the real route, drops the jumps, and marks the gap rather than inventing motion.",
    dep: ["location-stream"]
  },
  "driver-presence": {
    s: "Tracks whether each driver is online, idle, offered, en route or on a trip, and expires drivers whose updates have stopped.",
    d: "Presence combines explicit actions (going online, accepting a trip) with implicit evidence (recent updates, open connection). A lease with a short time to live marks a driver available; if no update renews it, the driver drops out of candidate searches. The presence value is read by dispatch for every candidate, so reads dominate. It is hard because false positives send offers to nobody, false negatives waste supply, and the state must agree with the trip state machine.",
    k: ["Lease expiry vs explicit offline messages: leases clean up crashed apps automatically; explicit messages are faster but never arrive when the app dies.", "Short lease vs long lease: short removes dead drivers quickly and flaps on brief signal loss; long is stable but sends offers to drivers who are gone."],
    p: ["A driver who accepted a trip is still listed idle for seconds and receives a second offer.", "Lease flapping in poor coverage areas makes drivers appear and vanish and distorts supply counts."],
    v: "Force-close the driver app and confirm the driver leaves candidate results within the lease time, and that a driver on an active trip never appears in any idle candidate list.",
    dep: ["driver-state-store", "location-stream"]
  },
  "location-history": {
    s: "Long-term storage of driver and trip traces, used for billing disputes, safety investigations, route analysis and training of ETA and forecasting models.",
    d: "A consumer of the location stream writes compressed traces, grouped by trip and by driver and day, into cheap storage with an index for retrieval by trip. Recent traces stay in a fast tier for support tools; older ones move to cold storage and are deleted at the retention limit. It is hard because location data is among the most sensitive data the company holds, retention is regulated, and trace volume is huge.",
    k: ["Raw points vs derived summaries: raw points support any later question but cost far more; summaries are cheap but cannot answer questions nobody planned for.", "Per-trip layout vs time-sliced layout: per-trip makes disputes fast to answer; time slices make aggregate analytics and deletion by date simpler."],
    p: ["Traces kept beyond the legal retention period become a liability found during an audit.", "Access without logging lets staff browse where people have been."],
    v: "Pick a completed trip from 30 days ago, retrieve its trace through the support tool, and confirm it matches the receipt route, with the access recorded in the audit log.",
    dep: ["location-stream"]
  },
  "cell-grid-indexing": {
    s: "Divides the planet into hierarchical cells so that a position maps to a cell id, and nearby positions share or neighbor cell ids.",
    d: "Each point is converted to a cell identifier at a chosen resolution, using hexagons or square tiles in a hierarchy. Finding drivers near a rider means computing the rider's cell and reading it and its ring of neighbors. Resolution trades precision against fan-out: finer cells mean more lookups per query but fewer false candidates. It is hard because cells distort near the poles and edges, and because one resolution fits neither a dense downtown nor a rural road.",
    k: ["Hexagonal vs square cells: hexagons have uniform neighbor distance, which simplifies radius queries; squares are simpler to compute and align with existing tile systems.", "Fixed resolution vs adaptive resolution: fixed is simple and predictable; adaptive handles density differences but complicates the index and its sharding."],
    p: ["Using a ring that is too small misses the nearest driver who sits just across a cell boundary.", "A resolution tuned for one city leaves a sparse suburb scanning many empty cells."],
    v: "Query for drivers within 1 km of points placed exactly on cell corners and compare against a brute-force distance scan over the same data; both must return the same set.",
    dep: []
  },
  "in-memory-spatial-index": {
    s: "A memory-resident map from cell to the drivers currently in it, updated on every location change and read on every match.",
    d: "For each cell the index holds a small set of driver ids with position, heading and status. An update moves a driver between cells when a boundary is crossed. Reads vastly outnumber structural changes, so cells are optimized for fast iteration. The index is rebuilt by replaying the location stream, which makes it disposable. It is hard because updates arrive continuously, reads must be consistent enough to avoid recommending a driver who just left, and one hot cell can become a bottleneck.",
    k: ["In-memory only vs persisted index: memory gives microsecond reads and simple code; rebuilding after a restart takes time during which matching is degraded.", "Copy-on-write snapshots vs locking cells: snapshots give readers a stable view without blocking; locks use less memory but delay reads during update bursts."],
    p: ["A restarted index node serves empty results until replay completes and the city looks like it has no drivers.", "Updating cells without ordering checks lets a late point move a driver backward."],
    v: "Restart one index node during load and measure time until its results match a fresh brute-force scan again, while verifying dispatch fell back to the replica without empty results.",
    dep: ["cell-grid-indexing", "location-stream"]
  },
  "nearest-driver-query": {
    s: "Returns the closest candidate drivers for a point, expanding outward ring by ring until enough qualify, then ranks them by travel time rather than straight-line distance.",
    d: "Starting at the pickup cell, the query reads rings of neighbors, collects drivers, applies cheap filters, and stops when it has enough candidates or reaches a maximum radius. Straight-line distance is only a prefilter: the final ranking uses road ETA, since a driver across a river may be near but far by road. It is hard because the number of ETA lookups multiplies by candidates, so the prefilter must keep the set small without excluding the true best driver.",
    k: ["Straight-line ranking vs road-time ranking: straight-line is nearly free but can pick a driver on the wrong side of a barrier; road time is accurate but expensive per candidate.", "Fixed candidate count vs fixed radius: a fixed count adapts to density; a fixed radius gives a predictable wait promise but returns too few in sparse areas."],
    p: ["A radius that is too small in sparse areas reports no cars when one is available just beyond it.", "Ranking only by distance sends drivers who are heading away from the pickup."],
    v: "For 1,000 sampled requests, compare the chosen driver to the best driver found by exhaustive road-time search and confirm the match agrees in at least the target fraction of cases.",
    dep: ["in-memory-spatial-index", "eta-model", "eligibility-filters"]
  },
  "geofences-and-zones": {
    s: "Polygons that mark places with special rules, such as airports, stations, restricted streets, pricing zones, service areas and city boundaries, with point-in-polygon lookup.",
    d: "Zones are defined by operations or regulators, stored as polygons with attributes (allowed pickup, fee, queue rules, surge zone id), and indexed by cell so a point resolves to its zones with a few lookups. Zone changes are versioned and take effect at a defined time. It is hard because boundaries drawn on a map rarely match where a car can legally stop, and because a change in a polygon changes prices and eligibility for live trips.",
    k: ["Polygons vs cell sets: polygons match real boundaries precisely but cost more to test; cell sets are fast and approximate, with edge errors at borders.", "Immediate vs scheduled zone changes: immediate fixes errors fast but may alter an in-flight trip; scheduled changes are predictable and apply only to new requests."],
    p: ["A zone edit with a self-intersecting polygon silently removes an area from service.", "Trips that cross a zone boundary use the zone at request time for one component and at completion for another, producing inconsistent fares."],
    v: "Load a new airport polygon, then confirm points just inside and outside resolve to the right rule, and that a trip already underway keeps its original zone.",
    dep: ["cell-grid-indexing", "city-config-and-launch"]
  },
  "airport-and-venue-queues": {
    s: "Virtual queues for places where many drivers wait for demand, such as airports and stadiums, ordering them fairly and releasing them to riders in turn.",
    d: "Drivers entering a staging geofence join a queue; when a rider requests a pickup at the venue, the first eligible driver in line is offered the trip. The queue enforces rules such as wait order, minimum fare, and holding area capacity, and must handle drivers who leave, lose signal or skip. It is hard because queue position becomes a perceived entitlement, the geofence boundary invites disputes, and venue demand arrives in bursts.",
    k: ["Strict first-in first-out vs weighted order: strict is simple to explain and perceived as fair; weighting by trip length or wait time gets better outcomes but draws complaints.", "Venue-wide queue vs per-terminal queues: venue-wide balances load; per-terminal queues cut walking and congestion but can leave one terminal without cars."],
    p: ["A driver who loses signal for a minute loses their place and their trust in the system.", "Queue count drifts from reality when exits are missed, so the app promises cars that are not there."],
    v: "Simulate 50 drivers entering a staging area and 20 pickups, and confirm drivers are offered strictly in queue order, that a driver who leaves is removed, and that the displayed wait matches observed waits.",
    dep: ["geofences-and-zones", "driver-presence"]
  },
  "index-sharding": {
    s: "Splits the spatial index across machines by region so one city's load does not depend on a single node, while keeping boundary queries correct.",
    d: "Cells are mapped to shards, usually by city or by a coarse parent cell, so most queries hit one shard. Queries near a shard boundary read neighbors from the adjacent shard or from a replicated border strip. Hot shards are split by finer cell ranges, and each shard has replicas that serve reads. It is hard because a pickup near a boundary needs cross-shard reads, and because demand moves during the day, making a good static split go stale.",
    k: ["Static city shards vs dynamic cell ranges: city shards are easy to reason about and isolate failures; dynamic ranges balance load but need rebalancing without losing updates.", "Replicate border cells vs cross-shard reads: replication keeps queries local and doubles border writes; cross-shard reads are simpler and add tail latency."],
    p: ["A concert makes one cell range hot enough to degrade the whole shard.", "Rebalancing while updates flow can leave a driver in two shards and offered twice."],
    v: "Place requests along a shard boundary and confirm results equal those from a single unsharded index, then drive synthetic load onto one shard and confirm other shards' latency is unchanged.",
    dep: ["in-memory-spatial-index", "city-partitioning"]
  },
  "event-bus": {
    s: "The durable messaging backbone that carries trip events, location updates, payment events and notifications between services, decoupling producers from consumers.",
    d: "Producers publish events to named topics; consumers subscribe and track their own position. Events are schema-checked, ordered per key and retained long enough for recovery and replay. Trip events, in particular, are the integration contract between dispatch, payments, safety, fraud and analytics. It is hard because schemas must evolve without breaking consumers, because delivery is at least once and consumers must tolerate duplicates, and because one slow topic must not affect others.",
    k: ["Events as facts vs commands: facts let any service react without coupling; commands are explicit about intent but create dependencies between teams.", "Strict schema registry vs free-form payloads: a registry catches breaking changes before deploy; free-form is faster to ship and breaks consumers silently."],
    p: ["A consumer assumes exactly once delivery and charges a rider twice when an event is redelivered.", "A schema change removes a field that a forgotten consumer still reads."],
    v: "Publish the same trip-completed event twice and confirm payment capture and driver earnings each happen once, and that a deliberately incompatible schema is rejected at publish time.",
    dep: []
  },
  "driver-state-store": {
    s: "A fast key-value store holding each driver's current status, active offer and active trip, read on every dispatch decision and updated atomically.",
    d: "Keyed by driver id, the record carries presence, current trip, pending offer with its deadline, vehicle capabilities and last position cell. Updates use compare-and-set so two dispatchers cannot both assign the same driver. It is replicated and partitioned by driver. It is hard because it is the point where uniqueness is enforced; a lost or reordered write means a double assignment, and a slow read adds directly to rider wait time.",
    k: ["Compare-and-set on one record vs distributed transaction: compare-and-set is fast and enough for one-driver-one-trip; transactions across driver and trip are stronger and add latency and failure modes.", "Replicas serving reads vs leader-only reads: replicas scale reads but can show a driver as free just after assignment; leader reads are fresh and limit throughput."],
    p: ["A stale replica read shows a driver as idle, and a second dispatcher offers them a trip.", "A long-running offer lock is never released after a crash, so the driver is invisible."],
    v: "Fire 100 concurrent assignment attempts for the same driver and confirm exactly one succeeds, and that the lock on the losing attempts' offers is released.",
    dep: []
  },
  "stream-processing": {
    s: "Continuous computations over event streams: windowed counts of requests and drivers per cell, traffic speed estimates, and real-time features for pricing and fraud.",
    d: "Jobs consume the location and trip streams, aggregate over sliding windows keyed by cell or driver, and emit results to topics or stores. Typical outputs are supply and demand counts per zone, average speed per road segment, and fraud signals. State is checkpointed so a job resumes after failure. It is hard because late and out-of-order events change windows already emitted, and because job state and checkpoints grow with traffic.",
    k: ["Event time vs processing time: event time gives correct results for late data and needs watermarks and corrections; processing time is simple and drifts when a backlog builds.", "Exactly-once state vs at-least-once with idempotent sinks: the first simplifies results and costs throughput; the second is faster and pushes duplicate handling to consumers."],
    p: ["A backlog after an outage produces a burst of old data that surge reads as sudden demand.", "Unbounded keyed state from rare keys grows until the job is killed."],
    v: "Pause a job for 5 minutes, resume it, and confirm per-zone counts for the gap equal those from a batch recomputation over the same events within the allowed error.",
    dep: ["event-bus", "location-stream"]
  },
  "feature-store": {
    s: "A shared service that serves the same computed features to online models and to training jobs, so ETA, pricing, forecasting and fraud models see consistent inputs.",
    d: "Features are defined once, computed by batch and streaming jobs, written to an offline store for training and an online store for low-latency lookup, and versioned. Each online read returns the latest value with its timestamp; training reads values as of a given time. It is hard because training must not use information that was not available at the time, and because online and offline computation drift apart when written twice.",
    k: ["One definition for both paths vs separate code per path: one definition prevents training-serving skew; separate code is easier per team and the numbers eventually disagree.", "Precomputed features vs on-demand computation: precomputing gives fast lookups and stale values; computing on demand is fresh and adds latency under load."],
    p: ["A feature built with data from after the label time makes offline accuracy look excellent and fail in production.", "An online store outage forces models to default values silently, with no alert."],
    v: "Pick 100 past requests, reconstruct features as of request time from the offline store, and confirm they equal the values the online store served then, within tolerance.",
    dep: ["stream-processing"]
  },
  "experimentation-platform": {
    s: "Randomly assigns users, drivers or cities to variants of a policy and measures the effect, with guards against interference that marketplaces create.",
    d: "Assignment is deterministic from an id and an experiment key, logged with each decision, and analyzed against metrics such as wait time, conversion, driver earnings and cost. Marketplaces break simple user-level tests, because treated riders compete for the same drivers as control riders. Techniques include switchback tests, in which a whole city flips between variants over time, and geographic splits. It is hard because effects arrive with delay and neighbors interfere.",
    k: ["User-level randomization vs time-region switchbacks: user-level gives power and is biased by shared supply; switchbacks measure the true system effect and need longer to reach significance.", "Early stopping vs fixed duration: stopping early limits harm from a bad variant and inflates false positives."],
    p: ["Treated riders take drivers from control riders, so the measured gain is partly just a transfer.", "Running overlapping experiments on the same decision makes effects impossible to separate."],
    v: "Run a null experiment where both variants are identical, and confirm the platform reports no significant difference at the expected false-positive rate over many repetitions.",
    dep: ["event-bus", "analytics-warehouse"]
  },
  "city-config-and-launch": {
    s: "Per-city settings for fees, zones, vehicle classes, payment methods, regulations and feature flags, with a launch checklist that brings a new city online safely.",
    d: "A versioned configuration tree holds defaults, regional overrides and city values, delivered to services with a change log and rollback. Launching a city means defining boundaries, pricing, legal rules, supported payments, support staff and language, then enabling in stages, from employees to a waitlist to the public. It is hard because configuration is code that changes behavior without a deploy, and mistakes have immediate financial and legal effect.",
    k: ["Central config service vs config in each service: central gives one audit trail and instant change; local files are robust to outage and scatter the truth.", "Gradual rollout by city vs flip for all: gradual limits blast radius; all-at-once is simpler for global fixes and unrecoverable if wrong."],
    p: ["A mistyped currency or fee in one city overcharges thousands of riders before anyone looks.", "Config is changed manually in production with no review trail, so nobody knows who changed it."],
    v: "Change a fee in a staging city, confirm quotes reflect it within the propagation target, then roll back and confirm the previous quotes return, with both changes in the audit log.",
    dep: []
  },
  "observability-and-slos": {
    s: "Metrics, traces, logs and alerts that show whether riders get cars quickly, framed as service-level objectives such as time to match and offer acceptance rate.",
    d: "Technical signals (latency, errors, queue lag) are joined with marketplace signals (request-to-match time, cancellation rate, available drivers per zone, ETA error). Objectives define acceptable levels, and alerts fire on burning the error budget. Per-city dashboards reveal local failures that global averages hide. It is hard because a healthy system can still make a poor marketplace, for example matching quickly but with bad ETAs.",
    k: ["Technical vs business SLOs: technical SLOs show where to fix; business SLOs show if riders were served, and need domain-specific alert thresholds.", "Global aggregates vs per-city views: aggregates reduce noise, and per-city views are the only way to see a single failing region."],
    p: ["An alert based on global request success stays green while one large city has no matches.", "High-cardinality labels such as driver id make the metrics system itself the incident."],
    v: "Inject 2 seconds of latency into candidate generation in one test city and confirm an alert fires for that city within the detection target, with a trace pointing at the slow step.",
    dep: ["event-bus"]
  },
  "analytics-warehouse": {
    s: "Columnar storage of all trips, requests, offers and payments, used for reporting, finance, model training and investigations, loaded from the event bus.",
    d: "Events and operational tables are loaded in batches or small increments, modeled into trips, offers, riders, drivers and cities, and queried by analysts, finance and model builders. Offer-level data is kept, not just completed trips, because the offers that failed explain the marketplace. It is hard because definitions (what counts as a completed trip, a cancellation or an active driver) must be shared, and because personal data requires deletion on request.",
    k: ["Raw events vs curated tables: raw keeps everything and requires every reader to interpret it; curated tables give consistent definitions and hide detail.", "Delete by key vs anonymize on retention: deleting satisfies requests exactly and is costly in columnar storage; anonymizing is cheap and may not satisfy every law."],
    p: ["Two teams define active driver differently and report conflicting numbers to leadership.", "Only completed trips are kept, so the model of demand ignores everyone who gave up."],
    v: "Compare a day's completed trip count and total fares in the warehouse against the payment system's totals and confirm they reconcile to the cent, with every difference explained.",
    dep: ["event-bus"]
  },
  "regional-failover": {
    s: "The ability to move a city's traffic to another data center when one fails, with state rebuilt quickly enough that active trips continue.",
    d: "Each city has a home region and a standby. Stateless services run in both, trip state is replicated, and the location index can be rebuilt from the stream in minutes. A failover updates routing so apps and gateways connect to the standby, then resumes dispatch. In-flight trips continue from replicated state while new requests wait briefly. It is hard because replication lag means the standby is slightly behind, and because failing back is as risky as failing over.",
    k: ["Active-passive vs active-active by city: active-passive is simple and wastes capacity; active-active uses it fully and makes conflicting writes possible.", "Fail over automatically vs by human decision: automatic is fast and can flap on false signals; human decision is safe and slow."],
    p: ["Replication lag means a trip accepted seconds before failover is unknown to the standby, and the driver is dispatched elsewhere.", "Failover is never rehearsed, and its runbook references systems that no longer exist."],
    v: "In a rehearsal, cut one city's primary region, and measure the time until requests are matched again, and count active trips that were lost or duplicated, which must be zero.",
    dep: ["trip-store", "driver-state-store", "city-partitioning"]
  },
});
