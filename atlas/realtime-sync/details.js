// Details for the real-time sync plate, part 1: client libraries, offline behavior, connection management.
ATLAS.details("realtime-sync", {
  "client-sdk-api": {
    s: "The programming interface apps call to read, write and subscribe. It hides sockets, retries and caching behind a small set of operations that behave the same online and offline.",
    d: "The SDK exposes document reads, queries, writes, transactions and subscriptions, usually returning handles that emit events rather than one-shot results. Internally it owns the connection, the cache, the mutation queue and the authentication state, and routes each call to the right one. It is hard because every call has three possible answers at once: a cached value, a local optimistic value and a confirmed server value. The API has to say which one the caller received without making simple code complicated.",
    k: ["Subscription handles vs one-shot reads: handles make live data the default and keep screens current, but callers must manage lifetimes or leak open queries.", "Promise-style writes resolved on local apply vs on server confirmation: local apply feels instant, but code that needs the confirmed result must opt in separately."],
    p: ["A screen that subscribes in a render loop without releasing the handle opens hundreds of duplicate queries.", "Callers treat a locally applied write as saved and show success to a user whose write the server later rejects."],
    v: "Subscribe to a document, write to it from a second client, and confirm the first client's callback fires once with the new value. Repeat while the first client is offline and confirm it fires on reconnect.",
    dep: ["normalized-cache", "mutation-queue", "websocket-gateway"]
  },
  "normalized-cache": {
    s: "A client-side store that keeps each document once, keyed by identity, so every query and screen showing it sees the same current value.",
    d: "Query results are stored as lists of document identifiers pointing into a single table of documents, instead of as copies of each result. A change to one document therefore updates every query that includes it with no further work. The cache also tracks per-document metadata such as the server version and whether local changes are pending. Hard parts are partial documents (a query that returns only some fields), documents that leave and re-enter a result set, and keeping identity stable when the server reassigns identifiers.",
    k: ["Normalized storage vs per-query result copies: one update reaches every view and memory is smaller, but assembling a result needs joins on the client and bugs show up as stale references.", "Storing partial documents with field masks vs only full documents: less data on the wire, but every read must check whether the fields it needs are present."],
    p: ["A deleted document stays referenced in a cached list and renders as a blank row.", "Two queries return different field subsets of the same document and overwrite each other's fields with undefined."],
    v: "Open two screens showing the same document through different queries, edit it from another device, and confirm both screens update in the same frame while the cache holds exactly one copy of the document.",
    dep: ["document-model", "sync-cursors"]
  },
  "cache-invalidation": {
    s: "The rules for deciding when a cached document or query result is stale, kept, or removed, including memory limits and what to do when a subscription ends.",
    d: "Live subscriptions keep their results fresh, so invalidation matters most for data nobody is currently subscribed to. The client marks entries stale on a timer or on a server hint, evicts least recently used entries under a memory cap, and refuses to evict anything with pending local writes. When a query stops being observed, its entries linger briefly in case the user returns. The difficulty is correctness without server help: the client cannot know about changes it was not subscribed to when they happened.",
    k: ["Time-based staleness vs server-driven invalidation: timers need no server cooperation, but they either serve stale data or refetch more than needed.", "Keeping unobserved results for a grace period vs dropping at once: navigating back is instant, at the cost of memory and a window in which old data can be shown."],
    p: ["Evicting a document that has an unsent edit loses the user's work.", "A long grace period shows data that changed while no subscription was open, with no marker that it is old."],
    v: "Fill the cache past its limit and confirm the least recently used unobserved documents leave while documents with queued writes remain. Navigate away and back within the grace period and confirm no network request is sent.",
    dep: ["normalized-cache", "mutation-queue"]
  },
  "reactive-bindings": {
    s: "Adapters that connect subscription results to the user interface framework so that a changed document re-renders only the parts of the screen that show it.",
    d: "A binding subscribes when a component appears, delivers the current value, and schedules a re-render when the cache reports a change to something that component read. It tracks which fields were read so unrelated changes are ignored, and it releases the subscription when the component disappears. The hard parts are timing: results must not tear (half old, half new across components in one frame), loading and error states need a consistent shape, and updates arriving faster than the screen refreshes must be merged rather than each causing a render.",
    k: ["Field-level read tracking vs whole-document change events: fewer re-renders for large documents, but tracking adds bookkeeping and surprising misses when code reads fields dynamically.", "Rendering cached data immediately while revalidating vs waiting for confirmed data: screens feel fast, but users briefly see values that may be replaced."],
    p: ["Two components read the same data in one frame and show different versions because they were notified separately.", "A burst of server updates triggers a render per message and drops frames on slow devices."],
    v: "Change one field of a large document from another client at 30 updates per second and confirm only the component showing that field re-renders, at no more than the display refresh rate.",
    dep: ["client-sdk-api", "normalized-cache"]
  },
  "local-persistence": {
    s: "A durable on-device database that holds cached documents and queued writes across app restarts, so the app opens with data and does not lose offline edits.",
    d: "The client writes cache contents and the mutation queue to local storage such as an embedded database, with a schema versioned independently of the server. On startup it loads the stored state, then reconnects and catches up. Storage quotas, eviction by the operating system, and multiple tabs or processes sharing one store make this hard. Writes must be atomic with respect to the queue, and the format must survive app upgrades. Sensitive data needs encryption and removal at sign-out.",
    k: ["Persisting the full cache vs only pending writes: a full cache gives instant offline reads, but increases storage use, privacy exposure and migration work.", "One shared store for all tabs vs a store per tab: sharing prevents conflicting queues, but needs locking and cross-tab messaging."],
    p: ["The operating system clears storage under pressure and silently discards unsent offline edits.", "Signing out leaves the previous user's documents on disk where the next user's session can read them."],
    v: "Make five offline edits, force-quit the app, relaunch with the network off, and confirm all five edits are still shown and still queued. Sign out and confirm no documents remain in the store.",
    dep: ["mutation-queue", "client-schema-migration"]
  },
  "request-batching": {
    s: "Combines many small client requests into fewer messages and merges identical ones, reducing round trips and server load from screens that ask for the same data repeatedly.",
    d: "Calls made within a short window are grouped into a single message with per-request results. Identical subscriptions or reads issued by different components share one server-side subscription, and the SDK counts references to know when the last observer leaves. Writes are batched too but must keep their order. The challenge is balancing latency and efficiency: waiting to fill a batch delays everything, and one failing request inside a batch must not fail the others or break ordering guarantees for writes.",
    k: ["Short fixed batching window vs immediate send: a few milliseconds of delay collapses bursts and saves connections, but adds that delay to every interaction.", "Reference-counted shared subscriptions vs one per observer: far fewer server queries, but unsubscribing needs exact counting or leaks live queries."],
    p: ["A batch containing a slow query delays the results of fast queries sent in the same batch.", "A reference count is off by one after an error path, so a query stays open forever or closes under a live screen."],
    v: "Mount twenty components that each subscribe to the same query and confirm the server sees one subscription and the client one network message. Unmount all and confirm the server subscription closes.",
    dep: ["client-sdk-api", "message-framing"]
  },
  "client-schema-migration": {
    s: "Upgrades the stored local data and queued writes when a new app version changes the shape of documents, without discarding unsent offline work.",
    d: "Local storage carries a version number. On startup the SDK runs ordered migration steps over cached documents and pending mutations, or drops the cache and refetches when the data can be rebuilt. Queued writes are the hard part: they were created against an old shape, may be replayed against a newer server, and cannot be recomputed. Old and new app versions also run at once on different devices, so the server must accept writes in both shapes for a transition period.",
    k: ["Migrating local data in place vs clearing and refetching: clearing is simple and safe for caches, but loses queued offline writes and forces a full download.", "Server accepts old and new write shapes vs forces upgrade: no one is cut off, but the server carries compatibility code for as long as old apps exist."],
    p: ["A migration that fails halfway leaves the store unreadable by both old and new versions.", "A queued write in the old shape is rejected by the new schema and the user's offline edit is dropped without notice."],
    v: "Create queued writes in the old app version, upgrade the app, and confirm the writes are migrated, sent, and accepted by the server. Downgrade a copy of the data and confirm it either opens or reports a clear error.",
    dep: ["local-persistence", "schema-validation", "protocol-versioning"]
  },
  "optimistic-updates": {
    s: "Applies a user's write to local state immediately, before the server confirms it, so the interface responds at once and corrects itself only if the write fails.",
    d: "The client computes the effect of the write locally, using the same logic as the server where possible, shows it, and sends the write. Until it is acknowledged the document is marked pending. When the server replies, the pending state is replaced by the confirmed state, which may differ because other writers got there first or because the server added fields such as timestamps. The hard part is that the local prediction must be layered on top of server truth that keeps changing underneath it.",
    k: ["Run the same mutation code on client and server vs describe changes as plain patches: shared code predicts server behavior exactly, but must stay deterministic across both environments.", "Optimistic apply for every write vs only for safe ones: more responsiveness everywhere, but irreversible actions such as payments need a confirmed state."],
    p: ["The server adds a computed field the prediction lacked, and the interface visibly flickers when the confirmed value replaces the guess.", "A rejected write leaves dependent optimistic changes on screen that no longer make sense."],
    v: "Make the network slow to two seconds, edit a field, and confirm the new value shows within one frame. Then make the server reject the write and confirm the old value returns with an error shown.",
    dep: ["normalized-cache", "mutation-queue", "rollback-and-rebase"]
  },
  "mutation-queue": {
    s: "A durable, ordered list of writes made on the client that have not yet been confirmed, retried until the server accepts or definitively rejects each one.",
    d: "Each write gets a client-generated identifier and is appended to the queue, stored locally, and sent when connected. The server returns an acknowledgement or an error; only then is the entry removed. Order is preserved per document or per queue so that dependent writes apply correctly, and the identifier lets the server ignore a retry it has already processed. It is hard because failures are ambiguous: a lost acknowledgement looks the same as a lost request, so retries must be safe.",
    k: ["Strict global order vs per-document order: global order is easiest to reason about, but one stuck write blocks every later write, while per-document order loses cross-document guarantees.", "Retry forever vs give up after limits: retries never lose work, but a permanently invalid write blocks the queue until someone removes it."],
    p: ["A poison write that the server always rejects blocks every write behind it and the app appears to stop saving.", "Retry after a lost acknowledgement applies a non-idempotent write twice, such as incrementing a counter."],
    v: "Queue ten writes offline, drop the connection halfway through sending them, reconnect, and confirm the server holds each write exactly once, in the original order, and the queue ends empty.",
    dep: ["local-persistence", "idempotency-keys"]
  },
  "rollback-and-rebase": {
    s: "When server truth arrives, discards the client's speculative changes and replays the still-pending writes on top of it, so the display always equals server state plus pending intent.",
    d: "The client keeps two layers: confirmed state from the server and a stack of pending writes. When a server update arrives, the pending layer is removed, the confirmed state advances, and the pending writes are re-run on the new base. If a pending write now fails or has no effect, it is dropped and the user is told. Re-running needs deterministic mutation code and enough retained data. It costs time when the queue is long, and screens can flicker if intermediate states leak.",
    k: ["Replay pending writes on each server update vs patch the optimistic state in place: replay is simple and always consistent, but costs CPU proportional to queue length.", "Surfacing a dropped write as an error vs silently skipping it: the user learns their edit was lost, at the cost of interrupting them."],
    p: ["Mutation code that reads the clock or a random value gives different results on replay and the display jumps.", "A long offline queue makes every incoming update expensive, freezing the interface after reconnect."],
    v: "Queue two offline writes to one field, have another client change the same field and a neighbor, reconnect, and confirm the interface never shows a state with the other client's change missing and ends equal to the server's.",
    dep: ["optimistic-updates", "mutation-handlers"]
  },
  "connectivity-detection": {
    s: "Decides whether the client is truly online, combining operating system hints with the state of the live connection, since a link can look up while nothing gets through.",
    d: "Operating system signals report an interface going down or up but not whether the server is reachable, and captive portals and half-open sockets pass those checks. The client therefore treats the connection's own heartbeats and message timeouts as the real signal, and probes with a small request when the system says it is online. The status is exposed to the application so it can show an offline indicator. The difficulty is flapping: weak networks drop and return constantly, and each transition triggers expensive reconnects.",
    k: ["Trust operating system events vs probe the server: events are instant and free, but report false positives behind portals; probes are accurate but add traffic and delay.", "Treat brief outages as offline vs hold state through short gaps: holding avoids interface churn, but delays showing the user the true state."],
    p: ["A captive portal answers requests with a login page and the app believes it is online while every write fails.", "Rapid up and down transitions trigger a reconnect each time and drain the battery."],
    v: "Join a network whose gateway drops all traffic while the interface stays up and confirm the app shows offline within the heartbeat timeout. Restore traffic and confirm it returns to online and resumes.",
    dep: ["heartbeats-and-liveness", "reconnect-backoff"]
  },
  "reconnect-backoff": {
    s: "Spaces out a client's reconnection attempts with growing, randomized delays so that thousands of clients do not all return at the same instant after an outage.",
    d: "After a drop the client waits a short time, tries again, and doubles the delay up to a cap on each failure, adding random jitter so clients spread out. A successful connection that stays up for some time resets the delay. When the server is recovering from an outage, the first seconds after it returns decide whether it stays up, because every client wants a full snapshot at once. The server can add its own hints, such as a retry-after value, and admission control.",
    k: ["Exponential backoff with full jitter vs fixed interval: jitter flattens the reconnect surge after an outage, but some clients wait much longer than necessary.", "Instant first retry vs initial delay: an instant retry hides blips from users, but a deploy that restarts every server causes a synchronized stampede."],
    p: ["Backoff without jitter makes clients reconnect in synchronized waves that repeatedly knock over a recovering server.", "A cap that is too high leaves a user offline for minutes after the network has already returned."],
    v: "Disconnect ten thousand simulated clients at once, restore the server, and confirm reconnection arrivals spread over the backoff window with peak rate under the server's admission limit.",
    dep: ["load-shedding"]
  },
  "resume-tokens": {
    s: "Opaque tokens that record how far a client had read, letting it reconnect and receive only what it missed instead of downloading its subscriptions again from scratch.",
    d: "The server includes a token with each batch of updates, encoding a position in the change feed per subscription. On reconnect the client presents its last token and the server replays changes after that point. If the token is too old because the feed was trimmed, or the subscription's results are no longer reconstructible, the server answers with a full resync. Hard parts are token validity after server restarts and migrations, and replays that must be filtered through current authorization rules.",
    k: ["Resume from a feed position vs always send a fresh snapshot: resume saves bandwidth on long result sets, but requires the server to retain history and validate the token.", "Opaque tokens vs documented positions: opaque tokens let the server change internals freely, but clients cannot reason about or debug them."],
    p: ["A token outlives the retained feed and the server silently sends a gap, so the client's view is missing changes.", "Replay after reconnect sends documents the user lost access to while offline."],
    v: "Disconnect a client, make 100 changes, reconnect and confirm exactly those 100 changes arrive and no full result is resent. Then wait past the retention window and confirm the client receives a snapshot instead.",
    dep: ["sync-cursors", "feed-retention", "initial-snapshot"]
  },
  "transport-negotiation": {
    s: "Picks the best way to hold a live link per client, preferring a persistent bidirectional socket and falling back to slower streaming or polling where networks block it.",
    d: "A client opens with the preferred transport, a full-duplex socket upgraded from an ordinary HTTP request, and falls back to server-sent streams plus separate requests, or to long polling, when proxies or firewalls break upgrades. The server speaks the same logical protocol over all of them. Negotiation must be quick, since the user waits on it, and must remember what worked per network. The difficulty is behavior differences: ordering, framing and idle timeouts all vary by transport and by intermediary.",
    k: ["Socket first with fallbacks vs one transport only: fallbacks reach clients behind restrictive proxies, but multiply the code paths that must be tested and kept equivalent.", "Racing transports in parallel vs trying them in sequence: racing connects faster on bad networks, at the cost of extra connections the server must handle."],
    p: ["A proxy accepts the upgrade but buffers frames, so messages arrive in bursts and the app looks laggy rather than failed.", "Fallback transports lack features such as ordered delivery and silently weaken guarantees."],
    v: "Run clients behind a proxy that blocks socket upgrades and confirm each connects over the fallback within a few seconds and receives live updates with correct ordering.",
    dep: ["websocket-gateway", "message-framing"]
  },
  "websocket-gateway": {
    s: "The server tier that terminates long-lived client connections, authenticates them, and relays messages between each socket and the internal services that hold subscriptions and data.",
    d: "Gateways are mostly idle I/O: one process can hold hundreds of thousands of connections using event-driven networking and small per-connection buffers. Each connection has a session record, an authentication state and outbound queues. The gateway forwards client requests inward and delivers outgoing changes back to the right socket. Keeping it stateless about data, and thin about logic, makes it cheap to scale and replace. Memory per connection, TLS cost and file descriptor limits set its capacity.",
    k: ["Thin gateway forwarding to backend services vs gateway that evaluates queries: thin gateways scale and restart freely, but add a hop; fat ones cut latency but make restarts costly.", "One process per many connections vs per-connection workers: event loops hold far more sockets, but one slow handler stalls everyone on that loop."],
    p: ["A single blocking call in the event loop delays heartbeats for every connection on the process and causes mass disconnects.", "Per-connection buffers grow without bound for slow clients until the process runs out of memory."],
    v: "Open 100,000 idle connections to one gateway and confirm memory per connection stays within budget, heartbeats are served on time, and a single broadcast reaches all of them within the target delay.",
    dep: ["connection-registry", "authentication-tokens", "backpressure"]
  },
  "heartbeats-and-liveness": {
    s: "Periodic small messages in both directions that prove a connection is alive, keep intermediaries from closing idle links, and detect dead peers quickly.",
    d: "Either side sends a ping at an interval and expects a reply before a timeout, otherwise the connection is declared dead and its state cleaned up. Idle timeouts in load balancers and mobile networks are typically between one and several minutes, so pings must be shorter than the shortest one on the path. The server also uses missed heartbeats to expire presence. The hard part is picking intervals: short ones cost battery and server CPU at scale, long ones leave dead connections believed alive.",
    k: ["Application-level heartbeats vs relying on transport keepalives: application messages test the whole path including the server's event loop, but cost a little traffic that transport probes avoid.", "Short interval vs long interval: quick failure detection and fresher presence, against battery drain and larger heartbeat load."],
    p: ["An interval longer than a load balancer's idle timeout causes steady unexplained disconnects.", "Heartbeats are processed on the same queue as data, so a data backlog delays them and healthy clients are dropped."],
    v: "Block packets without closing the connection and confirm the server marks it dead within the timeout and removes its presence. Idle a connection for ten minutes through the production load balancer and confirm it stays open.",
    dep: ["connection-registry"]
  },
  "connection-registry": {
    s: "Tracks which connection belongs to which user, device and gateway, so that a change for a user can be routed to the right process holding their socket.",
    d: "Each gateway keeps a local table of its connections and publishes membership to a shared index, keyed by user, device or subscription topic, so other components can find where to send a message. Entries carry a lease so that a crashed gateway's connections disappear from the index. The challenge is consistency under churn: connections open and close constantly, an entry may briefly point at a gateway that no longer holds the socket, and lookups must tolerate that without losing messages.",
    k: ["Shared registry lookup vs broadcast to all gateways: a registry sends each message only where needed, but adds a store to keep consistent; broadcast is simple and wasteful.", "Leases with expiry vs explicit removal on close: leases clean up after crashes, but entries linger for a window after a gateway dies."],
    p: ["A stale entry points at a dead gateway and messages for that user are sent into nothing until the lease expires.", "A reconnect lands on a new gateway before the old entry is removed and the old removal then deletes the new entry."],
    v: "Kill a gateway process holding 1,000 connections and confirm its registry entries expire within the lease time, then that the reconnecting clients appear under new gateways and receive updates.",
    dep: ["pub-sub-bus"]
  },
  "session-affinity": {
    s: "Keeps a client's connection and its server-side state on the same node, and routes reconnects back there when possible, so session data is not rebuilt each time.",
    d: "Load balancers can pin a client by connection identifier or a token hashed to a node. Pinning keeps subscription state, auth context and in-memory caches warm and lets resumed sessions skip a snapshot. It also concentrates load when some tenants are heavy, and it complicates deploys, since draining a node moves all its sessions at once. Many designs keep durable session state in a shared store instead, making any node able to resume any session at slightly higher cost.",
    k: ["Sticky routing vs fully stateless sessions: sticky nodes resume faster and need less storage, but uneven load and node loss hurt more; stateless nodes recover anywhere at higher resume cost.", "Hash by user vs hash by connection: hashing by user collocates a user's devices, but a single large tenant can overload one node."],
    p: ["After a node failure, all its sessions reconnect elsewhere at once and each requests a full snapshot.", "Sticky routing sends all of one large customer's traffic to a single node that cannot carry it."],
    v: "Reconnect a client twenty times and confirm it reaches the same node when that node is healthy and the resume avoids a snapshot. Remove the node and confirm the client resumes elsewhere without data loss.",
    dep: ["connection-registry", "resume-tokens"]
  },
  "backpressure": {
    s: "Detects clients that cannot keep up with their update stream and slows, coalesces, or disconnects them so one slow reader cannot exhaust memory or delay others.",
    d: "Each connection has a bounded outbound queue. When it fills, the server can drop intermediate states and send only the latest, pause upstream reads, or close the connection and let the client resync. The right choice depends on the stream: a document's current value can skip states, while an ordered event log cannot. Hard parts are fairness, since a few large subscriptions can crowd out small ones, and measuring slowness, since a client on a bad network is indistinguishable from a stalled one.",
    k: ["Coalesce to latest state vs close and resync: coalescing keeps the client connected and cheap for state data, but cannot be used for ordered events; closing is simple but forces a full download.", "Per-connection queue limit vs global memory limit: per-connection limits isolate clients, but total memory still needs its own cap under mass slowness."],
    p: ["An unbounded queue for one stalled mobile client grows until the gateway process is killed and takes thousands of healthy connections with it.", "Closing slow clients that merely paused in the background creates a reconnect storm at app resume."],
    v: "Attach a client that reads at one tenth the update rate and confirm its queue stays under the limit, other clients' latency does not change, and the slow client ends up showing the latest state or reconnects cleanly.",
    dep: ["websocket-gateway", "coalescing"]
  },
  "graceful-draining": {
    s: "Moves connections off a node before it stops, for deploys and scale-down, spreading reconnects over time so the rest of the fleet absorbs them without a surge.",
    d: "A node told to drain stops accepting new connections, then asks existing clients to reconnect elsewhere, gradually and with random delays, sending a close message that carries a hint to resume instead of resyncing. Draining must finish within a deadline, and the node is stopped even if some clients remain. Rolling deploys that restart each node in turn can move every client several times in one release, so batch size, delay and resume support determine how visible a deploy is to users.",
    k: ["Gradual client-by-client drain vs closing all at once: gradual drains spread reconnect load but make deploys take longer; closing at once is faster and causes a spike.", "Drain with resume hints vs plain disconnect: hints let clients skip snapshots, but the new node must be able to serve a resume from another node's token."],
    p: ["A rolling deploy restarts nodes faster than clients can resettle, so each client is moved repeatedly and the service looks unstable all afternoon.", "A drain deadline shorter than the reconnect spread cuts off clients that were still waiting their turn."],
    v: "Deploy a new version across a fleet carrying 100,000 test connections and confirm reconnect rate never exceeds the limit, no client loses queued writes, and fewer than a small fraction resort to a full snapshot.",
    dep: ["connection-registry", "resume-tokens", "reconnect-backoff"]
  },
});
