// Details for the build system plate, part 9: remote execution and change detection and storage.
ATLAS.details("build-system", {
  "remote-execution-api": {
    s: "The protocol a client uses to submit an action to a remote service, with its command, input tree digest and platform, and to receive its result.",
    d: "The client uploads any missing input blobs and the command description, then sends an execute request naming them by digest. The service replies with an operation that can be waited on or polled, ending in an action result like a cache hit would give. Because the request is just digests, the service can answer from its cache without running anything. It is hard because the protocol must carry exact platform requirements, stream long-running progress, support cancellation, and remain stable while client and service evolve independently.",
    k: ["Digest-based requests vs sending full inputs: tiny requests and free deduplication, but inputs must be uploaded to storage first.", "A standard open API vs a private one: interchangeable clients and services, but proprietary scheduling features need extensions."],
    p: ["A client that waits synchronously on every action wastes its connection slots on long builds.", "A cancelled client leaves orphan jobs running on the cluster, consuming capacity."],
    v: "Submit an action whose result is already cached and confirm the response arrives without any worker running it. Submit a fresh one and confirm a worker executes it and the result matches a local run.",
    dep: ["remote-scheduler", "input-upload", "action-result", "merkle-directory-trees"]
  },
  "remote-scheduler": {
    s: "The service component that accepts execution requests, queues them by priority and platform, and assigns each to a suitable idle worker.",
    d: "The scheduler holds a queue per set of platform properties and a registry of connected workers and what each can run. When a worker is free, it takes the next matching request; fairness policies share capacity among users and prioritize interactive builds over batch jobs. It deduplicates identical in-flight actions so concurrent requests with the same key run once. It is hard because capacity is finite and demand is bursty, so queueing, preemption, and autoscaling decisions interact, and because worker failure must requeue work safely.",
    k: ["Deduplicating identical in-flight actions vs running each request: large savings under CI bursts, but one failure affects all waiting clients.", "Strict fairness across users vs first come first served: predictable shares, but harder to give critical jobs priority."],
    p: ["A flood of low-priority batch work starves interactive developer builds because there is no priority separation.", "A worker that disappears holds a job in running state forever without a lease timeout."],
    v: "Submit two identical actions concurrently and confirm one worker executes it while both clients receive the result. Kill a worker mid-action and confirm the job is requeued and finishes elsewhere.",
    dep: ["worker-pools", "platform-property-matching", "remote-retries"]
  },
  "worker-pools": {
    s: "Groups of machines that execute remote actions, sized and shaped per platform, and scaled up and down with demand.",
    d: "Each pool is made of workers with a defined operating system, processor type and installed capabilities, such as large memory or devices. Pools scale with the queue length and are often built from interchangeable preemptible machines. Each worker fetches inputs, runs the action in isolation, uploads outputs, and cleans up. Machine images must be identical enough that results are the same. It is hard because cold workers take time to warm local caches and start, because big actions need large machines that sit idle otherwise, and because mixed fleets risk subtle differences in tools.",
    k: ["Many small identical workers vs fewer large ones: better packing and elasticity, but memory-heavy actions need dedicated big pools.", "Reusing a worker across actions vs a fresh machine per action: warm local caches and speed, but state leaks between actions unless cleaned."],
    p: ["Scaling up on queue depth lags demand, so a build burst waits while machines boot.", "Workers on different image versions produce different outputs for the same action key."],
    v: "Increase queued work and confirm the pool scales up within its target time and drains the queue. Run the same action on two workers and compare output digests.",
    dep: ["worker-isolation", "platform-property-matching", "input-upload"]
  },
  "platform-property-matching": {
    s: "Matches each action's required platform properties, such as operating system, processor, container image or memory, to workers that advertise exactly those capabilities.",
    d: "An action carries a set of key-value platform properties, derived from the execution platform chosen during analysis. Workers advertise their own properties, and the scheduler routes the action to a queue whose properties match exactly or by a defined rule. Properties become part of the action key, so results from different platforms never mix. It is hard because the vocabulary must be precise enough to avoid wrong matches and loose enough to keep pools large, and because an unsatisfiable property sets a request waiting forever.",
    k: ["Exact property match vs best-effort match: results are always from the requested platform, but a rare property leaves requests unservable.", "Properties in the action key vs outside it: no cross-platform cache confusion, but fewer shared hits across equivalent platforms."],
    p: ["A property typo creates a queue with no workers, and actions wait until the build times out.", "Two pools advertise the same properties with different toolchain contents, so results vary by pool."],
    v: "Submit an action requiring a property set that no worker offers and confirm a prompt error or visible queue state, not a silent wait. Submit one that matches and confirm routing to the correct pool.",
    dep: ["platforms", "action-key", "worker-pools"]
  },
  "input-upload": {
    s: "Sends the files and directory trees an action needs to the remote store, uploading only blobs the server does not already have.",
    d: "The client computes digests for each input file and for the tree structure, asks the server which are missing, and uploads only those, in batches or streams. Large files are chunked or compressed. Because most inputs, such as toolchains and headers, repeat across actions, deduplication means each blob goes over the network once. It is hard because the missing-blob check itself costs round trips for large trees, because hashing every input is expensive, and because uploading a whole toolchain for a cold cache is slow.",
    k: ["Checking for missing blobs before uploading vs always uploading: avoids redundant transfer, but adds a round trip per action batch.", "Uploading inputs eagerly as they are produced vs at execution time: hides latency, but may upload files never used remotely."],
    p: ["Uploading a huge unused file because it was in an over-approximate input set wastes bandwidth on every action.", "A slow upload link makes remote execution slower than running locally."],
    v: "Run an action remotely twice. The second run should report zero blobs uploaded after the missing check, and a changed input should upload only that blob and the affected directory nodes.",
    dep: ["content-addressable-store", "merkle-directory-trees", "digest-cache"]
  },
  "worker-isolation": {
    s: "How a worker keeps one action from affecting another or the machine: separate directories, process containment, resource limits and cleanup afterward.",
    d: "Each action runs in a fresh working directory, often inside a container or similar kernel-level boundary, with a restricted network and file system, memory and CPU limits, and a wall-clock timeout. After the run, the worker collects outputs and discards everything else. Workers often keep a local cache of input blobs, which is safe because blobs are immutable. It is hard because stronger isolation costs startup time, because some actions legitimately need privileges, and because a leaked process or file would let one client's action affect another's result.",
    k: ["A container per action vs a shared worker process: strong separation and clean state, but startup cost for each action.", "Allowing network inside workers vs blocking it: some actions need it, but it breaks hermeticity and security."],
    p: ["A background process started by one action survives and consumes memory for the next one.", "A shared temporary directory leaks files between actions from different users."],
    v: "Run an action that tries to read another action's working directory and one that spawns a daemon. Confirm the first fails and the daemon is gone after the action ends.",
    dep: ["sandboxing", "worker-pools"]
  },
  "dynamic-execution": {
    s: "Starts an action both locally and remotely, or chooses between them at run time, and uses whichever finishes first.",
    d: "The scheduler runs an action remotely by default but may race a local run when local cores are idle, cancelling the loser when one completes. Policies decide which actions are eligible: cheap ones stay local, actions with many inputs avoid upload costs, and tools needing local resources never go remote. This hides remote queue latency and uses all the capacity a developer has. It is hard because racing doubles work, cancellation is imperfect, and results from the two sides must be identical or the cache sees inconsistent outputs.",
    k: ["Racing local and remote vs choosing one up front: lower latency when either side is slow, but wasted compute and possible nondeterminism between sides.", "Eligibility by action kind vs measured cost: simple, but misjudges actions whose cost varies by input."],
    p: ["Local runs consume cores and slow the developer's machine while the remote result was already coming.", "A nondeterministic tool produces different outputs on the two sides, and whichever wins is cached."],
    v: "Build with racing enabled under a slow remote and a fast one. Total time should track the faster side each time, and output digests must be identical in both cases.",
    dep: ["execution-strategies", "remote-execution-api", "parallel-scheduler"]
  },
  "remote-retries": {
    s: "Reruns remote actions that failed for infrastructure reasons, such as a lost worker or a timeout in the scheduler, without retrying genuine tool failures.",
    d: "The client and service distinguish failure categories: a nonzero exit code from the tool is a real result and is reported; a lost worker, a network error, an out-of-memory kill or an expired lease is retried, usually on a different worker, with backoff and a limit. Some systems record attempts for diagnosis. It is hard because the line between a tool crash caused by an infrastructure issue and a real bug is blurry, and because retries multiply load during an outage.",
    k: ["Retrying infrastructure errors automatically vs surfacing them: builds survive transient problems, but chronic issues go unnoticed.", "Retry with backoff vs immediately: protects the service during an incident, but delays recovery for isolated failures."],
    p: ["Retries during a cluster outage triple the load and prolong it.", "An out-of-memory kill is retried repeatedly on the same size of worker and fails the same way."],
    v: "Terminate a worker during an action and confirm the build still succeeds with the event stream showing a retry on another worker. A tool exiting with an error code must not be retried.",
    dep: ["remote-scheduler", "failure-handling"]
  },
  "timestamp-change-detection": {
    s: "Decides an input changed because its modification time or size differs from the recorded value. It is cheap, but wrong when clocks or tools do not behave.",
    d: "The engine stores each file's modification time, size and sometimes inode at the last check, and compares them with the current values from a stat call. Equal means unchanged. Newer than the output means dirty. It costs one stat per file and no reads. It fails when timestamps move backward (restoring an old file), when a tool preserves timestamps, when clocks differ between machines, or when a file is modified within the timestamp's resolution. It is hard to trust at scale, and is usually backed by hashing for confirmation.",
    k: ["Timestamps alone vs timestamps plus hashes on change: very fast scanning, but they miss changes that preserve time and produce false rebuilds on touches.", "Comparing to the output's time vs to a recorded value: simple and needs no database, but breaks when outputs are restored from a cache."],
    p: ["Switching to an older branch gives files older than their outputs, and nothing rebuilds.", "A file touched without change forces a long rebuild because only the time moved."],
    v: "Replace a source with an older version of itself that has an earlier timestamp, and rebuild. A timestamp-only system misses it; one that records and compares stored values detects it.",
    dep: ["digest-cache", "file-watcher"]
  },
  "content-hash-change-detection": {
    s: "Decides an input changed because its content digest differs from the recorded one, which is exact regardless of clocks but costs reading the file.",
    d: "The engine computes a cryptographic digest of each input file and compares it with the digest recorded when outputs were built. Content hashing makes touches harmless, makes restored files correct and allows early cutoff and cross-machine cache sharing. To keep cost down, digests are cached against stat information, so a file is rehashed only when its timestamp or size changed. It is hard because hashing large trees is slow on first use, and because cached digests rely on file metadata that is itself sometimes unreliable.",
    k: ["Hashing contents vs trusting metadata: always correct and shareable across machines, but costs I/O and CPU for each changed file.", "Rehashing only when metadata changes vs always: fast incremental scans, but a change that preserves size and time slips through."],
    p: ["A tool rewriting a file with identical bytes triggers a hash but no rebuild, which is right, yet an eager system rebuilds anyway.", "Hashing multi-gigabyte inputs on every build makes no-op builds take minutes."],
    v: "Touch a file without changing it and rebuild: nothing should run. Change one byte while preserving the modification time and confirm the change is still detected when digests are re-verified.",
    dep: ["digest-cache", "file-watcher"]
  },
  "file-watcher": {
    s: "Subscribes to file system events so the build learns about changed files immediately instead of scanning the tree at the start of each build.",
    d: "A watcher registers interest in source directories and receives create, modify, rename and delete events from the operating system. Events are batched and delivered to invalidation, which marks the corresponding nodes dirty. With a reliable feed, a build touches only what changed, without statting millions of files. It must deal with event overflow, watch limits on the number of directories, network file systems that report nothing, and the case where the daemon was not running when files changed. It is hard because a missed event produces a stale build, so a fallback verification is needed.",
    k: ["Event-driven watching vs scanning at build start: instant incremental starts, but needs a fallback for lost events and unsupported file systems.", "Watching all directories vs those used by the last build: fewer watches and noise, but a new file in an unwatched place is missed."],
    p: ["Hitting the operating system's watch limit silently disables watching for part of the tree.", "A network or virtual file system reports no events, so the daemon builds stale code."],
    v: "Start the daemon, edit a file while no build runs, then build. Only the edited file's dependents should rebuild, with no full tree scan in the profile. Disable watching and confirm the scan still finds the change.",
    dep: ["path-and-symlink-handling", "invalidation"]
  },
  "digest-cache": {
    s: "Remembers the content digest of each file along with the file metadata seen when it was computed, so unchanged files are not hashed again.",
    d: "The cache maps a path to its digest and to the modification time, size and identity recorded at hashing. On the next request, a stat call compares the metadata; if equal, the stored digest is returned without reading the file. It is kept in memory in the daemon and may also be persisted. It sits under change detection, action keys, input upload and output collection. It is hard because it is correct only as long as the metadata really changes whenever contents change, and because very recent modifications, within the timestamp's resolution, are ambiguous and must be rehashed.",
    k: ["Persisting digests across runs vs memory only: fast restarts, but stale entries after external edits need metadata checks and versioning.", "Trusting metadata equality vs rehashing recent files: avoids reads, but a file edited twice within one timestamp tick can be missed."],
    p: ["A file replaced by another with the same size and modification time returns a stale digest.", "A cache keyed by path alone breaks when the same path is reused in a different sandbox."],
    v: "Hash a file twice and confirm the second returns without a read. Modify it, then confirm the digest changes. Modify it twice within the timestamp resolution and confirm the latest content is detected.",
    dep: ["timestamp-change-detection", "path-and-symlink-handling"]
  },
  "content-addressable-store": {
    s: "A store in which every blob is saved and fetched by the digest of its contents, so identical bytes are one object and any reader can verify what it received.",
    d: "Blobs are immutable and named by their digest. Writing an existing digest is a no-op. Reading checks that the bytes match the name. The same structure serves local disk caches, remote caches, worker input caches and download caches. Directories are stored as small structured blobs listing child names and digests. It is hard at scale: large objects need chunking or streaming, metadata such as access time must be tracked for eviction, and the store must be safe when many writers add the same blob at once.",
    k: ["Whole-file blobs vs chunked content: simple and fast for small files, but large files that change slightly are re-stored fully; chunking dedupes better at the cost of metadata.", "Verifying digest on every read vs trusting the store: catches corruption and tampering, but costs CPU on large objects."],
    p: ["A partly written blob under its final name is read as valid by a concurrent reader.", "Millions of tiny files in one directory degrade the underlying file system."],
    v: "Store the same file under two paths and confirm one blob exists. Corrupt a stored blob and confirm a read fails verification rather than returning wrong bytes.",
    dep: ["path-and-symlink-handling", "output-directory"]
  },
  "merkle-directory-trees": {
    s: "Represents a directory as a structured blob listing child names, modes and digests, so a whole input tree is identified by one root digest and shared subtrees are stored once.",
    d: "A directory node lists files with their digests and modes, symlink targets, and subdirectories by the digest of their own nodes. The root digest therefore names an entire tree. Two trees that share subdirectories share nodes, and a change to one file changes only the nodes on its path to the root. Remote execution requests carry the root digest, and the server fetches missing nodes. It is hard because construction needs every file hashed, because sorting and canonical encoding must be exact for equal trees to hash equal, and because very large directories make large nodes.",
    k: ["Tree-structured digests vs a flat list of files: shared subtrees dedupe and changes touch few nodes, but building and walking the tree is more complex.", "Including file modes and symlinks in the digest vs contents only: exact reproduction of the tree, but incidental mode differences change digests."],
    p: ["A non-canonical encoding, such as unsorted entries, gives the same tree two digests and cache misses.", "Including a file's modification time in the node makes digests differ on every checkout."],
    v: "Build the tree digest for two checkouts of the same revision in different directories. Root digests must be equal. Change one file and confirm only the nodes on its path to the root change.",
    dep: ["content-addressable-store", "path-and-symlink-handling", "digest-cache"]
  },
  "output-directory": {
    s: "The on-disk area where the build keeps outputs, records and caches, kept outside the source tree and managed exclusively by one server.",
    d: "A per-workspace directory holds the output tree by configuration, the local action database, downloaded external repositories, logs and the disk cache link. Its location is derived from the workspace path and user so concurrent workspaces do not collide. A lock ensures one server writes at a time. Cleaning it forces a full rebuild unless caches restore results. It is hard because it can grow to many gigabytes, because path length and file-system limits apply, and because anything that deletes part of it without the engine knowing leaves records that disagree with the files.",
    k: ["A directory outside the workspace vs inside it: the source tree stays clean and ignorable, but tools and people have to find it through links.", "Shared output base for several checkouts vs one per checkout: less duplicate storage, but one lock and one set of states for all."],
    p: ["A user deletes the output tree but leaves the database, and later builds skip actions whose outputs are gone.", "A path too long for a platform's file API fails only for deeply nested targets."],
    v: "Build, then inspect the directory: confirm separate subtrees for configurations and that a second concurrent server on the same workspace is refused by the lock. Remove it and rebuild successfully.",
    dep: ["path-and-symlink-handling"]
  },
  "path-and-symlink-handling": {
    s: "Rules for canonical paths, symlinks, case sensitivity and path length, so the same file has one identity wherever the build refers to it.",
    d: "The engine normalizes paths, resolves or records symlinks, and distinguishes the path a file is accessed by from the real file behind it. Case-insensitive file systems need a policy for names differing only in case, and some platforms limit path length. Symlinks in the source tree are followed, recorded as inputs or rejected depending on policy, and links pointing outside the workspace are a hermeticity risk. It is hard because file systems differ in subtle ways, and a mismatch makes the same file have two identities, producing duplicate work or missed changes.",
    k: ["Resolving symlinks eagerly vs treating them as opaque entries: simple identity for each file, but a link's target change is a hidden input if not tracked.", "Enforcing case-sensitive semantics everywhere vs following the host: portable builds, but a case-insensitive host cannot hold files differing only in case."],
    p: ["Two paths differing only in case are the same file on one machine and two files on another.", "A symlink pointing to a file outside the workspace is read, but never tracked as an input."],
    v: "Create a symlink to a source file and build a target that uses it. Edit the real file and confirm a rebuild. Create two names differing in case and confirm the build either handles or rejects them deterministically.",
    dep: []
  }
});
