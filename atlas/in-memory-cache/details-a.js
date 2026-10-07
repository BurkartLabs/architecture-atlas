// Details for the in-memory cache plate, part 1: clients, patterns, protocol, commands.
ATLAS.details("in-memory-cache", {
  "client-library": {
    s: "The application-side code that opens connections, encodes commands into the wire format, decodes replies and exposes the server's commands as ordinary function calls.",
    d: "A client library serializes each command into the length-prefixed wire format, writes it to a socket, and parses the reply into native types. Most also handle authentication, protocol negotiation, database selection, subscriptions on a dedicated connection, and reconnection. Synchronous clients block a thread per call; asynchronous ones multiplex many in-flight requests on one connection. The hard part is edge behavior: partial reads, huge replies, mixed push messages and replies, and keeping connection state such as the selected database consistent after a reconnect.",
    k: ["Thin command wrapper vs high-level abstraction: a thin wrapper tracks the server's commands exactly, while abstractions hide the wire but can hide costs like extra round trips.", "Blocking vs asynchronous API: blocking is simple to reason about, but needs many connections or threads to reach the throughput one multiplexed connection can."],
    p: ["Reconnecting silently drops connection state such as the selected database, subscriptions and transaction progress, so later commands run in the wrong context.", "A client that buffers whole replies in memory crashes when a careless command returns millions of elements."],
    v: "Kill the server connection mid-reply and confirm the client raises or retries per its documented policy, then issues the next command on a fresh connection in the correct database.",
    dep: ["wire-protocol", "connection-pool"]
  },
  "connection-pool": {
    s: "A bounded set of reusable, already-authenticated connections shared by application threads, so each request avoids a new TCP and TLS handshake.",
    d: "Opening a connection costs a TCP handshake, possibly a TLS handshake, authentication and setup commands, all of which dwarf a sub-millisecond command. A pool hands out an idle connection, or opens one up to a maximum, and returns it afterward. Connections used for blocking commands, subscriptions or open transactions are taken out of circulation or dedicated. Pools also validate connections and cap idle time to stay under the server's client limit. The difficulty is sizing: the sum of all application instances' pools must fit within the server's maximum connections.",
    k: ["Large pool vs small pool: a large pool absorbs latency spikes without queueing, but multiplies server connections and per-connection buffers; a small one queues callers under bursts.", "Pool per thread vs shared pool: per-thread removes lock contention, but ties idle connections to threads that may sit unused."],
    p: ["A blocking command or an unfinished transaction returned to the pool poisons the next borrower, which then receives someone else's reply.", "Hundreds of application instances each with a generous pool exhaust the server's connection limit during a deploy."],
    v: "Run a load test with pool size N and confirm the server's connected-client count stays at or below N per instance, with no connection-creation spikes after warmup.",
    dep: ["client-library", "tls-transport"]
  },
  "pipelining": {
    s: "Sending many commands without waiting for each reply, then reading all replies in order, so one network round trip is shared by a whole batch.",
    d: "The protocol is strictly request-reply per connection with in-order responses, so a client can write a batch of commands back to back and read the replies afterward. Throughput rises sharply because the cost is dominated by round-trip time and system calls, not command execution. The server queues replies in the output buffer until the client reads them. Pipelining is not atomic: other clients' commands can interleave, and one command's error does not stop the rest. Batches that are too large strain buffers on both sides.",
    k: ["Large batches vs small batches: large ones amortize round trips best, but delay the first reply and grow server output buffers; small ones keep memory and latency steady.", "Pipelining vs transactions: pipelining only batches the network, while a transaction also makes the batch execute without interleaving, at the cost of queuing."],
    p: ["Writing a huge pipeline without reading replies deadlocks when both socket buffers fill and neither side can proceed.", "Treating a pipeline as atomic leads to partial application when one command fails or the connection drops mid-batch."],
    v: "Time ten thousand SET commands sent one at a time versus in batches of one hundred over a network link with known latency, and confirm total time falls by roughly the round-trip savings.",
    dep: ["wire-protocol", "output-buffers"]
  },
  "cluster-aware-routing": {
    s: "Client logic that hashes each key to a slot, keeps a map of slots to nodes, and follows redirects so requests reach the node that owns the data.",
    d: "A cluster-aware client fetches the slot map at startup, computes each key's slot with the same checksum the servers use, and sends the command to the owning primary, optionally reading from replicas. When a node answers with a redirect, the client retries elsewhere and refreshes its map. It also splits multi-key operations that span nodes and keeps a pool per node. The difficulty is staleness: during resharding or failover the map is wrong for a while, and the client must converge without storming the cluster with refresh requests.",
    k: ["Eager full map refresh vs per-slot update on redirect: a full refresh converges quickly after topology change, but many clients refreshing together create a thundering herd.", "Reading from replicas vs primaries only: replica reads spread load, at the cost of stale results after recent writes."],
    p: ["Multi-key commands whose keys hash to different slots fail, and client code that assumed a single node breaks only after the move to a cluster.", "Never refreshing the slot map after a failover leaves the client redirecting every request indefinitely."],
    v: "Trigger a failover of one primary and confirm the client's requests for that slot range fail for no longer than the failover time, then succeed against the promoted node without restarting the client.",
    dep: ["hash-slots", "slot-redirects", "connection-pool"]
  },
  "retry-and-timeouts": {
    s: "The client's rules for how long to wait on connect and reply, which errors to retry, how far to back off, and when to give up and fail the caller.",
    d: "Every call needs a connect timeout, a read timeout and an overall deadline, because a stalled server otherwise stalls every caller. Retries recover from brief failovers and dropped connections, with exponential backoff and random jitter to avoid synchronized retries. Only idempotent commands are safe to retry blindly: re-running an increment or a list push after an ambiguous failure can apply it twice. Timeouts should sit above the server's worst expected command time, including slow log entries, but below the caller's own deadline.",
    k: ["Aggressive retries vs fail fast: retries hide short failovers from users, but under a real overload they multiply traffic and deepen the outage.", "Retry at the client vs at the caller: client-level retries are uniform, but only the caller knows whether a repeated side effect is acceptable."],
    p: ["Retrying non-idempotent writes after a timeout double-applies them, because the server may have executed the first attempt.", "A read timeout shorter than a legitimately slow command makes the client abandon work that the server still completes."],
    v: "Block the server for two seconds with a long command and confirm clients with a one-second timeout fail and back off with jitter, while the overall request rate does not rise.",
    dep: ["client-library", "wire-protocol"]
  },
  "client-side-caching": {
    s: "A local in-process copy of hot keys, kept correct by server-sent invalidation messages, so repeated reads need no network round trip at all.",
    d: "The client keeps recently read values in its own memory. It asks the server to track which keys it has read; when any client modifies one of those keys, the server pushes an invalidation message, and the client drops its copy. Tracking can be per key, or broadcast by key prefix to avoid server-side memory. Invalidations arrive on the same connection in a push format, or on a second connection to keep the data connection simple. The hard cases are races between a read in flight and an invalidation, and connection loss, after which the whole local cache must be flushed.",
    k: ["Per-key tracking vs prefix broadcast: per-key tracking sends only relevant invalidations but costs server memory per client; broadcast costs none but sends invalidations for keys the client never read.", "Bounded local cache vs unbounded: bounding protects client memory, but a small bound causes churn and gives back the round trips it saved."],
    p: ["Caching a value in the window between the read reply and the tracking registration lets an invalidation slip past, serving stale data indefinitely.", "Not flushing local entries when the connection drops serves values that may have been invalidated while disconnected."],
    v: "Read a key twice and confirm the second read causes no network traffic, then change it from another client and confirm the next read fetches the new value within milliseconds.",
    dep: ["invalidation-tracking", "wire-protocol", "protocol-negotiation"]
  },
  "cache-aside": {
    s: "The application reads the cache first, on a miss loads from the source of truth and fills the cache itself, and deletes or updates cached entries when data changes.",
    d: "On a read the code checks the cache; a hit returns immediately, a miss loads from the database, stores the result with an expiry and returns it. On a write the code updates the database, then invalidates the cache entry so the next read refills it. The cache only ever holds data some reader asked for, and it can be lost without losing data. The difficulty is ordering: concurrent readers and writers can interleave so an old value is stored after a newer write, leaving stale data until it expires.",
    k: ["Invalidate on write vs update on write: deleting avoids racing writers storing out-of-order values, but the next read pays a miss; updating saves the miss and risks stale overwrites.", "Short expiry vs long expiry: short expiry bounds staleness from missed invalidations, but raises miss rate and database load."],
    p: ["A reader loading an old row, then a writer updating and invalidating, then the reader storing its old row, leaves stale data with no later invalidation.", "Cache failure becomes database failure when every request falls through to a database that was sized assuming a warm cache."],
    v: "Update a row in the database, then read it through the application and confirm the new value appears within the expiry bound, with a database read counted only on the first access.",
    dep: ["ttl-jitter", "key-design", "retry-and-timeouts"]
  },
  "write-through": {
    s: "Every write goes to the cache and the database together before returning, so the cache is always populated with the latest value for written keys.",
    d: "The write path updates the source of truth and the cache in one logical operation, usually through a wrapper layer. Reads then hit a warm entry without waiting for a first miss. The cost is write latency and the need to keep two stores consistent: if the database commit succeeds and the cache update fails, or the reverse, they diverge. Many designs write the database first and then the cache, accepting that a failed cache write falls back to expiry. It suits data read soon after it is written and poorly suits write-heavy data that is rarely read.",
    k: ["Database first vs cache first: database first never caches uncommitted data, but a cache failure leaves an old entry; cache first can serve values that later roll back.", "Write-through vs invalidate: write-through avoids the next miss, but caches values that may never be read and wastes memory."],
    p: ["Two concurrent writers can update the database in one order and the cache in the other, leaving the cache permanently different from the database.", "A slow cache doubles every write's latency, and a cache outage can make writes fail even though the database is healthy."],
    v: "Write a value through the layer, read it directly from the cache and the database, and confirm both return the same value, then repeat with the cache unreachable and confirm the documented fallback.",
    dep: ["cache-aside", "key-design"]
  },
  "write-behind": {
    s: "Writes land in the cache immediately and are flushed to the database asynchronously in batches, trading durability for lower write latency and fewer database writes.",
    d: "The application writes to the cache and returns; a background worker drains a queue of pending changes and applies them to the database, coalescing repeated updates to the same key. This absorbs write bursts and cuts database load. The cache becomes the temporary source of truth, so its durability matters: a crash or eviction before the flush loses acknowledged writes. Designs therefore store the pending queue in a durable structure, such as a stream, and make the flush idempotent so a retry after failure is safe.",
    k: ["Coalescing updates vs ordered replay: coalescing minimizes database writes, but loses intermediate states and cannot support audit trails that need every change.", "Queue in the cache vs in a separate durable queue: the cache is fast and simple, but loses the queue when the cache loses data."],
    p: ["Evicting a key whose write has not been flushed discards an acknowledged update with no trace.", "A slow database lets the pending queue grow until it consumes the cache's memory and triggers eviction of unrelated data."],
    v: "Write a key, kill the server process abruptly, restart, and confirm the pending queue replays so the database ends up with the value, with the pending count returning to zero.",
    dep: ["stream-type", "append-only-log", "cache-aside"]
  },
  "stampede-protection": {
    s: "Techniques that stop many concurrent requests from all recomputing the same missing or expiring value at once, such as locks, request coalescing and early refresh.",
    d: "When a popular key expires, every request that sees the miss may hit the database together. Protection lets one caller recompute while others wait or are served slightly stale data. Common forms are a short-lived lock key acquired with an atomic set-if-absent, in-process coalescing so one request per process fetches, and probabilistic early refresh that renews a value before it expires with rising probability. Stale-while-revalidate keeps the old value available during recompute. The hard part is lock expiry: if the recomputing caller dies or is slow, waiters must not wait forever or all proceed.",
    k: ["Lock then recompute vs serve stale: locking guarantees one recompute and fresh data, but makes waiters slow; serving stale keeps latency flat but shows old data briefly.", "Early probabilistic refresh vs fixed expiry: early refresh spreads work without coordination, at the cost of occasionally refreshing values nobody needs."],
    p: ["A lock with no expiry stays held forever when its owner crashes, so the key can never be recomputed.", "A lock that expires before the slow recompute finishes lets a second caller start, recreating the stampede it was meant to prevent."],
    v: "Expire a hot key under one thousand concurrent requests and confirm the database sees one recompute query instead of one thousand, with every request still receiving a value.",
    dep: ["cache-aside", "ttl-jitter", "lazy-expiry"]
  },
  "ttl-jitter": {
    s: "Adding a random offset to each key's time to live so entries written together do not all expire at the same moment.",
    d: "Keys loaded in bulk, such as at deploy or after a restart, get identical expiry times and then vanish together, producing a synchronized wave of misses against the database. Adding a random fraction, often ten to twenty percent of the base time, spreads expirations across a window. The same idea helps the server: a burst of expirations makes the active expiry cycle spend its time budget deleting instead of serving. Jitter is chosen at write time by the client, so it must be applied consistently by every code path that sets expiry.",
    k: ["Wide jitter vs narrow jitter: wide spreads load best, but makes the maximum staleness harder to bound; narrow keeps freshness tight but leaves some bursts.", "Jitter at write time vs staggered warmup: jitter needs no coordination, while staggered warmup controls the exact load but needs a scheduler."],
    p: ["One code path that sets a fixed expiry brings back synchronized expiry for exactly the keys that were loaded together.", "Jitter applied as a fixed offset per process rather than random per key still expires a whole process's keys together."],
    v: "Load ten thousand keys with jitter and plot expirations per second from the server's expired-keys counter, confirming a smooth spread rather than a single spike.",
    dep: ["expiry-index", "active-expiry"]
  },
  "key-design": {
    s: "Conventions for naming keys with namespaces, versions and tenant identifiers so entries are findable, safely invalidated, spread across slots and kept small.",
    d: "Good keys encode the data kind, the identity and often a schema version, such as a prefix, a colon-separated id, and a version number, so a format change can start a new keyspace without a mass delete. Short keys save memory across millions of entries. In a cluster, a hash tag in braces forces related keys into one slot so multi-key operations work, at the risk of creating a hot slot. Keys with unbounded user-supplied text invite abuse; patterns that need scans over the keyspace do not scale and should become explicit index structures.",
    k: ["Short keys vs readable keys: short keys save memory on large datasets, but opaque names make debugging and manual invalidation harder.", "Hash tags to colocate vs natural spread: colocation enables atomic multi-key operations in a cluster, but concentrates load and memory in one slot."],
    p: ["Embedding unvalidated user input lets one tenant craft keys that collide with or overwrite another tenant's entries.", "Relying on scanning by prefix to invalidate groups of keys blocks or burns CPU as the keyspace grows."],
    v: "List the keys written by two tenants and a schema upgrade, and confirm they sit in distinct prefixes, no key exceeds the length budget, and a hash-tagged group maps to one slot.",
    dep: ["hash-slots", "keyspace-table"]
  },
  "wire-protocol": {
    s: "A simple text-framed request and reply format with typed, length-prefixed values, easy to implement in any language and cheap to parse.",
    d: "Requests are arrays of binary-safe bulk strings, each prefixed by its byte length, so a client can send any bytes and the server can read exactly the right amount without scanning. Replies use a leading type byte: simple strings, errors, integers, bulk strings, arrays, and in newer versions maps, sets, doubles, booleans and out-of-band push messages. Lines end with a carriage return and line feed. The format is stateless per message, which lets servers parse incrementally across partial reads, and lets proxies and tools be written in an afternoon. It is verbose for numbers but simple to debug with a plain terminal.",
    k: ["Length-prefixed vs delimiter-terminated payloads: length prefixes make binary data and fast parsing easy, but require the sender to know sizes before writing.", "Text-framed vs binary framing: text is debuggable by hand and easy to implement, but spends bytes and parse time on decimal numbers."],
    p: ["A client that miscounts a length corrupts framing, and every later reply on that connection is misread as part of the previous one.", "Unbounded declared lengths let a hostile client make the server try to allocate gigabytes before any data arrives."],
    v: "Open a raw TCP connection, send a hand-built PING and a SET with a binary value containing line endings, and confirm the exact expected reply bytes and an identical value on readback.",
    dep: ["query-buffer"]
  },
  "protocol-negotiation": {
    s: "A handshake command where a client names the protocol version it wants, authenticates and sets its identity, letting richer reply types be introduced without breaking old clients.",
    d: "A new connection starts in the oldest protocol version. A hello-style command lets the client request a newer version, supply credentials and set a name in one round trip, and the server replies with its own version, mode and role. Version three adds typed replies and push messages used by invalidation and subscriptions on the same connection. Because a connection stays in the negotiated version, the server must keep generating replies for both versions for every command, which makes new reply types a cost shared by the whole command set.",
    k: ["Per-connection version vs per-command version: per-connection keeps the client simple and replies consistent, but forces the server to maintain two reply shapes everywhere.", "Combined handshake and authentication vs separate steps: one round trip is faster, but leaves old clients using a separate authenticate command that must keep working."],
    p: ["A proxy that does not understand the new version forwards the handshake and then misparses push messages as ordinary replies.", "Assuming the highest version is always supported breaks when connecting to an older server that rejects the handshake."],
    v: "Connect, request version three, and confirm map replies arrive as maps and push messages arrive out of band; then connect without negotiating and confirm the same commands return flat arrays.",
    dep: ["wire-protocol", "authentication"]
  },
  "event-loop": {
    s: "A single thread that waits on many sockets with the operating system's readiness API, runs ready handlers and timers, and executes every command to completion in order.",
    d: "The loop calls the system's readiness mechanism, with a timeout set by the next timer. It then reads from ready sockets, parses and executes commands, queues replies, and writes them out, running periodic tasks between iterations. Because only this thread touches the data, no locks are needed and every command is atomic. The cost is that a slow command delays every client, so the whole system is designed to keep each step short. Hooks before and after each wait let the server flush output and handle blocked clients.",
    k: ["Single-threaded execution vs multi-threaded data access: single-threaded removes locking and makes each command atomic, but caps one process at one core of command work.", "Level-triggered vs edge-triggered readiness: level-triggered is simpler and tolerant of partial reads, while edge-triggered saves wakeups but demands draining sockets fully."],
    p: ["A single command that scans a million elements stalls every connected client for its whole duration, and health checks time out.", "Handlers that block on disk or DNS inside the loop freeze the server without using any CPU."],
    v: "Run a deliberately slow command in one client while another client pings in a loop, and confirm the second client's latency rises by about the slow command's duration, identifying the loop as serial.",
    dep: ["query-buffer", "command-table", "server-cron"]
  },
  "io-threads": {
    s: "Optional helper threads that read from and write to sockets in parallel while the main thread alone parses, executes and owns the data.",
    d: "Network reads and writes consume a large share of CPU for small commands, yet need no access to the keyspace. With I/O threads, the main thread hands batches of ready clients to helpers, which read and parse input or write queued replies, then it waits for them to finish before moving on. Command execution remains single-threaded, so atomicity holds. Throughput can rise substantially on many-connection workloads on multi-core machines. It adds synchronization points per loop iteration and brings little benefit for few connections or large values dominated by memory copying.",
    k: ["Threaded I/O vs a single thread for everything: threading can nearly double throughput on busy servers, but adds hand-off cost that hurts latency at low load.", "Threaded I/O vs running several single-threaded instances: threads share one dataset, whereas separate instances need sharding but scale execution too."],
    p: ["Enabling more threads than idle cores adds contention and lowers throughput instead of raising it.", "Assuming threads parallelize command execution leads to disappointment: a slow command still blocks everyone."],
    v: "Benchmark with several hundred connections, with threads off and on, and confirm throughput rises while a per-command trace shows execution still happening on one thread.",
    dep: ["event-loop", "query-buffer", "output-buffers"]
  },
  "query-buffer": {
    s: "The per-connection buffer where incoming bytes accumulate until a complete command can be parsed, with size limits that protect the server from oversized or malicious input.",
    d: "Each read appends to the client's query buffer. The parser consumes complete commands from the front and leaves any partial command in place for the next read. For large arguments, the server switches to reading directly into the argument's own allocation to avoid copying. A configured maximum rejects a client whose pending input exceeds it, and idle buffers are shrunk so thousands of quiet connections do not hold memory. A buffer that is too small forces many reads; one that is too generous multiplies across connections.",
    k: ["Fixed small buffer vs growing buffer: fixed bounds memory per connection, but needs more reads for large commands; growing handles large values in fewer reads at higher peak memory.", "Copy into argument vs read directly into it: direct reads avoid a copy of big values, at the cost of special-case code for large arguments."],
    p: ["Thousands of idle connections that once sent a large command keep oversized buffers allocated, silently consuming gigabytes.", "A very high buffer limit lets one misbehaving client send a huge incomplete command and exhaust memory."],
    v: "Send a command with a one-gigabyte declared length and confirm the server closes the connection at the configured limit, while its memory use stays flat for other clients.",
    dep: ["memory-accounting"]
  },
  "output-buffers": {
    s: "Per-client queues of replies waiting to be written, with hard and soft size limits that disconnect clients too slow to keep up, so one slow reader cannot exhaust memory.",
    d: "Replies are appended to a small fixed buffer and then to a list of chunks when it fills, and written whenever the socket is writable. Separate limits apply to normal clients, replicas and subscribers: a hard limit disconnects immediately, and a soft limit disconnects if it is exceeded for a sustained number of seconds. Replicas get generous limits since a full resync can queue a lot. Output memory is not counted against the eviction limit in some designs, so it can push the process past its configured memory.",
    k: ["Disconnect slow clients vs buffer without bound: disconnecting protects the server, but loses messages for subscribers that were merely busy.", "Shared reply chunks vs per-client copies: sharing identical replies, such as a broadcast, saves memory, but makes accounting per client harder."],
    p: ["A subscriber on a slow link accumulates messages until disconnected, and its reconnect and resubscribe loop repeats under load.", "A large reply to a client that reads slowly holds memory the eviction logic never sees, ending in an out-of-memory kill."],
    v: "Subscribe a client that never reads, publish continuously, and confirm the server disconnects it at the configured limit and the client-output memory figure returns to baseline.",
    dep: ["event-loop", "buffer-budget"]
  },
  "tls-transport": {
    s: "Encrypted and authenticated connections using standard TLS, including certificate verification, optional client certificates, and the same protocol over the encrypted channel.",
    d: "The listener wraps accepted sockets in a TLS session using a configured certificate, key and trusted certificate authorities. Servers can require client certificates, which also identify users to the access control layer. TLS also protects the replication link, cluster bus and monitor traffic, which each need their own settings. Encryption adds CPU cost per byte and handshake cost per connection, which makes connection pooling more important, and moves some reading and writing off the fast path. Certificate rotation must be possible without a restart to avoid downtime.",
    k: ["TLS in the server vs a terminating proxy: built-in covers every link including replication and cluster, but costs main-thread CPU; a proxy offloads cost but leaves inner hops unencrypted.", "Mutual TLS vs password authentication: certificates avoid shared secrets and map to users, but demand a certificate lifecycle across all clients."],
    p: ["An expired certificate on the replication link breaks replication while client connections keep working, so the failure is noticed late.", "Disabling certificate verification to make a deployment work leaves the connection open to interception while looking encrypted."],
    v: "Connect with a client trusting the wrong authority and confirm the handshake fails, then with the correct one and confirm commands succeed and a packet capture shows no plaintext keys or values.",
    dep: ["event-loop", "authentication", "config-system"]
  },
  "command-parser": {
    s: "Turns the bytes in the query buffer into a command name and argument vector, handling partial input, both framed and inline forms, and strict limits on counts and sizes.",
    d: "The parser reads the array header, then each argument's length and bytes, and stops cleanly if input ends mid-command so it can resume after the next read. It also accepts a simple space-separated inline form for typing into a raw terminal. It enforces limits on argument count and total size, rejects malformed framing by closing the connection, and avoids copying where possible by pointing arguments into the buffer. Parse errors are protocol errors, which cannot be recovered mid-stream, unlike command errors, which return an error reply and continue.",
    k: ["Resumable parsing vs requiring full commands: resumable parsing never blocks on partial input and supports huge values, but needs explicit state between reads.", "Strict framing validation vs tolerant parsing: strict rejection catches bugs and attacks early, but breaks clients that are slightly nonconforming."],
    p: ["Inline parsing exposed to untrusted web content lets a crafted request be interpreted as commands by a server reading from a cross-protocol connection.", "A parser that trusts declared counts allocates an enormous argument array from a few hostile bytes."],
    v: "Feed the parser a command split across three reads at awkward boundaries and confirm it executes exactly once, and feed a malformed length and confirm the connection is closed with a protocol error.",
    dep: ["query-buffer", "wire-protocol"]
  },
  "command-table": {
    s: "A lookup structure mapping command names to handlers and metadata, plus the dispatch path that checks arity, permissions, memory and role before invoking the handler.",
    d: "The table is a hash from lowercase command name to a record with the handler, arity, flags, key positions, categories and subcommands. After parsing, dispatch looks up the record and runs checks in a fixed order: unknown command, wrong argument count, authentication, access rules, cluster redirection, memory limit, replica write rules, and pending-transaction handling. Only then does it call the handler, record statistics, propagate to replicas and the log, and queue replies. The order matters because each check must see state the earlier checks established.",
    k: ["Central dispatch checks vs per-handler checks: central checks guarantee every command is subject to the same rules, but need accurate metadata for each command.", "Static table vs dynamically registered commands: static is fast and simple to audit, while dynamic registration lets modules add commands at the price of lookups that must be safe at runtime."],
    p: ["A command registered with the wrong flags bypasses a check, such as running a write on a read-only replica or under memory pressure.", "Subcommand tables that drift from documentation make permission rules silently miss new subcommands."],
    v: "Send a write command to a read-only replica, a command with the wrong argument count, and an unknown command, and confirm each yields its distinct, correct error without side effects.",
    dep: ["command-parser", "command-flags-and-key-specs", "acl-engine", "maxmemory-limit"]
  },
  "command-flags-and-key-specs": {
    s: "Metadata attached to each command describing whether it writes, may block, is fast, and exactly which arguments are key names, so generic machinery can reason about any command.",
    d: "Flags record properties such as write, read-only, deny-on-low-memory, admin, fast, no-script and may-replicate. Key specifications describe where keys appear: fixed positions, ranges, or keys found after a keyword, plus whether each is read, written or deleted. The cluster router, access rules, replication, scripts and client libraries all use this single source rather than command-specific code. It is hard to keep complete: commands with variable key counts or keys discovered at run time need special extraction functions, and a mistake leaks into routing and permissions.",
    k: ["Declarative key specs vs per-command callbacks: declarative specs are inspectable by clients and tools, but cannot express every odd command, which then need a fallback.", "Fine-grained flags vs few coarse flags: fine flags allow precise rules and scripting limits, but each new flag must be applied consistently everywhere."],
    p: ["A command whose key specification omits a key is routed to the wrong node or escapes key-pattern permission rules.", "A write command not marked as write is allowed on replicas and is never propagated, diverging the copies."],
    v: "For every command, compare keys extracted from its specification with keys reported by a sample invocation, and confirm they match, including commands with variable key counts.",
    dep: ["command-table"]
  },
  "blocking-operations": {
    s: "Commands that wait for data, such as popping from an empty list, by parking the client and resuming it when another client makes the key ready, without blocking the event loop.",
    d: "When a blocking pop finds no data, the server records the client in a per-key waiting list with an optional timeout and moves on. When a later command pushes to that key, the key is marked ready, and after the current command finishes the server serves waiting clients in order, running the operation as if the client had just sent it. Timeouts are checked by a timer. Replication and logging must see the final operation, not the wait. The difficulty is fairness and correctness across key deletion, type changes, transactions, scripts and cluster slot moves.",
    k: ["Serve blockers after the command vs inside it: serving after keeps each command atomic and reasoning simple, but delays waiting clients by one command.", "FIFO wakeup vs wake everyone: FIFO is fair and deterministic, but wake-everyone needs less bookkeeping; FIFO is what clients expect from queues."],
    p: ["Blocking commands inside a transaction or script cannot wait without freezing the server, so they must degrade to a non-blocking check.", "A key deleted or retyped while clients wait can leave them blocked forever unless explicitly woken with an error."],
    v: "Block ten clients on one empty list, push ten items in a single command, and confirm each client receives exactly one item in arrival order and the event loop stays responsive throughout.",
    dep: ["event-loop", "list-type", "server-cron"]
  },
  "transactions": {
    s: "A way to queue several commands and execute them as one uninterrupted unit, so no other client's command runs between them.",
    d: "A begin command switches the client into queued mode: each following command is syntax-checked and stored, and the server replies that it is queued. An execute command then runs all queued commands back to back in the single thread, returning an array of results. Other clients cannot interleave, which gives isolation, but there is no rollback: if one command fails at runtime, the others still apply. Errors found while queuing abort the whole transaction. The block is written to the replication stream and log as one unit so replicas apply it atomically too.",
    k: ["No rollback vs undo on failure: skipping rollback keeps execution simple and fast, but a runtime failure mid-block leaves a partial update that the client must repair.", "Queue then run vs interactive transaction: queueing avoids holding the server across round trips, but the batch cannot branch on earlier results without a watch or a script."],
    p: ["Assuming failure rolls back earlier commands leaves half-applied state, for example a debit without the matching credit.", "A transaction with commands on keys in different cluster slots is rejected, which surfaces only after moving to a cluster."],
    v: "Queue an increment, a command that fails at runtime, and another increment, execute, and confirm both increments applied while the failure is reported in its slot of the result array.",
    dep: ["command-table", "replication-stream", "optimistic-watch"]
  },
  "optimistic-watch": {
    s: "A check-and-set mechanism: a client watches keys, and its later transaction aborts if any watched key was modified by someone else in between.",
    d: "A watch command records the keys for the client, and each key keeps a list of watchers. Any write to a watched key marks its watchers dirty, including expiry and eviction. When the client executes its transaction, a dirty flag makes it return a null reply without running anything, and the client retries from reading the values. No locks are held while the client thinks, so contention only costs retries. It gives read-modify-write correctness for multi-step logic that a plain transaction cannot express, but under high contention on one key, retries pile up.",
    k: ["Optimistic watch vs locking: watch holds nothing and cannot deadlock, but wastes work and may starve under contention; a lock guarantees progress but needs expiry and recovery.", "Watch vs a server-side script: a script does the read-modify-write in one step without retries, but puts logic on the server where it blocks everyone."],
    p: ["Forgetting that the abort returns null, not an error, leads code to treat a failed transaction as a success.", "A key expiring between watch and execute marks the transaction dirty, causing spurious retries on short-lived keys."],
    v: "Watch a counter, modify it from a second client, then execute a transaction from the first and confirm it returns null and applies nothing, while a retry after rereading succeeds.",
    dep: ["transactions", "keyspace-table", "active-expiry"]
  },
  "scripting-engine": {
    s: "An embedded interpreter that runs a client-supplied script atomically on the server, calling commands directly, to implement multi-step logic in one round trip.",
    d: "A client sends script text and arguments, naming the keys it will touch. The server compiles and caches it, then runs it on the main thread, so nothing else interleaves. Inside, the script calls commands through a binding that checks permissions and flags, and returns a value converted back to a reply. A time limit and a kill command guard against infinite loops, and writes are replicated as the commands the script actually performed, or the script itself. It is powerful and dangerous: a script is a command with unbounded duration, and determinism matters for replicas.",
    k: ["Server-side script vs client-side multi-step: scripts are atomic and save round trips, but occupy the single thread for the whole run; client logic is slower but cannot stall others.", "Replicating effects vs replicating the script: effects replicate safely even for random or time-based scripts, but can be larger than the script text."],
    p: ["A script that loops over a large collection blocks every client, and the busy-script state makes most commands fail until it is killed.", "Scripts that build key names dynamically hide touched keys from the cluster router and break on other nodes."],
    v: "Run a script that reads a counter and conditionally increments it with concurrent clients incrementing the same key, and confirm the final count matches exactly with no lost updates.",
    dep: ["command-table", "command-flags-and-key-specs", "acl-engine", "replication-stream"]
  },
  "functions": {
    s: "Named server-side routines loaded as persistent libraries, which are replicated and saved with the data, so applications call them by name instead of sending code each time.",
    d: "A library of functions is loaded once and stored in the server's own state, and is included in snapshots, the log and replication, so every node has the same code. Callers invoke a function by name with keys and arguments. Unlike cached scripts, functions are not evicted or lost on restart and have declared flags, for example whether they write or are allowed on replicas, so the server can route and check them before running. They share the scripting engine's atomicity and its blocking risk, but add lifecycle concerns such as upgrading a library while it is in use.",
    k: ["Persistent functions vs ad hoc scripts: functions survive restarts and stay identical across nodes, but need deployment and versioning; ad hoc scripts need none, yet can vanish.", "Declared flags vs inferred behavior: declared flags let the server decide placement before running, but the author must keep them truthful."],
    p: ["Replacing a library on the primary during a rolling deploy leaves replicas with the old version until propagation completes, so behavior differs between nodes.", "A function that is flagged read-only but writes fails at run time on a path never tested."],
    v: "Load a library, restart the server, and confirm the function is still callable by name and returns the same result, then check that a replica reports the identical library.",
    dep: ["scripting-engine", "snapshot-format", "replication-stream"]
  },
  "module-api": {
    s: "A stable programming interface letting dynamically loaded code add commands, data types, hooks and events to the server without changing its core.",
    d: "A module is a shared library the server loads at startup or on command. Through a defined interface it registers commands with flags and key specs, defines new value types with callbacks for saving, loading, freeing, memory use and copying, subscribes to events, and runs timers or background threads. The API gives modules safe access to the keyspace, replies and the replication stream. Because modules run in-process, they share the server's address space and crash domain. Versioning the interface and handling unload, which core code cannot always undo, is the hard part.",
    k: ["In-process modules vs separate services: in-process modules are fastest and see the keyspace directly, but a bug can corrupt or crash the whole server.", "Stable interface vs direct internals: a stable API lets modules survive upgrades, but constrains the core and may leave needed features missing."],
    p: ["A module that allocates with a different allocator than the server corrupts memory accounting or crashes on free.", "Loading an untrusted module gives it the server's full privileges, so loading must itself be restricted by access control."],
    v: "Load a sample module defining a new command and value type, write a value, snapshot and restart, and confirm the value reloads and the command still returns it.",
    dep: ["command-table", "command-flags-and-key-specs", "allocator", "snapshot-format"]
  },
});
