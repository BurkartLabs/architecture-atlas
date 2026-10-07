// Details for the embedded database plate, part 4: transactions and recovery, locking, OS interface, testing.
ATLAS.details("embedded-database", {
  "transaction-states": {
    s: "A connection is outside a transaction, in a read transaction, or in a write transaction, and moves between them by explicit statements or implicitly around each statement.",
    d: "Each statement runs in a transaction. If none is open, one starts automatically and ends when the statement finishes (autocommit). An explicit begin keeps it open until commit or rollback. A read transaction holds a shared lock for its snapshot; the first write upgrades it, taking a reserved lock. Begin can be deferred, immediate or exclusive, choosing when write intent is declared. Hard because open read statements keep the transaction alive, and upgrading from read to write can fail if another writer got in first.",
    k: ["Deferred begin vs immediate begin: deferred never takes the write lock for read-only work, but a read-then-write upgrade can fail with busy.", "Autocommit per statement vs explicit transactions: simple default semantics, but each statement pays a commit and its syncs."],
    p: ["Thousands of inserts in autocommit mode each pay a full commit and sync, and run a hundred times slower than one transaction.", "A read transaction that later tries to write fails with busy when another connection already holds the write lock."],
    v: "Insert ten thousand rows once in autocommit and once in a single explicit transaction, count the sync calls, and confirm the second needs a handful instead of ten thousand.",
    dep: ["lock-levels", "pager-state-machine", "commit-sync-ordering"]
  },
  "rollback-journal": {
    s: "Before a page is first modified, its original content is saved to a separate journal file; if the transaction fails, the originals are copied back, undoing it.",
    d: "At the first change, the pager creates a journal file beside the database and writes a header followed by the original content of each page about to change, once per transaction. Changed pages are then written in place in the database file. To commit, the journal is synced, the database is written and synced, and the journal is deleted or zeroed, which is the atomic moment. Rollback replays originals. It is hard because correctness depends on the exact order of writes, syncs and the final deletion.",
    k: ["Save old pages in a journal vs write new pages elsewhere: the database file holds the newest committed state and readers need no special logic, but each changed page is written twice.", "Delete the journal at commit vs truncate or zero its header: deletion is the classic atomic step, but truncating avoids directory updates and is faster on some systems."],
    p: ["Copying the database without its hot journal produces a file that is half-updated.", "Deleting the journal before the database is synced makes a crash leave a corrupt database with no way to undo."],
    v: "Kill the process after the database pages are written but before the journal is removed, reopen, and confirm the original content is restored and the integrity check passes.",
    dep: ["journal-format", "page-references-and-dirty-list", "file-io-methods"]
  },
  "journal-format": {
    s: "The layout of the journal file: a header with a magic string, record count, nonce and sector size, then page records each followed by a checksum.",
    d: "The journal header records how many page records follow, a random nonce, the original database size, the sector size and page size. Each record holds a page number, the page's original content, and a checksum computed from the nonce and a sampling of the page bytes. A header is rewritten after records are synced so the count is trustworthy; the nonce makes stale data from a previous journal fail the checksum. It is hard because the journal itself can be torn by a crash, and recovery must ignore a partly written tail.",
    k: ["Checksum with a per-journal nonce vs none: detects garbage and leftovers from earlier journals after power loss, but costs computation per page.", "Count in the header vs scanning until a bad checksum: avoids reading stale data, but the header needs a second synced write in the safe mode."],
    p: ["A journal file reused without a fresh nonce can have old records pass the checksum and restore wrong content.", "A journal truncated mid-record must not be replayed past the last valid record."],
    v: "Truncate a journal at every byte offset in turn, run recovery, and confirm recovery either replays only complete valid records or ignores it, leaving a consistent database in each case.",
    dep: ["rollback-journal", "storage-assumptions"]
  },
  "super-journal": {
    s: "When one transaction changes several attached database files, a master journal file names all individual journals, so the commit is atomic across files.",
    d: "Each database in the transaction has its own journal. For the commit, the pager writes a super-journal listing every journal's path and syncs it, and each journal records the super-journal's name. The journals are then finalized, and finally the super-journal is deleted, which is the atomic commit point. During recovery, a journal that names a super-journal is replayed only if that file still exists. Hard because the multi-step sequence has more crash points, and the files must be on the same device.",
    k: ["Extra coordination file vs treating each database separately: all-or-nothing across files, but extra syncs and a file that must be deleted last.", "Super-journal as the commit point vs two-phase commit logs: very simple, but only works for files managed by one engine."],
    p: ["Moving or renaming databases independently of the super-journal leaves journals pointing at a file that no longer exists.", "In the write-ahead log mode, a transaction across several files is atomic for each file but not across files."],
    v: "Update two attached databases in one transaction, crash between finalizing the first and second journals, and confirm after recovery both databases show the transaction either committed or rolled back together.",
    dep: ["rollback-journal", "hot-journal-recovery", "commit-sync-ordering"]
  },
  "hot-journal-recovery": {
    s: "On opening for read, a connection detects a journal left by a crashed writer and rolls the database back to its last committed state before any read.",
    d: "A journal is hot if it exists, has a valid header, no connection holds a reserved lock, and the database is not simply empty of changes. The reader first takes a shared lock, sees the hot journal, upgrades to exclusive, replays the original pages into the file, syncs, deletes the journal and continues. Two connections may race, so the exclusive lock arbitrates. It is hard because the decision needs the lock state and file state at once, and because the journal can have been created by a different process with different file permissions.",
    k: ["Recover automatically at first read vs a separate repair tool: no administrator needed, but a read-only opener must be able to modify the file.", "Decide hotness by lock probing vs by a marker file: no extra state to keep consistent, but relies on locking being reliable."],
    p: ["A read-only directory or file permissions stop recovery, leaving the database unreadable until fixed.", "Deleting a journal by hand to clear an error discards the only copy of the original pages and corrupts the database."],
    v: "Create a hot journal by killing a writer mid-commit, then open the file from a new process and confirm the first query returns the pre-transaction data and the journal file is gone.",
    dep: ["rollback-journal", "lock-levels", "journal-format"]
  },
  "commit-sync-ordering": {
    s: "The precise order of file writes and sync calls during commit, so that at every possible moment of power loss the files recover to either the old or the new state.",
    d: "In journal mode, the sequence is: write all original pages to the journal; sync the journal; update the journal header's record count; sync again if needed; write changed pages to the database file; sync the database; delete or invalidate the journal. In log mode the sequence is: append frames, write a commit frame, sync the log. Each sync is a barrier: nothing after it may reach the device before everything before it. It is hard because the guarantees depend on what the operating system and the drive actually do with flushes.",
    k: ["Two syncs on the journal vs one: protects against reordering of the header update and the records, but doubles the commit latency; one is safe only if sector writes are atomic and ordered.", "Sync the directory after creating or deleting files vs not: ensures the file's existence survives power loss, but costs another flush."],
    p: ["Skipping the directory sync lets a new journal vanish after power loss while the database is already modified.", "Relying on file system journaling instead of explicit syncs fails on file systems that reorder data writes."],
    v: "Record every write and sync of a commit, then replay the trace cutting power after each prefix with write reordering allowed between syncs, and confirm every resulting file recovers consistently.",
    dep: ["sync-calls", "rollback-journal", "write-ahead-log", "storage-assumptions"]
  },
  "write-ahead-log": {
    s: "An alternative to the rollback journal: changed pages are appended to a log file, commits are a marker in the log, and the database file is updated later by a checkpoint.",
    d: "A write transaction appends frames, each a page image with a header and cumulative checksum, to the log. The last frame of a transaction carries the new database size and marks the commit. Readers find the newest version of a page by consulting an index of the log, falling back to the database file. Since writers append and never overwrite pages that readers use, readers and a writer proceed concurrently. A commit needs one sync of the log. Hard because it adds a shared-memory index, a checkpoint process and file-system requirements.",
    k: ["Append new pages to a log vs journal old pages: readers do not block the writer and commits need fewer syncs, but reads check the log and the log needs checkpointing.", "Log in the same directory with shared memory vs inside the file: separate files keep the main database format simple, but all processes must be on one host."],
    p: ["A checkpoint that cannot complete because a long reader pins old frames lets the log grow without bound.", "The log mode does not work over network file systems because it needs shared memory between processes."],
    v: "Start a long read, commit many writes from another connection, and confirm the reader still sees its original snapshot while the writer is not blocked and the log file grows.",
    dep: ["wal-index", "checkpointing", "wal-reader-marks", "commit-sync-ordering"]
  },
  "wal-index": {
    s: "A shared-memory structure, usually a mapped file, that lets every connection find the newest log frame for a page without scanning the log.",
    d: "The index holds hash tables from page number to frame number, partitioned into blocks that cover ranges of frames, plus a header with the log's salt values, checksum, frame count, backfill marker and the reader marks. It is rebuilt from the log itself when no connection has it open, by reading frames and validating checksums. Connections map it through the VFS shared memory methods. Hard because many processes update it concurrently under tiny locks, and because it must be correct after a crash that leaves it half-written.",
    k: ["Shared-memory index vs file locking only: lookups are fast without reading the log, but all users must share memory and so must share a host.", "Rebuild from the log on recovery vs trust it: nothing persists that could be stale, but the first opener after a crash pays a scan."],
    p: ["On a file system without working shared memory mapping, connections silently use inconsistent indexes unless the locking mode is changed.", "A corrupted index file with no recovery path makes every connection fail until it is removed and rebuilt."],
    v: "Kill all connections, truncate the shared-memory file, reopen and confirm the index is rebuilt from the log and reads return the committed data.",
    dep: ["write-ahead-log", "shared-memory-methods", "wal-reader-marks"]
  },
  "checkpointing": {
    s: "Copies committed frames from the log back into the main database file so the log can be reset, running automatically after a size threshold or on request.",
    d: "A checkpoint copies each page's newest committed frame into the database file, but only frames that no active reader still needs from before. It then syncs the database. When every frame has been copied and no reader uses the log, the next writer restarts the log from the beginning with new salt values. Modes range from passive, which never blocks anyone, to truncate, which waits for readers and shrinks the file. Hard because completion depends on the oldest reader, and checkpointing in the commit path adds latency.",
    k: ["Automatic checkpoint on commit past a size vs a background thread: no extra threads in a library, but one unlucky commit pays the cost.", "Passive vs blocking checkpoint: passive never stalls anybody but may fail to finish, while blocking guarantees a reset but can stall writers."],
    p: ["A reader that never closes pins its snapshot, so checkpoints never complete and the log grows until disk fills.", "Checkpoints in the commit path cause occasional latency spikes that look like random stalls."],
    v: "Write enough to pass the checkpoint threshold, confirm the database file receives the pages and the log restarts, and run the integrity check on the database file alone after a full checkpoint.",
    dep: ["write-ahead-log", "wal-reader-marks", "sync-calls", "file-io-methods"]
  },
  "savepoints": {
    s: "Named points inside a transaction that can be rolled back to or released, implemented with a stack of journal offsets and saved database sizes.",
    d: "Starting a savepoint records the current position in the journal and the page count. Rolling back to it replays the journal records written after that position, restoring pages and truncating the file, while keeping the transaction open. Releasing it discards the marker, merging its changes into the parent. The same mechanism supports each statement: a statement that may fail midway opens an anonymous savepoint, so a failed statement is undone alone. In log mode, savepoints use an in-memory record of pages. Hard to nest correctly with spill and cache.",
    k: ["Savepoints on top of the journal vs a separate undo log: reuses existing recovery code and adds almost no storage, but later pages are journaled again for the nested range.", "Statement-level savepoints only when a statement can fail midway: single-row writes skip the cost, but the compiler must track which ones can."],
    p: ["A savepoint left open forever holds journal content and the transaction, preventing commit from being final until the outer transaction ends.", "Rolling back to a savepoint does not release the write lock, so other writers still wait."],
    v: "Begin, insert A, savepoint, insert B, roll back to the savepoint, commit, and confirm only A exists; also confirm an outer rollback removes A.",
    dep: ["rollback-journal", "halt-and-statement-rollback", "page-references-and-dirty-list"]
  },
  "storage-assumptions": {
    s: "The properties the commit protocol assumes of the device and file system: sync means durable, sector writes are atomic or detectable, and files grow without corruption.",
    d: "The engine documents what it relies on. A sync call must not return until data is on the medium. Writes within a sector are either fully applied or not, or at least corruption is detected by checksum. Overwriting a file's data does not damage other parts of it. Appending extends the file before any later data is valid. It runs on commodity storage that does not always honor these, so options exist to reduce the assumptions at a cost. Hard because failures that violate them are rare and invisible in testing.",
    k: ["Assume safe-sector atomicity to write fewer syncs vs assume nothing: faster commits on devices that meet the assumptions, but silent corruption on those that do not.", "Detect with checksums vs prevent with ordering: checksums reveal damage after the fact, ordering prevents it, and the engine uses both."],
    p: ["Consumer drives or virtual disks that acknowledge flushes early defeat the protocol and corrupt data after a power loss.", "Write-back caches in a hypervisor or network layer that lose data on host crash look like device failure."],
    v: "Run a power-loss test rig that cuts power during commits on the real device and file system, then check every file with the integrity check; count zero failures over many cycles.",
    dep: ["sync-calls", "journal-format"]
  },
  "journal-and-sync-modes": {
    s: "Settings that choose the rollback journal flavor (delete, truncate, persist, memory, off), the write-ahead log, and how many syncs commit performs (full, normal, off).",
    d: "Delete mode removes the journal at commit. Truncate shortens it and persist zeroes the header, both saving directory operations. Memory keeps it in RAM, and off disables rollback entirely. The synchronous level decides the count of syncs: full syncs at every critical step, normal syncs less often and in log mode only at checkpoints, off never syncs. Locking and exclusive modes further reduce overhead. It is hard because each choice moves the durability, isolation and performance trade-off, and settings differ in what failures they survive.",
    k: ["Full sync vs normal in the log mode: full survives power loss for every commit, while normal may lose the latest commits but stays consistent.", "Journal off or memory vs on disk: faster bulk loads, but a crash or rollback corrupts the database."],
    p: ["Journal mode off makes a rollback statement unable to undo changes and a failed statement leaves a corrupt database.", "Choosing normal synchronous and expecting power-loss durability of every acknowledged commit."],
    v: "Commit one hundred transactions in each mode, count syncs and measure time, then cut power during runs and verify which modes lose recent commits and which stay consistent.",
    dep: ["rollback-journal", "write-ahead-log", "sync-calls"]
  },
  "lock-levels": {
    s: "Five escalating lock states on the database file: none, shared, reserved, pending and exclusive, taken as byte-range locks that coordinate readers and a single writer.",
    d: "Shared allows reading, with many holders. Reserved says a writer intends to write, but readers may continue; only one holder exists. Pending blocks new readers so the writer can drain existing ones. Exclusive is needed to write to the database file. The levels are implemented as locks on specific byte ranges of the file, using the operating system's advisory locking, which releases automatically when a process dies. Hard because file locking semantics vary by platform and file system, and are broken on some network file systems.",
    k: ["Byte-range advisory locks on the file vs a lock file or a server: no extra files or processes and automatic release on crash, but correctness depends on the file system's locking.", "Pending state to prevent writer starvation vs plain exclusive attempts: writers eventually succeed, but new readers are briefly refused."],
    p: ["Network file systems with unreliable locks permit two writers and corrupt the file.", "Closing any descriptor of a file in a process can drop locks held by another connection in the same process on some systems."],
    v: "Open two processes, take reserved in one and confirm the other can still read but not write; then escalate to exclusive and confirm readers are refused until commit.",
    dep: ["file-io-methods", "one-writer-model", "deadlock-avoidance"]
  },
  "one-writer-model": {
    s: "At most one transaction may hold the reserved lock at a time, enforcing a serial order of writers without row locks or deadlock detection between them.",
    d: "A write transaction obtains the reserved lock and keeps it until commit or rollback. Another writer trying to begin gets a busy result, or waits through the busy handler. In the rollback journal mode, the writer needs exclusive access to apply its pages, so readers are briefly blocked at commit. In the log mode, a writer holds the write lock on the log while readers continue. This yields strict serializability. It is hard in practice because applications must keep write transactions short and avoid holding read statements open.",
    k: ["Serial writers vs concurrent writers with row locks: no deadlocks, no lock manager and simple code, but throughput is capped by one writer's commit rate.", "Fail fast with busy vs queue in the engine: the application decides policy, but must handle the error or configure a timeout."],
    p: ["Several worker threads each starting a deferred transaction and then writing hit busy errors in the upgrade, which no timeout can fix.", "A long write transaction doing slow external work inside it stalls all other writers."],
    v: "Run eight writer threads in short immediate transactions, confirm throughput equals roughly serial commits with no corruption or lost updates, and every row is present.",
    dep: ["lock-levels", "busy-handler", "transaction-states"]
  },
  "busy-handler": {
    s: "A callback or timeout invoked when a lock is unavailable, deciding whether to retry after a delay or return a busy error to the caller.",
    d: "When a lock attempt fails, the engine calls the busy handler with a retry count. A timeout-based handler sleeps with a backoff and retries until the total wait expires. A custom handler can log, wait longer or give up. The handler is not called when waiting would deadlock, such as an upgrade from shared to reserved while another connection waits for exclusive, because retrying cannot succeed; the error returns immediately. Hard because correct application behavior needs both a handler and short transactions.",
    k: ["Polling with backoff vs blocking on a lock: portable across platforms and file systems, but latency is bounded by the sleep granularity and waiters are not fair.", "Return busy immediately vs wait: no hidden stalls, but every call site must handle retries."],
    p: ["Retrying forever on a lock held by a crashed or hung process stalls the application.", "Waiters have no fairness, so a heavy writer can starve others that keep retrying."],
    v: "Hold a write lock in one connection for two seconds, set a five-second timeout on another, and confirm its write succeeds after about two seconds; with a one-second timeout confirm it fails with busy.",
    dep: ["one-writer-model", "lock-levels", "deadlock-avoidance"]
  },
  "wal-reader-marks": {
    s: "In log mode each reader records, in the shared index, the last frame it may use, so checkpoints know which frames are still needed and which are safe to copy.",
    d: "A reader starts by choosing a reader mark slot containing a frame number at least as new as its snapshot and takes a shared lock on that slot. The writer and checkpointer see the slot's value and the lock, and know that frames up to the oldest locked mark must be preserved. Slots are reused when readers finish. Marks are protected by the same lock mechanism, so a crashed reader's lock disappears. Hard because slot assignment and updates race, and a bounded number of slots means that many different snapshots must share.",
    k: ["A few shared reader slots vs one entry per reader: bounded shared memory and cheap lookups, but readers of similar age share a slot, and more distinct snapshots than slots must wait.", "Locks on slots vs counters: locks vanish with dead processes, but counters need cleanup that crashes would skip."],
    p: ["A single reader holding an old snapshot blocks the checkpoint from completing past its mark.", "More simultaneous distinct snapshots than slots can make a reader wait or get busy."],
    v: "Open a reader, write and checkpoint repeatedly, and confirm the checkpoint copies frames only up to the reader's mark and finishes after the reader ends.",
    dep: ["wal-index", "checkpointing", "lock-levels"]
  },
  "deadlock-avoidance": {
    s: "Rules that prevent two connections from waiting on each other forever, mainly by refusing lock upgrades that cannot succeed and returning busy immediately.",
    d: "A connection holding a shared lock that wants to write needs reserved; if another connection already holds reserved and is waiting for exclusive, waiting would deadlock, because the writer needs the reader to leave. The engine detects such cases and returns busy without calling the busy handler. The same logic orders lock acquisition. Because locks have only a few levels and one writer, detection is a matter of rules, not graphs. Hard because applications that read first then write run into it, and the correct response is rolling back and retrying the whole transaction.",
    k: ["Rule-based avoidance vs a wait-for graph: trivial and cheap with one writer, but the application receives busy errors it must handle by retrying.", "Begin immediate for writers vs deferred: removes the upgrade deadlock entirely, but takes the write lock even if no write follows."],
    p: ["Retrying only the failed statement after a busy upgrade keeps the read snapshot that causes the conflict; the whole transaction must be rolled back.", "Treating busy as transient inside a read-then-write transaction loops forever."],
    v: "Run two connections that both read, then both attempt to write, and confirm one gets busy immediately without waiting for the timeout, and that rolling back and retrying then succeeds.",
    dep: ["lock-levels", "busy-handler", "transaction-states"]
  },
  "thread-safety-modes": {
    s: "A compile-time and run-time choice among single-threaded, multi-threaded (one connection per thread) and serialized (connections shared with an internal mutex) operation.",
    d: "In single-thread mode no mutexes are compiled in. In multi-thread mode, separate connections may be used by separate threads freely, but a connection and its statements must not be used by two threads at once. Serialized mode wraps entry points in a connection mutex so handles can be shared. Global structures such as the allocator and the page cache pool have their own mutexes. The mode can be set at build, at start-up or per connection at open. Hard because mistakes show up as rare races, and mutex cost matters on small systems.",
    k: ["Serialized mode vs one connection per thread: any thread can use any handle, but all work on that handle is serialized and scales poorly.", "No mutexes at all: smallest and fastest on single-threaded devices, but any threading corrupts memory."],
    p: ["Sharing one statement between threads in the multi-thread mode causes crashes that appear only under load.", "A build with threading compiled out is used by a host that later adds a background thread."],
    v: "Run a stress test of many threads, each with its own connection on one file, under a race detector, and confirm no data races reported and all committed rows are present.",
    dep: ["connection-handle", "memory-allocator"]
  },
  "vfs-interface": {
    s: "A table of function pointers that supplies everything the engine needs from the operating system: opening and deleting files, access checks, full paths, sleep, time and randomness.",
    d: "A VFS object names itself and provides methods to open a file (returning a file object with its own methods), delete, test access, resolve a full path, load shared libraries, sleep, read the clock and produce random bytes. Several VFS objects can be registered and one chosen per connection by name. The default is chosen at build for each platform. Because everything passes through this table, the library can run on exotic systems, over custom storage, or with wrappers for testing. Hard to implement correctly: sync, lock and atomic-write semantics must be exactly honored.",
    k: ["A narrow pluggable interface vs direct system calls: portability and testability, since fault injection and encryption can wrap it, but every call pays an indirection.", "Per-connection VFS selection vs one global: different databases can use different storage, but mixing them in one transaction is unsafe."],
    p: ["A custom VFS that implements sync as a no-op passes all functional tests and loses data on power failure.", "A VFS that returns wrong sector size or atomic-write capability makes the commit protocol drop safeguards it needs."],
    v: "Register a logging VFS that wraps the default, run a transaction and confirm the log shows the expected opens, locks, writes and syncs in the documented commit order.",
    dep: ["file-io-methods", "sync-calls", "shared-memory-methods"]
  },
  "file-io-methods": {
    s: "The per-file operations the engine calls: read and write at an offset, truncate, sync, file size, lock and unlock, and the device characteristics query.",
    d: "A file object exposes methods for positioned reads and writes, truncate, sync, size, lock, unlock, check-reserved-lock, file control for private options and, optionally, shared memory and memory mapping. A read that returns fewer bytes than requested must zero-fill the rest and report a short read, which the engine uses to detect end of file. The device characteristics method reports sector size and flags such as safe append and atomic write sizes, which the pager uses to decide how many syncs are needed. Hard because semantic details differ between platforms.",
    k: ["Positioned read and write calls vs sequential streams: the pager addresses pages by number so each call is independent and thread-safe, but cannot batch with seeks.", "Device characteristics queried from the VFS vs fixed assumptions: the pager can skip syncs on capable devices, but a wrong answer corrupts data."],
    p: ["A short read not zero-filled leaves stale memory in a page that is then treated as data.", "A write that returns success but was only buffered by the layer above breaks every later ordering assumption."],
    v: "Wrap the file methods to inject a short read at the end of file and confirm the engine zero-fills, treats it as end of file and does not report corruption.",
    dep: ["vfs-interface", "sync-calls"]
  },
  "sync-calls": {
    s: "The operation that forces buffered writes to durable storage, in a data-only or full form, whose placement in the commit sequence the whole durability guarantee depends on.",
    d: "The engine calls sync at specific points: after writing journal records, after the journal header update, after writing database pages, and after creating or deleting files for the directory. A flag chooses a normal or a full sync, mapped to the strongest flush the platform offers, since some default calls do not flush the drive cache. Hard because platforms differ: a call that returns without reaching the medium makes everything else untrustworthy, and flushes are expensive, often the main cost of a commit.",
    k: ["Full flush of the drive cache vs a cheaper sync: real durability, but several times slower per commit on some devices.", "Sync the containing directory on file creation vs skip: the file's existence is made durable, at the cost of an extra flush."],
    p: ["A platform sync that only flushes to the operating system cache makes durability claims false while all tests pass.", "Disabling syncs for speed in a test configuration shipped to production."],
    v: "Count syncs for a single-row commit with tracing, compare with the commit protocol's required count, and confirm on the real device that a full flush call reaches the media by power-cut testing.",
    dep: ["file-io-methods", "vfs-interface"]
  },
  "shared-memory-methods": {
    s: "VFS methods that map named regions of a shared file or memory, take small locks on them and issue barriers, giving all processes the same view of the log index.",
    d: "The methods are map (obtain a region of given size), lock (take shared or exclusive locks on numbered slots), barrier (ensure memory ordering) and unmap. The default implementation maps a file next to the database so separate processes see one region. Locks on slots implement the log's writer, checkpointer and reader marks. A VFS can instead use heap memory when all connections live in one process, removing the dependency on a mapped file. Hard because a correct implementation needs memory barriers and robust lock release on process death.",
    k: ["Mapped file shared by processes vs heap memory in one process: multi-process access, but needs a file system supporting mapping and locking.", "Slot locks with crash-safe release vs counters: stale locks disappear when a process dies, but depends on the operating system's lock cleanup."],
    p: ["Omitting the memory barrier lets one process read a partly updated index entry on weakly ordered processors.", "A file system without shared mapping silently works in one process and fails across several."],
    v: "Open the same log-mode database from two processes, commit in one and confirm the other sees it immediately through the shared region, then kill one process holding a slot lock and confirm the other proceeds.",
    dep: ["vfs-interface", "wal-index", "lock-levels"]
  },
  "vfs-shims": {
    s: "VFS implementations that wrap another VFS to add behavior: logging, encryption, compression, fault injection, in-memory overlays or access to nonstandard storage.",
    d: "A shim registers a new VFS that forwards each method to a parent VFS after or before doing its own work, then installs itself as default or as a named choice. File objects are wrapped in the same way, so every read and write passes through. Shims implement tracing, simulated failures, page encryption and virtual file systems over other media. Because they sit below the pager, they cannot see SQL, only pages and offsets. Hard because they must forward every method faithfully, including the less common file control and sector size calls.",
    k: ["Stacking wrappers vs forking the OS layer: features compose and can be added without changing the core, but each layer adds a call and must forward everything correctly.", "Wrap files transparently vs expose a new API: existing applications gain features by naming a VFS at open, but shims work only on page-level data."],
    p: ["A wrapper that forgets to forward the device characteristics query silently changes sync behavior of the whole stack.", "Order of stacked shims matters: encrypting after compressing differs from the reverse and cannot be changed later."],
    v: "Stack a logging shim over a fault-injecting shim, run a transaction and confirm every file operation is recorded and an injected failure surfaces as an error to the application.",
    dep: ["vfs-interface", "file-io-methods"]
  },
  "memory-allocator": {
    s: "A replaceable allocation interface with optional lookaside pools and a page cache pool, so the library never depends on one system allocator and can run in fixed memory.",
    d: "All allocation goes through a table of functions: allocate, free, reallocate, size query and rounding. The default wraps the system allocator and tracks usage. Alternative allocators include zero-malloc modes that serve all requests from a buffer supplied at start-up, and debug allocators that pad and check blocks. A per-connection lookaside pool of small fixed slots serves the frequent small allocations of the compiler without calling the allocator. Hard because every allocation can fail, and the engine must unwind cleanly from an out-of-memory result at every point.",
    k: ["Pluggable allocator vs system allocator only: runs in fixed memory with no fragmentation surprises, but the host must provide a correct one.", "Lookaside pools of small blocks vs per-allocation calls: much faster compilation and less fragmentation, but a fixed memory reservation per connection."],
    p: ["An allocation failure handled incorrectly in one rarely run path becomes a crash or corruption in production.", "A custom allocator that is not thread-safe in a threaded build corrupts the heap."],
    v: "Run the test suite with an allocator that fails the Nth allocation for every N, and confirm each failure returns an out-of-memory error with no leak and no corruption.",
    dep: ["memory-limits"]
  },
  "memory-limits": {
    s: "Soft and hard caps on heap use, plus limits on statement length, expression depth, column count, and attached databases, that bound what hostile or buggy input can consume.",
    d: "A soft heap limit asks the library to free caches, releasing clean pages first, to stay under a target, while a hard limit makes allocations fail. Separate runtime limits cap the length of SQL text and of any value, the depth of expressions and compound selects, the number of columns, terms in an expression, function arguments, attached databases and variables. Each can be lowered per connection but not raised above the compile-time maximum. Hard because limits must be checked at every point where input grows, so they protect against hostile SQL.",
    k: ["Soft limit that shrinks caches vs a hard failure: the application survives pressure by running slower, but the limit is advisory under load.", "Per-connection limits lowered by the host vs fixed maxima: untrusted SQL can be confined, but the host must choose values that do not break legitimate queries."],
    p: ["A limit missing on one growth path lets a crafted statement consume all memory.", "A soft limit set below the working set makes the cache thrash instead of failing visibly."],
    v: "Set a small heap limit and run a query that sorts a large table, then confirm it either completes within the limit using temporary files or fails with a clear error rather than exhausting memory.",
    dep: ["memory-allocator"]
  },
  "temp-files": {
    s: "Anonymous files for the sorter, ephemeral tables, statement journals and vacuum, created on demand in a configured directory and removed on close or crash.",
    d: "Temporary storage serves transient indexes, large sorts, materialized subqueries, the statement journal, and rebuild during vacuum. A temporary database is a normal pager over a file that is created lazily and deleted on close, or kept in memory depending on settings; small temp tables stay in the cache and only spill when large. The VFS opens the file in a way that makes the operating system delete it automatically if the process dies. Hard because the location needs space and the right permissions, and sandboxed hosts often lack a writable directory.",
    k: ["Spill to disk only when large vs always in memory: small queries stay fast and memory-bound, but huge ones succeed with a slower path.", "Delete-on-close anonymous files vs named temp files: nothing is left behind after a crash, but the files cannot be inspected."],
    p: ["A sandbox without a writable temporary directory makes large sorts fail with a confusing I/O error.", "Temp files on a small tmpfs fill memory when large sorts run."],
    v: "Run a sort larger than the cache with a configured temp directory, confirm files appear during the sort and are gone after, and that none remain after killing the process mid-sort.",
    dep: ["vfs-interface", "file-io-methods"]
  },
  "branch-coverage-testing": {
    s: "Test suites measured for coverage of every machine-code branch, not just lines, so every decision in the engine is exercised in both directions.",
    d: "Tests include a fast set run by developers, a very large set run for releases, and tests written specifically to take rarely used branches such as error paths. Coverage is measured on branches of the compiled code, with the goal of near-total coverage, and untaken branches are examined individually. Defensive code that cannot be reached is marked and kept out of the count. Because the engine must handle all failures gracefully, many tests are about errors, not features. Hard because the last few percent are branches reachable only by failures or corruption.",
    k: ["Branch coverage as a goal vs line coverage: finds untested decisions inside a covered line, but the target is costly to reach.", "Tests of internal functions with direct access vs public API only: unreachable paths can be covered, but tests tie to internals."],
    p: ["Coverage with assertions disabled misses invariant checks, and with defensive branches counted gives false confidence.", "Reaching 100 percent of branches does not show values are right: coverage measures execution, not correctness."],
    v: "Run the full test suite instrumented for branch coverage and list every untaken branch; confirm the report shows the documented near-total percentage and each exception is justified in writing.",
    dep: ["fault-injection", "assertions-and-invariants"]
  },
  "fuzz-testing": {
    s: "Automatically generated SQL statements and corrupted database files fed to the engine continuously, looking for crashes, hangs, memory errors and wrong results.",
    d: "SQL fuzzers mutate and grow statements from a grammar and from existing tests, running them under memory and undefined-behavior checkers. Database fuzzers take valid files and flip bytes in headers, cells and schema text, then run queries and an integrity check, since a file from an untrusted source is attack surface. Differential fuzzers compare results against other engines or against the same query with optimizations off. Hard because a database file is both data and code, with schema SQL parsed from inside the file, and because crashes only appear after many random mutations.",
    k: ["Grammar-aware SQL fuzzing vs random bytes: reaches deep planner and code generator paths, but needs maintenance as the dialect grows.", "Corrupt-file fuzzing as a requirement vs assuming trusted files: protects applications that open user-supplied databases, but makes every reader defensive and slower."],
    p: ["Fuzzing only well-formed SQL leaves the tokenizer and error paths untested.", "A fuzzer that crashes on a file whose schema text contains hostile SQL shows the schema parse needs the same limits as user SQL."],
    v: "Run a corrupt-file fuzzer for many hours under address and undefined-behavior checking, then confirm zero crashes and that every rejected file returns a corruption error and not a fault.",
    dep: ["assertions-and-invariants", "integrity-check", "memory-limits"]
  },
  "fault-injection": {
    s: "Tests that force allocation failures, I/O errors, disk-full and short reads at every possible point, then check that the engine recovers without leak or corruption.",
    d: "A test allocator fails the Nth allocation, and a test VFS fails the Nth read, write, sync or open, for increasing N until a run completes without hitting the injected failure. After each failure the test checks that an error was returned, the connection is usable, and the database still passes the integrity check. Transient and persistent failure modes are both used. It is hard to keep this exhaustive as code grows, and because many error paths are visited only here, so the harness is how those paths are proven correct.",
    k: ["Systematic fail-the-Nth injection vs random failures: every failure point is covered once and runs are reproducible, but the number of runs grows with program length.", "Inject in a shim VFS vs patching the engine: the test target is the production code, but only faults visible at the VFS boundary can be simulated."],
    p: ["An error path that frees a pointer twice or leaks only shows up when the failure hits that exact allocation.", "A test that checks only the error return and not the database state after misses silent corruption."],
    v: "Run the standard workload with the Nth I/O failing for every N; confirm each run returns an error or succeeds, no leak is reported, and the integrity check passes afterward in all runs.",
    dep: ["memory-allocator", "vfs-shims", "integrity-check"]
  },
  "crash-simulation": {
    s: "A test VFS that models a power cut: it records writes, then discards or scrambles unsynced data, so recovery can be checked at every possible crash point.",
    d: "The simulated device keeps a model of what is durable: synced data survives, and unsynced writes may be lost, partially applied at sector granularity, or reordered. A test runs a transaction, stops at a chosen write, applies one of the possible post-crash states, then reopens the database through the normal recovery path and verifies it contains the old or the new content, never a mix. This turns the durability argument into a test. Hard because the set of legal post-crash states is large, and the model must be at least as hostile as real devices.",
    k: ["Model unsynced data as arbitrarily lost or scrambled vs only lost: catches ordering bugs that a mild model passes, but needs the harness to enumerate many states.", "Run at the VFS boundary vs real power cuts: fast, repeatable and automatic, but real hardware behavior must be checked separately."],
    p: ["A model that is kinder than real devices passes protocols that fail in the field.", "Testing only the commit path and not recovery of recovery, where a crash happens during rollback itself."],
    v: "For every write in a transaction, simulate a crash with random sector loss, reopen and verify the data equals the old or new state exactly, and repeat with a crash during the recovery itself.",
    dep: ["vfs-shims", "hot-journal-recovery", "integrity-check"]
  },
  "assertions-and-invariants": {
    s: "Internal checks compiled into test builds that verify structural invariants, such as page offsets, reference counts, lock state and cursor validity, at every step.",
    d: "Assertions state conditions that must hold: a page is journaled before it is modified, a cursor is valid before use, a lock level is consistent with the pager state, and free-space counters match the real gaps. They run in debug builds during all tests, and are compiled out of release builds for speed. Companion verification routines walk whole structures after operations. Hard because a hot-path assertion changes timing, and because the condition itself must be correct, so assertions are checked against code that is covered by tests.",
    k: ["Many assertions compiled out of release builds vs checks kept in production: no speed cost for users, but production runs without the safety net.", "Assertions that state intent vs defensive code that handles violations: assertions make bugs fail loudly in tests, but a violation in production is undefined unless defensive branches remain."],
    p: ["Testing only with assertions on may miss performance-driven bugs, while release builds untested with assertions off may behave differently.", "An assertion with a side effect changes behavior between debug and release builds."],
    v: "Run the full test suite in an assertion-enabled build and confirm zero assertion failures, and that deliberately breaking an invariant in the code triggers a failure within the suite.",
    dep: ["page-references-and-dirty-list", "pager-state-machine", "btree-cursor"]
  },
  "integrity-check": {
    s: "A built-in command that walks every tree, free list and index and verifies structure, ordering, page ownership and that each index entry matches its table row.",
    d: "The check visits every page reachable from the schema roots and the free list, verifying that each page is reached exactly once, cell offsets are inside the page, keys are in order, interior bounds match children, overflow chains end correctly, and free-space counters match. For each index it compares the entries with the table rows both ways. It also checks constraints and records in the header. It reports a bounded list of problems in text. Hard because on a corrupted file it must itself not crash or loop, and it reads the whole database, so it is slow on large files.",
    k: ["Full verification of structure and index content vs a quick check of structure only: finds missing or extra index entries, but reads every page and every row.", "A built-in command vs an external checker: always available to the application, but shares code with the engine it verifies."],
    p: ["Running it on a live production database blocks writers because it holds a read transaction for the whole scan.", "A passing check does not prove the application data is meaningful, only that the file structure is sound."],
    v: "Deliberately corrupt one cell pointer and one index entry in a copy of a database, run the check and confirm it reports both problems by page number and does not crash.",
    dep: ["page-layout", "table-btree", "index-btree", "freelist"]
  }
});
