// Details for the ride-hailing plate, part 5: apps and the cross-cutting concerns.
ATLAS.details("ride-hailing", {
  "rider-booking-flow": {
    s: "The rider's path from opening the app to a confirmed request: pickup and destination entry, vehicle options with prices and ETAs, payment choice and confirmation.",
    d: "The app shows a map with the rider's position, searches addresses, then requests quotes for each vehicle class, showing price and pickup time from the pricing and ETA services. On confirmation it sends a request with an idempotency key and moves to a waiting screen driven by trip events. It is hard because every screen shows numbers from several services that can be slow, the network is unreliable, and the app must show an honest state when matching takes long.",
    k: ["Show estimates immediately and refine vs wait for exact numbers: immediate feels fast and may change; waiting is accurate and feels slow.", "Search suggestions from local history vs from the server: local is instant and limited; server suggestions are complete and need a round trip."],
    p: ["The quote shown at confirmation differs from the one charged because the app held a stale quote id.", "Searching for an address near the pickup returns the wrong side of a divided road."],
    v: "On a throttled mobile network, book a trip from a cold start and confirm each screen renders within its target, the request is sent once, and the waiting screen shows the true state through app restarts.",
    dep: ["request-intake", "upfront-pricing", "pickup-point-selection"]
  },
  "driver-offer-ui": {
    s: "The driver app's screens for going online, receiving an offer within seconds, seeing the key facts and accepting or declining.",
    d: "The driver sees status, a map with heat and incentives, and, on an offer, a card with pickup distance, estimated pay and a countdown. Accept binds the trip. The screen must be readable at a glance and safe to use while driving, so it relies on large targets, sound and few words. It is hard because the offer arrives asynchronously over a mobile connection, the countdown must reflect server time, and the app must resume correctly after being backgrounded.",
    k: ["Show destination and pay in the offer vs hide: showing supports informed choices and cherry-picking; hiding raises acceptance and is criticized as opaque.", "Auto-accept option vs always manual: auto-accept speeds matches and risks unsafe or unwanted trips; manual is safe and slower."],
    p: ["The countdown uses the phone clock, and a drifting clock shows an offer as open after it expired.", "Notifications while driving distract the driver and cause crashes."],
    v: "Send test offers to a device in the foreground, background and just after a reconnect, and confirm each is shown within the delivery target with a countdown matching server time to within a second.",
    dep: ["offer-and-accept", "push-and-notifications"]
  },
  "live-trip-tracking": {
    s: "A live map for the rider, and for people they share with, showing the car approaching and then the route to the destination, with updating arrival times.",
    d: "The service subscribes to the assigned driver's location and ETA, smooths the position to avoid jumpy movement, and pushes updates to the rider's app at a regular rate. Share links give a read-only view to others. The view stops when the trip ends. It is hard because showing a moving dot that matches a real road needs map matching and interpolation, because it is high volume, and because it exposes a driver's location to a rider.",
    k: ["Push at a fixed rate vs on significant change: fixed is smooth and costs more traffic; on change saves bandwidth and looks choppy.", "Show exact vehicle position vs delayed or snapped: exact is accurate and reveals driver movements; delayed and snapped protects the driver and looks less live."],
    p: ["The car icon drifts across buildings because positions are not snapped to roads.", "Shared links continue to show a driver's position after the trip ends."],
    v: "Follow a test trip on a rider device and a share link and confirm the icon stays on the road, the ETA updates at least at the specified rate, and the link shows nothing after the trip ends.",
    dep: ["location-stream", "map-matching", "eta-model"]
  },
  "masked-calling-and-chat": {
    s: "Phone calls and messages between rider and driver through temporary proxy numbers or in-app channels, so neither learns the other's real number.",
    d: "At assignment the platform assigns a proxy number or opens an in-app thread tied to the trip. Calls and texts are relayed to the real numbers and recorded as events, with content recording only where the law and policy allow. After the trip ends, the channel closes after a short grace period for lost items. It is hard because telephony is carrier-dependent, proxy numbers are scarce and must be reused safely, and abuse and harassment occur over the channel.",
    k: ["Proxy numbers vs in-app voice and chat: proxy numbers work without data and are scarce and costly; in-app is cheap and needs connectivity on both sides.", "Record calls vs metadata only: recording helps safety investigations and raises consent and storage issues; metadata respects privacy and gives little evidence."],
    p: ["A proxy number is reassigned too quickly and a rider receives a call meant for another trip.", "Channels stay open after the trip and are used to harass."],
    v: "Place a call and send a message through the proxy during a test trip and confirm both sides see only proxy numbers, delivery works, and the channel stops relaying after the grace period.",
    dep: ["trip-state-machine", "push-and-notifications"]
  },
  "push-and-notifications": {
    s: "Delivery of offers, arrival alerts, receipts and safety prompts to phones through push services, text messages and in-app channels, with retries and fallbacks.",
    d: "Services publish notification intents with a priority and a time to live. The service renders them in the user's language, picks channels, sends to the push gateways and records delivery. Time-critical messages such as offers use high priority and a persistent connection when the app is open. It is hard because push delivery is best effort, because operating systems throttle and delay low-priority messages, and because a late offer is useless.",
    k: ["Push only vs push with persistent-connection and text fallback: push alone is simple and unreliable; layered channels raise delivery and cost.", "Short time to live for offers vs long: short avoids stale offers and loses delayed deliveries; long delivers more and shows expired trips."],
    p: ["An offer arrives after it has expired and the driver taps a dead card.", "A notification storm during an outage causes the push provider to throttle the platform."],
    v: "Send test offers, arrival alerts and safety prompts to devices on varied networks and confirm each arrives within its target time and that expired offers are never displayed.",
    dep: ["event-bus"]
  },
  "driver-onboarding": {
    s: "The flow that turns an applicant into an active driver: sign-up, documents, vehicle inspection, background and identity checks, training, and activation city by city.",
    d: "The applicant submits personal details, a license, insurance, and vehicle information. Checks run in parallel and each has a status. Rules per city define what is needed. When all pass, the driver is activated and can go online. It is hard because requirements differ by city and vehicle type, because documents expire and must be renewed, and because every added step loses applicants while skipping a step creates legal and safety exposure.",
    k: ["One flow with city rules vs separate flows per city: one is easier to maintain and complex in rules; separate flows are clear locally and diverge over time.", "Allow going online before all checks complete vs require all: early activation grows supply quickly and carries risk; requiring all is safe and slow."],
    p: ["A driver's insurance expires and nothing blocks them from going online.", "A silent failure in one check leaves applicants stuck without any message."],
    v: "Take a test applicant through every step in a launched city and confirm each check's status is visible, activation happens only when all required checks pass, and an expired document removes eligibility on its date.",
    dep: ["identity-verification", "background-screening", "city-config-and-launch"]
  },
  "support-and-disputes": {
    s: "Tools and processes for riders and drivers to report problems, with agents seeing the whole trip and acting on refunds, fees, lost items and safety issues.",
    d: "Users open a help request from a trip. The agent console shows the route, timeline, fare breakdown, payments, ratings and communications, and offers actions with limits. Many cases are resolved by rules without an agent. Outcomes are fed to quality and fraud systems. It is hard because the volume is high, because agents need powerful access that must be controlled and logged, and because inconsistent decisions are visible and unfair.",
    k: ["Automated resolution of common issues vs human agents: automation is fast and cheap and mishandles unusual cases; humans handle nuance at cost.", "Broad agent permissions vs narrow with escalation: broad speeds resolution and widens abuse and privacy risk; narrow is safe and slower."],
    p: ["Agents browse trips of people they know, because access is not restricted or audited.", "Different agents resolve the same complaint in opposite ways."],
    v: "Open a dispute about a wrong route on a test trip, and confirm the agent sees the trace and fare inputs, the adjustment flows to payment and driver ledger, and every agent view of the trip is recorded in the audit log.",
    dep: ["trip-event-log", "location-history", "refunds-and-adjustments"]
  },
  "end-to-end-latency": {
    s: "The time budget from a rider's tap to an offer on a driver's screen, divided among every step, which constrains which algorithms and dependencies the matching path can use.",
    d: "A request passes intake, candidate search, ETA calls, filtering, optimization and offer delivery, usually in a second or two total. Each step is given a budget, and calls that do not fit are moved off the critical path or cached. Tail latency matters more than averages because a rider experiences the worst step. It is hard because ETA and routing calls multiply per candidate, and one slow dependency delays everyone.",
    k: ["Precompute and cache vs compute on demand: precomputing is fast and stale; on demand is fresh and spends budget.", "Strict timeouts with fallbacks vs wait for the best answer: strict timeouts bound the wait with approximate answers; waiting is precise and unpredictable."],
    p: ["A dependency's p99 latency doubles under load and the sum of budgets is exceeded for all requests.", "Retries inside the path multiply load during an incident."],
    v: "Trace a thousand requests end to end under peak load and confirm each step is within its budget at p50 and p99, and that the total from request to offer delivery meets the target.",
    dep: ["nearest-driver-query", "eta-model", "offer-and-accept"]
  },
  "single-assignment-consistency": {
    s: "The guarantee that a driver holds at most one active offer or trip and a trip has at most one driver, enforced under concurrency, retries and failures.",
    d: "Every transition that binds a driver and a trip goes through an atomic compare-and-set on the driver record and the trip record, with versions. Offers are time-limited reservations that expire. Messages are idempotent so retries do not double-assign. Conflicts are resolved in favor of the first successful write. It is hard because the two records live in different stores, because networks lose acknowledgments, and because the platform must also stay available while it enforces uniqueness.",
    k: ["Strong consistency on assignment vs eventual with repair: strong prevents double booking and adds latency and unavailability risk; eventual is fast and sends two drivers to one rider.", "Reserve first then confirm vs commit directly: reservations separate the decision and make timeouts explicit; direct commits are simpler and harder to undo."],
    p: ["A timeout after a successful bind causes a retry that assigns a second driver.", "A reservation that never expires hides a driver from every future match."],
    v: "Run a test that fires concurrent assignments, retries and message losses at the same drivers and trips, and confirm that no driver ever has two trips and no trip has two drivers.",
    dep: ["driver-state-store", "trip-state-machine", "offer-and-accept"]
  },
  "city-partitioning": {
    s: "Dividing the system by city or region so each partition's load, data and failures are isolated, and so cities can be launched, scaled and regulated independently.",
    d: "Most state is keyed by city: driver index, dispatch ownership, pricing, configuration and trip storage. Partitions run on dedicated or shared capacity sized to local peaks. Cross-city features such as a driver crossing a border or an airport trip between cities need explicit handling. It is hard because cities differ hugely in size, because a few giant cities dominate load, and because the boundary between partitions is where bugs live.",
    k: ["One partition per city vs groups of small cities: per city is simple to isolate and wastes capacity on small ones; grouping is efficient and mixes failure domains.", "Split giant cities by area vs keep whole: splitting spreads load and creates boundary logic; keeping whole is simple and limited by the largest machine."],
    p: ["A trip that starts in one city and ends in another belongs to two partitions and is billed twice or never.", "A giant city's peak overloads its partition while others are idle."],
    v: "Run a load test at twice a big city's peak and confirm other cities' latency is unchanged, then run a cross-boundary trip and confirm it is dispatched, priced and paid exactly once.",
    dep: []
  },
  "graceful-degradation": {
    s: "Deciding in advance what each dependency's failure costs the product and what simpler behavior replaces it, so that matching continues in a reduced form.",
    d: "Each external call has a timeout and a fallback: if the ETA model fails, use routing times or straight-line estimates; if surge data is stale, hold the last multiplier; if the optimizer is slow, fall back to greedy matching; if the push service fails, use text. Load shedding drops low-priority work first. Degraded modes are tested. It is hard because fallbacks are rarely exercised and decay, and because a degraded mode can be worse than an outage.",
    k: ["Fail open to simple behavior vs fail closed: open keeps trips flowing and may charge wrong prices or match poorly; closed is correct and stops business.", "Automatic degradation vs manual switch: automatic is fast and can trigger wrongly; manual is deliberate and slow."],
    p: ["A fallback price is used for hours after the dependency recovers, because nothing flips it back.", "The fallback path was never run in production and fails the first time it is needed."],
    v: "Disable each critical dependency in a rehearsal one at a time, and confirm matching continues in the documented degraded mode, alerts fire, and normal behavior returns automatically after recovery.",
    dep: ["observability-and-slos", "batched-matching", "eta-model"]
  },
  "local-regulation": {
    s: "Rules that differ by place and shape product behavior: licensing, vehicle and driver requirements, pricing limits, data retention, driver classification and mandated reporting.",
    d: "Regulation shows up as configuration and code paths: required documents, caps on fares and driver numbers, minimum pay, trip data reports to authorities, accessibility obligations, and restrictions on pickup places. Rules change by decree and by court decision. A compliance function tracks changes, engineers express rules as data, and every enforcement point is audited. It is hard because rules conflict between jurisdictions and appear suddenly.",
    k: ["Rules as data with a common engine vs custom code per city: data scales to many cities and expresses only anticipated rules; custom code is flexible and accumulates special cases.", "Comply everywhere strictly vs leave a market: strict compliance protects the license and costs product consistency; leaving avoids the burden and loses the market."],
    p: ["A rule change takes effect on a date and the configuration is deployed days after.", "Compliance reports are generated by hand from a database query that nobody maintains."],
    v: "For each launched city, run a compliance checklist against a test build: document requirements, fare caps, data export to the regulator and retention limits, and confirm every item passes with evidence recorded.",
    dep: ["city-config-and-launch", "price-regulation"]
  },
  "location-privacy": {
    s: "Limiting who can see where people are, for how long and at what precision, across rider, driver, support staff, analysts and authorities.",
    d: "Location is needed in real time for dispatch and safety, and as history for disputes and models. Controls include showing riders only what they need, coarsening or delaying data for analytics, tight retention, role-based access with logging, and deletion on request. Data is minimized at the source: the driver's app stops reporting when offline. It is hard because the same data that makes the product work enables stalking and profiling, and because rules vary by country.",
    k: ["Precise location in analytics vs coarsened: precise supports routing and fraud analysis and risks re-identification; coarsened is safer and loses detail.", "Keep long histories vs short retention: long enables investigations and model training and increases exposure; short minimizes risk and loses evidence."],
    p: ["Staff look up a person's trips out of curiosity, because queries are not audited.", "Exported analytics datasets contain home and work locations that can identify individuals."],
    v: "Audit a sample of staff access logs for location queries and confirm each has a ticket and reason, and confirm that analytic datasets contain no trace precise enough to identify a home address.",
    dep: ["location-history", "support-and-disputes", "analytics-warehouse"]
  },
});
