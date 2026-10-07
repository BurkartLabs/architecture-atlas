// Details part 4: batching, subscriptions, federation, caching.
ATLAS.details("graph-query-server", {
  "batch-loader": {
    s: "A per-request helper that collects the keys requested by many resolvers during one tick of execution and fetches them with a single backend call, returning each caller its own value.",
    d: "A resolver calls load with a key and gets a promise. The loader queues the key and schedules a dispatch for the end of the current turn, when it hands all queued keys to one batch function that issues one query, such as a lookup where id is in a list. Results are matched back to the keys and promises resolve. It turns N calls for N parent objects into one, without resolvers knowing about each other. The difficulty is the batch contract: results must align with keys, missing keys must yield null, and batch size must be bounded.",
    k: ["Batch on the next tick vs explicit flush: next-tick needs no coordination between resolvers; explicit flush gives control but must be called by the engine.", "One loader per relationship vs one per entity type: per relationship matches each query; per type shares cache but needs flexible batch functions."],
    p: ["A batch function returning results in a different order than the keys gives every caller someone else's data.", "Unbounded key lists produce backend queries exceeding parameter or size limits."],
    v: "Query a list of fifty parents each selecting a child. Confirm backend logs show one batched query for children, not fifty, and each child matches its parent.",
    dep: ["resolver-context", "batch-result-ordering", "data-source-abstraction"]
  },
  "request-scoped-loaders": {
    s: "Creating loader instances fresh for each request so their memoization and queues live exactly as long as one operation and never carry data between callers.",
    d: "Loaders memoize by key, so the same object requested by several resolvers in one operation is fetched once. That cache is only correct inside one request: a different caller may not be allowed to see the same data, and data may change between requests. The server therefore constructs the loaders as part of building the context and drops them when the response is complete. Mutations should clear affected keys so later fields in the same operation read fresh values.",
    k: ["Per-request loaders vs shared loaders with a time-based cache: per-request is safe and simple; shared reduces backend load but needs authorization-aware keys and invalidation.", "Clear loader cache after a mutation vs rely on separate requests: clearing gives read-your-writes within one operation; ignoring it can show stale values."],
    p: ["Loaders created at startup serve one tenant's cached records to another.", "A mutation followed by a query in the same operation returns the pre-mutation value from the loader cache."],
    v: "As two users sequentially request the same object, change it between requests, and confirm each request fetches from the backend and returns the current value to its own caller.",
    dep: ["batch-loader", "resolver-context"]
  },
  "n-plus-one-problem": {
    s: "Detection of the pattern where one list query triggers one backend call per item, found by counting backend calls per operation and flagging fan-out that scales with result size.",
    d: "A parent list resolver runs one query; each child field then runs one query per parent, giving N plus one calls. It passes tests with five rows and fails at production sizes. Detection counts calls per backend per operation in tracing or a development mode that raises when the count grows with list length, and reports the resolver path. Fixes are batching, lookahead and pushdown. It is hard because the cause sits in how clients compose queries, which the resolver author cannot predict.",
    k: ["Detect in development vs in production tracing: development catches it early on test data; production tracing finds real patterns but only after release.", "Fail the request on a threshold vs only warn: failing forces a fix; warning avoids outages from false positives."],
    p: ["Test data with two rows hides a per-item query that will run thousands of times in production.", "Fixing one path while a new client query reaches the field through another path reintroduces it."],
    v: "Run a list query with ten and with one hundred items under tracing. Backend call counts must stay constant for batched fields and grow only for unfixed ones, which the report names.",
    dep: ["field-tracing", "batch-loader"]
  },
  "selection-lookahead": {
    s: "Inspecting the requested sub-fields in a resolver before fetching, so the backend query selects only needed columns and joins only needed relations.",
    d: "The info argument exposes the field's selection set. A resolver or connector reads which child fields are requested and adjusts its query: select just those columns, include a relation, skip an expensive aggregate. It avoids over-fetching and can eliminate the child queries entirely. It couples the resolver to the shape of the graph, and it must follow fragments and aliases, and respect skip conditions. It is a manual form of pushdown that stays correct only if the selection traversal is complete.",
    k: ["Lookahead in resolvers vs generic pushdown layer: resolver lookahead is explicit and tailored; a generic layer reduces repetition but hides query shape.", "Fetch all columns once vs select by need: all columns is simple and cache-friendly; selecting is leaner but varies per query."],
    p: ["Ignoring fragment spreads makes lookahead think a field was not requested, so it returns null.", "Selecting only requested columns breaks a downstream resolver relying on a column that was not selected."],
    v: "Query one field and then ten fields of a type and compare backend query text. The first must select one column, the second ten, and the results must be identical for the shared field.",
    dep: ["resolver-functions", "field-collection"]
  },
  "join-pushdown": {
    s: "Translating a whole subtree of the operation into one backend query with joins and projections, so the database does the assembly instead of many resolver round trips.",
    d: "A connector reads the selection tree and generates a single query: joins for relationships, filters from arguments, ordering, limits and projections for selected fields. Results come back as one flat set and are reshaped into the nested response. It can remove many calls from a deep query, but generated queries can be huge, join on large tables and defeat planner estimates. Authorization constraints must also be woven into every joined table, or the join leaks.",
    k: ["Single joined query vs several batched queries: a join is one round trip but can multiply rows; batching is simpler per query and avoids row blowup.", "Generated queries vs hand-written per field: generated reduces code and fits arbitrary queries; hand-written is predictable and tunable."],
    p: ["Joining two one-to-many relationships in one query multiplies rows and returns duplicates.", "A deeply nested query generates a join with so many tables that the database plan collapses."],
    v: "Run a three-level query and capture the generated backend query. Confirm one statement, with the expected row count and no duplicates, and an explain plan that uses indexes.",
    dep: ["relational-connector", "selection-lookahead", "data-level-filtering"]
  },
  "batch-result-ordering": {
    s: "The rule that a batch function must return exactly one result per requested key, in key order, with null or an error for missing ones, so results map back to callers.",
    d: "The backend returns rows in its own order and may omit missing keys or return duplicates. The batch function indexes results by key and builds an array aligned to the key list: found rows in place, null for missing. Errors for single keys can be returned as error values so one failure does not fail the batch. Misalignment is a data-leak bug, not a crash, so it needs a contract check: output length must equal input length.",
    k: ["Index by key and rebuild vs trust backend order: rebuilding is always correct; trusting order is faster but fails silently.", "Per-key error values vs failing the whole batch: per-key limits blast radius; whole-batch failure is simpler but wasteful."],
    p: ["Rows returned in database order are assigned to the wrong callers when ids are not sorted.", "Duplicate keys in one batch are fetched twice or collapse and misalign the output."],
    v: "Request keys in a shuffled order with one missing and one duplicate. Confirm the output array has the same length, each element matches its key, and the missing one is null.",
    dep: ["batch-loader"]
  },
  "subscription-engine": {
    s: "The component that runs a subscription operation: it creates an event stream for the root field, and for each event executes the selection set to produce a response.",
    d: "The subscription root field resolves to a stream of events. For each event, the engine runs the rest of the selection like a query, with the event as root value, and sends the result to the client. The operation lives until the client cancels, the stream ends or an error stops it. Each active subscription holds memory and a connection, so it is stateful and scales differently from queries. Per-event execution means a popular event multiplies work by the number of subscribers.",
    k: ["Execute per subscriber vs share results across subscribers: per subscriber supports per-user authorization and fields; sharing saves work but only fits identical selections.", "Send full results vs diffs: full results are simple; diffs save bandwidth but need client merging."],
    p: ["A popular event executing a heavy selection for every subscriber creates a load spike.", "Slow consumers cause unbounded buffers on the server unless dropped or disconnected."],
    v: "Open a subscription, publish one event, and confirm exactly one result arrives with the selected fields. Cancel the subscription and confirm the server releases its stream, visible in active subscription counts.",
    dep: ["execution-engine", "pubsub-backplane", "live-transport"]
  },
  "pubsub-backplane": {
    s: "The messaging layer that carries events from the places that cause changes to the server instances holding subscriptions, so any instance can serve any subscriber.",
    d: "Mutations and background jobs publish events to topics on a shared bus. Each server instance subscribes to the topics its connected clients need and feeds matching events into subscription streams. Without it, an event published on one instance reaches only clients connected to that instance. Delivery is usually at most once and unordered across topics, so subscribers can miss events during reconnects. Topic design, such as one per user or per object, controls fan-out and filtering cost.",
    k: ["Fine-grained topics vs coarse topics with filtering: fine-grained reduces wasted work but creates many topics; coarse is simple but each instance filters everything.", "At-most-once delivery vs durable log with replay: at-most-once is cheap but loses events on reconnect; replay recovers but needs storage and cursors."],
    p: ["A backplane outage silently stops all live updates while queries keep working.", "Events published before a transaction commits can reach subscribers before the data is readable."],
    v: "Connect a subscriber to one instance and cause a mutation through another. Confirm the event arrives within the target delay, and that restarting the bus produces recovery or a visible error.",
    dep: ["subscription-engine"]
  },
  "event-filtering": {
    s: "Deciding which events each subscriber should receive, by arguments in the subscription and by the subscriber's authorization at the time of each event.",
    d: "Subscription arguments select a subset, such as one conversation or one project. The engine filters events by those arguments, then re-checks authorization, since permissions may have changed since the subscription started. Filtering occurs before execution so unwanted events cost little. It is a data-exposure boundary: checking permission only at subscribe time means a user removed from a room still receives its messages until they disconnect.",
    k: ["Authorize at subscribe time only vs on each event: subscribe-time is cheap; per event stays correct when access is revoked but costs a check per delivery.", "Filter in the bus vs in the server: bus filtering reduces traffic; server filtering is flexible and uses richer context."],
    p: ["A revoked user keeps receiving events for the life of their connection.", "Events carrying full payloads leak fields to a subscriber who could not query them directly."],
    v: "Subscribe as a member, remove the user from the room, publish an event, and confirm nothing is delivered after the removal takes effect.",
    dep: ["subscription-engine", "field-authorization"]
  },
  "live-transport": {
    s: "The long-lived connection carrying subscription operations and results, usually a WebSocket or a server-sent event stream, with its own message protocol on top.",
    d: "A client opens a connection, sends an initialization message with credentials, then starts and stops operations by id; the server sends results, errors and completion for each. Many operations can share one connection. The transport handles keepalive pings, backpressure and close codes. Server-sent events over HTTP work through more proxies but are one way and need one connection per operation unless multiplexed. Choosing a protocol locks client libraries and infrastructure support.",
    k: ["WebSocket vs server-sent events: WebSocket multiplexes both directions on one connection; events pass proxies and use plain HTTP but are one way.", "One operation per connection vs multiplexed: one per connection is simple; multiplexing saves connections but needs ids and flow control."],
    p: ["Proxies with idle timeouts close the connection silently and clients show stale data.", "Credentials sent only at connection start are never refreshed for hours."],
    v: "Open a connection through the production load balancer, leave it idle past the proxy timeout and confirm keepalive keeps it open. Kill the network and confirm the client reconnects and resubscribes.",
    dep: ["http-transport", "authentication-context"]
  },
  "connection-lifecycle": {
    s: "Management of live connections from handshake through keepalive, reauthentication, reconnection and graceful shutdown, including limits per user and per instance.",
    d: "The server counts connections and subscriptions, caps them per caller, pings clients, and closes dead peers. On deploy it drains connections by sending a close code that tells clients to reconnect elsewhere, spreading reconnects over time. Clients reconnect with backoff and resubscribe, possibly requesting missed events. Expired tokens require reauthentication or forced close. At scale, a restart releases a thundering herd of reconnects that can overload authentication and the bus.",
    k: ["Jittered reconnect backoff vs immediate reconnect: jitter spreads load after a restart; immediate is quicker for one client but stampedes at scale.", "Per-user connection caps vs open: caps prevent abuse and leaks; open is simpler but lets one user exhaust the instance."],
    p: ["Restarting all instances at once makes every client reconnect simultaneously, overloading authentication.", "Clients that never unsubscribe on screen change accumulate subscriptions until the cap is hit."],
    v: "Drain one instance during a test with one thousand connections. Confirm clients reconnect within the jitter window, no events are lost beyond the documented gap, and server memory returns to baseline.",
    dep: ["live-transport", "authentication-context"]
  },
  "incremental-delivery": {
    s: "Sending a response in several parts, with the essential data first and deferred fragments or list items following, so slow fields do not delay the rest of the screen.",
    d: "Directives mark a fragment as deferred or a list as streamed. The server executes the initial result and sends it, then continues the deferred work and sends patches tagged with a path. The transport is multipart over HTTP or an event stream. Clients merge patches into the earlier result. It improves perceived speed for pages with one slow part, but complicates caching, error handling per patch, and clients, and many servers and caches do not support it.",
    k: ["Defer slow fragments vs wait for everything: deferring shows content sooner; waiting gives one atomic result and simpler caching.", "Stream list items vs return full lists: streaming shows the first items early; full lists are simpler and cacheable."],
    p: ["A cache or proxy that buffers responses delivers all patches at once, defeating the purpose.", "An error in a deferred fragment after the first payload leaves the interface half-rendered."],
    v: "Defer a field that takes two seconds. Confirm the first payload arrives in well under a second without it, the patch arrives at two seconds with a correct path, and the merged result equals a non-deferred call.",
    dep: ["execution-engine", "content-negotiation"]
  },
  "supergraph-schema": {
    s: "The combined schema produced by composing every service's schema, describing the whole graph that clients query while recording which service owns each field.",
    d: "Composition takes each subgraph's schema, merges shared types, links entity extensions and records ownership metadata. The result is one schema for clients and a routing table for the planner. It is generated at build or publish time and served by the router. Teams own their subgraph and see only part of the picture; the supergraph is the only place where conflicts, such as two services defining the same field differently, are discovered.",
    k: ["Compose at publish time vs at router startup: publish time rejects bad schemas before rollout; startup composition is flexible but fails late.", "One supergraph for all clients vs filtered contracts per audience: one is simple; contracts hide internal fields but multiply schemas."],
    p: ["Two services defining one field with different types fail composition only when both are published.", "Router and supergraph version skew leaves the planner unaware of new fields."],
    v: "Compose three subgraph schemas and diff the supergraph against the expected output. Introduce a conflicting field type and confirm composition fails and names both owners.",
    dep: ["composition-checks", "schema-definition-language"]
  },
  "composition-checks": {
    s: "Automated verification that a proposed subgraph schema composes with all others and does not break existing client operations, run before it is published.",
    d: "The check composes the candidate with the current schemas of all other subgraphs, reporting conflicts such as incompatible field types, unresolvable entity keys or missing fields that other services depend on. It then runs the operation history against the composed result. Teams get feedback independent of other teams' timing. The difficulty is coordination: a change valid alone may be invalid with another team's pending change, so publish order and compatibility windows matter.",
    k: ["Check against deployed subgraphs vs against all pending changes: deployed is predictable; pending catches conflicts early but needs coordination.", "Block on composition failure vs allow with warning: blocking protects the graph; warning keeps teams moving but risks a broken supergraph."],
    p: ["Two teams publishing conflicting changes concurrently each pass their own check and break composition together.", "Removing a field one subgraph provides while another depends on it composes but fails at query time."],
    v: "Submit a subgraph change that removes an entity key another service references. Confirm the check fails before publish and names the dependent subgraph and field.",
    dep: ["entities-and-keys", "schema-registry", "operation-checks"]
  },
  "entities-and-keys": {
    s: "Types owned in one service and extended by others, identified by key fields, so a router can fetch a type's pieces from different services and join them.",
    d: "A type is declared an entity with one or more key fields. Another service can add fields to that type by declaring a reference with the same key and a resolver that takes a key representation and returns the fields. The router fetches the key from the owning service and then asks the extending service for the extra fields using that key. This allows relationships across ownership boundaries. Keys must be stable, small and sufficient for lookup, and reference resolvers must handle many keys at once.",
    k: ["Composite natural keys vs a single opaque id: natural keys avoid extra lookups; opaque ids are stable and compact.", "Many services extending one entity vs few: many gives ownership clarity but increases fetches per query."],
    p: ["Reference resolvers returning null for unknown keys produce partial entities that clients misread as missing data.", "Changing a key definition breaks every service that references the entity."],
    v: "Query an entity with fields from two services and confirm the router sends one request to each, with the key representation, and the merged object has all fields for the right entity.",
    dep: ["supergraph-schema", "global-object-ids"]
  },
  "query-planner": {
    s: "Turns a client operation into a plan of fetches to subgraphs, with dependencies and parallelism, using the supergraph's ownership map to decide where each field comes from.",
    d: "The planner walks the selection, groups fields by owning service, and emits fetch nodes: parallel when independent, sequential when one needs keys produced by another. It minimizes round trips and fetch size, flattens duplicate fetches and adds entity lookups where fields cross ownership. Plans can be cached by operation hash. A bad plan costs real money, as extra hops add latency, and plan generation itself can be expensive for large operations, so it is bounded and cached.",
    k: ["Plan per request vs cache plans by operation: per request adapts to variables; caching removes planning cost but must be invalidated on schema changes.", "Fewest fetches vs lowest latency: fewest fetches is cheap but may serialize work; more parallel fetches reduce latency and raise load."],
    p: ["A plan cache keyed without the supergraph version runs stale plans after a schema update.", "Operations spanning many services generate plans with long sequential chains and high tail latency."],
    v: "Print the plan for an operation that needs fields from three services. Confirm independent fetches run in parallel, dependent ones are ordered, and each service receives only the fields it owns.",
    dep: ["supergraph-schema", "document-ast", "entities-and-keys"]
  },
  "query-plan-execution": {
    s: "Runs the plan: sends fetches to subgraphs in order, extracts entity keys from earlier results, merges responses and shapes the final result to the client's query.",
    d: "For each fetch node the executor builds a subgraph operation, sends it with forwarded headers and a deadline, and receives data and errors. Entity keys are extracted from results to build the next fetch, results are merged into the response tree at the right paths, and errors from subgraphs are mapped to client paths. It enforces concurrency limits and timeouts per subgraph. The difficulty is path mapping for lists and nested entities, and combining partial failures into a coherent response.",
    k: ["Parallel fetches where possible vs sequential: parallel lowers latency but raises instantaneous load on each service.", "Return partial data on a subgraph failure vs fail the operation: partial responses degrade gracefully; failing is simpler but less available."],
    p: ["Merging list results by index instead of key misaligns entities when a subgraph reorders them.", "A subgraph error with a path not mapped to the client path is dropped, hiding a failure."],
    v: "Fail one subgraph during a multi-service query. Confirm the response contains the other services' data, an error at the correct client path, and trace spans for each fetch.",
    dep: ["query-planner", "entity-fetch-batching", "subgraph-failure-handling"]
  },
  "entity-fetch-batching": {
    s: "Sending all entity keys needed from one service in a single request, so a list of N items costs one call to each owning service instead of N.",
    d: "When the plan calls for fields from another service for every item in a list, the executor collects the keys into one entities lookup. The receiving service must resolve many keys in one call, usually through its own batch loader. Duplicate keys are deduplicated and results mapped back by position. It is the federated equivalent of the loader. Failing to batch, in the router or in the subgraph's reference resolver, recreates the N plus one problem across network hops, where each call is far costlier.",
    k: ["Batch in router vs batch in the subgraph: both needed; the router limits calls, the subgraph limits backend queries.", "Large batches vs chunked: large batches minimize calls but can exceed limits; chunks bound size at some extra round trips."],
    p: ["A reference resolver that loads each key separately turns one router call into hundreds of backend queries.", "Result order not matching key order assigns fields to the wrong entities."],
    v: "Query a list of fifty entities needing a remote field. Confirm one entities request to the owning service with fifty keys, and one backend query behind it.",
    dep: ["entities-and-keys", "batch-loader", "query-plan-execution"]
  },
  "context-propagation": {
    s: "Forwarding identity, tracing, locale and request metadata from the client request to every subgraph call, in a way each service can trust.",
    d: "The router authenticates the caller, then forwards a verified identity as a signed token or trusted headers, plus trace context and request id. Subgraphs do their own authorization from that identity. Some headers must be dropped, such as hop-by-hop and the original credential. Because every subgraph call carries identity, a compromised or misconfigured service can impersonate users if it can reach others directly, so network policy and token audience matter.",
    k: ["Forward the original credential vs issue a router-signed token: forwarding is simple but exposes user tokens to every service; a signed token limits scope.", "Authorize in router vs in each subgraph: router centralizes policy; subgraphs enforce data-level rules where the data is."],
    p: ["Forwarding the full client header set leaks cookies and tokens to services that should not see them.", "A subgraph reachable directly trusts forged identity headers."],
    v: "Call a subgraph directly with a forged identity and confirm rejection. Through the router, confirm the subgraph sees the real user and the same trace id as the client request.",
    dep: ["authentication-context", "trace-propagation"]
  },
  "subgraph-failure-handling": {
    s: "Policies for slow, failing or unavailable subgraphs: timeouts, retries, circuit breaking and the shape of the partial response returned to the client.",
    d: "Each subgraph call has a deadline and retry rules limited to idempotent queries. A circuit breaker stops calling a failing service and returns errors quickly. When a fetch fails, the router nulls the affected fields according to nullability and records errors with paths. The design problem is the blast radius: a service that owns a non-null field central to many queries can take down large responses, so ownership and nullability must be planned together.",
    k: ["Retry failed fetches vs fail fast: retries hide blips but multiply load on a struggling service; failing fast protects it.", "Serve partial data vs fail the whole request: partial keeps most screens usable; failing is simpler for clients that need completeness."],
    p: ["Retries without a budget amplify an outage into a retry storm.", "A non-null field owned by a failing service nulls the whole parent for every query touching it."],
    v: "Make one subgraph return errors. Confirm the circuit opens after the threshold, requests fail in milliseconds, and unrelated fields still return in queries not touching it.",
    dep: ["query-plan-execution", "backend-resilience", "nullability-model"]
  },
  "persisted-queries": {
    s: "Registered operations stored on the server and referenced by hash, so requests are small, parsing and validation are skipped and unknown operations can be refused.",
    d: "A store maps each hash to its text and, optionally, its validated document and cost. A request carrying only the hash looks it up and executes with the supplied variables. Because the hash is a short string, it can ride in a GET URL, which makes responses cacheable at the edge. The store has to be available and consistent across instances. It also gives a stable operation identity for metrics and rate limits.",
    k: ["Hash of text vs assigned identifier: a hash is derivable by anyone; assigned ids need a registry but can be shorter and meaningful.", "Store in memory vs shared store: memory is fast but differs per instance; a shared store is consistent but adds a lookup."],
    p: ["Hash collisions or normalization differences make two different texts share one entry.", "Instances with different stores return not found for the same hash depending on routing."],
    v: "Request the same hash against every instance behind the balancer and confirm identical results. Request an unknown hash and confirm a distinct, retriable error.",
    dep: ["persisted-query-manifest", "parsed-document-cache"]
  },
  "automatic-persisted-queries": {
    s: "A protocol where a client first sends only a hash and, if the server does not know it, resends with the full text so the server stores it for later requests.",
    d: "The client optimistically sends the hash. On a not-found error it retries with both hash and text; the server verifies the hash matches the text and stores it. Later requests, from any client, use the hash alone. It needs no build pipeline and works for any client. Its weakness is that anyone can register arbitrary text, so it cannot restrict operations, and the store can be filled with junk unless bounded.",
    k: ["Automatic registration vs build-time manifests: automatic needs no pipeline; manifests allow blocking unknown operations.", "Bounded LRU store vs persistent: LRU limits abuse; persistent keeps entries across restarts."],
    p: ["Attackers register many unique documents to evict useful entries and fill memory.", "An unverified hash lets a client overwrite a known hash with different text."],
    v: "Send an unknown hash, then hash plus text, then hash alone. Confirm not-found, success with registration, and success with a cache hit. A mismatched hash and text must be refused.",
    dep: ["persisted-queries", "request-envelope"]
  },
  "cache-hints": {
    s: "Per-field annotations of how long a value may be cached and for whom, combined across the response into one overall policy for the whole result.",
    d: "Fields or types declare a max age and a scope, public or private. During execution, the engine collects hints from every resolved field and takes the minimum age and the most restrictive scope. The result becomes a cache-control header and the policy for response caches. Fields without hints default to zero, so one uncached field makes the whole response uncacheable. The hard part is correctness: a single private field makes the response private, and forgetting that leaks user data into shared caches.",
    k: ["Hints in the schema vs set in resolvers: schema hints are visible and static; resolver hints can depend on the data at the cost of visibility.", "Default to no caching vs a default age: no caching is safe; a default saves load but can serve stale or private data."],
    p: ["A private field without a private hint lets a shared cache store one user's data and serve it to others.", "Taking the minimum age across a large response often yields zero, making hints pointless."],
    v: "Query a public field and a private field separately and together. Confirm the headers show a public age, a private policy and the more restrictive combination respectively.",
    dep: ["schema-directives", "execution-engine"]
  },
  "response-cache": {
    s: "A store of complete operation responses keyed by operation, variables and identity scope, served without executing when the entry is still fresh.",
    d: "Before execution the server computes a key from the operation hash, variables and, for private data, the caller. A hit returns the stored response with headers. A miss executes and stores the result when hints allow. Entries expire by age and can be purged by tag. It gives the largest saving for hot, identical queries. It is sensitive to key design: omitting anything that changes output, such as locale or authorization, serves wrong data.",
    k: ["Cache whole responses vs entities: whole responses are fast and simple but invalidated by any change; entity caching reuses parts across queries.", "Shared cache entries vs per-user: shared are efficient for public data; per-user are safe for private data and have a low hit rate."],
    p: ["A cache key missing the caller serves private data to another user.", "Caching error responses makes a brief outage last until entries expire."],
    v: "Run an identical query twice and confirm the second skips resolvers, visible in tracing. Change a variable and confirm a miss. Run it as another user and confirm private data is not shared.",
    dep: ["cache-hints", "persisted-queries", "authentication-context"]
  },
  "entity-cache": {
    s: "A cache of individual entities by type and key that resolvers or the router consult before fetching, so different queries share cached objects.",
    d: "Entities fetched from a service are stored under their key with a time to live from hints. A later query that needs the same entity, even through a different path, finds it in the cache and skips the service call. Writes invalidate or update the entity. It raises hit rates compared with whole-response caching because queries rarely repeat exactly, but needs careful partial-entity handling: a cached object may hold only some of the fields a new query needs.",
    k: ["Cache by entity vs by response: entity caching has a higher hit rate; response caching is simpler.", "Cache fields with the entity vs separately per field: per entity is compact; per field avoids refetching whole objects."],
    p: ["Cached entities holding only some fields cause new queries to miss, or to return null for unfetched fields.", "Entity cache entries that ignore authorization expose objects across tenants."],
    v: "Fetch an entity via two different queries and confirm the backend is called once. Update it through a mutation and confirm the next query returns the new value.",
    dep: ["entities-and-keys", "cache-hints", "cache-invalidation"]
  },
  "http-edge-caching": {
    s: "Using standard HTTP caching and a content delivery layer for read operations sent as GET with persisted hashes, so repeated reads are served without reaching the server.",
    d: "A GET with a short hash URL is cacheable by any intermediary that honors cache-control. The server sets headers from hints, and the edge varies on the headers that matter. Edge purge by tag or URL handles invalidation. Mutations stay on POST and are never cached. It gives geographic latency benefits and takes load off the origin. The usual issues are private data in shared caches and cache keys that ignore authorization headers.",
    k: ["Cache at the edge vs only at the origin: edge reduces latency and load; origin caching is simpler and always uses current authorization.", "GET with persisted hashes vs POST only: GET enables caching; POST avoids URL logging and length limits."],
    p: ["Edge ignoring Vary on authorization serves one user's response to another.", "Long URLs from unpersisted GET queries exceed limits and silently fail."],
    v: "Request the same persisted GET from two locations and confirm the second is a cache hit by header. Request a private operation and confirm the edge does not store it.",
    dep: ["http-transport", "cache-hints", "persisted-queries"]
  },
  "cache-invalidation": {
    s: "Mechanisms for removing or refreshing cached entries when data changes: time to live, tags, key-based purge and write-through updates on mutation.",
    d: "Entries carry tags such as entity keys. When a mutation changes an entity, the server purges entries with its tag, in the response cache, entity cache and edge. Time to live bounds staleness when invalidation is missed. Events from the data layer can drive purges for changes not made through the graph. It is hard because a response depends on many entities and the dependency set is not always known, so over-invalidation is common and under-invalidation serves stale data.",
    k: ["Tag-based purge vs time-based expiry only: tags give freshness after writes but need tracking; expiry is simple but allows staleness up to the lifetime.", "Purge on mutation response vs from change events: mutation hooks are easy but miss writes made elsewhere; events cover all writes but add infrastructure."],
    p: ["Writes made by other systems never purge the graph's caches, which serve old data until expiry.", "Purge failing silently leaves stale data with no alert."],
    v: "Cache a response, change the underlying entity via a mutation and via a direct database write. Confirm the mutation purges immediately and the database write is reflected within the expiry or event delay.",
    dep: ["response-cache", "entity-cache", "http-edge-caching"]
  },
});
