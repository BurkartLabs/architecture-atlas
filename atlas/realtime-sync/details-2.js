// Details for the real-time sync plate, part 2: authorization, subscriptions, presence, fan-out.
ATLAS.details("realtime-sync", {
  "authentication-tokens": {
    s: "Signed credentials presented when a connection opens, proving who the caller is and carrying claims that authorization rules can read, without a database lookup per message.",
    d: "The client obtains a token from an identity provider and sends it in the connection handshake. The gateway verifies the signature and expiry against cached public keys and attaches the claims, such as user id and roles, to the session. Every later message is authorized against that session. Hard parts are lifetime and revocation: short-lived tokens limit damage but must be refreshed on a link that may stay open for days, and a stolen long-lived token stays valid until it expires.",
    k: ["Self-contained signed tokens vs server-side session lookups: signed tokens verify locally and scale well, but cannot be revoked instantly; lookups revoke at once but add a dependency to every connection.", "Token in the handshake vs per-message token: handshake authentication is cheap, but the permissions it grants last as long as the connection."],
    p: ["A token placed in a connection URL is written to proxy logs and leaks to anyone with log access.", "Verification keys are cached forever, so a key rotation locks out every client until the gateways restart."],
    v: "Connect with an expired token and confirm rejection. Connect with a valid one, rotate the signing key at the provider, and confirm new connections verify against the new key within the cache time without a restart.",
    dep: ["websocket-gateway"]
  },
  "live-token-refresh": {
    s: "Replaces an expiring token on an open connection without dropping it, so access ends on time and a user does not have to reconnect every few minutes.",
    d: "The client sends a fresh token over the existing link before the old one expires. The gateway verifies it, checks that it belongs to the same user, and swaps the claims on the session. If no valid token arrives by expiry, the server closes the connection or pauses subscriptions. Claim changes can alter which documents the user may see, so subscriptions must be re-evaluated after a swap. The difficulty is the gap: refresh requests can be delayed by the network, and a client that is asleep misses its window.",
    k: ["Refresh in-band on the socket vs reconnect with a new token: in-band keeps subscriptions and avoids a surge, but the server needs logic to re-authorize live queries; reconnecting is simple but noisy.", "Hard cutoff at expiry vs a short grace period: a cutoff is strict and safe, but drops users on clock skew or brief delays."],
    p: ["A refresh grants a different user's identity to an existing session if the owner check is skipped.", "Clients refresh at the same moment because tokens were all issued together, creating periodic load spikes."],
    v: "Hold a connection open for three token lifetimes with refresh and confirm no disconnects. Withhold the refresh and confirm the server stops delivering data at expiry.",
    dep: ["authentication-tokens", "rule-change-propagation"]
  },
  "authorization-rules": {
    s: "Declarative statements saying who may read, create, update or delete which data, evaluated by the server so that the client is never trusted to enforce access.",
    d: "Rules are written per collection or path as conditions over the caller's identity, the document being accessed, and sometimes other documents. They apply to reads, subscriptions and writes alike. Because clients talk directly to the data layer, these rules are the whole access control, not one layer among several. Hard parts are expressiveness and cost: rules that look up other documents can be slow or leak data through timing, and rules that are too simple push people toward granting broad access.",
    k: ["Declarative rules vs access checks written in server functions: rules can be analyzed and applied to live queries, but are limited in what they express; code is flexible and opaque to the query engine.", "Default deny vs default allow: deny prevents accidental exposure, but makes initial development slower and tempts teams to loosen rules broadly."],
    p: ["A rule that checks the caller's role but not the document's owner lets any signed-in user read everyone's data.", "Rules tested only with the owner's account pass in review and fail to block other users."],
    v: "For each rule, run a matrix of anonymous, owner, other user and administrator against read, subscribe, create, update and delete, and confirm only the intended cells succeed, including through a live query.",
    dep: ["authentication-tokens", "rule-compiler"]
  },
  "per-document-evaluation": {
    s: "Checks the access rules against each individual document before it enters a subscription result or a delta, because a query allowed in general can still match forbidden documents.",
    d: "For each document a subscription would send, the server evaluates the rules with the caller's claims and that document's fields. Documents that fail are omitted, so two users running the same query see different results. When a document changes so that access appears or disappears, the subscriber must receive an add or a remove accordingly. Cost is the main problem: evaluation runs per document, per subscriber, per change, so rules must be cheap or the results cached, and rules that consult other documents multiply reads.",
    k: ["Filter results after the query vs require queries to prove access up front: post-filtering is simple and exact, but wastes work on documents that are dropped; query proving rejects unsafe queries early but burdens developers.", "Cache decisions per document version vs evaluate every time: caching is much faster at fan-out, but decisions must be invalidated when rules or related documents change."],
    p: ["A document changing from private to shared never reaches subscribers because only edits to visible documents are checked.", "A subscription count of ten thousand times a change rate of 100 per second means a million rule evaluations per second."],
    v: "Subscribe as two users to one collection with documents of mixed ownership, change a document's owner, and confirm one subscriber receives a removal and the other an addition, with no contents leaked to either beforehand.",
    dep: ["authorization-rules", "live-query-engine", "document-model"]
  },
  "rule-compiler": {
    s: "Parses the rule language, checks it, and turns it into fast executable predicates, so rules can run on every document at fan-out rates and be verified before deployment.",
    d: "Rules are parsed into a tree, type-checked against the schema, simplified, and compiled to a predicate over claims and document fields. The compiler also extracts what each rule reads, which tells the engine which other documents a decision depends on and which index can pre-filter results. Static checks catch rules that always allow or never match. The hard parts are keeping the language small enough to analyze and fast enough to run, while still expressing real ownership, role and sharing models.",
    k: ["A restricted rule language vs a general programming language: restriction allows analysis, termination guarantees and index use, but some policies need workarounds; general code is expressive and impossible to analyze.", "Compile at deploy vs interpret at request: compiled predicates are faster and checked early, but a rule change has an activation step and version to manage."],
    p: ["A rule that references a field missing from the schema evaluates to false everywhere and silently locks users out.", "A rule with an unbounded lookup chain becomes the slowest part of every write."],
    v: "Deploy a rule set with a deliberate type error and confirm the compiler rejects it with a position. Deploy a valid one and confirm benchmarked evaluation stays under the per-document budget at target fan-out.",
    dep: ["schema-validation"]
  },
  "field-redaction": {
    s: "Removes or masks individual fields a viewer may not see while still delivering the rest of the document, so one document can serve several audiences.",
    d: "After the document-level check passes, per-field rules decide which fields are kept. Redaction runs before encoding, so hidden values never reach the connection or the client cache. It must also apply to deltas: a change to a hidden field should produce no message, and a change that reveals a field should send it. Hard parts are queries and indexes: filtering or sorting on a hidden field leaks its value by what comes back, so such queries must be rejected or evaluated against the allowed fields only.",
    k: ["Redact fields in one document vs split sensitive fields into a separate document: redaction keeps a single record, but every code path must apply it; splitting makes the boundary structural and easy to verify.", "Reject queries that touch hidden fields vs return only permitted results: rejection avoids inference, but breaks legitimate queries that would only have matched allowed data."],
    p: ["A sort by a hidden field reveals the order of private values even though the values are omitted.", "The initial snapshot is redacted but a later delta contains the full changed document."],
    v: "As a restricted user, subscribe to a document with a private field, change that field from another account, and confirm no message, byte or ordering change reaches the restricted client. Then confirm an allowed field's change does arrive.",
    dep: ["per-document-evaluation", "delta-messages"]
  },
  "rule-change-propagation": {
    s: "Applies updated authorization rules or changed permissions to subscriptions already open, so revoked access stops delivering data without waiting for the user to reconnect.",
    d: "When a rule set is deployed, or a user's role or a document's sharing list changes, the server identifies the affected subscriptions and re-evaluates them. Documents that are no longer allowed are sent as removals, newly allowed ones as additions. Changes to related documents, such as a membership list, require tracking which subscriptions depend on them. Without this, access is only checked when a subscription starts. It is hard because the dependency can be wide and the re-evaluation burst competes with normal traffic.",
    k: ["Re-evaluate affected subscriptions immediately vs at next reconnect: immediate propagation closes the revocation gap, but costs a burst of work; deferring is cheap and leaves old access open.", "Track exact dependencies vs re-evaluate everything for the tenant: exact tracking is cheaper per change, but needs bookkeeping that can itself be wrong."],
    p: ["A user removed from a team keeps receiving the team's documents until the app restarts.", "A permission change on a popular group triggers re-evaluation of every subscription at once and stalls delivery."],
    v: "Revoke a user's access to a collection while their client holds a live subscription and confirm removals arrive within the target seconds, after which no further changes to that data reach them.",
    dep: ["dependency-tracking", "per-document-evaluation", "subscription-registry"]
  },
  "subscription-registry": {
    s: "The index of every active subscription, recording who asked for what, on which connection and from which position, so incoming changes can be matched against them.",
    d: "Each entry holds a query description, the owning connection, the caller's claims, the client's last confirmed position and the server-side state of its result. Entries are indexed by what they read, such as collection and field predicates, so a change finds candidates without scanning all subscriptions. The registry is partitioned across nodes and rebuilt on failure. It is hard because it is both huge and hot: millions of entries, each updated by writes, and it must stay consistent with connection state.",
    k: ["Index subscriptions by read predicates vs scan all on each change: indexing makes matching proportional to interested subscriptions, but costs memory and update work on subscribe.", "Keep the registry in memory vs persist it: memory is fast and simple, but a node loss needs clients to resubscribe; persistence speeds recovery and slows every subscribe."],
    p: ["Entries for closed connections are never removed, so every change is evaluated for subscribers that no longer exist.", "A registry node restart loses subscriptions and clients are not told, so their screens freeze without error."],
    v: "Open 100,000 subscriptions, close half the connections, and confirm the registry size halves, changes route only to remaining subscribers, and CPU per change matches the number of matching subscriptions.",
    dep: ["connection-registry", "dependency-tracking"]
  },
  "live-query-engine": {
    s: "The component that evaluates a subscribed query once, then keeps its result current as data changes, producing changes to the result rather than new results.",
    d: "On subscribe it runs the query against indexes to produce an initial result and records what it read. As the change feed delivers writes, it tests each write against the subscription's conditions and updates the result set: add, update, or remove. Ordering and limits make this nontrivial, since a deletion can pull a new document into a top ten that must be fetched. Alternatives are re-running the query on every relevant change, which is simple and expensive, or maintaining incremental state, which is efficient and complex.",
    k: ["Re-run the query on a relevant write vs maintain results incrementally: re-running is simple and always correct, but costs a query per change; incremental maintenance is cheap per change and has more edge cases.", "Evaluate in the data tier vs in a separate service: collocation is fast and consistent, but couples scaling of queries and storage."],
    p: ["A top-N query misses the document that should replace a deleted one, because the engine only saw the delete.", "A rewrite of the query engine changes result ordering for ties and clients show items jumping around."],
    v: "Subscribe to a sorted, limited query, run 10,000 random inserts, updates and deletes against the data, and compare the maintained result with a fresh evaluation of the same query after each batch. They must match exactly.",
    dep: ["change-feed", "secondary-indexes", "dependency-tracking", "incremental-maintenance"]
  },
  "dependency-tracking": {
    s: "Records which documents, index ranges and fields each subscription read, so a write can be checked against exactly the subscriptions it might change.",
    d: "While evaluating a query, the engine notes every document and index range it consulted, forming a read set. A write is intersected with read sets: only subscriptions whose reads overlap are re-evaluated. Range reads matter because a new document can match a query without any existing document having changed, so tracking must cover the gaps where documents could appear. The balance is precision against cost: a coarse read set causes needless work, and a read set that misses something causes a stale result.",
    k: ["Track exact ranges vs track whole collections: exact ranges avoid most re-evaluation, but need an interval index and careful handling of gaps; whole-collection tracking is trivial and wakes everything.", "Over-approximate and re-check vs under-approximate and fix later: over-approximation is always safe, only spending extra work; under-approximation risks showing stale data."],
    p: ["The read set covers existing matches but not the empty range, so a new matching document never appears.", "Read sets for large scans grow into memory per subscription and dominate the node's footprint."],
    v: "Subscribe to a query that currently returns nothing, insert a matching document, and confirm it appears. Insert a nonmatching document and confirm no re-evaluation is counted for that subscription.",
    dep: ["secondary-indexes", "change-feed"]
  },
  "incremental-maintenance": {
    s: "Updates a query's result from a single change using only the change and a small amount of retained state, instead of recomputing the result from the data.",
    d: "For filters, an incoming document is tested against the predicate and added, removed or updated in place. For sorted limits, the engine keeps a small buffer beyond the window so a removal can be filled without a query. For aggregates such as counts and sums, it adjusts a running total. Joins and arbitrary functions are hard to maintain this way and fall back to re-running. The challenge is memory and correctness: retained state must stay exact through reordering, and deletions need old values that the feed must supply.",
    k: ["Retain a buffer past the visible window vs refetch when needed: a buffer fills gaps instantly, but costs memory per subscription and eventually runs out.", "Support only simple operators incrementally vs all operators: simple operators are provably correct and fast, but complex queries must fall back to slower paths."],
    p: ["Maintaining a count from inserts alone, without handling a move from one filtered set to another, drifts from the true count.", "Aggregate state is lost on a node restart and rebuilt from partial data, so totals show wrong numbers."],
    v: "Subscribe to a count with a filter, apply a mix of inserts, deletes and filter-changing updates, and confirm the maintained count equals a direct count query at every step, including after a node restart.",
    dep: ["live-query-engine", "change-feed"]
  },
  "result-diffing": {
    s: "Computes the smallest description of how a result changed, such as documents added, removed, moved or partially updated, to send over the wire instead of the full result.",
    d: "After a write is applied to a subscription's result, the engine compares old and new states and emits operations: insert at position, remove, update fields, move. For documents it may send only changed fields. A diff must be applied by the client to reach the same state, so operations carry identifiers and positions that remain valid in sequence. The hard cases are reorders, where computing a minimal move set is costly, and large documents where field-level diffing costs more than just resending.",
    k: ["Field-level patches vs whole-document replacement: patches cut bandwidth for large documents, but the client must apply them in order and the server must hold the previous version.", "Minimal move sets vs a simple remove and insert: minimal moves animate nicely and cost computation; remove and insert is crude and cheap."],
    p: ["A patch applied against a client copy that has diverged produces a corrupt document with no error.", "Diffing a large list on every change burns more CPU than the network time it saves."],
    v: "Apply a recorded stream of server diffs to an empty client copy and compare with the server's result at each step. Confirm the byte count of the diffs is far below the cost of resending full results.",
    dep: ["live-query-engine", "delta-messages"]
  },
  "query-deduplication": {
    s: "Detects that many clients subscribed to the same query and shares one evaluation among them, so work grows with distinct queries rather than with subscribers.",
    d: "Queries are normalized, with parameters sorted and constants hoisted, then hashed into a key. Subscribers with the same key and the same authorization context share one evaluation and one result state, and each gets its own cursor. When authorization differs per user, sharing is limited to a group of callers who would see identical results, or the shared evaluation is done unfiltered and the per-user filter applied afterward. The difficulty is deciding what counts as the same query without leaking one user's data to another.",
    k: ["Share evaluation across users and filter per user afterward vs evaluate per user: sharing scales to huge audiences, but per-user filtering costs CPU on every delivery.", "Normalize aggressively vs match only identical text: aggressive normalization finds more sharing, but a bug in it can merge queries that differ."],
    p: ["A cache key omits the caller's claims and a result computed for one user is delivered to another.", "Dedup groups grow to a million subscribers and a single node cannot hold the fan-out for one key."],
    v: "Start 10,000 subscribers on one query and confirm the engine evaluates it once per change, while a subscriber with different permissions still receives only the documents it is allowed to see.",
    dep: ["subscription-registry", "per-document-evaluation"]
  },
  "subscription-lifecycle": {
    s: "The states a subscription passes through, from creation and initial result through live updates to suspension, resume and cancellation, with cleanup at each end.",
    d: "A subscription is created by a client message, validated, authorized and registered. It then delivers an initial result, followed by deltas, and may be suspended when the connection drops or the token expires. On resume it is revalidated and caught up, or reset with a new snapshot. On cancellation or timeout its server state, including read sets, buffers and registry entries, is released. The hard part is cleanup: orphaned subscriptions cost memory and CPU forever, so every exit path must release everything.",
    k: ["Keep suspended subscriptions for a window vs delete at disconnect: keeping makes resume fast, but costs memory for clients that never return.", "Server-driven expiry vs client-driven cancel only: server expiry prevents leaks from vanished clients, but can remove a subscription from a client that is merely slow."],
    p: ["A client crash skips the cancel message and its subscriptions run forever.", "A subscription is limited per user only at creation, so a bug loops creating thousands and exhausts the node."],
    v: "Create and drop 100,000 subscriptions through clean cancels, crashes and timeouts, and confirm the registry and memory return to baseline within the expiry window.",
    dep: ["subscription-registry", "heartbeats-and-liveness"]
  },
  "windowed-results": {
    s: "Maintains an ordered, bounded window of a query's results, such as the top 50 or the page after a cursor, and updates it as documents move into and out of range.",
    d: "Subscriptions to ordered data usually ask for a limit or a page. The engine keeps the window in sorted order, using the index's sort order, and handles inserts, deletes and key changes that move documents across the boundary. Pagination by cursor, which names the last seen key, stays stable as data changes, while offset-based pages shift. Hard parts are ties in the sort key, which need a unique tiebreaker, and windows that start in the middle of a long list whose earlier content keeps changing.",
    k: ["Cursor-based windows vs offset-based pages: cursors stay stable under inserts and are cheap on indexes, but cannot jump to an arbitrary page number.", "Live window with refill buffer vs refetch on boundary change: a buffer is instant and uses memory, while refetching is simple and delays the update."],
    p: ["Ties on a timestamp key produce unstable order, so documents appear to swap places between updates.", "An offset page shows the same document twice or skips one after an insert above it."],
    v: "Subscribe to the newest 20 items, insert 100 items quickly, and confirm the window always holds the exact 20 newest in the correct order, and that deleting one pulls in the next without a gap.",
    dep: ["live-query-engine", "composite-indexes"]
  },
  "presence-state": {
    s: "A small per-user record of current status, such as online, away or viewing a page, stored in memory and shared with others in the same room or document.",
    d: "Each client publishes a state object that others in its scope can read. The server keeps the latest state per connection and merges states from a user's several devices into one. Changes are broadcast to the scope's subscribers, and a join and leave event is generated when a connection appears or goes. Writes are frequent and need no durability, so presence bypasses the document store. The hard parts are consistency across servers, since the same user may connect to different nodes, and cleanup when a node dies.",
    k: ["In-memory presence vs persisted presence: memory costs no writes and is cheap at scale, but a node crash loses state until clients republish.", "Per-connection state vs per-user state: per-connection is simple and accurate for multiple devices, but the interface must merge it into a single answer."],
    p: ["A user with two tabs appears offline when one tab closes, because the leave event ignored the other connection.", "State stored with no size limit lets a client push megabytes into every peer's feed."],
    v: "Open three connections as one user, close two, and confirm others still see the user online. Close the last and confirm a leave event arrives within the expiry time.",
    dep: ["ephemeral-channels", "presence-expiry"]
  },
  "presence-expiry": {
    s: "Removes presence entries whose owner has gone silent, using heartbeats or leases, so people who lose connection do not stay shown as online.",
    d: "Every presence entry has a time-to-live refreshed by the owner's heartbeats. If refreshes stop, the entry expires and a leave event is sent. A clean close removes it at once. Expiry timing is a tradeoff between flicker and truth: a short lease shows brief network blips as people leaving and joining, while a long one keeps ghosts. Some systems add a delay before announcing a leave so a quick reconnect cancels it. Leases must also survive the death of the node that tracks them.",
    k: ["Short lease vs long lease: a short lease shows reality quickly and flaps on poor networks; a long lease is stable and shows people who have left.", "Delay leave announcements vs send immediately: a delay absorbs reconnects, but others see a person who is already gone for that period."],
    p: ["A node crash drops its timers, so entries it tracked never expire and ghost users remain indefinitely.", "Clock drift between nodes makes leases expire early on some and late on others."],
    v: "Kill a client's network without closing the connection and confirm its presence disappears within the lease time and a leave event is delivered. Reconnect within the grace delay and confirm no leave was sent.",
    dep: ["heartbeats-and-liveness", "presence-state"]
  },
  "ephemeral-channels": {
    s: "Named rooms for short-lived, non-durable messages and state, scoped to a document or session, that exist only while someone is subscribed.",
    d: "A channel is created on first join and removed when empty. Messages published to it are fanned out to current members and then forgotten. Membership is authorized with the same rules as the underlying document. Channels back presence, cursors and broadcast messages. They live in memory on a node chosen by hashing the channel name, so all members must reach that node, either directly or through the bus. The difficulties are placement of very large channels and keeping membership correct as nodes join and fail.",
    k: ["Pin each channel to one node vs replicate across nodes: pinning gives simple ordering and state, but caps channel size and loses state on failure; replication tolerates failure at the cost of coordination.", "Authorize at join only vs on every message: join checks are cheap, but a revoked user keeps posting until reconnection."],
    p: ["A channel's name is guessable and an authorization check is missing, so anyone can join another team's room.", "A very popular channel hashes to one node that saturates while others idle."],
    v: "Join a channel from two nodes' clients, publish 1,000 messages, and confirm all members receive each once in order. Remove the last member and confirm the channel's memory is released.",
    dep: ["pub-sub-bus", "authorization-rules"]
  },
  "cursors-and-typing": {
    s: "Rapidly changing, low-value signals such as pointer position, text selection and typing status, shared with collaborators and deliberately dropped or throttled when the network falls behind.",
    d: "Clients send these signals many times per second. The server relays them to channel members without storing them, throttles each sender, and drops stale ones, since only the latest matters. Positions are expressed relative to the document structure rather than absolute coordinates, so that they stay correct as text changes. A position inside collaboratively edited text must be transformed through edits to remain accurate. Hard parts are volume, which scales with members squared, and consistency with content changes that arrive separately.",
    k: ["Send every update vs throttle and keep latest: throttling reduces traffic by orders of magnitude and makes motion look slightly choppy; full streams look smooth and overload large rooms.", "Anchor positions to the document model vs raw offsets: anchors survive concurrent edits, but need a mapping on every change."],
    p: ["A cursor offset is not transformed after a concurrent insert, so collaborators see each other editing at the wrong place.", "A room of 500 people each sending 30 updates per second produces 450,000 messages per second per sender fan-out."],
    v: "In a room of 100 simulated users each moving a cursor at 30 updates per second, confirm per-client inbound traffic stays under the throttle limit and cursor positions stay attached to the right text after concurrent edits.",
    dep: ["ephemeral-channels", "coalescing"]
  },
  "presence-aggregation": {
    s: "Summarizes presence for large audiences as counts and samples instead of full member lists, so rooms with thousands of people do not generate a message per join and leave.",
    d: "Sending every join and leave to every member costs quadratic traffic. Past a threshold the server switches to aggregate: it publishes a count and a bounded sample of members at a fixed interval, or only the changes for people the viewer follows. Counts are kept with approximate or partitioned counters across nodes and merged. The challenge is consistency of the numbers and the transition between modes, as viewers should not see the count jump when the room crosses the threshold.",
    k: ["Exact member list vs approximate count: an exact list supports mentions and avatars, but cost grows with the square of audience; a count scales to millions.", "Update interval short vs long: frequent summaries look live and use more traffic, long intervals are cheap and obviously delayed."],
    p: ["Switching from full lists to counts drops members the interface still renders, leaving ghost avatars.", "Per-node counters double count a user connected to two nodes during a rebalance."],
    v: "Grow a room from 10 to 50,000 simulated members and confirm per-member traffic stays flat after the threshold, the displayed count stays within a small error of the true count, and there are no jumps at the switch.",
    dep: ["presence-state", "coalescing"]
  },
  "broadcast-messages": {
    s: "Fire-and-forget messages sent to everyone in a channel, such as a reaction or a notice, delivered to connected members now and never stored or replayed.",
    d: "A client publishes to a channel, and the server forwards the message to all current members, optionally excluding the sender. No acknowledgement of receipt is given and no history is kept, which is what distinguishes it from a stored document change. Authorization checks who may publish. Rate limits prevent floods, and size limits keep fan-out cheap. Because delivery is best-effort, applications must use stored documents for anything that must not be missed.",
    k: ["Best-effort broadcast vs durable messages: best-effort is cheap and fast and loses messages for disconnected members; durable messages cost a write and support replay.", "Server relays all messages vs peer-to-peer after introduction: relay is authorizable and observable, but costs server bandwidth; peer-to-peer saves it and breaks control."],
    p: ["A feature built on broadcast alone silently drops events for users who were reconnecting at that moment.", "No rate limit on publishers lets one client saturate a channel for everyone."],
    v: "Publish 1,000 messages to a channel with 50 members, drop one member's connection for part of it, and confirm the others receive all 1,000 while the dropped member receives only those sent while connected.",
    dep: ["ephemeral-channels", "load-shedding"]
  },
  "change-routing": {
    s: "Matches each committed change to the subscriptions and connections that care about it and sends it to the nodes holding them, without contacting nodes that do not.",
    d: "A change arrives from the feed with its collection, document and old and new values. The router looks up interested subscriptions by their read predicates, groups them by the node that owns them, and sends one message per node containing the change and the list of subscriptions. Each node then evaluates authorization and forwards to connections. The design goal is that cost is proportional to interested subscribers. Hard parts are the lookup index at scale and keeping routing tables in step with subscribe and unsubscribe.",
    k: ["Route by index of subscription predicates vs broadcast every change to every node: an index spares uninterested nodes, but adds a shared structure to keep current; broadcast is simple and does not scale.", "Route before authorization vs after: routing first keeps the router simple, but moves rule evaluation to the receiving node where data is already present."],
    p: ["Routing tables lag behind subscribe messages, so a change committed just after a subscribe is missed.", "A router node failure drops its in-flight changes and no subscriber learns of the gap."],
    v: "Subscribe from clients on 20 nodes to disjoint predicates, write matching and nonmatching documents, and confirm each change reaches only the nodes with a matching subscription and no matching subscriber misses it.",
    dep: ["change-feed", "subscription-registry", "pub-sub-bus"]
  },
  "pub-sub-bus": {
    s: "The internal messaging layer that carries changes and presence events between server nodes, organized by topic, so producers and consumers do not need to know each other.",
    d: "Nodes publish events to topics, and nodes with interested subscribers subscribe to them. The bus may be in-memory and lossy for ephemeral data, or a durable log for changes that must not be missed. It handles topic creation, membership changes and node failure. Hard parts are delivery guarantees: lossy buses are fast and require a way to detect gaps, while durable buses cost latency and storage. Topic count can reach millions, so per-topic state must be small.",
    k: ["At-most-once memory bus vs durable log bus: memory is fast and cheap, so gaps must be detected and repaired from the change feed; a durable log never loses events and adds latency.", "Fine-grained topics per document vs coarse topics per collection: fine topics send only what is needed and strain the bus's topic count; coarse topics are few and send much extra."],
    p: ["A lossy bus drops a message during a reconnect and nothing detects the gap, so one subscriber stays stale.", "Topic subscriptions are not removed when a node's last interested subscriber leaves and bus state grows forever."],
    v: "Publish a numbered sequence of 100,000 events across the bus, kill and restart one consumer node mid-stream, and confirm every subscriber ends with the complete sequence in order, with gaps detected and repaired within seconds.",
    dep: ["change-feed", "sync-cursors"]
  },
  "topic-sharding": {
    s: "Splits topics across many bus and fan-out nodes by hashing, so no single machine carries all traffic and capacity grows by adding nodes.",
    d: "Each topic maps to a shard by a hash of its name, and a shard map says which nodes serve it. Producers send to the shard's owner; consumers connect to the owners of the topics they care about. Adding nodes changes the map, so topics move, and in-flight state must be handed over without gaps or duplicates. Consistent hashing reduces movement. The difficulty is skew: hash placement is uniform for topics, but traffic per topic is not, so shards still become hot.",
    k: ["Consistent hashing vs a central assignment table: hashing needs no coordinator and moves little data on change, but gives no control over hot topics; a table allows manual placement and needs a coordinator.", "Many small shards per node vs one shard per node: small shards rebalance smoothly, at the cost of more per-shard overhead."],
    p: ["A shard map change is seen by nodes at different times and some publish to the old owner for seconds.", "One celebrity topic carries more traffic than all others combined and pins its shard at full CPU."],
    v: "Add a node to a running cluster and confirm only the expected fraction of topics move, no events are lost or duplicated during the move, and per-node load evens out within a few minutes.",
    dep: ["pub-sub-bus", "partitioning"]
  },
  "fanout-tiers": {
    s: "A layered distribution tree where an origin sends a change to a few relays that in turn send to many gateways, avoiding any single node sending to all subscribers.",
    d: "For a topic with a million subscribers on thousands of gateways, the owner sends one copy to a set of relay nodes, each of which forwards to a group of gateways, and each gateway to its connections. Each level multiplies reach while bounding every node's outgoing work. Adding levels adds latency per hop. Trees must be rebuilt as nodes leave, and branches that fail must be repaired without duplicating or dropping messages. Small topics skip tiers and send directly.",
    k: ["Tree of relays vs direct send from the owner: a tree bounds per-node egress and scales to very large audiences, but adds latency and failure paths; direct send is fast and capped by one node's bandwidth.", "Static tree vs dynamically built tree: static is predictable and wastes capacity for small topics; dynamic fits the audience and costs coordination."],
    p: ["A relay failure silently cuts off all of its downstream gateways until the tree is rebuilt.", "Latency across three hops pushes a live update past the target for subscribers at the leaves."],
    v: "Publish to a topic with a million simulated subscribers and confirm all receive the message within the latency target, the origin's egress stays under its bound, and killing one relay restores delivery to its branch within seconds.",
    dep: ["pub-sub-bus", "topic-sharding", "connection-registry"]
  },
  "coalescing": {
    s: "Combines several rapid changes to the same data into one outgoing update, trading a small delay for large savings in messages, rendering work and bandwidth.",
    d: "When a document changes ten times in a hundred milliseconds, subscribers rarely need all ten intermediate states. The server holds updates in a short window, merges them by keeping the latest value or composing patches, and sends one. The window can be adaptive: short at low load, longer under pressure. Coalescing is right for state but wrong for event logs, where each entry matters. Hard parts are choosing the window and keeping versions consistent so clients know which states they skipped.",
    k: ["Coalesce to latest state vs deliver every change: coalescing cuts traffic and render load dramatically, but hides intermediate states some applications need to see.", "Fixed window vs adaptive by load: a fixed window is predictable, while adaptive batching protects the system under bursts and varies latency."],
    p: ["A counter-style data type is coalesced as 'latest wins' and increments between sends are lost.", "A long window under load delays a time-sensitive update past its usefulness."],
    v: "Write to one document 1,000 times in one second and confirm each subscriber receives far fewer updates, the final one equals the last write, and the delay introduced never exceeds the configured window.",
    dep: ["result-diffing", "delta-messages"]
  },
  "hot-key-mitigation": {
    s: "Detects documents, topics or ranges that receive disproportionate traffic and spreads their load across more nodes, since uniform hashing alone cannot handle skewed demand.",
    d: "A small number of keys, such as a live scoreboard or a shared document everyone watches, can dominate reads, writes or subscribers. Detectors sample per-key rates; mitigations include replicating the key's state to many read nodes, splitting a counter into sub-counters merged on read, caching its latest value at the edge, and rate-limiting writes. Each trades freshness or complexity for capacity. Hard parts are detecting early enough and switching strategies without dropping updates.",
    k: ["Replicate hot data to many read nodes vs one authoritative node: replication spreads reads widely, but readers may lag the writer slightly; one node is exact and capped.", "Shard a counter into parts vs a single counter: sharding scales write rate linearly, but reads must sum the parts and see approximate recent totals."],
    p: ["A hot key is detected only after the owning node has already fallen over and taken its neighbors with it.", "Replicas for a hot document are not updated in order, and different viewers see different last values."],
    v: "Drive one document at 50 times the typical per-key rate and confirm the system detects it, spreads its load, and keeps p99 delivery latency under target for it and for unrelated keys on the same node.",
    dep: ["topic-sharding", "server-timestamps-counters"]
  },
  "cross-region-delivery": {
    s: "Carries changes between data centers so users in each region get low-latency live updates, while the system decides which region accepts writes and how far apart copies may drift.",
    d: "Each region runs gateways and a cache of the data near its users. Changes made in one region replicate to others through the change feed and are fanned out locally. Writes are either routed to a home region for the document, giving one authority, or accepted anywhere and merged with conflict rules. Inter-region links add tens to hundreds of milliseconds, and partitions between regions are normal events. The hard part is choosing which guarantees survive a partition.",
    k: ["Single home region per document vs writes accepted in any region: a home region gives simple ordering but slower remote writes; multi-region writes are fast locally and need conflict resolution.", "Replicate full change feed vs only needed topics: full replication is simple and wasteful; selective replication saves bandwidth and needs interest tracking."],
    p: ["A regional partition leaves two regions both accepting writes to a document with no merge rule, and the data diverges permanently.", "A user is routed to a distant region after failover and sees data older than their last write."],
    v: "Write in one region and confirm subscribers in each remote region receive the change within the measured link delay plus a small margin. Cut the link, write on both sides, restore it, and confirm convergence per the conflict rules.",
    dep: ["replication-failover", "change-feed", "hybrid-logical-clocks"]
  },
});
