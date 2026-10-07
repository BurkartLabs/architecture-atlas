// Details for the e-commerce platform plate, part 5: traffic handling, events and operations, cross-cutting concerns.
ATLAS.details("ecommerce-platform", {
  "cdn-and-edge": {
    s: "A network of caches and request handlers near shoppers that serves static assets and cacheable pages, terminates TLS, and filters abusive traffic before it reaches the platform.",
    d: "Requests resolve by DNS to the nearest edge location. The edge serves cached images, scripts and page markup, forwards misses to the origin, and can run small pieces of logic for redirects, geolocation and A/B assignment. Cache keys decide what is shared; cookies and headers that vary by shopper must be kept out of them. Purging by tag lets a product update clear every page that shows it. The difficulty is caching only what is safe: personal data and carts must never be shared.",
    k: ["Cache full pages with personalized fragments fetched separately vs no page caching: caching serves a launch from the edge and requires fragment design; no caching is safe and sends every view to origin.", "Purge on change vs short time-to-live: purging is fresh and relies on events reaching the edge; short lifetimes are simple and cause frequent origin load."],
    p: ["A response containing a customer's name is cached and served to the next visitor.", "A purge fails silently and old prices stay visible long after the change."],
    v: "Request pages as two different logged-in users and anonymously through the edge, and confirm no personal content crosses between them, then change a price and confirm purged pages update within the target.",
    dep: ["cache-layers", "rate-limiting"]
  },
  "cache-layers": {
    s: "In-memory and near-memory caches between services and databases, holding catalog reads, price results and computed fragments, with explicit invalidation and expiry rules.",
    d: "Hot read paths are cached in process, in a shared cache cluster and at the edge. Keys include the context that changes the answer: region, currency, customer group and language. Entries expire by time and are invalidated by events when the source changes. Stampede protection ensures only one request refills a popular key. The difficulty is correctness: each cache is another place a price or stock figure can be wrong, so it must be clear which data may be stale, and for how long.",
    k: ["Event-driven invalidation vs time-to-live only: events are fresh and need reliable delivery; time-to-live is simple and shows stale data until it ends.", "Cache computed prices vs only raw data: computed is fast and has many key combinations to invalidate; raw is easy to keep correct and costs CPU on every read."],
    p: ["A popular key expires at once and thousands of requests hit the database to refill it.", "The key omits currency, and shoppers see another market's price."],
    v: "Load-test a hot product page, expire its cache entry mid-test, and confirm database queries for it stay within a small bound, while a price change becomes visible within the stated invalidation target.",
    dep: ["event-bus"]
  },
  "rate-limiting": {
    s: "Caps how many requests a client, key or IP may make in a window per endpoint, so abuse and runaway integrations cannot starve ordinary shoppers.",
    d: "Counters keyed by client identity, token, IP and endpoint class are held in a shared fast store, using token or sliding-window algorithms. Limits differ by sensitivity: login and coupon checks are tight, browsing generous, and partner keys have contracts. Over-limit requests receive a clear status with a retry hint. Enforcement can be at the edge, at the gateway and inside services. The challenge is choosing identities that are hard to evade without punishing many shoppers behind one shared address.",
    k: ["Limit by IP vs by account or token: IP works before login and punishes shared networks; account or token is precise and only available after identification.", "Fail open vs fail closed when the counter store is down: open keeps selling and drops protection; closed protects and turns an outage into a total one."],
    p: ["A carrier-grade shared address hits the limit and an entire neighborhood is blocked.", "Limits sit only at the edge, and an internal job calling the API in a loop takes down the service."],
    v: "Send traffic above the limit from one client and from many clients behind a shared address, and confirm the heavy client is throttled with a retry hint and ordinary clients on that address continue to succeed.",
    dep: []
  },
  "load-shedding": {
    s: "Deliberately refuses or degrades lower-value work under overload, protecting checkout and payments, so the system serves some customers well instead of all of them badly.",
    d: "Requests are classified by priority: order placement and payment above cart, then product views, then recommendations and analytics. Under pressure, measured by queue depth, latency or CPU, the system drops or delays the lowest classes first and returns fast failures instead of waiting. Concurrency limits per dependency stop slow downstream services from consuming every thread. Clients are told to back off. The difficulty is deciding priorities before the incident and measuring overload accurately enough to react in time.",
    k: ["Priority classes with early shedding vs processing everything slowly: shedding keeps the critical path fast and rejects some work; processing all makes every request time out.", "Server-side concurrency limits vs client-side retries: limits protect the server and need tuning; unconstrained retries amplify overload into a storm."],
    p: ["Retries from clients multiply load during a brownout and prevent recovery.", "Checkout shares a thread pool with recommendation calls, so a slow recommender blocks orders."],
    v: "Drive load to three times capacity in staging and confirm checkout success rate and latency stay within target while low-priority endpoints return fast refusals, and the system recovers promptly when load subsides.",
    dep: ["rate-limiting", "graceful-degradation"]
  },
  "virtual-waiting-room": {
    s: "A queue in front of the store that admits shoppers at a controlled rate during a surge, so the checkout is never given more concurrent buyers than it can handle.",
    d: "When load crosses a threshold or a drop is scheduled, new visitors are routed to a lightweight queue page served from the edge. Each receives a signed token with a position; a controller admits batches at a rate tied to checkout capacity and issues passes valid for a limited time. Admitted visitors proceed normally; the queue page polls cheaply. The difficulty is fairness and abuse: bots can join many times, sharing passes and bypassing the edge must be prevented, and shoppers need honest estimates.",
    k: ["First-in-first-out vs randomized entry within a window: FIFO is intuitive and rewards speed and bots; randomized is fairer and harder to explain.", "Queue the whole site vs only checkout and cart: whole site protects everything and blocks browsing; checkout-only keeps browsing open and lets shoppers queue after choosing."],
    p: ["The origin can still be reached directly, and bots skip the queue.", "Admission rate is set too low, and the site idles while thousands wait."],
    v: "Simulate a surge of 50 times normal traffic and confirm origin load stays below its limit, admission follows the configured rate, passes expire correctly and the queue cannot be bypassed.",
    dep: ["cdn-and-edge", "bot-scalper-defense", "autoscaling-capacity"]
  },
  "graceful-degradation": {
    s: "Keeps the core purchase path working when a dependency fails by turning off or simplifying non-essential features, with fallbacks and cached stand-ins.",
    d: "Each dependency has a defined failure behavior: if recommendations fail, the section is hidden; if reviews fail, cached aggregates show; if the tax service fails, a cached estimate or a flat rate is used and the difference reconciled later. Circuit breakers stop calling failing services and probe for recovery. Feature flags allow operators to shut features off quickly. The difficulty is deciding which fallbacks are acceptable for money-bearing steps, and testing failure modes that rarely occur.",
    k: ["Fallback to cached or approximate data vs fail the request: fallback keeps selling with some inaccuracy; failing is exact and loses the order.", "Circuit breakers with automatic recovery vs manual switches: automatic reacts in seconds and can flap; manual is deliberate and slow."],
    p: ["A circuit breaker opens on a brief blip and stays open, hiding a feature long after recovery.", "A fallback tax rate is used silently and no reconciliation happens, leaving orders mis-taxed."],
    v: "Disable each dependency in turn in staging while running purchase journeys, and confirm checkout still completes where defined, the degraded features are hidden gracefully and fallbacks are logged for reconciliation.",
    dep: ["load-shedding", "cache-layers", "funnel-observability"]
  },
  "autoscaling-capacity": {
    s: "Adds and removes compute and database capacity with load, and proves limits through scheduled load tests, so launch-day traffic is a rehearsed event.",
    d: "Stateless services scale on request rate, latency or queue depth, with warm pools to avoid slow starts. Databases scale by read replicas, partitioning and pre-provisioning, because they cannot scale in minutes. Load tests replay realistic shopper journeys at multiples of expected peak, including cache-cold starts. Capacity plans are set from campaign forecasts. The hard parts are the stateful tiers, dependencies with fixed limits such as payment providers, and scaling cost so it is paid only during the event.",
    k: ["Reactive autoscaling vs pre-scaling for known events: reactive follows real load and lags a sudden spike; pre-scaling is ready and costs money if the forecast is wrong.", "Realistic journey tests vs single-endpoint tests: journeys reveal contention across services; single endpoints are simpler and miss shared bottlenecks."],
    p: ["Autoscaling adds web servers and the database connection limit is hit, making things worse.", "Load tests use cached data and miss the cold-cache failure on launch day."],
    v: "Run a load test at twice the forecast peak with cold caches, and confirm latency, error rate and order success stay within objectives, and the first bottleneck identified is documented with its limit.",
    dep: ["cache-layers", "async-order-pipeline"]
  },
  "async-order-pipeline": {
    s: "Moves post-checkout work, such as emails, invoices, warehouse messages and analytics, onto queues so order acceptance stays fast and surges are absorbed.",
    d: "The order service commits the order and emits an event; consumers handle fulfillment, notifications, tax reporting, loyalty and analytics at their own pace. Queues buffer spikes, workers scale independently, and failed messages retry with backoff then land in a dead-letter queue for inspection. Handlers must be idempotent, since messages are delivered at least once. The challenge is visibility and ordering: knowing which orders are stuck in which step, and ensuring events for one order are processed in a sensible sequence.",
    k: ["Accept and process later vs complete synchronously: accepting absorbs spikes and shows a pending state briefly; synchronous gives immediate certainty and tops out at the slowest dependency.", "Per-order ordering vs maximum parallelism: ordering avoids race bugs and limits throughput per order key; parallelism is fast and needs commutative handlers."],
    p: ["A poison message retries forever and blocks the partition behind it.", "Dead-letter queues fill up unnoticed and customers never receive confirmations."],
    v: "Submit a burst of orders while stopping one consumer, then restart it, and confirm every order completes each downstream step exactly once, the backlog drains in the expected time and dead letters are alerted.",
    dep: ["event-bus", "transactional-outbox", "idempotency-and-retries"]
  },
  "event-bus": {
    s: "A durable stream of business events, such as order placed or stock changed, that lets services react without calling each other directly.",
    d: "Services publish versioned events with an id, type, time and payload to a broker, and consumers subscribe by topic. Topics are partitioned by key so one order's events stay in order. Consumers track their position and can replay history to rebuild an index or fix a bug. Schemas are registered and checked for compatibility. The hard parts are event design, what is an event versus a command, schema evolution across many consumers, and the lag and duplicates that every consumer has to handle.",
    k: ["Thin events with ids vs full-state events: thin events are small and force consumers to call back; full-state events are self-contained and larger and expose more data.", "Event streams as the source of truth vs events as notifications: source of truth allows replay and demands strict design; notifications are simple and cannot rebuild state."],
    p: ["A producer changes a field's meaning without a new version, and downstream consumers silently misbehave.", "Consumers assume exactly-once delivery and apply duplicates twice."],
    v: "Publish a sample of each event type, replay a day of history into a fresh consumer, and confirm its resulting state equals the live consumer's state and schema checks reject an incompatible change.",
    dep: ["transactional-outbox"]
  },
  "transactional-outbox": {
    s: "Writes each event into the same database transaction as the state change that caused it, then relays it to the broker, so changes and events never disagree.",
    d: "When the order service saves an order, it inserts an outbox row in the same transaction. A relay process reads unsent rows in order and publishes them to the event bus, marking them sent after acknowledgment. If the relay crashes between publish and mark, it publishes again, so consumers must deduplicate by event id. Old rows are cleaned up. The alternative of writing to the database and then publishing leaves a window where one succeeds without the other. The difficulty is relay throughput, ordering and lag monitoring.",
    k: ["Outbox table with relay vs dual write to database and broker: outbox guarantees consistency and adds a component and delay; dual write is simple and loses events on a crash.", "Polling the table vs reading the database change log: polling is simple and adds load and latency; the change log is efficient and ties the design to the database."],
    p: ["The relay falls behind during a spike and downstream systems see orders many minutes late without an alert.", "Outbox rows are never pruned and the table grows until it slows the order path."],
    v: "Crash the service and relay at each point between commit and publish, and confirm each committed order yields at least one published event, duplicates are deduplicated downstream, and no event exists for a rolled-back order.",
    dep: ["order-model"]
  },
  "integration-connectors": {
    s: "Adapters that exchange data with the accounting system, product information system, warehouse, marketing tools and marketplaces, with mapping, retry and error reporting.",
    d: "A connector translates between platform events and an external system's API or files: orders and refunds to accounting, products and prices from a product information source, inventory with warehouses, audiences to marketing tools. Each has field mappings, schedules, rate limit handling and a failure queue visible to operators. Credentials are stored per merchant. The hard parts are mismatched data models, idempotent replays after outages, and the long tail of customer-specific variations.",
    k: ["Prebuilt connectors vs a general integration framework: prebuilt are quick for common systems and fixed in behavior; a framework allows anything and needs integration work per customer.", "Event-driven sync vs scheduled batch: events are timely and sensitive to outages and bursts; batch is simple, bulk friendly and slow to reflect changes."],
    p: ["An accounting API outage drops order exports and no one notices until month end.", "A mapping change in the external system silently shifts a field and corrupts records."],
    v: "Take an external system offline for an hour while orders flow, bring it back, and confirm every order arrives exactly once, in order where required, with failures visible to operators during the outage.",
    dep: ["event-bus", "audit-log"]
  },
  "admin-console": {
    s: "The back-office application where staff manage catalog, prices, promotions, orders, customers and settings, built on the same APIs and rules as customer-facing paths.",
    d: "It offers lists, bulk edits, imports, order handling and reports, with search over large data and previews of how changes will look. Actions such as refunds, edits and price changes go through the domain services so validation and events apply uniformly. Bulk operations run as background jobs with progress and undo where possible. The difficulty is power: it can change prices for a million items or refund orders, so it needs guardrails, previews and approvals, and it must stay responsive on very large datasets.",
    k: ["Admin built on public APIs vs direct database access: APIs keep rules and events consistent and limit speed; direct access is quick and bypasses invariants.", "Immediate bulk changes vs staged with preview and approval: immediate is fast and error-prone at scale; staging catches mistakes and slows urgent changes."],
    p: ["A bulk price edit with a wrong column sets thousands of items to zero and goes live at once.", "Large order lists load without pagination and bring the console down."],
    v: "Run a bulk edit on a staging catalog with a deliberate error, confirm the preview shows the impact, approval is required above a threshold, and the change can be reverted from its recorded history.",
    dep: ["headless-commerce-api", "staff-permissions", "audit-log"]
  },
  "staff-permissions": {
    s: "Defines what each staff member, agency and integration may see and do, by role, store and action, with limits on the actions that move money or expose personal data.",
    d: "Roles bundle permissions such as view orders, edit prices, issue refunds up to an amount and export customers. Scopes restrict by store, region or brand. API keys for integrations get the narrowest scope. Sensitive actions may need a second person or recent re-authentication. Support agents often need access to a customer without seeing full card or identity data. The challenge is granularity, since too coarse gives everyone refund power and too fine is unmanageable, and keeping permissions current as staff change roles.",
    k: ["Role-based vs attribute-based rules: roles are simple to understand and audit and multiply for edge cases; attributes are expressive and harder to reason about.", "Two-person approval for refunds above a limit vs trust with audit: approval stops damage and slows service; audit is fast and acts after the loss."],
    p: ["A departed employee's account and API key stay active for months.", "A support role includes data export, and a single account leaks the whole customer list."],
    v: "For each role, attempt every sensitive action and export in staging and confirm allowed ones succeed and others are refused, with limits and approvals enforced, and the attempt recorded in the audit log.",
    dep: ["customer-identity", "audit-log"]
  },
  "audit-log": {
    s: "An append-only record of who changed what, when and from where, covering prices, orders, refunds, permissions and settings, kept for investigation and compliance.",
    d: "Domain services write an entry for each significant change: actor, action, target, before and after values, reason, time and origin. Entries are stored apart from the operational database, protected against editing, and searchable by order, customer or staff member. Retention follows legal and business needs. Automated actors, such as jobs and integrations, are logged as well. The difficulty is coverage and cost: gaps appear where changes happen outside the logged path, and verbose logs of large objects grow quickly and may contain personal data.",
    k: ["Log before and after values vs only the action: values allow exact reconstruction and cost storage and expose data; action-only is lean and cannot show what changed.", "Application-level writes vs capturing database changes: application level carries intent and reason and can be bypassed; database capture is complete and lacks context."],
    p: ["A script updating records directly in the database leaves no audit entry.", "Audit entries contain full customer addresses and are readable by a wider group than the orders."],
    v: "Make a price change, a refund and a permission change through the console, API and a job, and confirm each yields one entry with actor, before and after values, and that entries cannot be altered or deleted.",
    dep: []
  },
  "analytics-attribution": {
    s: "Captures shopper and order events to measure conversion, revenue and the marketing source of each sale, feeding dashboards, experiments and merchandising.",
    d: "Client and server events, such as views, searches, cart changes and purchases, are collected into a pipeline and joined into sessions and funnels. Attribution links an order to the campaign or channel that brought the shopper, by rules like last click, subject to consent. Server-side order events are the reliable revenue source; browser events are lossy because of blockers. Results feed experiments and reports. The challenge is data quality, consistent definitions of metrics, and respecting consent while still measuring.",
    k: ["Client-side tracking vs server-side events: client sees behavior and loses events to blockers; server is reliable for orders and cannot see browsing.", "Last-click attribution vs multi-touch models: last-click is simple and over-credits closing channels; multi-touch is fairer and depends on assumptions and data."],
    p: ["Purchases are counted twice because both client and server report them under different ids.", "Tracking fires before consent is given, creating a compliance breach."],
    v: "Place test orders with and without consent and blockers, and confirm each appears once in revenue reporting with the right source, and consent-denied sessions send no personal identifiers.",
    dep: ["event-bus", "privacy-consent"]
  },
  "idempotency-and-retries": {
    s: "Every operation that moves money, stock or orders must be safe to repeat, because networks, queues and people retry, and exactly-once delivery does not exist.",
    d: "Each mutating request carries a key; the receiver stores the key with the result and returns the stored result on a repeat. Events carry ids that consumers deduplicate. Retries use backoff with jitter and a limited count, and only for failures that can succeed later. State machines reject impossible transitions. This applies across the cart, order placement, payments, refunds, stock and shipments. The difficulty is scope: one unprotected step, such as a notification or a capture, is enough to duplicate money or goods.",
    k: ["Idempotency keys stored with results vs naturally idempotent operations: keys work for any operation and need storage and expiry; natural idempotency is free and only fits set-style updates.", "Retry aggressively vs fail fast: aggressive retries mask blips and amplify overload; failing fast protects the system and exposes errors to users."],
    p: ["A retry layer inside a client and another in the gateway multiply one request into many.", "Idempotency keys expire before a long-delayed retry, which is processed as new."],
    v: "Replay every state-changing endpoint and event handler with duplicates, concurrently and after a crash, and confirm money, stock and order counts change exactly as for a single execution.",
    dep: []
  },
  "consistency-boundaries": {
    s: "Deciding which data must be exactly right at once, such as stock at commit and payment state, and which may lag, such as search results and recommendations.",
    d: "A store is a set of services and caches with different freshness. Strong consistency is reserved for the commit points: order placement, stock decrement, redemption counts and payment state. Everything read for browsing, such as listings, counts, ratings and facets, is eventually consistent, with stated bounds. Transactions span one service; across services, sagas with compensating steps coordinate outcomes. Every read path should be labeled with how stale it may be. The difficulty is that shoppers see the seams: a page says available and checkout says no.",
    k: ["Distributed transactions vs sagas with compensation: transactions give atomicity and block and couple services; sagas scale and require undo logic for every step.", "Strict reads at checkout vs reuse of browsing data: strict reads protect against stale promises and load the sources; reuse is fast and lets stale data through."],
    p: ["Search shows an item in stock, the cart accepts it and only payment-time validation says it is gone.", "A saga's compensating step fails and leaves money captured with no order."],
    v: "Inject delays into each replica, cache and event consumer in turn, and confirm no order is accepted on stale data, every user-visible mismatch resolves within its stated bound, and failed sagas end in a defined state.",
    dep: []
  },
  "money-and-rounding": {
    s: "How amounts are stored, added, split and rounded across currencies, so totals, taxes, discounts and refunds agree to the smallest unit everywhere.",
    d: "Amounts are integers in the currency's minor unit, with the currency code stored alongside, never floating point. Currencies differ in decimals. Rounding rules are explicit and consistent: where rounding happens, which mode, and how remainders are allocated when splitting a discount or shipping across lines. The same calculation must produce the same result in the cart, payment, invoice, accounting and refund. The hard part is that every service rounds a little differently unless a single shared implementation and test data exist.",
    k: ["Integers in minor units vs decimal types: integers are exact and fast and need care for currencies with unusual decimals; decimal types are readable and allow quiet precision drift.", "Allocate remainders to the largest line vs spread evenly: largest keeps splits simple and shifts a cent; spreading is fairer and complicates reproducing results."],
    p: ["One service rounds each line and another rounds the total, so invoices differ from payments by a cent.", "A currency with no decimals is treated as having two, and prices are off by a factor of 100."],
    v: "Run a shared table of carts across currencies, discounts and tax modes through cart, payment, invoice and refund code, and confirm each stage yields identical amounts and that refunds sum exactly to the original.",
    dep: []
  },
  "pci-and-privacy-scope": {
    s: "Keeping card data and personal data out of as many systems as possible, so the audit and breach surface is small, and handling what remains with strict controls.",
    d: "Card numbers are taken by provider-hosted fields and replaced by tokens, so the platform never stores or transmits them. Personal data is classified, minimized, encrypted at rest and in transit, access controlled, and given retention limits. Logs, analytics and support tools are scrubbed. Systems that touch sensitive data are isolated and listed. Each additional system that sees card data enlarges the audit. The difficulty is leaks: data appears in logs, error reports, URLs, exports and test copies of production, far from where it was meant to live.",
    k: ["Tokenize at the client vs handle card data on servers: tokenizing reduces scope and ties checkout to the provider; handling gives control and brings the full audit.", "Central sensitive-data service vs fields in every table: a service limits exposure and adds a call and a dependency; fields are simple and spread risk everywhere."],
    p: ["Card numbers typed into a support ticket or note field are stored in plain text.", "Production data copied to a test environment exposes real addresses and emails to developers."],
    v: "Scan logs, databases, backups, analytics exports and test data for card numbers and personal identifiers using pattern checks, and confirm the only matches are in the designated protected stores.",
    dep: []
  },
  "peak-readiness": {
    s: "Treating sales events as planned engineering work: forecasting traffic, rehearsing it, freezing risky changes, staffing the response and agreeing what to shed first.",
    d: "Teams forecast traffic and orders for each campaign, pre-scale capacity, warm caches, and rehearse with load tests and failure drills. Change freezes cover the days around the event. Dashboards show the order funnel in real time, with owners on call and runbooks for common failures such as payment provider slowness. Priorities are agreed in advance: protect checkout, shed recommendations, enable the waiting room. Third parties, such as payment providers and carriers, are told in advance. The challenge is that peaks expose limits nobody tested, usually in a dependency.",
    k: ["Over-provision for the event vs rely on autoscaling: over-provisioning is safe and costs money; autoscaling is cheaper and may lag the first minutes of a spike.", "Freeze all changes vs allow reviewed hotfixes: a full freeze reduces risk and blocks urgent fixes; allowing fixes is flexible and can cause the outage it meant to prevent."],
    p: ["A payment provider's rate limit is hit at peak because it was never told about the campaign.", "A rehearsal used last year's traffic shape and missed that the new campaign concentrates on one product."],
    v: "Hold a dress rehearsal at the forecast peak with a failure injected, such as a slow payment provider, and confirm the team follows the runbook, checkout stays within objectives and the waiting room engages on schedule.",
    dep: ["autoscaling-capacity", "virtual-waiting-room", "load-shedding"]
  },
  "funnel-observability": {
    s: "Watching the store as a funnel of steps from view to paid order, with technical metrics tied to business outcomes, so a failure is seen as lost orders within minutes.",
    d: "Every step, such as search, product view, add to cart, checkout start, payment attempt and order confirmed, emits metrics and traces with a shared request id. Dashboards show conversion by step, payment success by method and provider, and latency by dependency. Alerts fire on drops in order rate against forecast, not only on error counts, since many failures return success codes. Synthetic shoppers run the journey continuously from several regions. The difficulty is silent failure: a broken coupon or a payment method that fails quietly looks like normal traffic.",
    k: ["Business-metric alerts vs technical alerts: business alerts catch silent failure and are noisy at low traffic; technical alerts are precise and miss problems that do not raise errors.", "Synthetic journeys vs real-user monitoring: synthetics detect breakage at any hour and cover few paths; real-user data covers all and needs traffic to detect."],
    p: ["A payment method fails for one country and overall conversion hides it for hours.", "Traces drop at the queue boundary, so post-checkout failures cannot be tied to the order."],
    v: "Break a single payment method in staging and confirm an alert names that method and region within minutes, the funnel dashboard shows the drop at that step and the synthetic journey fails.",
    dep: []
  },
});
