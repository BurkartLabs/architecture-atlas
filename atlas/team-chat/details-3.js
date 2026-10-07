// Details for the team chat plate, part 3: message core and partitioning.
ATLAS.details("team-chat", {
  "message-store": {
    s: "The durable, ordered record of every message, with its content, author, channel, thread links and revisions, from which all other views are derived.",
    d: "Messages are stored partitioned by workspace and channel, clustered by position so reading the latest page of a channel is one sequential range scan. A row holds the structured content, author, timestamps, parent reference, attachments and flags. Writes are replicated synchronously within a region before acknowledging. Reads dominate by a wide margin, and most are for recent messages, so recent data sits in fast storage and caches. The store must support edits, tombstones and purges while keeping history consistent and indexes updated.",
    k: ["Partition key of workspace plus channel vs by user: channel partitioning makes history reads cheap, but a hot channel concentrates writes on one partition.", "Relational store with sharding vs wide-column store: relational gives transactions and flexible queries, but resharding is painful; wide-column scales simply with fewer query options."],
    p: ["Reading history across a partition boundary or deleted range loops through tombstones and slows to a crawl.", "Storing content and counters in one row makes every reaction a rewrite of a large record."],
    v: "Write one million messages across ten thousand channels, then read the latest fifty from random channels: latency stays within target, every message is returned in order, and a node failure loses none.",
    dep: ["tenant-sharding", "channel-ordering", "message-ids"]
  },
  "message-ids": {
    s: "The identifiers and timestamps assigned to messages, which must be unique, sortable and usable as cursors and as stable references in links.",
    d: "Many designs use a time-ordered identifier combining a timestamp, a shard or channel component and a counter, so identifiers sort in creation order within a channel and can be used directly as pagination cursors. Timestamps come from the server, never from clients, and the identifier doubles as the message's public address in permalinks. Uniqueness is scoped carefully: per channel is enough for ordering, per workspace for references. Clock skew between servers must not produce identifiers that sort backwards.",
    k: ["Time-ordered IDs vs random IDs: ordered IDs give cheap range queries and cursors, but leak creation time and approximate volume.", "Server-assigned timestamps vs clock-free counters: counters never go backwards but need coordination; timestamps need clock discipline and tie-breaking."],
    p: ["A server with a skewed clock mints identifiers that sort before older messages, so new messages appear in the past.", "Using millisecond timestamps alone as the ID produces collisions under bursts."],
    v: "Generate identifiers from several servers with deliberately skewed clocks at high rate: all are unique, never decrease within a channel, and sorting by identifier reproduces the committed order.",
    dep: ["channel-ordering"]
  },
  "channel-ordering": {
    s: "The rule that fixes the order of messages within a channel, assigned at write time and identical for every reader, device and replica.",
    d: "Concurrent senders race, so the system picks one writer or coordination point per channel to assign each message a position. Order is by that position, not by client send time or arrival at a given gateway. Different channels order independently. The position is used by read markers, pagination, replay and unread counts. Edits and reactions do not move a message. Ordering is deliberately weaker than global: causality across channels is not promised, which is the trade that lets the system scale.",
    k: ["Single sequencer per channel vs distributed timestamp ordering: a sequencer gives a clean total order, but is a bottleneck and failover point for hot channels.", "Server arrival order vs client send time: arrival order is simple and consistent, but can reorder what two people experienced as sequential."],
    p: ["Two replicas assigning positions during a failover can produce duplicate or inverted positions.", "Sorting by displayed timestamps rather than position makes messages jump when clocks differ."],
    v: "Send from two clients to the same channel at the same instant repeatedly, and read it from every device and replica: all show the identical order every time, including after a primary failover.",
    dep: ["message-ids", "write-queues"]
  },
  "send-path": {
    s: "The sequence of steps from a client's send request to a committed, acknowledged and delivered message, including validation, permission checks, storage and event emission.",
    d: "The request is authenticated, the channel and sender resolved, and permissions and posting rules evaluated, along with rate limits and content policy. The message gets an ID and position, is written to the store, and then an event is published for fanout, indexing, notification and integrations. Slow, non-critical work, such as unfurls, indexing and push, is moved to asynchronous jobs after the commit. The sender gets the acknowledgment once the write is durable. The challenge is the failure cases: committing but failing to publish, or publishing without a commit.",
    k: ["Publish events after commit with an outbox vs publish in the request: an outbox gives reliable at-least-once events without a distributed transaction, but adds a relay and some delay.", "Acknowledge after durable write vs after fanout: durable-only acknowledgment is fast and honest, while waiting for fanout adds latency and couples senders to downstream health."],
    p: ["A crash between the write and the event publish leaves a message stored but never delivered or indexed.", "Running heavy checks inline, such as content scanning, makes send latency unpredictable."],
    v: "Kill the process after commit but before event publish; on recovery the message is delivered, indexed and notified exactly once, and the sender's client shows it sent.",
    dep: ["message-store", "idempotency", "permission-evaluator", "event-fanout"]
  },
  "idempotency": {
    s: "Ensures a message sent twice because of a retry is stored once, by tying each send to a unique key supplied by the client.",
    d: "The client attaches a unique key to each send. The server records the key per sender and channel for a window, and a repeat returns the original result instead of creating another message. The record must be created atomically with the message, otherwise concurrent retries both succeed. Keys expire after a retention window long enough to cover reasonable retry periods and offline queues. The same technique protects webhooks and API clients. It is the thing that makes optimistic client behavior safe.",
    k: ["Client-supplied keys with a dedupe table vs relying on content hash: keys are exact and cheap, while content hashes wrongly merge two intentional identical messages.", "Long key retention vs short: long windows handle offline devices, but grow the dedupe store."],
    p: ["Checking for the key and then inserting in two steps lets simultaneous retries both pass.", "Scoping keys globally instead of per sender lets one user's key block or collide with another's."],
    v: "Send the same keyed request from ten parallel connections; exactly one message exists afterward and all ten requests return the same message ID.",
    dep: ["message-store"]
  },
  "history-pagination": {
    s: "Loading a channel's messages in pages, backwards from the newest or around a point, using stable cursors that are not disturbed by new messages.",
    d: "Clients ask for messages before or after a cursor (a message identifier or position) with a limit. Cursor-based paging is used rather than offsets, which shift as messages arrive. Requests to jump to a permalink or the first unread load a window around the target. Responses include enough thread and reaction data to render without extra calls. Permissions are checked, and history visibility may depend on when the user joined or on channel settings. Caches of the newest pages absorb most traffic.",
    k: ["Cursor-based paging vs offset paging: cursors are stable and fast on deep history, but cannot jump to an arbitrary page number.", "Embedding reactions and thread summaries in each page vs separate calls: embedding cuts round trips, but makes pages heavier and invalidation harder."],
    p: ["Offset paging in a busy channel repeats or skips messages as new ones arrive between requests.", "History requests that ignore join-time restrictions expose messages posted before a guest or new member was added."],
    v: "While messages stream in, page back through a channel of ten thousand messages in pages of fifty: the concatenated pages equal the full ordered history with no duplicates and no gaps.",
    dep: ["message-store", "message-ids", "read-caches"]
  },
  "thread-index": {
    s: "A secondary structure keyed by parent message that lists replies and keeps reply counts, participants and last-reply times for fast thread display and listing.",
    d: "Replies are stored with a parent reference; the index groups them per parent so loading a thread is a single range read. A summary record on the parent holds the count, latest reply and participant sample, updated when replies are added, edited or deleted. A per-user view of followed threads is built from participant and follower sets. Maintaining summaries under concurrent replies requires atomic updates or periodic recomputation to correct drift.",
    k: ["Incremental summary updates vs recompute on read: increments make reads trivial but drift under failure; recompute is exact but expensive for long threads.", "Store replies in the same partition as the parent vs the channel partition: same-partition reads are fast, but a viral thread overloads one partition."],
    p: ["Counts updated by a retried event are incremented twice and show too many replies.", "Followed-thread views built without permission checks list threads from channels the user has left."],
    v: "Add, edit and delete replies concurrently from several clients, then compare the summary to a direct count of the replies; they must agree, and the thread loads in one query.",
    dep: ["message-store", "threads"]
  },
  "reaction-store": {
    s: "Storage for who reacted to which message with which emoji, supporting fast toggling, counts and rendering of the reactor list.",
    d: "Rows keyed by message, emoji and user guarantee a user can react once per emoji and make toggling idempotent. Aggregated counts per emoji are kept on the message summary or in a counter structure, since reading the full row list for every render is too costly. For viral messages, writes are batched and the per-emoji reactor list is truncated. Reactions inherit the message's lifecycle: deleting the message deletes its reactions, and retention applies to them too.",
    k: ["Strict per-user rows with counters vs counters only: rows allow undo and the who-reacted list, but need a counter that matches them.", "Counter updates inline vs batched asynchronously: batching tolerates bursts with brief inaccuracy, while inline updates are exact but contend on one row."],
    p: ["Counters and rows diverge after failures, leaving a count of three with two visible reactors.", "Unbounded reactor lists on a viral message produce enormous responses."],
    v: "Toggle a reaction repeatedly from several devices of one user and from many users at once; the final per-emoji counts equal the number of distinct reacting users and the list matches.",
    dep: ["message-store", "write-queues"]
  },
  "tenant-sharding": {
    s: "Assigns each workspace to a database shard or cluster, so that a tenant's data lives together and load and storage spread across many machines.",
    d: "A directory maps workspace ID to shard. All of a workspace's messages, files metadata and membership live on one shard, which keeps most queries single-shard and transactions local. Shards are balanced by size and traffic, and tenants can be moved by copying, catching up and cutting over. The largest tenants may need to be split by channel range or given dedicated shards. Cross-tenant features such as shared channels and organization-wide search must work across shards without losing the tenant boundary.",
    k: ["Shard by workspace vs by channel or message: workspace sharding keeps queries local and isolation simple, but cannot spread one huge tenant without a second level.", "Static directory assignment vs consistent hashing: a directory permits deliberate moves and special placement, but is a critical lookup that needs caching and care."],
    p: ["A very large tenant outgrows its shard, and the only fix is a risky live migration under load.", "Cross-shard queries written by accident turn a cheap request into a slow scatter-gather."],
    v: "Move a live test workspace between shards under write load and confirm no message is lost or duplicated, clients see only a brief reconnect, and queries afterward hit only the new shard.",
    dep: ["workspace-model", "cells"]
  },
  "cells": {
    s: "Independent, self-contained copies of the full stack, each serving a subset of workspaces, so a failure or a bad deploy affects only one cell.",
    d: "Each cell has its own gateways, databases, queues, caches and workers, and holds a fixed set of tenants. A thin routing layer sends requests to the right cell. Capacity grows by adding cells instead of enlarging shared components, and deploys roll cell by cell so a defect reaches only a fraction of customers. Cells keep failure domains small and limit worst-case load. Costs are duplicated baseline infrastructure, and features that span cells, such as cross-workspace search, need explicit cross-cell paths.",
    k: ["Many small cells vs few large: small cells limit blast radius and deploy risk, but add overhead and make cross-cell features and bin-packing harder.", "Place tenants by region and size vs randomly: deliberate placement improves latency and residency, while random placement balances load better."],
    p: ["A shared dependency outside the cells, such as one identity service, brings every cell down together.", "Uneven tenant sizes leave one cell saturated and the rest idle."],
    v: "Disable one cell during a drill: only its tenants lose service, other cells are unaffected, and traffic returns when it recovers. A bad deploy is caught in the first cell before reaching others.",
    dep: ["tenant-sharding", "edge-balancers"]
  },
  "hot-channels": {
    s: "Detects and isolates channels with extreme write or read rates, such as company-wide announcements or incident rooms, so they cannot starve neighbors on the same shard.",
    d: "Telemetry flags channels whose write rate, subscriber count or event volume exceeds a threshold. Mitigations include moving them to dedicated partitions or workers, increasing batching, sampling presence and typing, applying slow mode, and shedding nonessential events. Without isolation, one busy channel's events dominate gateway bandwidth and its writes hot-spot a partition. The hard part is that heat is unpredictable: an incident or a company event can create it in seconds.",
    k: ["Automatic isolation on thresholds vs manual operator action: automation reacts in seconds when humans cannot, but a wrong trigger can move healthy channels and cause its own disruption.", "Rate-limit the channel vs scale it: limits protect the platform but affect real conversations; scaling preserves behavior and costs capacity."],
    p: ["A mitigation that moves a channel mid-incident adds latency and ordering risk exactly when people depend on it.", "Hotness measured by messages alone misses channels with few writes but huge audiences."],
    v: "Simulate a ten-times traffic spike on one channel; the detector flags it within seconds, neighbors' latency stays within target, and the channel keeps ordering and delivering.",
    dep: ["big-channel-fanout", "tenant-sharding", "observability"]
  },
  "big-channel-fanout": {
    s: "Strategies for channels with tens or hundreds of thousands of members: avoid per-member writes, switch to pull for most users, and fan out only to active connections.",
    d: "In a normal channel, a message can update per-member state such as unread counters. In a huge channel that costs a write per member per message. Instead, unread is computed from the member's marker and the channel position, notifications go only to mentioned or opted-in users, and live events reach only connections currently subscribed. Membership lists are paginated and cached. Announcement channels restrict posting to a few people, which bounds the write side while the read side is enormous.",
    k: ["Fanout on write vs fanout on read: write fanout makes reads trivial but multiplies writes; read-time computation scales to huge audiences, but each load does more work.", "Notify all members vs only mentioned or opted-in: notifying everyone is simple and spammy; restricting needs clear opt-in controls that users must discover."],
    p: ["Per-member counters updated on every message turn each post into a database write storm.", "A broadcast mention in a huge channel notifies everyone and overwhelms the push gateway."],
    v: "Post and mention in a channel of two hundred thousand members; database writes per message stay constant, only subscribed connections receive the live event, and unread badges are still correct on next open.",
    dep: ["unread-state", "event-fanout", "membership"]
  },
  "read-caches": {
    s: "In-memory caches of recent messages, memberships, profiles and permissions that absorb the overwhelming majority of reads, kept coherent through events.",
    d: "Caches hold the newest pages of busy channels, user and channel metadata, and computed permission results. They are populated on miss and invalidated or updated by the same events that drive clients, such as new message, edit and membership change. Stampedes on popular keys are limited by coalescing concurrent misses. Because messages are immutable-ish and ordered, caching the tail is highly effective. The risk is serving stale permission or content data after a change that should take effect at once.",
    k: ["Update caches from events vs expire by time: events keep them fresh and cut database load, but missed events leave stale entries; TTLs bound staleness at the cost of more reads.", "Cache computed permission decisions vs compute each time: caching is fast but makes revocation delayed unless invalidated precisely."],
    p: ["A cache invalidation event lost during failover leaves deleted content readable until the entry expires.", "A cold cache after a restart sends the full read load to the database at once."],
    v: "Delete a message and revoke a membership, then read both through the cache from another node; each must reflect the change within the invalidation target, and a cache flush must not push the database past its limit.",
    dep: ["message-store", "event-fanout"]
  },
  "write-queues": {
    s: "Buffers and serializes writes per channel or partition, smoothing bursts, preserving order and protecting the datastore from overload.",
    d: "Writes for a channel are routed to a single worker or partition, which applies them in order, batching where possible. This gives the sequencing for ordering and absorbs spikes. Queues are bounded, with backpressure to senders as rate limit responses rather than unbounded memory growth. Durable queues survive restarts; in-memory ones are faster and require reliable retries. Poison messages and slow partitions must not block the rest, so partitions are independent and failing items are set aside.",
    k: ["Single writer per channel vs optimistic concurrent writes: a single writer gives total order without conflict handling, but makes the writer a failover point.", "Durable queue vs in-memory buffer: durability prevents loss during crashes but adds latency and cost."],
    p: ["An unbounded queue hides an overloaded datastore until memory runs out and everything fails at once.", "Reassigning a channel to a new writer during failover without fencing creates two writers and misordered messages."],
    v: "Burst ten thousand writes into one channel and kill the writer midway; after failover every write is committed once, in submission order per sender, and senders over capacity see explicit rate-limit responses.",
    dep: ["message-store", "channel-ordering"]
  }
});
