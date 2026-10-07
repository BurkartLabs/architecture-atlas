// Details for the version control plate, part 4: index and working tree, objects and content addressing.
ATLAS.details("version-control", {
  "index-file-format": {
    s: "The single binary file holding the staging area: a sorted list of path entries with mode, identifier, flags and cached file metadata, plus extensions and a trailing checksum.",
    d: "A header gives a version and entry count, followed by entries sorted by path bytes. Each entry has creation and modification times, device, inode, size, mode, the blob identifier, a flags field with merge stage and name length, and the path, with later versions compressing common prefixes. Extensions follow, then a checksum of the whole file. The file is rewritten as a whole under a lock and renamed into place. The hard part is cost: a repository with millions of files means rewriting and re-reading a huge file on every add.",
    k: ["Single sorted file vs per-directory index: one file is simple to lock and read in one pass, but scales linearly in total size; per-directory data scales better and is far more complex.", "Prefix-compressed paths vs plain paths: compression shrinks large indexes, but makes random access need decompression."],
    p: ["Two commands writing the index at once, with a lost update if locking is bypassed.", "A huge index slowing every command because each rewrites and checksums the entire file."],
    v: "Stage one file in a repository with a million entries and measure the write; confirm the file's trailing checksum validates and the entry list remains sorted and unique per stage.",
    dep: ["blob-objects", "tree-objects", "index-extensions"]
  },
  "index-extensions": {
    s: "Optional sections of the index that cache derived data: tree summaries for fast commit, untracked directory results, conflict history, split-index bases and sparse directory entries.",
    d: "The tree cache stores tree identifiers for directories whose contents match the index, so writing a tree skips unchanged subtrees. The untracked cache remembers directory listings with their modification times to avoid rescanning. Resolve-undo keeps pre-resolution conflict stages so a resolution can be undone. A split index stores a large shared base plus a small delta so writes touch less data. Readers that do not know an optional extension skip it by its signature. The hard part is invalidation: every mutation must invalidate the right cached subtrees.",
    k: ["Caching derived data in the index vs recomputing: caching makes commit and status much faster, but each bug in invalidation yields a wrong tree.", "Split index vs single file: split reduces write cost for large repositories but adds merging of shared and delta parts."],
    p: ["A missed invalidation producing a commit whose tree does not match the staged content.", "Tools that rewrite the index and drop extensions they do not understand, losing the caches."],
    v: "Stage a change in one subdirectory and commit; confirm via trace that only that path's trees were rebuilt, and that the resulting tree identifier equals one produced by a cache-free rebuild.",
    dep: ["index-file-format", "tree-objects"]
  },
  "stat-cache": {
    s: "Per-file metadata recorded in the index, such as size, times and inode, used to decide whether a file might have changed without reading its content.",
    d: "When a file is staged, its stat data is stored with the entry. On status, the tool compares the stored values to the current ones; if they match, the file is assumed unchanged. If they differ, it hashes the content and compares to the stored identifier, updating the cache if equal. A racy case exists when a file is modified in the same timestamp tick as the index was written; such entries are re-hashed. The hard part is correctness across file systems with coarse timestamps or unstable inode numbers.",
    k: ["Trusting stat data vs hashing all files: trusting is orders of magnitude faster, but can miss edits that preserve size and time; hashing is exact and slow.", "Using inode and device numbers vs times and size only: inodes catch more changes but are unstable on network and virtual file systems."],
    p: ["A tool rewriting a file with a restored timestamp and the same size so a change is missed.", "A network file system changing inode numbers on every mount, causing a full rehash each time."],
    v: "Touch a file without changing content and confirm status rehashes once and reports clean; edit a file within the same second as the index write and confirm the racy check still reports it modified.",
    dep: ["index-file-format"]
  },
  "filesystem-monitor": {
    s: "Uses operating system change notifications or a background daemon to learn which files changed since the last check, so status avoids scanning the whole tree.",
    d: "A monitor daemon watches the working tree and answers a query with the paths changed since a token returned earlier. The status engine marks only those entries as needing a stat or hash and trusts the rest. If the monitor restarts or loses events, it returns a token meaning everything, forcing a full scan. It is paired with the untracked cache to avoid rescanning directories. The hard part is trust: a missed event means a missed change, so overflow, remounts and network disks need conservative fallbacks.",
    k: ["Event-driven monitor vs full scan with stat cache: the monitor makes status cost proportional to changes, but needs a daemon and a fallback when it loses events.", "Built-in monitor vs external hook program: built-in avoids setup, while a hook integrates with whichever watching service a team already runs."],
    p: ["Event buffer overflow during a large checkout dropping events and leaving status stale.", "Running the monitor on a network or virtual file system that does not deliver notifications."],
    v: "On a large tree, change one file and confirm status completes in milliseconds and reports only it; restart the monitor and confirm the next status performs one full scan then is fast again.",
    dep: ["stat-cache", "index-extensions", "status-engine"]
  },
  "status-engine": {
    s: "Computes what differs between the last commit, the staging area and the files on disk, and also lists untracked and ignored files.",
    d: "Status makes two comparisons. The first diffs the head commit's tree against the index to find staged changes. The second diffs the index against the working tree, using the stat cache and monitor to avoid hashing, to find unstaged changes. Untracked files come from scanning directories not in the index, filtered by ignore rules, and optionally reporting only the top directory. Rename detection can be applied to staged changes. The hard part is scanning cost for untracked files in large trees.",
    k: ["Detailed untracked listing vs summarizing directories: details are useful but slow in trees full of generated files; directory summaries are fast but hide content.", "Ahead and behind counts vs skipping them: counts help but need a history walk against the upstream."],
    p: ["Build output not covered by ignore rules causing status to scan and list a huge directory.", "Assuming a clean status means nothing changed when ignored files and sparse exclusions were hidden."],
    v: "On a tree with a hundred thousand untracked generated files, compare status time with the directory summary option and with the untracked cache enabled, and confirm results are identical.",
    dep: ["tree-and-index-diff", "stat-cache", "ignore-rules", "filesystem-monitor", "rename-and-copy-detection"]
  },
  "checkout-and-switch": {
    s: "Moves the working tree and index from one commit to another, updating only the files that differ and refusing when local changes would be overwritten.",
    d: "The command resolves the target, computes a two-tree comparison between the current commit and the target, and checks each affected path against the working tree for local modification. If safe, it writes new files, deletes removed ones, and updates the index and HEAD; a merge mode carries local changes across by a three-way merge. File writes go through attribute filters and are restricted by sparse patterns. The hard part is safety and atomicity: a failure partway through must not leave unrecoverable user changes.",
    k: ["Refuse on local changes vs carry them with a merge: refusing is safest, while carrying keeps work flowing but risks conflicts in the middle of a switch.", "Separate branch-switch and file-restore commands vs one overloaded command: separate commands are harder to misuse, but one command is the historical habit."],
    p: ["Restoring a file path from the index, which overwrites local edits with no way to recover them.", "Switching branches with many changed files on a slow disk, and interrupting it halfway."],
    v: "Switch between two branches that differ in a few files with a dirty unrelated file, and confirm only differing files change, the dirty file is untouched, and an overlapping edit is refused.",
    dep: ["tree-unpacking", "index-file-format", "symbolic-refs-and-head", "clean-and-smudge-filters"]
  },
  "tree-unpacking": {
    s: "The core routine that walks up to several trees, the index and the working tree together, deciding per path what to do, shared by checkout, merge, reset and stash.",
    d: "It takes N tree inputs and the current index and iterates them in sorted path order, calling a per-path rule with the entries from each. The rule decides: keep, take from the target, delete, or flag a conflict. Each rule enforces safety checks about untracked or modified working files that would be overwritten. The result is a new index and a list of file system operations applied afterward. Many commands are just different rule sets over the same walk. The hard part is the large number of per-path state combinations.",
    k: ["One generic walker with rule sets vs separate code per command: one walker keeps behavior consistent, but makes the rules hard to read and risky to change.", "Check all safety conditions before writing vs as writing proceeds: checking first prevents partial states and costs an extra pass."],
    p: ["A rule gap letting a command overwrite an untracked file that happens to share a path with the target.", "Changing the walk order and breaking the assumption that directories sort as if they ended in a slash."],
    v: "Check out a target in which a directory replaces a file of the same name while an untracked file sits at the path; confirm the operation is refused and nothing was written.",
    dep: ["tree-objects", "index-file-format", "tree-and-index-diff"]
  },
  "ignore-rules": {
    s: "Pattern files listing paths that status and add should skip, read from the repository, per-directory files, a personal file and a global one, with later rules overriding earlier.",
    d: "Rules are glob patterns with a leading slash to anchor, a trailing slash for directories, and negation with a leading exclamation mark. Sources are checked in order of precedence: command line, per-directory files closest to the path, repository-wide exclude, then the personal global file. A directory that is excluded is not descended, so a negation inside it cannot re-include a file. Rules apply only to untracked files; tracked files stay tracked. The hard part is understanding precedence and the re-include limitation.",
    k: ["Committed ignore files vs personal exclude files: committed rules are shared and consistent; personal ones keep editor and operating system files out without cluttering the project.", "Ignoring a directory vs ignoring its contents: ignoring the directory is fast to scan but blocks negations underneath."],
    p: ["Adding a pattern for a file that is already tracked and expecting it to stop being tracked.", "A negation pattern that does nothing because its parent directory is excluded."],
    v: "Add a pattern for a built directory, confirm untracked listing omits it, then show the pattern that explains it for a given path and confirm it reports the exact source file and line.",
    dep: ["pathspec-matching"]
  },
  "attributes": {
    s: "Per-path settings matched by pattern, in files committed with the project, that choose line-ending handling, filters, diff and merge drivers and whether a file is binary.",
    d: "Attribute files list patterns with named settings that are set, unset, given a value or unspecified. They are read from the tree at each directory level, from the index or the working tree depending on the command, and from a repository-local override file. Other components query them by path: checkout for conversion, diff for drivers and text conversion, merge for strategies, export for exclusions. Macros group settings. The hard part is that attributes name behavior but the programs they name come from local configuration.",
    k: ["Attributes committed in the tree vs local configuration only: committed settings give every clone the same behavior, but the named drivers still need installing.", "Reading attributes from the working tree vs the index or a tree: working tree is what the user sees, while tree reads give repeatable results for bare repositories."],
    p: ["An attribute naming a filter that is missing on one machine, so files are handled differently.", "Changing an attribute and not renormalizing, leaving files committed in the old form."],
    v: "Set a pattern as binary and another with a custom diff driver, and confirm a query for a matching path reports exactly those values, and diff output follows them.",
    dep: ["pathspec-matching", "tree-objects"]
  },
  "line-ending-conversion": {
    s: "Normalizes line endings so the repository stores one form while each platform's working files use the one it expects, controlled by settings and attributes.",
    d: "On the way into the object database, carriage-return and line-feed pairs are converted to a single line feed for text files; on checkout, they can be converted back. Text detection uses attributes or a heuristic looking for binary markers. A safety check warns or refuses when a round trip would not return the original content. A renormalize operation rewrites stored content after a policy change. The hard part is mixed endings in existing files, which turn into large spurious diffs when a policy is introduced.",
    k: ["Convert on commit and checkout vs store as-is: conversion keeps diffs clean across platforms, but alters bytes and is a source of surprises; as-is is exact but noisy.", "Attributes per path vs one global setting: per-path attributes are explicit and shared; a global setting is easy but varies by developer."],
    p: ["A global setting that differs among developers producing commits whose files flip endings.", "Binary files misdetected as text and corrupted by conversion."],
    v: "Commit a file with mixed endings under a normalizing attribute, check out on a platform with the other convention, and confirm the diff against the committed blob is empty and the file bytes match the platform form.",
    dep: ["attributes", "clean-and-smudge-filters", "blob-objects"]
  },
  "clean-and-smudge-filters": {
    s: "Programs run on content as it enters the repository (clean) and as it is written to the working tree (smudge), allowing transformations such as keyword expansion or pointer files.",
    d: "A filter is named in attributes and defined in configuration with a clean command and a smudge command, each reading content from standard input and writing to standard output. Clean runs when a file is staged or compared, and its output is what gets hashed; smudge runs on checkout. Long-running filter processes avoid per-file startup cost by speaking a small protocol over a pipe. Filters must be deterministic and idempotent, or status will report changes forever. The hard part is performance and determinism.",
    k: ["Long-running filter process vs one process per file: long-running is vastly faster on large checkouts, but needs a protocol implementation and careful error handling.", "Required filter vs optional: required fails loudly when the program is missing; optional passes content through silently and may commit wrong data."],
    p: ["A non-deterministic clean filter making files appear perpetually modified.", "A missing optional filter committing unconverted content, such as a secret that should have been scrubbed."],
    v: "Define a filter that expands a keyword on checkout and strips it on staging; confirm status is clean after checkout and the stored blob contains no expanded text.",
    dep: ["attributes", "blob-objects", "checkout-and-switch"]
  },
  "blob-objects": {
    s: "The object type that stores the exact bytes of one file's content, with no name, mode or metadata, so identical content in any file shares one object.",
    d: "A blob is a header with its type and byte length followed by the content, hashed to produce its identifier and then compressed for storage. The file name and permissions live in the tree entry that refers to it, so renaming a file creates no new blob. Because the identifier depends only on content, two files or two commits with the same bytes share storage automatically. Large blobs are read and written as streams rather than loaded whole. The hard part is that a one-byte change in a large file creates a whole new blob, so size growth depends on the pack layer.",
    k: ["Whole-file blobs vs chunked storage: whole files are simple and let identical files dedupe exactly, but a small edit to a large file duplicates it until delta compression runs.", "Storing content without a name vs with one: nameless content dedupes across paths, but delta selection must recover name hints later."],
    p: ["Committing a generated multi-gigabyte file and bloating every clone permanently.", "Assuming identifier equality implies the same file metadata, when mode and name are in the tree."],
    v: "Commit the same file under two names and confirm one blob object exists; edit one byte and confirm a second blob appears with a different identifier.",
    dep: ["content-addressing"]
  },
  "tree-objects": {
    s: "The object type that lists a directory: sorted entries of mode, name and the identifier of a blob or another tree, giving a snapshot of a hierarchy.",
    d: "A tree is a sequence of entries, each with a file mode (regular, executable, symbolic link, directory or submodule), a name and a binary identifier. Entries are sorted by name with directories compared as though suffixed by a slash. Because a subtree's identifier changes if anything inside it changes, the root tree identifier summarizes the entire snapshot, and unchanged directories are shared between commits. Very wide directories make trees large to rewrite for each change. The hard part is the exact serialization and sort order, which must agree across all implementations.",
    k: ["Nested trees vs one flat path list: nesting lets unchanged directories be shared and skipped in comparisons; a flat list is simpler but rewrites everything per commit.", "Only four file modes vs full permission data: a few modes keep identifiers portable and stable, but lose ownership and extended attributes."],
    p: ["A directory with a million entries, making each small change write a very large tree object.", "An implementation sorting names differently, producing a tree whose identifier no one else can reproduce."],
    v: "Commit a change deep in a directory hierarchy and confirm that exactly the trees along that path got new identifiers while sibling subtrees kept theirs.",
    dep: ["blob-objects", "content-addressing"]
  },
  "commit-objects": {
    s: "The object type that records one snapshot: the root tree identifier, zero or more parent commit identifiers, author and committer identities with times, and a message.",
    d: "A commit is a small text object with headers for the tree, each parent, author and committer with timestamps and time zones, optional extra headers such as signatures or encoding, a blank line, and the message. Parent identifiers link commits into the history graph. Because the identifier hashes all of this, including the parents, changing any ancestor changes every descendant's identifier. Author and committer are separate to preserve credit across cherry-picks and rebases. The hard part is that timestamps are claimed by the committer, not verified, so they can be wrong.",
    k: ["Snapshot per commit vs storing deltas: snapshots make any commit directly readable and compare cheaply by tree identifier, with storage savings recovered by packing; deltas are compact but slow to reconstruct.", "Separate author and committer vs one identity: two identities preserve credit through rewriting, at the cost of more fields to display."],
    p: ["Trusting commit timestamps for ordering when clocks or tools set them incorrectly.", "Leaking a personal email in the author field and being unable to remove it without rewriting every descendant."],
    v: "Create a commit, then amend only its message and confirm the tree identifier is unchanged while the commit identifier differs, and that its child, if rebuilt, differs too.",
    dep: ["tree-objects", "content-addressing"]
  },
  "tag-objects": {
    s: "The object type for an annotated tag: a named pointer to any object with its own tagger, date and message, optionally signed, separate from the simple reference form.",
    d: "An annotated tag object names a target object and its type, a tag name, the tagger identity and time, and a message, followed by an optional signature. A reference under the tags namespace then points to the tag object. A lightweight tag is just the reference pointing directly at a commit. Tools that resolve a tag to its commit peel it by following the target chain, and transfer protocols advertise both forms. The hard part is that tags are meant to be immutable by convention, but references can be moved.",
    k: ["Annotated tag vs lightweight tag: annotated tags carry author, message and signature and are objects to be fetched; lightweight tags are only names and are lost if the reference is not shared.", "Moving a tag vs creating a new one: moving keeps one name but silently changes meaning for people who fetched earlier; new names are explicit."],
    p: ["Re-pointing a release tag after publishing, so different users hold different commits under one name.", "A tag created locally and never pushed, since tags are not sent by default."],
    v: "Create an annotated and a lightweight tag on a commit; confirm the first resolves to a tag object with a message and the second to the commit directly, and a peeled query returns the same commit for both.",
    dep: ["commit-objects", "content-addressing", "reference-namespace"]
  },
  "content-addressing": {
    s: "Naming every object by a cryptographic hash of its type, size and content, so identity is derived from data, duplicates collapse and any change is detectable.",
    d: "The identifier is the hash of a header holding the object type and byte length, a separator, then the content. The same bytes always produce the same identifier on any machine, so independent repositories agree on names without coordination, and a received object can be checked by rehashing it. Parent and tree identifiers inside objects form a Merkle structure: one commit identifier commits to the whole history and snapshot. The hard part is that safety depends on collision resistance of the hash, and the identifier length is baked into formats.",
    k: ["Hash of content vs assigned serial numbers: content hashes need no coordination and detect corruption, but are long, opaque and fixed to one algorithm; serials are short but need a central authority.", "Hashing type and length with content vs content only: including the header stops an object of one type being passed off as another."],
    p: ["Assuming the hash is only for deduplication, then accepting deliberately crafted collisions.", "Hard-coding identifier length in tools and formats, making a later hash change painful."],
    v: "Compute the identifier of a known blob by hand from the header and content with the hash function and confirm it equals the identifier the tool reports.",
    dep: ["hash-function-migration"]
  },
  "hash-function-migration": {
    s: "Changing the hash algorithm of a repository, which requires every format to carry identifier length and either a parallel mapping between old and new names or a flag day.",
    d: "A stronger hash makes identifiers longer, so object names, pack and index files, reference files, the protocol and the index must all parameterize identifier width. A repository declares its algorithm in configuration. For interoperation, a mapping table translates each object's name between algorithms, so a repository in the new form can talk to peers using the old one by rewriting objects on the way. Signatures made over old identifiers do not translate. The hard part is that identifiers embedded in messages, issue trackers and build systems all become stale.",
    k: ["Flag-day conversion vs long-term dual-name interoperation: a flag day is simpler to implement but disruptive; interoperation preserves workflows but requires maintaining mapping tables and translation.", "Hardened collision detection in the old hash vs migrating: detection mitigates known attacks quickly, but the algorithm's margin keeps shrinking."],
    p: ["A tool hard-coded to forty hexadecimal characters failing on the longer identifiers.", "Old signed tags losing their value because the signed content refers to identifiers that no longer exist."],
    v: "Create a repository with the new algorithm, confirm every object, pack index and reference file uses the longer width, and fsck passes; fetch from an old-format peer and confirm identifiers translate.",
    dep: ["content-addressing", "pack-index", "object-database-abstraction"]
  },
  "loose-object-store": {
    s: "The simplest object storage: each object compressed in its own file, named by its identifier, split across directories keyed by the first byte.",
    d: "A write hashes the content, compresses it, writes to a temporary file in the object directory, and renames it into a path built from the identifier, with the first two characters as the directory. Because objects are immutable and named by content, concurrent writers can race harmlessly: a rename onto an existing identical file is fine. Reads decompress the file. It is fast for a few objects and poor for many: file counts, directory sizes and per-file overhead grow, which is why packing exists. The hard part is durability ordering.",
    k: ["Loose files vs packing immediately: loose writes are cheap and atomic with no coordination, but pile up; immediate packing saves space but adds write cost.", "Fsync every object vs rely on later repair: syncing protects against crashes, but slows large writes; skipping risks truncated objects after power loss."],
    p: ["A crash leaving a zero-length or truncated object file that later reads as corruption.", "Hundreds of thousands of loose objects slowing directory scans and backups."],
    v: "Write an object, find its file under the directory named by its first two characters, and confirm decompressing it gives the header and bytes that hash back to the same identifier.",
    dep: ["content-addressing", "blob-objects"]
  },
  "object-database-abstraction": {
    s: "The interface through which all code reads and writes objects by identifier, hiding loose files, packs, alternates, replacement and lazy fetch behind one lookup.",
    d: "A lookup tries the in-process cache, then loose files, then each pack through its index, then alternate object directories, and for partial clones the promisor remote. Replacement references redirect reads. Writers produce loose objects or stream into a new pack. Callers can request the type and size without inflating the full content, which makes many operations cheap. A connection of storage backends behind this interface lets the server swap in a networked store. The hard part is concurrency: packs appear and disappear under repacking while readers hold references.",
    k: ["Single lookup interface vs callers choosing stores: one interface keeps behavior uniform and lets storage evolve, but hides costs such as lazy network fetches.", "Reread the pack list on a miss vs fixed at start: rereading handles concurrent repacks gracefully; fixed is simpler and fails when a pack is replaced."],
    p: ["A long-running process holding a pack that gets deleted by repacking, then failing to read objects.", "Code that bypasses the interface and reads loose files directly, missing packed and promised objects."],
    v: "Read the same object while it is loose, then pack it and delete the loose copy, and confirm the read returns identical content with no change in caller code.",
    dep: ["loose-object-store", "packfile-format", "pack-index", "alternates"]
  },
  "alternates": {
    s: "A file that lists other object directories to consult, letting several repositories share one object store without copying it.",
    d: "An alternates file inside the object directory contains absolute or relative paths. Reads that miss locally continue into those directories, recursively with a depth limit. Writes still go to the local store. Clones made with the reference option use it to save space and time. The shared store must never lose objects that dependents still need, so pruning in the owner is dangerous unless it knows about its borrowers. The hard part is lifecycle: dependents break when the owner is moved, repacked destructively or deleted.",
    k: ["Alternates vs hard-linked copies: alternates save the most space but create a runtime dependency; links keep repositories independent as long as nothing rewrites in place.", "Borrow-then-detach vs permanent borrow: detaching copies needed objects and removes the dependency at one-time cost."],
    p: ["Pruning unreachable objects in the shared store that a borrowing repository still references.", "Moving the shared directory so every dependent repository reports missing objects."],
    v: "Clone using another clone's store as reference, confirm the new object directory is nearly empty, then run integrity checks and confirm no missing objects; detach and confirm the dependency is gone.",
    dep: ["object-database-abstraction", "loose-object-store"]
  },
  "object-integrity-check": {
    s: "Verifies the object database: that each object's content matches its identifier, that every referenced object exists, and that structures such as trees and commits are well formed.",
    d: "The check reads each object, rehashes it, and compares to its name, then parses commits, trees and tags and verifies that every identifier they contain resolves. It then walks from references and the reflog to find unreachable objects and dangling pointers. The same strictness can be applied to objects arriving over the network, rejecting malformed trees with duplicate names or unsafe paths before they are stored. The hard part is cost: a full check reads the entire store, so it is run offline or on incoming data only.",
    k: ["Verify every incoming object vs trust the sender: verification catches corruption and malicious structure early at a CPU cost; trust is fast and lets bad data in.", "Full scan vs targeted connectivity check: full scans are thorough but slow; connectivity checks only the objects reachable from new references."],
    p: ["Skipping receive-time checks and storing a tree with a path that overwrites protected files on checkout.", "Running a full check on a live server and slowing normal traffic for hours."],
    v: "Corrupt one byte of a stored object and run the check; confirm it names the object whose content no longer matches its identifier and lists anything that referenced it.",
    dep: ["content-addressing", "object-database-abstraction", "tree-objects", "commit-objects"]
  },
});
