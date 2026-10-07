// Details for the version control plate, part 6: maintenance, and the cross-cutting concerns.
ATLAS.details("version-control", {
  "garbage-collection": {
    s: "The umbrella maintenance task that packs loose objects and references, expires old reflog entries and removes unreachable objects after a grace period.",
    d: "A run packs references, repacks objects, expires reflog entries beyond their age limits, prunes unreachable objects older than a grace period, and refreshes the auxiliary files. It is triggered manually, by background scheduling, or automatically when counts of loose objects or packs cross thresholds. The grace period protects objects a concurrent command has just written but not yet referenced. Unreachable objects found within it are kept. The hard part is safety against concurrent writers, and the long, IO-heavy run on a large repository.",
    k: ["Automatic collection after commands vs scheduled background runs: automatic needs no setup but interrupts the user; scheduled runs avoid latency and need an installed job.", "Short grace period vs long: short frees space quickly and risks deleting an object mid-write; long is safer and holds garbage longer."],
    p: ["Collection running while a push is mid-flight and deleting objects before the reference update lands.", "A run that rewrites every pack of a huge repository and saturates the disk for hours."],
    v: "Create unreachable commits by resetting a branch, expire the reflog, run collection with zero grace, and confirm the object count drops and fsck reports a clean store.",
    dep: ["repacking", "pruning-and-expiry", "reachability-computation", "reflog"]
  },
  "repacking": {
    s: "Rewrites objects into fewer, better-compressed packs, optionally recomputing deltas, and regenerates the indexes, bitmaps and auxiliary files that depend on pack layout.",
    d: "A repack enumerates reachable objects, selects deltas through the window search or reuses existing ones, and writes a new pack with its index. Old packs are then removed, and a temporary state keeps readers working during the switch. Options choose whether to include everything in one pack, keep large old packs untouched, or write bitmaps. It is the most expensive maintenance step, reading and writing nearly all data. The hard part is the trade between a thorough repack that gives the best compression and an incremental one that finishes soon.",
    k: ["Full repack vs incremental: full gives the smallest pack and best locality, and rewrites everything; incremental is cheap but leaves growing fragmentation.", "Reuse existing deltas vs recompute: reuse is much faster; recomputation can fix poor choices made under old settings."],
    p: ["Repacking while the server is busy, causing latency spikes for clones and fetches.", "Deleting old packs before readers have switched, causing transient missing object errors."],
    v: "Repack a repository fragmented across hundreds of packs and confirm one pack remains, object counts are unchanged, fsck is clean and the number of files touched per lookup drops.",
    dep: ["packfile-format", "delta-base-selection", "pack-index", "reachability-bitmaps"]
  },
  "geometric-repacking": {
    s: "A repack policy that merges only the smallest packs until sizes form a geometric progression, so each object is rewritten a logarithmic number of times.",
    d: "Packs are sorted by size, and the policy finds the smallest set that must be merged to restore a rule such as every pack being at least twice the size of the next smaller. New small packs from pushes merge with each other frequently, and large packs are rarely touched. A multi-pack index covers the whole set so lookups stay fast during the process. The approach spreads cost over time and avoids a periodic full rewrite. The hard part is that deltas across pack boundaries are not optimized.",
    k: ["Geometric merging vs periodic full repack: geometric spreads work evenly and bounds write amplification, but compression across packs is worse than a full run.", "Growth factor of two vs larger: smaller factors keep fewer packs and cost more rewrites; larger factors rewrite less and leave more packs."],
    p: ["Never running a full repack, leaving cross-pack deltas poor and the repository larger than necessary.", "Interrupted merges leaving temporary packs that consume disk."],
    v: "Push a hundred small changes with geometric policy on, and confirm pack counts stay logarithmic in the number of pushes while bytes rewritten per push stays small.",
    dep: ["repacking", "multi-pack-index", "background-maintenance"]
  },
  "reachability-computation": {
    s: "Determines which objects are reachable from references, reflogs, the index and other roots, the set that must be kept when collecting or repacking.",
    d: "The walk starts at every reference, reflog entry, stash, index entry and in-progress operation, follows commit parents and tree entries, and marks each object it reaches. Anything unmarked is unreachable. Bitmaps and the commit-graph accelerate the commit part; trees still require reading, though subtrees already marked are skipped. For servers with forks the roots include every member's references. The hard part is completeness: a missed root, such as a rarely used namespace or a worktree's HEAD, causes live data to be deleted.",
    k: ["Mark everything from all roots vs assume branches only: all roots are safe and costly to enumerate; narrow roots are fast and can delete data in use.", "Use bitmaps for marking vs full walk: bitmaps are much faster, and depend on being current."],
    p: ["Forgetting per-worktree state or in-progress rebase references as roots and pruning needed commits.", "Walking trees of every commit on a huge repository and taking hours."],
    v: "Compute the unreachable set after deleting a branch and confirm it contains exactly the commits unique to that branch, and nothing referenced by a stash, worktree or reflog.",
    dep: ["reference-namespace", "commit-objects", "tree-objects", "reachability-bitmaps", "linked-worktrees"]
  },
  "pruning-and-expiry": {
    s: "Deletes unreachable loose objects older than a cutoff and expires reflog entries by age, turning logically abandoned data into reclaimed space.",
    d: "Expiry first removes reflog entries older than configured limits, with shorter limits for entries pointing at unreachable commits; this turns formerly protected commits into candidates. Prune then removes unreachable loose objects whose modification time is older than the cutoff. Packed unreachable objects are not removed by prune alone; a repack drops them or places them in a separate holding pack. The cutoff protects work in progress. The hard part is that the deletion is irreversible and relies on file modification times.",
    k: ["Expire reflog aggressively vs keep recovery history: aggressive frees space sooner but removes the safety net; conservative keeps mistakes recoverable.", "Time-based protection vs reference counting: time is simple and stateless, but a slow operation can outlast the window; counting is exact and needs shared state."],
    p: ["Setting the cutoff to now on a server receiving pushes, which deletes objects not yet referenced.", "File times reset by a restore or copy, making old garbage look fresh forever."],
    v: "Make an unreachable loose object, set its time to last month, run prune with a two-week cutoff and confirm it is gone, while a fresh unreachable object is preserved.",
    dep: ["reachability-computation", "loose-object-store", "reflog"]
  },
  "cruft-packs": {
    s: "A pack holding unreachable objects together with per-object modification times, so garbage can expire on schedule without exploding into thousands of loose files.",
    d: "When a repack drops unreachable objects, ordinary behavior either deletes them immediately or writes each as a loose file to preserve its age. A cruft pack instead stores them in one pack with a side file recording each object's last-known time. Later runs expire entries older than the cutoff by rewriting the pack, and rescue any that became reachable again. This avoids the file explosion and the dependence on file-system times. The hard part is the extra pack and index bookkeeping and coordinating with readers.",
    k: ["Cruft pack vs loose unreachable objects: a pack avoids file-count explosion and preserves ages explicitly, but needs rewriting to expire; loose files expire by simple deletion.", "Immediate deletion vs keeping garbage: keeping protects racing writers and costs space; deleting is clean and risks in-flight data."],
    p: ["Expiring objects in the cruft pack that a pushed but not yet linked reference needs.", "Keeping a huge cruft pack indefinitely because the expiry cutoff is set too long."],
    v: "Delete a branch, repack with cruft enabled and confirm no loose files appear, the unreachable commits are in one pack with times recorded, and expiry after the cutoff removes them.",
    dep: ["repacking", "pruning-and-expiry", "packfile-format"]
  },
  "background-maintenance": {
    s: "Scheduled jobs that keep a repository fast: prefetch from the remote, refresh the commit-graph, merge small packs, pack loose objects and prune, off the user's critical path.",
    d: "A scheduler registers jobs, hourly, daily and weekly, with the operating system's timer service. Typical tasks are fetching remote branches into hidden references so a user's pull is quick, updating the commit-graph, packing new loose objects, and doing geometric repacking. Each task takes a lock so overlapping runs skip. Settings specify which repositories to maintain. The hard part is not disturbing the user: it must use limited CPU and IO, and avoid fighting a foreground command for locks.",
    k: ["Scheduled background jobs vs automatic collection in commands: background jobs hide cost from the user and need installation; in-command runs need nothing and can freeze a command at a bad moment.", "Prefetch hidden refs vs plain fetch: prefetch makes later pulls near instant, and costs bandwidth for branches the user may never use."],
    p: ["A maintenance job holding a lock that makes a foreground commit fail with a lock error.", "Jobs registered for a repository that has moved, running forever against a missing path."],
    v: "Enable maintenance, wait for the hourly job, and confirm the prefetch references updated, the commit-graph is current, and a subsequent pull transfers little data.",
    dep: ["commit-graph-file", "geometric-repacking", "fetch-client", "garbage-collection"]
  },
  "immutability-and-history": {
    s: "Objects are never modified once written, and history is an append-only graph where rewriting means creating new objects and moving names.",
    d: "Because identifiers derive from content, changing anything produces a different object. Amend, rebase, filter and squash all create copies and then move a reference. The old objects remain until collection removes them. This gives cheap branching, safe concurrent writing, trivial caching and verifiable replication. It also means that removing data, such as an accidentally committed secret, requires rewriting every descendant and coordinating all clones. Every layer is shaped by it: the object store is append-only, packs are immutable files, and transfers only ever add.",
    k: ["Immutable objects with movable names vs mutable records: immutability gives safety and caching, but deletion of content from history is costly and disruptive.", "Rewrite by copying vs in place: copying is safe and recoverable, and doubles storage until collection."],
    p: ["Believing that deleting a file in a later commit removes it from history, when every clone retains it.", "Rewriting shared history without telling collaborators, leaving divergent clones."],
    v: "Amend a commit, confirm the original object still exists and is reachable from the reflog, and that existing clones still hold the old identifier until they fetch the rewritten one.",
    dep: ["content-addressing", "reflog", "rebase-engine"]
  },
  "concurrency-and-locking": {
    s: "Many processes may read and write one repository at once, coordinated by lock files, atomic renames and compare-and-swap on references, rather than by a central daemon.",
    d: "Writers create new files and rename them into place, so readers never see partial content. Object writes are idempotent because the name is the content. Mutable state, the index, references, pack lists and configuration, is protected by exclusive lock files created with fail-if-exists semantics. References use expected-old-value checks. Maintenance relies on grace periods rather than locks to avoid deleting what a writer is about to reference. On a server, many pushes and fetches run simultaneously against one directory. The hard part is that every guarantee relies on file-system semantics.",
    k: ["Lock files and atomic rename vs a coordinating daemon: files need no running service and work everywhere, but depend on file-system guarantees and leave stale locks; a daemon is precise and a single point of failure.", "Optimistic retry vs blocking locks: retry gives progress and may starve; blocking is simple and can queue up."],
    p: ["Network file systems with weak rename or locking semantics corrupting reference updates.", "Stale lock files from killed processes blocking all writers until someone removes them by hand."],
    v: "Run a hundred parallel commits and pushes against one repository and confirm no reference is lost or torn, fsck is clean, and any rejected update reports a clear compare-and-swap failure.",
    dep: ["ref-transactions", "loose-object-store", "index-file-format"]
  },
  "format-compatibility": {
    s: "On-disk and on-wire formats must remain readable by old and new tools for years, so every format carries versions, optional extensions and feature flags.",
    d: "Repositories outlive the programs that wrote them, and servers talk to clients of every age. Formats therefore start with a signature and version, use extension sections that readers may skip, and record required features in configuration so an old tool refuses a repository it would corrupt. The protocol negotiates capabilities instead of assuming. New storage ideas, the table reference backend, the new hash, partial-clone promises, all arrive as opt-in with explicit markers. The hard part is the long tail: a single tool that ignores a required feature can damage data.",
    k: ["Optional skippable extensions vs required feature flags: skippable ones preserve compatibility for caches; required flags protect correctness for data and cause old tools to refuse.", "Evolving formats in place vs new formats alongside: in place keeps one code path and risks breaking readers; alongside is safe and doubles the maintenance."],
    p: ["A third-party tool ignoring the repository format flag and writing in the old layout, corrupting a new-format store.", "Changing a default and breaking scripts parsing output that was never promised to be stable."],
    v: "Open a repository using a newer ref storage and hash setting with an older tool and confirm it refuses with a version message rather than reading partial data.",
    dep: ["capability-negotiation", "hash-function-migration", "index-file-format"]
  },
  "integrity-and-trust": {
    s: "Every received byte is untrusted: objects are rehashed, structures validated, paths sanitized, hooks and filters treated as code, and signatures verified against explicit key trust.",
    d: "The hash chain guarantees that a commit identifier names exact content, so any tampering is visible if the identifier was obtained from a trusted source. Beyond that, receivers validate structure, rejecting trees with dot components or duplicate names, and refuse paths that would escape the working directory. Configuration, hooks, filters and submodule URLs that arrive with a clone are executable surfaces, so they are not applied automatically. Signatures add attribution. Servers add access control and push rules. The hard part is that integrity is not authenticity: a valid hash proves nothing about who wrote it.",
    k: ["Strict validation of incoming data vs speed: strict checks stop malformed or malicious structure at the cost of CPU on every push and fetch.", "Executing repository-provided configuration vs requiring local opt-in: automatic execution is convenient and dangerous with untrusted clones; opt-in is safe and adds a step."],
    p: ["Cloning an untrusted repository and running its hooks, filters or build scripts without review.", "Treating a matching identifier as proof of authorship rather than proof of content."],
    v: "Fetch a crafted pack with a tree containing a path that climbs out of the working directory and confirm it is rejected before checkout, with no file written outside the tree.",
    dep: ["object-integrity-check", "signature-verification", "access-control", "client-hooks"]
  },
  "scale-and-latency": {
    s: "Every step that is linear in history size, tree size, reference count or object count eventually dominates, so the system adds indexes, caches and lazy loading at each layer.",
    d: "At small scale, loose objects, full index rewrites and complete history walks are fine. As a repository grows, each becomes the bottleneck in turn: pack lookups, status scans, commit walks, reference listing, enumeration for fetch. The remedies share a form: precompute a compact summary, store it beside the data, and keep it current in the background. Commit-graph, bitmaps, multi-pack index, untracked cache and file system monitor all follow it. Partial and shallow clones go further by not having the data at all. The hard part is that every summary must be invalidated correctly.",
    k: ["Precomputed summaries vs computing on demand: summaries make common queries near instant, but each is a cache that must stay correct and be rebuilt after changes.", "Fetching less data lazily vs complete local copies: lazy clones are fast to create and unpredictable offline; complete clones are slow to create and always self-sufficient."],
    p: ["Optimizing the server and leaving client defaults unchanged, so developer commands stay slow.", "Benchmarking on a small repository and missing the commands that scale with size."],
    v: "Plot time for clone, status, log and fetch against repository size on a synthetic series and confirm each curve stays within its documented bound once the acceleration files are enabled.",
    dep: ["commit-graph-file", "reachability-bitmaps", "filesystem-monitor", "partial-clone-filters"]
  },
  "portable-file-semantics": {
    s: "The system runs on file systems that differ in case sensitivity, path length, permissions, symbolic links, time resolution and rename atomicity, and the object model must stay portable across them.",
    d: "The tree records only a few modes and slash-separated byte names, so identifiers are the same everywhere. On checkout each platform must map those to local rules: case-insensitive disks can collide two paths, some names are reserved or unrepresentable, executable bits and symbolic links may not exist, and Unicode normalization may alter names. Reference names stored as files inherit the same limits. Timestamps with coarse resolution weaken the stat cache. Line endings differ. The hard part is that repositories created on one platform may be impossible to check out faithfully on another.",
    k: ["Portable lowest-common-denominator model vs preserving platform metadata: portable identifiers work everywhere, but lose ownership, extended attributes and precise permissions.", "Detect collisions at checkout vs forbid at commit: detection tolerates existing repositories and warns late; forbidding is strict and blocks legitimate single-platform use."],
    p: ["Two paths differing only in case checking out as one file on a case-insensitive disk and silently overwriting content.", "Symbolic links checked out as plain text files on a platform without them, changing build behavior."],
    v: "Commit two paths differing only in case on a case-sensitive disk, clone onto a case-insensitive one, and confirm checkout reports the collision and status stays understandable rather than silently losing a file.",
    dep: ["tree-objects", "checkout-and-switch", "stat-cache", "line-ending-conversion"]
  },
});
