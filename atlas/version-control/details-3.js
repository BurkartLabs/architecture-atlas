// Details for the version control plate, part 3: transfer protocol, partial history and scale.
ATLAS.details("version-control", {
  "transport-layer": {
    s: "The channels that carry the protocol: a local pipe to another process, a remote shell session, request and response over HTTP, or a dedicated unauthenticated daemon port.",
    d: "The protocol is a stream of length-prefixed packets, so it can ride over any byte pipe. A local transport simply starts the upload or receive program as a child process. A remote shell runs the same program on the server through an authenticated tunnel. HTTP wraps the exchange into discovery plus one or more POST requests, with the server stateless between them so load balancers can route freely. The hard part is stateless negotiation: each HTTP round must resend what the client already told the server.",
    k: ["Stateful stream (shell) vs stateless requests (HTTP): streams negotiate cheaply and use one connection; stateless requests pass proxies and scale horizontally but resend negotiation state.", "Dedicated daemon vs authenticated transports: a daemon is simple and fast but offers no authentication or encryption."],
    p: ["A proxy that buffers or rewrites request bodies corrupting the pack stream.", "Large pushes over HTTP failing on request size limits that the shell transport never hits."],
    v: "Fetch the same repository through the local, remote shell and HTTP transports and confirm identical reference sets and object counts, with an HTTP trace showing a discovery request followed by data requests.",
    dep: ["network-endpoints"]
  },
  "capability-negotiation": {
    s: "The initial exchange in which each side announces optional features, such as filters, shallow support and compression, and the client selects those both can use.",
    d: "The server's first message lists its supported capabilities; the client's request names the subset it wants to use. In the newer protocol version, a client first asks for the server's capability list as its own command, then issues commands such as listing references or fetching with arguments. Unknown capabilities are ignored, so new features can be added without breaking older peers. A version marker in the request lets the server answer in the highest version both support. The hard part is compatibility testing across many combinations of old and new peers.",
    k: ["Announce-and-select vs fixed versions only: capabilities let features roll out one at a time, but multiply the combinations to test.", "Server-side command table vs one monolithic exchange: commands let each operation evolve alone, but need an extra round trip to start."],
    p: ["A new capability enabled by default on a client that talks through a proxy which strips unknown headers.", "Relying on a feature without checking the server announced it, so older servers fail late in the transfer."],
    v: "Connect to a server with a capability disabled and confirm the client does not request it and the operation falls back, with the negotiation visible in a protocol trace.",
    dep: ["transport-layer"]
  },
  "ref-advertisement": {
    s: "The server's list of references and the objects they name, sent so the client can decide what it already has and what it wants.",
    d: "In the older protocol the server sends all references at once. In the newer one the client sends a list command with prefix filters, so it only learns about relevant branches and tags; peeled values for annotated tags and symbolic reference targets can be included. Hidden reference namespaces, such as review revisions, can be withheld. For repositories with millions of references the full list is a significant payload, and the prefix filter is what keeps fetches fast. The hard part is scale and consistency under concurrent updates.",
    k: ["Advertise everything vs filtered listing: everything is simple but wastes bandwidth on large reference sets; filtering costs a client request design.", "Hiding internal references vs exposing them: hiding keeps clients simple and private, but makes review revisions unfetchable by normal clones."],
    p: ["Hundreds of thousands of references making every no-op fetch download and compare a large list.", "References changing between the listing and the fetch, so the wanted object is no longer advertised."],
    v: "On a repository with a hundred thousand references, run a fetch of one branch and confirm the protocol trace lists only the prefix requested, and the transfer size is small.",
    dep: ["capability-negotiation", "reference-namespace", "packed-refs"]
  },
  "want-have-negotiation": {
    s: "The exchange in which the client names the objects it wants and the commits it already has, until the server can compute the smallest set of objects to send.",
    d: "The client lists wanted object identifiers, then sends batches of commits it has, starting from its branch tips and walking back, skipping ahead exponentially. The server replies with which of those it recognizes, and stops when it finds common commits that bound the missing set. Different skipping algorithms trade round trips against redundant sends. Shallow boundaries and filters are sent in the same phase. The hard part is the first fetch after a long divergence, where finding the common point can take many rounds.",
    k: ["Walk the client's history in batches vs send a precomputed summary: batches need no server state; summaries finish faster but need an agreed structure on both sides.", "Fewer round trips vs less redundant data: sending larger batches speeds up high-latency links at the cost of wasted bandwidth."],
    p: ["Negotiating from a branch the server has never seen, causing a slow walk of old history.", "A client with no common commits at all receiving the entire history even though most content exists locally."],
    v: "Fetch from a server after adding three local commits and confirm the trace shows few have lines and the received pack contains only objects missing on the client.",
    dep: ["ref-advertisement", "history-traversal", "commit-graph-file"]
  },
  "pack-generation-for-transfer": {
    s: "Builds a single pack of just the objects the client lacks, reusing stored deltas and data where possible and streaming it as it is produced.",
    d: "The server enumerates objects reachable from the wanted commits but not from the common ones, using reachability bitmaps if present, or a tree walk otherwise. It then chooses to reuse existing compressed data and deltas from stored packs, and compresses new deltas only for the rest. The pack is streamed with progress messages on a side channel, with a trailing checksum. Enumeration, not compression, is typically the most expensive step on large repositories. The hard part is CPU cost per clone and keeping memory bounded.",
    k: ["Reuse stored deltas vs recompute for best size: reuse is orders of magnitude faster, but may send somewhat larger packs than a fresh optimal delta.", "Bitmap enumeration vs object walk: bitmaps make counting nearly instant but must be generated and maintained by repacking."],
    p: ["A repository without bitmaps spending minutes enumerating objects for every clone.", "Thin packs that depend on objects the client has, failing if the client's state does not match what it claimed."],
    v: "Clone a large repository with and without bitmaps and confirm the enumeration phase drops from minutes to seconds, with identical object sets received.",
    dep: ["reachability-bitmaps", "packfile-format", "delta-compression", "want-have-negotiation"]
  },
  "fetch-client": {
    s: "The client side of retrieving objects: reads configured remotes, negotiates, receives and verifies a pack, indexes it, and updates remote-tracking references.",
    d: "The client resolves a remote's URL and refspecs, connects, lists references, decides which wanted objects it lacks, and negotiates. The incoming pack is written to a temporary file, completed with any referenced base objects when thin, checked for connectivity so every reachable object is present, and indexed. Only then are tracking references updated, in one transaction. Pruning removes tracking references for branches deleted upstream. The hard part is atomicity: an interrupted fetch must leave either old or new state, never a reference to missing objects.",
    k: ["Verify connectivity before updating references vs trust the pack: verification prevents corrupt state at the cost of an extra walk; trusting is faster and unsafe.", "Fetch everything vs only configured branches: everything is simple and keeps tracking complete, but costs bandwidth on repositories with many branches."],
    p: ["Disabling connectivity checks for speed and later finding references to missing objects.", "A stale tracking reference for a deleted remote branch that is never pruned and confuses tooling."],
    v: "Interrupt a fetch halfway, then check that no tracking reference moved, fsck reports no missing objects, and a retry completes with only the remaining data transferred.",
    dep: ["ref-advertisement", "want-have-negotiation", "ref-transactions", "pack-index", "refspecs-and-remote-tracking"]
  },
  "push-and-receive": {
    s: "Sends new objects and requested reference updates to a remote, and the receiving side validates the pack and applies each update only if its expected old value still matches.",
    d: "The client lists the references it wants to change as old value, new value and name, then sends a pack with the objects the server lacks. The server stores the pack in quarantine, checks connectivity, runs pre-receive checks, and updates each reference with a compare-and-swap on the old value, reporting per-reference status. A force option permits non-fast-forward changes; a lease option states the old value the client expects. An atomic option makes all updates succeed or fail together. The hard part is races between concurrent pushers.",
    k: ["Plain force vs force with lease: plain force overwrites whatever is there; a lease refuses if someone else pushed in the meantime.", "Atomic all-or-nothing vs independent updates: atomic keeps related branches consistent but fails everything for one conflict."],
    p: ["Force pushing over a teammate's new commits because the local tracking reference was stale.", "A push that partially succeeds, leaving some references updated and the user unsure which."],
    v: "Push from two clones to the same branch with leases; confirm the second is rejected as stale, the first stands, and the server's reflog shows only one update.",
    dep: ["pack-index", "ref-transactions", "server-hooks", "object-integrity-check"]
  },
  "bundles": {
    s: "A single file holding a pack plus a list of references, usable as a remote for offline transfer, seeding clones, or backup.",
    d: "A bundle starts with a header listing prerequisite commits that the receiving repository must already have, then reference names and identifiers, then a pack. Fetching from a bundle file works like fetching from a remote. A full bundle with no prerequisites can seed a clone; an incremental bundle contains only changes since a given point. Bundles move data across air gaps and cut load on the main server when distributed through a content network. The hard part is prerequisite tracking: an incremental bundle is useless without the right base.",
    k: ["Full bundles vs incremental bundles: full ones are self-contained and large; incremental ones are small but require the recipient to have the prerequisites.", "Bundle transport vs live fetch: bundles survive disconnected networks and can be cached, but are stale the moment they are made."],
    p: ["Handing someone an incremental bundle without telling them its prerequisite commit.", "Using bundles as backup without verifying them, then finding the bundle is incomplete when restoring."],
    v: "Create a bundle, verify it, clone from it in an empty directory, then add a commit upstream and confirm a fetch from the original remote transfers only the new objects.",
    dep: ["packfile-format", "reference-namespace", "fetch-client"]
  },
  "credential-helpers": {
    s: "Pluggable programs that supply or store credentials for remote access, so passwords and tokens stay out of configuration files and URLs.",
    d: "When a remote answers with an authentication challenge, the client calls the configured helper with a description of the host and path and reads back username and password or token. After success it tells the helper to store them; after failure to erase them. Helpers may use the operating system's secure store, a time-limited memory cache, or a command that asks an identity provider. A chain of helpers is tried in order. The hard part is security: credentials must not be logged, and a helper must be matched to the right host.",
    k: ["OS secure store vs time-limited memory cache: the store survives restarts and is protected by the account; the cache never writes to disk but asks again.", "Per-host helper configuration vs one global helper: per-host limits leakage between services, but needs more configuration."],
    p: ["A token embedded in the remote URL ending up in shell history, logs and the repository configuration.", "A helper sending a credential to a redirected host the user did not intend."],
    v: "Fetch from a private remote, confirm the helper is asked once and stores the secret, and that the next fetch succeeds with no prompt and no secret in the repository's configuration file.",
    dep: ["authentication"]
  },
  "shallow-clones": {
    s: "Clones that truncate history at a chosen depth or date, recording a boundary of commits whose parents are treated as absent.",
    d: "A shallow repository keeps a file listing boundary commits; the walk treats their parents as missing. The server computes the pack from the requested depth, and later fetches can deepen the history or convert it back to a full clone. Each side needs to understand the other's boundary during negotiation. Many operations work normally, but those needing deep ancestry, such as merge base and blame, may be wrong or fail. The hard part is correctness at the boundary, and the load on the server of computing shallow cutoffs.",
    k: ["Shallow depth vs a partial clone: shallow is simple and cuts bandwidth, but breaks history operations; partial keeps the full graph and fetches content lazily.", "Depth by commit count vs by date: count is exact and simple; date follows a time window but varies by activity."],
    p: ["Merge base and blame operations producing wrong answers or errors at the shallow boundary.", "Repeated deepening producing slow negotiation as the boundary file grows."],
    v: "Clone with depth one, confirm the log shows one commit and the boundary file lists it, then deepen by ten and confirm exactly ten more commits and a corrected merge base.",
    dep: ["history-traversal", "merge-base-computation", "want-have-negotiation"]
  },
  "partial-clone-filters": {
    s: "A clone that omits selected objects, such as all blobs, blobs over a size, or trees beyond a depth, as chosen by a filter specification sent to the server.",
    d: "The client sends a filter with its fetch, and the server omits matching objects from the pack. The full commit graph is kept so history and branch operations work. Missing objects are fetched on demand when a command needs their content, through the lazy fetch mechanism. A filter such as blobless keeps trees and commits only; treeless omits trees too and is smaller but triggers more fetches. The hard part is workload fit: a command touching many old files triggers a long series of on-demand requests.",
    k: ["Blobless vs treeless: blobless is smaller than full and keeps tree walks local; treeless is much smaller but history operations need many network requests.", "Size-limit filters vs exclude all blobs: a size limit keeps small files local for responsiveness but still needs a fetch for each large one."],
    p: ["Running blame or log with patches on a blobless clone triggers thousands of separate fetches.", "Going offline with a partial clone and finding that needed objects were never downloaded."],
    v: "Make a blobless clone and compare disk size to a full clone; then run a command that reads an old file and confirm exactly that blob is fetched on demand and then cached.",
    dep: ["want-have-negotiation", "lazy-object-fetch", "pack-generation-for-transfer"]
  },
  "lazy-object-fetch": {
    s: "On-demand retrieval of a missing object from the remote that promised it when a command first needs it, recording which packs came from such a promise.",
    d: "Packs received through a filtered clone are marked as promisor packs, and the repository remembers the remote that vouches for them. When an object read fails locally and the object would be inside the promise, the system fetches it by identifier and stores it. Batching lets a command request many missing objects at once rather than one per round trip. Integrity checks and garbage collection must treat missing promised objects as legitimate rather than as corruption. The hard part is hidden latency inside ordinary commands.",
    k: ["Fetch on first read vs prefetch in batches: on-demand is simple, but batching changes thousands of round trips into a few.", "Treating promised objects as missing-OK vs strict integrity: leniency makes the clone usable, but can hide real loss."],
    p: ["A tool that reads every blob one at a time, producing a network request each and stalling for minutes.", "A promisor remote that deletes or moves objects, leaving clones unable to fetch what they were promised."],
    v: "In a partial clone, run a diff touching fifty old blobs with batching enabled and confirm the trace shows one batched request for them rather than fifty.",
    dep: ["partial-clone-filters", "object-database-abstraction", "fetch-client"]
  },
  "sparse-checkout": {
    s: "Materializes only a chosen subset of paths in the working tree while the index and history still describe the whole project.",
    d: "A pattern list or, in cone mode, a list of directories selects which paths appear on disk. Entries outside the set stay in the index but are flagged to skip the worktree, so status and commit still work on the included area. Cone mode matches whole directories, which allows fast prefix checks instead of evaluating every pattern per file. Combined with a partial clone, files outside the set are never downloaded. The hard part is operations that cross the boundary, like search and merges touching excluded paths.",
    k: ["Cone mode (directories) vs full patterns: cone mode is fast and simple to reason about; patterns are flexible but are slow for every path check.", "Sparse index vs full index: collapsing excluded directories to single entries shrinks the index and speeds commands, but tools must understand the collapsed form."],
    p: ["A merge that conflicts in an excluded path forcing it into the working tree unexpectedly.", "Search tools missing matches in excluded directories and being trusted as complete."],
    v: "Enable cone mode for one directory in a large repository and confirm only it exists on disk, status stays fast, and a commit there records the correct tree for the whole project.",
    dep: ["index-file-format", "checkout-and-switch", "pathspec-matching", "index-extensions"]
  },
  "large-file-pointers": {
    s: "Replaces large binary files in history with small pointer files and stores the real content on a separate server, fetched when the file is checked out.",
    d: "A clean filter turns the file into a short text pointer with a hash and size, and uploads the content to a separate store through its own protocol; a smudge filter swaps the pointer back to content on checkout by downloading it. Attributes mark which paths use the mechanism. The repository stays small and diffs of pointers are readable, but the large content is outside the object model, with its own authentication, retention and garbage collection. The hard part is that two systems must stay consistent.",
    k: ["Pointers with an external store vs native large objects: pointers keep clones small today, but add a second server and a second failure mode; native storage is uniform but makes every clone heavy.", "Download on checkout vs prefetch all: on-checkout downloads only what is used, while prefetch is slower at first but works offline."],
    p: ["Pushing pointers without uploading content, so teammates check out files they cannot download.", "Removing the external store's data while old commits still point to it."],
    v: "Track a large file, commit and push it, then clone fresh and confirm the repository objects hold only a small pointer and the checked-out file matches the original hash after download.",
    dep: ["clean-and-smudge-filters", "attributes", "blob-objects"]
  },
  "submodules": {
    s: "Embeds a pointer to a commit of another repository inside a tree, so one project can pin and include another's exact version at a path.",
    d: "A tree entry with a special mode names a commit identifier in a different repository, and a file records the name, path and URL. Checkout creates an empty directory until the submodule is initialized and cloned; updating sets it to the recorded commit. The parent records only the identifier, so a change inside the submodule must be committed and pushed there before the parent points at it. Commands can recurse over all of them. The hard part is coordination: the pinned commit must exist upstream and everyone must update.",
    k: ["Submodules vs copying the code in: submodules keep history and exact pinning with extra workflow steps; copying is simple and loses the link to upstream.", "Recursive operations by default vs explicit: recursion keeps the tree consistent but multiplies cost and surprises."],
    p: ["Committing the parent that points at a submodule commit that was never pushed, breaking clones for everyone else.", "Forgetting to update submodules after pulling so that the working tree mismatches the recorded commit."],
    v: "Update a submodule and commit it, then clone the parent recursively on another machine and confirm the submodule is at exactly the recorded commit identifier.",
    dep: ["tree-objects", "checkout-and-switch", "fetch-client"]
  },
  "precomputed-bundle-offload": {
    s: "Serving the bulk of an initial clone from static bundle files on a cache or content network, so the main server only handles the recent remainder.",
    d: "The server advertises one or more bundle locations. A new client downloads a bundle, which may be fetched in parallel and resumed after interruption, unpacks it, then performs a normal fetch to catch up. A nightly job generates bundles and publishes them. Several bundles by age let incremental updates stay small. The approach moves bandwidth and CPU away from the origin and allows caching near users. The hard part is freshness: bundles must be regenerated often enough that the catch-up fetch stays small.",
    k: ["Bundle offload vs serving every clone dynamically: offload cuts server CPU and enables resume, but adds a generation pipeline and storage.", "One big bundle vs layered bundles: one is simple, and layers keep updates cheap but need a coordinating list."],
    p: ["Stale bundles making the catch-up fetch nearly as large as a full clone.", "Publishing a bundle containing objects from a private reference to a public location."],
    v: "Clone from a server advertising a bundle and confirm the bulk arrives from the static location, with the origin handling only a small fetch for commits newer than the bundle.",
    dep: ["bundles", "fetch-client", "background-maintenance"]
  },
  "monorepo-strategy": {
    s: "The combination of settings and practices that keep a very large single repository usable: sparse and partial clones, commit-graph, file system monitor, background maintenance and path-based ownership.",
    d: "At scale each cost that is linear in repository size becomes the bottleneck: status scans, history walks, index size, reference counts, and pack enumeration. Teams combine mechanisms: partial clone to avoid downloading history of content, sparse checkout and sparse index to reduce working data, commit-graph and bitmaps for traversal, a file system monitor for status, and prefetch jobs. Server side, they limit reference counts and use storage tiers. The hard part is that no single feature fixes it, and each requires configuration.",
    k: ["One large repository vs many repositories: one gives atomic cross-project changes and simple dependency updates, but needs scale features and tooling; many scale simply but split change atomicity.", "Server-side enforced ownership vs trusted paths: ownership files and review rules scale review, but become a bottleneck if the rules are complex."],
    p: ["Enabling the features on the server but not on client machines, so developers still suffer slow commands.", "A new tool that scans every file ignoring sparse boundaries and bringing a client to its knees."],
    v: "Measure status, checkout, fetch and log times on the largest tree with and without the feature set, and confirm each drops to interactive speed, reported per command.",
    dep: ["partial-clone-filters", "sparse-checkout", "filesystem-monitor", "commit-graph-file", "background-maintenance", "reachability-bitmaps"]
  },
  "graft-and-replace-history": {
    s: "Mechanisms that make one object appear to be another, or alter a commit's parents locally, to stitch together imported history or hide a bad commit without rewriting.",
    d: "A replacement reference maps an original object identifier to a different one; reads of the original return the replacement's content. This lets old and new histories be joined, a large file hidden or a commit fixed locally, while every identifier in the real history stays the same. The replacements live in a reference namespace and can be shared by fetching it. Because they change what readers see without changing identifiers, they are disabled for transfer and integrity checks. The hard part is that they make local history differ from remote history.",
    k: ["Replacement refs vs rewriting history: replacements keep identifiers and require no coordination, but only apply where the replacement exists; rewriting changes everything for everyone.", "Share replacements vs keep them local: sharing makes views consistent, local use is private but confusing to others."],
    p: ["Forgetting a local replacement exists, then being unable to explain why history differs from the server's.", "Tools that read objects directly bypassing replacement and seeing the original content."],
    v: "Replace a commit with a corrected one, confirm log shows the corrected parent chain locally, and confirm a fresh clone without the replacement namespace still shows the original.",
    dep: ["reference-namespace", "object-database-abstraction", "commit-objects"]
  },
});
