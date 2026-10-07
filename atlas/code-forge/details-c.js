// Details for the code hosting forge plate, part 3: repository protocol server, forks and large files, repository storage.
ATLAS.details("code-forge", {
  "smart-http-endpoint": {
    s: "The HTTP front end for fetch and push: authenticates the request, authorizes it against the repository, and streams protocol messages between the client and the repository service.",
    d: "A clone or push is a short series of HTTP requests: one to discover capabilities and refs, then one or more to exchange packs. The endpoint authenticates with a token or session, checks read or write permission, and proxies the body to the process that speaks the protocol, often on another machine chosen by routing. Bodies are streamed and can last minutes and gigabytes, so timeouts, buffering and backpressure matter. Load balancers must not buffer whole requests or retry non-idempotent pushes.",
    k: ["Streaming proxy vs buffering the request: streaming holds memory flat and ties a connection to a backend for its whole duration; buffering frees backends sooner and costs memory and delays.", "Authenticating before routing vs inside the backend: early authentication protects backends and requires a shared permission service on the hot path."],
    p: ["A load balancer retries a half-sent push to another backend and creates duplicate or conflicting ref updates.", "Idle timeouts shorter than the pack-building time kill clones of large repositories at the same point every time."],
    v: "Clone a multi-gigabyte repository over HTTP through the production path and confirm it completes without buffering the body in memory; interrupt a push mid-stream and confirm no partial ref update remains.",
    dep: ["repository-routing","teams-and-roles","access-tokens","pack-negotiation","receive-pack","ref-advertisement"]
  },
  "ssh-endpoint": {
    s: "The SSH front end for repository access: terminates the encrypted session, identifies the key, authorizes the command and hands the byte stream to the same protocol code as HTTP.",
    d: "The server accepts connections, matches the offered key to an account or deploy key, and permits only a fixed set of repository commands, never a shell. The requested repository path is resolved to an internal location, permissions are checked for the operation, and the protocol process is started with the actor's identity in its environment so hooks can see it. Compared with HTTP it has fewer proxies in the way and less flexibility in authentication. The hard parts are connection counts and limiting what a key can reach.",
    k: ["Custom SSH server vs the system daemon with forced commands: custom gives control over lookup and scale and means maintaining a security-critical server; the system daemon is proven and awkward at millions of keys.", "Passing identity by environment vs re-authenticating in hooks: environment is simple and must be set in one trusted place."],
    p: ["A path given by the client that is not normalized lets a user address another repository's directory.", "Thousands of idle connections from build farms exhaust file descriptors on the front end."],
    v: "Connect with a valid key and attempt an interactive shell and an arbitrary command, confirming both are refused; clone a repository the key may read and confirm one for which it has no access returns the same error as a missing one.",
    dep: ["ssh-and-deploy-keys","repository-routing","teams-and-roles","pack-negotiation","receive-pack"]
  },
  "ref-advertisement": {
    s: "The first message of a fetch or push: the server lists the branches and tags it has, with the commit each points to, so the client can decide what to request or send.",
    d: "The server reads the repository's references and sends them with their capabilities. In the newer protocol version the client asks with a filter, so it receives only the refs it needs rather than all of them. Large repositories can have millions of refs, so listing them all is a cost in itself, in memory and bandwidth. Hidden internal references, such as those that keep pull request commits reachable, must be excluded from the advertisement but remain available to the forge.",
    k: ["Prefix-filtered listing vs advertising all refs: filtering saves bandwidth for repositories with huge ref counts and needs a client that supports it; all-refs works with every client.", "Hiding internal refs vs exposing them: hiding keeps clones small; exposing lets users fetch pull request heads by name."],
    p: ["Millions of refs make every fetch start with a multi-megabyte listing, even when nothing changed.", "Failing to hide refs for a private fork's source network advertises commit ids that reveal unreleased work."],
    v: "Fetch from a repository with many refs using the filtered protocol and confirm only the requested prefixes are returned; confirm internal pull request refs do not appear in a normal clone's remote listing.",
    dep: ["object-database","bare-repository-layout","repository-visibility"]
  },
  "pack-negotiation": {
    s: "The conversation in which client and server work out which commits the client already has, so the server sends only what is missing.",
    d: "The client lists tips it wants and tips it has, and the server replies which commits it recognizes as common. Repeating this narrows the boundary between what each side has. The goal is the smallest set of objects to send without many round trips. The server walks the commit graph from wanted commits until it meets the client's known set. For large repositories, reachability bitmaps make this fast. For unusual clients, such as shallow ones, the boundaries need special handling.",
    k: ["More negotiation rounds vs sending extra objects: more rounds shrink the pack and add round trips; sending a superset wastes bandwidth and finishes sooner on fast links.", "Stateless request-per-round over HTTP vs a persistent connection: stateless lets any backend serve any round and repeats state on each request; persistent is simple and ties up a backend."],
    p: ["A client with thousands of local tips sends them all each round and slows the negotiation to a crawl.", "Servers walking history without bitmaps spend seconds of CPU on every fetch of a deep repository."],
    v: "Fetch into a clone that is one commit behind and confirm the server sends only that commit's new objects, measuring the transferred bytes against a full clone.",
    dep: ["commit-graph-and-bitmaps","object-database","ref-advertisement"]
  },
  "pack-generation": {
    s: "Builds the compressed bundle of objects a client needs, choosing which to include, reusing stored deltas where possible and streaming the result.",
    d: "After negotiation, the server enumerates the needed objects, then writes them as a pack, preferring to copy existing compressed data and deltas from stored packs instead of recompressing. When reuse is not possible, it searches for good delta bases, which is the CPU-heavy step. The pack can be streamed while still being produced. The hard parts are cost and memory: a clone of a large repository can use a full core for minutes, and a few clients can overload a node.",
    k: ["Reusing stored deltas vs recomputing optimal ones: reuse makes the pack fast to produce and slightly bigger; recomputing shrinks it and burns CPU per request.", "Serving a precomputed pack for clones vs building per request: precomputed is nearly free to serve and goes stale; per request is always exact and costly."],
    p: ["An abusive client requests the whole repository repeatedly and consumes all CPU on the storage node.", "A pack built from a repository with missing objects fails halfway after streaming a large part."],
    v: "Time a full clone of a large repository with and without the pack cache and confirm CPU time on the storage node drops by the expected factor; verify the received pack passes a connectivity check on the client.",
    dep: ["object-database","packfile-maintenance","commit-graph-and-bitmaps","pack-cache"]
  },
  "receive-pack": {
    s: "Accepts a pushed pack, stores the objects, runs policy checks and updates references atomically, reporting per-ref results back to the client.",
    d: "The client sends the old and new ids for each ref and a pack of new objects. The server writes the pack into a quarantine area, validates the objects and connectivity, runs hooks and rules, and only then makes the objects visible and moves the refs. Updates compare the old value to detect races. Multiple refs can update atomically or independently. After success, post-receive work triggers events for webhooks, indexing, checks and pull request updates. The hard part is that failure at any step must leave nothing half-applied.",
    k: ["Quarantining objects until checks pass vs writing them directly: quarantine keeps rejected pushes from polluting storage and needs a move step; direct writes are simple and leave garbage.", "Atomic multi-ref updates vs independent: atomic keeps related refs consistent and fails all on one conflict; independent is more forgiving and can leave a partial state."],
    p: ["A crash between moving objects and updating refs leaves unreferenced objects that are never cleaned up without maintenance.", "Post-receive events lost after a successful push leave pull requests and indexes silently stale."],
    v: "Push two refs where one violates a rule and confirm the response names the rejected ref and, with atomic mode, that neither moved; kill the server mid-push and confirm no ref points to a missing object.",
    dep: ["pre-receive-hooks","reference-transactions","object-database","quota-and-size-limits"]
  },
  "pre-receive-hooks": {
    s: "Code that runs on the server before a push is accepted, deciding to allow or reject based on the pushed commits, the actor and the target refs.",
    d: "Built-in hooks enforce branch rules, size limits, secret scanning, signature requirements and commit-message policies. Custom hooks, for enterprises, run in a sandbox with a time limit and receive the old and new ids per ref on standard input. They must read objects from the quarantine area. Their output is returned to the pusher as readable messages. The risk is that hooks sit on the critical path of every push, so one slow or buggy hook degrades the whole service.",
    k: ["Synchronous hooks that can reject vs asynchronous checks after the push: synchronous enforces policy and adds push latency; asynchronous is fast and cannot block bad content.", "Sandboxed custom hooks vs only built-in rules: sandboxing gives customers flexibility and needs isolation and resource limits; built-in is safe and rigid."],
    p: ["A hook that walks all of history on every push times out on large repositories and blocks every contributor.", "A hook that throws an internal error rejects pushes with an unreadable message and no way to proceed."],
    v: "Install a hook that rejects commits with a banned phrase, push one and confirm the rejection message shows the commit and rule; push a clean commit and confirm hook runtime stays within its limit.",
    dep: ["branch-protection","secret-scanning","signed-commit-verification","object-database"]
  },
  "partial-and-shallow-clone": {
    s: "Lets clients fetch a limited history or leave out large objects until needed, so huge repositories can be used without downloading everything.",
    d: "A shallow clone cuts history at a depth or date, so the server marks boundary commits and sends only what is above them. A partial clone applies a filter, such as omitting blobs or those over a size, and the client fetches the missing objects on demand from the promisor remote. Both change what the server must be able to compute: object selection by filter and later lookups of individual objects. They cut clone size dramatically and make every later operation a possible network call.",
    k: ["Blobless filter vs shallow depth: blobless keeps full history for log and blame and fetches content lazily; shallow is smaller and loses history operations.", "Allowing arbitrary filters vs a fixed set: arbitrary is flexible and can be expensive to evaluate; fixed is predictable and limited."],
    p: ["Build systems cloning shallow fail when tools later need the merge base that was cut off.", "Lazy blob fetching one at a time makes a repository command that touches many files take minutes over a slow link."],
    v: "Clone with a blobless filter and confirm the transfer is a small fraction of a full clone; check out a revision and confirm only needed blobs are fetched afterward and the working tree matches a full clone.",
    dep: ["pack-negotiation","pack-generation","object-database"]
  },
  "fork-networks": {
    s: "The group of repositories descended from one another that share object storage, so a fork costs almost nothing and pull requests between them need no copying.",
    d: "A fork starts as a new repository record that points at a shared object store of its network. Each member keeps its own refs while objects live once. Pushes to a fork add objects to the shared store, which means unreachable-object cleanup must consider every member's refs. Pull requests between forks compare objects directly. The hard parts are access control, because shared storage must not reveal private objects through one member to another, and garbage collection across many owners.",
    k: ["Shared object storage vs full copies per fork: sharing makes forks instant and cheap and complicates deletion, quotas and privacy; copies are isolated and expensive.", "One network for all forks vs a tree: one network maximizes sharing; a tree isolates sub-communities and loses deduplication."],
    p: ["An object pushed to a private fork can be fetched from a public sibling by commit id if the storage layer does not scope reads by member.", "Deleting the root repository must not delete objects other members still reference."],
    v: "Fork a repository, push a commit to the fork and confirm storage grows by only the new objects; request that commit id through a sibling fork and confirm it is refused.",
    dep: ["object-database","bare-repository-layout","repository-visibility","packfile-maintenance"]
  },
  "mirroring": {
    s: "Keeps a repository synchronized with another host, either pulling from an upstream on a schedule or pushing every change out to a downstream copy.",
    d: "A pull mirror periodically fetches all refs from a remote and updates local refs to match, optionally pruning deleted ones. A push mirror runs after each local change and pushes refs to another remote. Credentials for the remote are stored encrypted. Schedules need backoff on failure, and divergence needs a policy: overwrite local, or stop and alert. Mirrors are used for migrations, backups, air-gapped networks and public read copies of private development.",
    k: ["Pull vs push mirroring: pull needs no access to the remote's internals and lags by the interval; push is nearly immediate and requires write credentials on the remote.", "Force-updating mirrored refs vs refusing non-fast-forward: forcing keeps an exact copy and destroys local work; refusing protects it and stalls."],
    p: ["Stored remote credentials are exposed through logs or exports and give access to the remote host.", "A rewritten upstream history overwrites the mirror's refs and objects reachable only from them are later collected."],
    v: "Set up a pull mirror, push to the upstream and confirm the new commit appears within the interval; force-push upstream and confirm the mirror's configured policy is applied and an alert fires.",
    dep: ["receive-pack","job-queue","object-database","maintenance-scheduler"]
  },
  "large-file-pointers": {
    s: "Small text stand-ins committed to history in place of large binary files, so repositories stay small while the real content is fetched separately when needed.",
    d: "A client-side filter replaces a tracked file's content with a short pointer holding a hash and size when committing, and replaces the pointer with real content on checkout. The repository stores only pointers; the content is uploaded to a separate store through the forge's large-file API. The forge reads pointers to count usage, show previews and enforce permissions. It works because the version control format handles tiny text well and big binary changes badly, since each version is stored in full.",
    k: ["Pointer files with a separate store vs storing binaries in history: pointers keep clones fast and need extra client tooling and a second service; in-history is simple and bloats every clone.", "Tracking by pattern vs by size: patterns are explicit and miss unexpected large files; size-based catches them and surprises users."],
    p: ["A large file committed before the pointer filter was configured is already in history and stays there, bloating every clone.", "A pointer pushed without its content uploaded leaves a repository nobody can fully check out."],
    v: "Track a pattern, commit a hundred-megabyte file and confirm the repository grew by only the pointer; clone and confirm the checked-out file has the original checksum and the pack itself is small.",
    dep: ["large-file-store","receive-pack","object-database"]
  },
  "large-file-store": {
    s: "The service that stores and serves the content behind large-file pointers, with its own authentication, upload and download protocol, quotas and deduplication.",
    d: "Clients request upload or download actions for object ids and receive signed addresses in object storage, so bulk bytes bypass application servers. The service verifies that the pushed pointer refers to uploaded content, checks permissions against the repository, and tracks storage and bandwidth per account. Content is deduplicated by hash across a fork network. Garbage collection finds content no pointer references. The hard parts are cost, since bandwidth is expensive, and cleanup, since references are hidden inside history.",
    k: ["Signed direct-to-storage transfers vs proxying through the service: direct scales and offloads bandwidth; proxying gives full control and doubles traffic.", "Deduplicating across the fork network vs per repository: network-wide saves space and requires scoped access checks; per repository is isolated and wasteful."],
    p: ["Signed addresses with long lifetimes are shared or logged and give anyone download access.", "Garbage collection that only looks at current branch pointers deletes content referenced from older history or other forks."],
    v: "Upload a file, download it through a second clone and confirm the bytes come from object storage with a signed address; delete the only branch referencing it and confirm collection waits for the retention period.",
    dep: ["blob-object-store","teams-and-roles","quota-and-size-limits","fork-networks"]
  },
  "repository-import": {
    s: "Brings an existing project from another host into the forge, with history and optionally issues, reviews and attachments, mapped to local users where possible.",
    d: "Repository history is the easy part: a mirror clone followed by validation. Metadata is hard: it comes through the source system's API, needs rate-limit-aware crawling, and maps foreign usernames to local accounts or placeholders. Import runs as a long background job with progress, retries and the ability to resume. Large imports can create tens of thousands of notifications, so those are suppressed. The fidelity target is that numbers, authorship and dates survive.",
    k: ["Preserving original numbers and timestamps vs allocating new ones: preserving keeps old references valid and needs special write paths; allocating is simple and breaks links.", "Mapping to existing users vs placeholder users: mapping gives accurate ownership and risks wrong matches; placeholders are safe and need later claiming."],
    p: ["An import that sends a notification for every historic comment emails thousands of people.", "A partially failed import leaves a half-populated repository that users start working in."],
    v: "Import a repository with issues and pull requests, confirm counts and numbers match the source, authors map correctly or show placeholders, and no notifications were sent for historic items.",
    dep: ["job-queue","issue-model","pull-request-model","notification-fanout"]
  },
  "template-repositories": {
    s: "Repositories marked as starting points: creating from one copies the files without history, so each new project starts clean from a standard layout.",
    d: "Generation reads the template's tree at its default branch and writes a new repository with a single initial commit containing those files, optionally substituting placeholder variables. Unlike a fork, there is no link to the original and no shared history. Organizations use templates to enforce standards across hundreds of projects. The work is a tree copy and a new repository creation, which should be fast; the hard part is that repository creation itself touches many systems and must stay atomic.",
    k: ["Copy without history vs fork: a copy is independent and tidy and cannot receive template updates; a fork keeps the relationship and drags along the template's history.", "Variable substitution at creation vs none: substitution saves manual edits and invites template-injection surprises."],
    p: ["Creation partly fails after the repository record exists and leaves a project with no commits.", "Templates that include secrets or private keys copy them into every new project."],
    v: "Create ten repositories from a template concurrently and confirm each has exactly one initial commit with the template's files and no reference to the template's history.",
    dep: ["object-database","repository-routing","bare-repository-layout","metadata-database"]
  },
  "bare-repository-layout": {
    s: "The on-disk form of a hosted repository: a directory holding the object store, references, configuration and hooks, with no working tree.",
    d: "A bare directory contains an objects folder with loose and packed objects, a refs area and a packed refs file, configuration, and hook entries. The forge adds its own conventions: hidden namespaces for pull request refs, alternates pointing to a shared object store for forks, and per-repository settings such as limits. Directory names are derived from numeric ids, not user-chosen names, so renames are metadata only. Filesystem behavior matters: millions of small files stress inode counts and fsync cost.",
    k: ["Loose refs as files vs a packed single file or table: files are simple and slow with many refs; packed or table formats scale and need careful locking.", "Directories named by id vs by owner and name: ids make renames free and make manual debugging harder."],
    p: ["Case-insensitive or Unicode-normalizing filesystems conflate two refs or paths that differ only by case.", "A repository with millions of loose refs makes every listing take seconds because each is a separate file read."],
    v: "Rename a repository and confirm no directory on disk moves and clones through the new name work; create ten thousand refs and confirm listing time stays within the target after packing.",
    dep: ["storage-node-agent","object-database"]
  },
  "object-database": {
    s: "The content-addressed store of commits, trees, blobs and tags in a repository, written as loose files or packs and read by hash.",
    d: "Every object is identified by a hash of its content. New objects arrive loose and are later combined into packs, where similar objects are stored as deltas against each other. Reads check packs through index files, then loose objects. Alternates let a repository read objects from others, as in fork networks. Because objects are immutable, they cache and replicate trivially, and corruption is detectable by rehashing. The difficulty is volume and layout: performance depends on pack count, delta chains and whether reachability data is current.",
    k: ["Loose objects first then pack later vs always packing on write: loose is fast to write and slow to read in volume; packing on write is compact and expensive per push.", "Hash function choice and transition: stronger hashes defend against crafted collisions and break compatibility with existing identifiers."],
    p: ["Thousands of small packs from many pushes slow every lookup until a repack consolidates them.", "Silent disk corruption of a pack goes unnoticed until a clone fails, since objects are only verified when read."],
    v: "Run an integrity check over a repository and confirm all objects hash to their ids; corrupt one byte of a pack in a test copy and confirm the check reports the exact object.",
    dep: ["bare-repository-layout","storage-node-agent"]
  },
  "packfile-maintenance": {
    s: "Background work that consolidates loose objects and small packs into efficient packs, recomputes deltas and removes unreachable data without breaking concurrent reads.",
    d: "Maintenance jobs repack objects, prune unreachable ones after a grace period, pack references, and refresh derived data like commit graphs. Frequency depends on churn: a repository that receives constant pushes needs incremental repacking, a quiet one rarely. For fork networks, repacking must keep objects reachable from every member. Jobs are throttled and scheduled to avoid I/O storms. The hard part is safety: pruning must never remove an object a concurrent push has just written but not yet referenced.",
    k: ["Incremental repack vs full repack: incremental is cheap and gradually degrades layout; full gives the best result and monopolizes disk and CPU for large repositories.", "Short vs long grace period before pruning: short saves space and risks deleting objects mid-push; long is safe and holds garbage."],
    p: ["Pruning while a push is in flight deletes new objects that are not yet referenced, producing a corrupt repository.", "Running full repacks on many repositories at once saturates the disks and starves interactive traffic."],
    v: "Push a thousand small commits, run maintenance, and confirm the object count and pack count fall while clone time improves; run maintenance concurrently with pushes and confirm integrity checks pass afterward.",
    dep: ["object-database","maintenance-scheduler","commit-graph-and-bitmaps","fork-networks"]
  },
  "commit-graph-and-bitmaps": {
    s: "Precomputed indexes that speed up history traversal and reachability: a compact graph of commit relationships and bitmaps of which objects each tip reaches.",
    d: "Without them, finding merge bases, ancestry or the objects needed for a fetch means opening and parsing commits one by one. A commit-graph file stores parents and generation numbers in compact form, making ancestor tests and log walks much faster. Reachability bitmaps record, for selected commits, which objects are reachable, so pack generation can enumerate objects almost without walking. Both are rebuilt during maintenance and become stale as new pushes arrive.",
    k: ["Bitmaps for selected commits vs all: selected tips keep the index small and make others partly walk; all is fast and enormous.", "Rebuilding on every push vs on schedule: every push is always fresh and expensive; on schedule is cheap and leaves new commits unindexed."],
    p: ["A repository whose bitmaps are stale after a burst of pushes sees clone CPU jump tenfold until rebuild.", "Building bitmaps over a repository with many tiny packs fails or is slow unless packs are consolidated first."],
    v: "Measure merge-base computation and clone object enumeration on a large repository before and after building the graph and bitmaps, and confirm the speedup matches the target.",
    dep: ["object-database","packfile-maintenance"]
  },
  "repository-routing": {
    s: "Maps a repository to the storage machines that hold it, so any front-end server can find and talk to the right place for each request.",
    d: "A routing table, kept in the metadata database and cached in front ends, maps each repository id to a primary and its replicas. Requests resolve the name to an id, then to a node. Moves for rebalancing or failover update the table, and caches must be invalidated or tolerate old answers by following redirects. The table is on the critical path of every repository operation and web page, so lookups must be fast and the service must keep working when the table store is slow.",
    k: ["Table lookup vs hashing to a node: a table allows arbitrary moves and is one more service; hashing needs no lookup and makes rebalancing move many repositories.", "Cached routes with redirect on miss vs strongly consistent lookups: cached is fast and sometimes wrong briefly; strong is correct and adds latency."],
    p: ["A stale route sends a push to a node that no longer owns the repository, creating a second divergent copy.", "The routing store becoming unavailable stops all repository traffic if no cached fallback exists."],
    v: "Move a repository to another node during a stream of reads and confirm requests keep succeeding after at most one retry and exactly one node accepts writes throughout the move.",
    dep: ["metadata-database","cache-layer","storage-node-agent","replica-placement"]
  },
  "storage-node-agent": {
    s: "The service on each storage machine that executes repository operations against local repositories, exposing them over an internal interface with resource limits.",
    d: "Front ends and the application never touch repository directories directly. They call the agent, which spawns or reuses repository processes, enforces per-operation time and memory limits, and streams results back. It handles locking, background maintenance, replication hooks and health reporting. Centralizing access lets the system change storage layout without changing callers. The difficulty is isolation: a single expensive command must not starve others on the same machine, and processes must be cleaned up when callers disconnect.",
    k: ["A long-running agent with its own protocol vs spawning commands over SSH: the agent can pool, limit and observe operations at the cost of building and operating a service.", "Process per operation vs a persistent worker per repository: per operation is isolated and pays startup cost; persistent is fast and accumulates state."],
    p: ["A client disconnect leaves a pack-building process running and consuming CPU for minutes after nobody is listening.", "Unbounded concurrent operations on one node push it into swap and every repository there becomes slow."],
    v: "Start a large clone, disconnect the client, and confirm the associated process on the node is gone within seconds; launch concurrent operations beyond the limit and confirm excess ones queue or fail fast.",
    dep: ["bare-repository-layout","object-database","load-shedding"]
  },
  "quota-and-size-limits": {
    s: "Limits on repository size, file size, object count and account storage, enforced at push time with clear errors and an escalation path.",
    d: "Limits protect storage and keep clone times bearable. A push is checked for individual file size and total repository size after accounting for shared objects. Size accounting is itself nontrivial: loose and packed sizes differ, forks share storage, and deleted objects stay until collected. Soft limits warn, hard limits reject. Large-file storage has separate quotas. The hard parts are accurate and cheap measurement, and fairness when a shared network's size is attributed to owners.",
    k: ["Hard rejection at push time vs warning and later cleanup: rejection prevents growth and blocks legitimate work at an awkward moment; warnings are friendly and let abuse grow.", "Charging forks for shared objects vs not: charging is fair and confusing; not charging is simple and lets owners use the network as free storage."],
    p: ["Size measured from loose objects only undercounts, and the repository suddenly exceeds the limit after repack.", "A rejected push gives an error with no guidance and users abandon work or retry in loops."],
    v: "Push a file just under and just over the limit and confirm the second is rejected with a message naming the limit and the large-file alternative; confirm reported repository size matches disk usage after maintenance.",
    dep: ["receive-pack","object-database","large-file-store","metadata-database"]
  },
});
