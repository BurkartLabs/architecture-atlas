// Details for the consensus service plate, part 2: watches and leases, state machine, leader election.
ATLAS.details("consensus-service", {
  "watch-streams": {
    s: "A long-lived stream that delivers ordered change events for a key or prefix, starting from a chosen revision, so clients react to changes instead of polling.",
    d: "A client opens a stream, names a key or range and a start revision, and receives events with the key, new value, previous value if requested and the revision. Events arrive in revision order with no gaps, because they are generated from the same applied history all members share. Many watches multiplex over one connection. Every member serves watches from its own applied state, so reads and watches do not burden the leader. It is hard because a watch is a promise to never miss or reorder an event across disconnects, slow consumers and compaction.",
    k: ["Watch from a revision vs watch from now: a start revision lets clients close the gap between a read and a watch with no lost events, but requires history to be retained.", "Served by any member vs only by the leader: any member spreads load widely, but a lagging member delivers events late."],
    p: ["Starting a watch from the current time instead of a read's revision loses changes made in between.", "Thousands of watches on a hot prefix multiply every write into thousands of outgoing events."],
    v: "Open a watch on a prefix, perform a hundred writes including deletes, break the connection midway and resume from the last seen revision. Confirm the combined events equal the writes exactly once, in order.",
    dep: ["key-index","event-fanout","apply-loop"]
  },
  "watch-progress": {
    s: "Periodic or requested notifications telling a watcher that it has seen everything up to a given revision even when no matching key changed.",
    d: "On a quiet prefix a watcher cannot tell whether nothing happened or the stream stalled. A progress notification carries the revision up to which the member has delivered every event, so the client can advance its resume point and detect staleness. Servers send them on a timer or on request. They matter for resuming after compaction: a client holding an old revision on an idle prefix would otherwise fall behind the compaction point and be forced to relist. The challenge is cost and meaning, since a progress revision from a lagging member only proves that member's progress.",
    k: ["Periodic automatic notifications vs on-demand only: periodic keeps resume points fresh at the cost of constant background traffic per stream.", "Progress from any member vs confirmed by the leader: any member is cheap but may be behind, while confirmation costs a round trip."],
    p: ["A watcher on an idle prefix keeps a resume revision so old that compaction removes it and forces a full relist.", "Treating progress from a partitioned member as proof the cluster has no newer changes."],
    v: "Watch a prefix with no writes while the rest of the keyspace changes, and confirm progress notifications arrive carrying advancing revisions so the client's resume point stays ahead of the compaction point.",
    dep: ["watch-streams","revision-counter"]
  },
  "watch-resume": {
    s: "How a client continues a watch after a disconnect, and what happens when the requested start revision has already been compacted away.",
    d: "On reconnect the client reopens its watch at the revision after the last event it processed. If that history still exists, delivery continues with no loss. If compaction removed it, the server responds with the compact revision and the client must relist the range to rebuild its view and watch from the new revision. This is the guarantee that makes watch-driven caches safe. The hard cases are slow recovery, where an outage outlasts retained history, and the cost of mass relisting when many clients fall behind together.",
    k: ["Retain more history vs compact aggressively: longer retention lets clients ride out longer outages, but grows storage and slows index operations.", "Error and relist vs buffer on the server: explicit errors keep the server stateless about clients, but push a rebuild onto every lagging client."],
    p: ["Clients that ignore the compaction error keep waiting on a revision that will never be delivered.", "An outage long enough to exceed retention makes every client relist at once and overload the cluster."],
    v: "Pause a watching client, write past the compaction point, and resume it. Confirm it receives the compaction error with the compact revision, relists, and ends with a view equal to the current keyspace.",
    dep: ["watch-streams","revision-compaction","range-reads"]
  },
  "event-fanout": {
    s: "The server component that turns each applied write into events for every matching watcher, buffering for slow consumers and deciding when to give up on them.",
    d: "After the state machine applies a write, it matches the changed key against registered watchers, often indexed by key and by range, and queues an event per watcher. Watchers that keep up are served directly from new events. Slow ones are moved to a catch-up group that reads from stored history instead. Buffers are bounded per stream. It is hard because a single write can fan out to many watchers, so work scales with watchers rather than writes, and one slow consumer must not be allowed to consume unbounded memory.",
    k: ["Synchronous delivery in the apply path vs asynchronous queues: synchronous is simple and ordered, but a slow consumer would stall the apply loop; queues isolate it at a memory cost.", "Drop slow watchers vs buffer indefinitely: dropping protects the server, but forces those clients to resume or relist."],
    p: ["A slow watcher with an unbounded buffer grows memory until the member is killed.", "A hot key watched by thousands of clients turns each update into a burst of outgoing traffic that delays heartbeats."],
    v: "Attach one deliberately slow watcher and a fast one to a hot prefix under write load, and confirm the fast one stays current, memory stays bounded, and the slow one is moved to catch-up or closed with an error.",
    dep: ["apply-loop","key-index","backend-store"]
  },
  "lease-manager": {
    s: "The component that creates leases with a time to live, tracks their deadlines, attaches keys to them and decides when they expire.",
    d: "A client requests a lease with a TTL and receives an identifier; writes can then name that lease, tying the key's lifetime to it. The leader tracks deadlines in a priority structure and, when one passes, proposes a revoke through the log so every member deletes the attached keys at the same logical point. Expiry decisions are made only by the leader, never locally by followers, which keeps the state machine deterministic. It is hard because time is involved: the leader's clock, leader changes that must give leases a fresh grace period, and clients that believe time passes differently.",
    k: ["Leader decides expiry and logs a revoke vs each member expires locally: logging keeps state identical on every member, but makes expiry depend on a working leader.", "Reset all lease timers on leader change vs preserve remaining time: resetting is safe against skew and slow elections, but lets dead clients linger a bit longer."],
    p: ["A new leader that keeps old deadlines revokes healthy leases because the election took most of their TTL.", "A leader with a stalled clock never expires leases and keys stay locked long after their owners died."],
    v: "Create a lease with a five second TTL attached to a key, stop renewing it, and confirm the key is deleted on all members at the same revision within a bounded delay after the TTL.",
    dep: ["replicated-state-machine","lease-expiry","ephemeral-keys","clock-assumptions"]
  },
  "ephemeral-keys": {
    s: "Keys attached to a lease so that they are deleted automatically when the lease expires or is revoked, which ties data to a client's liveness.",
    d: "A write that names a lease records the association in the store. When the lease ends, the state machine deletes every attached key in one revision, producing delete events for watchers. Clients use this for locks, registrations and membership. A key can be re-attached or detached, and one lease may cover many keys, so one keepalive protects a whole set. It is hard because deletion is eventual relative to the client's failure: the key exists until the TTL passes, and a client that has lost contact cannot tell whether its keys are still there.",
    k: ["Many keys per lease vs one lease per key: sharing reduces keepalive traffic and makes cleanup atomic, but couples the keys' fates together.", "Ephemeral by lease vs ephemeral by connection: leases survive reconnects and brief blips, but delay cleanup by the TTL."],
    p: ["A client that disconnects briefly does not know whether its leased keys survived, and may act on a lock it has lost.", "Attaching a key to a lease that expires a moment later silently deletes it right after creation."],
    v: "Write three keys under one lease, expire the lease, and confirm all three disappear in a single revision and a watcher receives three delete events carrying that same revision.",
    dep: ["lease-manager","key-index","backend-store"]
  },
  "lease-keepalive": {
    s: "The client stream that periodically refreshes a lease, resetting its deadline on the leader so the lease stays alive while the client does.",
    d: "The client library opens a keepalive stream and sends a refresh at a fraction of the TTL. The leader resets the deadline in its in-memory table, without writing to the log on each renewal, which keeps renewals cheap. A refresh reaching a follower is forwarded to the leader. The reply returns the remaining TTL. The difficulty is that refreshes are not replicated, so a leader change forgets precise deadlines, which is why new leaders extend them, and a client with a long garbage collection or scheduling pause can miss its window.",
    k: ["Renewals kept off the log vs replicated: off-log renewals scale to many leases, but deadline state is lost on failover and must be re-granted.", "Refresh at a third of TTL vs closer to expiry: frequent refresh tolerates a couple of lost messages, but adds steady load per lease."],
    p: ["A process paused longer than the TTL loses its lease with no warning and resumes believing it holds locks.", "Thousands of clients with short TTLs generate constant keepalive traffic that crowds out real requests."],
    v: "Run a client with a ten second TTL, drop its network for fifteen seconds, and confirm the lease expires. Repeat with a five second drop and confirm the lease survives and keys remain.",
    dep: ["lease-manager","request-router","connection-health"]
  },
  "lease-expiry": {
    s: "The process by which an overdue lease is revoked through the log, deleting its attached keys and notifying watchers at one consistent revision.",
    d: "The leader scans its deadline structure, and for each expired lease proposes a revoke command. Once committed, every member applies it, removing the lease and deleting its keys within a single revision. Batching expirations avoids flooding the log when many leases lapse together, such as after a partition heals. Revocation can also be requested explicitly. The hard part is bursts: a network event can expire thousands of leases at once, creating a spike of deletes and watch events, and the revoke path must not starve ordinary writes.",
    k: ["Rate-limit expirations per interval vs revoke all at once: limiting protects ordinary traffic, but leaves dead leases and their keys in place a little longer.", "Check expiry only on the leader vs also verify on apply: leader-only is deterministic, but a deposed leader must be unable to commit a stale revoke."],
    p: ["A long partition expires every lease at once, and the resulting deletes and notifications spike load right at recovery.", "Revoking in the apply path without batching holds the apply loop for a long time."],
    v: "Create ten thousand leases with a short TTL, stop all keepalives and confirm every lease and attached key is gone within the TTL plus a bounded drain time, with ordinary writes still completing meanwhile.",
    dep: ["lease-manager","apply-loop","log-replication"]
  },
  "replicated-state-machine": {
    s: "The idea and the component: a deterministic store that applies the same committed commands in the same order on every member, so all copies hold identical data.",
    d: "The consensus layer produces an ordered log of committed entries. The state machine consumes them, one at a time, and updates its data, and each member does so independently. Because the logic is deterministic and the input identical, state converges without exchanging data. Entries include writes, transactions, lease operations and configuration changes. The hard rules are about determinism: no wall clock, randomness, map iteration order, floating-point differences or local environment may influence the result, and any bug that breaks this makes members silently disagree.",
    k: ["Deterministic logic on every member vs leader computes and ships results: deterministic replay keeps messages small and results verifiable, but any nondeterminism becomes a divergence bug.", "Entire state in one machine vs several sharded: one machine is simple and gives global order, but caps capacity at one node's disk and apply speed."],
    p: ["A command whose result depends on the member's local clock makes members hold different data that nobody notices until read.", "A software upgrade that changes apply logic mid-log applies old entries differently on upgraded members."],
    v: "Apply a recorded log of one million entries on three fresh members and compare a hash of the full state at the same revision. All three must be identical, and must match after a mid-run restart of one.",
    dep: ["apply-loop","commit-index","revision-counter","backend-store"]
  },
  "apply-loop": {
    s: "The single sequential loop that takes committed entries off the log and executes them against the store in order, advancing the applied index.",
    d: "A dedicated thread or task reads the next committed entry, decodes it, validates it against current state, executes it, records results for waiting requests and persists progress. Sequential execution is what gives atomic transactions and a total order without locks. Reads at a given revision wait for the applied index to reach it. Because it is single-threaded, its speed bounds write throughput, and anything slow inside it, such as a huge transaction or heavy expiration, delays every later entry and every linearizable read waiting behind it.",
    k: ["Single sequential apply vs parallel apply of independent keys: sequential keeps semantics trivial and deterministic, but caps throughput at one core and one disk path.", "Apply asynchronously after commit vs inside the commit path: asynchronous apply lets replication proceed while applying lags, but reads must wait for catch-up."],
    p: ["One slow command in the loop delays every queued write and linearizable read behind it.", "Applying an entry and recording progress non-atomically replays or skips it after a crash."],
    v: "Under steady write load, compare the commit index with the applied index on each member and confirm the gap stays small and returns to zero when load stops, with apply latency visible in metrics.",
    dep: ["commit-index","key-index","backend-store","revision-counter"]
  },
  "revision-counter": {
    s: "A global, strictly increasing number incremented by every write, which names each version of the store and orders all changes.",
    d: "Every committed write transaction produces one new revision, and each key records the revision where it was created and last modified along with a per-key version count. Reads and watches can name a revision, and the number acts as a total order for clients, a basis for fencing tokens and a resume point for watches. Because it is derived only from applying the log, it is identical on every member. It does not advance on reads. The subtlety is that compaction removes old revisions but the counter never goes backward, even after restore from a snapshot.",
    k: ["One global revision vs per-key versions only: a global revision gives a consistent cross-key snapshot and a single resume point, but serializes all writes through one counter.", "Revision per transaction vs per operation: per transaction keeps multi-key writes atomic in history, at the cost of several keys sharing one revision."],
    p: ["Restoring from a backup into a new cluster resets the counter and invalidates tokens and watch positions held by clients.", "Assuming revisions are gap-free leads to bugs, as lease and compaction operations also consume them."],
    v: "Perform a mixed sequence of writes, transactions and deletes and confirm the returned revisions strictly increase, that every member reports the same revision, and that reads at each recorded revision return the matching historical data.",
    dep: ["apply-loop","key-index"]
  },
  "key-index": {
    s: "An in-memory ordered index mapping each key to the list of revisions at which it was created, modified or deleted, used to resolve reads at any revision.",
    d: "For each key the index stores generations of revisions, where a delete ends a generation and a later write starts a new one. A read at revision R finds the newest entry not above R and then fetches the value from the backend by that revision. The index is ordered by key to serve ranges and prefixes. It lives in memory for speed, so it is rebuilt from the backend on start, and it grows with the number of keys and retained revisions. Compaction trims it, which is why memory use tracks history as well as live data.",
    k: ["Index in memory vs on disk: memory gives fast range reads and watch matching, but bounds the key count by RAM and lengthens restart as the index is rebuilt.", "Keep full history until compaction vs only latest: full history supports consistent reads and watch resume, at the cost of memory and storage."],
    p: ["Writing the same key at high frequency without compaction grows the index far beyond the live key count.", "Restart time becomes minutes on a large store because the whole index is rebuilt before serving."],
    v: "Write one key ten thousand times, read it at several old revisions, then compact and confirm older reads fail with a compaction error while the latest read and the index size both reflect the trimmed history.",
    dep: ["revision-counter","backend-store"]
  },
  "backend-store": {
    s: "The on-disk transactional store holding every retained revision of every key, indexed by revision, written in batches and mapped for fast reads.",
    d: "Values are stored under a key composed of the revision, so writes append in increasing order and reads fetch by revision after consulting the key index. The engine groups many applied entries into one disk transaction that commits periodically, rather than syncing per entry, because the replicated log already provides durability. It also stores metadata such as the applied index and lease records. The challenge is that storage only reclaims space after compaction plus defragmentation, and the committed-batch timing must stay consistent with what the log can replay on restart.",
    k: ["Batched backend commits vs commit per entry: batching gives much higher write throughput, but means backend state trails the log and recovery must replay the gap.", "Single file with memory mapping vs layered log-structured engine: a mapped file gives simple, fast reads, but grows by file-level fragmentation and needs explicit reclamation."],
    p: ["A backend that committed more than the log it relies on can apply entries twice or skip them after a crash.", "Deleted and compacted data keeps occupying disk until defragmentation, so the file stays large and hits the quota."],
    v: "Write a large dataset, kill the process mid-batch, restart, and confirm the store recovers to a state consistent with the log: applied index matches, no entry is duplicated, and every acknowledged write is present.",
    dep: ["apply-loop","write-ahead-log"]
  },
  "revision-compaction": {
    s: "Discarding old revisions below a chosen revision while keeping the latest version of each key, so history and storage stay bounded.",
    d: "A compaction request names a revision. The index drops older generations and the backend deletes values no longer reachable at or after it, in the background in small batches to avoid long pauses. Reads or watches below the compact revision fail with an error. Compaction can be requested by hand, scheduled by age or by revision count. The difficulty is that it frees logical rather than physical space, competes with foreground work and sets how long clients may be offline before they must relist.",
    k: ["Periodic automatic compaction vs manual: automatic prevents unbounded growth by default, but may remove history a slow client still needs.", "Compact to the latest revision vs retain a window: a retained window supports resume and debugging, at the cost of larger stores."],
    p: ["Never compacting a heavily updated keyspace fills the quota and triggers a cluster-wide write alarm.", "Compacting right up to the latest revision breaks every watcher that was briefly disconnected."],
    v: "Write many revisions, compact to a midpoint, and confirm reads below it return a compaction error, reads above it succeed, and the backend's logical size drops while the latest values stay intact.",
    dep: ["key-index","backend-store","watch-resume"]
  },
  "defragmentation": {
    s: "Rewriting the backend store to give back free space left by compaction and deletes to the file system, an expensive maintenance operation run one member at a time.",
    d: "After compaction the store file holds free pages internally but does not shrink. Defragmentation writes the live data into a fresh file and swaps it in, reducing size and often improving read speed. During the operation the member typically blocks reads and writes while it runs, so it is applied member by member with the leader last. It matters because quota is measured against the physical size. The risk is stalls: a long defragmentation on a large store looks like a failure to peers and clients.",
    k: ["Defragment online per member vs offline rebuild: online keeps the cluster serving through the quorum, but each member stalls while processing.", "Automatic vs operator-triggered: automatic keeps space under control without attention, but may run at a bad moment on a busy cluster."],
    p: ["Defragmenting the leader first causes an election and write stall during the busiest member's maintenance window.", "Running it on all members at once removes the quorum for the duration."],
    v: "Fill the store, delete most of it, compact, then defragment members one at a time while a client writes. Confirm the file size on each member drops and that writes continue to succeed throughout.",
    dep: ["backend-store","revision-compaction","quota-limits"]
  },
  "state-hash-check": {
    s: "Periodic comparison of a hash of each member's data at a given revision to detect silent divergence caused by bugs or disk corruption.",
    d: "At a chosen revision each member computes a hash over its stored data, and the leader or an operator tool compares them. A mismatch means one member's state differs, which consensus alone cannot detect because the log may be identical while the stored state is not. Checks run at startup and periodically, and a member found divergent raises an alarm and can be removed and rebuilt from a healthy snapshot. It is hard because hashing a large store is costly, and the comparison must be done at exactly the same revision on every member.",
    k: ["Continuous periodic hashing vs only on demand: continuous finds corruption early, but adds I/O and CPU load on large stores.", "Alarm and stop serving vs only alert: stopping a divergent member prevents wrong answers, but reduces redundancy during an incident."],
    p: ["A corrupted member keeps answering reads with wrong data for months because nothing compares state across members.", "Comparing hashes at different revisions reports false divergence."],
    v: "Corrupt one value in one member's backend file offline, restart it, run the consistency check, and confirm it reports a hash mismatch at that revision and raises an alarm naming the member.",
    dep: ["backend-store","revision-counter","monitoring-metrics"]
  },
  "leader-election": {
    s: "The procedure by which members choose one leader: a member whose timer fires becomes a candidate, requests votes from the others and leads if a majority grants them.",
    d: "A follower that hears nothing from a leader within its election timeout increments its term, votes for itself and asks the rest for votes. Each member grants at most one vote per term, and only to a candidate whose log is at least as up to date as its own. A candidate that gathers a majority becomes leader and immediately sends heartbeats to assert authority. If votes split, the term ends without a leader and randomized timers make a repeat unlikely. It is hard because correctness (one leader per term) and liveness (some leader eventually) rest on different mechanisms.",
    k: ["Randomized timeouts vs deterministic ordering of candidates: randomization avoids repeated split votes without coordination, but gives no bound on how long an election can take.", "Elect any member vs prefer the best-placed: any-member election is simple and safe, but may pick a slow or distant leader."],
    p: ["Identical timeout values on all members cause repeated split votes and long unavailability after a leader failure.", "A candidate with a stale log winning because the vote check compares only terms."],
    v: "Kill the leader in a five-member cluster a hundred times and confirm a new leader emerges every time, with at most one leader per term in all logs and a median election time near the timeout.",
    dep: ["terms-epochs","vote-rules","election-timeouts","hard-state"]
  },
  "terms-epochs": {
    s: "A monotonically increasing number that identifies a period of leadership, letting every member discard messages from older leaders and detect that it is outdated.",
    d: "Every message carries the sender's term. A member seeing a higher term adopts it and becomes a follower; one seeing a lower term rejects the message and replies with its own. Each term has at most one leader, and terms act as a logical clock that orders leaderships independent of real time. The current term and the vote cast in it are persisted before replying. It is hard because forgetting a term or vote across a crash lets a member vote twice in the same term and break the single-leader guarantee.",
    k: ["Persist term and vote before responding vs lazily: persisting first is required for safety, but forces a disk sync on each election step.", "Terms advance on every election attempt vs only on success: advancing on attempt keeps terms strictly ahead, but lets a disruptive member inflate terms."],
    p: ["A member that restarts without its persisted vote votes again in the same term and enables two leaders.", "A partitioned member's inflated term forces a healthy leader to step down on reconnect."],
    v: "Restart a member immediately after it votes, have a second candidate request its vote in the same term, and confirm it refuses because the persisted vote survived the crash.",
    dep: ["hard-state","vote-rules"]
  },
  "vote-rules": {
    s: "The conditions under which a member grants its vote: not yet voted this term and the candidate's log is at least as up to date as its own.",
    d: "A voter compares the candidate's last log term and index with its own. A later last term wins; with equal terms, the longer log wins. This rule guarantees the elected leader already holds every committed entry, because a committed entry exists on a majority and any winning majority overlaps it. A voter also refuses when it has heard from a current leader recently, to resist disruption. It is hard because subtle variations, such as comparing only the index or ignoring uncommitted entries, break safety in ways that rare interleavings expose.",
    k: ["Compare last term then index vs index alone: term-first comparison preserves the guarantee that leaders hold all committed entries; index-only is simpler and unsafe.", "Refuse votes while a leader is recent vs grant freely: refusing resists disruptive candidates, but delays elections if the leader is gone and timers disagree."],
    p: ["A comparison that ignores the term lets a member with a long stale log win and truncate committed entries.", "Granting votes while a healthy leader exists lets a flaky member depose it repeatedly."],
    v: "Construct logs where one member has a longer log of an older term and another a shorter log of a newer term. Confirm the voter grants its vote only to the latter, across thousands of randomized runs.",
    dep: ["terms-epochs","log-matching","write-ahead-log"]
  },
  "pre-vote": {
    s: "A trial election round in which a would-be candidate asks whether it could win before incrementing its term, so partitioned members do not disrupt a healthy cluster.",
    d: "Before becoming a candidate, a member sends pre-vote requests carrying the term it would use, without changing any state. Peers answer yes only if the candidate's log is current and they have not heard from a leader recently. Only on a majority of yes answers does it increment its term and run a real election. A member isolated from the cluster therefore fails pre-vote and keeps its old term, instead of returning with a huge term that forces the leader to step down. The cost is an extra round on real elections, and care that pre-vote responses never persist state.",
    k: ["Pre-vote before real elections vs direct elections: pre-vote prevents term inflation from partitioned members, but adds one round trip to every legitimate election.", "Pre-vote granted only when no recent leader vs always on log check: the recency check blocks disruption but can delay recovery when the leader just failed."],
    p: ["Without pre-vote, a member with a flaky link repeatedly forces elections each time it reconnects.", "Letting a pre-vote response alter the voter's term or vote state reintroduces the disruption it was meant to prevent."],
    v: "Isolate one member for several election timeouts, then reconnect it. Confirm the leader and term are unchanged and no election occurs, whereas with pre-vote disabled the same test forces a leadership change.",
    dep: ["leader-election","vote-rules","election-timeouts"]
  },
  "check-quorum": {
    s: "A rule that a leader steps down if it has not heard from a majority within an election timeout, so a partitioned leader stops claiming leadership.",
    d: "The leader tracks when each follower last responded. Periodically it counts how many, itself included, replied within the window, and if that is not a majority it becomes a follower. This makes the minority side of a partition give up quickly, so clients fail over instead of waiting on a leader that can never commit. It also underlies lease reads, which rely on the leader knowing it still has authority. The tension is false positives: a brief stall in the leader process can trip it, and the rule must interact correctly with pre-vote so that followers also reject votes while a leader is live.",
    k: ["Step down on lost quorum vs keep leading until deposed: stepping down gives fast, clear failure for clients, but a short pause can cause an unnecessary leadership change.", "Window equal to election timeout vs shorter: matching the timeout avoids flapping, but a deposed leader keeps accepting proposals for that long."],
    p: ["A leader isolated from a majority keeps accepting writes that can never commit and clients wait on it until their deadline.", "Check-quorum without matching follower-side vote refusal lets a new election disrupt a leader that just recovered."],
    v: "Cut the leader off from both followers in a three-member cluster and confirm it steps down within one election timeout, rejects reads and writes with a no-leader error, and the majority elects a replacement.",
    dep: ["heartbeats","leader-election","election-timeouts"]
  },
  "heartbeats": {
    s: "Small periodic messages from the leader to every follower that assert its authority, reset election timers and carry the commit index.",
    d: "At an interval much shorter than the election timeout, the leader sends an append message, possibly empty, to each follower. A follower that receives one from a current-term leader resets its timer and updates its commit knowledge. Followers reply, giving the leader a measure of who is reachable for check-quorum and read confirmation. The interval trades detection speed against traffic and CPU. The hard part is that heartbeats share the path with heavy replication: a slow disk or a saturated link delays them and can trigger needless elections.",
    k: ["Heartbeat interval a fraction of the election timeout vs closer to it: a fraction tolerates lost or delayed beats, but costs steady traffic and wakeups on idle clusters.", "Separate heartbeat path from data replication vs shared: separation keeps heartbeats timely under load, but adds connections and code."],
    p: ["A heartbeat queued behind a large snapshot or batch arrives late and followers start an election against a healthy leader.", "An interval set longer than the election timeout makes followers constantly challenge the leader."],
    v: "Under heavy write load, record heartbeat send and receive times on each follower and confirm the gap stays below a third of the election timeout and that no election occurs over a ten minute run.",
    dep: ["election-timeouts","peer-streams","commit-index"]
  },
  "election-timeouts": {
    s: "The randomized waiting period after which a follower assumes the leader is gone and starts an election, tuned to network and disk latency.",
    d: "Each follower picks a timeout at random from a range, restarting it on every valid heartbeat. The lower bound must exceed several heartbeat intervals plus worst-case round trip and disk sync time, or healthy leaders are challenged; the randomization window must be wide enough that two followers rarely expire together. Short timeouts mean fast failover but more false elections, and long ones the reverse. Settings must be consistent across members and across regions. It is hard because latency changes with load, deployment topology and disk behavior.",
    k: ["Short timeout for fast failover vs long for stability: short suits a fast local network, but triggers needless elections whenever the leader or disk stalls.", "Wide random range vs narrow: a wide range avoids split votes, but lengthens the average time to detect a failure."],
    p: ["A timeout copied from a single-datacenter cluster causes constant elections after the cluster stretches across regions.", "Disk sync stalls longer than the timeout make a healthy leader look dead to its followers."],
    v: "Measure leader unavailability across fifty induced failures and confirm it falls between the configured timeout and the timeout plus an election round, while a sixty-minute idle soak shows zero elections.",
    dep: ["heartbeats","hard-state"]
  },
  "leadership-transfer": {
    s: "A controlled handoff in which the leader brings a chosen follower fully up to date and tells it to start an election immediately, avoiding a timeout wait.",
    d: "The leader stops accepting new proposals, replicates until the target's log matches its own, then sends a message prompting the target to campaign at once, bypassing the usual vote-refusal and timeout rules. Operators use it before maintenance, upgrades and when moving leadership to a better-placed machine. If the handoff does not complete within a deadline, the leader resumes. It is hard because there is a window where no leader accepts writes, and the target may be unreachable or slow, so the handoff needs a timeout and a clean abort.",
    k: ["Controlled transfer vs just stopping the leader: transfer shrinks unavailability to one round trip, but needs a healthy, current target and the right ordering.", "Pause writes during transfer vs continue: pausing guarantees the target catches up, at the cost of a brief write stall."],
    p: ["Transferring to a lagging follower stalls writes until it catches up, or fails and leaves the cluster briefly leaderless.", "Restarting the leader for maintenance without a transfer costs a full election timeout of unavailability."],
    v: "Request a transfer to a named member under write load and confirm that member becomes leader within a fraction of the election timeout, with no acknowledged write lost and client errors limited to a brief retry window.",
    dep: ["leader-election","log-replication","admin-api"]
  },
});
