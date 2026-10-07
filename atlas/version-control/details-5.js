// Details for the version control plate, part 5: references and reflogs, packfiles and acceleration.
ATLAS.details("version-control", {
  "reference-namespace": {
    s: "The hierarchical set of names, such as branches, tags, remote-tracking and special references, each mapping to an object identifier, with the conventions that give each prefix meaning.",
    d: "References are slash-separated names under well-known prefixes: local branches, tags, remote-tracking branches, notes, stashes and per-tool namespaces. Each name maps to an identifier or to another name. Prefixes carry rules: branches are expected to move, tags to stay put, remote-tracking ones to be updated only by fetch. A name can be a directory prefix or a leaf but not both, which prevents certain pairs from coexisting. Name syntax forbids characters that confuse shells and paths. The hard part is scale and the prefix conflict rule.",
    k: ["Hierarchical names vs a flat namespace: hierarchy gives conventions, wildcards and namespaces per tool, but forbids some name pairs; flat names are simple but collide.", "Convention-based meaning vs enforced meaning: conventions keep the model small and flexible, but nothing stops a tag from being moved."],
    p: ["Creating a branch named as a prefix of an existing one and failing on file-system backed storage.", "Hundreds of thousands of references making listing and negotiation slow."],
    v: "List references by prefix and confirm branches, tags and remote-tracking names are separate; attempt to create a name that is both a leaf and a directory prefix and confirm it is refused.",
    dep: ["loose-refs", "packed-refs", "table-ref-backend"]
  },
  "branches-and-tags": {
    s: "A branch is a reference expected to advance as commits are made; a tag is a reference expected to stay on one commit. The difference is convention and behavior, not storage.",
    d: "Creating a commit on a checked-out branch moves that branch's reference to the new commit, which is why a branch is just a name for a line of development. Tags are created once and not moved by commits. Default behavior reflects this: fetch updates remote-tracking branches freely, but refuses to overwrite a tag unless forced, and push does not send tags without being asked. Deleting a branch leaves commits alive until nothing reaches them. The hard part is that unreachable commits vanish eventually.",
    k: ["Branches as cheap movable pointers vs heavyweight branch records: cheap pointers make branching nearly free and encourage topic branches, but carry no metadata about origin or intent.", "Tags fetched automatically with reachable history vs only on request: automatic keeps releases visible, while on-request reduces clutter and loses non-reachable tags."],
    p: ["Deleting a branch with unmerged commits and later finding they are no longer reachable.", "Assuming a tag was published when push does not send tags unless told to."],
    v: "Commit on a branch and confirm its reference moves while a tag on the earlier commit does not; delete the branch and confirm the commits remain reachable through the reflog.",
    dep: ["reference-namespace", "tag-objects", "commit-objects"]
  },
  "symbolic-refs-and-head": {
    s: "A reference whose content is the name of another reference, with HEAD the special one naming the current branch or, when detached, a commit directly.",
    d: "HEAD normally holds the name of a branch, so a commit advances that branch by following HEAD. When a user checks out a commit or tag, HEAD stores an identifier directly, called detached, and new commits are reachable only from HEAD and its reflog. Symbolic references can point elsewhere too, such as a remote's default branch. Each linked worktree has its own HEAD. Reading must follow symbolic chains with a depth limit. The hard part is detached HEAD: work done there is easy to lose when switching away.",
    k: ["Attached to a branch vs detached at a commit: attached advances a named line automatically; detached gives exact reproducibility and risks orphaned commits.", "Symbolic indirection vs copying the value: indirection updates all aliases at once, but adds a read step and a cycle to guard against."],
    p: ["Making commits on a detached HEAD, switching branches and losing the only reference to them.", "A symbolic reference pointing at a deleted branch leaving the repository in an unborn state."],
    v: "Detach HEAD at an older commit, make a commit, switch away, and confirm the commit is findable only through the reflog until a branch is created to hold it.",
    dep: ["reference-namespace", "reflog"]
  },
  "loose-refs": {
    s: "The simplest reference storage: one small file per reference, containing an identifier or a symbolic target, updated by writing a lock file and renaming it.",
    d: "A reference named a/b is the file at that path in the references directory. An update creates a sibling lock file exclusively, writes the new value, then renames it over the original, so readers see either the old or new value. Locks prevent two writers from interleaving, and the update checks that the old value matches what the caller expected. File names and directories must not conflict, and case-insensitive disks can cause clashes. The hard part is scale and portability: many files are slow, and some file systems mishandle rename and names.",
    k: ["File per reference vs a single table: files are simple and make updates independent and atomic, but become slow and directory-heavy with many references.", "Compare-and-swap on old value vs blind write: compare-and-swap catches concurrent changes at the cost of retries; blind writes lose updates."],
    p: ["A stale lock file left by a crashed process blocking all updates to that reference until removed.", "Two names differing only by case colliding on a case-insensitive file system."],
    v: "Update a branch and watch the lock file appear and rename into place; start a concurrent update with a stale expected value and confirm it fails with the reference unchanged.",
    dep: ["reference-namespace", "ref-transactions"]
  },
  "packed-refs": {
    s: "A single sorted file holding many references at once, with peeled values for tags, used so that most references need no individual file.",
    d: "The file lists each reference with its identifier, sorted by name, and following a tag its peeled target. Lookup is a binary search. When a loose file exists for a name, it overrides the packed entry; deleting a reference must therefore remove it from both places, with the packed file rewritten under a lock. Packing moves old references into this file to cut directory sizes and speed up listing. The hard part is deletion and rewrite cost: removing one reference means rewriting the whole file.",
    k: ["Pack references vs keep loose: packed files are fast to list and small on disk, but a deletion rewrites everything; loose ones update cheaply and don't scale.", "Storing peeled tag targets vs computing them: stored values avoid reading each tag object on listing, at the cost of more file content to keep consistent."],
    p: ["Deleting a reference only from the loose side, so the packed entry makes it reappear.", "Deleting many references one by one, each rewriting a very large packed file."],
    v: "Pack a thousand references, delete one, and confirm it no longer lists from either store, the file remains sorted, and a lookup of any peeled tag returns the commit without reading the tag object.",
    dep: ["reference-namespace", "loose-refs"]
  },
  "table-ref-backend": {
    s: "A reference storage format using sorted, block-indexed tables with stacked incremental files, giving atomic multi-reference updates and fast lookup at very large scale.",
    d: "References and reflog records are kept in immutable table files with a block index, prefix compression and a checksum. An update appends a new small table and records it in a list file by rename; background compaction merges tables geometrically. Readers see a consistent set of tables, so a multi-reference transaction is atomic and listing is a merge over a few files. It avoids file-name conflicts and case problems because names are data, not paths. The hard part is the format's compatibility and tool support.",
    k: ["Table format vs file-per-reference: tables give atomic transactions, fast listing and no path problems, but older tools and some repair workflows do not read them.", "Compact eagerly vs lazily: eager keeps reads fast at write cost; lazy keeps writes cheap and lets the stack grow."],
    p: ["Third-party tools reading the references directory directly and seeing nothing.", "A stuck compaction leaving many small tables and slowing every read."],
    v: "Update fifty references in one transaction and confirm that readers never see a partial set; then list a million references and compare the time to the file-per-reference store.",
    dep: ["reference-namespace", "ref-transactions", "reflog"]
  },
  "ref-transactions": {
    s: "An API for changing several references as one unit: lock all, verify expected old values, write new ones, and either commit every change or none.",
    d: "A transaction collects updates, creations and deletions, each optionally with an expected old value. Preparing takes locks on every affected reference and checks the expected values and name conflicts. Committing writes the values and reflog entries and releases locks. If any step fails, all are abandoned. Stores differ in what they can guarantee: file-per-reference commits each rename separately, so an interruption mid-commit can leave a partial result, while table storage can make it atomic. The hard part is lock ordering and recovery after a crash between steps.",
    k: ["Expected-old-value checks vs unconditional updates: checks prevent lost updates in concurrent use, at the cost of retry logic in callers.", "All-or-nothing across references vs best effort: atomic keeps related refs consistent but can fail whole pushes on one conflict."],
    p: ["A crash between renames leaving some references updated and others not on file-based storage.", "Lock acquisition in inconsistent order producing deadlock-like timeouts between two processes."],
    v: "Run two transactions touching overlapping references concurrently and confirm that one commits fully and the other fails with no partial changes visible.",
    dep: ["loose-refs", "reflog"]
  },
  "reflog": {
    s: "A per-reference log of every value it has held, with time, identity and reason, letting a user recover commits after a reset, rebase or deleted branch.",
    d: "Each reference update appends a line with old identifier, new identifier, committer identity, timestamp and a message such as the command that did it. Selectors like name@{2} or name@{yesterday} read it. Entries expire after configured ages, unreachable ones sooner. The log is local only: it is never transferred, so it exists only where the update happened. It also keeps otherwise-unreachable commits alive until expiry. The hard part is expectations: it is a safety net, not a backup, and it is bounded in time.",
    k: ["Local-only log vs a replicated one: local is private and cheap and gives no help after losing the machine; replicated would help recovery but adds protocol and privacy cost.", "Short expiry vs long: long keeps more recovery options and holds more garbage; short reclaims space and removes the safety net sooner."],
    p: ["Relying on the reflog on a freshly cloned machine, where none of the earlier history exists.", "Expiring the reflog and pruning in one step, which makes mistakes unrecoverable at once."],
    v: "Hard reset a branch back three commits, then recover the old tip by reading the reflog entry and creating a branch at it, confirming the lost commits return.",
    dep: ["reference-namespace", "commit-objects"]
  },
  "refspecs-and-remote-tracking": {
    s: "Mapping rules, written as source and destination patterns, that say which remote references to fetch into which local names, and which local ones to push where.",
    d: "A refspec has an optional force marker, a source pattern and a destination pattern, with a single wildcard each. For fetch, the default maps every remote branch to a tracking name under the remote's own namespace. For push, it maps a local name to a remote one. Remote-tracking references record where the remote's branches were at the last contact and are updated only by fetch and push. Configuration stores the specs per remote. The hard part is the user's mental model: tracking names look like branches but are cached remote state.",
    k: ["Tracking references vs asking the remote each time: tracking references make comparisons instant and offline, but they go stale between fetches.", "Narrow vs broad fetch refspecs: narrow fetches less and is quicker on huge repositories, but hides branches the user may expect."],
    p: ["Treating a remote-tracking name as the live remote state and deciding from stale data.", "A refspec destination colliding with local branch names and overwriting work."],
    v: "Configure a narrow fetch refspec for one branch and confirm that only that tracking reference is created or updated, and that a stale tracking name is removed when pruning is on.",
    dep: ["reference-namespace", "fetch-client"]
  },
  "packfile-format": {
    s: "A file that stores many objects together, each as compressed data either in full or as a delta against another object, with a header and trailing checksum.",
    d: "A pack begins with a signature, version and object count. Each entry has a variable-length header giving type and size, then compressed data. A delta entry refers to its base by an offset earlier in the same pack, or by identifier when the pack is thin and the base is elsewhere. The file ends with a checksum of its contents. Packs are written once and never modified, so readers can map them into memory. The hard part is delta chains: reading an object may need to apply many deltas in sequence.",
    k: ["Offset-based vs identifier-based delta references: offsets are compact and quick to follow inside a pack, but a pack that references an external base must be completed before use.", "Long delta chains vs short: long chains compress better and slow reads; capping depth costs space."],
    p: ["Very deep chains making a read of one old file apply hundreds of deltas.", "Transferring a thin pack to a client that lacks its bases, so it cannot be completed."],
    v: "Inspect a pack and list its entries with type, size and delta depth; confirm the trailing checksum equals the hash of the preceding bytes and every delta base resolves.",
    dep: ["delta-compression", "content-addressing"]
  },
  "delta-compression": {
    s: "Stores an object as a short list of copy and insert instructions relative to a similar object, so successive versions of a file cost little more than their differences.",
    d: "A delta encoder indexes blocks of the base content with a rolling hash, then scans the target, emitting a copy instruction when a block matches and literal insert bytes otherwise. The output states the base size, the target size, then the instructions. Reconstructing the target means applying the instructions to the base, which may itself be a delta. Deltas work on bytes, not lines, so they apply to binary files as well. The hard part is compute: finding good matches is expensive, and the choice of base governs compression.",
    k: ["Byte-level deltas vs line-based diffs: byte deltas handle any content and are compact, but not human readable; line diffs show meaning but only fit text.", "Delta against newer vs older version: deltas pointing at the newest keep recent reads fast, while older bases reflect creation order."],
    p: ["Already compressed files, such as images and archives, gaining nothing from delta search and wasting CPU.", "Choosing a poor base that gives a large delta instead of a small one."],
    v: "Commit ten small edits to a megabyte text file, repack, and confirm the pack stores about one full copy plus small deltas, far smaller than ten loose objects.",
    dep: ["blob-objects", "packfile-format"]
  },
  "delta-base-selection": {
    s: "Choosing, for each object, which other object to delta against, using type, size and path-name hints in a sliding window over a sorted object list.",
    d: "The packer sorts objects by type, then by a hash of file name, then by size, so that versions of the same file are neighbors. For each object it tries the previous window of candidates, computes a delta for each, and keeps the smallest, subject to a depth limit. Reuse of an existing good delta can skip the work. Larger windows find better bases and cost proportionally more time and memory. The hard part is tuning: the heuristic fits files with stable names and fails on renamed ones.",
    k: ["Large search window vs small: a large one finds smaller packs for archival repacks; a small one keeps routine repacks fast.", "Name-based hint vs content similarity: names are cheap and effective for versions of one file, but miss renames and similar files with different names."],
    p: ["A one-time aggressive repack that takes hours and uses all memory on a large repository.", "Many renamed files sorting far apart, so close variants are never compared."],
    v: "Repack a repository with window sizes ten and two hundred and compare the resulting pack sizes and times, confirming the larger window gives a smaller pack at higher cost.",
    dep: ["delta-compression", "packfile-format", "tree-objects"]
  },
  "pack-index": {
    s: "A companion file for each pack mapping object identifiers to offsets, with a fan-out table so a lookup is a binary search within a small range.",
    d: "The index starts with a table of 256 counts, one per leading byte value, which narrows the search to objects starting with the same byte. Then come the sorted identifiers, a checksum per object for verification, and offsets into the pack, with a large-offset table for packs over a size limit. A lookup does the fan-out, a binary search, then reads the offset. An index is built by scanning a pack once after receipt. The hard part is lookup count: with many packs, every miss must check each index.",
    k: ["Per-pack index vs one global index: per-pack indexes are immutable and written once; a global one speeds lookups but must be rewritten on change.", "Fan-out by first byte vs deeper structure: a small table is cheap to load and narrows well, but the binary search still touches several cache lines."],
    p: ["Hundreds of small packs making every lookup of a missing object check hundreds of indexes.", "A missing or truncated index file making a perfectly good pack unusable."],
    v: "Look up an object by identifier using the fan-out table and offset, then read the pack at that offset and confirm the entry decompresses to content that hashes to the same identifier.",
    dep: ["packfile-format", "content-addressing"]
  },
  "multi-pack-index": {
    s: "A single index covering the objects of several packs, so lookups, reuse and bitmaps work across the set without checking each pack's own index.",
    d: "It lists every object once, sorted, with the pack and offset of one chosen copy, and names the packs it covers. A lookup is one binary search regardless of pack count. It can be extended with a reverse index and with bitmaps that span the covered packs. New packs are added by rewriting the file, which is cheaper than merging packs. Objects present in several packs are recorded once. The hard part is staleness: the index must be rewritten when packs are removed or it points at nothing.",
    k: ["Multi-pack index vs consolidating into one pack: the index avoids rewriting objects and speeds lookups, but leaves many files to manage; one pack is simplest and costs a full repack.", "Rewrite on every new pack vs batch: rewriting keeps lookups fast, while batching saves write cost and leaves new packs unindexed."],
    p: ["Deleting a pack that the index still references, causing lookups to fail until it is rewritten.", "A stale multi-pack index ignored silently, so the expected speed-up never happens."],
    v: "Create fifty small packs, build the multi-pack index, and confirm lookups of a missing object consult one structure rather than fifty, with measured latency dropping accordingly.",
    dep: ["pack-index", "packfile-format", "reachability-bitmaps"]
  },
  "reachability-bitmaps": {
    s: "Precomputed bit vectors recording, for selected commits, which objects of a pack are reachable from them, turning object enumeration into bitwise operations.",
    d: "Objects in a pack are numbered in a fixed order. For chosen commits, the repacker stores a compressed bitmap marking every reachable object, using run-length encoding and delta against an earlier bitmap. To enumerate for a fetch, the server ORs bitmaps for wanted commits, ANDs out those for common ones, and walks only commits without bitmaps. The result is the object list in milliseconds rather than a tree walk of the entire history. The hard part is selection: which commits get bitmaps, and keeping them valid as the pack changes.",
    k: ["Bitmaps on selected commits vs on all: selection keeps the file small and covers recent tips well; covering all is huge and rarely needed.", "Bitmaps tied to one pack vs spanning several: single-pack bitmaps are simple but require a full repack; spanning ones are flexible and more complex."],
    p: ["Bitmaps not regenerated after repacking, so servers silently fall back to slow walks.", "Selection missing the branch tips clients actually fetch, giving little speed-up."],
    v: "Time object enumeration for a clone of a large repository with bitmaps present, then absent, and confirm identical object counts with enumeration dropping from minutes to well under a minute.",
    dep: ["packfile-format", "pack-index", "repacking"]
  },
  "commit-graph-file": {
    s: "A compact file storing, for every commit, its tree, parents, date and a generation number, so history walks need not decompress and parse each commit object.",
    d: "Commits are listed in sorted order with fixed-size records holding the root tree identifier, parent positions, commit time and generation number, which is one more than the largest parent generation. Generation numbers let algorithms stop early: a commit cannot be an ancestor of one with a lower number. Extension chunks may hold changed-path filters. The file can be a chain of increments so updating is cheap. The hard part is staleness and the chain of layers that must be merged and kept consistent.",
    k: ["Precomputed graph file vs reading commit objects: the file makes walks orders of magnitude faster, but must be updated after new commits arrive.", "Chain of incremental files vs one file: a chain makes updates cheap and grows read cost slowly; one file is simple to read and expensive to rewrite."],
    p: ["Commits missing from the file silently making walks fall back to slow object reads.", "Corrupted generation numbers causing wrong ancestry answers if they are trusted without verification."],
    v: "Write the file, then run a merge-base and a topological log on a large history, and confirm outputs match the object-based run with a large drop in time.",
    dep: ["commit-objects", "history-traversal"]
  },
  "path-change-filters": {
    s: "Per-commit Bloom filters in the commit-graph recording which paths changed, so path-limited log and blame can skip commits that definitely did not touch the path.",
    d: "For each commit, the paths changed relative to its first parent are hashed into a small Bloom filter stored in the commit-graph file. A path-limited walk queries each commit's filter: if the path is definitely absent, the commit is skipped without computing a tree diff. A positive can be a false positive, so it is then confirmed by a real diff. The filters are sized from the number of changes and use fixed hash settings. The hard part is size and false-positive rate against large commits.",
    k: ["Probabilistic filters vs exact path lists: filters are small and answer quickly, but can produce false positives needing a confirming diff; exact lists are precise and large.", "Compare to first parent only vs all parents: first-parent keeps the file small, and may miss paths changed only through other merge parents."],
    p: ["Very large commits exceeding filter capacity and recording as always possibly changed.", "Changing hash settings and finding old filters silently ignored."],
    v: "Run a path-limited log for a deep file with and without the filters, and confirm identical results with far fewer tree comparisons counted in the trace.",
    dep: ["commit-graph-file", "pathspec-matching"]
  },
});
