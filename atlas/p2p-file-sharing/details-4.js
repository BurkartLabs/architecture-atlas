// Details for the peer-to-peer file sharing plate, part 4: integrity, storage, foundation.
ATLAS.details("p2p-file-sharing", {
  "piece-verification": {
    s: "Hashes every completed piece and compares it with the metadata's hash before the piece is marked complete or announced to anyone.",
    d: "When the last block of a piece arrives, the piece is read from the write cache or disk, hashed and compared with the expected value. Only on a match is it marked complete, flushed as verified and announced with a have message. A mismatch discards the piece and triggers failure handling. Hashing runs off the network thread because it is CPU heavy at fast rates. Hard parts: ensuring that data is hashed exactly as it will be stored, and keeping a piece from being served before verification.",
    k: ["Verify every piece before sharing: no peer can be fed corrupt data from us, but it adds a delay and CPU cost before a piece becomes uploadable.", "Hash from memory versus rereading disk: avoids extra reads, but requires holding whole pieces in the cache until verified."],
    p: ["Marking a piece complete before the hash result returns lets other peers request unverified data.", "Hashing on the network thread freezes all connections during large pieces at high speed."],
    v: "Corrupt one byte of a received piece in a test peer; the client computes a mismatch, never announces that piece, and the final file's hash equals the source's.",
    dep: ["piece-hash-list", "hash-thread-pool", "write-cache"]
  },
  "hash-failure-handling": {
    s: "What the client does when a piece fails verification: discard it, return its blocks to the pool, record the failure and avoid the peers likely at fault.",
    d: "On failure, the piece's blocks are marked missing and requested again, preferably from different peers. Counters record the failure against the contributing peers. A transfer with repeated failures on one piece may reduce the number of peers per piece to isolate the cause. Persistent failures across all peers indicate a bad source or a local disk problem, so the client may pause and alert. The difficulty is cost, since each failure wastes a whole piece, and distinguishing a malicious peer from a faulty disk or memory on the local machine.",
    k: ["Rerequest the whole piece from other peers: simple and sure, but wastes the blocks that were good.", "Pause on repeated failures: protects against local hardware faults corrupting data, but stalls a transfer that is under attack by one peer."],
    p: ["Retrying the failed piece from the same peers repeats the same corruption.", "Treating local memory faults as peer faults bans innocent peers and still fails."],
    v: "Make a test peer corrupt every piece it sends; failures are counted, the pieces are fetched from other peers, and the transfer completes with matching hashes.",
    dep: ["piece-verification", "corrupt-peer-attribution", "piece-ownership", "alert-queue"]
  },
  "corrupt-peer-attribution": {
    s: "Finds which peer sent bad data after a piece fails, by tracking contributors and re-downloading with fewer or different ones.",
    d: "If a piece came entirely from one peer, that peer is at fault. If many contributed, the client re-requests the same blocks from other peers and compares the results: a block whose bytes differ from the earlier copy implicates its sender. Peers that repeatedly contribute to failures accumulate strikes. This is called smart banning. It needs the earlier blocks kept long enough to compare. Hard parts are memory for retained blocks and avoiding blame for a peer that merely relayed what it received.",
    k: ["Compare blocks on redownload: identifies the bad sender exactly, but needs retained data and extra downloads.", "Blame all contributors: no extra state, but bans many honest peers for one bad block."],
    p: ["A fast peer that supplies most blocks gets banned for another peer's single corrupt block.", "Not retaining the failed blocks makes comparison impossible and attribution guesswork."],
    v: "Feed a piece from three peers, one of which sends a bad block; after the failure and redownload only that peer gets a strike, and the other two continue uploading.",
    dep: ["piece-ownership", "hash-failure-handling", "peer-banning"]
  },
  "forced-recheck": {
    s: "A user-triggered or automatic rehash of existing files against the piece hashes to rebuild the record of which pieces are complete.",
    d: "The client reads every file in piece order, hashes each piece and sets the completed bits. It is used after files were copied or moved, when resume data is missing or distrusted, and after disk errors. It reads at disk speed and is paused or throttled during other work. Transfers in checking state do not exchange data. The hard parts are the time on large collections, partial files on disk that match some pieces, and interrupting a check safely without leaving the state wrong.",
    k: ["Full recheck versus trust resume data: certain correctness, but hours for terabytes of data.", "Check in the background at low priority: transfers keep running, but results arrive late and pieces may be requested again needlessly."],
    p: ["Running rechecks of many large transfers in parallel thrashes the disk and slows everything.", "Interrupting a recheck and restarting the client loses progress and starts over."],
    v: "Copy a completed download into place on another client and run a recheck; it reports 100 percent after hashing every piece. Overwrite a range of the file and confirm exactly the affected pieces are marked missing.",
    dep: ["piece-verification", "disk-io-pool", "storage-layout"]
  },
  "resume-data-validation": {
    s: "Cross-checks saved progress against the files actually on disk before trusting it, falling back to a recheck on any inconsistency.",
    d: "The saved state includes each file's size and modification time at the last save. On load the client compares them with the filesystem: a size mismatch, missing file or newer modification time means the claimed pieces might be wrong, and those pieces are rechecked or the whole transfer is. It also validates internal consistency of the record. The check is cheap compared with rehashing. Hard parts: timestamps that change under backups and file syncing, filesystems with coarse timestamps, and user edits such as replacing files with different content of equal size.",
    k: ["Trust unless metadata differs: instant starts, but content changed with unchanged size and time goes undetected.", "Always hash a sample: catches more problems, but costs reads at every start."],
    p: ["A sync tool touching files and updating times triggers a full recheck of a whole library at each start.", "Resuming after the user replaced a file with a same-size one serves wrong data until a peer's hash check catches it."],
    v: "Modify one file's contents after shutdown and restart; the client detects the mismatch, rechecks only that file's pieces and leaves the rest marked complete.",
    dep: ["session-persistence", "forced-recheck", "storage-layout"]
  },
  "hash-thread-pool": {
    s: "A pool of worker threads that compute piece hashes off the network path, sized to the machine's cores.",
    d: "Verification jobs queue to the pool, which reads pieces from the cache or disk and hashes them with optimized or hardware-assisted routines. Results come back as events. At gigabit speeds hashing consumes a core or more, so the pool must scale, and its queue must be bounded so that memory held by unverified pieces does not grow without limit. Hard part: backpressure, since if hashing falls behind, the client must slow its downloads rather than buffer pieces forever.",
    k: ["Dedicated pool versus hashing inline: network handling stays responsive, but hand-off adds latency and queueing state.", "Bounded queue with backpressure: bounded memory, but downloads pause when hashing is the bottleneck."],
    p: ["An unbounded queue of unverified pieces consumes all memory when the disk or CPU is slower than the network.", "Using every core for hashing starves the user's other applications."],
    v: "Download at line rate on a fast link while sampling CPU and memory; hash threads use a bounded share of cores, the queue length stays capped, and no network thread blocks.",
    dep: ["event-loop", "buffer-pool"]
  },
  "storage-layout": {
    s: "Maps each piece and block to file offsets on disk, handling multiple files, directory creation, name sanitization and platform path rules.",
    d: "The layer translates logical offsets into per-file reads and writes using the file layout. It creates directories and files on demand or up front, enforces that all paths stay below the save directory, and truncates over-long or illegal names for the host filesystem. It owns open file handles, usually in a cache with a limit since transfers can have thousands of files. Hard parts: handle limits, name collisions after sanitization, and exactness at piece and file boundaries.",
    k: ["Lazy file creation versus create all up front: no disk used for skipped files, but errors appear later during the download.", "Cache of open handles: avoids reopen cost, but limits and keeping files open block deleting or moving them on some systems."],
    p: ["Two distinct names that sanitize to the same name overwrite each other's data.", "Keeping thousands of handles open exhausts the descriptor budget."],
    v: "Download a transfer with long names, nested directories and files differing in case, and verify every file's path and content match the layout with nothing written outside the save directory.",
    dep: ["file-layout-mapping", "descriptor-budget"]
  },
  "preallocation": {
    s: "Reserves the full disk space for files before downloading, so space errors appear early and files are laid out contiguously.",
    d: "On start, the client asks the filesystem to extend each file to its final size, either by writing zeros, which is slow but certain, or through a reserve call that claims blocks without writing. Benefits are fail-fast on low space, less fragmentation and predictable layout. Costs are the time to write zeros and the loss of sparse savings for skipped files. Hard parts: filesystems differ in how they treat the call, and a preallocated file looks complete in size though most pieces are missing.",
    k: ["Preallocate versus grow on demand: errors early and less fragmentation, but it takes time and uses space for files that may never finish.", "Reserve call versus writing zeros: instant where supported, but silently falls back or lies on some filesystems."],
    p: ["Preallocation of many large transfers at once fills the disk and fails the later ones immediately.", "Tools that judge completeness by file size mistake a preallocated, mostly empty file for a finished one."],
    v: "Add a 50 gigabyte transfer to a volume with 40 gigabytes free; it fails immediately with a space error rather than partway through, and on success the file size equals the final size from the start.",
    dep: ["storage-layout", "disk-error-handling", "sparse-files"]
  },
  "sparse-files": {
    s: "Lets files be created at their full length with unwritten regions occupying no space, so partial downloads use only what has arrived.",
    d: "The client sets the length and writes blocks wherever they land, and the filesystem allocates blocks only for the written ranges. Skipped files and incomplete regions cost nothing. Reads of holes return zeros. Disadvantages are fragmentation as pieces arrive in random order, and filesystems that do not support holes, where creating the file writes zeros. Hard parts: detecting support, and the risk of a space error on write long after the download began, because space was not reserved.",
    k: ["Sparse growth versus preallocation: space used only for what has arrived, but writes can fail late and files fragment.", "Detect support by testing: correct on each filesystem, but the test costs a tiny file write at setup."],
    p: ["Starting many large sparse downloads that together exceed free space fails partway through, all at the same time.", "Copying a sparse file with a naive tool expands it to full size on the destination."],
    v: "Start a large transfer and check that on-disk usage equals only the received data while the apparent file size equals the final size, and unwritten ranges read as zeros.",
    dep: ["storage-layout", "preallocation"]
  },
  "write-cache": {
    s: "Buffers incoming blocks in memory and writes them to disk in larger, ordered batches, sparing the disk from many tiny random writes.",
    d: "Blocks arrive in random order from many peers. The cache holds them until a piece completes or memory pressure forces eviction, then flushes whole pieces, ideally sorted by file offset, through the disk pool. It also feeds verification so the piece need not be reread. Cache size trades memory for disk efficiency, and dirty data must be flushed at shutdown and checkpoints. Hard parts: bounding memory under a fast network and slow disk, and crash consistency between flushes and saved progress.",
    k: ["Whole-piece flushes versus write-through: far fewer and better ordered writes, but data is lost on a crash before a flush.", "Large cache versus small: higher write efficiency, but memory competes with the operating system's own cache."],
    p: ["A cache without a limit grows until the process is killed when the disk falls behind the network.", "Recording a piece as saved before its cached data is flushed resumes with missing data after a crash."],
    v: "Download at high speed to a slow disk; the cache stays within its cap, writes are issued as large ordered runs, and killing the process then restarting never marks unflushed pieces as complete.",
    dep: ["disk-io-pool", "buffer-pool", "piece-verification"]
  },
  "read-cache": {
    s: "Keeps recently or soon-to-be-needed pieces in memory so uploads to many peers do not each trigger a disk read.",
    d: "When a peer requests blocks the client reads from the cache or loads a larger region from disk. Because peers tend to request neighboring blocks of one piece, reading a whole piece or readahead range amortizes cost. Eviction favors pieces being served to several peers. For seeds with many peers the read cache dominates disk load. Hard parts: sizing alongside the operating system's cache so memory is not stored twice, and the randomness of requests that defeats readahead on rotating disks.",
    k: ["Read whole pieces on first request: one seek serves many blocks, but wastes work if only one block is wanted.", "Own cache versus rely on the operating system: control over what stays resident, but double buffering and extra copies."],
    p: ["Reading each 16 kilobyte block with its own random disk access limits a seed to a tiny fraction of its link.", "A cache sized to all memory causes paging for the rest of the system."],
    v: "Seed one piece to 50 peers and count disk reads; with the cache there is one read per piece rather than one per block, and upload rate stays at the limit.",
    dep: ["disk-io-pool", "buffer-pool"]
  },
  "disk-io-pool": {
    s: "Performs file reads, writes and hashing-related I/O on dedicated threads, so slow disks never block network handling.",
    d: "Requests from the cache and engine are queued as jobs and run by worker threads that issue blocking file calls, sorted by file and offset where useful. Completions return to the network thread as events. The queue's depth is a signal: if jobs back up, the engine slows requests and uploads. Differences between disk types matter, such as many parallel jobs helping flash storage and hurting rotating disks. Hard parts: bounding queued bytes, ordering of dependent operations, and surfacing errors to the right transfer.",
    k: ["Blocking I/O in threads versus asynchronous kernel I/O: portable and simple, but costs a thread per concurrent operation.", "Queue depth as backpressure: protects memory and keeps the network from outrunning the disk, but stalls downloads during disk hiccups."],
    p: ["Doing disk operations on the network thread freezes all connections during one slow write.", "Too many parallel jobs on a rotating disk causes seeking that lowers total throughput."],
    v: "Pause the disk for several seconds with a test tool; network connections stay alive and responsive, queue depth rises to its cap, request rate falls and everything recovers when the disk resumes.",
    dep: ["event-loop", "buffer-pool", "disk-error-handling"]
  },
  "incomplete-staging": {
    s: "Keeps unfinished downloads in a separate folder or under temporary names, moving them to the destination only when complete.",
    d: "Files being downloaded are stored in an incomplete location, often with a distinguishing suffix, so that other programs do not process half-written files. Completion triggers a move to the final folder. Staging can be on a fast disk with the destination on a large one. Hard parts: the move may cross volumes, so it is a slow copy during which seeding is paused, and the engine must find files at either location after a crash during the move.",
    k: ["Stage then move: other programs only see finished files, but a copy across volumes takes time and temporary space.", "Download in place with a suffix: no move step, but tools that watch the folder may still see files too early."],
    p: ["A crash during the final move leaves half the files in each location and a transfer that cannot find either.", "A watching program that processes files as they appear imports truncated files when no staging is used."],
    v: "Complete a transfer with staging on another volume; the destination contains no file until all are verified, the move finishes, and seeding resumes from the new path.",
    dep: ["storage-layout", "move-and-rename"]
  },
  "move-and-rename": {
    s: "Relocates a transfer's files to a new folder or changes names while keeping the transfer's state valid and seeding.",
    d: "The client pauses the transfer's I/O, closes handles, moves or renames files on disk (a cheap rename on the same volume, a copy and delete across volumes), updates the stored paths and resumes. It handles collisions, partial failures and the case where the user moves files outside the client and then points the transfer at the new place. Hard parts are atomicity, since failure midway leaves a mix, and reconciling states after external changes, which usually requires a recheck.",
    k: ["Rename within a volume versus copy across: instant and atomic, against slow and interruptible with duplicated space.", "Update path and verify afterward: robust to outside moves, but a recheck after every relocation is expensive."],
    p: ["Moving a transfer onto a name that exists overwrites the other file's data.", "Interrupted cross-volume moves leave two partial copies and confuse later rechecks."],
    v: "Move a seeding transfer to another folder from the interface; peers see only a brief pause, the files appear at the new path and uploads continue with correct data.",
    dep: ["storage-layout", "session-persistence"]
  },
  "disk-error-handling": {
    s: "Detects write and read failures such as full disks, permission errors and vanished volumes, and pauses affected transfers with a clear reason.",
    d: "Errors from the disk pool are classified: space exhaustion, permission denied, missing path, invalid name and low-level input and output errors. The client pauses the specific transfer, keeps its state and raises an alert, and may retry after the user acts or on a timer for removable volumes. A full disk should not lose data already downloaded. The challenge is not corrupting state: a failed write must not leave the piece marked complete, and a vanished drive must not make the client conclude that files were deleted and delete resume data.",
    k: ["Pause the transfer and keep state: nothing is lost and recovery is easy, but one bad volume can idle many transfers.", "Automatic retry for transient errors: self-heals on reattached drives, but can loop noisily on permanent problems."],
    p: ["Treating a disconnected drive as missing files and discarding progress forces a full redownload.", "Continuing to accept data after a failed write loses blocks that were acknowledged to peers."],
    v: "Fill the destination volume mid-download; the transfer pauses with a disk-full alert, no piece is marked complete without being written, and it resumes after space is freed.",
    dep: ["disk-io-pool", "alert-queue", "session-persistence"]
  },
  "event-loop": {
    s: "The central scheduler that waits on sockets and timers and dispatches readiness events to components, so a few threads can drive thousands of connections.",
    d: "A readiness mechanism of the operating system reports sockets that can be read or written, and a timer wheel or heap supplies deadlines for requests, choke rounds, announces and rate refills. Handlers run briefly and never block. Heavy work goes to the disk and hash pools, and results return as events. Hard parts: keeping handlers short so latency stays low, fair treatment of busy connections, and timers that stay accurate when the loop is saturated.",
    k: ["Single event-driven network thread versus a thread per connection: far less memory and no locking of connection state, but one slow handler stalls everything.", "Timer wheel versus a sorted heap: cheap insert and expiry for many timers, but granularity is coarse."],
    p: ["A handler that blocks on disk or a lookup freezes every connection.", "Processing all readable data of one busy socket before others starves the rest."],
    v: "Run with several thousand connections while measuring loop iteration time; it stays within a few milliseconds even when disk and hashing are saturated.",
    dep: ["buffer-pool"]
  },
  "buffer-pool": {
    s: "A pool of reusable fixed-size memory blocks for network receive and send and for cached piece data, avoiding allocation on the hot path.",
    d: "Block-sized buffers are taken from the pool for receive, filled by the socket, passed along to the cache and returned after the disk write. Because buffers are shared across stages, ownership is by reference count. A global cap bounds memory, and when it is reached, receive is paused. Hard parts: leaks of buffers that are never returned, fragmentation from many sizes, and the interaction of caps with the write and read caches that draw from the same pool.",
    k: ["Fixed-size pooled blocks versus allocating per message: no allocator cost or fragmentation, but small messages waste a whole block.", "Global cap with backpressure: memory use is bounded, but receive pauses can starve the connections."],
    p: ["A path that forgets to release a buffer slowly drains the pool until the client stops receiving data.", "Sharing one cap between receive and caches lets caches starve receive, or the other way round."],
    v: "Run a long transfer and graph pool use and process memory; both plateau at the configured cap, and every buffer returns to the pool when connections close.",
    dep: []
  },
  "descriptor-budget": {
    s: "Accounts for the operating system's limit on open files and sockets, shared between peer connections, file handles and listeners.",
    d: "Each connection and each open file consumes a descriptor, and the process limit is often modest by default. The client reads the limit at start, reserves some for listeners, the DHT and logs, and divides the rest between connections and cached file handles. Limits on connections and open files derive from it. When it is exhausted, accepts fail and files cannot be opened. Hard parts: raising the limit where permitted, systems with small limits and the fact that other libraries also consume descriptors.",
    k: ["Derive connection limits from the process limit: no surprises at runtime, but the effective limit may be lower than users set.", "Close the least recently used file handles first: keeps connections usable, but reopening costs time under heavy file access."],
    p: ["Setting a connection limit higher than the process limit makes accepts fail with an error that looks like a network fault.", "File handle caching for thousands of files consumes the budget and no new peers can connect."],
    v: "Start with a low process limit and a high configured connection limit; the client reports the reduced effective limit at start and never reaches an out-of-descriptors error under load.",
    dep: []
  },
  "state-store": {
    s: "Persists settings, session data, DHT tables, statistics and per-transfer records, atomically, in a form that survives crashes and upgrades.",
    d: "State lives in files or an embedded database in a user data directory. Writes go to a temporary file and then rename into place, or use transactions, so a crash never leaves a half-written record. Versioned formats allow upgrades and tolerate unknown fields. Saves happen on change batches and on shutdown. Hard parts: corruption handling, with a backup of the last good copy, concurrent writers from two instances of the client, and growth of the store with large queues.",
    k: ["Write temporary then rename: atomic on common filesystems, but costs a full rewrite per save for large files.", "Embedded database versus flat files: incremental updates and queries, but another component with its own failure modes."],
    p: ["Two instances sharing one data directory overwrite each other's state.", "Saving only at clean shutdown loses hours of progress and statistics after a crash."],
    v: "Kill the process during a save at random times, repeatedly; the next start always loads a complete, valid state, either the new or the previous version, never a partial one.",
    dep: []
  },
  "alert-queue": {
    s: "A bounded queue of events and log entries that components post and front ends read, separating reporting from the engine's hot paths.",
    d: "Components post typed alerts such as tracker errors, hash failures, completed pieces, listen failures and disk errors, optionally by category so noisy ones can be turned off. Front ends drain the queue periodically. The queue is bounded and drops the oldest or lowest priority entries when full. Logs for debugging use the same mechanism with verbosity levels. Hard parts: ensuring that posting is cheap, a slow consumer cannot grow memory, and sensitive details such as addresses are handled carefully when logs are shared.",
    k: ["Bounded queue with drops: protects memory and the hot path, but a slow reader may miss important alerts.", "Typed categories enabled on demand: negligible cost when off, but diagnosing an unexpected problem may require reproducing it with logging on."],
    p: ["Verbose peer logging left on fills the disk with gigabytes within days.", "Logs shared in bug reports expose peer addresses and file names."],
    v: "Enable a category, cause a tracker error and confirm exactly one alert arrives with its details; flood the queue and confirm memory stays bounded and a drop counter increases.",
    dep: ["event-loop"]
  },
  "extension-hooks": {
    s: "Interfaces that let plugins or embedding programs add behavior, such as custom choking, extra extension messages and policy checks.",
    d: "The engine exposes callbacks at defined points: a peer connecting, a message arriving, a piece completing, a choke round. Plugins can register extension messages, override the choke rule, filter peers or add alerts. The same hooks serve libraries embedded in other programs. Hard parts are stability and safety: plugins run on the hot path, so slow or faulty code stalls transfers, and a hook interface becomes a compatibility commitment that limits internal change.",
    k: ["In-process hooks: low overhead and full access, but a faulty plugin can crash or stall the whole client.", "Narrow stable interface versus broad access: easier upgrades, but plugin authors cannot reach what they need."],
    p: ["A plugin that blocks in a hook freezes the event loop for every transfer.", "Third-party plugins that run with full process privileges can read all downloaded files and settings."],
    v: "Load a test plugin that counts connections and adds an extension message; counts match reality, the message appears in a peer's extension list and a plugin that throws is isolated without stopping transfers.",
    dep: ["extension-protocol", "event-loop"]
  }
});
