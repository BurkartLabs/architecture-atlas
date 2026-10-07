// Details for the object storage plate, part 2: metadata index, versions and consistency, lifecycle and tiering.
ATLAS.details("object-storage", {
  "metadata-index": {
    s: "A sorted, partitioned store holding one record per object version: key, size, checksum, timestamps, tags, encryption info and the location of the data.",
    d: "Records are ordered by bucket, key and version, so a lookup is a point read and a listing is a range scan. The index is split into partitions by key range, each replicated by consensus on several machines. A put commits a record here after the data is durable; a get reads it first to find the pieces. It is small compared with the data but receives every request, so it limits request rate, latency and availability. The hard problems are partition hot spots, listing cost and keeping records consistent with the data they describe.",
    k: ["A sorted key-value index vs a hash index: sorted supports prefix listing and range deletes, but concentrates sequential keys on one partition.", "Storing small objects inline in the record vs always pointing to data: inline saves a hop for tiny objects, but bloats the index and mixes two scaling problems."],
    p: ["A record pointing at data that was never made durable returns errors for an object that appears to exist.", "Index growth unnoticed until partitions exceed memory budgets makes latency collapse suddenly."],
    v: "Insert a million keys, then confirm point lookups return in single-digit milliseconds, a prefix listing returns keys in sorted order, and killing one replica of a partition causes no failed requests.",
    dep: ["key-range-partitioning", "metadata-consensus", "user-metadata-and-tags"]
  },
  "key-range-partitioning": {
    s: "Divides the index into contiguous key ranges, each owned by one replicated partition, so storage and request load spread across many machines.",
    d: "The ordered key space of all buckets is cut at boundary keys into ranges. A directory maps each range to the machines holding it and its current leader. Ranges are chosen by size and load, not by hash, so sequential listing stays local to few partitions. A request is routed to the partition whose range includes its key. The design trade-off is locality against distribution: workloads writing keys in increasing order, such as timestamps, hammer the last range regardless of how many partitions exist.",
    k: ["Range partitioning vs hash partitioning: ranges allow cheap ordered listing and prefix deletes, but hot prefixes cannot be spread without splitting; hashes spread load but make listing a scatter-gather.", "Fine-grained ranges vs few large ones: many small ranges rebalance smoothly but multiply metadata and leader elections."],
    p: ["Monotonic key prefixes such as dates concentrate all new writes on one partition, throttling a tenant at low total volume.", "A stale directory entry routes requests to a previous owner that no longer serves the range."],
    v: "Write keys with a random prefix and with an increasing prefix at equal rate, and confirm the first spreads load across partitions evenly while the second shows a single hot partition until it splits.",
    dep: ["metadata-consensus", "partition-splitting"]
  },
  "partition-splitting": {
    s: "Automatically divides an index range that is too large or too busy into two, moving half its keys to a new partition without pausing traffic.",
    d: "A monitor watches each partition's size, request rate and latency. When a threshold is crossed, it picks a split key, often the median or the point of heaviest load, and the partition executes a split: it creates a new replica group, hands over the upper range, updates the directory, and redirects stragglers. Reads and writes continue throughout, using brief fencing at the switchover. The difficulty is doing this without a latency spike or lost writes, and avoiding a split storm when many partitions cross the threshold together.",
    k: ["Split on size vs split on load: size keeps partitions manageable, while load addresses hot ranges but may split where a single key is the hot spot and splitting cannot help.", "Splitting by copying data vs splitting by reference: references make the split instant, but defer the cost of compaction until later."],
    p: ["A single hot key cannot be split away; the partition remains throttled no matter how often it splits.", "Concurrent splits on neighboring ranges create transient directory inconsistencies that surface as client redirects loops."],
    v: "Load one partition past its threshold and confirm it splits within the target time, the directory shows two ranges whose union equals the original, and no request fails or returns wrong data during the split.",
    dep: ["key-range-partitioning", "metadata-consensus"]
  },
  "listing-and-prefix-scans": {
    s: "Returns keys in sorted order for a bucket, filtered by prefix and grouped by delimiter, in pages that clients continue with a token.",
    d: "A list request becomes a range scan from the start key (or continuation token) across one or more partitions, returning up to a page of keys, and rolling keys sharing a delimiter into common prefixes to simulate folders. The service must skip delete markers and noncurrent versions when asked, and apply permissions per request. The cost grows with the number of keys scanned, not returned: a prefix with millions of deleted entries is slow to list. At scale, listing becomes the most expensive routine call in the system.",
    k: ["Sorted pagination with tokens vs offset paging: tokens stay correct and cheap as the data changes, but cannot jump to an arbitrary page.", "Delimiter rollup computed at read time vs a maintained directory index: read-time needs no extra write cost, but folders with millions of entries are expensive to scan."],
    p: ["Listing a prefix full of tombstones scans them all, so a listing of ten keys takes seconds.", "Using list as a queue or as the source of truth for a changing prefix misses or repeats keys across pages."],
    v: "Create a bucket with one million keys across nested prefixes and confirm paged listing with a delimiter returns every key exactly once, in order, with correct common prefixes, while concurrent writes continue.",
    dep: ["metadata-index", "key-range-partitioning", "delete-markers"]
  },
  "metadata-consensus": {
    s: "A replicated state machine protocol that keeps all copies of an index partition identical and elects a leader, so committed records survive machine failures.",
    d: "Each partition runs a consensus group of three or five replicas. Writes go to the leader, which appends them to a replicated log and acknowledges when a majority has persisted them; followers apply the log in order. On leader failure, an election picks a replica with the latest log. Reads either go to the leader or use leases, to avoid stale answers. Its cost is latency, since each write waits for a majority across failure domains, and the effort of membership changes during repair and splits.",
    k: ["Majority commit across failure domains vs nearest-replica commit: spreading replicas protects against rack or site loss, but adds round-trip latency to every write.", "Leader-only reads vs follower reads: leader reads are always current, while follower reads scale read throughput but can be stale."],
    p: ["A leader isolated by a network partition may serve stale reads if its lease logic or clock assumptions are wrong.", "Replica placement in the same rack means one failure removes the majority and halts the range."],
    v: "Kill the leader replica of a partition during sustained writes, and confirm a new leader is elected within seconds, no acknowledged write is lost, and the old leader rejoins with an identical log.",
    dep: ["failure-domains", "membership-and-heartbeats"]
  },
  "bucket-configuration-store": {
    s: "The strongly consistent registry that holds each bucket's owner, region, policies, lifecycle, replication, encryption and notification settings.",
    d: "Bucket configuration is small, rarely changed and read on nearly every request, so it lives in a separate replicated store, apart from the object index. Front ends cache entries with version numbers and refresh on change or short expiry. Creating a bucket reserves the global name; deleting it requires the bucket be empty and releases the name. Updates are atomic per setting. The hard part is propagation: a cache holds an old policy for seconds to minutes, which defines the window in which a revoked permission still works.",
    k: ["Cache with short expiry vs invalidate on write: expiry is simple and robust, while invalidation shrinks the stale window but needs reliable delivery to every front end.", "One document per bucket vs separate stores per feature: one document is atomic and simple, but large configurations slow every update."],
    p: ["Slow propagation of a policy tightening leaves a window where revoked access still succeeds.", "A bucket whose registry entry is lost or corrupted becomes unreachable even though its objects are intact."],
    v: "Change a bucket policy to deny a user and measure how long until a request from that user is first rejected on every front end. It must be below the documented propagation bound.",
    dep: ["metadata-consensus"]
  },
  "user-metadata-and-tags": {
    s: "Key-value pairs attached to an object: system fields such as content type, user-defined headers and tags used for policies, billing and lifecycle filters.",
    d: "System metadata (content type, encoding, cache control) is returned on reads. User metadata is a small set of headers stored with the object and fixed at write time, since changing it means rewriting the record. Tags are separate, mutable key-value pairs with tighter limits, designed for access control and lifecycle selection. Both live in the index record, which bounds their size. The hard part is that the index is not a general query engine: lookup by metadata value is not supported, so customers build their own catalogs.",
    k: ["Immutable user metadata vs updatable: immutability keeps each version self-consistent, but changing a header means a full copy.", "Tags in the main record vs a side index: in-record is cheap and atomic with the object, while a side index could support queries but costs write amplification."],
    p: ["Treating metadata as a searchable database leads to full listings per query and unbounded cost.", "Putting sensitive data in headers exposes it in logs, policy conditions and presigned URL discussions."],
    v: "Write an object with metadata and tags, read it back and confirm exact values. Change a tag and confirm the version and data are unchanged, while changing user metadata creates a new version.",
    dep: ["metadata-index"]
  },
  "metadata-cache": {
    s: "In-memory copies of hot index records, partition maps and policies on front ends and index servers, trading a bounded staleness for far fewer lookups.",
    d: "Caches sit at three places: front ends cache partition maps and bucket configuration; index servers cache blocks of their sorted data in memory; and some deployments cache whole hot records near the edge. Entries carry versions or leases so stale data is detected and expiry bounds its age. The purpose is protecting the index from read amplification, since a few popular objects can dominate requests. Correctness depends on caching only data whose staleness the consistency model tolerates, and never caching a negative answer too long.",
    k: ["Strong consistency by bypassing caches vs bounded-staleness caching: bypassing is simplest to reason about, while caching survives index slowness but needs documented limits.", "Caching negative results vs not: caching misses protects against scans for absent keys, but delays visibility of a new object."],
    p: ["A cached not-found for a key delays read-after-write of a newly created object.", "Cache stampedes after a restart send every request to the index simultaneously."],
    v: "Overwrite a hot object and confirm every front end returns the new version within the stated bound, while an index outage in a test still serves cached reads for the configured period.",
    dep: ["metadata-index", "bucket-configuration-store"]
  },
  "consistency-model": {
    s: "The guarantees clients get about what they will see after a write or delete: whether reads and listings reflect the latest committed state, and across which keys.",
    d: "Modern designs give strong read-after-write for puts, overwrites, deletes and listings, because each key's record is committed through its partition's consensus group before acknowledgment, and reads see the committed index. Earlier designs gave only eventual consistency on overwrite and list, leading to clients seeing old versions. There are no multi-key transactions: guarantees apply per key, and a listing is consistent per partition, not an atomic snapshot of the whole bucket. Making this uniform across caches, replicas and tiers is the hard engineering work.",
    k: ["Strong per-key consistency vs eventual: strong removes a large class of client bugs and workarounds, but adds latency and ties availability to consensus.", "Per-key guarantees vs multi-key transactions: per-key scales with partitioning, while multi-key atomicity needs cross-partition coordination that table formats build on top instead."],
    p: ["Assuming a listing is a snapshot leads to missing or duplicated keys when objects change during a long scan.", "Cross-region reads from a replica are eventually consistent even if the home region is strong."],
    v: "In a loop, write a new version, immediately read and list from other clients, and confirm every read returns the latest version and every listing includes the new key, across millions of iterations.",
    dep: ["atomic-commit-protocol", "metadata-consensus", "metadata-cache"]
  },
  "atomic-commit-protocol": {
    s: "The ordering of steps that makes an object appear all at once: durable data first, then a single index record commit that flips visibility.",
    d: "A write places redundant pieces on storage nodes, waits until enough are durable, then asks the owning index partition to insert the record that references them. Until that record commits, the object does not exist; after, it is fully readable. The commit is one consensus-replicated write, so it is atomic and survives failures. If a failure occurs before commit, the written pieces are orphans for a sweeper to remove. The hard part is the crash window between data and commit, and idempotency when a retry races a slow success.",
    k: ["Data first, then index commit vs index first: data-first never exposes a record without bytes, but leaves orphan data after crashes; index-first needs recovery to repair dangling records.", "Single-record commit vs transaction across parts: single-record commit is fast and simple, but anything needing several keys atomically must be layered above."],
    p: ["Crashes between data write and index commit leak storage unless orphan detection runs.", "A client retry with a new request identifier after an ambiguous timeout creates duplicate versions."],
    v: "Inject a crash at each step of a write (after pieces, before commit, after commit, before response) and confirm that afterwards the object is either wholly absent or wholly present, never partially readable.",
    dep: ["metadata-consensus", "metadata-index", "erasure-coding"]
  },
  "versioning": {
    s: "Keeps every prior version of a key instead of overwriting it, giving each write a unique identifier and allowing reads, restores and deletes by version.",
    d: "With versioning enabled, a put creates a new record with a unique version identifier, and the previous record becomes noncurrent but stays in the index and storage. A plain get returns the newest; a get with identifier returns that version. Versions sort within the key, newest first. Space and listing cost grow with every overwrite, so lifecycle rules usually expire noncurrent versions. It is hard because versioning cannot be cleanly switched off, only suspended, and old versions remain billable and discoverable until removed.",
    k: ["Versioning on vs off: on protects against overwrites and deletes and enables replication and recovery, but multiplies storage and listing cost for frequently rewritten keys.", "Time-ordered identifiers vs random: ordered identifiers allow newest-first scans cheaply, while random identifiers avoid revealing write order."],
    p: ["Keys overwritten thousands of times accumulate versions that slow listing and inflate bills unless expired.", "Assuming permanent delete when only a marker was added leaves sensitive data retrievable."],
    v: "Overwrite one key five times, then confirm a plain read returns the last, a list-versions call shows five entries in order, and each version's content can be retrieved by identifier.",
    dep: ["metadata-index", "delete-markers", "lifecycle-rules"]
  },
  "delete-markers": {
    s: "A zero-length record that becomes the newest version of a key and hides older versions from plain reads, making deletes reversible in a versioned bucket.",
    d: "In a versioned bucket, deleting a key without a version identifier inserts a marker record rather than removing data. Plain reads and listings treat the key as absent; reading a specific version still works. Removing the marker restores the key. Markers are also what lifecycle rules produce on expiry. Their downside is accumulation: a key whose every version is removed but whose marker remains still occupies listing entries, and a bucket full of expired markers makes scans slow until a rule removes them.",
    k: ["Marker-based deletes vs removal of records: markers give undo and fit replication, but leave index entries that must later be cleaned up.", "Replicating markers vs not: replicating them keeps destinations consistent, while skipping them protects destination data from remote deletion."],
    p: ["Millions of orphaned markers make prefix listings slow even though the bucket looks empty.", "Teams think a delete freed space, but all versions remain and billing continues."],
    v: "Delete a key in a versioned bucket, confirm plain reads return not found while version reads still return bytes, then remove the marker and confirm the key reads again as before.",
    dep: ["versioning", "lifecycle-rules"]
  },
  "object-lock-retention": {
    s: "Write-once protection that prevents versions from being deleted or overwritten until a retention date passes or a legal hold is lifted, for compliance and ransomware defense.",
    d: "Retention is stored on each version as a mode and an until-date, plus an optional hold flag. The front end checks it on every delete or overwrite of that version and refuses when active. In strict mode nobody, including the account owner, can shorten it; in governance mode specially permitted identities can bypass it. Lifecycle and garbage collection must honor it too, and the service must trust its clocks. The difficulty is that errors are unrecoverable: a mistake can lock data and cost for years.",
    k: ["Strict vs bypassable retention: strict satisfies regulators and resists a compromised admin, but cannot be fixed if configured wrongly.", "Per-version locks vs per-bucket default: per-version is precise, while a bucket default is simple but applies to every new object."],
    p: ["A very long default retention set by mistake locks large amounts of data that cannot be removed or billed down.", "Lifecycle rules silently fail to expire locked versions, leaving costs customers expected to end."],
    v: "Lock a version for one hour, then attempt delete, overwrite, lifecycle expiry and account-owner override. All must be refused until the retention date, after which delete must succeed.",
    dep: ["versioning", "access-policies", "garbage-collection"]
  },
  "flat-namespace-semantics": {
    s: "The consequences of having no directories or rename: a key is an opaque string, folders are a listing convention, and moving an object means copying and deleting.",
    d: "Because the index is a flat sorted map, no operation exists to rename a key or a prefix atomically. A move is a copy to the new key followed by delete of the old, per object, and moving a folder of a million objects is a million copies with no atomicity across them. Empty folders exist only as placeholder keys. Directory-like permission, quota and listing behavior are implemented by prefix matching. This trade is why the key space scales, and why file-oriented software ports poorly without a translation layer.",
    k: ["Flat namespace vs hierarchical: flat partitions simply and scales without directory locks, but renames and recursive deletes cost one operation per object.", "Placeholder folder keys vs none: placeholders make empty folders visible to tools, but add objects that break prefix expectations."],
    p: ["Applications using rename for commit steps see partially moved data when a long copy fails midway.", "Tools that list folders recursively treat a million-object prefix as cheap and take hours."],
    v: "Move a prefix of 10,000 objects by copy and delete, interrupt it midway, and confirm every object exists under at least one name and a re-run completes without loss or duplicates.",
    dep: ["copy-object", "listing-and-prefix-scans"]
  },
  "etag-and-content-checksums": {
    s: "The integrity values the service returns and accepts: a per-version entity tag for change detection and client-supplied digests verified on upload and download.",
    d: "On upload, the front end can verify a digest the client sends over the bytes, rejecting corruption in transit. The service computes its own checksum and stores it in the record, and returns an entity tag identifying the version. For multipart objects, the tag is derived from part tags and is not a plain hash of the whole, which surprises clients. Additional checksum algorithms can be computed incrementally per part and combined. The challenge is end-to-end coverage: integrity must be checked at the client, the front end, the storage node and again at rest.",
    k: ["Entity tag as content hash vs opaque version token: a hash lets clients verify bytes, but encryption or multipart assembly breaks that meaning; opaque tokens are honest about it.", "Mandatory checksums vs optional: mandatory finds more corruption, but adds client work and compute for every upload."],
    p: ["Treating a multipart entity tag as the file's hash makes valid downloads appear corrupt.", "Skipping upload checksums lets corruption in a faulty network device or client library become permanently stored data."],
    v: "Upload with a deliberately wrong digest and confirm rejection and nothing stored. Upload correctly, download, and confirm the recomputed digest equals the one returned by the service.",
    dep: ["checksums", "metadata-index"]
  },
  "lifecycle-rules": {
    s: "Declarative per-bucket rules that say when objects in a prefix or with a tag move to another class, expire, or have old versions and incomplete uploads removed.",
    d: "Each rule has a filter (prefix, tags, size), and actions based on age since creation, age as noncurrent version, or a fixed date. Rules are stored in bucket configuration and evaluated by background scanners against the index, not at request time. Actions are idempotent and are executed through the same paths as client operations, so retention locks and replication apply. The hard part is that rules are powerful and silent: a wrong filter deletes data at scale with no error, and effects occur days later.",
    k: ["Declarative rules vs imperative client jobs: rules are cheap to run centrally and survive client failure, but only express simple age and filter logic.", "Evaluation lag vs exact timing: batched scans are efficient, but actions occur up to a day after eligibility, which matters for compliance deadlines."],
    p: ["An overbroad prefix in an expiration rule deletes production data, discovered only after the fact.", "Overlapping rules with conflicting actions behave differently across implementations, surprising authors."],
    v: "Create a rule to expire a prefix after one day, test with objects aged by a controllable clock, and confirm only matching objects are removed, within the documented lag, and others are untouched.",
    dep: ["bucket-configuration-store", "lifecycle-scanner", "storage-classes"]
  },
  "lifecycle-scanner": {
    s: "A background process that walks the index partitions, evaluates each object against its bucket's rules, and enqueues the transitions and expirations that are due.",
    d: "The scanner iterates partitions in key order, reading records and comparing age and attributes to rules. Matches become tasks in a queue: delete a version, rewrite to a cheaper class, mark archived. Work is spread over time to avoid load spikes, and progress is checkpointed so that a crash resumes. A full pass over billions of objects takes hours to days. It is difficult because it competes with live traffic for index capacity, and because partitions split or move mid-scan.",
    k: ["Full scans vs event-driven timers per object: scans are simple and stateless, but cost grows with total objects; timers cost write amplification and storage for every object.", "Scan on a schedule vs continuous trickle: a trickle smooths load, but makes the exact time of each action unpredictable."],
    p: ["A scan that falls behind its schedule silently stops expiring data, and storage costs rise.", "Running at full speed during peak traffic raises index latency for customers."],
    v: "Load a bucket with ten million objects at known ages and confirm one full scan finishes within its target window, enqueues exactly the due actions, and keeps index latency within its objective while running.",
    dep: ["lifecycle-rules", "metadata-index", "listing-and-prefix-scans"]
  },
  "storage-classes": {
    s: "Named tiers with different price, durability layout, minimum retention and retrieval latency, chosen per object at write time or changed by lifecycle rules.",
    d: "A class selects how an object is stored: which media (flash, spinning disks, tape-like archive), what redundancy scheme, how many sites, and what retrieval fees and delays apply. The class is a field in the index record and determines which placement policy the data layer uses. Moving between classes rewrites data or changes its placement. Colder classes have minimum storage durations and per-request retrieval charges. The hard part is making economics predictable, because a poorly chosen class for small or frequently read objects can cost more than the standard one.",
    k: ["Few simple classes vs many specialized ones: few are easy to understand, while many fit workloads closely but invite expensive mistakes.", "Class changes by rewrite vs by metadata flip: rewrite actually changes the physical layout and cost, while a flip is instant but only valid when layouts match."],
    p: ["Moving many small objects to a cold class costs more in per-object fees and minimum sizes than it saves.", "Early deletion charges for minimum durations surprise teams that churn data in cold tiers."],
    v: "Write the same object to two classes and confirm the index records differ, the physical layouts match the class definitions, and a retrieval from the cold class takes the documented time and fee.",
    dep: ["erasure-coding", "placement-map", "archive-tier"]
  },
  "archive-tier": {
    s: "The cheapest storage class, holding rarely accessed data on dense media or powered-down systems, where reads need a restore request and take minutes to hours.",
    d: "Archived objects keep their index record but their bytes move to a different system: dense disks that spin rarely, tape-like libraries, or heavily erasure-coded stripes spread over many sites. A read first requires a restore that stages a temporary copy in a faster class for a stated number of days. Writes are batched into large sequential units to suit the media. The difficulty is operational: scheduling restores efficiently, keeping integrity checks running on data nobody reads, and fitting expectations of retrieval time to the physics of the medium.",
    k: ["Staged restore vs direct slow reads: staging gives a clear contract and lets the system batch work, but forces clients into asynchronous access.", "Wide erasure codes vs replication in archives: wide codes minimize cost per byte, but make repair read from many sites."],
    p: ["Applications that assume ordinary reads hit errors on archived objects until they are restored.", "Unread archive data accrues undetected corruption unless scrubbing continues on a schedule."],
    v: "Archive an object, confirm direct reads are refused with a restore-required status, request a restore, and verify the bytes match the original once staged within the quoted retrieval time.",
    dep: ["storage-classes", "restore-requests", "scrubbing"]
  },
  "restore-requests": {
    s: "A request to temporarily make an archived object readable, with a retrieval speed option and a duration, after which the staged copy is dropped.",
    d: "A restore call marks the object as being restored and queues a retrieval job. The archive system schedules it with others, reads the object and writes a temporary copy into a standard class, then updates the index record with an expiry. Speed options trade price for priority. Notifications signal completion. After the period the staged copy is removed and the object returns to archived state. The challenge is capacity planning: restore demand is bursty, bounded by archive read bandwidth, and one large restore can delay many small ones.",
    k: ["Priority tiers with prices vs one queue: tiers monetize urgency and protect capacity, but need scheduling that avoids starving bulk jobs.", "Temporary copies vs permanent re-tiering: temporary copies suit occasional reads, while permanent changes need an explicit transition."],
    p: ["A restore duration that is too short expires the copy before a slow pipeline reads it.", "Mass restores requested at once exceed archive throughput, delaying all of them past deadlines."],
    v: "Submit restores for 1,000 objects at the standard speed and confirm all complete within the quoted bound, the index shows a restore expiry, and the temporary copies vanish after it.",
    dep: ["archive-tier", "event-notifications", "put-object"]
  },
  "access-tracking": {
    s: "Observes which objects are read and when, and automatically moves them between hot and cool classes based on observed access instead of fixed age.",
    d: "Front ends emit sampled or batched access records that update a per-object or per-prefix last-access time. A policy engine reads this signal during lifecycle scans and moves objects not accessed for a threshold into a cooler class, and back when they are read again. It exists for workloads where age does not predict use. The difficulty is cost and accuracy: tracking every read writes to the index, so many systems store coarse timestamps or update at most once a day per object, which limits how fine the policy can be.",
    k: ["Exact last-access times vs coarse tracking: exact allows precise policies, but turns every read into an index write.", "Automatic tiering vs explicit rules: automatic adapts to unknown patterns, while explicit rules are predictable and avoid per-object monitoring fees."],
    p: ["Frequent small reads of cold-class objects add retrieval charges that exceed the storage savings.", "Batch jobs that scan all objects mark everything as recently accessed and defeat the policy."],
    v: "Leave a set of objects unread past the threshold and confirm they move to a cooler class, then read one and confirm it returns to the hot class, with transition logged for each.",
    dep: ["lifecycle-scanner", "front-end-fleet", "storage-classes"]
  },
  "incomplete-upload-cleanup": {
    s: "Removes parts of multipart uploads that were started but never completed, after a configured number of days, so abandoned data stops consuming and billing space.",
    d: "Every started multipart upload has a record with its parts. If neither completed nor aborted, the parts sit as invisible data. A lifecycle action scans upload records, finds those older than a threshold and aborts them, scheduling the part data for garbage collection. Customers can also list in-progress uploads. Without cleanup, crashed clients and failed pipelines accumulate hidden gigabytes. The difficulty is that these bytes do not show up in normal object listings, so most customers learn of them through the bill.",
    k: ["Default automatic abort vs customer-configured: a default prevents silent waste for everyone, but can abort legitimately long-running uploads.", "Scanning upload records vs per-upload timers: scanning reuses lifecycle machinery, while timers give precise expiry at more state cost."],
    p: ["An abort rule shorter than a slow client's upload time kills uploads in progress.", "Parts uploaded after abort are orphaned if the service does not reject them."],
    v: "Start an upload, send three parts, abandon it, and confirm it appears in the in-progress list, is removed after the configured age, and that its storage disappears from usage reports afterward.",
    dep: ["multipart-upload", "lifecycle-rules", "garbage-collection"]
  }
});
