// Details for the music streaming plate, part 5: platform and cross-cutting concerns.
ATLAS.details("music-streaming", {
  "identity-and-sessions": {
    s: "Authenticates listeners and devices, issues session tokens, and ties each request to an account, a device and an entitlement set.",
    d: "Sign-in by password, federated login or a one-time code produces a refresh credential stored on the device and short-lived access tokens carried on every request. Tokens name the account, device and coarse entitlements. Services verify tokens locally with public keys, and refresh through the identity service. Device registrations track which devices are allowed, supporting limits and remote sign-out. Account sharing, family plans, child accounts and recovery flows add policy. Everything depends on this service, so an outage here is an outage of the whole product.",
    k: ["Self-contained signed tokens vs server-side sessions: signed tokens scale and cannot be revoked instantly; server sessions revoke at once and need a lookup on every call.", "Long-lived device credentials vs frequent re-login: long-lived keeps listeners signed in for years and raises the cost of a stolen device; frequent login is safer and annoys."],
    p: ["Access tokens with long lifetimes keep a banned or canceled account working long after the decision.", "Token verification keys rotated without an overlap window sign out every active listener."],
    v: "Sign in on two devices, revoke one remotely, and confirm that its next API call after the token lifetime fails while the other continues; rotate the signing key and confirm no listener is signed out.",
    dep: ["user-data-store","key-management"]
  },
  "subscription-billing": {
    s: "Manages plans, trials, payments, renewals, refunds and payment failures, and publishes the resulting subscription state to the rest of the service.",
    d: "Accounts subscribe through card, carrier, store or gift routes, each with its own billing events. The billing system keeps a state machine: trial, active, grace after a failed payment, paused, canceled, expired. It charges on schedule with retries, handles taxes and currencies, and emits events when the state changes, which refresh entitlements. Family and bundle plans add membership relations. Money and law make it strict: wrong charges are refunds and regulators, and third-party billing channels deliver events late and out of order.",
    k: ["Own billing vs delegating to channel partners such as carriers and app stores: own billing controls pricing and the relationship; partners reach people who will not enter a card and take fees and delay data.", "Immediate cutoff on failed payment vs grace period: cutoff protects revenue; grace period retains customers whose card merely expired."],
    p: ["Processing billing events by arrival order instead of effective time lets a stale cancellation override a newer renewal.", "Trial abuse with repeated new accounts costs real delivery and license fees."],
    v: "Run a test account through trial, charge, failed payment with grace, recovery and cancellation, and confirm each transition emits exactly one event and entitlements change at the stated times.",
    dep: ["identity-and-sessions","user-data-store","event-pipeline"]
  },
  "event-pipeline": {
    s: "The durable stream that carries every client and server event, from plays and searches to errors, to the systems that count, aggregate, analyze and react.",
    d: "Producers write events to partitioned append-only logs through a collection endpoint, which validates against a schema registry and acknowledges after durable write. Consumers include stream processors for real-time counters, loaders for the data lake, and services that react. The contracts between teams are the schemas; incompatible changes break downstream jobs silently. Delivery is at-least-once, so consumers deduplicate. Volume is huge and bursty, so partitioning, backpressure and retention policies must be planned, not discovered in an incident.",
    k: ["Strict schema validation at ingest vs accepting anything and cleaning later: strict keeps data usable and rejects events during a bad release; permissive loses nothing and moves the pain downstream.", "Long retention in the log vs short with archive to the lake: long retention allows replay and costs storage; short is cheap and replay depends on the lake."],
    p: ["A schema change that renames a field breaks royalty jobs overnight and is noticed at month end.", "A hot partition key, such as a viral track id, overloads a single consumer while others idle."],
    v: "Publish a burst at ten times the normal rate with a duplicate batch, and confirm all events arrive in the log, consumers deduplicate to exact counts and lag returns to normal within the target.",
    dep: ["observability"]
  },
  "metadata-serving-store": {
    s: "The read-optimized store of catalog entities served to apps, search and other services at very high rates with low latency, separate from the ingestion system of record.",
    d: "Catalog changes flow from ingestion into denormalized documents per track, album, artist and playlist, stored in a replicated key-value or document store with heavy caching. Reads are by id in batches of dozens, from every surface. Documents include resolved names, artwork, and availability hints, so a screen can render from few calls. Consistency is eventual: a change reaches serving within seconds to minutes. The difficulty is size and fan-out: a popular artist update invalidates many cached documents.",
    k: ["Denormalized documents vs normalized tables joined at read: denormalized reads are fast and make updates fan out; normalized updates are simple and reads are slow.", "Version-stamped cache entries vs time-to-live expiry: version stamps invalidate precisely and need a change feed; time-to-live is simple and shows stale data for its duration."],
    p: ["A change that updates the store but not the search index leaves different surfaces showing different titles.", "Cache stampedes after invalidating a popular album send every request to the store at once."],
    v: "Rename a test album and measure the time until every surface returns the new name, and confirm a 10,000 requests per second read test of a hot album keeps latency within budget with no origin spike.",
    dep: ["identifier-registry","metadata-schema","event-pipeline"]
  },
  "user-data-store": {
    s: "The durable, partitioned storage for per-account data such as library, playlists, settings and follows, designed for low-latency reads and writes by account key.",
    d: "Data is partitioned by account id, so most operations touch one partition and scale horizontally. Records are replicated across zones, with writes acknowledged by a quorum. Playlists and libraries use revisioned documents or operation logs to support sync. Hot spots appear for shared objects, such as a playlist with millions of followers, and need separate handling. Backup, per-region residency and deletion on request are required. The store is the most sensitive dataset, so access is audited and minimized.",
    k: ["Partition by account vs by object: account partitioning keeps a listener's data together and makes shared objects awkward; object partitioning suits popular playlists and scatters a user's data.", "Strong consistency within an account vs eventual: strong is what listeners expect after saving something; eventual is cheaper across regions and shows save-then-missing surprises."],
    p: ["Cross-account operations such as follower counts done as read-modify-write on a hot row cause contention and lost updates.", "Backups that outlive deletion requests keep erased data recoverable."],
    v: "Write from one region and immediately read from the same account in another, and confirm the stated consistency holds; delete an account and confirm no store, replica or backup restore retains readable data past the deadline.",
    dep: ["regional-failover"]
  },
  "service-gateway": {
    s: "The entry point that authenticates, rate-limits and routes client requests to backend services, and aggregates calls so apps need fewer round trips.",
    d: "Clients connect to a regional gateway over a persistent, multiplexed connection. The gateway validates tokens, applies per-account and per-device limits, routes by path to services, adds tracing ids, and enforces timeouts and circuit breakers. Some gateways compose responses from multiple services. It also terminates push channels used by handoff and shared sessions. As the shared front door it must be extremely reliable, with its own deploy discipline, and its limits must protect backends without throttling legitimate bursts at app launch.",
    k: ["Thin gateway with logic in services vs aggregation in the gateway: thin is simple and leaves the client chatty; aggregating cuts round trips and concentrates business logic in a critical component.", "Per-account rate limits vs global: per-account stops abusers and tolerates heavy users; global protects capacity and punishes everyone during spikes."],
    p: ["A retry policy without jitter turns a short backend blip into a synchronized storm.", "One service without timeout settings stalls gateway threads and takes down unrelated features."],
    v: "Slow one backend to ten seconds and confirm requests to it time out at the set limit, unrelated endpoints stay healthy, and the circuit breaker closes again after recovery.",
    dep: ["identity-and-sessions","load-shedding","observability"]
  },
  "regional-failover": {
    s: "Keeps the service working when a data center or region fails, by running in several places, replicating state and moving traffic away quickly.",
    d: "Services run active in several regions with listeners routed to the nearest healthy one. Stateless services scale independently; stateful stores replicate within and across regions with documented lag. Failover is practiced: health checks detect failure, routing removes the region, and remaining regions absorb load, which needs spare capacity planned ahead. Playback can continue from cached and delivery layers even when the control plane is degraded, so the order of degradation is designed. The expensive truth is that failover paths rarely used rarely work.",
    k: ["Active-active across regions vs active-passive: active-active uses all capacity and demands conflict handling; active-passive is simpler and leaves idle capacity and a slow, risky cutover.", "Capacity headroom for full region loss vs shedding load: headroom keeps all features and costs money every day; shedding is cheaper and degrades the product in an incident."],
    p: ["A failover tested only on paper discovers missing replicated data or hard-coded addresses during the real event.", "Failing over without checking replication lag loses the last seconds of listeners' library writes."],
    v: "Drain a production region during normal traffic as a scheduled exercise and confirm other regions absorb the load, playback continues, error rates stay below the threshold and recovery completes within the stated time.",
    dep: ["observability"]
  },
  "load-shedding": {
    s: "Deliberately drops or degrades lower-value work when capacity is short, so core playback keeps working under overload or partial failure.",
    d: "Requests are classified by importance: start and continue playback first, library reads next, recommendations and social after, analytics last. Under load, services reject or defer the low classes, serve cached or default content, disable expensive features, and cap request queues. Clients cooperate by backing off, jittering retries and hiding optional shelves. Policies are tested through load experiments. Without it, an overloaded dependency fails in a way that spreads, and recovery takes longer than the original problem.",
    k: ["Prioritized shedding by request class vs uniform rate limits: prioritized protects playback and needs honest classification; uniform is simple and drops important and trivial calls alike.", "Serving stale cache on overload vs failing visibly: stale keeps screens full and may show wrong availability; failing visibly is honest and makes the app look broken."],
    p: ["Shedding based on queue length alone rejects work that would have finished in time and keeps work already late.", "Client retries on shed responses multiply the load that caused them."],
    v: "Apply synthetic load at three times capacity and confirm playback start success stays above target while recommendation and social calls degrade by design, and normal service resumes within minutes after load ends.",
    dep: ["observability","service-gateway"]
  },
  "observability": {
    s: "Metrics, logs and traces that show what the service is doing and what listeners experience, with alerts tied to the outcomes that matter.",
    d: "Every service emits metrics, structured logs and trace spans with shared ids, flowing to storage and dashboards. Alerts are written on listener-facing indicators such as playback start success, start-up latency, stall rate and sign-in success, not on machine health alone. Clients contribute their own error and performance data. Costs rise fast with cardinality and volume, so sampling and retention need policy. A good setup answers 'who is affected and why' within minutes of an alert, across many services.",
    k: ["Alerting on symptoms listeners feel vs on internal causes: symptom alerts match what matters and need diagnosis; cause alerts point directly and miss novel failures.", "Full-fidelity traces vs sampled: full traces always have the failing request; sampling controls cost and loses rare cases unless biased toward errors and slow requests."],
    p: ["High-cardinality labels such as track id on metrics blow up the monitoring system during a viral release.", "Dashboards built from averages hide a failing tail until support tickets arrive."],
    v: "Break playback in one region on purpose and confirm that an alert fires on start success within minutes, names the region and affected client versions, and a trace from a failing request leads to the failing service.",
    dep: ["event-pipeline"]
  },
  "data-lake": {
    s: "Cheap, large-scale storage for all raw and curated data, such as plays, searches and catalog snapshots, used for analytics, model training and royalty processing.",
    d: "Events from the pipeline and snapshots from operational stores land in columnar files organized by date and source, with a catalog of tables, schemas and owners. Batch jobs for royalties, recommendations and reports read frozen partitions. Access is controlled by purpose, since it holds the full listening history of every user, and personal data must be minimized, pseudonymized and erasable. Retention rules differ: royalty data for years, raw clickstreams for months. Quality of data and clarity of ownership matter more than raw size.",
    k: ["Raw immutable data plus derived tables vs curated tables only: raw allows reprocessing and audits and costs storage; curated is smaller and cannot answer new questions.", "Pseudonymized identifiers in analytics vs real ids: pseudonyms limit exposure; real ids allow joins to user services and widen the privacy risk."],
    p: ["Erasure requests that cannot find a user's rows in immutable files leave personal data in place.", "Unowned tables with no documented schema are used for decisions nobody can explain."],
    v: "Process a deletion request for a test user and confirm their rows are removed or irreversibly detached across raw and derived tables within the deadline, and a royalty job rerun still reproduces its original totals.",
    dep: ["event-pipeline"]
  },
  "entitlement-consistency": {
    s: "Whether the question of what a listener may play is decided in one place or re-checked by every component, and how fast a change in plan, rights or location reaches all of them.",
    d: "Search, playlists, radio, the player, downloads, licenses and caches each need to know what is playable. Central evaluation gives one answer and a dependency on every path; local copies are fast and drift. Changes arrive from billing, rights, takedowns and location, and must reach caches, offline files and connected devices. The usual outcome is layered: cheap, possibly stale filtering at display time and a strict check at play time, with explicit staleness bounds so legal and finance can accept them.",
    k: ["One authoritative check at play time vs filtering everywhere: play-time check is correct and surfaces dead ends in the interface; filtering everywhere is polished and drifts from the truth.", "Short staleness bounds vs cheap infrastructure: short bounds satisfy takedown and plan rules and cost push infrastructure; long bounds are cheap and expose licensing risk."],
    p: ["Each team implementing its own availability logic produces a feature that plays what another hides.", "No stated staleness bound means nobody can say whether a takedown deadline was met."],
    v: "Change one account's plan and withdraw one track, then measure the time each surface, the license server, edge caches and offline files take to reflect each change, and compare with the documented bounds.",
    dep: ["availability-resolver","plan-entitlements","license-server","territory-availability"]
  },
  "entity-identity-model": {
    s: "The decision about what counts as one track, album or artist, and how identities survive merges, remasters, regional versions and reissues across every layer.",
    d: "A listener says song, the label says recording and work, the contract says release, and a remaster is a new recording of the same work. The playlist, the royalty report, the search result and the recommendation each need a different level of identity, and a single flat track id forces all of them to share one definition. The choice shapes relinking, play counts, charts, payments and saved items. It is cheap to design at the start and extremely costly to change after a decade of references.",
    k: ["Separate ids for work, recording and release vs a flat track: separate ids match rights and payments and make display logic more complex; flat is easy to build and wrong for money.", "Merge duplicates aggressively vs conservatively: aggressive tidies the catalog and risks misattribution; conservative leaves duplicates and keeps payments correct."],
    p: ["Counting streams across remasters as one recording pays the original rightsholder for another's work.", "Changing an id when metadata changes breaks every playlist and saved item that pointed to it."],
    v: "Take a recording with a remaster, a live version and a regional edit, and confirm each has the intended identity for playlists, relinking, charts and royalties, and an id merge leaves all references resolvable.",
    dep: ["identifier-registry","metadata-schema","track-relinking","entity-matching"]
  },
  "cost-per-stream": {
    s: "The cost of delivering and licensing one stream, and the way it constrains design choices from codec ladder to cache size and the free tier.",
    d: "Costs include royalties, which usually dominate, and delivery bytes, storage, compute for recommendation and search, and payment fees. Royalties depend on contracts, not engineering, but engineering controls what counts as a payable play, skips and fraud. Delivery cost falls with cache hit rate, codec efficiency and provider mix. Free tiers earn only advertising, so their margin is thin and every wasted prefetch counts. Cost is rarely measured per feature, so savings and waste go unseen until someone builds the allocation.",
    k: ["Optimizing cost per stream vs listener experience: cost savings from lower bitrates and less prefetch are real and risk start-up delay and quality complaints.", "Measuring per feature vs company-wide: per-feature costs guide decisions and need allocation work; company-wide totals are easy and hide waste."],
    p: ["A recommendation feature that raises streams but only on the free tier can lose money per play.", "Savings in bandwidth that raise cache misses move cost to origin and compute without a net gain."],
    v: "Produce the cost per qualified stream for one month broken into royalties, delivery, storage, compute and fees, reconcile it with the finance ledger, and confirm a deliberate prefetch change moves the figure by the predicted amount.",
    dep: ["royalty-calculation","edge-cache-tier","codec-ladder","multi-cdn-steering"]
  },
  "peak-and-event-traffic": {
    s: "The need to absorb daily rhythms and sharp events, such as a major album release, a viral moment or a holiday morning, many times above normal load.",
    d: "Listening follows commute and evening peaks by timezone, with large steps at midnight releases and when a famous artist drops an album. Load arrives together: catalog and search spike, cache misses cluster on new files, license requests surge, and everyone sees the same shelves. The defenses are layered: prefilled caches, immutable files, precomputed home pages, coalescing, prioritized shedding and capacity reserved ahead of known events. Unknown viral events are handled by autoscaling and degradation, which are slower than the spike.",
    k: ["Reserving capacity for known peaks vs scaling reactively: reserved capacity is reliable and costs idle money; reactive is cheaper and arrives after the spike hurts.", "Staggering releases by region vs one global moment: staggering flattens load and fragments the cultural moment; a single instant is simpler and concentrates the stress."],
    p: ["Load testing with synthetic uniform traffic misses the correlated pattern of everyone asking for the same new objects.", "Autoscaling policies that depend on slow metrics scale after the peak has passed."],
    v: "Run a rehearsal with a replayed major release profile at twice last year's peak and confirm start success, latency and error budgets hold, cache and origin metrics match predictions, and shedding triggers only for the intended classes.",
    dep: ["cache-prefill","load-shedding","edge-cache-tier","release-scheduling"]
  },
  "listener-privacy": {
    s: "How much listening data is collected, who can see it, how long it is kept and what the listener controls, a decision that touches history, social, recommendations and royalties.",
    d: "Listening history reveals mood, habits, location patterns and sometimes health or beliefs. The same events are needed for royalties, which require accuracy, recommendations, which require detail, and social features, which expose it. Policies decide minimization, pseudonymization, retention, regional law, children's accounts and listener controls such as private sessions and export. The architecture choices are early: whether identifiers are separated from events, whether deletion is possible in immutable stores, and whether every consumer checks the same rules.",
    k: ["Collect fully and restrict access vs collect minimally: full collection enables better models and analytics and increases breach and misuse risk; minimal is safer and less capable.", "Per-service privacy checks vs a central policy layer: central is consistent and auditable; per-service is faster to build and drifts."],
    p: ["A new analytics job joining history to identity without a purpose check creates a new privacy exposure.", "Deletion implemented in the app database but not in model training data leaves personal data in production models."],
    v: "Trace one test user's data from an event through every store, report and model input, then exercise export, private session and deletion, confirming each is honored in all places within the stated time.",
    dep: ["profile-and-privacy","data-lake","listening-history","activity-feed"]
  },
  "playback-quality-budget": {
    s: "The measurable targets for how fast sound starts, how rarely it stalls and how good it sounds, divided into budgets that each component must meet.",
    d: "Listeners judge the service by time to first sound, interruptions and failures to play, not by architecture. A start-up budget of a few hundred milliseconds is split across the app, gateway, resolver, entitlement check, license, edge fetch and decode. Each component receives its share and a way to measure it. Stall rate, quality level and error rate have targets by network class. Budgets force trade-offs: a richer entitlement check, a stricter license or a heavier manifest each spends milliseconds that something else must give back.",
    k: ["A strict start-up budget vs flexibility per feature: strict budgets keep playback snappy and block features that need extra calls; flexibility ships features and lets latency creep.", "Optimizing the median vs the tail: median improvements are easy and look good; the tail is where weak networks and old devices are and drives complaints."],
    p: ["Measuring start-up from the server's receipt of the request misses the app and network portions the listener feels.", "Each team adding a small check on the play path accumulates a second of delay with no owner."],
    v: "Measure time to first sound from tap on a mid-range device on a throttled network across a thousand plays, and confirm the 50th and 99th percentiles meet the budget with the per-component breakdown summing to the total.",
    dep: ["delivery-telemetry","prefetch-and-buffering","stream-resolver","license-server"]
  },
});
