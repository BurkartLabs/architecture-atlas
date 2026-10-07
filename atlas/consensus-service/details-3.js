// Details for the consensus service plate, part 3: log replication, membership, log storage.
ATLAS.details("consensus-service", {
  "log-replication": {
    s: "The leader appends each client command to its log and sends it to every follower, which append it in turn and acknowledge, giving all members the same ordered sequence.",
    d: "Each entry carries a term and an index. The leader sends batches of entries along with the position of the entry just before them. A follower accepts only if its log matches at that position, appends, and replies with how far it matches. The leader tracks per-follower progress and retries or backs up on rejection. Replication is pipelined: later batches are sent before earlier ones are acknowledged. The hard parts are slow or unreachable followers, which must not hold back the majority, and keeping memory for unacknowledged entries bounded.",
    k: ["Pipelined sends vs stop-and-wait per follower: pipelining fills the network and raises throughput, but needs flow control and rollback when a send is rejected.", "Replicate to all members vs only to a quorum: sending to all keeps every member current and tolerates a slow one, at the cost of more bandwidth on the leader."],
    p: ["A single slow follower that the leader buffers for without limit consumes leader memory and eventually degrades the whole cluster.", "Assuming ordered delivery on the network lets a reordered batch corrupt a follower's log if the position check is skipped."],
    v: "Write ten thousand commands while delaying one follower, and confirm the other two stay current, the slow one eventually matches index for index, and leader memory for in-flight entries stays below its cap.",
    dep: ["log-matching","replication-flow-control","write-ahead-log","peer-streams"]
  },
  "log-matching": {
    s: "The property and the repair procedure ensuring that if two logs agree at one index and term, they agree on every entry before it, and diverging suffixes are overwritten.",
    d: "An append request names the index and term of the preceding entry. A follower that lacks that exact entry rejects the request, and the leader steps back, using hints about the conflict to jump quickly, until it finds the last agreeing entry. The follower then deletes everything after and takes the leader's entries. Because only the leader creates entries for a term and never changes them, agreement at one point implies agreement before it. It is hard because truncation must only ever remove uncommitted entries, and getting the conflict hint wrong makes repair slow or wrong.",
    k: ["Backoff by one entry vs jump using conflict hints: stepping one at a time is simple but slow after long divergence; hints repair in a round or two at the cost of extra fields.", "Truncate on conflict immediately vs wait for the leader's confirmation: immediate truncation converges quickly, but must never touch committed entries."],
    p: ["Truncating a log suffix that includes committed entries because the commit index was not consulted loses acknowledged data.", "A follower with a very divergent log takes thousands of round trips to repair when no conflict hint is used."],
    v: "Create divergent logs across three members by partitioning leaders in turn, heal the partition, and confirm all logs become identical, committed entries never change, and repair takes a bounded number of rounds.",
    dep: ["log-truncation","terms-epochs","write-ahead-log"]
  },
  "commit-index": {
    s: "The highest log index known to be stored on a majority; entries up to it are committed, durable across any future leader, and may be applied and acknowledged.",
    d: "The leader computes the median of the match indexes across the voting members, counting its own durable position, and advances the commit index to it. It only advances to entries of its own term; earlier entries commit implicitly once a later entry of the current term does. The new value is sent on subsequent messages so followers advance theirs and apply entries. Clients are answered once the entry is applied. The subtlety is that counting a leader's own un-synced entries, or advancing for an old-term entry, can both lose acknowledged data.",
    k: ["Advance only for current-term entries vs any majority-replicated entry: the restriction prevents a rare overwrite of an entry that looked committed, at the cost of old entries waiting for a new one.", "Followers learn commit via later messages vs dedicated notification: piggybacking is free, but followers apply entries one round late."],
    p: ["Advancing the commit index for an entry from an earlier term can let a later leader overwrite an acknowledged entry.", "Counting the leader's entries as durable before its own fsync completes acknowledges writes that a crash then loses."],
    v: "Run the safety scenario with a leader crashing between replicating an old-term entry to a majority and committing a new one, and confirm no acknowledged entry is ever missing from the eventual leader's log.",
    dep: ["log-replication","safety-argument","fsync-policy"]
  },
  "safety-argument": {
    s: "The reasoning that no committed entry can be lost: any future leader's vote majority overlaps the commit majority, and the vote rule ensures the winner holds every committed entry.",
    d: "The argument proceeds by induction on terms. An entry is committed when a majority stores it. Any later election needs a majority of votes, and two majorities share a member. That member holds the entry and refuses to vote for a candidate whose log is less complete, so the winner has the entry, and the leader only appends, never overwrites, its own log. Therefore all later leaders contain all committed entries. It is the foundation for everything above, and holds only if persisted state survives crashes, and membership changes preserve overlapping majorities.",
    k: ["Majority overlap as the safety basis vs flexible quorums: majority is easiest to reason about, but flexible schemes can trade write and election quorum sizes if their intersection is proven.", "Safety independent of timing vs relying on timing: safety that ignores clocks survives any delay or pause, while liveness still needs timing assumptions."],
    p: ["An optimization that skips persistence of votes or entries silently voids the argument that every proof depends on.", "Reasoning about a protocol variant by analogy, without re-checking the overlap and log-completeness steps, ships a safety bug."],
    v: "Check the protocol model exhaustively over small configurations with crashes, message loss and duplication, and confirm the invariants that committed entries persist in every future leader's log are never violated.",
    dep: ["vote-rules","commit-index","hard-state","protocol-model"]
  },
  "replication-flow-control": {
    s: "Limits on how much unacknowledged data the leader sends each follower, with probe and pipeline states that adapt to how reliably a follower keeps up.",
    d: "For each follower the leader keeps a state: probing, where it sends one message and waits to learn the match point, or replicating, where it streams batches within an in-flight window. Exceeding the window pauses sending; a rejection returns the follower to probing. Byte and entry-count caps limit message size. This keeps a slow or restarting follower from consuming the leader's memory and bandwidth. It is hard because the right window depends on round-trip time and entry size, and too small a window caps throughput while too large wastes memory on followers that are down.",
    k: ["Bounded in-flight window vs unbounded streaming: a window protects leader memory and fairness, but caps per-follower throughput by window divided by round trip.", "Probe state after any rejection vs resume streaming optimistically: probing recovers carefully from loss, but briefly slows replication to a follower that merely hiccuped."],
    p: ["A window sized for a local network throttles replication across a high-latency link to a fraction of capacity.", "A down follower never marked as such keeps filling the leader's send buffer with entries it will not read."],
    v: "Add 50 ms of latency to one follower and confirm its replication throughput matches window size divided by round-trip time, while the other followers and client write latency are unaffected.",
    dep: ["log-replication","peer-streams"]
  },
  "proposal-batching": {
    s: "Combining many client commands into one log append and one network round trip, so fixed per-message and per-sync costs are shared by many writes.",
    d: "The leader collects incoming proposals for a short interval or until a size cap, appends them as one batch, syncs the log once and sends them together. Followers likewise sync once per batch. Throughput rises sharply at modest latency cost because the disk sync and network round trip dominate. Batching happens at several points: the request queue, the log write, and the apply stage. It is hard because batch size and wait time form a trade-off that shifts with load, and an oversized batch delays heartbeats.",
    k: ["Adaptive batching on available work vs fixed time window: adaptive adds no latency when idle and batches under load, while a fixed window gives predictable batches but taxes quiet periods.", "Large batches vs small: large batches maximize throughput, but one batch holding a big entry can stall heartbeats and raise tail latency."],
    p: ["A fixed batching delay adds its full value to the latency of every write on an otherwise idle cluster.", "A huge batch occupies the disk long enough that heartbeats are late and an election fires."],
    v: "Sweep concurrent writers from one to a thousand and confirm throughput rises with concurrency while the number of fsyncs per write falls, and single-writer latency stays near one sync plus one round trip.",
    dep: ["log-replication","group-commit","apply-loop"]
  },
  "read-index": {
    s: "A linearizable read technique in which the leader notes its commit index, confirms leadership with a majority heartbeat, then serves the read once its state has applied that index.",
    d: "On a read request the leader records the current commit index as the read point, sends a round of heartbeats and waits for a majority to answer in the same term, proving it was still the leader after the request arrived. It then waits until its applied index reaches the read point and answers from local state. Followers can do the same by asking the leader for the read point. No log entry is written, so reads are cheap on disk, but each still costs a round trip, which batching across concurrent reads amortizes.",
    k: ["Read index vs reading through the log: read index avoids disk writes and log growth, but needs a confirmation round trip, which the log path also needs plus a sync.", "Follower-served reads via leader's read point vs leader-only: follower service spreads load, but adds a hop and depends on the follower applying quickly."],
    p: ["Skipping the confirmation round lets a deposed leader answer from stale state during a partition.", "Taking the read point from the applied index rather than the commit index misses writes that were committed but not yet applied."],
    v: "Partition the leader away from a majority, write through the new leader, then read from the old one. Confirm it refuses or forwards the read instead of returning the pre-partition value.",
    dep: ["commit-index","heartbeats","apply-loop"]
  },
  "leader-lease-reads": {
    s: "A faster linearizable read method in which the leader serves reads locally while it holds a time-bounded lease from the majority, with no per-read network round.",
    d: "After each successful round of heartbeats the leader considers itself authoritative for a lease period shorter than the election timeout, because no other member can win an election before then. Reads within that period are answered locally once applied up to the commit index. The saving is the confirmation round trip. The cost is a dependency on bounded clock drift: if the leader's clock runs slow or the process pauses, it may serve a read after a successor already exists. Many deployments therefore choose read index and accept the extra round.",
    k: ["Lease reads vs read index: leases give local-speed reads without extra messages, but are correct only if clock drift and pause lengths stay within assumed bounds.", "Lease shorter than the election timeout by a margin vs equal: a margin absorbs drift, but cuts the fraction of time reads can be served locally."],
    p: ["A leader paused by the runtime past its lease still answers reads from stale state when it resumes.", "Clock steps from time synchronization jump the lease backward or forward and break the bound."],
    v: "Inject a clock skew and a process pause at the leader exceeding the lease margin and confirm reads fail over or are rejected rather than returning stale data, while a no-fault run serves reads with no peer traffic.",
    dep: ["heartbeats","check-quorum","clock-assumptions"]
  },
  "cluster-configuration": {
    s: "The set of voting members, and learners if any, recorded in the replicated log itself and used to compute majorities for elections and commitment.",
    d: "A configuration lists member identifiers and addresses. It is a log entry like any other, taking effect when appended rather than committed, so the quorum rule changes at the same point on each member that holds it. Snapshots store the configuration in force at their index. Every member must evaluate majorities against the configuration relevant to a given log position. It is hard because members that disagree on who is in the cluster can each compute different majorities, and a lost or misapplied configuration can permanently split the cluster.",
    k: ["Configuration stored in the log vs external file or service: in-log configuration is ordered with data and survives recovery, but cannot be fixed by editing a file if the quorum is lost.", "Effective on append vs on commit: on append avoids a gap where no valid majority exists, but requires truncation to revert it correctly."],
    p: ["Restoring a member from an old snapshot whose configuration lacks recent changes makes it believe in a different cluster.", "Editing addresses by hand on one member while the log holds different ones causes members to dial the wrong peers."],
    v: "Read the configuration from every member after a series of additions and removals, and confirm all report the same membership at the same log index, including after restarting from a snapshot.",
    dep: ["write-ahead-log","snapshot-creation","quorum-sizing"]
  },
  "joint-consensus": {
    s: "A reconfiguration method that passes through a combined configuration requiring majorities of both the old and new member sets, allowing arbitrary changes in a safe two-step process.",
    d: "The leader proposes a transitional configuration containing both sets. While it is in force, decisions need a majority of the old set and a majority of the new one, so neither can act alone. Once that entry commits, the leader proposes the final new configuration, which commits under the new set alone. This permits replacing several members at once without a moment where two disjoint majorities could exist. It is hard because of the additional state, the need to handle leader failure mid-change, and the complexity of correctly counting votes under two rules.",
    k: ["Joint consensus vs single-server steps: joint handles any change atomically, but carries more machinery and subtler counting than one-at-a-time steps.", "Leader leaves configuration automatically vs on explicit request: automatic leaving finishes quickly, but gives operators less control over holding a transitional state."],
    p: ["A leader crash between the joint and final entries must be resumable by its successor or the cluster stays stuck in the joint state.", "Counting only the new set's majority during the joint phase allows two leaders."],
    v: "Replace three of five members in one change while writing continuously and killing the leader mid-change. Confirm the cluster ends in the final configuration, no acknowledged write is lost, and no two leaders exist in one term.",
    dep: ["cluster-configuration","commit-index","safety-argument"]
  },
  "single-server-changes": {
    s: "A simpler reconfiguration approach that adds or removes one voting member at a time, which is safe because any majority of the old set overlaps any majority of the new.",
    d: "When the membership differs by exactly one member, every majority of the old configuration intersects every majority of the new, so a single configuration entry suffices. Larger changes become a sequence of such steps, each completed before the next begins. It needs no transitional state. Careful rules remain: a new change must wait until the previous one commits, and a newly elected leader must commit an entry in its own term first. It is hard because skipping those waits recreates a subtle case in which overlapping majorities fail.",
    k: ["One member per change vs joint consensus: single steps are easy to implement and reason about, but replacing several members takes many sequential, slower steps.", "Allow a pending change to be superseded vs forbid: forbidding is safe and simple, but blocks recovery while a stuck change waits for a quorum that no longer exists."],
    p: ["Starting a second change before the first has committed can create majorities that do not overlap.", "A new leader proposing a change before committing any entry in its own term can lose it in a rare interleaving."],
    v: "Issue add and remove commands back to back and confirm the second is rejected or deferred until the first commits, and that during repeated leader crashes there is never an instant with two disjoint quorums.",
    dep: ["cluster-configuration","commit-index","learners"]
  },
  "learners": {
    s: "Non-voting members that receive the log and catch up without counting toward quorum, promoted to voters only once they are current.",
    d: "A new machine is added as a learner. It receives replicated entries or a snapshot like a follower but does not vote and does not count toward commitment, so a slow or failing newcomer cannot stall writes or elections. When its log is within a small lag of the leader's, an operator or automation promotes it through a configuration change. Learners are also used as read replicas and for staged migrations. The challenge is deciding when it is current enough, and limiting how many learners the leader feeds, since each adds replication load.",
    k: ["Add as learner then promote vs add directly as voter: staging avoids shrinking write availability while the newcomer catches up, but needs a second change and a catch-up criterion.", "Automatic promotion vs manual: automation speeds replacement, but can promote a member that is current only momentarily."],
    p: ["Adding a blank member straight as a voter makes it count toward quorum before it holds any data, risking write stalls.", "Promoting a learner that is still far behind forces commitment to wait on its catch-up."],
    v: "Add a new machine as a learner during write load, confirm commit latency is unchanged while it syncs, then promote it once its lag is small and confirm quorum size increases by one.",
    dep: ["snapshot-transfer","cluster-configuration","log-replication"]
  },
  "removal-safety": {
    s: "The checks preventing a removal or failure from destroying the majority: refusing a change that would drop below a safe quorum or remove a member not yet replaced.",
    d: "Before applying a removal, the cluster checks that the remaining voters can still form a majority of those currently reachable, so that a simultaneous failure does not strand it. Removed members are told to shut down, and are barred by cluster and member identifiers from rejoining with stale state. Without safeguards an operator removing a healthy member from a three-member cluster that already has one failed member loses the quorum. It is hard because the check relies on liveness information that may be out of date.",
    k: ["Strict reachability check on removal vs trust the operator: the check prevents the most common outage-causing mistake, but can block an urgent removal of a truly dead member.", "Removed member shuts itself down vs left running: self-shutdown prevents zombie members disturbing the cluster, but needs the member to learn of its removal."],
    p: ["Removing a healthy member while another is down leaves two of four voters and no quorum.", "A removed member that was offline during the change comes back and campaigns with an old configuration."],
    v: "In a three-member cluster with one member stopped, attempt to remove a second and confirm the request is refused. Then remove the stopped member and confirm the remaining two continue to serve.",
    dep: ["cluster-configuration","quorum-sizing","admin-api"]
  },
  "member-bootstrap": {
    s: "The first start of a cluster or a new member: establishing the cluster identifier and initial membership, or joining an existing cluster, without creating two separate clusters.",
    d: "A new cluster starts with a defined initial member list and a shared cluster token so every member derives the same identifier. A later joiner starts with an empty log and the existing cluster's identity, and learns the configuration from the leader. Discovery can use static lists or a name service. It is hard because a typo or reuse of old data can produce members that each form their own cluster, and restarting a member with an empty data directory under its old name makes it look like a new, empty replica of itself.",
    k: ["Static initial membership vs dynamic discovery: static lists are deterministic and auditable, but require editing on every machine; discovery is convenient but adds a dependency and a way to form the wrong cluster.", "Cluster identifier checks on every message vs trust the address: identifier checks stop cross-cluster contamination, at the cost of failing hard when configuration drifts."],
    p: ["Starting three nodes with different initial lists produces three one-member clusters that each look healthy.", "Wiping a member's data directory and restarting it under its old identity makes it vote with no memory of earlier votes."],
    v: "Bootstrap a three-member cluster from scratch, confirm all report the same identifier and leader, then start a stray member with a different token and confirm it is refused rather than joined.",
    dep: ["cluster-configuration","hard-state","peer-transport"]
  },
  "quorum-sizing": {
    s: "Choosing the number of voting members: a majority of n must be alive, so three tolerate one failure, five tolerate two, and even sizes add cost without adding tolerance.",
    d: "A cluster of n voters needs floor(n/2)+1 to commit, tolerating the loss of the rest. Odd sizes are preferred because four members tolerate one failure, the same as three, while needing more acknowledgments. Larger clusters tolerate more failures but every write must reach more members, so latency and leader load rise. Placement matters as much as count: five members split over two zones lose quorum with the failure of the larger zone. Most deployments use three or five.",
    k: ["Three members vs five: five survive two failures and tolerate maintenance during a failure, but cost more per write and in operations.", "Spread across zones vs co-locate: spreading survives a zone loss, but adds cross-zone latency to every commit."],
    p: ["Running an even number of members adds a failure point without raising fault tolerance.", "Placing three members in two zones with two in one means that zone's loss destroys the quorum."],
    v: "Stop members one at a time in three- and five-member clusters and confirm writes succeed until a majority is lost, then fail with no leader, matching floor of half plus one.",
    dep: ["cluster-configuration","partition-behavior"]
  },
  "write-ahead-log": {
    s: "The durable, append-only file sequence in which every log entry is written and synced before the member acknowledges it, and from which state is rebuilt after a crash.",
    d: "Entries are encoded with term, index and payload, appended to segment files and synced. The persisted log is what lets a restarted member rejoin with all it ever promised. Other protocol state, such as term and vote, is stored alongside. On restart the member reads segments in order, validates checksums, and replays entries after the latest snapshot. It is hard because acknowledgment before durability breaks safety, and everything about sync cost, torn writes and recovery from partial files follows from that single rule.",
    k: ["Dedicated log device vs shared with data: a dedicated device protects sync latency from other I/O, but costs hardware and can leave the data device as the bottleneck.", "Append-only segments vs in-place updates: appending is sequential, fast and easy to recover, but needs garbage collection of old segments."],
    p: ["Acknowledging before the sync returns means a power loss erases an acknowledged entry and breaks the majority guarantee.", "Placing the log on a disk shared with heavy background writes makes sync latency spike and triggers elections."],
    v: "Write entries, power-cycle or kill the machine at random points, restart, and confirm every entry that was acknowledged to a client is present in the recovered log and none is reordered.",
    dep: ["fsync-policy","entry-checksums","log-segments"]
  },
  "hard-state": {
    s: "The small set of protocol values that must survive restarts: current term, the vote cast in it and the commit index, saved before the member answers anyone.",
    d: "Term and vote are written and synced before replying to a vote request or acknowledging a higher term, because forgetting either would let the member vote twice in a term. The commit index is saved as a hint to speed recovery. This state is written far less often than entries, but each write has the same sync cost, and it is often combined with log appends in one sync. It is hard because ordering matters: a reply sent before the state is durable breaks the single-vote rule after a crash.",
    k: ["Sync hard state with every change vs batch with log writes: always syncing is simplest and safest, while combining it with the next log sync saves a disk operation.", "Store with the log vs a separate file: one place gives atomicity with the entries, but a separate file is easier to inspect and repair."],
    p: ["Replying to a vote request before the vote is on disk lets a crash produce a second vote in the same term.", "A corrupted hard state file read as empty makes a member rejoin as if it had never voted."],
    v: "Crash a member between granting a vote and restart, then request another vote in the same term and confirm it refuses. Inspect the file to confirm term and vote match what was granted.",
    dep: ["write-ahead-log","fsync-policy"]
  },
  "fsync-policy": {
    s: "When the log is forced to stable storage: before acknowledging a proposal, with batching across concurrent writes, and never skipped for safety-critical state.",
    d: "A write to a file reaches the device only on an explicit sync call; before that it sits in operating system and device caches. The policy is to sync before any acknowledgment that counts toward commitment, and the cost is the device's flush latency, typically hundreds of microseconds on fast flash and milliseconds on spinning disks. Batching several entries into one sync amortizes it. Turning sync off yields large speedups until a power loss. It is hard because some devices acknowledge flushes they have not done, which silently voids the guarantee.",
    k: ["Sync on every batch vs periodic sync: syncing before each acknowledgment is the only choice that is safe against simultaneous power loss, while periodic sync risks losing the last interval of acknowledged writes.", "Data sync only vs full metadata sync: data-only syncs are cheaper, but file size and directory changes must still be made durable."],
    p: ["Disabling sync for a benchmark and leaving it enabled in production risks losing acknowledged data on a rack power failure.", "A drive with a volatile write cache that ignores flush requests makes every sync a lie."],
    v: "Run a power-loss test with a reset switch under write load and confirm no acknowledged write is missing. Separately measure sync latency percentiles and confirm they appear in the monitoring metrics.",
    dep: ["write-ahead-log","group-commit","monitoring-metrics"]
  },
  "group-commit": {
    s: "Combining the log appends of many concurrent proposals into one sync, so the cost of flushing to disk is shared across all of them.",
    d: "While one sync is in progress, newly arriving entries accumulate in memory. When it finishes, they are written together and synced with one operation, and every proposal in the group is acknowledged afterward. This makes throughput scale with concurrency: the sync rate stays near the device limit while the write rate grows. The leader can overlap its own sync with sending entries to followers. It is hard because the batch boundary controls latency, tail behavior and fairness, and because an error on the shared sync affects every member of the group.",
    k: ["Natural batching on in-flight sync vs timed delay: natural batching adds no latency when idle and grows under load, while a delay raises throughput on slow disks at a latency cost.", "Leader syncs in parallel with replication vs sequentially: parallel hides one latency behind the other, but needs care so commit counts only durable entries."],
    p: ["A sync failure in a grouped write must fail every proposal in the group, or some are acknowledged without durability.", "Waiting for a fixed batch size on a quiet cluster leaves single writes stalled."],
    v: "Compare fsync calls to committed writes at one, ten and a hundred concurrent clients and confirm writes per sync rises proportionally, with throughput scaling while per-write latency stays near one sync.",
    dep: ["fsync-policy","proposal-batching","write-ahead-log"]
  },
  "log-segments": {
    s: "The log is split into fixed-size files so old ones can be deleted after compaction, new ones preallocated and recovery limited to the files that matter.",
    d: "When a segment reaches its size limit, a new one is created, ideally preallocated so appends do not extend the file and each sync stays cheap. The name carries the first index and term. After a snapshot, segments fully below it are deleted or archived. Recovery scans from the newest relevant segment forward. Choosing the size is a trade-off: small segments create many files and frequent rollovers, large ones delay reclamation. The hard parts are the crash windows around rollover and deletion.",
    k: ["Preallocated segments vs growing files: preallocation makes syncs cheaper and avoids fragmentation, but reserves disk and leaves an unused tail to detect on recovery.", "Large segments vs small: large segments cut rollover overhead, but keep old data on disk longer after compaction."],
    p: ["A crash during rollover can leave an empty or partially written new segment that recovery must recognize and ignore.", "Deleting segments before a snapshot covering them is durable loses entries a lagging follower still needs."],
    v: "Kill a member during segment rollover repeatedly, restart each time, and confirm it recovers the full log with no gap, then take a snapshot and confirm only fully covered segments are removed.",
    dep: ["write-ahead-log","compaction-triggers"]
  },
  "entry-checksums": {
    s: "A checksum on every log record so recovery can detect a partially written final entry, or later corruption, and stop or repair instead of replaying garbage.",
    d: "Each record is stored with a checksum over its content, often chained so a record's checksum covers the previous one. On recovery the reader validates records in order. A bad checksum on the last record usually means a torn write from a crash and the tail is discarded, since it was never acknowledged. A bad checksum in the middle indicates disk corruption, which is not recoverable locally; the member must refetch state from peers. It is hard to distinguish these two cases reliably, and to avoid treating real corruption as a benign torn tail.",
    k: ["Truncate at first bad record vs refuse to start: truncating recovers from torn tails automatically, but may mask corruption in the middle; refusing is safe but needs operator action.", "Chained checksums vs per-record: chaining detects missing or reordered records, but makes random repair harder."],
    p: ["Treating mid-log corruption as a torn tail silently discards acknowledged entries the member had promised to keep.", "A checksum that covers the payload but not the index and term lets a misplaced record pass."],
    v: "Truncate the final record mid-way and confirm the member restarts, drops only that record and catches up. Flip a byte in the middle of the log and confirm the member refuses to serve and reports corruption.",
    dep: ["write-ahead-log","crash-recovery"]
  },
  "log-truncation": {
    s: "Deleting the uncommitted tail of a follower's log when it conflicts with the leader's, done durably before new entries are appended in its place.",
    d: "When a follower's entry at some index has a different term than the leader's, everything from that index onward is removed and replaced. The deletion must be durable before the replacement is acknowledged, or a crash could resurrect conflicting entries. Truncation never reaches below the commit index, and never below a snapshot. Implementation options include rewriting the segment, marking a logical end or deleting whole segments plus a partial rewrite. It is hard because it is rare, difficult to test and sits on a path where a bug silently destroys committed data.",
    k: ["Physically truncate the file vs write a logical end marker: physical truncation keeps recovery simple, while a marker avoids rewriting but needs every reader to honor it.", "Fail loudly if asked to truncate below commit vs obey: refusing converts a catastrophic bug elsewhere into a visible stop."],
    p: ["An off-by-one in truncation removes a committed entry that a majority had acknowledged.", "Appending replacement entries before the truncation is synced allows old entries to reappear after a crash."],
    v: "Force a follower into a conflicting suffix, let the leader repair it, then crash and restart it. Confirm the recovered log equals the leader's and no entry at or below the commit index changed.",
    dep: ["write-ahead-log","log-matching","commit-index"]
  },
  "crash-recovery": {
    s: "The startup procedure that reloads the snapshot, replays the log after it, restores hard state and rebuilds in-memory structures before the member rejoins the cluster.",
    d: "On start the member loads the latest valid snapshot, reads the hard state, and scans the log segments after the snapshot, validating checksums. Committed entries are re-applied to the state machine, and the in-memory key index is rebuilt. Only then does it open its listeners and start timers, so it does not vote with incomplete state. Recovery time depends on log length since the last snapshot and index size. It is hard because every earlier crash window must be handled and recovery itself must be crash-safe.",
    k: ["Replay committed entries only vs entire log: replaying only committed entries keeps recovery short, but needs a trustworthy persisted commit index; replaying everything is simpler and slower.", "Serve only after full recovery vs early partial service: waiting is correct and simple, but lengthens the unavailable window of a restarting member."],
    p: ["Opening the peer port before recovery finishes lets a member vote with a log it has not fully loaded.", "A very long log between snapshots makes each restart take minutes and tempts operators to skip safety checks."],
    v: "Kill and restart a member holding a million-entry log at random points, and confirm each restart reaches the same applied index and state hash within the expected recovery time, then rejoins without a leader change.",
    dep: ["write-ahead-log","snapshot-install","apply-loop","hard-state"]
  },
});
