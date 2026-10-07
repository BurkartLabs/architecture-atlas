// Details for the in-memory cache plate, part 2: messaging, operations, data types, encodings.
ATLAS.details("in-memory-cache", {
  "pubsub-channels": {
    s: "Fire-and-forget messaging: clients subscribe to named channels and every message published to a channel is pushed to its current subscribers, with nothing stored.",
    d: "The server keeps a table from channel name to the list of subscribed clients. A publish command looks up the channel and appends the message to each subscriber's output buffer, returning the number of receivers. A connection in subscribe mode may only issue subscription commands, or in newer protocol versions receives messages as out-of-band pushes. Messages are not persisted, acknowledged or replayed: a subscriber that is disconnected or slow simply misses them. Publish cost grows with subscriber count, and in a cluster the message is forwarded to every node.",
    k: ["Fire-and-forget vs durable delivery: no storage keeps publishing fast and memory flat, but offline subscribers lose messages; durable needs a stream with its own bookkeeping.", "Push to subscribers vs polling: push gives immediate delivery, but a slow subscriber's buffer then becomes the server's problem."],
    p: ["Using pub/sub for work that must not be lost drops jobs whenever a worker restarts or lags.", "A channel with thousands of subscribers makes each publish cost thousands of buffer appends on the main thread."],
    v: "Subscribe two clients, publish one message, and confirm both receive it and the publish returns two; then disconnect one, publish again, and confirm it returns one with the missed message not replayed.",
    dep: ["output-buffers", "event-loop", "keyspace-table"]
  },
  "pattern-subscriptions": {
    s: "Subscriptions to glob-style patterns, so a client receives messages from every channel whose name matches, including channels created later.",
    d: "Pattern subscriptions are stored in a separate list. On each publish, after delivering to exact subscribers of the channel, the server tests the channel name against every active pattern and delivers to the matching clients. A client matching both an exact channel and a pattern receives the message twice. Cost per publish grows with the number of distinct patterns, because each is evaluated. Patterns suit routing by prefix or hierarchy without knowing every channel ahead of time, but they make the cost of a publish depend on unrelated clients' subscriptions.",
    k: ["Pattern matching on publish vs registered channel lists: patterns cover future channels automatically, but make each publish scan all patterns.", "Delivering duplicates vs deduplicating: delivering per match is cheap and simple, but receivers must tolerate a message arriving twice."],
    p: ["Many clients each subscribing to a broad pattern make every publish scan a long pattern list, raising latency for all publishers.", "Assuming a message arrives once breaks logic when a client holds both a channel and a matching pattern subscription."],
    v: "Subscribe to a prefix pattern, publish to three matching channels and one non-matching one, and confirm exactly three messages arrive, each labeled with the pattern and the actual channel.",
    dep: ["pubsub-channels"]
  },
  "sharded-pubsub": {
    s: "Pub/sub scoped to a hash slot, so messages go only to the nodes that own that slot and its replicas instead of being broadcast across the whole cluster.",
    d: "Standard cluster pub/sub forwards every message to every node over the cluster bus, so cost grows with cluster size. In the sharded form a channel name hashes to a slot like a key, and a message is published and delivered only within the shard that owns the slot. Clients subscribe on that shard's nodes, and are disconnected or redirected if the slot moves away. Scaling improves because publishers and subscribers spread across shards, but patterns across shards are not supported, and slot migration must handle live subscriptions.",
    k: ["Sharded vs global broadcast: sharded scales messaging with the cluster, but loses the ability to subscribe to arbitrary patterns across all channels.", "Subscribers on replicas vs primaries only: replicas offload delivery, but add replication delay to message arrival."],
    p: ["Slot migration unsubscribes clients, which must resubscribe on the new owner, and messages published in between are lost.", "Channels named without thought for slot distribution concentrate all traffic on one shard."],
    v: "Subscribe on the owner of a slot, publish from a client connected elsewhere, and confirm delivery via a redirect, with the cluster bus showing no message sent to unrelated shards.",
    dep: ["pubsub-channels", "hash-slots", "slot-redirects"]
  },
  "keyspace-notifications": {
    s: "Events published on special channels whenever keys are set, deleted, expired or evicted, so other clients can react to data changes without polling.",
    d: "When enabled, the server publishes an event for each affected key to two channel families: one named by key carrying the operation, and one named by operation carrying the key. A configuration mask selects which classes of events are emitted, such as generic, string, list, expired and evicted, since the feature costs CPU on every write. Delivery uses ordinary pub/sub semantics, so there is no persistence and no guarantee. Expiration events fire when the server actually deletes the key, which may be well after the nominal time.",
    k: ["Emitting events vs staying silent: events let applications react in real time, but add work to every write and are off by default for that reason.", "Per-key channels vs per-event channels: per-key suits watching one entry, while per-event suits tracking a class of changes; emitting both costs twice."],
    p: ["Treating the expired event as a timer is wrong: it fires only when lazy or active expiry removes the key, which can lag its deadline.", "Missed events during a disconnect cannot be recovered, so a cache mirror built on them drifts silently."],
    v: "Enable the mask, subscribe to the keyspace channel for one key, set it, expire it, and confirm set and expired events arrive, noting the delay between the nominal deadline and the event.",
    dep: ["pubsub-channels", "active-expiry", "lazy-expiry"]
  },
  "invalidation-tracking": {
    s: "Server-side bookkeeping of which client read which keys, used to push invalidation messages to exactly those clients when a key changes.",
    d: "In default mode the server stores, per key, the set of client identifiers that read it since tracking began, in a table kept separate from the keyspace. When any client modifies a tracked key, the server sends each recorded client an invalidation and clears the entry; the client must read again to be tracked again. In broadcast mode, clients register key prefixes and receive invalidations for all matching keys with no per-key memory. The table is bounded, and when full the server evicts old entries by sending invalidations early. It is memory-hungry for large read sets.",
    k: ["Tracking exact reads vs broadcasting by prefix: exact tracking sends minimal messages but uses server memory per key and client; broadcast uses almost none but over-invalidates.", "Invalidate once and forget vs keep tracking: forgetting after the first message bounds memory, but makes clients reread to re-register interest."],
    p: ["An unbounded tracking table for a large number of clients and keys consumes memory comparable to the data itself.", "A client that does not process pushes promptly lets invalidations pile up in its output buffer until it is disconnected."],
    v: "Enable tracking on a client, read a key, modify it from another client, and confirm exactly one invalidation arrives naming that key, and a second modification produces none until the key is read again.",
    dep: ["keyspace-table", "output-buffers", "protocol-negotiation"]
  },
  "acl-engine": {
    s: "A per-user rule set that limits which commands, command categories, subcommands, key patterns and channels each connection may use, checked before every command runs.",
    d: "Each user has a password hash list, an enabled flag and selectors that combine allowed or denied commands and categories with key and channel patterns, often separate for read and write access. After authentication a connection carries its user, and dispatch checks the command and its keys, taken from key specifications, before executing. Rules are loaded from configuration or a file and can change at runtime, disconnecting affected clients. Denied attempts are recorded in a log. It is hard to be complete: scripts, transactions and modules also issue commands and must be checked as the calling user.",
    k: ["Command categories vs explicit command lists: categories are short and cover future commands sensibly, but may grant more than intended when new commands join a category.", "Deny by default vs allow by default: default deny is safer, but needs every needed command spelled out and breaks on upgrades that add commands."],
    p: ["A default user with full access and no password left enabled makes every other rule irrelevant.", "Key patterns that miss commands whose key arguments are not obvious, such as scripts, can let a user touch keys outside their allowance."],
    v: "Create a user limited to read commands on one key prefix, authenticate, and confirm reads on that prefix succeed while writes and reads on other keys fail with a permission error recorded in the ACL log.",
    dep: ["command-flags-and-key-specs", "authentication", "config-system"]
  },
  "authentication": {
    s: "Verifies a connecting client's identity with a username and password, or a client certificate, before any other command is accepted.",
    d: "A client presents credentials with an authenticate command or in the protocol handshake. The server compares a salted hash of the password with the user's stored hashes in constant time, and on success attaches the user to the connection. Failures are counted and logged, and unauthenticated connections may run only a few commands. With TLS, a client certificate can establish the user instead. Sessions are not re-verified per command, so changing a password or disabling a user must also disconnect existing sessions. Credentials travel in clear unless the transport is encrypted.",
    k: ["Password authentication vs certificate identity: passwords are easy to deploy, but must be distributed and rotated; certificates avoid shared secrets, but need a managed authority.", "Fast hashing vs slow hashing: fast hashes keep authentication cheap on a latency-critical server, but make stolen hashes easy to crack."],
    p: ["Short passwords with a fast hash are brute-forced quickly by anyone who can attempt many authentications over the network.", "Rotating a password without disconnecting clients leaves old sessions authenticated indefinitely."],
    v: "Attempt a command without authenticating and confirm it is refused; authenticate with a wrong password and confirm failure and a log entry; authenticate correctly and confirm commands run as the expected user.",
    dep: ["tls-transport", "config-system"]
  },
  "network-exposure-defaults": {
    s: "Safe defaults for what the server listens on and who may connect, such as loopback binding and protected mode, so an unconfigured server is not exposed to the internet.",
    d: "By default the server binds to loopback only, and a protected mode refuses connections from other addresses while no password or access rule is configured. Operators opening the listener to a network are expected to set authentication, rules, firewall limits and encryption first. Dangerous administrative commands can be renamed, disabled or restricted by category. These defaults exist because the protocol was designed for trusted networks, and exposed unauthenticated caches have been taken over and used to write files or run code through configuration commands.",
    k: ["Closed by default vs open by default: closed defaults prevent mass compromise, but frustrate first-time users who must change settings before remote access works.", "Disabling dangerous commands vs restricting them by user: disabling is blunt and safe, but removes tools administrators legitimately need."],
    p: ["Binding to all interfaces on a cloud host with no password hands the dataset and server file access to anyone who scans for it.", "Disabling protected mode to silence a connection error removes the last safeguard on an unauthenticated server."],
    v: "Start with default settings, connect from another host and confirm refusal; then bind a network address with no password and confirm protected mode still refuses non-loopback clients.",
    dep: ["config-system", "acl-engine"]
  },
  "slow-log": {
    s: "A bounded in-memory log of commands whose execution exceeded a time threshold, recording the command, duration and client, to find what stalls the server.",
    d: "After each command, the server compares its execution time, excluding network and queueing, with a configured threshold in microseconds. Slower commands are appended to a ring of fixed length with an id, timestamp, duration, truncated arguments and client details. Because only one command runs at a time, a slow entry points directly at the command that delayed everyone else. The log is read and reset with commands. Large arguments are truncated and sensitive commands redacted, to bound memory and avoid leaking secrets.",
    k: ["Low threshold vs high threshold: a low threshold finds smaller problems, but fills the ring with noise and costs a little more per command; a high one hides modest regressions.", "Execution time only vs end-to-end time: excluding network isolates server cost, but misses delays from queueing behind other commands."],
    p: ["A slow log that excludes time spent waiting in the queue hides that a harmless command was delayed by a slow one.", "Never reading the log lets the ring overwrite the evidence of a one-off stall before anyone looks."],
    v: "Run a command known to take longer than the threshold and confirm it appears with its arguments and a plausible duration, while quick commands do not.",
    dep: ["event-loop", "cached-clock"]
  },
  "latency-monitor": {
    s: "Event-based latency tracking that records spikes from sources such as fork, fsync, expiry cycles and slow commands, with history graphs and diagnostic advice.",
    d: "Instrumented code paths time themselves and, if above a threshold, record the event name, time and duration in a short history per event class. Events include forking for a snapshot, writing the log, active expiry, eviction and slow commands. Operators query the latest spikes, history, and a text graph, or ask for a report with likely causes. Separately, a per-command histogram of latencies is kept. It answers the question of where pauses come from, which a slow log of commands alone cannot, since many pauses are system work.",
    k: ["Event classes vs one global timer: classes tell you which subsystem paused, but need instrumentation at each site and a decision about each threshold.", "Recording spikes only vs full histograms: spikes cost almost nothing and show outliers, but histograms show the distribution and percentiles at higher memory and CPU."],
    p: ["Latency monitoring left disabled gives no data when the incident happens, and it cannot be enabled retroactively.", "Fork pauses on large datasets under virtualization are recorded as spikes that look like server faults but originate in the host."],
    v: "Trigger a snapshot on a large dataset and confirm a fork event appears in the history with a duration matching the server's reported fork time.",
    dep: ["snapshot-fork", "fsync-policy", "active-expiry", "cached-clock"]
  },
  "info-statistics": {
    s: "A text report of live counters and state: memory, clients, persistence, replication, command counts, keyspace hits and misses, and eviction and expiry totals.",
    d: "The server maintains counters in plain memory as it works and renders them on request in sections of key-value lines, easy for monitoring tools to scrape. Typical data includes used memory, fragmentation ratio, connected clients, operations per second, hit and miss counts, evicted and expired keys, replication offset and lag, and last save status. Per-command call counts and total time are also kept. Most counters are cumulative, so tools compute rates. The report is cheap, but some sections require walking structures, so very frequent scraping adds load.",
    k: ["Cumulative counters vs rates in the server: cumulative counters are cheap and let any monitor choose its window, but must be differenced and handle resets.", "One combined report vs separate queries: one report is simple to scrape, but costs more than a query for just one metric."],
    p: ["Reading the hit ratio from lifetime counters hides a recent collapse behind months of good history.", "Scraping the full report every second on a busy server steals measurable time from the single thread."],
    v: "Run one hundred reads of existing keys and fifty of missing keys, and confirm hit and miss counters rise by exactly those amounts between two reports.",
    dep: ["server-cron", "memory-accounting"]
  },
  "memory-introspection": {
    s: "Commands that explain memory use: bytes per key, breakdown by overhead category, allocator statistics and a doctor that suggests causes of high or fragmented memory.",
    d: "A per-key usage command samples elements to estimate the memory a value takes including headers and allocator overhead. A stats command splits total memory into dataset, replication backlog, client buffers, keyspace overhead and others. Allocator statistics show arenas, resident and active bytes, from which fragmentation is derived. A doctor command applies simple rules to report issues such as high fragmentation or many small keys. The values are estimates with sampling error, and scanning for biggest keys must be done with an incremental scan to avoid blocking.",
    k: ["Sampling elements vs exact measurement: sampling bounds the cost on huge collections, but gives approximate numbers that can mislead for skewed values.", "Built-in analysis vs offline analysis of a snapshot: built-in is immediate but costs main-thread time; offline tools cost nothing on the server but are only as fresh as the snapshot."],
    p: ["Looking for the largest keys with a full blocking walk of the keyspace stalls a production server.", "Comparing logical dataset size to the process's resident memory ignores fragmentation and buffers, so growth looks unexplained."],
    v: "Create a hash with ten thousand fields, query its memory usage, and confirm the figure is within a few percent of the growth in total used memory after creating it.",
    dep: ["memory-accounting", "allocator", "cursor-iteration"]
  },
  "string-type": {
    s: "The basic binary-safe value: a sequence of bytes up to hundreds of megabytes, with commands for getting, setting, appending, range access and atomic integer arithmetic.",
    d: "A string stores arbitrary bytes, so it holds text, serialized objects, images or counters. Commands include set with expiry and conditional flags, get, append, substring and overwrite by offset, and increment and decrement that parse the value as a 64-bit integer. Because every operation runs in the server, an increment is atomic with no client-side read-modify-write. A set-if-absent with expiry is the standard building block for locks. Large values copy their bytes on every reply, so the real cost of a string is proportional to its size.",
    k: ["One large string vs many small keys: one string saves per-key overhead, but any update rewrites or copies large data and blocks the thread.", "Server-side increment vs client read-modify-write: server-side is atomic and one round trip, but limited to integer arithmetic."],
    p: ["Storing multi-megabyte values makes each read block the loop and fill the output buffer, hurting every other client.", "Incrementing a string that holds non-numeric text returns an error that code often treats as a missing key."],
    v: "Run one thousand concurrent increments from several clients on one key and confirm the final value is exactly one thousand, with the value stored as a decimal integer.",
    dep: ["string-encodings", "object-header", "keyspace-table"]
  },
  "hash-type": {
    s: "A map from field names to values stored under one key, used for objects and records, with per-field read, write, increment and sometimes per-field expiry.",
    d: "A hash groups related fields under one key so an object is one cache entry, with commands to get or set one field, many fields, or all fields, and to increment numeric fields. Small hashes use a packed contiguous encoding with linear search, and larger ones convert to a real hash table. Grouping reduces per-key overhead and lets a client update one field without rewriting the whole value. Reading all fields of a huge hash is linear and blocks, so large hashes need incremental iteration. Per-field expiry requires extra indexes.",
    k: ["Hash per object vs one serialized string: a hash updates single fields and reads partial data cheaply, but costs more per field in memory than a compact serialized blob.", "Small packed encoding vs always a table: packed saves memory and is fast at tiny sizes, but degrades with linear scans if limits are set too high."],
    p: ["Reading all fields of a hash with millions of entries blocks the server, while the code only wanted a few.", "Raising the packed-encoding limits to save memory makes every field access scan a long array."],
    v: "Create a hash with a handful of fields, confirm its encoding is packed; add fields beyond the limit and confirm it converts to a table with identical contents.",
    dep: ["compact-list-encoding", "keyspace-table", "encoding-conversion"]
  },
  "list-type": {
    s: "An ordered sequence of strings with fast push and pop at both ends, used for queues, stacks and recent-item lists, with blocking variants for consumers.",
    d: "A list supports push and pop at the head and tail in constant time, index access and range reads in time proportional to position, and trimming to keep only a window. It is stored as a chunked list of compact nodes, which keeps memory low while preserving cheap end operations. Blocking pops turn a list into a work queue. A list is a poor fit for random access or middle insertion in large lists. An acknowledgment-free pop loses a job if the worker dies, so reliable queues move items to a processing list atomically.",
    k: ["List as queue vs stream: lists are simple and fast with blocking pops, but lack acknowledgment and replay; streams add both at greater complexity.", "Trimmed capped list vs unbounded list: a cap bounds memory for recent-activity feeds, but silently discards the oldest entries."],
    p: ["A worker that pops a job and crashes before finishing loses it forever, because a pop is destructive.", "Indexing into the middle of a long list in a loop makes each access linear and the loop quadratic."],
    v: "Push one million items, confirm head and tail operations stay under a millisecond, and confirm a trim to one hundred items leaves exactly the newest one hundred.",
    dep: ["chunked-list", "blocking-operations", "object-header"]
  },
  "set-type": {
    s: "An unordered collection of unique strings with constant-time membership tests, plus union, intersection and difference computed on the server.",
    d: "A set stores each member once and answers membership and add or remove in constant time. Sets of small integers use a sorted array of integers; small sets of other values use a packed list; larger sets use a hash table. Server-side union, intersection and difference save transferring members to the client, but their cost grows with set sizes and they block while running. Random member selection and random removal support sampling and simple raffles. Large sets must be iterated incrementally.",
    k: ["Integer array vs hash table: the integer array is compact and ordered for small integer sets, but insertion is linear, so it converts to a table beyond a size limit.", "Server-side set algebra vs client-side: server-side avoids moving data, but running over large sets stalls the single thread."],
    p: ["Intersecting two multi-million-member sets in one command blocks the server for seconds.", "Using a list to check membership makes each check linear when a set would be constant time."],
    v: "Add one hundred thousand members and confirm membership tests return in constant time; intersect two sets with a known overlap and confirm exactly the shared members come back.",
    dep: ["integer-set", "compact-list-encoding", "keyspace-table", "encoding-conversion"]
  },
  "sorted-set-type": {
    s: "A collection of unique members each with a numeric score, kept ordered by score, supporting rank, range and score queries in logarithmic time.",
    d: "Each member has a floating-point score, and members are ordered by score then by name. Operations include add or update, increment a score, rank of a member, ranges by rank, by score or lexicographic order, and removal by range. Small sets use a packed list; large ones combine a skip list for order with a hash table for member-to-score lookup, giving logarithmic updates and constant-time score lookup. It is the structure for leaderboards, rate-limit windows and time-ordered indexes. Range queries returning many members are linear in the result.",
    k: ["Skip list plus hash table vs one structure: two structures give fast rank and fast score lookup, but cost memory and must be kept in step on every update.", "Float scores vs integer scores: floats allow fractional ranking, but cannot represent very large integers exactly, so tie-breaking by member name matters."],
    p: ["Using timestamps as scores beyond float precision merges distinct times and misorders entries.", "Requesting the entire range of a huge set in one call blocks the server and fills the output buffer."],
    v: "Insert one million members with random scores, then confirm rank queries and top-ten ranges return correct, ordered results in logarithmic time and match a sort done in the client.",
    dep: ["skip-list", "compact-list-encoding", "keyspace-table", "encoding-conversion"]
  },
  "stream-type": {
    s: "An append-only log of entries with auto-generated time-based ids and field-value payloads, supporting range reads, blocking reads and trimming by length or age.",
    d: "Each entry gets a unique id made of a millisecond timestamp and a sequence number, ensuring order. Entries are stored in a radix tree of packed blocks keyed by id, so appends at the tail and range reads by id are efficient and compact. Readers ask for entries after a given id, optionally blocking for new ones, which enables tailing a log. Capping by maximum length or minimum id bounds memory, trimming whole blocks cheaply. Unlike pub/sub, entries persist until trimmed, so a reader that was away can catch up.",
    k: ["Approximate trimming vs exact trimming: approximate drops whole blocks and is cheap, but leaves slightly more than the limit; exact is precise and costs more.", "Auto-generated ids vs caller-supplied ids: generated ids are collision-free and ordered, but a caller-supplied id lets imports and replays keep original identity."],
    p: ["A stream with no trimming policy grows until it consumes the memory budget and triggers eviction of other keys.", "Assuming ids are only timestamps breaks when many entries arrive in one millisecond and rely on the sequence part."],
    v: "Append entries from several clients, read the range back, and confirm ids strictly increase and every payload is intact; trim to a length and confirm the oldest entries disappear.",
    dep: ["radix-tree", "compact-list-encoding", "keyspace-table"]
  },
  "consumer-groups": {
    s: "A stream feature that shares entries among cooperating consumers, tracking which entry was delivered to whom and which are still unacknowledged, so failed work can be reclaimed.",
    d: "A group has a last-delivered id and a table of consumers, each with a pending list of entries delivered but not acknowledged. A read on behalf of a consumer delivers new entries and adds them to its pending list. After processing, the consumer acknowledges, removing them. Entries idle too long can be claimed by another consumer, giving at-least-once delivery. Group state is stored inside the stream key and replicated and saved with it. Hard parts are poison entries that fail repeatedly and pending lists that grow when consumers die.",
    k: ["At-least-once with acknowledgment vs at-most-once: acknowledgment prevents loss when a consumer dies, but means consumers must handle duplicates.", "Automatic claiming of idle entries vs manual: automatic recovery needs less operator work, but may redeliver entries a slow consumer is still processing."],
    p: ["An entry that crashes every consumer is redelivered forever unless delivery counts are checked and it is moved aside.", "Consumers that never acknowledge make the pending list grow, consuming memory and blocking trimming."],
    v: "Deliver ten entries to a consumer, kill it before acknowledging, and confirm another consumer can claim all ten after the idle time and that acknowledging them empties the pending list.",
    dep: ["stream-type", "radix-tree", "blocking-operations"]
  },
  "bit-operations": {
    s: "Commands that treat a string as an array of bits or packed integers, supporting set, get, count, search, bitwise combination and arbitrary-width fields in one value.",
    d: "A string is addressed by bit offset, growing with zero padding as needed. Bit commands set and read single bits, count set bits in a range, find the first set or clear bit and combine several strings with AND, OR, XOR and NOT. A bitfield command reads and writes integers of chosen width and signedness at any offset, with overflow modes of wrap, saturate or fail. These give extremely compact flags per user or per day: one hundred million users fit in about twelve megabytes. Setting a very high offset allocates the whole string at once.",
    k: ["Bitmap vs set of ids: a bitmap is far smaller for dense ids and fast for counting, but wastes memory when ids are sparse and large.", "Wrap vs saturate overflow: saturation keeps counters bounded and safe, while wrapping behaves like machine integers and suits hashes."],
    p: ["Setting a bit at an offset in the billions allocates hundreds of megabytes in one blocking command.", "Using user ids from a sparse, random space as bit offsets makes the bitmap huge and nearly empty."],
    v: "Set bits for a known list of ids, count them, combine two bitmaps with AND, and confirm counts equal the sizes of the matching set operations computed independently.",
    dep: ["string-type", "string-encodings"]
  },
  "cardinality-sketch": {
    s: "A fixed-size probabilistic structure that estimates the number of distinct items added, using about twelve kilobytes with a typical error under one percent.",
    d: "Each added item is hashed, and the hash selects a register and records the longest run of leading zeros seen. The estimate combines registers with a harmonic mean and bias corrections. Small counts use a sparse representation that converts to a dense array of registers as it fills. Sketches can be merged by taking register maxima, giving the distinct count of a union. Memory is constant regardless of how many items, which suits unique visitor counts. It cannot list or remove items, and the answer is approximate.",
    k: ["Probabilistic count vs exact set: the sketch uses constant memory at any cardinality, but gives an estimate and cannot enumerate; a set is exact and grows with the data.", "Sparse then dense encoding: sparse keeps tiny counters small, but costs more CPU to update until it converts."],
    p: ["Expecting exact numbers leads to bug reports; the error is inherent and larger for small differences between two counts.", "Using it where individual membership questions arise fails, since the structure cannot say whether an item was added."],
    v: "Add one million distinct items and confirm the estimate is within the documented error, and that merging two sketches with overlapping items gives the union's count rather than the sum.",
    dep: ["string-type", "string-encodings"]
  },
  "probabilistic-structures": {
    s: "Compact approximate structures, typically delivered as extensions, such as membership filters, frequency sketches and top-k trackers, trading exactness for small, bounded memory.",
    d: "A membership filter answers whether an item was probably added, with a tunable false-positive rate and no false negatives, using a few bits per item. A frequency sketch estimates how often an item appeared, and a top-k tracker keeps the heaviest items. They are stored as values of module-defined types and persist and replicate like other data. They are valuable in front of a database to avoid lookups for items that cannot exist. Sizing matters: a filter that fills past its planned capacity sees its error rate rise sharply.",
    k: ["Approximate structure vs exact set: the filter is orders of magnitude smaller, but allows false positives and in simple forms cannot delete items.", "Scalable filters vs fixed filters: scalable ones grow by adding layers and keep the error bounded, but cost more memory and lookup time per layer."],
    p: ["Inserting far more items than the filter was sized for drives the false-positive rate toward one, making it useless without any error.", "Treating a positive answer as proof of existence causes wrong results; it only means the item might exist."],
    v: "Create a filter for one million items at a one percent error rate, add them, query one million items never added, and confirm roughly one percent are reported present and none of the added items are missed.",
    dep: ["module-api", "string-encodings"]
  },
  "object-header": {
    s: "A small fixed record in front of every value holding its type, encoding, a clock field for eviction, a reference count and a pointer to the data.",
    d: "Each value in the keyspace is wrapped in a header that says which type it is, which internal encoding it currently uses, and a compact field that holds either the last-access time or a frequency counter, used by eviction. It also holds a reference count so identical small values can be shared, and a pointer to the payload. The header is a few bytes per value, but with hundreds of millions of keys it dominates memory. Packing these fields into a single word keeps overhead low, at the cost of limits on precision.",
    k: ["Shared clock field for LRU and LFU vs separate fields: sharing saves bytes per key, but only one eviction mode can use it at a time.", "Reference counting vs ownership by copy: counting allows sharing and cheap replies, but adds update cost and makes lifetime reasoning harder."],
    p: ["Changing the eviction policy at runtime leaves existing keys with clock values interpreted the wrong way until they are touched.", "Per-value overhead is multiplied by key count, so a billion tiny keys waste more memory in headers than in data."],
    v: "Inspect a key's encoding, idle time and reference count with the debug commands, touch it, and confirm idle time resets and the encoding matches the value's size class.",
    dep: ["allocator"]
  },
  "string-encodings": {
    s: "Three layouts for string values: a 64-bit integer stored in the pointer, a short string allocated with its header, and a general buffer for long strings.",
    d: "If a string looks like a number that fits a 64-bit integer, it is stored directly in the header's pointer field, saving an allocation and enabling arithmetic. Short strings are stored in one allocation together with the header, which improves locality. Longer strings use a separate buffer, which can be grown by appending with spare capacity. Small integers within a range are shared across all keys. Append to an embedded string converts it to the buffer form, since embedded strings are immutable. Each form is a trade between memory, copies and mutation cost.",
    k: ["Integer encoding vs text: integers use eight bytes and support fast arithmetic, but converting back to text on every read costs a little CPU.", "Embedded vs separate allocation: embedding saves a pointer and a cache miss, but a value cannot grow without being reallocated."],
    p: ["Values that look numeric but must keep leading zeros are stored as integers and come back altered if the encoding were applied naively.", "Appending in a loop to an embedded string reallocates repeatedly until it converts, causing needless copying."],
    v: "Set a value to 12345, a short word, and a long text, query each encoding, and confirm integer, embedded and raw respectively, with identical bytes returned on read.",
    dep: ["object-header", "allocator"]
  },
  "compact-list-encoding": {
    s: "A single contiguous block holding a small collection's elements one after another with variable-length headers, avoiding per-element pointers and allocations.",
    d: "Entries are packed into one allocation, each storing its encoding, content and the length of the previous entry so traversal works in both directions. Integers are stored in the fewest bytes they need. Small hashes, sorted sets, lists and sets use it. Lookup is a linear scan, which for a few dozen elements is faster than a hash table thanks to cache locality, and memory per element is a fraction of a pointer-based structure. Insertion or deletion in the middle means moving bytes, so size limits keep the cost bounded.",
    k: ["Packed array vs pointer-based table: packed is compact and cache-friendly at small sizes, but inserts and lookups are linear and degrade as size grows.", "Per-entry back-length vs forward-only: back-lengths allow reverse traversal and cheap tail pops, but add bytes per entry."],
    p: ["Raising the size limits for the packed form can turn constant-time lookups into long scans for large hashes.", "Updating one element in a large packed block rewrites the block, so repeated updates cause heavy copying."],
    v: "Fill a hash up to the configured entry limit, confirm memory per field is a small constant above the data size, then exceed the limit and confirm the encoding changes to a table.",
    dep: ["object-header", "allocator", "encoding-conversion"]
  },
  "integer-set": {
    s: "A sorted array of integers stored in the narrowest width that fits all members, giving compact storage and binary-search lookup for small integer-only sets.",
    d: "Members are kept sorted in a flat array with a shared element width of 16, 32 or 64 bits. Lookup is a binary search; insertion shifts elements to keep order and upgrades the width of the entire array if a new value does not fit. This stores a thousand small ids in a couple of kilobytes. It is used only while every member is an integer and the count is under a limit, after which the set converts to a hash table. The upgrade is one-way, so one large value widens the whole array.",
    k: ["Sorted array vs hash table: the array is smaller and iterates in order, but inserts are linear and lookups logarithmic; the table is constant time with more memory.", "Uniform width vs per-element width: uniform width keeps indexing simple, but one large member makes every element take more space."],
    p: ["Adding a single huge integer upgrades a large array to 64-bit width, quadrupling its memory with no way back.", "Adding a non-integer member forces conversion to a general table, which may be unexpected in code that assumed compact storage."],
    v: "Add three hundred small integers and confirm the integer-set encoding with small size; add one very large value and confirm memory grows; add a text member and confirm conversion to a table.",
    dep: ["object-header", "encoding-conversion", "allocator"]
  },
  "skip-list": {
    s: "A layered linked structure that keeps elements sorted and gives logarithmic search, insert and rank queries, used inside large sorted sets.",
    d: "Each node has a random height; higher levels skip over many nodes so a search starts at the top and drops down. Nodes also store the span of each forward link, which lets the structure compute a member's rank in logarithmic time. Compared with a balanced tree it is simpler to implement and update, and ranges are found by walking the bottom level. It is paired with a hash table from member to score so lookups by member do not search. Cost is memory for several pointers per node and poorer cache locality than arrays.",
    k: ["Skip list vs balanced tree: skip lists are simpler to write and modify with no rotations, but use more memory and have probabilistic rather than guaranteed bounds.", "Storing spans vs not: spans give logarithmic rank queries, but each update must adjust the span at every affected level."],
    p: ["Poor random number generation or a bad level cap degrades the structure toward a linked list with linear search.", "Walking a wide range holds the thread for the whole walk, so large range queries stall other clients."],
    v: "Insert one million random scores, ask for the rank and score of random members, and confirm answers match a sorted array and latency stays logarithmic as the set grows tenfold.",
    dep: ["allocator", "object-header"]
  },
  "chunked-list": {
    s: "A doubly linked list whose nodes are small compact blocks, balancing the memory efficiency of arrays against the cheap end operations of linked lists.",
    d: "Each node holds a compact block of several elements bounded by a configured size or count. Pushes and pops at either end touch only the end node, creating or freeing nodes as needed. Interior nodes far from the ends can be compressed since they are rarely touched. Index access walks nodes and then scans within one. The structure avoids per-element pointer overhead of a plain linked list and avoids the large copying of a single huge array. Node size trades memory efficiency against the cost of rewriting a block on change.",
    k: ["Node size small vs large: small nodes make updates cheap and wasteful in pointers; large nodes save memory but make each edit copy more bytes.", "Compressing inner nodes vs leaving them: compression saves memory on long idle lists, but costs CPU when a node is touched."],
    p: ["Using a list as a big array with random index writes causes repeated node rewrites and slow performance.", "A very large node-size setting makes every push or pop at the ends rewrite a large block."],
    v: "Push five million short items, confirm memory per item is near the data size, and confirm push and pop at either end remain constant time while middle index access grows with position.",
    dep: ["compact-list-encoding", "allocator", "object-header"]
  },
  "radix-tree": {
    s: "A compressed prefix tree keyed by byte strings, giving ordered iteration, prefix search and compact storage for keys that share long prefixes.",
    d: "Nodes store runs of shared bytes and branch where keys diverge, so keys with long common prefixes cost little. Iteration visits keys in sorted order and a seek can start at any key or prefix. Streams use it to index blocks by id, and the cluster can use one to find keys by slot or to track sets of client or key names. It supports insert, delete and range walks, but the code is intricate, as nodes are compressed or split on update, and each node's layout depends on its children count.",
    k: ["Radix tree vs hash table: the tree gives order and prefix queries and memory sharing, but lookups are slower than a hash for random keys.", "Compressed nodes vs one byte per node: compression saves memory and traversals, but splits and merges complicate every update."],
    p: ["Treating the tree like a hash for random point lookups gives up speed the hash would provide.", "A bug in node compression corrupts ordering silently, and only a full iteration against a reference exposes it."],
    v: "Insert a large set of random and prefix-sharing keys, iterate, and confirm output is sorted and complete; seek to a prefix and confirm only matching keys are returned.",
    dep: ["allocator"]
  },
  "encoding-conversion": {
    s: "The rule engine that converts a value from a compact encoding to a general one when it grows past a size or element limit, and sometimes back.",
    d: "Each collection type has thresholds, such as the number of entries and the largest element size, below which it uses a packed form. When an operation crosses a threshold, the server allocates the general structure, copies the elements, and swaps the pointer, all while holding the main thread. Conversion to the larger form is common and automatic; shrinking back is rarely automatic and may only occur on rewrite. Thresholds can be configured. The conversion cost is a one-time pause proportional to size, and tuning limits shifts the trade between memory and speed.",
    k: ["Higher thresholds vs lower: higher saves memory by keeping data packed, but makes linear operations slower and conversions larger; lower does the reverse.", "Automatic conversion at write time vs background conversion: write-time is simple and exact, but puts the pause inside one client's command."],
    p: ["Conversion of a collection of millions of elements in one command causes a visible pause for the client that triggered it.", "Data that once grew large stays in the heavy encoding after shrinking, so memory does not return as expected."],
    v: "Add elements one at a time and record the encoding after each; confirm it flips exactly at the configured limit and that all elements read back unchanged.",
    dep: ["object-header", "compact-list-encoding", "keyspace-table"]
  },
});
