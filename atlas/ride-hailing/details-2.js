// Details for the ride-hailing plate, part 2: dispatch, forecasting, routing and ETA.
ATLAS.details("ride-hailing", {
  "request-intake": {
    s: "Accepts a ride request, validates it, resolves addresses and zones, attaches the quoted price and creates the trip, then hands it to dispatch exactly once.",
    d: "The request carries rider, pickup, destination, vehicle class and the accepted quote. Intake checks that the rider has no conflicting active trip, that the pickup is serviceable, and that the quote is still valid, then creates the trip record and publishes a request event. A client-supplied idempotency key makes retries safe. It is hard because a request must not be lost or doubled when the phone retries over a poor network, and it must be fast, since it starts the wait.",
    k: ["Synchronous creation vs queue then acknowledge: synchronous gives the rider an immediate answer; queuing absorbs spikes and delays the confirmation.", "Quote re-validation at request vs trust the client: re-validation prevents stale or tampered prices; trusting is faster and lets old quotes through."],
    p: ["A retry without an idempotency key creates two trips and two drivers arrive.", "A request is accepted before the zone service is checked and later fails as unserviceable, after the rider has waited."],
    v: "Submit the same request ten times with one idempotency key under packet loss and confirm exactly one trip exists, and every response returns the same trip id.",
    dep: ["trip-state-machine", "upfront-pricing", "geofences-and-zones"]
  },
  "candidate-generation": {
    s: "Produces the short list of drivers worth considering for a request by combining spatial search, availability and a rough estimate of pickup time.",
    d: "Given a pickup, it queries the spatial index for nearby available drivers, including drivers about to finish a trip nearby, and attaches a pickup ETA to each. It returns tens of candidates, not hundreds, because every candidate costs routing work later. The list is passed through eligibility filters and into the matcher. It is hard because the best driver may not be the nearest, and widening the search to find them costs latency and compute for every request.",
    k: ["Wide search with fast scoring vs narrow search with accurate scoring: wide finds unusual good matches at higher cost; narrow is cheap and misses drivers just outside the radius.", "Include busy drivers finishing soon vs only idle drivers: including them improves ETAs in busy areas and complicates the guarantee that the offer will be honored."],
    p: ["Candidate lists ignore drivers about to finish nearby, so riders wait while a driver two blocks away is dropping off.", "Computing exact ETAs for every candidate overloads routing at peak."],
    v: "Replay 10,000 historical requests and compare chosen drivers to the best of an exhaustive search; the gap in pickup time must stay within the target at median and 95th percentile.",
    dep: ["nearest-driver-query", "driver-presence"]
  },
  "eligibility-filters": {
    s: "Rules that remove drivers who cannot take a trip: wrong vehicle class, missing accessibility equipment, outside zone rules, blocked pairings, hours limits or document problems.",
    d: "Each filter is a predicate over driver, vehicle and request. Common filters are vehicle type, child seat or wheelchair capability, driver documents valid, fatigue limit not reached, rider-driver block lists, and venue rules. Filters run before expensive scoring so they discard cheaply. They are hard because rules differ by city, change often, and must explain themselves: when no one is eligible, operations needs to know which rule removed everyone.",
    k: ["Hard filters vs penalties in scoring: hard filters are predictable and legally clear; penalties allow tradeoffs and make rule violations possible.", "Evaluate filters per request vs precompute eligibility sets: per request is always current; precomputed is faster and stale after a document expires."],
    p: ["A filter silently excludes all wheelchair-capable vehicles in a city after a config typo.", "Block lists are checked in one path and not in another, so a blocked pair is matched through re-offer."],
    v: "For a request needing an accessible vehicle, confirm every offered driver has the capability, and that disabling a driver's document makes them vanish from results within the cache time.",
    dep: ["driver-state-store", "driver-fatigue-limits", "city-config-and-launch"]
  },
  "batched-matching": {
    s: "Collects requests and available drivers over a short window, then decides all matches together rather than one request at a time.",
    d: "Instead of giving the first request the nearest driver, the system holds requests for a window of a few seconds, builds a graph of feasible request-driver pairs with costs, and solves it as one problem. Window length is a policy: longer windows find better global matches and add wait for every rider. It is hard because the best window differs by city density and time of day, and because the matcher must remain responsive when a window contains thousands of requests.",
    k: ["Greedy immediate matching vs batch windows: greedy gives the fastest possible response; batching reduces total pickup time across the city by sacrificing a few seconds of latency.", "Fixed window vs adaptive window: fixed is simple to reason about; adaptive shortens in sparse markets and lengthens in dense ones, at the cost of hard-to-explain behavior."],
    p: ["A long window in a sparse area makes every rider wait for a match that could have been immediate.", "A solver that exceeds its time budget stalls the whole city's matching."],
    v: "On a replayed busy hour, compare average pickup time and rider wait between greedy and batched matching and confirm the batched result matches the claimed improvement without raising the 95th percentile wait.",
    dep: ["candidate-generation", "assignment-optimization"]
  },
  "assignment-optimization": {
    s: "Solves for the set of request-driver pairs that minimizes total cost, such as pickup time, cancellations and lost earnings, subject to each driver and request used once.",
    d: "The feasible pairs form a weighted bipartite graph. The solver finds a minimum-cost or maximum-value matching, often with cost terms for pickup time, driver idle time, the probability the driver accepts, and the value of leaving a driver where demand will appear. Exact algorithms handle moderate sizes; very large batches use approximations. It is hard because cost terms encode business tradeoffs that no single objective captures, and because uncertain acceptance means the optimum is not the real outcome.",
    k: ["Exact optimization vs heuristic or approximate solving: exact is optimal and slow at scale; approximations meet the time budget with a small loss.", "Pickup time only vs a blended objective: pickup time is easy to explain and ignores driver earnings fairness; a blended objective improves marketplace health and is harder to tune."],
    p: ["Optimizing pickup time alone systematically sends short trips to the same drivers.", "Costs use predicted acceptance that is never recalibrated, so the objective drifts away from reality."],
    v: "Feed a small crafted instance with a known optimal assignment, and confirm the solver returns it, and that on production-sized batches it returns within the time budget with a cost within the bound of the optimum.",
    dep: ["eta-model", "demand-forecasting"]
  },
  "offer-and-accept": {
    s: "Sends a trip offer to a driver with a countdown, receives accept or decline, and atomically binds the driver to the trip on acceptance.",
    d: "The offer contains pickup, rough destination, estimated earnings and a deadline. The driver state store marks the driver as holding that offer so no one else can assign them. An accept triggers a compare-and-set that binds driver to trip and moves the trip to assigned; a decline or timeout releases the driver. It is hard because the offer crosses a network that may drop either direction, and because the system must decide in every case who owns the driver.",
    k: ["Reserve driver at offer time vs at accept time: reserving prevents double offers and removes the driver from the pool while they decide; reserving later keeps supply but risks losing the race.", "Show the destination before acceptance vs after: showing improves acceptance quality and enables cherry-picking; hiding reduces rejection of unprofitable trips and reduces transparency."],
    p: ["An accept message is lost on the way back, and the driver sees an expired offer while the platform believes they accepted.", "A driver app that is slow to render the offer wastes most of the countdown."],
    v: "Drop the accept message after the server processes it, and confirm the driver's app converges to the assigned state on reconnect, with exactly one trip bound to the driver.",
    dep: ["driver-state-store", "driver-offer-ui", "trip-state-machine"]
  },
  "offer-timeouts-and-reoffer": {
    s: "Handles declined or expired offers by releasing the driver, choosing the next candidate and limiting how long a rider waits before the system gives up.",
    d: "Each offer has a deadline of a few seconds. On decline or timeout the driver is released, flagged to avoid immediate re-offer of the same trip, and the matcher selects the next best candidate, possibly widening the search. The rider's overall dispatch budget caps the total number of attempts. Declines feed acceptance models and driver feedback. It is hard because each retry adds wait, and because patterns of declining affect both ranking and the driver's standing.",
    k: ["Sequential offers vs simultaneous offers to several drivers: sequential is simple and fair and slow; simultaneous is fast and makes losers see an offer vanish.", "Long timeout vs short timeout: long gives drivers time to decide and raises rider wait; short is fast and pushes acceptance below what drivers can manage."],
    p: ["The same trip is offered to the same unresponsive driver repeatedly.", "Giving up is silent, and the rider waits with no message or alternative."],
    v: "Simulate five consecutive declines and confirm each driver is released, no driver sees the trip twice, and the rider is told within the dispatch budget when no match is found.",
    dep: ["offer-and-accept", "candidate-generation"]
  },
  "pooled-rides": {
    s: "Matches several riders with overlapping routes into one vehicle, deciding insertions of pickups and dropoffs while limiting detour for everyone already aboard.",
    d: "When a pool request arrives, the system considers vehicles already carrying pool riders and idle ones, computes the best insertion of the new pickup and dropoff into each route, and rejects insertions that break detour or wait limits. Prices are quoted up front and adjusted for shared travel. It is hard because each insertion needs several route computations, the quoted ETA is a promise to people already aboard, and a new rider can worsen existing riders' trips.",
    k: ["Insert into existing routes vs wait to form groups: insertion matches fast and can lengthen existing trips; waiting forms better groups and delays every rider.", "Detour limit per rider vs total-detour objective: per-rider limits protect individuals and reduce matches; a total objective finds more shares and some riders endure more."],
    p: ["An insertion improves the new rider's trip and breaks the ETA promised to someone already in the car.", "Cancellation of one rider forces re-planning of the whole route at a bad moment."],
    v: "On a replayed set of pool requests, confirm every rider's actual detour stays within the quoted limit, and that actual arrival is within the promised window for at least the target fraction of trips.",
    dep: ["routing-engine", "assignment-optimization", "mid-trip-changes"]
  },
  "scheduled-rides": {
    s: "Reserves a trip for a future time, then runs dispatch ahead of the pickup so a driver is committed early enough to arrive on time.",
    d: "A scheduled ride stores the pickup time, location and price, and creates a dispatch task that fires a lead time before pickup, sized by forecasted traffic and local supply. A driver may be assigned early with a hold, or the system may match close to the time. It is hard because the platform is promising supply at a future point it cannot yet see, and because cancellations and no-shows cost a driver real time.",
    k: ["Assign driver early vs match close to pickup: early gives certainty and ties up the driver; late preserves flexibility and risks a missing car at the moment.", "Guaranteed price vs price at ride time: guarantee wins trust and exposes the platform to surge; price at ride time is safer and removes the reason to book ahead."],
    p: ["Dispatch for a morning airport run starts too late in a busy hour, and no driver is available.", "A cancelled early assignment leaves a driver who turned down other trips without compensation."],
    v: "Schedule 200 rides for next morning, then confirm each had a driver assigned by its lead time, and the fraction picked up within the promised window meets the target.",
    dep: ["batched-matching", "demand-forecasting", "trip-timers"]
  },
  "dispatch-ownership": {
    s: "Decides which dispatcher instance is responsible for a request or a region at a given moment, so no two instances assign the same driver or leave a request orphaned.",
    d: "Requests and cells are assigned to dispatcher instances by consistent hashing or leases. The owner holds the in-flight state of its requests and drives them to completion. When an instance fails, ownership moves and the new owner reloads state from the trip store and driver state store. It is hard because it must be exclusive without being slow, and because ownership changes mid-offer can result in a duplicate offer or a lost one.",
    k: ["Region ownership vs request ownership: region ownership lets one process see all local supply for batching; request ownership spreads load evenly and sees less of the picture.", "Lease-based ownership vs coordination service: leases are simple and rely on clocks; a coordination service is stricter and adds a dependency on the critical path."],
    p: ["Two instances both believe they own a region after a network partition and offer the same driver.", "Ownership handoff drops requests that were in the middle of an offer."],
    v: "Kill the owner of a busy region, and confirm another instance takes over within the target time, in-flight requests complete or restart exactly once, and no driver receives two offers.",
    dep: ["driver-state-store", "trip-store", "city-partitioning"]
  },
  "demand-forecasting": {
    s: "Predicts the number of ride requests per zone and time slice over the next minutes to hours, feeding pricing, incentives, driver guidance and scheduled-ride lead times.",
    d: "The model uses recent request counts, time of day, day of week, holidays, weather, events and transit disruptions, producing a forecast with uncertainty per cell and horizon. Short horizons rely on the latest stream; longer ones on historical patterns. It is hard because demand is censored: requests that were never made because no cars showed, or the price was high, are missing, and because forecasts that change behavior change their own outcome.",
    k: ["Per-cell models vs one global model with cell features: per-cell models fit local quirks and are many to maintain; a global model shares strength across cells and can blur local detail.", "Point forecast vs distribution: a point is easy to consume; a distribution lets pricing and incentives hedge against uncertainty."],
    p: ["Training on completed trips mistakes unmet demand for no demand, so under-served areas stay under-served.", "A model that ignores a stadium event misses a crowd that arrives at once."],
    v: "Backtest forecasts for the last four weeks against actual requests per zone and hour, and confirm error stays within the target, including on holidays and event days.",
    dep: ["forecast-feature-pipeline", "event-and-weather-signals"]
  },
  "supply-forecasting": {
    s: "Predicts how many drivers will be online and where, accounting for shift habits, ongoing trips ending nearby, and responses to incentives.",
    d: "Supply in the next interval is the sum of idle drivers, drivers finishing trips near the zone, and drivers expected to come online or relocate. Models use driver history, time of day and live trip destinations. Combining supply with demand forecasts gives the expected imbalance per zone. It is hard because supply responds to the platform's own actions, such as incentives and prices, and because drivers decide on a human schedule affected by weather and local events.",
    k: ["Trip-destination-based projection vs statistical model: destinations give accurate short-term supply; statistical models cover the longer term and ignore live information.", "Model drivers individually vs in aggregate: individual models capture habits and need more data and privacy care; aggregate models are simpler and less sensitive."],
    p: ["Ignoring drivers who are about to finish a trip understates supply and triggers needless surge.", "Forecasts assume constant driver behavior while an incentive campaign changes it."],
    v: "Compare forecast driver counts per zone to actual counts for several weeks, and check the error is within the target for the hours that matter most for pricing.",
    dep: ["forecast-feature-pipeline", "driver-presence"]
  },
  "event-and-weather-signals": {
    s: "External inputs that change demand: weather, public events, transit disruptions, flight arrivals, school and holiday calendars, brought in as features.",
    d: "Feeds from weather services, venue calendars, flight status and transit alerts are normalized to time and place, mapped to zones, and turned into features such as rain intensity or expected venue exit time. Some signals are known in advance (a concert end), some arrive late (a train failure). It is hard because external data is inconsistent, because place mapping is fuzzy, and because the effect of an event differs by event type and city.",
    k: ["Curated event calendar vs automatic scraping: curated is accurate and manual; automatic scales to every city and brings errors and legal questions about data use.", "Hand-built effect rules vs learned effects: rules are explainable and need upkeep; learned effects adapt and need many past events to learn from."],
    p: ["A cancelled event stays in the calendar and the system raises prices and incentives for a crowd that never comes.", "Timezone or venue-location errors apply a stadium's demand to the wrong zone."],
    v: "Take ten past large events and confirm the features show a rise in the right zones before the event ended, and that the forecast with the feature beats the forecast without it.",
    dep: ["geofences-and-zones"]
  },
  "driver-heatmaps": {
    s: "A map shown to drivers indicating where demand is high or about to rise, to guide idle drivers toward places where they will be matched.",
    d: "Forecast demand minus expected supply per cell is rendered as a color overlay, smoothed in space and time and refreshed every few minutes. Drivers choose whether to move. The map is not a command but an incentive, and its effect has to be modeled, since too many drivers following the same signal arrive together. It is hard because a published map changes the behavior it describes, and because it must avoid sending drivers on unprofitable repositioning trips.",
    k: ["Show raw demand vs show expected opportunity: raw demand is easy to explain and sends everyone to the same hot spot; opportunity accounts for supply and is harder for drivers to interpret.", "Frequent updates vs stable updates: frequent is current and flickers; stable is calmer and lags the real change."],
    p: ["All idle drivers move to the same bright zone, which becomes oversupplied while the previous one empties.", "A map computed from unmet demand pointing to a place with no legal stopping spot sends drivers to be fined."],
    v: "Publish a heatmap to a sample of drivers and compare movement and later earnings in highlighted zones against a control group, confirming a positive and not saturating effect.",
    dep: ["demand-forecasting", "supply-forecasting", "driver-offer-ui"]
  },
  "forecast-feature-pipeline": {
    s: "The jobs that prepare forecast inputs: per-zone counts of requests, drivers and cancellations in rolling windows, joined with calendar and weather features.",
    d: "Streaming jobs compute recent windows per zone, and batch jobs compute long-run seasonal baselines. Results go to the feature store with timestamps. Each model reads the same windows in training and serving. It is hard because zone definitions change over time, because missing data from outages must be distinguished from zero demand, and because late events must be incorporated without changing what the model saw when it was trained.",
    k: ["Streaming windows vs micro-batch: streaming is fresher and more complex to correct; micro-batch is simple and adds minutes of lag.", "Fixed zones vs flexible regions: fixed zones keep history comparable; flexible regions match real neighborhoods and break the time series."],
    p: ["An ingestion outage writes zeros for an hour, and the model learns that the hour had no demand.", "Zone boundaries change and history before the change is silently misattributed."],
    v: "Recompute one day of features offline from raw events and compare to the online values, confirming equality except for events that arrived after the allowed lateness.",
    dep: ["stream-processing", "feature-store"]
  },
  "forecast-evaluation": {
    s: "Measures forecast accuracy against what happened, by zone, hour and event type, and decides whether a new model replaces the current one.",
    d: "Each forecast is stored with the issue time and later compared with actuals. Metrics weigh errors by their cost: underestimating demand in a busy zone matters more than in an empty one. New models run in shadow mode first, then in a limited rollout against the champion model. It is hard because a good score on average can hide failures on rare but important days, and because the outcome after acting on a forecast differs from the forecast.",
    k: ["Symmetric error vs cost-weighted error: symmetric is standard and easy; cost-weighted reflects the business, and requires agreed costs for over- and under-prediction.", "Backtesting vs live shadow: backtests are quick and optimistic; live shadow is truthful and slow."],
    p: ["A model beats the baseline on weekdays and fails every holiday, and the average hides it.", "Evaluation uses data that the model's own recommendations changed, hiding a feedback loop."],
    v: "Run a candidate model in shadow for two weeks and confirm its cost-weighted error beats the live model in at least the agreed share of zones, including the worst-performing day.",
    dep: ["demand-forecasting", "supply-forecasting", "analytics-warehouse"]
  },
  "map-matching": {
    s: "Snaps noisy position traces onto the road network, determining which road a vehicle is on and where along it, so speeds and routes are meaningful.",
    d: "For each point, candidate road segments within the error radius are scored by distance and heading; a probabilistic model, usually a hidden-state sequence model, picks the most likely path through them using the road topology and plausible speeds. Output is a sequence of segments with positions and times. It is hard because parallel roads, overpasses and parking lots are ambiguous, and online matching must decide before seeing the future points.",
    k: ["Online matching vs offline matching: online gives the current road immediately and can be wrong at forks; offline sees the whole trace and is only available later.", "Strict topology vs tolerance for map errors: strict topology prevents impossible jumps and breaks where the map is wrong; tolerance survives map errors and permits nonsense paths."],
    p: ["A driver on a service road beside a highway is matched to the highway, and traffic speeds for that segment are wrong.", "A new road missing from the map causes the trace to be forced onto a distant street."],
    v: "Match 1,000 traces with known ground-truth routes, and confirm the share of correct segments meets the target, with separate scores for parallel roads and overpasses.",
    dep: ["road-graph-and-restrictions", "gps-quality-filtering"]
  },
  "routing-engine": {
    s: "Computes the best path and travel time between two points on the road graph under current costs, thousands of times per second.",
    d: "The engine preprocesses the road graph into a structure that makes shortest-path queries fast, then applies edge costs that combine length, speed, turn penalties, restrictions and traffic. It answers single routes, many-to-many time matrices for matching, and alternatives. Costs change continuously, so preprocessing must tolerate weights that update. It is hard because the fastest algorithms assume static costs, and live traffic breaks that assumption.",
    k: ["Preprocessed hierarchy vs plain graph search: preprocessing gives millisecond queries and makes live cost updates costly; plain search handles any change and is too slow for matrices.", "Time matrix for all candidates vs per-candidate routes: a matrix amortizes work across candidates; individual routes are simpler and multiply cost."],
    p: ["A weight update invalidates the hierarchy, and queries use costs from an hour ago.", "A closed road is still routable because restrictions are applied after route search."],
    v: "Compare routes and times for 10,000 sampled origin-destination pairs against an unoptimized reference search on the same costs, and confirm they agree, then time p99 latency under load.",
    dep: ["road-graph-and-restrictions", "live-traffic-speeds"]
  },
  "road-graph-and-restrictions": {
    s: "The road network as nodes and directed edges with attributes: one-way rules, turn restrictions, speed limits, vehicle access, tolls and pickup rules, kept current from map data.",
    d: "A base map is imported, cleaned and enriched with the platform's own knowledge: where cars can actually stop, which entrances are best, which roads are private. Updates are versioned and released with checks so routing sees a consistent snapshot. Drivers' reports and traces correct errors. It is hard because maps are always slightly wrong, because turn restrictions are easy to miss, and because ride-hailing needs pickup-specific data that general maps lack.",
    k: ["Licensed map vs community map plus own corrections: licensed maps are consistent and cost money; community maps are free and uneven in quality by region.", "Frequent map releases vs stable snapshots: frequent releases fix errors sooner and risk routing changes mid-trip; stable snapshots are predictable and stale."],
    p: ["A missed turn restriction sends drivers to an illegal turn that is fined.", "A map release changes the graph while trips are in flight and active routes become invalid."],
    v: "Route 5,000 sampled trips with known good routes on each new map version and confirm the count of illegal turns and one-way violations is zero, and travel times do not change beyond tolerance.",
    dep: []
  },
  "live-traffic-speeds": {
    s: "Current and short-horizon speed estimates per road segment, derived from the fleet's own map-matched traces, blended with historical patterns.",
    d: "Matched traces give observed speeds per segment per minute. Sparse segments borrow from neighbors and history; busy ones update fast. A model projects speeds forward for the trip's duration. The output feeds routing weights and the ETA model. It is hard because coverage is uneven: a street with no recent cars has no live data, and a stopped delivery truck looks like a jam.",
    k: ["Fleet-only observations vs bought traffic feeds: fleet data is fresh and exactly the vehicles of interest and is sparse; bought feeds are broad and cost money and lag.", "Blend history heavily vs trust live data: heavy history is stable and misses incidents; trusting live is responsive and noisy on thin data."],
    p: ["One slow vehicle creates a phantom jam on a quiet street and routes divert away.", "After a road reopens, speeds recover slowly because history still says closed."],
    v: "Compare estimated segment speeds against held-out trace speeds for the same minute, and confirm error is within the target for both busy arterials and thin side streets.",
    dep: ["map-matching", "location-stream"]
  },
  "eta-model": {
    s: "Predicts arrival and trip duration by taking the routing engine's estimate and correcting it with a learned model of local behavior, time of day and conditions.",
    d: "The route's raw travel time is a feature, with time of day, day type, weather, segment mix, intersection counts, vehicle class and pickup behavior. A trained model predicts the residual or the whole duration. Separate estimates cover the drive to pickup, waiting at pickup, and the trip. Dispatch, pricing and the rider app all call it. It is hard because it is called at massive volume, and because a systematic bias in one city costs money and trust.",
    k: ["Correct the route estimate vs predict from scratch: correcting uses the road structure and is easy to debug; from scratch can learn more and is opaque.", "One global model vs per-city models: global shares data and misses local roads; per-city fits locally and needs data and upkeep in each place."],
    p: ["A model trained in dry weather underestimates durations in the first rain, and ETAs are too optimistic for hours.", "Training uses trips that finished, so those that were cancelled by long waits are never learned."],
    v: "Compare predicted and actual pickup and trip durations on a week of held-out trips, and confirm the median error and the share of trips later than predicted by 20 percent are within targets.",
    dep: ["routing-engine", "live-traffic-speeds", "feature-store"]
  },
  "eta-calibration": {
    s: "Continuously measures predicted versus actual durations and applies corrections so that quoted times are honest, with attention to which direction errors cost more.",
    d: "Actual outcomes are joined to the predictions made at request, at match and at dispatch. Reports show bias and spread per city, hour and distance bucket. Calibration layers adjust quantiles: a time promised to a rider should be met most of the time, while a time used for matching should be unbiased. It is hard because an ETA has several uses with different loss functions, and a promise changes how people behave.",
    k: ["Report an unbiased central estimate vs a conservative one: central is right on average and late half the time; conservative is rarely late and leaves a rider waiting for a pickup that was early.", "Per-use calibration vs one calibration: per-use matches each loss and complicates the pipeline; one is simple and wrong for some users."],
    p: ["ETA improvements are measured on completed trips only, so a model that causes cancellations looks better.", "Calibration drifts for weeks after a map or app change before anybody checks."],
    v: "Plot predicted against actual quantiles for the last week by city and confirm that the quoted 90 percent time is exceeded by about ten percent of trips and not more than the tolerance.",
    dep: ["eta-model", "analytics-warehouse"]
  },
  "pickup-point-selection": {
    s: "Chooses the specific spot where driver and rider meet, balancing a short walk, a legal and safe stopping place and an easy approach for the car.",
    d: "Given the rider's location, the system generates nearby candidate points from curb data, past successful pickups and zone rules, and scores them on walking distance, access side of the road, restrictions, and driver ETA to reach them. Suggested points are shown to the rider, who may accept or change them. It is hard because the best point depends on the driver's direction of travel, which is unknown until the match is made, and because GPS error puts riders on the wrong side of the street.",
    k: ["Pin at rider location vs suggested snapped points: using the pin is simple and often unreachable; suggestions improve completion and ask riders to walk.", "Choose before the match vs after: before gives the rider a stable answer; after allows a point suited to the driver's approach and changes the instruction late."],
    p: ["A suggested point is across a divided road, and the driver cannot reach it without a long detour.", "A point at a venue entrance is a no-stopping zone that earns drivers fines."],
    v: "Compare completion and no-show rates for trips with suggested points against a control, and verify none of the points lies in a restricted stopping zone.",
    dep: ["road-graph-and-restrictions", "geofences-and-zones", "rider-booking-flow"]
  },
  "turn-by-turn-guidance": {
    s: "Navigation shown to the driver with spoken and visual instructions, rerouting when the driver leaves the route and sharing progress with the rider.",
    d: "The driver app receives the route from the routing engine, matches positions to it, and issues maneuver instructions at the right distances. If the driver deviates, it requests a new route. Updated ETA and route progress are sent back to the platform for rider tracking and pricing. It is hard because on-device guidance must keep working when the network is weak, and because the instructions must agree with the platform's idea of the route.",
    k: ["On-device routing vs server routing: on-device works offline and reacts instantly and needs map data on the phone; server routing is consistent with the platform and depends on the network.", "Aggressive rerouting vs hold course: aggressive adapts to traffic and confuses drivers who know a better way; holding course is calm and can miss real incidents."],
    p: ["The driver's navigation and the platform's route diverge, and the fare estimate and the actual route no longer match.", "Rerouting on every GPS wobble makes the voice instructions flip back and forth."],
    v: "Drive a test route with a forced detour and confirm a reroute arrives within a few seconds, the new ETA reaches the rider app, and the fare logic records the actual route.",
    dep: ["routing-engine", "map-matching", "driver-offer-ui"]
  },
});
