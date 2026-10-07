// Details for the peer-to-peer file sharing plate, part 1: client surface, metadata, cross-cutting concerns.
ATLAS.details("p2p-file-sharing", {
  "daemon-api": {
    s: "The long-lived engine process and the local control interface that every front end, script and remote controller uses to add transfers, read state and change settings.",
    d: "The engine runs without a window and exposes commands and state through a local socket or authenticated HTTP endpoint. Controllers poll or subscribe to incremental state changes rather than refetching everything. Because the process owns the sockets and disk files, it keeps transferring when a front end closes. Hard parts are authentication, since a control port that can add files or run completion commands is a remote execution risk, and keeping state diffs cheap when thousands of transfers each change several times per second.",
    k: ["Separate engine and front end: transfers survive window closes and headless use works, but every feature needs an API shape before it has a button.", "Incremental state sync versus full polling: far less traffic and CPU at scale, but the engine must track each controller's last-seen revision."],
    p: ["A control port bound to all interfaces with default credentials lets anyone on the network add torrents or run commands.", "Controllers that poll the full list every second make a client with thousands of transfers burn CPU on serialization alone."],
    v: "Start the engine with no front end, add a transfer through the control API from a separate process, close that process, and confirm the transfer keeps progressing and is listed on reconnect.",
    dep: ["state-store", "event-loop"]
  },
  "desktop-interface": {
    s: "A native graphical front end showing transfers, progress, peers and speeds, with menus for adding content and editing settings.",
    d: "The interface renders the transfer list, per-transfer detail panes and graphs from state supplied by the engine, either in process or over the control API. It registers as the handler for metadata files and magnet links so the operating system opens them here. Drag and drop, tray icons and notifications integrate with the desktop. The difficulty is staying responsive: updating thousands of rows with live rates needs throttled, batched redraws, and long operations such as rechecks must never block the interface thread.",
    k: ["In-process interface versus separate controller: simpler wiring and instant state, but a crash or hang in either takes both down.", "Throttled redraw (a few times per second) versus per-event update: smooth with huge lists, at the cost of numbers that lag reality slightly."],
    p: ["Updating every row on every network event freezes the window when the list is long.", "Registering as the default link handler without asking steals magnet links from another client the user installed."],
    v: "Load several hundred active transfers and scroll the list while all are moving data; the window stays responsive and speed columns update within about a second.",
    dep: ["daemon-api"]
  },
  "web-interface": {
    s: "A browser-based control page served by the engine, so a headless or remote client can be managed from any device.",
    d: "The engine serves a small web application and an authenticated endpoint on a configurable port. The page lists transfers, accepts uploaded metadata files and pasted magnet links, and edits settings. Sessions use cookies or tokens and the page sends the same commands as other controllers. Hard parts are exposure and cross-site attacks: a page that can change save paths or trigger completion commands must resist cross-site request forgery, cross-origin reads and brute-force login attempts, and it is often placed behind a reverse proxy with TLS.",
    k: ["Built-in web server versus external one: zero setup and one process, but the engine inherits the burden of TLS, rate limiting and security patches.", "Same API as the desktop controller: one implementation to maintain, but any API change breaks the page and third-party tools together."],
    p: ["Disabling authentication for local network use exposes the page to any browser tab through request forgery.", "Serving over plain HTTP across the internet sends the password and session token in the clear."],
    v: "From a second device, log in, upload a metadata file and watch it start. Then submit a command with a forged cross-origin request and confirm it is rejected.",
    dep: ["daemon-api"]
  },
  "torrent-creator": {
    s: "The tool that hashes a set of files into pieces and writes the metadata file others use to download them.",
    d: "The creator walks a file or directory tree, orders files deterministically, chooses a piece size from total size, reads every byte to compute piece hashes (and per-file trees in newer formats) and writes the metainfo with names, lengths, tracker lists, web seed URLs and optional private flag and comment. It runs on many threads because hashing dominates. The hard decisions are piece size, which trades metadata size against granularity, and reproducibility: the same input must produce the same content address on any machine.",
    k: ["Larger pieces versus smaller: fewer hashes and smaller metadata, but more wasted work per corrupt block and slower early sharing.", "Deterministic file ordering and padding: identical content gives an identical address everywhere, at the cost of padding files or rigid sorting rules."],
    p: ["Creating from a folder that changes during hashing yields hashes that match no one's copy.", "Embedding absolute paths or local metadata such as creation tools and usernames leaks information the creator did not intend to publish."],
    v: "Create a metadata file from a folder on two machines with the same settings and compare content addresses; they match. Then download it through a second client and confirm every piece verifies.",
    dep: ["metainfo-file", "piece-hash-list", "hash-thread-pool"]
  },
  "feed-auto-download": {
    s: "Watches syndication feeds and starts transfers for new entries that match user-defined filters, categories and save locations.",
    d: "The component polls feed URLs on a schedule, parses entries, extracts the link or attachment for metadata, matches titles against filters (patterns, season or episode numbers, quality tags) and queues matches with a category. It remembers what it has already fetched to avoid duplicates and honors conditional requests to be polite to feed hosts. Difficulty lies in matching: sloppy titles, reposts under new names and re-releases cause missed items or duplicates, and the filters themselves are a small query language users misconfigure.",
    k: ["Client-side matching with filters versus a remote search service: no third-party dependency, but all quality rules live in user-edited patterns.", "A persistent seen-items list: prevents duplicate downloads, but unbounded growth and renamed reposts still slip through."],
    p: ["A broad filter pattern queues hundreds of unwanted transfers overnight and fills the disk.", "Polling a feed every minute without conditional requests gets the client's address blocked by the host."],
    v: "Point it at a test feed, add a filter, publish a matching and a non-matching entry, and confirm exactly the matching one is queued once, even after two further polls.",
    dep: ["add-and-resume-flow", "categories-and-labels", "state-store"]
  },
  "swarm-inspector": {
    s: "Detailed views of a transfer's peers, pieces, trackers, files and request activity, used to understand why a download is slow or stuck.",
    d: "The inspector reads engine state per transfer: each connected peer's address, client identification, flags (choked, interested, encrypted, incoming), rates and progress; a piece map showing which pieces are complete, in flight or available in the swarm; tracker status and last error; and per-file progress. Peer geography and the swarm's availability are derived from counts the engine already keeps. The difficulty is cost: sampling thousands of peers into a view should not slow the transfer being examined.",
    k: ["Rich per-peer state exposed to the interface: invaluable for diagnosing stalls, but every field must be maintained on the hot path.", "Snapshot on demand versus continuous stream: negligible overhead when no one looks, but the first view of a huge swarm costs a burst of work."],
    p: ["Showing peer addresses publicly in screenshots or shared logs reveals who else downloads the same content.", "A piece map computed from stale availability data misleads the user into thinking a swarm is complete."],
    v: "Open the inspector during a slow download and confirm peer flags, tracker errors and the piece map explain the stall, for example showing all connected peers choking you.",
    dep: ["peer-connection-state", "availability-tracking", "tracker-client"]
  },
  "settings-profiles": {
    s: "The user-facing configuration: limits, ports, save paths, protocol toggles and behavior rules, with defaults chosen to work on a typical home connection.",
    d: "Settings are stored as typed values with defaults and validation, grouped by area (connection, speed, queueing, privacy, storage). Some apply instantly, others need a restart or a new listening socket. Profiles or presets bundle values, for instance a low-impact mode for working hours. The engine validates ranges and refuses combinations that cannot work, such as connection limits above the descriptor budget. Hard part: defaults. Most users never change them, so a poor default for connection counts or upload slots degrades the whole swarm's behavior.",
    k: ["Sensible defaults with an advanced panel: new users succeed without tuning, but experts must find settings hidden by design.", "Live-applied settings versus restart-required: instant feedback, but the engine must handle changes mid-transfer, such as shrinking a connection limit below the current count."],
    p: ["Raising connection limits far above the router's capacity makes the whole home network drop connections.", "Settings imported from another machine reference paths that do not exist and fail silently at the first save."],
    v: "Change the listening port and upload limit in the interface, observe the new port accepting connections from an outside probe and the measured upload staying under the limit, with no restart for the limit.",
    dep: ["state-store", "connection-limits"]
  },
  "transfer-queue": {
    s: "Orders transfers and limits how many are active at once, so scarce connections and bandwidth go to the ones that matter.",
    d: "Each transfer has a state (queued, checking, downloading, seeding, paused, errored) and a position. The queue admits transfers up to configured active-download and active-seed limits, moving others to a queued state and rotating when a transfer finishes or stalls. Some clients treat inactive transfers that make no progress as not counting toward the limit. The hard part is fairness over time: stalled transfers must not hold slots, seeds must not starve new downloads, and user-set ordering must survive restarts.",
    k: ["Hard active-slot limits versus soft limits: predictable resource use, but slow or dead transfers can block healthy ones unless detected.", "Seeding counted separately from downloading: new downloads are never starved by old seeds, but upload bandwidth may still be consumed by many seeds."],
    p: ["A transfer stuck at 99 percent with no sources holds an active slot indefinitely and blocks the queue.", "Reordering the queue while a recheck is running starts and stops transfers in a loop."],
    v: "Set the active limit to two, add five transfers, and confirm exactly two download. Pause one and confirm the next queued transfer starts within seconds.",
    dep: ["add-and-resume-flow", "dead-swarm-detection", "session-persistence"]
  },
  "add-and-resume-flow": {
    s: "The sequence that takes a metadata file or magnet link, chooses a save location and file selection, verifies existing data and starts the transfer.",
    d: "Adding a transfer parses the input, computes or reads the content address, rejects duplicates, resolves metadata if only an address is known, applies a category's save path and file selection, and then either checks existing files against the piece hashes or trusts saved resume data. Only after that does it announce to discovery sources and begin requesting. On restart the same path runs from saved state. The difficulty is idempotence: the flow must tolerate duplicate adds, missing paths and partial state from a crash mid-add.",
    k: ["Verify existing data before starting versus trusting resume data: certain correctness, but large collections take minutes of disk reads at every add.", "Add paused for file selection versus start immediately: users avoid downloading unwanted files, but unattended automation needs the opposite."],
    p: ["A duplicate add under a different tracker list creates a second transfer for the same content and splits seeding effort.", "Starting before the save path's free space is checked fills the disk partway through."],
    v: "Add a magnet link, then the matching metadata file; the client merges them into one transfer. Restart mid-download and confirm it resumes without re-requesting verified pieces.",
    dep: ["info-hash", "magnet-links", "metadata-exchange", "resume-data-validation", "session-persistence"]
  },
  "file-priorities": {
    s: "Lets the user skip files or fetch some first within a multi-file transfer, which changes which pieces the picker is allowed to want.",
    d: "Each file carries a priority (skip, normal, high, or finer levels). The engine converts file priorities into piece priorities, since a piece may span several files and must be fetched if any file it overlaps is wanted. The picker then prefers higher-priority pieces and ignores skipped ones. Changing priorities mid-download updates which pieces count toward completion. The tricky part is boundary pieces: skipping a file does not mean skipping every piece that overlaps its neighbors, and the client may download small amounts of unwanted data.",
    k: ["Piece-level priority derived from file priority: the picker needs one simple concept, but boundary pieces download bytes of skipped files.", "Allow changing priority mid-transfer: flexible for users, but progress and completion state must be recomputed against a moving target."],
    p: ["Skipping every file but one in a transfer with few large pieces still downloads most of the skipped data through boundary pieces.", "A transfer marked complete after wanted files finish may never seed the skipped files, reducing swarm availability."],
    v: "Skip all files except a small one and measure bytes downloaded; it equals the wanted file's size plus only the spill into overlapping boundary pieces.",
    dep: ["file-layout-mapping", "piece-picker"]
  },
  "categories-and-labels": {
    s: "User-defined groups that carry default save paths, limits and rules, and let large collections be filtered and managed in bulk.",
    d: "A category or label attaches to a transfer and can supply a default save path, completion move location, ratio goal and bandwidth class. Automation such as feed rules or the remote API assigns them on add. Bulk actions then apply to every transfer in a category. Categories interact with storage: changing a category's path may move data. The hard parts are keeping the metadata consistent after a rename or delete and preventing path templates from escaping the intended download root.",
    k: ["Category as a rule bundle versus a plain tag: automation becomes powerful, but a category change can trigger large file moves.", "Single category versus many tags per transfer: simple precedence for settings with one, richer filtering with many but ambiguous setting conflicts."],
    p: ["Deleting a category that other transfers reference leaves them with a dangling save path.", "A category path built from untrusted feed text can contain parent-directory segments and write outside the download folder."],
    v: "Create a category with its own save path and upload limit, add a transfer to it, and confirm files land in that path and the transfer obeys the limit.",
    dep: ["move-and-rename", "per-torrent-limits"]
  },
  "time-rules": {
    s: "Schedules that change limits or pause transfers at set times, for example full speed overnight and throttled during working hours.",
    d: "A schedule is a table of time windows with an action: apply an alternate speed profile, pause all transfers, or enable only downloads or only uploads. The engine evaluates it on a timer and when the clock changes. It must handle time zone changes, daylight saving and a machine that was asleep during a window boundary. The point is that the user sets intent once and forgets, so the rule engine needs predictable precedence against manual overrides.",
    k: ["Window-based schedule with manual override: matches user intent, but the rule for when a manual choice expires needs defining.", "Evaluate on a coarse timer versus exact wake-ups: trivial to implement, but behavior can lag a boundary by up to a tick."],
    p: ["A daylight saving shift moves the throttle window by an hour and silently saturates the link at the wrong time.", "A schedule that pauses everything also pauses seeds the user assumed would keep running."],
    v: "Set a window starting one minute ahead with a low limit and confirm the measured rate drops at that time, then returns to normal when the window ends.",
    dep: ["alternate-speed-profiles", "event-loop"]
  },
  "completion-actions": {
    s: "Actions triggered when a transfer finishes: move files, run a command, send a notification, stop or continue seeding.",
    d: "On completion the engine fires an event. Handlers may move files from an incomplete folder to a final one, run a user-defined external program with the name and path as arguments, notify the interface, or change the transfer's state per seeding goals. Handlers run after the last piece verifies and flushes to disk. Hard parts are ordering and safety: moves must finish before commands see the files, a command must not block the engine, and arguments from untrusted metadata must never be interpreted by a shell.",
    k: ["Run external commands on completion: extremely flexible automation, but a security surface fed by names from strangers.", "Move on completion versus download in place: keeps unfinished data separate, but seeding must track the new location and cannot serve during the move."],
    p: ["Passing a torrent name unquoted into a shell command lets a crafted name run arbitrary commands.", "Moving files across volumes copies them slowly while the transfer is nominally complete and seeding stalls."],
    v: "Configure a script that records its arguments and the final file hash, finish a transfer, and confirm the script ran once, saw complete files at the final path, and the client resumed seeding from there.",
    dep: ["piece-verification", "move-and-rename", "seeding-goals", "alert-queue"]
  },
  "session-persistence": {
    s: "Saves enough state to resume every transfer after a restart or crash: piece completion, file lists, trackers, statistics and settings, without rehashing.",
    d: "The client periodically and at shutdown writes per-transfer resume data: completed pieces (a bitfield), partially downloaded pieces, peer candidates, file sizes and timestamps, priorities and counters. On start it loads this instead of rereading terabytes. Writes must be atomic so a crash mid-write cannot corrupt the whole session. The hard part is trust: resume data can claim pieces that never reached disk, so it is cross-checked against file sizes and modification times, and on mismatch the transfer falls back to a recheck.",
    k: ["Periodic checkpoints versus write on every change: bounded I/O cost, but a crash loses progress since the last checkpoint and may resume with incorrect claims.", "Per-transfer state files versus a single database: individual corruption is isolated, but thousands of small files slow startup and backups."],
    p: ["A crash between flushing resume data and flushing file data resumes with pieces marked complete that are actually zeros.", "Restoring a session onto a different machine with the same paths but different file contents silently serves wrong data until verification catches it."],
    v: "Kill the process with a hard stop in the middle of a download, restart, and confirm every claimed-complete piece verifies and the transfer continues without a full recheck beyond the mismatched pieces.",
    dep: ["resume-data-validation", "state-store", "storage-layout"]
  },
  "info-hash": {
    s: "The digest of the content description that names a swarm. Anyone holding the same hash is talking about exactly the same files.",
    d: "The identifier is a cryptographic hash of the canonical form of the info dictionary, which contains file names, lengths, piece length and piece hashes. Peers, trackers and the DHT all use it as the key, and the handshake carries it so two peers can confirm they share a swarm before sending anything else. Newer formats use a longer hash and include a shorter compatibility form. The difficulty is canonicalization: two encoders must produce byte-identical output, or the same content gets two addresses and two separate swarms.",
    k: ["Content addressing versus location addressing: anyone can serve and verify the file, but the address cannot be updated when the content changes.", "Shorter hash versus longer hash: smaller identifiers and broad compatibility, against stronger collision resistance and a split population during migration."],
    p: ["Re-encoding a metadata file with different key ordering changes the hash and silently splits the swarm.", "A weak hash lets a malicious publisher craft a second set of files with the same address."],
    v: "Parse a metadata file with two independent implementations and compare the printed hash; they match. Connect to a peer using that hash and confirm the handshake is accepted.",
    dep: ["metainfo-file"]
  },
  "metainfo-file": {
    s: "The small file describing a transfer: names, sizes, piece length, piece hashes, trackers and optional web seeds, in a simple self-describing encoding.",
    d: "The metainfo is a dictionary encoded with a minimal format of integers, byte strings, lists and dictionaries with sorted keys. An announce list of trackers and optional fields (comment, creation date, web seeds, nodes for the DHT) sit outside the hashed info section, so they can be edited without changing the content address. Parsers must be strict: lengths, nesting depth, duplicate keys and path components all come from untrusted sources. Hard part: robust parsing without allocating unbounded memory.",
    k: ["Separate hashed info section from mutable outer fields: trackers can change without a new address, but those fields are unauthenticated and can be tampered with.", "A minimal self-delimiting encoding: tiny parser and deterministic bytes, but no schema, so every consumer validates types on its own."],
    p: ["A metadata file declaring a billion files or deeply nested lists exhausts memory in a naive parser.", "Path components containing separators or parent-directory markers write files outside the download directory."],
    v: "Feed the parser truncated, oversized, deeply nested and path-traversal samples; each is rejected with an error and bounded memory, while a valid file yields the expected file list and hash.",
    dep: ["piece-hash-list", "file-layout-mapping"]
  },
  "piece-hash-list": {
    s: "The ordered list of hashes, one per fixed-size piece, against which every received piece is verified.",
    d: "Content is cut into pieces of equal length (the last may be shorter) and each is hashed. The concatenated list sits in the metadata, so its size grows with content size divided by piece length. A peer can request any block, but only whole pieces can be verified. Piece length is chosen at creation, typically a power of two between tens of kilobytes and many megabytes. The challenge is the trade-off between metadata size, verification granularity and the cost of re-downloading when a piece fails.",
    k: ["Large pieces versus small: a short hash list and fewer messages, but a failed piece wastes more bandwidth and sharing begins later.", "Flat list in the metadata versus a tree fetched on demand: a flat list is simple and verifiable at once, but huge for very large content."],
    p: ["Choosing a tiny piece length for a very large file produces a metadata file of tens of megabytes that clients struggle to share.", "A piece hash that spans files makes verification impossible when only one of them is selected, unless padding aligns files."],
    v: "Recompute every piece hash from a completed download using an independent tool and confirm each matches the list, including the short final piece.",
    dep: []
  },
  "file-layout-mapping": {
    s: "Maps the ordered, concatenated byte stream of pieces onto the named files and directories the user sees, including pieces that straddle file boundaries.",
    d: "For single content the layout is one file; for multi-file content, an ordered list of paths and lengths defines offsets in one logical stream. The engine converts a piece index and block offset into one or more file spans for reading and writing. Some formats pad files to piece boundaries so each file hashes independently. The hard part is boundary arithmetic with huge sizes, zero-length files, duplicated paths and name sanitization across filesystems with different rules for case, length and forbidden characters.",
    k: ["One concatenated stream versus per-file piece alignment: dense and efficient, or aligned and independently verifiable at the cost of padding and some wasted space.", "Sanitize names at the client versus trust the metadata: safe across platforms, but the on-disk name may differ from the publisher's."],
    p: ["Two paths differing only in case collide on a case-insensitive filesystem and overwrite each other's data.", "Off-by-one errors at piece boundaries corrupt only the bytes that span two files, which is hard to notice until a hash fails."],
    v: "Download multi-file content with files smaller than a piece and zero-length files, then compare every file byte for byte against the source and confirm the empty files exist.",
    dep: ["metainfo-file"]
  },
  "hash-tree-metadata": {
    s: "A per-file tree of hashes that lets blocks be verified individually and files be shared across many different transfers.",
    d: "Each file gets a binary tree of block hashes whose root identifies it. The metadata stores roots, and the interior layers are fetched from peers as proofs alongside data. A peer can verify a single block against the root without holding the rest of the file, and identical files in different transfers have the same root and can be deduplicated. Hard part: proof messages add protocol surface, and implementations must validate tree depth and padding exactly or accept forged blocks.",
    k: ["Tree proofs versus a flat piece list: small metadata and block-level verification, but extra messages and code to fetch and verify proofs.", "Per-file roots versus a single stream hash: cross-transfer deduplication and independent files, but the layout needs alignment or padding rules."],
    p: ["Implementations that skip depth checks can be given a proof for a different level and accept data that was never hashed.", "Mixed old and new clients in one swarm fragment it unless a hybrid layout serves both address forms."],
    v: "Corrupt one block in a file and request it from a test peer; the client rejects it using the proof and re-requests only that block rather than a whole piece.",
    dep: ["metainfo-file", "piece-verification"]
  },
  "magnet-links": {
    s: "A compact link carrying the content address, a display name and optional trackers or peer hints, so a transfer can begin without a metadata file.",
    d: "A magnet link is a URI with parameters for the content address, name, tracker URLs, web seed URLs and sometimes direct peer addresses. The client uses the address to find peers through the DHT, trackers or peer exchange, then fetches the missing metadata from them. Links are easy to paste and share, and carry nothing that can be tampered with beyond hints. The hard part is the cold start: until metadata arrives there is no piece list, file list or size, so progress, file selection and the interface have nothing to show.",
    k: ["Link instead of file: tiny, text-friendly and no hosting needed, but a download cannot begin until peers are found and metadata is fetched.", "Hints included in the link: faster starts with a good tracker or peer, but each hint is unverified and a bad one wastes time."],
    p: ["A link with no trackers in a swarm that is not in the DHT never resolves and sits at zero percent indefinitely.", "Links pasted from untrusted pages may contain very long parameters or repeated keys that a lax parser mishandles."],
    v: "Open a link with only the content address and DHT enabled; within a minute the file list and size appear and downloading starts, and the verified hash equals the address in the link.",
    dep: ["info-hash", "metadata-exchange", "dht-client"]
  },
  "metadata-exchange": {
    s: "A peer extension that lets a client download the metadata itself, in small chunks, from other peers when it has only a content address.",
    d: "During the extension handshake peers advertise that they hold metadata and its total size. The client requests numbered chunks, typically 16 kilobytes each, from several peers, reassembles them, and hashes the result. Only if the hash equals the content address is the metadata accepted. Peers that serve garbage are dropped. It is difficult because the size claimed by a peer is unverified: the client must cap it and handle peers that lie about size or send chunks in the wrong order.",
    k: ["Verify the assembled metadata against the address: nothing from a stranger is trusted, but a single bad chunk wastes the whole assembly attempt.", "Request chunks from many peers in parallel: faster for large metadata, but needs per-chunk state and timeouts."],
    p: ["Accepting an advertised metadata size of gigabytes lets one peer make the client allocate huge buffers.", "A swarm in which no connected peer has metadata yet leaves the transfer stuck while the user sees only an address."],
    v: "Start from an address, observe chunk requests to several peers, and confirm the metadata hash equals the address. Then feed one corrupted chunk and confirm it is rejected and refetched.",
    dep: ["extension-protocol", "info-hash", "metainfo-file"]
  },
  "private-flag": {
    s: "A marker in the metadata that restricts discovery to the named tracker, turning off the DHT, peer exchange and local discovery for that transfer.",
    d: "When the flag is set the client announces only to the trackers in the metadata and accepts peers only from them. It does not publish the address to the DHT, does not use peer exchange and does not broadcast on the local network. Operators of closed communities use it to control membership and enforce ratio rules, since peers cannot be found elsewhere. The hard part is compliance: the flag is a request honored by cooperating clients and cannot stop a non-conforming client from leaking the address.",
    k: ["Tracker-only discovery: the community controls membership and accounting, but the tracker becomes a single point of failure and a legal target.", "Honor-system enforcement: no protocol change is needed, but nothing technical stops a modified client from publishing the swarm."],
    p: ["A client that enables the DHT globally and forgets the per-transfer exception leaks private swarm membership.", "Tracker downtime makes the whole private community unable to find peers, even those already connected earlier."],
    v: "Add a private transfer and capture traffic: announces go only to the listed trackers, no DHT queries mention its address, and no peer exchange messages are sent or accepted for it.",
    dep: ["metainfo-file", "tracker-client", "peer-exchange", "dht-client", "local-peer-discovery"]
  },
  "trust-model": {
    s: "The assumption that every peer is a stranger who may be wrong, slow or hostile, and that only hashes and rate-based reciprocity can be relied on.",
    d: "No peer is trusted for identity, honesty or availability. Data is accepted only after hash verification, metadata only after matching the content address, and peer-reported counts only as hints. Trackers are trusted only to provide addresses. Protocol parsers treat every length and index as hostile input. This model shapes everything: how much work is done before verification, how bad peers are detected and banned, and how little is assumed about messages. What makes it hard is that it must hold at scale, where thousands of strangers connect and a small fraction are always misbehaving.",
    k: ["Verify everything locally versus trusting reputable peers: stronger guarantees and no authority needed, but all verification cost lands on the client.", "Hostile-input parsing everywhere: resists crashes and exploits, but demands bounds checks on every field of every message."],
    p: ["Trusting a peer's claimed piece count or metadata size without bounds lets one peer exhaust memory.", "Banning by address alone punishes shared addresses behind translation and is evaded by a changed address."],
    v: "Run a hostile test peer that sends malformed lengths, wrong hashes and false availability; the client drops it, stays within memory bounds, and the final file still verifies.",
    dep: ["piece-verification", "peer-banning", "message-framing"]
  },
  "incentive-design": {
    s: "The principle that upload effort is rewarded with download service, so a swarm can run on voluntary contribution without a central accountant.",
    d: "Peers allocate upload slots to those who recently gave them the most, with a small random share to discover new partners. Seeds, who need nothing, rank by observed downloader rate instead. Ratio rules and private community accounting add longer-term incentives on top. The design must resist free riders, collusion and gaming through fake uploads, while still being gentle to newcomers who have nothing to offer. Hard because incentives are statistical: they work across a swarm but any single peer sees only noisy rate measurements.",
    k: ["Short-term rate-based reciprocation versus long-term ledgers: no state to store or forge, but a peer's good history is forgotten within seconds.", "Random exploration for newcomers: lets new peers bootstrap, but spends upload capacity on partners who may never reciprocate."],
    p: ["Tuning only for the individual's speed, such as always unchoking the fastest peers, starves newcomers and weakens the swarm.", "Counting uploaded bytes without verification lets two colluding peers inflate each other's ratios."],
    v: "Run a swarm with a pure free rider and a contributor of equal capacity; the contributor finishes measurably faster, and the free rider is served mainly through exploration slots.",
    dep: ["choke-algorithm", "optimistic-unchoke", "reciprocation-ranking"]
  },
  "peer-churn": {
    s: "The fact that peers appear and disappear constantly, so every connection, request and swarm assumption must tolerate sudden loss.",
    d: "Peers close laptops, lose connections, finish and leave, or crash mid-block. Requests in flight go unanswered, availability counts change, and trackers and the DHT fill with stale addresses. The client expects loss: requests time out and are reassigned, counts update on disconnect, candidate lists age out entries, and connection attempts are cheap to abandon. Hard parts include flash crowds where thousands join together, and the case where the last copy of a rare piece leaves with its holder.",
    k: ["Short timeouts with reassignment versus waiting: faster recovery from vanished peers, but spurious reassignments waste bandwidth with slow-but-alive peers.", "Aggressive candidate pruning: fewer wasted dials, but a small swarm can discard its last reachable peers."],
    p: ["Assigning the last few blocks of a piece to a peer that then vanishes stalls completion until a long timeout fires.", "Trusting tracker lists without liveness checks fills connection slots with addresses that left hours ago."],
    v: "Kill connected peers at random during a download in a test swarm; every transfer completes, with request reassignment visible in the logs and no piece stuck beyond the timeout.",
    dep: ["block-assignment", "availability-tracking", "candidate-pool"]
  },
  "network-heterogeneity": {
    s: "The wide spread of peer capabilities: bandwidth from kilobits to gigabits, symmetric to asymmetric links, direct to doubly translated addresses.",
    d: "A swarm mixes fast datacenter seeds, slow mobile peers and users behind carrier-grade translation who cannot accept inbound connections. Round trip times vary by orders of magnitude, and some paths drop or shape traffic. Pipelining depth, request timeouts, congestion behavior and connection strategy all adapt per peer. Hard because one setting cannot suit all: a request queue deep enough for a long, fast path starves a short slow one, and unreachable peers can only connect outward, so they depend on reachable ones.",
    k: ["Adaptive per-peer parameters versus global constants: good use of every link, but each adaptive loop can oscillate or mis-estimate.", "Treating unreachable peers as first-class: more peers can trade, but two unreachable peers can only meet via relays or hole punching."],
    p: ["A fixed small request queue limits download speed on a high-latency path to a small fraction of its capacity.", "Assuming symmetric reachability makes clients behind translation unable to find any partner in swarms of similar peers."],
    v: "Test one client against simulated peers with 5 ms and 300 ms round trips; both paths reach near their capacity because queue depth adapts to measured bandwidth and delay.",
    dep: ["request-pipelining", "delay-based-udp-transport", "hole-punching"]
  },
  "privacy-exposure": {
    s: "What the client reveals to others by participating: its address, what it shares, when it is online and what it asks for.",
    d: "Joining a swarm exposes a client's address to every peer and tracker, and the DHT publishes it as a holder of the content address. Peer exchange spreads it further. Observers can enumerate swarms and record who shared what and when. Mitigations include proxies, anonymity networks, interface binding and disabling optional discovery, each with costs in speed or reachability. The design is hard because the protocol is built around open participation: there is no layer where hiding the address leaves the rest unchanged.",
    k: ["Public addresses in an open swarm: peers can connect directly at full speed, but participation is observable by anyone who joins.", "Routing through a proxy or overlay: hides the address, but adds latency and may carry only part of the traffic, such as tracker requests but not peer connections."],
    p: ["A proxy configured for tracker traffic only still lets direct peer connections and DHT queries reveal the real address.", "When a binding interface goes down, a client falling back to the default route exposes traffic the user meant to keep off it."],
    v: "Capture all outbound traffic from the client with a proxy configured and the tunnel interface disabled; no packet leaves from the real address and the client stops instead of falling back.",
    dep: ["proxy-support", "interface-binding", "metadata-leak-controls"]
  },
  "protocol-evolution": {
    s: "How the protocol gains features while old and new clients share swarms, through negotiated extensions and reserved capability bits.",
    d: "The handshake carries reserved bits advertising support for optional features, and an extension message maps feature names to per-connection numeric identifiers, so new messages need no central registry or version bump. Unknown messages are ignored. New hash formats and transports are introduced alongside old ones, sometimes with hybrid content addresses that work for both. Hard because swarms never upgrade at once: any feature that cannot degrade gracefully splits the population and shrinks swarm sizes.",
    k: ["Capability negotiation per connection versus protocol version numbers: features roll out independently, but combinations multiply test cases.", "Hybrid addressing during migration: old and new clients still find each other, but metadata is larger and verification code doubles."],
    p: ["A client that errors on an unknown message instead of ignoring it disconnects from every peer using a newer extension.", "Assuming all peers support a feature once enabled in your build causes failures against the long tail of old clients."],
    v: "Connect a client to a test peer advertising extra extensions and unknown message identifiers; the connection stays up, unknown messages are ignored and shared features work.",
    dep: ["extension-protocol", "peer-handshake", "info-hash"]
  }
});
