// Details for the filesystem plate, part 1: tools, format evolution, directories, access control.
ATLAS.details("filesystem", {
  "mkfs-tool": {
    s: "Writes a fresh filesystem onto a device: computes geometry, lays out group metadata, the root directory and journal, and stamps the superblock with chosen features.",
    d: "The tool reads device size, sector sizes and optional topology hints, then chooses block size, group size, inode count and journal size from defaults or user options. It writes the group headers, empty bitmaps or trees, reserved inodes, the root directory and finally the superblock, so a half-finished run does not look like a valid volume. Zeroing inode tables eagerly takes hours on large devices, so lazy initialization defers it to the driver. Choices made here, such as inode ratio, are hard or impossible to change later.",
    k: ["Fixed inode count at creation vs dynamic inode allocation: fixed tables are simple and fast to scan but can run out of inodes while blocks remain; dynamic allocation avoids that at the cost of more metadata structures.", "Eager vs lazy table initialization: eager is predictable after first mount; lazy makes mkfs finish in seconds but puts background writes on the first hours of use."],
    p: ["An inode ratio picked for large media files leaves a volume that fills with small files hitting the inode limit while showing free space.", "Running the tool on a device that still holds an older signature leaves stale magic numbers that confuse probing tools."],
    v: "Create a filesystem on a sparse image, run the checker read-only to get a clean report, mount it, and compare reported inode and block totals with the chosen options.",
    dep: ["superblock", "allocation-groups", "feature-flags", "root-and-lost-found"]
  },
  "tuning-tool": {
    s: "Adjusts parameters of an existing filesystem without recreating it: labels, reserved space, check intervals, default mount options, and some feature flags.",
    d: "The tool opens the device, edits fields in the superblock and sometimes group descriptors, and rewrites the superblock and its backups. Changes that only alter policy, such as reserved block percentage or default options, are safe on a mounted volume or take effect at next mount. Enabling a feature that changes on-disk structures may be refused, or may require a checker run afterward. The difficulty is that editing a mounted filesystem's superblock from userspace can race the driver's own updates.",
    k: ["Offline-only edits vs edits on a mounted volume: offline is safe against races but forces downtime; online edits go through the driver or an ioctl, which needs kernel support per field.", "Allowing risky feature toggles vs requiring a checker run: permissive tools are convenient but let a volume mount with half-converted structures."],
    p: ["Editing the primary superblock but not its backups makes a later checker run silently revert the change.", "Turning on a feature flag without the matching structures makes the next mount fail or, worse, mount and misread data."],
    v: "Change the label and reserved-space percentage, then confirm with the dump command that primary and backup superblocks agree and that the mounted volume reports the new values.",
    dep: ["superblock", "backup-superblocks", "feature-flags"]
  },
  "fsck-checker": {
    s: "Walks every on-disk structure of an unmounted filesystem in passes and reports inconsistencies, such as blocks claimed twice, wrong link counts and bitmap mismatches.",
    d: "A classic checker runs ordered passes: inodes and their block maps, directory structure, connectivity from the root, link counts, then free-space accounting rebuilt from what was found and compared to what is stored. It builds large in-memory tables of block ownership, so memory use grows with filesystem size and file count. It replays the journal first when one exists. Copy-on-write designs check tree structure, back-references and checksums rather than bitmaps.",
    k: ["Full scan vs journal-trusting check: trusting a clean journal makes boot checks instant but misses corruption that happened without a crash.", "In-memory ownership tables vs on-disk scratch space: memory is fast but a hundred-million-file volume can exhaust RAM; scratch files slow the run by an order of magnitude."],
    p: ["Running a repairing check on a device that is also mounted corrupts it further.", "A run that needs more memory than the machine has gets killed mid-pass, leaving the volume marked as needing a check with nothing fixed."],
    v: "Corrupt a known block pointer on a test image, run the checker read-only and confirm it names the right inode and error class, then repair and confirm a second run reports clean.",
    dep: ["superblock", "inode-table", "free-space-bitmaps", "journal-replay", "directory-entries"]
  },
  "repair-pass": {
    s: "The part of a checker that changes the disk: clearing bad inodes, reattaching orphans, duplicating shared blocks, and rebuilding free-space metadata from the surviving structures.",
    d: "Each class of damage has a fixed remedy. An inode with an out-of-range block pointer is cleared; blocks claimed by two files are cloned for one of them; unreachable inodes move to a recovery directory; bitmaps and counters are rewritten from the walk. Remedies run in an order that avoids acting on data a previous step is about to discard. Some tools ask per fix, some apply all. It is hard because the repair must be idempotent and must not turn recoverable damage into loss.",
    k: ["Automatic fix-all vs interactive confirmation: automatic suits unattended boots; interactive lets an expert decline destructive fixes but does not scale beyond a few errors.", "Repairing in place vs repairing a copy: in place needs no spare space but a bug is irreversible; a copy needs a second device the size of the volume."],
    p: ["Clearing an inode with a corrupt size field loses a file that was recoverable by hand.", "Repair that rebuilds free space from a wrong ownership table marks live blocks free and invites overwrites."],
    v: "On an image with duplicated blocks, run repair and confirm both files read back distinct, correct contents, that unreachable inodes appear in the recovery directory, and that a rerun finds nothing.",
    dep: ["fsck-checker", "root-and-lost-found", "free-space-bitmaps", "inode-table"]
  },
  "debug-inspector": {
    s: "A low-level tool for reading and editing raw structures: print the superblock, an inode, an extent tree or a directory block by number, and patch fields for repair or testing.",
    d: "It opens the device or an image directly and decodes structures using the same layout definitions as the driver. Commands list group metadata, dump an inode's mapping, trace which blocks a path resolves to and find which file owns a block. Write mode lets an expert clear a flag or fix a pointer. It is the usual tool for post-mortems when the checker gives up. The difficulty is that it bypasses every safety rule, including checksums and the journal.",
    k: ["Read-only default with explicit write mode vs always writable: a guard prevents accidents, at the cost of friction during emergency repairs.", "Sharing layout code with the driver vs an independent decoder: sharing guarantees agreement but repeats a driver bug; an independent decoder can catch it."],
    p: ["Editing a metadata block directly without updating its checksum makes the driver reject the block on the next read.", "Inspecting a mounted device shows a torn view, because the journal holds newer copies of the blocks being read."],
    v: "Resolve a file path to its inode and extent list with the tool, then read those blocks from the raw device and compare them byte for byte with the file's contents through the mount.",
    dep: ["inode-structure", "extent-mapping", "superblock", "metadata-checksums"]
  },
  "defrag-tool": {
    s: "Rewrites fragmented files into fewer, larger extents, using kernel support to move data while the file stays open and consistent.",
    d: "A userspace tool finds files with many extents, asks the kernel to allocate a contiguous target and then swaps the old blocks for the new ones. The kernel copies data under the file's locks and updates the mapping atomically, so readers see old or new, not a mix. Copy-on-write designs must also decide what happens to shared extents: defragmenting a snapshotted file can unshare it and multiply space use. Free space fragmentation is a separate problem the tool can rarely fix.",
    k: ["Moving data online vs only when unmounted: online is usable on servers but competes with foreground I/O and needs locking; offline is simple but needs downtime.", "Preserving sharing between snapshots vs maximizing contiguity: keeping shared extents saves space but leaves the file fragmented; unsharing helps the file and may fill the volume."],
    p: ["Defragmenting every file of a snapshotted subvolume silently duplicates all shared data and fills the device.", "Defragmenting on flash media adds write wear for no latency gain."],
    v: "Create a file written in interleaved small chunks, record its extent count, run the tool and confirm a lower count with identical checksum and unchanged contents when read back.",
    dep: ["extent-mapping", "extent-allocator", "reflinks", "fragmentation-control"]
  },
  "image-tool": {
    s: "Copies filesystem metadata, or a whole volume, into a compact image for support, testing and forensics, optionally scrubbing file names.",
    d: "The tool reads the superblock and walks the structures, writing only blocks that matter: metadata always, data optionally. A metadata-only image is a sparse file that mounts or checks like the original, letting developers reproduce a corruption without the user's data. Name obfuscation replaces directory entries with hashes of the same length. Another mode copies used blocks only, to move a volume to a smaller device. Consistency needs the volume unmounted or frozen.",
    k: ["Metadata-only vs full images: metadata-only is small and shareable but cannot reproduce data-dependent bugs; full images are complete and large.", "Name obfuscation vs raw names: obfuscation protects privacy but hash-sorted directories may then differ in order from the original, hiding ordering bugs."],
    p: ["Imaging a live, mounted volume captures metadata from different moments, so the image fails its own check.", "Obfuscated names can collide, producing an image whose directories are invalid."],
    v: "Take a metadata image of a populated volume, run the checker on the image, and confirm identical inode and block counts to the source with no file contents in the image file.",
    dep: ["superblock", "inode-table", "directory-entries"]
  },
  "scrub-and-balance-cli": {
    s: "Commands that start, pause and report on long-running background jobs in the mounted driver: scrub, balance, resize, device operations, and their progress.",
    d: "These tools do little work themselves. They call ioctls or write to control files, the driver starts a kernel thread, and the tool polls for progress, errors and an estimated finish time. Jobs can be paused, resumed after reboot and cancelled. Output summarizes bytes verified, errors corrected and uncorrectable blocks with their file paths, resolved through back-references. The hard part is that these jobs run for hours to days on large volumes and must coexist with normal I/O and with each other.",
    k: ["Kernel-resident jobs vs userspace loops: kernel jobs see the structures directly and can lock correctly; userspace loops are easier to debug but race with changes.", "One exclusive job at a time vs concurrent jobs: exclusivity avoids lock conflicts and surprises, but delays urgent work such as a device replacement."],
    p: ["Starting balance and scrub together on a busy volume saturates the disks and starves applications.", "Error output that lists only block numbers leaves operators unable to tell which files are damaged."],
    v: "Start a scrub on a test volume with one corrupted block, watch status report one error with the affected file path, pause and resume it, and confirm the final totals add up.",
    dep: ["scrubbing", "relocation-and-balance", "online-resize", "device-replace"]
  },
  "feature-flags": {
    s: "Bit sets in the superblock declaring which optional structures a volume uses, split by what an unaware driver may safely do: ignore, mount read-only, or refuse.",
    d: "Three groups are typical: compatible features that any implementation may ignore, read-only-compatible features that block writing but not reading, and incompatible features that forbid mounting. The driver checks its supported masks at mount and refuses on an unknown bit. Tools check the same masks. Turning a feature on is usually one-way. The design lets new capabilities ship without a version bump and keeps old software from damaging volumes it cannot interpret.",
    k: ["Feature bits vs a single version number: bits let features enable independently and in any order; a version number is simpler to reason about but forces all-or-nothing upgrades.", "Classifying a feature as compatible vs incompatible: compatible keeps old kernels working but risks them breaking an invariant they do not know about."],
    p: ["Marking a feature compatible when old drivers would corrupt it lets an old kernel mount and damage the volume.", "Enabling a feature on a volume shared with a boot loader that lacks support makes the machine unbootable."],
    v: "Enable a new feature on a test image, then mount with a build that lacks it and confirm refusal with the feature named, and with a read-only-compatible unknown bit confirm a read-only mount succeeds.",
    dep: ["superblock"]
  },
  "format-versioning": {
    s: "The rules for changing on-disk structures over time: version stamps, per-structure revisions, and the guarantee that older data stays readable.",
    d: "Structures carry a revision number or length so readers can tell an old inode layout from a new one. Larger inodes add fields after a fixed prefix, and readers use a recorded extra-size field to skip what they do not know. Tools gain conversion commands, and the driver can upgrade lazily, rewriting a structure when touched. Compatibility tests mount archives of images from every past release. It is difficult because a format is a contract with every tool, boot loader and recovery disk ever shipped.",
    k: ["Lazy per-structure upgrade vs a one-shot conversion: lazy avoids downtime but leaves mixed generations forever; one-shot is clean but slow and hard to roll back.", "Sizing fields for growth up front vs adding revisions later: reserved space is cheap early on but is wasted if never used."],
    p: ["A field repurposed without a version change gets read as its old meaning by older tools, producing wrong data silently.", "Without archived images from old releases, a refactor breaks mounting of volumes created years ago and nobody notices until a user does."],
    v: "Mount images generated by every supported past release of the tools, read a known file tree from each, and confirm checksums match a stored manifest.",
    dep: ["superblock", "inode-structure", "feature-flags"]
  },
  "mount-negotiation": {
    s: "The sequence at mount that validates the superblock, compares feature masks, replays or checks recovery state, and decides between read-write, read-only and refusal.",
    d: "The driver reads the superblock, verifies magic, checksum and geometry, and compares feature flags with what it supports. It then looks at recovery state: if the volume was not cleanly unmounted it replays the journal or selects the newest valid tree root. Errors in this phase choose a fallback, such as trying a backup superblock or mounting read-only. Only after that does it start background threads and expose the root. It is hard because every failure mode needs a defined outcome that does not worsen the damage.",
    k: ["Strict validation vs best-effort mount: strict stops early on any inconsistency; best-effort keeps data reachable, at the risk of writing atop bad metadata.", "Replaying recovery automatically vs requiring a manual step: automatic is what users expect, while manual recovery allows imaging the device first."],
    p: ["Replaying a journal on a read-only block device fails, and the volume then refuses to mount at all.", "Falling back to a backup superblock that is stale makes the driver miss recent features and allocate over live data."],
    v: "Power-cut a test volume mid-write, then mount it and confirm the kernel log shows recovery performed, the mount succeeds, and the file tree matches a committed state with no checker errors.",
    dep: ["superblock", "feature-flags", "journal-replay", "backup-superblocks", "atomic-root-commit"]
  },
  "mount-options": {
    s: "Parameters given at mount that change behavior without changing the format: journaling mode, error policy, commit interval, barrier use, discard, and access time updates.",
    d: "Options are parsed into the in-memory superblock info, overriding defaults stored in the on-disk superblock. Many trade safety for speed, such as disabling flushes or choosing data-writeback mode, and the driver must reject contradictory combinations. Some options can change on remount, and others only at first mount. Documentation and defaults matter because most operators never change them and inherit what the format's authors thought safe.",
    k: ["Safe defaults vs fast defaults: safe defaults protect unaware users but look slow in benchmarks; fast defaults invite data loss claims.", "Remountable vs mount-time-only options: remountable ones let operators react live, but each needs code that works while I/O is in flight."],
    p: ["An option copied from a tuning guide, such as disabling write barriers, loses data on power failure on hardware with volatile caches.", "Access-time updates left at their default produce a stream of metadata writes during reads."],
    v: "Mount twice with different commit intervals and confirm via statistics that journal commits occur at the set rate, then remount with a changed option and confirm it takes effect without unmount.",
    dep: ["mount-negotiation", "superblock", "barriers-and-flushes"]
  },
  "online-resize": {
    s: "Grows a mounted filesystem into added space, and in some designs shrinks it, by adding groups or relocating data and then updating geometry atomically.",
    d: "Growing writes new group metadata into the added space, then extends the last group or appends new ones and updates the superblock and descriptor table. Descriptor tables may need reserved blocks planned at mkfs, or a different layout that places them anywhere. Shrinking must first move every block and inode out of the removed range, which is a relocation and a heavy operation. The difficulty is doing this while allocators, journal and other threads run, and surviving a crash partway.",
    k: ["Reserved growth space at mkfs vs layouts that grow anywhere: reservation is simple but caps growth; flexible layouts need more indirection.", "Supporting shrink vs growth only: shrink makes volumes flexible but demands full relocation machinery and many more failure cases."],
    p: ["Growing past the limit of reserved descriptor space fails midway and needs an offline conversion.", "A shrink interrupted by a crash leaves data in the cut region unless the operation is journaled or resumable."],
    v: "Fill a volume near capacity, extend the underlying device, grow online while writing, then confirm total free space rose by the added amount and the checker reports clean afterward.",
    dep: ["group-descriptors", "allocation-groups", "superblock", "relocation-and-balance"]
  },
  "offline-conversion": {
    s: "Tools that change a volume from one format generation or feature set to another while unmounted, rewriting structures that cannot change in place.",
    d: "Examples include converting indirect block maps to extents, adding checksums to all metadata, or converting from one filesystem design to another using the old one's free space for the new structures. The tool walks files, builds new mappings, and keeps an undo image so conversion can roll back. It runs only on a clean volume. Because blocks are rewritten at scale, it needs spare free space and a checker pass before starting.",
    k: ["Keeping a rollback image vs converting destructively: a rollback needs free space and a clean decision window; destructive conversion needs none and cannot be undone.", "Converting in place vs migrating to a new volume: in place avoids copying terabytes, but a failure mid-way leaves a hybrid that neither driver reads."],
    p: ["Starting conversion on a volume with unreported errors compounds them into unreadable files.", "Running out of free space during conversion aborts after metadata has already been partially rewritten."],
    v: "Convert a populated test image from old mapping to extents, mount it, compare every file checksum with a manifest taken before conversion, and run the checker clean.",
    dep: ["legacy-block-maps", "extent-mapping", "feature-flags", "fsck-checker"]
  },
  "runtime-statistics": {
    s: "Counters, per-device state files and tracepoints exposed by the driver so operators can see commits, allocations, errors and latency while the volume is in use.",
    d: "The driver updates cheap counters on hot paths and exposes them through a pseudo-filesystem or control files: journal commit counts and times, allocator hits, error totals, reservation state, device stats. Tracepoints give per-event detail when enabled, at higher cost. Tools aggregate these into latency histograms and per-process I/O views. The difficulty is overhead: counters touched by every I/O must be per-CPU, and tracepoints must be free when off.",
    k: ["Per-CPU counters vs a shared atomic: per-CPU counters scale across cores but reads sum approximate values; atomics are exact and contend heavily.", "Always-on counters vs on-demand tracing: always-on shows history when a problem is reported; tracing gives detail but only after someone thinks to enable it."],
    p: ["Treating a cumulative error counter as current state hides that the problem ended last week, or has just restarted.", "Verbose tracepoints enabled on a busy volume slow the very behavior being investigated."],
    v: "Run a workload of a known number of synchronous writes and confirm the commit counter and fsync tracepoint counts rise by the expected amounts and the reported latency distribution matches an external timer.",
    dep: ["commit-and-checkpoint", "extent-allocator", "error-policy"]
  },
  "directory-entries": {
    s: "The records that map a name to an inode number plus a type hint, stored in directory file blocks, with rules for insertion, removal and iteration.",
    d: "A simple directory is a file whose blocks hold variable-length entries: inode number, record length, name length, type, name. Deleting merges an entry's space into its predecessor, so lookup stays a linear scan within a block. Iteration returns entries in storage order, with a position cookie that must survive concurrent changes. The type hint saves an inode read during listing. It is hard because readdir, rename and unlink may run concurrently, and cookies must stay valid.",
    k: ["Linear blocks vs indexed lookup: linear is compact and trivial to repair but costs time proportional to directory size; indexes speed lookup and add structure to keep consistent.", "Storing the file type in the entry vs reading the inode: the hint makes listings fast but is another field that can disagree with the inode."],
    p: ["A directory entry whose inode number is out of range crashes a lookup path that trusts it.", "Readdir cookies based on byte offsets break when a concurrent delete or index rebuild moves entries."],
    v: "Create ten thousand files in one directory, list it, delete half while a listing is running, and confirm that no surviving name is skipped or repeated and the checker finds no orphaned entries.",
    dep: ["inode-structure", "extent-mapping", "rename-atomicity"]
  },
  "hashed-directory-index": {
    s: "A shallow tree of hash values layered over linear directory blocks, so a lookup in a huge directory reads two or three blocks instead of all of them.",
    d: "Names are hashed with a seeded function; an index block maps hash ranges to leaf blocks that hold ordinary directory entries. Lookup hashes the name, walks the index, then scans one leaf. When a leaf fills it splits by hash, and the index gains an entry or a level. Because the leaves remain valid directory blocks, an old implementation can still read the directory linearly. Readdir returns entries in hash order, which is stable under splits but unrelated to creation order.",
    k: ["Hash order vs creation order in listings: hash order makes iteration stable across splits, but applications that expect inode or creation locality lose read speed.", "Index over ordinary leaves vs a separate tree: compatibility with simple readers is kept, but splits and checker repair become more intricate."],
    p: ["A hash seed that is not stored or is reused across volumes lets an attacker pick names that all collide into one leaf.", "A crash between a leaf split and the index update leaves the index pointing at a stale range."],
    v: "Create a million files in one directory, measure lookup of a random name against a linear directory of the same size, and confirm reads touch a handful of blocks with a block trace.",
    dep: ["directory-entries", "case-folding-and-hashing", "inode-allocation"]
  },
  "btree-directories": {
    s: "A directory stored as keys in a balanced tree, keyed by name hash or by sequence number, giving ordered, logarithmic lookup and insertion.",
    d: "Each entry becomes an item in the filesystem's tree, keyed by the directory's inode plus a hash of the name, with collisions chained by extra fields. Another set of items keyed by creation sequence allows listing in creation order with stable cookies. Insertion and removal are ordinary tree changes covered by the same transaction machinery as everything else. It is hard because two keyed copies of every entry must be kept consistent, and large directories create large amounts of tree churn.",
    k: ["Dual indexes by hash and by sequence vs a single index: two indexes give fast lookup and ordered listing, but double the writes and the repair cases.", "Hash keys vs full-name keys: fixed-size hashes keep nodes dense but need collision handling; full names are exact and make nodes variable and sparse."],
    p: ["A mismatch between the two index copies makes a name visible in a listing but not openable.", "Mass deletion in a huge directory generates enormous tree updates in a single transaction and stalls commits."],
    v: "Create and delete a million entries in one directory, then verify with the checker that both indexes agree, and compare lookup latency at ten and ten million entries to confirm logarithmic growth.",
    dep: ["cow-btrees", "directory-entries", "case-folding-and-hashing", "inode-structure"]
  },
  "inline-directories": {
    s: "Tiny directories stored inside the inode itself, avoiding a separate block for the common case of a handful of entries.",
    d: "When a directory has only a few short names, the entries are packed into spare space within the inode, including its extended attribute area. The parent link is held in a fixed spot. When it outgrows that space the driver allocates a block, copies the entries and switches the inode's mapping. Reading must handle both layouts in every code path. It saves a block and a disk read per small directory, which matters for trees with millions of small folders.",
    k: ["Inline small directories vs always allocating a block: inline saves space and an I/O for small folders but doubles the code paths for iteration, repair and conversion.", "Larger inodes for more inline room vs compact inodes: more room helps small data but wastes space for every file that does not use it."],
    p: ["The conversion from inline to block form is rarely exercised, and bugs there lose entries only when a directory crosses the threshold.", "Tools unaware of the feature misinterpret inode bytes as a mapping and report corruption."],
    v: "Fill a new directory one entry at a time past the inline limit, listing after every addition, and confirm the entries are identical before and after conversion and the checker is clean.",
    dep: ["inode-structure", "directory-entries", "extended-attributes", "inline-data"]
  },
  "case-folding-and-hashing": {
    s: "How names are compared and hashed: bytewise by default, optionally case-insensitive with normalization, with seeded hashes to resist collision attacks.",
    d: "Case-insensitive lookup folds names with a Unicode table before hashing and comparing, while storing the original spelling. The table version is recorded in the superblock so later tables cannot change which names are equal. Folding can be enabled per directory so one volume mixes both behaviors. Hash functions are seeded per volume. It is hard because normalization differs between applications, and a table change can make two existing names collide.",
    k: ["Bytewise names vs folded names: bytewise is exact and cheap and matches POSIX semantics; folding matches the expectations of ported applications but adds cost and edge cases.", "Per-directory vs whole-volume folding: per-directory limits the effect to folders that need it; whole-volume is simpler but forces one rule."],
    p: ["Upgrading the folding table after files were created can make two existing names equal, breaking the directory.", "Invalid byte sequences in names must either be rejected or tolerated, and both choices break some application."],
    v: "On a folding-enabled directory create a file named in one case, open it using another spelling, and confirm success while listing still returns the stored spelling; confirm a bytewise directory refuses.",
    dep: ["hashed-directory-index", "superblock", "inode-flags"]
  },
  "symlinks": {
    s: "Files whose content is a path. Short targets live in the inode, long ones in data blocks, and resolution happens in the generic path walker.",
    d: "A symlink inode stores its target string. If it fits in the space normally used for the block map, it is stored inline, making the link a single inode read. Otherwise one or more blocks hold it. The filesystem only returns the string; the virtual filesystem layer follows it, enforcing depth limits. Encrypted volumes encrypt the target as well. Fast and slow variants differ in code path, and the target length limit is a format decision.",
    k: ["Inline short targets vs always using a block: inline saves a block and a read for most links; it adds a mode that tools must handle.", "Storing targets raw vs encrypted: encryption protects the name structure but makes the target unreadable without the key, even for listing tools."],
    p: ["A target longer than the inline space but written by a buggy path to the wrong place corrupts neighboring inode fields.", "Dangling or looping links consume path-walk budget and surprise tools that follow them blindly."],
    v: "Create links of 10, 59, 60 and 4000 bytes, read each back with the readlink call and confirm exact strings; check the short ones use no data blocks via the inode's block count.",
    dep: ["inode-structure", "extent-mapping", "file-encryption"]
  },
  "hard-links-and-nlink": {
    s: "Several directory entries pointing to the same inode, tracked by a link count that decides when the inode and its blocks are freed.",
    d: "Creating a link adds an entry and increments the inode's count; unlink removes an entry and decrements it. When the count reaches zero and no process holds the file open, the inode and its data are released. Directories count subdirectory parent links, so link counts reflect the tree shape. Both changes belong to one transaction. Counts have a maximum, and some designs store overflow markers when a directory exceeds the field's capacity.",
    k: ["Counting subdirectory back-links in directories vs a fixed value: counting gives tools a quick subdirectory count and requires careful updates; a fixed value is simpler but loses the information.", "Freeing at zero links vs at zero links and zero opens: the second is required by POSIX, which makes unlinked-but-open files a state that must survive a crash."],
    p: ["A crash between decrementing the count and releasing the blocks leaks space unless the orphan list records it.", "Link-count overflow on a directory with tens of thousands of subdirectories wraps the field and later frees a live inode."],
    v: "Create ten hard links, delete nine, verify the data still reads; delete the last and confirm the free block count returns to its starting value and the checker finds no leaked blocks.",
    dep: ["inode-structure", "directory-entries", "orphan-list"]
  },
  "rename-atomicity": {
    s: "Moving or replacing a name in one atomic step, even across directories, so that observers and crash recovery see either the old or new state, never neither.",
    d: "A rename removes an entry from one directory, adds it to another, updates the parent pointer for a moved directory and possibly deletes an overwritten target, all in one transaction. The generic layer locks both directories in a defined order to prevent loops and deadlocks. Replace-style renames are the basis of the safe save pattern: write a temporary file, then rename over the original. Some systems add exchange and no-replace flags. The difficulty is ordering the data writes relative to the metadata.",
    k: ["Ordering data before rename vs leaving it unordered: ordering gives the safe-save pattern an expected result after a crash but forces writes early; leaving it risks zero-length files.", "Cross-directory locks taken in a global order vs per-directory ordering: a global order is simple to prove deadlock-free but serializes unrelated renames."],
    p: ["Without data ordering, a replace-by-rename pattern leaves an empty new file after a crash and loses the old one too.", "Renaming a directory into its own subtree must be rejected before any change, or the tree becomes unreachable."],
    v: "Loop a safe-save sequence of write, fsync, rename while killing power at random times, and confirm after every recovery the file holds either complete old or complete new contents.",
    dep: ["directory-entries", "transactions-and-handles", "data-ordering-modes", "orphan-list"]
  },
  "orphan-list": {
    s: "A persistent list of inodes that are unlinked or mid-truncate, so recovery can finish freeing them after a crash instead of leaking their space.",
    d: "When a file is unlinked while open, or a truncate changes many blocks, the inode is added to a list anchored in the superblock or a special inode. If the system crashes, mount walks the list, completing truncates and freeing the files. Normal close removes the inode from the list. In a journaled design this is part of the same transactions. It exists because POSIX lets an unlinked file stay usable, so a crash would otherwise leave an inode with zero links and allocated blocks.",
    k: ["A linked list through inodes vs a separate orphan file: a chain is cheap but serializes updates under one lock; a dedicated file scales with more parallelism and costs space.", "Finishing orphans at mount vs deferring them to a background thread: at mount is simple and delays boot; deferred is faster to mount and delays space reclamation."],
    p: ["A list that is corrupted into a cycle makes mount loop forever.", "Thousands of large orphans stall mount for minutes while their blocks are freed."],
    v: "Open a large file, unlink it, power-cut the machine, then mount and confirm the space is reclaimed, the log reports orphan cleanup and the checker finds no leaked blocks.",
    dep: ["inode-structure", "superblock", "hard-links-and-nlink", "journal-replay"]
  },
  "permission-bits": {
    s: "The mode word and owner and group identifiers in each inode, which the generic layer checks on every open, create, unlink and attribute change.",
    d: "The inode stores user and group IDs and a mode with read, write and execute bits for owner, group and others plus set-ID and sticky bits. The generic layer does the permission check; the filesystem supplies the fields and, for some network or id-mapped setups, hooks. Changing owner or mode is a metadata update in a transaction. Large identifier widths and per-mount ID mapping change how stored numbers translate to caller identities. The difficulty is subtle rules around clearing set-ID bits on write.",
    k: ["Checks in the generic layer vs in each filesystem: central checks are consistent and auditable; per-filesystem hooks let special designs apply their own rules and diverge.", "Stored numeric IDs vs name-based owners: numbers are compact and portable across mounts only when identities match; names would be portable but costly to store and resolve."],
    p: ["Failing to clear set-ID bits when a non-owner writes to a file leaves a privilege-escalation hole.", "Mounting a volume on a machine with different numeric identities silently gives files to the wrong users."],
    v: "As an unprivileged user attempt to read, write and execute files under each combination of owner, group and other bits, and confirm outcomes match the table, including set-ID clearing on write.",
    dep: ["inode-structure", "transactions-and-handles"]
  },
  "acls": {
    s: "Per-file lists of allowed and denied users and groups beyond the mode bits, stored as an extended attribute and merged into permission checks.",
    d: "An ACL holds entries for named users and groups with their permissions, plus a mask that caps them. It is stored as an extended attribute and cached in memory with the inode. Directories may carry a default ACL that new children inherit. Setting an ACL also updates the mode bits so the two views stay consistent, and chmod updates the mask. It is hard because inheritance, mask semantics and the interaction with creation modes have several corner cases that must match across all tools.",
    k: ["ACLs as an extended attribute vs inode fields: attributes need no format change and can grow, but every check may need an extra read unless cached.", "Cached parsed ACLs vs parsing per check: caching makes checks fast and adds invalidation rules whenever an attribute changes."],
    p: ["A new file created in a directory with a default ACL gets the wrong mode if the creation mask is applied in the wrong order.", "Copy tools that do not preserve attributes silently drop ACLs, widening or narrowing access."],
    v: "Grant a named user read on a file with an ACL, confirm that user can read and others cannot, then chmod the file and confirm the mask changes and the grant still behaves per the standard.",
    dep: ["extended-attributes", "permission-bits", "inode-structure"]
  },
  "extended-attributes": {
    s: "Named, namespaced byte values attached to files and stored in the inode when small, or in a separate block or tree when larger.",
    d: "Names fall into namespaces, such as user, system, security and trusted, each with its own permission rule. Small values live in spare inode space after the fixed fields; larger ones use an attribute block or, in tree-based designs, separate keyed items. Several users of the feature rely on it: ACLs, security labels, capabilities and application metadata. Sharing identical attribute blocks between inodes saves space and requires reference counting. Values have size limits that depend on format.",
    k: ["In-inode storage vs a separate block: in-inode is fast and avoids an I/O, but limits size and takes room from inline data; blocks are flexible and cost a read.", "Shared attribute blocks vs one per inode: sharing saves space when many files carry the same ACL, but adds reference counts and copy-on-write when one inode changes."],
    p: ["Attribute growth past the in-inode space moves everything to a block in the middle of an unrelated operation, surprising latency-sensitive code.", "Unbounded values per file let a user fill the volume's metadata space without quota accounting."],
    v: "Set small and large values on a file, read them back, check the small one adds no blocks while the large one does, and confirm the list call returns names with the correct namespace prefixes.",
    dep: ["inode-structure", "extent-mapping", "permission-bits"]
  },
  "security-labels": {
    s: "Mandatory-access-control labels and file capabilities kept in security-namespace attributes, set at creation and consulted by the security framework on every access.",
    d: "A label is a short string stored in an attribute in the security namespace. The security module sets it at file creation via an initialization callback so that the label and the inode appear in the same transaction. The filesystem must hand the module the stored value on lookup. Capabilities for executables use the same mechanism. The challenge is atomic labeling at creation, and keeping labels stable through copies and snapshots.",
    k: ["Label stored with the inode in the creation transaction vs applied afterward: atomic creation avoids a window of unlabeled files at the cost of passing label data through every create path.", "Labels on disk vs derived by policy from path: stored labels survive moves and renames; derived labels follow policy changes but need a relabel pass."],
    p: ["A crash between creating a file and labeling it leaves an unlabeled file that the policy treats as the most permissive type.", "Restoring from backup without attributes strips labels and the whole system then runs relabeling at boot."],
    v: "With a policy enabled, create files in a labeled directory, read their labels with the attribute call, and confirm they match the policy rule; crash-test creation and confirm no unlabeled file exists after recovery.",
    dep: ["extended-attributes", "inode-structure", "transactions-and-handles"]
  },
  "inode-flags": {
    s: "Per-inode bits that change filesystem behavior for one file or directory: immutable, append-only, no copy-on-write, no compression, synchronous updates and similar.",
    d: "Flags live in the inode and are changed by an ioctl subject to privilege rules: immutable and append-only need the capability to set. The driver checks flags in write, unlink and rename paths. Others tune policy for one file, such as disabling copy-on-write for a database file or marking a directory for case folding. Flags on a directory are inherited by new children. It is hard because each flag adds a check to hot paths and an interaction with every other feature.",
    k: ["Per-file behavior flags vs a volume-wide mount option: flags let a database opt out of a feature while the rest of the volume keeps it, at the price of more per-inode state to document.", "Inheritance from the parent directory vs explicit setting: inheritance makes directories work as policy zones; explicit setting is less surprising but easy to forget."],
    p: ["Disabling copy-on-write on a file also disables its checksums, so corruption in that file goes undetected.", "Setting a flag after data exists often does not apply to existing extents, so the file behaves inconsistently."],
    v: "Set immutable on a file, confirm write, rename and unlink all fail even as owner, clear the flag with the privileged tool and confirm they succeed.",
    dep: ["inode-structure", "permission-bits"]
  },
  "quotas": {
    s: "Limits and accounting of blocks and inodes per user, group or project, enforced at allocation time with soft limits, hard limits and grace periods.",
    d: "The driver keeps per-owner counters of blocks and inodes used, updated whenever allocation or ownership changes, with limit records stored in hidden files or tree items. Allocation checks the counter before granting space; going over a soft limit starts a grace timer. Project quotas count a directory tree regardless of owner. Copy-on-write designs use quota groups that account for shared extents, which makes the arithmetic of who pays for a shared block a policy question. Counters must survive crashes through the journal.",
    k: ["Counters in the same transaction as allocation vs reconciled later: same-transaction is always exact and puts one more lock on hot paths; later reconciliation is faster and can be wrong after a crash.", "Charging shared blocks to everyone vs to the first owner: charging all makes limits conservative; first owner is cheap and unfair after snapshots."],
    p: ["Counters out of step with real usage after an unclean shutdown cause users to be blocked below their limit until a recount.", "Delayed allocation hides usage until writeback, so a write that looked successful fails later with a quota error."],
    v: "Set a hard block limit for a user, write until the call fails with the quota error, confirm usage equals the limit, then delete a file and confirm writes succeed again.",
    dep: ["space-reservation", "transactions-and-handles", "inode-structure", "delayed-allocation"]
  },
  "file-encryption": {
    s: "Per-directory encryption of file contents and names with keys held in the kernel keyring, so a raw device image reveals no plaintext.",
    d: "A directory is marked encrypted with a policy naming the algorithms and a key identifier. Each file gets its own derived key from the master key and a per-file nonce stored in an attribute. Contents are encrypted in pages as they move between cache and disk, using the page index as part of the tweak. File names are encrypted in directory entries, and symlink targets are too. Without the key, names appear as opaque tokens that can still be listed, renamed and deleted.",
    k: ["Per-file derived keys vs one key per volume: per-file keys limit damage from a nonce reuse bug and cost a key derivation per open; volume keys are simple and share fate.", "Encrypting names vs contents only: name encryption hides structure from an attacker with the device, but breaks features that need to read names, such as deduplicating tools."],
    p: ["Compression after encryption does nothing, and compressing before encryption can leak information about contents.", "Hard links across directories with different policies must be refused or they bypass the policy."],
    v: "Create a file with a known marker string in an encrypted directory, lock the key, search the raw device for the marker and the file name, and confirm neither appears.",
    dep: ["inode-structure", "extended-attributes", "page-cache-mapping", "directory-entries"]
  },
  "timestamps": {
    s: "Access, modification, change and creation times in each inode, with nanosecond precision, a year-2038-safe range and rules for when each is updated.",
    d: "Each time field holds seconds and nanoseconds, with extra bits extending the range beyond the signed 32-bit limit. Modification time updates on content change, change time on any metadata change, and access time on reads under a policy such as relative access time. Updates in memory are written back lazily. Multigranular clocks are an issue: a coarse clock can make two writes within a tick look identical to a caching client. Creation time is a separate field in newer formats.",
    k: ["Updating access time on every read vs relative updates: always updating gives exact atime and a metadata write per read; relative updates save most writes while still serving the tools that need freshness.", "Coarse kernel tick resolution vs fine-grained clocks: coarse is cheap; fine-grained is needed for correct change detection by build tools and network clients."],
    p: ["Files created with timestamps past the old 32-bit limit on a format without extra bits wrap to 1901.", "Lazy time updates are lost on crash, so a file's mtime moves backward after recovery."],
    v: "Write to a file twice within a millisecond and confirm the two modification times differ; create a file dated beyond 2038 and read the time back unchanged after remount.",
    dep: ["inode-structure", "writeback"]
  },
});
