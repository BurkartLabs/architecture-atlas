// Details for the web crawler plate, part 5: duplicates and traps, storage, distribution.
ATLAS.details("web-crawler", {
  "exact-content-hash": {
    s: "A cryptographic or wide hash of a page's normalized content, used to detect byte-for-byte or text-for-text duplicates and unchanged revisits.",
    d: "After decoding, the crawler hashes either the raw body or the extracted main text, optionally after stripping whitespace and known dynamic fragments. Equal hashes mean duplicates; a changed hash on revisit means a change. The hash is stored in the URL record and looked up in a content index. It is fast and exact for what it hashes. It is hard because tiny differences, such as a timestamp or session token in the markup, defeat exact matching, so deciding what to hash is the real design choice.",
    k: ["Hash the raw body vs the extracted text: raw is simple and sensitive to markup noise; extracted text ignores template changes and requires extraction on every page.", "Narrow 64-bit vs wide 128-bit or longer hash: narrow is compact with rare false matches that discard real pages; wide is safe and larger."],
    p: ["A rotating nonce embedded in the page makes every fetch hash differently, so a static page looks permanently changing.", "Hashing before decompression or before charset normalization gives different hashes for identical content."],
    v: "Fetch the same page twice with only a whitespace change and once with a text change. Confirm the normalized hashes match for the first pair and differ for the second, and that identical pages at two URLs share a hash.",
    dep: ["charset-detection","compression-handling"]
  },
  "shingling-and-minhash": {
    s: "Represents a document as overlapping word sequences and compresses that set into a small signature whose overlap estimates the documents' similarity.",
    d: "A document is broken into shingles of several consecutive words. Many hash functions are applied and the minimum value of each is kept, giving a signature of a hundred or so numbers. The fraction of matching signature positions estimates the share of shared shingles. Signatures are grouped into bands so likely-similar documents collide in some band, which finds candidates without comparing all pairs. It is hard because the parameters trade recall against false candidates, and the shingle size changes what counts as similar.",
    k: ["Minhash with banding vs simhash: minhash estimates set overlap accurately with larger signatures; simhash is smaller and fits distance lookups with less precision.", "Short shingles vs long shingles: short are tolerant of small edits and match boilerplate; long are specific and miss lightly rewritten copies."],
    p: ["Shared template text makes unrelated pages from one site appear similar unless boilerplate is stripped first.", "Banding parameters tuned on one corpus miss near-duplicates in another."],
    v: "Build a test set of document pairs with known overlap at 50, 80 and 95 percent. Confirm estimated similarities fall near the true values and that banding recovers the high-overlap pairs and few unrelated ones.",
    dep: ["html-parser","exact-content-hash"]
  },
  "simhash-index": {
    s: "Stores a short fingerprint for each document in which similar texts differ in few bits, and finds near-duplicates by searching for fingerprints within a small Hamming distance.",
    d: "Each word contributes a weighted hash, and the signs of the summed vote form a 64-bit fingerprint, so similar documents get similar fingerprints. To find matches within a few bits, the fingerprint is split into blocks and several permuted tables are kept, so any near match agrees exactly on at least one block. Lookup is a small number of table reads. It is hard because the tables multiply storage, the distance threshold needs tuning per corpus, and short documents produce unstable fingerprints.",
    k: ["Larger distance threshold vs smaller: larger catches more rewritten copies and merges distinct pages; smaller is precise and misses edited copies.", "More permuted tables vs fewer: more tables raise recall and storage use; fewer save space and miss some close pairs."],
    p: ["Very short pages such as error pages all fingerprint alike and are merged as duplicates.", "A threshold set too high merges different articles that share long quoted passages."],
    v: "Insert a set of documents with known edited copies at various distances. Confirm lookups find the copies within the threshold and return none from an unrelated set, and report recall and false-match rates.",
    dep: ["html-parser","duplicate-cluster-store"]
  },
  "duplicate-cluster-store": {
    s: "Groups pages found to be duplicates into clusters, with a chosen representative, so downstream systems keep one copy and the crawler stops fetching the rest.",
    d: "When an exact or near-duplicate match is found, the URL joins the cluster of the match. The cluster keeps a representative picked by signals such as canonical declarations, link popularity and URL quality. Membership and representative are stored so the index shows one result and the crawler can lower the priority of non-representatives. Clusters merge when new evidence links two of them. It is hard because representative choice changes over time, merges must be consistent across partitions, and a wrong merge hides a legitimate page.",
    k: ["Merge clusters on any match vs require agreement of several signals: any match is simple and chains unrelated pages together; several signals is conservative and slower.", "Pick the representative once vs recompute: once is stable for downstream consumers; recompute tracks better evidence and causes churn."],
    p: ["Transitive merging chains many loosely similar pages into one huge cluster.", "Changing representatives often makes the index flip between URLs for the same page."],
    v: "Feed groups of true duplicates, near-duplicates and unrelated pages. Confirm clusters match the labels, a representative is chosen consistently, and cluster size stays bounded with no chain across unrelated groups.",
    dep: ["exact-content-hash","simhash-index","canonical-link-hints","url-state-table"]
  },
  "soft-404-detection": {
    s: "Recognizes pages that return a success status while showing an error, empty or placeholder message, so they are not stored as real content.",
    d: "Many servers answer missing pages with a friendly page and a 200 status. Detectors fetch a probe URL that cannot exist on the host and fingerprint the answer, then compare real pages to it; they also use text patterns, very low content size and title similarity across many URLs. Matching pages are marked as soft errors and treated like missing ones. It is hard because genuine short pages look similar to error pages, and sites may serve different error pages per section.",
    k: ["Probe with a random URL vs text pattern rules: probing is language-independent and adapts per host; patterns are cheap and fail for unfamiliar languages.", "Drop soft-404 pages vs keep flagged: dropping saves space and risks losing a real page; flagging keeps them and costs storage."],
    p: ["Pages found by a probe that returned a redirect to the home page are all classified as duplicates of it.", "A real short page, such as a one-line notice, is flagged as an error and removed."],
    v: "Crawl a test host that serves soft errors on missing URLs and some legitimate short pages. Confirm soft errors are flagged and legitimate short pages are kept, and report precision and recall on a labeled sample.",
    dep: ["exact-content-hash","status-code-handling","host-quality-scoring"]
  },
  "trap-heuristics": {
    s: "Rules that notice when a host is producing an endless supply of URLs, such as calendars, session identifiers and ever-deeper paths, and stop following them.",
    d: "Signals include path depth, repeating segments, URLs that grow with each hop, parameters that take unbounded values, a high share of near-duplicate content, and links to pages that differ only by a date. When a signal fires for a host or pattern, the crawler limits or blocks that pattern while leaving the rest of the host. It protects the budget from sites designed or accidentally built to generate infinite spaces. It is hard because the same signals appear on legitimate large sites such as archives.",
    k: ["Block the pattern outright vs throttle it: blocking is final and protects budget and loses valid pages; throttling keeps a sample and spends some budget.", "Detect by URL shape alone vs also by content: URL shape is cheap and fooled by legitimate structure; content checks confirm duplication and cost the fetches."],
    p: ["Calendar pages that link to the next month forever are followed for years because each looks new.", "A depth limit that is too low cuts off a legitimate deep archive."],
    v: "Crawl a synthetic site with a calendar, a session-id loop and a legitimate deep archive. Confirm the traps are cut off within the configured number of fetches and the archive is crawled to its true depth.",
    dep: ["url-pattern-clustering","per-host-page-caps","exact-content-hash","query-parameter-rules"]
  },
  "url-pattern-clustering": {
    s: "Groups a host's URLs by their shape, with variable parts replaced by placeholders, and tracks how productive each shape is.",
    d: "URLs are reduced to templates: numeric segments become a number marker, long tokens become a token marker, dates become a date marker. Per template, the crawler counts fetched URLs, how many were duplicates, soft errors or new content, and how many new links they produced. Low-yield templates with huge counts get lowered priority or caps. It lets budget follow value inside a site without knowing the site. It is hard because the templating rules are heuristic and a template can mix good and bad pages.",
    k: ["Learned templates vs fixed rules: learned adapt to each site and need data and care; fixed are predictable and miss unusual URL schemes.", "Per-template caps vs per-template priority penalty: caps bound cost exactly and can cut valuable content; penalty is softer and spends more."],
    p: ["A template shared by news articles and by tag pages averages their yields and misjudges both.", "Counting only duplicates and not downstream value penalizes thin but unique pages."],
    v: "Crawl a test host with several URL templates of known yield. Confirm the clustering produces the expected templates and that the low-yield ones are ranked and capped below the productive ones.",
    dep: ["url-normalization","url-state-table","exact-content-hash"]
  },
  "per-host-page-caps": {
    s: "Limits on how many pages, how deep and how many bytes the crawler takes from any one host or site section, as a last defense against runaway content.",
    d: "Each host has a page budget derived from its quality score and importance, with sub-limits per URL pattern and per directory. When a limit is reached, new URLs for that scope are dropped or parked until the budget refreshes. Caps also bound the damage from any trap the heuristics miss. They are visible to operators as a per-host quota. It is hard because budgets set too low cut real content on huge legitimate sites, and a cap that is hit silently looks to a site owner like missing coverage.",
    k: ["Hard cap vs soft cap with review: hard is a firm bound on cost; soft flags hosts for human or automated review and spends more before deciding.", "Cap by pages vs by bytes: pages is simple and treats big files like small ones; bytes tracks cost and ignores page count."],
    p: ["A very large legitimate site hits the default cap early and most of it is never fetched.", "A cap reached without a recorded reason makes a site owner's coverage complaint hard to answer."],
    v: "Crawl a synthetic host that generates unlimited pages. Confirm fetching stops at the configured cap, the stop is recorded with the reason, and raising the cap lets the crawl resume.",
    dep: ["crawl-budget-accounting","host-quality-scoring","url-state-table"]
  },
  "archive-record-writer": {
    s: "Writes each fetch, request, response headers, body and metadata, as a self-describing record in a standard archive format, appended to a large file.",
    d: "Records follow an open archive standard: a header with the target URL, time, type and length, then the payload, optionally with the request and with a metadata record. Records are appended to the current file until a size threshold such as one gigabyte, then the file is closed and a new one starts. Each record is compressed on its own so any one can be read alone. It is hard because writes from thousands of fetchers must be serialized per file, and a crash must not leave a half-written record that breaks readers.",
    k: ["Per-worker files vs a shared writer service: per-worker files avoid contention and produce many files; a shared service centralizes output and becomes a bottleneck.", "Record per response vs combined request and response: separate records are more flexible; combined are fewer and tie the two together."],
    p: ["A crash mid-record leaves a truncated record that breaks reading of everything after it.", "Missing request headers in the archive make later replay or debugging impossible."],
    v: "Write a set of fetches, kill the writer mid-run, and read the files back. Confirm every complete record is readable, the truncated tail is detected and trimmed, and a standard archive tool lists each record's URL and time.",
    dep: ["block-compression","archive-file-store"]
  },
  "archive-file-store": {
    s: "Durable, replicated storage for large append-only archive files, written once and read in bulk by indexing and analysis jobs.",
    d: "Closed archive files are copied to a distributed file system or object store with replication or erasure coding. Files are named by crawl, worker and time, immutable after close, and tracked in a catalog. Consumers read them sequentially in large chunks. Garbage collection removes files by crawl or retention policy. It is hard because the volume is petabytes, small-file overhead makes file size important, and the catalog must stay correct under failures, as a lost file is lost data that cost real fetches to produce.",
    k: ["Large files vs many small files: large files give efficient storage and sequential reads; small files are quicker to close and stress the metadata system.", "Replication vs erasure coding: replication is simple and fast to read; erasure coding costs far less space and more CPU on repair."],
    p: ["Uploading a file before it is fully written exposes truncated data to readers.", "Retention applied by age alone deletes the only copy of a page that was never recrawled."],
    v: "List files for a crawl in the catalog and compare to storage; confirm each has the right checksum and replica count. Fail a storage node and confirm all files remain readable and are repaired.",
    dep: ["coordination-metadata"]
  },
  "block-compression": {
    s: "Compresses archived pages in independent blocks or per record, so storage shrinks several-fold while any record can still be read without decompressing the whole file.",
    d: "Web text compresses to about a quarter of its size or better. Compressing each record separately gives random access and lower ratio; compressing groups of records with a shared dictionary of common markup gives higher ratio, because pages from a site share much of their boilerplate. Algorithm choice trades speed for ratio, with fast ones for the crawl path and strong ones for the long-term copy. It is hard because the dictionary must be kept for as long as the data, and recompression of old data costs a large read-and-rewrite.",
    k: ["Per-record compression vs per-block shared dictionary: per-record gives easy random access; shared dictionary gives a markedly better ratio and more complex reading.", "Fast algorithm on write vs strong recompression later: fast keeps the crawl path cheap; later recompression saves long-term space at batch cost."],
    p: ["A lost or changed dictionary makes years of archived pages unreadable.", "Compressing already compressed binaries wastes CPU and gains nothing."],
    v: "Compress a sample of pages by each scheme and report ratio and throughput. Read back a random record from the middle of a file and confirm it decodes alone and matches the original byte for byte.",
    dep: ["archive-record-writer"]
  },
  "url-state-table": {
    s: "A table keyed by URL fingerprint holding each URL's crawl state: status, last fetch, validators, content hash, next visit, failure counts and redirect target.",
    d: "This is the crawler's working memory about each known URL. The scheduler reads it to plan visits, the fetcher to build conditional requests, and dedup to compare hashes. Rows are small, tens of bytes, because there are tens of billions of them. It is partitioned by host and stored in an embedded store or sorted files merged in batches. It is hard because it is read and written at fetch rates, it must survive restarts exactly, and its schema must evolve without rewriting everything.",
    k: ["Embedded key-value store vs batched sorted files: key-value gives random reads and writes with write amplification; sorted files give high throughput and delayed visibility.", "Narrow rows with state flags vs wide rows with history: narrow fits memory and caches; wide serves analysis and costs space."],
    p: ["A schema change that needs a full table rewrite stalls the crawl for days.", "Losing the table while keeping the archive means every URL looks unseen and is crawled again."],
    v: "Crawl a test set, restart all workers and compare table contents before and after. Confirm every URL retains its state, and that a conditional request is issued on revisit using stored validators.",
    dep: ["url-fingerprint-hash","host-partitioner"]
  },
  "link-graph-store": {
    s: "Stores the directed graph of which pages link to which, with anchor text and relationship flags, as an input to ranking, importance and discovery.",
    d: "Every extracted link is recorded as an edge from source to target fingerprint, often compressed with delta coding on sorted target lists. The graph is built per crawl segment and merged. Consumers read it in bulk for importance computation and index signals such as anchor text, and look up inlinks for a page. It is among the largest structures the crawl produces, hundreds of billions of edges. It is hard because it must be both sequentially scannable and queryable by target, which needs both orderings.",
    k: ["Store edges by source only vs also by target: source-only is simple and sufficient for forward walks; both double storage and enable inlink queries.", "Keep every edge vs deduplicate per host pair: every edge preserves information; per host deduplication cuts spam effect and size."],
    p: ["Template links duplicated on every page of a site dominate the graph and distort importance.", "Edges to URLs later merged as duplicates point to the wrong identity unless remapped."],
    v: "Crawl a test site with known links, then dump the graph and compare edges, anchors and flags to the expected list. Confirm an inlink lookup for a target returns exactly the expected sources.",
    dep: ["discovered-link-intake","url-fingerprint-hash","archive-file-store"]
  },
  "content-addressed-store": {
    s: "Keeps one copy of each distinct page body keyed by its content hash, with URLs referring to it, so unchanged and duplicate pages cost no extra storage.",
    d: "Bodies are stored under their hash. A revisit that yields the same hash writes only a small reference record saying 'same as before' instead of the body, and duplicates across URLs share one copy. The archive remains complete from the point of view of readers, who resolve references. Reference counts or crawl-time lifetimes decide when a body can be removed. It is hard because deleting a body requires knowing all references and because readers need the reference chain resolved correctly.",
    k: ["Deduplicate at write time vs at later compaction: write-time saves space immediately and adds a lookup per page; compaction is simple and uses space for a while.", "Reference to previous record vs reference by hash: previous record is simple and forms chains; by hash is independent and requires a global index."],
    p: ["Dropping a body still referenced by an archive record makes that record unreadable.", "Hash collisions treated as equality replace one page's content with another's."],
    v: "Fetch an unchanged page ten times and confirm one body and ten small references exist. Read each reference and verify it returns the right body. Delete one reference and confirm the body stays while others exist.",
    dep: ["exact-content-hash","archive-record-writer","archive-file-store"]
  },
  "downstream-handoff": {
    s: "Delivers parsed documents, extracted links, status and metadata to the indexing pipeline and other consumers through a durable, replayable stream or file batches.",
    d: "Consumers need clean records without involving the crawler: document text and fields, outcome, duplicate cluster, directives and timestamps. Delivery is usually a durable log or a set of batch files per crawl segment, so consumers can replay after failures. Schema versions are explicit. Deletions and redirects are sent as records too, otherwise the index keeps removed pages. It is hard because the crawl runs continuously while consumers may be slow, and because correctness for removals is easy to forget.",
    k: ["Streaming log vs periodic batches: streaming gives freshness in minutes and needs retention and consumer offsets; batches are simple and delay everything by the batch period.", "Send full documents vs references to the archive: full is self-contained and heavy; references are light and tie consumers to archive access."],
    p: ["Not sending tombstones for dead or redirected URLs leaves removed pages in the index forever.", "A schema change deployed to the producer before consumers breaks the index build."],
    v: "Crawl test pages including a removed page and a redirect. Confirm the consumer receives a record for every URL with the right outcome, replay of the stream reproduces identical results, and tombstones remove entries in a test index.",
    dep: ["archive-record-writer","duplicate-cluster-store","meta-robots-directives","url-state-table"]
  },
  "archive-indexing": {
    s: "A lookup structure mapping each URL and capture time to the archive file, offset and length where its record lives, so single pages can be read without scanning.",
    d: "As records are written, an index entry with sorted URL key, timestamp, file and offset is emitted. Index files are merged and sorted, then split into blocks with a small top-level index for binary search. Lookups for one URL return all its captures, and replay tools use them to serve past versions. It also supports analysis jobs that select by host. It is hard because the key must sort URLs so that hosts and paths cluster, and because the index is rebuilt or merged continuously as new files arrive.",
    k: ["Sort by reversed host name vs by raw URL: reversed host groups subdomains of a site together; raw URL sort is simple and scatters related hosts.", "Single global index vs per-crawl indexes: global answers any lookup in one place and is expensive to merge; per-crawl is cheap and requires querying many."],
    p: ["An index entry pointing at the wrong offset returns another page's content, silently.", "Rewriting archive files after indexing invalidates every offset."],
    v: "Look up a sample of URLs and read the record at each indexed offset. Confirm each returns the right URL and capture time with matching checksum, and that a missing URL returns an explicit not-found.",
    dep: ["archive-record-writer","archive-file-store","url-fingerprint-hash"]
  },
  "host-partitioner": {
    s: "Assigns each host to one worker, using consistent hashing of the host name, so all URLs for a host, and its politeness state, live in one place.",
    d: "The partitioner maps a host key to a worker through a consistent hash ring with virtual nodes, so adding or removing a worker moves only a small share of hosts. Hashing the host and not the URL keeps delay, robots rules, and per-host queues local with no cross-worker locking. The assignment is published through the coordination layer so every worker can route a discovered URL to its owner. It is hard because host sizes are wildly unequal and a few huge sites carry most of the load.",
    k: ["Consistent hashing on host vs a managed assignment table: hashing needs no lookup and balances only in aggregate; a table allows manual placement of huge hosts and needs storage and updates.", "Partition by host vs by registered domain: by host is finer and balances better; by domain keeps subdomains that share a server under one limit."],
    p: ["A single very large host overloads its worker while others idle.", "Two workers that briefly believe they own the same host double the request rate against it."],
    v: "Assign a sample of hosts across workers, add one worker and measure the share of hosts that move. Confirm only about one over the new worker count move, and that every host has exactly one owner at all times.",
    dep: ["worker-membership","coordination-metadata"]
  },
  "worker-membership": {
    s: "Tracks which workers are alive and which version they run, through heartbeats and a membership view that triggers reassignment when a worker joins or fails.",
    d: "Each worker sends periodic heartbeats to the coordination layer. A missed run of heartbeats marks it suspect and then dead, and its hosts are reassigned. Joining workers announce themselves and take hosts from others. Epoch numbers on membership versions let workers reject messages from an outdated view. Failure detection must be slow enough to avoid false positives from pauses and fast enough to limit lost work. It is hard because a worker declared dead may still be running, which is how duplicate ownership starts.",
    k: ["Short heartbeat timeout vs long: short recovers quickly and mistakes pauses for death; long is stable and delays recovery of the host's URLs.", "Centralized membership service vs gossip: central is simple and a dependency; gossip is resilient and converges slowly and with uncertainty."],
    p: ["A paused worker returns after being replaced and keeps fetching its old hosts.", "Mass failure of heartbeats during a network partition reassigns every host at once."],
    v: "Kill a worker and measure time to reassignment of its hosts. Pause one past the timeout and confirm it is fenced off by epoch when it resumes, so no host has two active owners.",
    dep: ["coordination-metadata"]
  },
  "cross-worker-url-routing": {
    s: "Sends newly discovered URLs from the worker that found them to the worker that owns their host, in batches, with delivery guarantees that survive failures.",
    d: "Most links point to other hosts, so most discoveries leave the worker that found them. URLs are hashed to their owner, grouped per destination into batches, compressed and sent over persistent connections, and acknowledged. Local duplicates are removed before sending, since many pages link to the same targets. Destination queues absorb bursts. Unreachable owners trigger buffering with a bound. It is hard because routing traffic is the main inter-node load, and a lost or duplicated batch must not lose or double URLs.",
    k: ["Direct worker-to-worker batches vs through a durable log: direct is fast and loses batches on failure unless retried; a log is durable and adds a hop and cost.", "Dedupe before sending vs at the owner: before saves network and needs local state; at the owner is exact and costs bandwidth."],
    p: ["Routing with an outdated membership view sends URLs to a worker that no longer owns the host.", "Unbounded send buffers to a dead owner exhaust memory."],
    v: "Crawl a test web across several workers. Confirm every discovered URL reaches its owner exactly once after dedup, none is lost when a destination restarts mid-run, and inter-worker traffic matches the expected volume.",
    dep: ["host-partitioner","worker-membership","bloom-filter-seen-set"]
  },
  "frontier-checkpointing": {
    s: "Periodically records the frontier, seen-set and queue positions so a restarted worker resumes near where it stopped instead of rebuilding.",
    d: "Workers write consistent snapshots of in-memory structures and queue offsets to durable storage at intervals, with a log of changes between snapshots. After a crash, a worker loads the last snapshot and replays the log. Snapshots are written incrementally and in the background to avoid pauses. They must capture the seen set and the queues at one consistent point, so URLs are neither lost nor re-added. It is hard because the structures are huge and change constantly.",
    k: ["Frequent snapshots vs rare snapshots with a long log: frequent give quick recovery and cost I/O; rare are cheap and slow to replay.", "Snapshot the whole state vs rebuild derived structures: whole is quick to load and large; rebuilding saves space and takes longer to recover."],
    p: ["A snapshot of the seen set not matching the queues drops or repeats URLs after recovery.", "Snapshots that block the event loop cause fetch stalls and timeout spikes."],
    v: "Kill a worker at a random point during a crawl and restart it. Confirm it resumes from its last checkpoint, no URL in the test set is lost, duplicates are limited to the replay window, and recovery time meets the target.",
    dep: ["frontier-disk-spill","archive-file-store","url-state-table"]
  },
  "failure-recovery": {
    s: "The procedures and automation for continuing the crawl when workers, disks, networks or whole regions fail, with bounded loss of work and no breach of politeness.",
    d: "On worker loss, its hosts are reassigned and its leased URLs return to queues when leases expire; the new owner loads the last checkpoint for those hosts. Politeness state, the next-allowed time per host, is restored conservatively so recovered hosts wait rather than burst. Disk and archive loss are handled by replication. Operators can drain, pause and resume a region. It is hard because recovery is where many violations happen: a new owner starting with no memory of recent requests sends a burst.",
    k: ["Restore next-allowed times from checkpoint vs assume a fresh delay: restoring is exact and needs state; a fresh delay is simple and delays recovery slightly.", "Automatic reassignment vs operator approval: automatic restores quickly and can amplify a false alarm; operator approval is safer and slow."],
    p: ["A newly assigned worker fetches immediately from every host it inherited, producing a burst the sites see.", "Duplicate URLs after recovery are fetched twice because downstream is not idempotent."],
    v: "Kill workers in a test cluster under load. Confirm hosts are reassigned within the target time, no host receives requests faster than its delay across the failover, and total URLs fetched equals the expected set within the duplicate allowance.",
    dep: ["worker-membership","frontier-checkpointing","url-lease-and-ack","host-partitioner"]
  },
  "load-rebalancing": {
    s: "Moves hosts between workers when load becomes uneven, by queue size, bandwidth or CPU, without breaking politeness or losing state.",
    d: "Metrics per worker and per host reveal skew: one worker holding giant sites, another holding slow ones. The rebalancer moves hosts by handing over their queue, robots cache, delay state and history, with a short fence so only one worker fetches at a time. It runs gradually, preferring to move whole hosts with small state. Splitting a single huge host across workers is avoided because it breaks local politeness, so rebalancing is limited by the largest host. It is hard to do without bursts at the moment of handover.",
    k: ["Move hosts live vs only at checkpoints: live is responsive and needs careful handover; at checkpoints is simple and slow to react.", "Rebalance on load vs on host count: load adapts to real skew and chases noise; count is stable and ignores size differences."],
    p: ["Handover without transferring next-allowed times lets the new owner send a request immediately after the old one.", "Frequent rebalancing on noisy metrics keeps moving the same hosts around."],
    v: "Skew a test cluster by assigning large hosts to one worker. Confirm the rebalancer evens utilization within the target band, and that access logs show no host exceeding its rate across any handover.",
    dep: ["host-partitioner","worker-membership","back-queues-per-host","crawl-delay-policy"]
  },
  "coordination-metadata": {
    s: "A small, strongly consistent store for the facts all workers must agree on: membership, host assignments, crawl configuration, epochs and archive catalogs.",
    d: "A consensus-backed key-value service holds the host assignment map, worker epochs, active crawl definitions, blocklist version and the catalog of archive files. Workers watch it for changes and cache what they read. It stays small, because it is replicated through consensus and is not on the fetch path. Writes are rare. It is hard because everything depends on it: if it is unavailable workers must continue with their cached view for a bounded time, and any bug that floods it takes the crawl down.",
    k: ["Strongly consistent store vs eventually consistent registry: strong prevents split ownership and limits availability; eventual stays up and permits briefly overlapping owners.", "Workers read on each use vs cache with watches: reading each time is always current and loads the store; caching keeps it off the hot path and risks staleness."],
    p: ["Putting per-URL or per-host state in it overloads the consensus group.", "Workers that stop when it is unreachable halt the crawl for a short blip."],
    v: "Partition the coordination store from workers for a minute. Confirm workers keep crawling on cached assignments, no host gains a second owner, and the system converges to the same view once connectivity returns.",
    dep: []
  },
});
