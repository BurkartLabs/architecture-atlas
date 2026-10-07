// Details for the booking system plate, part 3: availability search, holds, lifecycle, inventory model.
ATLAS.details("booking-system", {
  "availability-query": {
    s: "Takes dates, party size and options and returns which products and rate plans can be sold, applying inventory, restrictions and pricing.",
    d: "The query expands the request into the slots or nights it covers, reads remaining counts for each from the index or ledger, filters by restriction and eligibility rules, and attaches prices. A multi-night stay is available only if every night is. For options such as adjacent seats or linked rooms it delegates to the matching component. It is the busiest read path, called many times per booking. The challenge is latency at scale and keeping filters identical to the rules enforced at hold time.",
    k: ["Compute on request vs serve precomputed results: computing is always fresh and costly; precomputing is fast and needs invalidation on every change.", "One query path for all channels vs per-channel variants: one path guarantees equal answers; variants allow channel limits and risk drift."],
    p: ["The search applies fewer rules than the hold step, so it offers options that always fail at booking.", "A multi-night query reads each night separately without a consistent snapshot and shows a gap that has just been booked."],
    v: "Run searches for single and multi-night requests against a calendar with known gaps, restrictions and blocks. Each result set should equal a hand-derived answer, and every offered option should pass a hold.",
    dep: ["availability-index", "restriction-rules", "rate-plans", "multi-resource-matching"]
  },
  "availability-index": {
    s: "A read-optimized copy of remaining capacity by product, date and slot, built from the ledger to answer searches without touching the transactional store.",
    d: "The index keeps counts or bitmaps per resource and time in a structure that supports fast range reads, such as all nights in a stay at once. It is updated from change events after every booking, hold, cancellation or block, and rebuilt from the ledger if it drifts. It may be sharded by venue or product. The challenge is lag and correctness: the index can be slightly behind, so it can only be advisory, and it must never be used as the authority for a sale.",
    k: ["Updated synchronously with bookings vs updated from events: synchronous is fresh but couples write latency; events are decoupled and a little stale.", "Counts per slot vs per-resource bitmaps: counts are compact and answer most queries; bitmaps support exact matching of specific units and cost more space."],
    p: ["A missed event leaves the index showing stock that is gone, and nothing repairs it until a rebuild.", "The index is used by the booking step to decide, and two requests both pass the check."],
    v: "Make a burst of bookings and cancellations, then compare every index entry with a direct count from the ledger. Differences should be zero after the stated lag, and a forced rebuild should reproduce the same data.",
    dep: ["availability-ledger", "read-model-projections", "domain-event-log"]
  },
  "multi-resource-matching": {
    s: "Finds combinations of units that satisfy a request: adjacent seats, linked rooms, a stylist plus a chair, a table for a party that may need joining.",
    d: "Many bookings need more than one resource at once, or a specific arrangement. The matcher searches for sets that fit constraints: adjacency, same section, required equipment, staff skills and travel time between steps. It scores candidates by how well they preserve future sellability, avoiding fragmenting a row or isolating single seats. The problem is combinatorial and must run in milliseconds, so heuristics replace exhaustive search. The challenge is quality and consistency with what the hold step later reserves.",
    k: ["Greedy placement vs global optimization: greedy is fast and predictable but fragments inventory; optimization packs better and costs compute and is harder to explain.", "Auto-assign units at booking vs assign at arrival: early assignment lets guests plan; late assignment keeps flexibility to re-pack and handle changes."],
    p: ["Placing parties at the first fit leaves orphan single seats that no one can buy.", "The matcher chooses units that another request has just taken, and the hold step fails with no retry."],
    v: "Request parties of varying sizes against a seating map or schedule with known free blocks and compare the placements with an exhaustive search for small cases. Fragmentation after a full day should be within the target.",
    dep: ["resource-hierarchy-and-combos", "availability-index", "capacity-and-units"]
  },
  "search-cache": {
    s: "Stores recent search answers for popular queries so repeated searches do not recompute them, with expiry tied to how fast availability changes.",
    d: "Keys combine dates, party, product and channel. Short lifetimes of seconds to minutes balance freshness and load, and busy slots expire sooner. Events can invalidate entries when counts cross a threshold, such as dropping to zero. Cached answers are always advisory. The challenge is the key space: too many variants and the hit rate collapses, and the invalidation work can cost more than recomputing.",
    k: ["Time-based expiry vs event-based invalidation: time is simple and bounded in staleness; events are fresher and need correct wiring to each change source.", "Cache full results vs cache building blocks such as per-night counts: full results hit rarely but save the most; building blocks hit often and need assembly."],
    p: ["Cached results include prices from a rate that has since changed and the guest is shown a cheaper figure than they can get.", "A cache stampede after expiry sends thousands of identical queries to the store at once."],
    v: "Measure hit rate under realistic traffic, then change availability and prices and confirm cached results correct themselves within the stated bound. A burst after forced expiry should not exceed the store's capacity.",
    dep: ["caching-layer", "availability-query", "staleness-revalidation"]
  },
  "result-ranking-and-packaging": {
    s: "Orders and groups what is available into the options a guest sees: best value, recommended, cheapest first, and bundles with extras.",
    d: "Given feasible options, the ranker orders them by price, fit, margin, popularity, availability, or business goals, and groups them into packages such as room plus breakfast. It may hide dominated options and surface alternatives when the exact request is unavailable: nearby dates, a different time. Ranking must not misrepresent availability. The challenge is that business objectives like margin conflict with guest expectations, and results must be stable enough that reloading does not reshuffle them.",
    k: ["Rank by price vs by blended score: price is transparent and expected; blended scores improve revenue or satisfaction and must stay explainable to avoid distrust.", "Show alternatives when empty vs only exact matches: alternatives recover lost sales and can feel pushy or confusing."],
    p: ["Promoted options appear first without labeling, and guests feel steered.", "Ranking uses cached popularity that favors already sold-out items, and top results are unavailable."],
    v: "Compare displayed order against the stated rule for several queries, include a sold-out nearby date to see alternatives, and check that two reloads return the same order without data changes.",
    dep: ["availability-query", "reporting-and-forecasting", "rate-plans"]
  },
  "staleness-revalidation": {
    s: "The step that re-checks a chosen option against live inventory and price when the guest moves from searching to holding, so cached or lagging views cannot cause a sale.",
    d: "Search is advisory. When the guest selects an option, the system re-reads authoritative counts and re-evaluates rules and price, and either proceeds to a hold or returns a specific message and alternatives. It also handles prices that moved since the search. Good revalidation fails fast and gently. The challenge is user experience, since many guests choose from stale data, and avoiding extra load on the authoritative store by making the check part of the hold itself.",
    k: ["Separate check then hold vs a single atomic hold attempt: separate is simpler but leaves a gap; atomic closes it and returns one clear result.", "Honor a slightly stale price vs require the new price: honoring is friendly and costs margin; requiring is strict and loses conversions."],
    p: ["The check and the hold are separate calls, and a sale slips in between.", "The error says only unavailable, and guests leave instead of choosing a nearby option."],
    v: "Select an option from a deliberately stale result after another session takes the last unit. The hold must fail with a specific message and alternatives, and the price shown after a rate change must match the charged price.",
    dep: ["inventory-hold", "availability-ledger", "price-quote-and-lock"]
  },

  "inventory-hold": {
    s: "A temporary claim on specific inventory for a short window while the guest completes details and payment, released automatically if not confirmed.",
    d: "A hold decrements available counts or marks specific units, with an owner, a quote and an expiry. It is created atomically with the availability check. While held, the units are not offered to others, yet remain not sold. Confirmation converts the hold into a booking; expiry or abandonment releases it. Holds may be soft, shown but not guaranteed, or hard. The challenge is length: short holds frustrate slow payers and long ones let abandoned carts starve real demand.",
    k: ["Hold at selection vs at payment start: early protects the guest's choice and burns inventory on browsers; late is efficient and risks failing after the guest has invested effort.", "Hold specific units vs decrement a pool count: specific units support seat maps and exact assignment; counts are simpler and scale better."],
    p: ["Holds for abandoned carts accumulate during a peak and make a sold-out slot appear full of nothing.", "Extending a hold on every guest action lets a script keep a slot indefinitely."],
    v: "Create a hold, observe the units removed from search, let it expire and verify they return exactly once. Then confirm it and verify the count of sold units increases by one and the hold no longer exists.",
    dep: ["double-booking-prevention", "availability-ledger", "price-quote-and-lock", "scheduler-and-timers"]
  },
  "hold-expiry-sweeper": {
    s: "The background process that finds expired holds and returns their inventory, and the checks that stop an expired hold from being confirmed late.",
    d: "Expiry is enforced two ways. At confirmation, the engine checks the hold is still valid and rejects an expired one even if the sweeper has not run. The sweeper then releases stale holds in batches and emits release events for search, channels and the waitlist. It uses the database clock or a single time source to avoid disagreement. The challenge is the race between a payment completing just as the hold expires, which needs a clear rule about who wins and what happens to the money.",
    k: ["Lazy expiry on read vs active sweeping: lazy needs no process but leaves counts wrong until touched; sweeping keeps counts accurate and needs scheduling and monitoring.", "Grace period after expiry for in-flight payments vs hard cutoff: grace avoids charging for lost slots and lengthens hold times; hard cutoff is clean and requires refunds."],
    p: ["The sweeper falls behind during peak load, and sold-out-looking slots are actually free for minutes.", "A payment succeeds after the hold is released and the guest is charged for a booking that does not exist."],
    v: "Create thousands of holds that expire at once and measure the time until all units are available again. Complete a payment exactly at expiry and confirm either a booking exists or an automatic refund is issued.",
    dep: ["scheduler-and-timers", "time-source-and-clock-skew", "availability-ledger", "refunds-and-credits"]
  },
  "double-booking-prevention": {
    s: "The mechanisms that guarantee one unit of inventory is never confirmed to two guests: constraints, locks or serialized updates at the point of reservation.",
    d: "The reliable pattern is to make the conflict impossible in the store: a unique constraint on unit and slot, an exclusion constraint on overlapping time ranges, or a conditional update that decrements a count only when it is above zero. Optimistic versions detect concurrent changes; row locks serialize hot items. The check and the write must be in one atomic step. The challenge is spanning multiple slots or resources and avoiding deadlocks, while keeping throughput on a very hot item.",
    k: ["Database constraints vs application-level locks: constraints cannot be bypassed by any path; application locks are flexible and fail when one code path forgets them.", "Pessimistic row locks vs optimistic version checks: locks queue safely under contention but limit throughput; optimistic retries are fast when conflicts are rare and storm when they are not."],
    p: ["A check-then-insert race lets two requests pass the check before either writes.", "Multi-night bookings lock nights in different orders, and concurrent requests deadlock."],
    v: "Run hundreds of concurrent requests for the same unit and overlapping ranges from every path including staff and partners, then confirm no two confirmed bookings overlap on any unit, using a query over the stored data.",
    dep: ["transaction-boundaries", "booking-store", "availability-ledger", "time-slot-model"]
  },
  "idempotent-booking-requests": {
    s: "Makes the hold and confirm calls safe to repeat by storing a client key with each result and returning the original outcome for a repeat.",
    d: "The client sends a unique key with each mutating call. The server stores the key with the request fingerprint and result inside the same transaction as the effect. A repeat with the same key returns the stored result without acting again; the same key with a different payload is an error. Keys expire after a window longer than any plausible retry. The challenge is the in-progress case, where a second request arrives while the first is still running, and keys for calls that span services.",
    k: ["Key stored in the same transaction as the effect vs in a separate cache: same transaction is exact and survives crashes; a cache is faster and can lose keys and repeat actions.", "Return the stored response vs reject duplicates with an error: returning the response makes retry trivial for clients; errors are simple and force clients to handle them."],
    p: ["The key is recorded before the work finishes, and a crash leaves a key with no result, blocking retries.", "Keys are generated per attempt instead of per intent, so every retry looks new."],
    v: "Submit the same confirm request concurrently ten times and after a simulated crash mid-request. Exactly one booking and one charge should exist, and every response should describe that booking.",
    dep: ["transaction-boundaries", "booking-store"]
  },
  "seat-selection-locking": {
    s: "Temporary locks on individual seats or units chosen on a map, so several guests can browse a layout and pick without picking the same one.",
    d: "As a guest clicks seats, each seat is locked briefly under their session. Others see it as taken, or tentative. Locks release when the guest deselects, the session ends or the timer expires, and convert to a hold at checkout. Real-time updates push seat states to every viewer. The challenge is volume: thousands of viewers on one map, rapid changes, and the temptation to lock too many seats, as well as best-available selection that must avoid splitting parties.",
    k: ["Lock on click vs lock only at checkout: lock on click prevents conflicts in the interface and is abusable; checkout locking is gentle and shows seats that fail at the end.", "Push updates to all viewers vs periodic polling: push feels live and costs connections; polling is cheap and shows stale maps."],
    p: ["A script clicks every seat and holds a whole section without buying.", "Two guests see the same seat as free because the update reached one browser late and the lock call decided the winner after a visible click."],
    v: "Open the same map in three sessions, select overlapping seats and confirm the first lock wins, others see it within a second, and abandoned selections release at the configured time.",
    dep: ["inventory-hold", "double-booking-prevention", "rate-limiting-and-quotas", "resource-hierarchy-and-combos"]
  },
  "virtual-waiting-room": {
    s: "A queue in front of booking that admits guests at a rate the system can handle during an on-sale or traffic spike, ordering them fairly.",
    d: "When demand exceeds capacity, new visitors get a place in line and a token. The room releases people into the booking flow in batches sized to what the core can process, with a time limit to act. It can order by arrival, by a random draw within a pre-sale window, or by verified accounts. It sits at the edge, so the core never sees the surge. The challenge is bot resistance, honest wait estimates and ensuring only holders of a valid token can reach booking.",
    k: ["Arrival order vs randomized within a window: arrival is intuitive and rewards speed; randomization removes the race and feels fair to those who arrive a minute late.", "Enforce tokens at the edge only vs at the booking API too: edge only is simple and bypassable by direct calls; API enforcement is strict and adds checks everywhere."],
    p: ["The booking endpoint accepts requests without a token, so scripts bypass the queue.", "Admitted guests are released faster than the core can process and the system fails despite the queue."],
    v: "Run a ten-times-capacity load against a test on-sale and check that admission rate stays at the setting, direct API calls without a token are refused, and no guest is admitted out of order or twice.",
    dep: ["rate-limiting-and-quotas", "bot-and-abuse-protection", "inventory-hold"]
  },

  "booking-state-machine": {
    s: "The defined set of states a booking passes through and the allowed transitions, each with required checks and side effects.",
    d: "States commonly include held, pending payment, confirmed, modified, canceled, no-show, checked in and completed. A transition function validates the current state, applies the change in a transaction and emits an event; illegal moves are refused. Payments, inventory and notifications react to events. Having one place that defines legal changes keeps channels and staff consistent. The challenge is concurrency, such as a cancel arriving with a payment, and states for partially failed operations like paid but not yet confirmed.",
    k: ["Explicit state machine vs status flag edited anywhere: explicit transitions enforce invariants and are testable; free flags are quick to build and accumulate impossible combinations.", "Separate booking and payment states vs one combined state: separate states reflect that each moves independently; combined is simpler and hides the awkward cases."],
    p: ["Two actors change the same booking at once and the last write silently wins.", "A booking stays pending after a failed payment callback and holds inventory forever."],
    v: "Attempt every transition from every state in a test, including concurrent pairs such as cancel and pay. Only the defined moves succeed, and each leaves one consistent record, event and money state.",
    dep: ["booking-record", "transaction-boundaries", "domain-event-log"]
  },
  "confirmation-commit": {
    s: "The atomic step that turns a valid hold plus a successful payment into a confirmed booking, consuming the inventory and emitting the events that follow.",
    d: "It verifies the hold is live and the quote matches, checks payment status, then in one transaction writes the confirmed booking, converts the hold into a sale in the ledger and records an outbox event. Messages, channel updates and reports follow from that event. If payment and booking live in different systems, the order of steps and the compensation for failures matter most. The challenge is partial failure: money taken with no booking, or a booking with no money.",
    k: ["Authorize before commit, capture after vs charge first: authorizing first lets the booking fail safely and releases funds; charging first is simple and requires refunds on failure.", "Synchronous commit in the web request vs asynchronous completion: synchronous gives an immediate answer and ties up the request; asynchronous scales and needs a pending state."],
    p: ["The payment succeeds, the process dies before the commit, and no booking exists.", "Events are published before the transaction commits, and downstream systems act on a booking that rolls back."],
    v: "Kill the process at each step of a test confirmation and restart. Every run must end in exactly one of: a confirmed booking with matching payment, or no booking and no net charge.",
    dep: ["transaction-boundaries", "outbox-and-queues", "payment-authorization", "inventory-hold"]
  },
  "booking-record": {
    s: "The stored reservation itself: guest, items, dates, resources, price breakdown, accepted terms, source channel and the history of changes.",
    d: "The record is the system's source of truth for a promise to a guest. It stores identifiers, the locked price breakdown, the policy snapshot accepted at purchase, party details, channel references, payments and a version number for concurrency control. Changes append to a history. It must be readable years later for disputes and accounting. The challenge is evolving the shape over time without altering old bookings, and keeping the partner's reference and ours mapped one to one.",
    k: ["Snapshot of terms in the record vs references to configuration: snapshots are stable and larger; references are compact and make old bookings change when configuration does.", "Mutable record plus history vs append-only events: mutable is simple to read; events give complete history and require projections for current state."],
    p: ["A schema change reinterprets old bookings and their historical prices differ.", "Free-text notes hold payment or health details beyond the intended access."],
    v: "Load bookings from several years and channels, and confirm each shows its original price, terms and channel reference. Replay a booking's history and check it reproduces the current state.",
    dep: ["booking-store", "price-quote-and-lock", "cancellation-policies"]
  },
  "amendment-flow": {
    s: "Handles a guest or staff change to a confirmed booking: new dates, party size, unit or extras, with availability, price difference and policy applied.",
    d: "An amendment is not a cancel and rebook for the guest, but internally it often is one atomic transaction: hold the new slot, verify rules and price, release the old inventory, settle the difference and update the record. If the new slot is not available, nothing changes. Policies decide fees and whether the old rate is kept. The challenge is atomicity across inventory and money, and fairness rules such as keeping a discounted rate on a similar change.",
    k: ["Modify in place vs cancel and rebook under the hood: in place keeps one reference and a continuous history; rebook reuses tested paths and complicates records.", "Reserve the new slot before releasing the old vs release first: reserving first never leaves the guest with nothing and briefly needs both; releasing first frees inventory and risks losing both."],
    p: ["The old slot is released before the new hold succeeds and the guest is left without a reservation.", "A price difference is charged but the change fails afterward and the extra payment is never refunded."],
    v: "Change dates on test bookings to available and full slots, upward and downward in price. Available changes should settle the exact difference; full slots should leave the booking and its payment unchanged.",
    dep: ["inventory-hold", "price-quote-and-lock", "booking-state-machine", "refunds-and-credits"]
  },
  "cancellation-flow": {
    s: "Processes a cancellation: checks the policy for this moment, releases inventory, calculates the fee and refund, notifies everyone and offers the slot to others.",
    d: "The flow loads the booking and its stored policy, computes the fee from the time to the slot, then in one transaction moves the booking to canceled, releases inventory and records the money decision. Afterward, events trigger the refund, partner updates, the waitlist and the guest message. Cancellations from a partner arrive through the same path. The challenge is ordering and repeat safety, as well as exceptional cases such as a venue-initiated cancellation or force majeure waiving all fees.",
    k: ["Release inventory immediately vs after refund completes: immediate maximizes resale; waiting avoids releasing a slot while money is unresolved, and delays resale.", "Policy evaluated at request time vs at processing time: request time is what the guest saw and fair; processing time is simpler and can cross a cutoff in a queue."],
    p: ["A cancellation processed twice refunds twice.", "Venue-initiated cancellations use guest-cancellation fees by mistake, charging customers for the venue's own closure."],
    v: "Cancel test bookings in each policy window, from guest, staff and partner paths, and with a repeated request. Each should release inventory once, produce the correct refund once and send one message.",
    dep: ["cancellation-policies", "refunds-and-credits", "booking-state-machine", "release-matching"]
  },
  "check-in-and-fulfillment": {
    s: "Records that the guest arrived and the service was delivered: checking in, assigning final units, collecting balances and closing the booking.",
    d: "At arrival, staff or a scanner finds the booking, checks identity or code, assigns or confirms the unit, collects anything owed and marks the booking checked in. After the slot, it moves to completed, which releases deposits, triggers payouts and invites feedback. Early or late arrival, partial use and walk-ups are variations. The challenge is working with imperfect connectivity and imperfect data: a booking not found, a duplicate scan and last-minute unit changes.",
    k: ["Assign units at booking vs at check-in: at booking gives certainty; at check-in allows re-packing for no-shows and maintenance.", "Auto-complete after the slot vs require staff closure: automatic is clean and wrong when something went unrecorded; closure is accurate and often forgotten."],
    p: ["A booking not found at the desk because it came through a partner and was never synced, and the guest is turned away.", "Completion is not recorded and payouts to the supplier are delayed or missing."],
    v: "Check in test guests by code, by name search and offline, including a duplicate and a wrong date. Confirm states, assigned units and the transition to completed with payouts triggered once.",
    dep: ["booking-state-machine", "mobile-and-checkin", "booking-record", "supplier-payouts-and-commission"]
  },

  "inventory-model": {
    s: "The core design decision of what a bookable thing is: unit, slot, pool or duration, and how those combine, which determines what can be expressed at all.",
    d: "Models differ by what is exclusive. Lodging sells units per night; ticketing sells numbered seats or pooled capacity per event; appointments sell a person's time; rentals sell an item for a duration. Some inventory is exact units, some counts of interchangeable units, some capacity shared across overlapping bookings. The model defines the key for conflict checks and the shape of availability data. The challenge is that a model chosen too narrowly cannot later express a new product without migration.",
    k: ["Specific units vs interchangeable counts: specific units allow assignment and maps and complicate overlap logic; counts scale simply and cannot say which unit.", "Discrete time slots vs continuous intervals: slots are simple to index and count; intervals allow flexible durations and need range logic and constraints."],
    p: ["A model of nights cannot represent same-day hourly use, and the business forks a second system.", "Interchangeable counts are used where units differ, and guests are promised features no remaining unit has."],
    v: "Express each product the business sells, including odd cases like overnight events and shared resources, in the model without special cases, and verify conflict checks reject exactly the overlaps the business considers conflicts.",
    dep: ["resource-catalog", "time-slot-model", "capacity-and-units"]
  },
  "resource-catalog": {
    s: "The list of bookable things with their attributes, types, locations and descriptions, which search, pricing and channels all refer to.",
    d: "Each resource has an identifier, a type, attributes such as size, features, accessibility and location, media and a lifecycle state: draft, active, out of service, retired. Resources group into types that are sold, and staff manage them without code changes. Other components reference resources by identifier, so history keeps meaning after edits. The challenge is change management: renaming, merging and retiring resources while bookings exist, and keeping catalogs consistent with partner copies.",
    k: ["Stable identifiers separate from display names vs names as keys: identifiers survive renaming and merging; names are readable and break references on edit.", "Attributes as free tags vs structured fields: tags are quick to add; structured fields support filters, rules and channel mapping."],
    p: ["A resource is deleted while future bookings reference it, and those bookings lose their unit.", "Catalog edits change descriptions on confirmed bookings, altering what the guest was promised."],
    v: "Add, rename, merge and retire a resource with future bookings and confirm each booking still resolves to the right unit, search reflects the change and channels receive consistent updates.",
    dep: ["inventory-model", "booking-store"]
  },
  "resource-hierarchy-and-combos": {
    s: "Relationships among resources: types that contain units, rooms that connect, tables that join, and items that must be booked together or exclude each other.",
    d: "Hierarchies group units into types and locations, so a guest buys a type and the system assigns a unit. Combinations let two adjoining rooms act as a suite, or a table pair seat a large party, which makes one resource's availability depend on others. Dependencies model a stylist needing a chair or a tour needing a guide and a vehicle. The challenge is that booking a part blocks the whole, and the reverse, and every such rule must hold in search, hold and channel feeds.",
    k: ["Model combos as separate resources with links vs compute them on demand: links make availability a simple lookup; computing saves data and costs time at search.", "Assign at type level then pick a unit later vs book units directly: type level maximizes flexibility; direct booking gives guests certainty."],
    p: ["A suite is sold while one of its rooms is booked, because the dependency was only checked in one direction.", "Joining tables for a party strands the small tables and the venue cannot seat the next wave."],
    v: "Book each part of a combination and the whole in all orders and confirm availability of the others changes correctly in search, holds and channel updates, and that unbooking a part restores the combo.",
    dep: ["resource-catalog", "availability-ledger"]
  },
  "time-slot-model": {
    s: "How time is divided and represented for booking: fixed slots, nights, variable-length intervals and buffers between uses.",
    d: "A slot model might use nights from a check-in day, 30-minute blocks, or arbitrary start and end times. Durations, setup and cleanup buffers and lead times determine which intervals can follow one another. Slots are stored in the venue's local time with a zone, and mapped to absolute instants for ordering. The model decides the unit for counting availability and for conflict checks. The challenge is boundaries: back-to-back bookings, daylight shift days, midnight crossings and buffers that make a short service block a long window.",
    k: ["Fixed grid of slots vs free-form intervals: a grid is simple to index and cache; free-form fits irregular services and needs range-aware constraints.", "Buffers as part of the booking vs as gaps in the schedule: part of the booking is explicit and visible in conflicts; gaps are flexible and easy to forget."],
    p: ["A booking ending at 10:00 and another starting at 10:00 are treated as overlapping because the boundary is inclusive on both ends.", "Cleanup buffers are ignored by one channel and bookings are accepted with no time to prepare."],
    v: "Test back-to-back, midnight-crossing and daylight-transition bookings with and without buffers; the accepted and refused combinations should match the written rules exactly, in search and at hold.",
    dep: ["schedules-and-exceptions", "time-and-timezones"]
  },
  "schedules-and-exceptions": {
    s: "The calendar of when a resource is open and bookable: regular hours and seasons, plus holidays, closures, special events and maintenance windows.",
    d: "A base weekly pattern with seasons defines normal availability. Exceptions override specific dates: closed, shortened hours, extra capacity. Staff availability and shift patterns work the same way for appointments. Schedules are expanded into concrete slots for a rolling horizon and recalculated when edits arrive, which may affect existing bookings. The challenge is changes that conflict with what has been sold, such as closing a day already booked, and producing the same result in search, rules and channel feeds.",
    k: ["Expand schedules into stored slots vs compute on the fly: stored slots are fast and need regeneration on change; computing is flexible and slower.", "Reject schedule changes that conflict with bookings vs allow and flag: rejecting protects guests but blocks urgent closures; flagging allows reality and creates cancellations to handle."],
    p: ["A holiday exception is added for one product but not its linked resources, and the venue is sold while closed.", "Edits regenerate slots and wipe manual blocks that were stored in the same table."],
    v: "Add a closure over dates with bookings and confirm search stops offering them, affected bookings are listed for handling, and removing the closure restores availability without losing manual blocks.",
    dep: ["time-slot-model", "resource-catalog", "availability-ledger"]
  },
  "capacity-and-units": {
    s: "How much of a resource can be sold at once: one party, N units, N people, or overlapping capacity, and how bookings consume it.",
    d: "Capacity may be a count of rooms, a number of seats in a class, minutes of a staff member's time, or a headcount with a maximum per session. Bookings consume different amounts: a party of four takes four seats or one table. Capacity can be shared across products, as a tour and a private charter drawing on the same boat. It can change by date. The challenge is shared and variable consumption: aggregates must always equal the sum of what bookings consume.",
    k: ["Consume units per booking vs consume weighted capacity: units are easy to explain; weighted capacity fits groups and mixed products and complicates counts.", "Shared pool across products vs separate pools per product: pools use stock fully; separate pools are simple to reason about and strand capacity."],
    p: ["Two products share a vehicle but count it separately, and both sell out the same departure.", "Capacity is lowered for a date below the number of existing bookings, with no alert."],
    v: "Book a mix of party sizes and products against a shared resource until full, then verify the sum of consumption equals capacity and no further booking is accepted by any path.",
    dep: ["inventory-model", "availability-ledger"]
  },
  "availability-ledger": {
    s: "The authoritative record of capacity and what has consumed it, per resource and slot: sold, held and blocked quantities, updated atomically with every change.",
    d: "The ledger holds remaining counts or per-unit occupancy, derived from capacity minus confirmed bookings, holds and blocks. Every change writes an entry with the booking or hold that caused it, so any number can be explained and rebuilt. Updates use conditional writes so a count never goes negative. All other availability views derive from it. The challenge is hot rows: popular slots take many writes, and the ledger must stay consistent with the booking records it summarizes.",
    k: ["Store counters directly vs derive from bookings on read: counters are fast and can drift; deriving is always right and expensive without caching.", "One row per slot vs sharded counters per slot: one row is simple and exact; sharded counters spread writes and make the check for the last unit harder."],
    p: ["Counters drift from the booking table after a partial failure, and no job notices.", "A hot slot becomes a single contended row and throughput falls to a trickle."],
    v: "Periodically recompute every counter from the bookings, holds and blocks and compare with the stored value; run it after a chaos test with killed processes. All differences should be zero or explained.",
    dep: ["booking-store", "capacity-and-units", "transaction-boundaries"]
  },
  "recurrence-rules": {
    s: "Patterns for repeating bookings and schedules: every Tuesday at ten, monthly, until a date, with exceptions for single occurrences.",
    d: "A recurring booking stores a rule in a standard form and a set of exceptions, and the system materializes occurrences for a rolling horizon, each checked against availability. The first conflict decision matters: skip, move or fail the series. Editing one occurrence, this and following, or all, requires careful semantics. Time zones and daylight shifts apply to every occurrence. The challenge is long horizons and changing rules: a future closure can invalidate dozens of occurrences, and each one needs a decision.",
    k: ["Materialize occurrences ahead vs expand on demand: materialized occurrences are real bookings with holds and are easy to change; on-demand is light and unreserved.", "Series fails if any occurrence conflicts vs skip conflicts: failing is predictable; skipping is friendly and leaves the guest missing sessions unaware."],
    p: ["A weekly slot drifts an hour after a daylight change because the rule used a fixed offset.", "Editing one occurrence rewrites the whole series because the scope was ambiguous."],
    v: "Create a weekly series across a daylight change and a closure date, edit one occurrence and then all following. The calendar should keep the local time, show the conflict decision, and change only the chosen scope.",
    dep: ["time-slot-model", "schedules-and-exceptions", "time-and-timezones"]
  },
});
