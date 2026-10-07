// Details for the experiment tracker plate, part 5: API and ingestion, storage.
ATLAS.details("experiment-tracker", {
  "tracking-api": {
    s: "The server interface for creating runs, writing parameters, metrics and artifact records, and reading them back, over HTTP with JSON bodies.",
    d: "Endpoints cover experiments, runs, parameters, tags, metric batches, artifact records and run state changes. Writes are idempotent by run and sequence identifier so client retries are safe. Reads support filters and pagination. The API is the stable contract used by every client library, the interface and automation, so changes are additive and versioned. It validates names, types and sizes at the edge and keeps heavy writes off the synchronous path.",
    k: ["Resource-style endpoints versus a single batch write call: resource endpoints are easy to understand and chatty; one batch call is efficient for loggers and harder to document and validate.", "Strict validation at the edge versus accept and fix later: strict validation protects the stores and rejects data from sloppy trainers; permissive intake never loses data and pushes bad records downstream."],
    p: ["A change to a response field type breaks older client libraries still running in week-long jobs.", "Writes without idempotency keys produce duplicate runs when the client retries after a timeout."],
    v: "Send the same create-run and metric-batch requests twice. The second response is a success with no new records, and an older client version still reads and writes after a server upgrade.",
    dep: ["run-identity", "ingest-queue", "metadata-database", "api-versioning"]
  },
  "registry-api": {
    s: "The server interface for registered models, versions, aliases, tags, approvals and transitions, with stronger consistency than the tracking API.",
    d: "Operations include create model, create version from a run or a path, set alias, request transition and read the resolved version for a name. Writes are low volume and must be transactional: an alias move is atomic and recorded in the history in the same step. Reads are frequent and cacheable, because serving systems resolve names on startup or on a timer. Authorization is checked on every call and mapped to registry roles, not only project roles.",
    k: ["Strongly consistent alias reads versus cached reads: strong reads show a rollback immediately and cost more; cached reads are cheap and serve the old version for a short while.", "Separate registry service versus part of the tracking server: separate allows independent scaling and stricter operation; combined is simpler and ties registry availability to ingestion load."],
    p: ["Serving systems poll aggressively and a registry outage during an incident prevents rollback resolution.", "An alias move and its history entry are two separate writes and one fails."],
    v: "Move an alias with writes interrupted between steps by a forced failure. Either both the alias and its history entry exist, or neither, and a concurrent resolver never sees a state in between.",
    dep: ["model-versions", "stages-and-aliases", "promotion-history", "authorization-and-roles", "metadata-database"]
  },
  "query-language": {
    s: "A structured way to express filters over runs and models, such as parameter comparisons, metric ranges, tags and time windows, used by interface, API and saved views.",
    d: "Queries are parsed into a tree of comparisons and logical operators, validated against known fields, and translated into database queries or index requests. The language handles typed comparisons, missing values, nested keys and ordering. Because it is user-facing, it is a compatibility surface: saved views and scripts depend on its behavior. Translating arbitrary user filters into efficient queries over schema-less keys is the performance challenge.",
    k: ["Custom query language versus a general query dialect: custom is safe and tailored to runs; a general dialect is powerful, familiar, and exposes the schema and needs sandboxing.", "Typed comparison with coercion versus strict types: coercion finds what users mean and surprises on edge cases; strict types are predictable and reject near-misses."],
    p: ["A filter on a rarely used key triggers a full scan over millions of rows and slows the interface for everyone.", "Missing metrics are treated as zero in a comparison, so unrelated runs match."],
    v: "Run a compound query on a parameter, a metric range and a tag against a million-run dataset. It returns the correct set with the documented handling of missing values, within the latency target, and the explain output uses an index.",
    dep: ["metadata-database", "search-index"]
  },
  "batch-ingest": {
    s: "The write endpoint that accepts batches of metric points and other records, validates them and hands them to storage, built for high volume and safe retries.",
    d: "Batches arrive compressed with a run identifier and sequence range. The endpoint authenticates, checks quota, deduplicates by sequence, and enqueues the payload for storage, answering quickly. Ordering within a run is preserved by sequence numbers, not arrival order. Large batches reduce overhead and increase the cost of a retry. The endpoint must accept data for a run in any state, within limits, because stragglers arrive after the client believes it has finished.",
    k: ["Acknowledge after enqueue versus after durable storage: enqueue acknowledgments are fast and lose data if the queue fails before storing; durable acknowledgments are safe and slower.", "Large batches versus small: large batches amortize overhead and make failures costly; small batches give low latency and many more requests."],
    p: ["A batch partly fails validation and the endpoint rejects all of it, losing good points with the bad.", "Late batches for a closed run are dropped silently."],
    v: "Send 1,000 batches concurrently with some replayed. Every unique point is stored once in sequence order, replays are acknowledged without effect, and a deliberately malformed point is reported without dropping the rest of its batch.",
    dep: ["ingest-queue", "run-identity", "rate-limiting", "metric-store"]
  },
  "ingest-queue": {
    s: "A durable buffer between the ingestion endpoint and the stores, which absorbs bursts, lets writers be acknowledged quickly and feeds storage and live viewers.",
    d: "Accepted batches are appended to a partitioned log keyed by run, so one run's points stay ordered. Consumers write them to the metric store, update summaries, refresh the search index and publish to live viewers. The queue provides at-least-once delivery, so consumers must be idempotent. Lag is the main health signal. During a store outage the queue holds data until recovery, within its retention, after which data is lost.",
    k: ["Partition by run versus by metric: by run preserves per-run order and risks hot partitions for huge runs; by metric spreads load and complicates ordering and summaries.", "Queue as a separate system versus writing straight to the database: a queue absorbs bursts and decouples consumers at the cost of another system; direct writes are simple and couple intake speed to store speed."],
    p: ["A consumer falls behind silently and viewers see charts that are minutes old with no warning.", "Queue retention is shorter than a store outage and data is lost permanently."],
    v: "Stop the metric store for ten minutes while loggers continue. After restart, lag drains to zero, no points are missing or duplicated, and the lag gauge showed the backlog during the outage.",
    dep: ["metric-store", "search-index", "self-monitoring"]
  },
  "bulk-export": {
    s: "Paged and streaming retrieval of large result sets, and export of runs and metrics to files or analytic systems for work outside the interface.",
    d: "Listing endpoints use cursors instead of offsets so results stay stable while new runs arrive. Exports stream rows in a columnar or text format, with filters applied on the server. Scheduled exports copy metrics to a warehouse for joins with business data. Exports are heavy reads that can swamp the database and are also the main route by which data leaves the system, so they are rate limited and recorded in the access log.",
    k: ["Cursor pagination versus offset: cursors are stable and efficient on large sets and prevent jumping to a page; offsets allow jumping and get slow and unstable.", "Export on demand from the live store versus from a replica or snapshot: the live store is current and takes load from the primary; a replica protects interactive use and lags."],
    p: ["A script pulls every metric for every run through the interface API and degrades it for all users.", "Exports run under a broad service account and bypass project-level access rules."],
    v: "Export 100,000 runs with filters while new runs are being created. The file has each matching run exactly once, no duplicates or skips from concurrent writes, and the export appears in the access log with the requester.",
    dep: ["metadata-database", "access-audit-log", "rate-limiting", "authorization-and-roles"]
  },
  "api-versioning": {
    s: "The rules for evolving the API and client libraries so old jobs keep working while new capabilities are added.",
    d: "Training jobs can run for weeks with the client version they started with, and teams upgrade libraries irregularly. The server therefore supports several client versions at once, uses additive changes by default, and publishes deprecation windows. Version negotiation at connection tells the client what the server accepts. Breaking changes get a new version path and a migration period measured in months. The server's own schema migrations must remain compatible with the oldest supported client.",
    k: ["URL-versioned API versus additive evolution of one version: URL versions allow clean breaks and double the surface to maintain; additive evolution is simple and accumulates legacy fields.", "Long support windows versus forced upgrades: long windows protect running jobs and keep old code alive; forced upgrades cut maintenance and kill jobs."],
    p: ["A server upgrade removes a field that clients from last quarter still send and jobs fail mid-run.", "The client library and server drift in meaning for a field with the same name."],
    v: "Run a client from two supported versions back against the current server through a complete run, including metrics, artifacts and registration. All calls succeed, and the server logs a deprecation notice with the client version.",
    dep: ["tracking-api", "schema-migrations"]
  },
  "rate-limiting": {
    s: "Limits on request and data volume per user, project or run, with backpressure signals so heavy writers slow down before they harm the system.",
    d: "The server meters requests, points and bytes per principal over time windows. Exceeding a limit returns a retry-after response, which the client library honors by slowing its sender and buffering. Limits protect the shared stores and queue from a runaway logging loop. Separate limits apply to reads and exports. Different workloads need different budgets, and a generous limit for training metrics may be too high for media uploads.",
    k: ["Hard rejection versus soft throttling: rejection protects the system and drops or delays data; throttling smooths load and can still back up clients.", "Per-user limits versus per-project: per-user limits stop one person's mistake, and per-project limits match how teams are billed and let one person starve colleagues."],
    p: ["A logging loop with no step interval logs a million values per second and fills a project's quota in a minute.", "The client ignores retry-after and amplifies the overload by retrying immediately."],
    v: "Drive a client at ten times its limit. The server returns retry-after, the client slows to the limit without crashing the job, other projects' latency is unchanged, and the dropped or delayed point counts are reported.",
    dep: ["authentication", "quotas-and-cost", "self-monitoring"]
  },
  "metadata-database": {
    s: "The transactional database holding experiments, runs, parameters, tags, artifact records, registry entries and lineage edges: everything small and relational.",
    d: "Tables hold entities and the relationships between them, with indexes for the common filters: by experiment, time, status, tag and parameter. Parameters and tags are key-value rows, so a run has dozens of rows and queries join them. Registry state and promotion history are in the same store and use transactions. It is the system of record and the first thing to need scaling, because comparison queries touch many rows and schema-less keys are hard to index.",
    k: ["Key-value rows for parameters versus a document column: rows index and filter well and multiply rows per run; a document column is compact and harder to query across runs.", "One shared database versus per-workspace databases: shared is simple to operate and share capacity; per-workspace isolates noisy tenants and multiplies operations."],
    p: ["A popular filter on a parameter has no index, and every comparison page scans the table.", "A long-running reporting query holds locks and blocks writes from running jobs."],
    v: "With ten million runs loaded, a filtered list by experiment and a metric range returns its first page within the latency target, and an alias move transaction completes while a heavy report runs.",
    dep: ["schema-migrations", "backup-and-restore", "caching-layer"]
  },
  "metric-store": {
    s: "The store optimized for large numbers of timestamped numeric points, organized by run and metric, with fast range reads and compact storage.",
    d: "Points are written in append order and stored in time or step order within a run and metric. Compression exploits that values change slowly and steps increase. Reads fetch a range for a few series and often need aggregates at several resolutions. It can be a column store, a time-series database, or files per run in the object store with an index. Cardinality, the number of distinct series, is the cost driver, not raw point count.",
    k: ["Dedicated time-series store versus rows in the metadata database: dedicated stores handle volume and range reads well and add a system; rows are simple and collapse beyond a certain scale.", "Files per run in object storage versus a database: files are cheap and scale for archived runs, and live queries and cross-run aggregation are harder."],
    p: ["Cardinality explodes when a loop logs metrics with the step in the name, and indexes grow without bound.", "Old runs stored in the hot tier cost far more than they are read."],
    v: "Write a million points to each of 1,000 series, then read a 500-step range of 20 series. The read returns exactly the stored values within the latency target, and storage per point is within the documented size.",
    dep: ["object-store", "storage-tiering", "metric-downsampling"]
  },
  "object-store": {
    s: "The scalable blob storage holding artifact files, checkpoints, model packages, media and exported bundles, addressed by key.",
    d: "An object store exposes put, get, range get, list and delete over HTTP, with high durability and effectively unlimited capacity, and no in-place edits. The tracker keeps its own records of what each key means. Access uses short-lived signed links so that clients transfer directly. Throughput depends on parallelism and key distribution. Because objects are immutable, the store naturally supports versioned, write-once artifacts, and cost is mostly capacity plus requests plus data leaving the region.",
    k: ["Managed cloud store versus self-hosted: managed stores need little operation and tie costs and location to a provider; self-hosted gives control and data residency and requires operating durable storage.", "Versioning enabled at the store versus tracker-managed versions: store versioning protects against accidental overwrites and duplicates tracking; tracker versions are explicit and rely on never overwriting."],
    p: ["Cross-region downloads from training clusters generate large transfer bills.", "A bucket policy is misconfigured and artifacts become publicly readable."],
    v: "Upload an object, then attempt to overwrite and read it from a link past its expiry. The overwrite is refused or versioned, the expired link is rejected, and a cross-account read without a signed link is denied.",
    dep: ["storage-tiering", "backup-and-restore"]
  },
  "search-index": {
    s: "A secondary index over names, descriptions, tags and selected fields that makes free-text and faceted search fast, kept in step with the metadata database.",
    d: "Changes to runs, models and tags are published as events and applied to an inverted index. Search supports prefix matching, fuzzy text and facets such as owner and status. The index is derived, so it can be rebuilt from the database, which is the recovery plan. Updates lag slightly. Access rules must be enforced on results, either by filtering after retrieval or by indexing permissions, and both have costs for ranking and counts.",
    k: ["Index permissions with documents versus filter results afterward: indexing permissions returns correct counts and requires reindexing on every permission change; post-filtering is simple and gives inconsistent pagination and counts.", "Near-real-time versus batch indexing: near-real-time shows new runs at once and loads the index; batch updates are cheap and show stale lists."],
    p: ["The index diverges from the database after a failed consumer and searches miss recent models.", "Renaming a model is not propagated and old names still appear in results."],
    v: "Create a run and search for it by tag; it appears within the stated delay. Rebuild the index from scratch and confirm the results of ten saved queries are identical before and after.",
    dep: ["metadata-database", "ingest-queue", "authorization-and-roles"]
  },
  "caching-layer": {
    s: "Short-lived caches for expensive or frequent reads: run lists, resolved aliases, downsampled series and signed links.",
    d: "Cache keys combine query, filters and the caller's visibility, because results depend on permissions. Time-to-live suits data that may be seconds old, such as charts of running jobs, while finished runs can be cached for long since they no longer change. Alias lookups use short expiry or event invalidation, because staleness there has real consequences. Placement can be in the server process, a shared cache or the browser. The trouble is invalidation after edits, deletions and permission changes.",
    k: ["Time-based expiry versus event-based invalidation: expiry is simple and serves old data until it runs out; invalidation is exact and requires every writer to publish it.", "Shared cache across users versus per-user keys: shared keys have high hit rates and risk showing data to the wrong person; per-user keys are safe and cache less."],
    p: ["A cached list is served to a user whose access was just revoked.", "Cached series for a live run freeze on a stale value after a network partition."],
    v: "Load a chart twice and see the second load served from cache. Change a run's tag and revoke a user's access, and confirm that the next request reflects both within the documented delay.",
    dep: ["metadata-database", "authorization-and-roles"]
  },
  "schema-migrations": {
    s: "Versioned, ordered changes to database structure applied during upgrades, designed so old and new servers and clients can coexist during a rollout.",
    d: "Each migration is a script with a version number, run exactly once and recorded in the database. Changes follow an expand-then-contract pattern: add the new column, write both, move readers, then remove the old one in a later release. Large tables need online methods so writes are not blocked for hours. A migration that cannot be rolled back must be tested on a copy of production data first, since tracker tables reach hundreds of millions of rows.",
    k: ["Expand-then-contract in several releases versus one-step migration: multi-release changes allow zero downtime and take longer and need discipline; one-step is quick and needs an outage window.", "Migrations applied automatically at startup versus by an operator: automatic is convenient and risky with many replicas starting together; operator-run is controlled and can be skipped."],
    p: ["A migration locks a ten-million-row table and ingestion stalls for an hour.", "Two replicas start together and both try to apply the same migration."],
    v: "Run the upgrade on a copy with realistic row counts while a load generator writes. The migration completes without write errors, the schema version advances, and the previous server version still works until contraction.",
    dep: ["metadata-database", "api-versioning"]
  },
  "backup-and-restore": {
    s: "Regular copies of the metadata database and object store, with practiced procedures to restore them to a consistent point in time.",
    d: "The database is backed up by snapshots plus a log of changes so it can be restored to any moment. Object stores use versioning or replication to another region. A consistent restore needs the two to agree: records may not reference objects that are missing, and objects may exist with no record. A restore drill checks that. Deleting a run must reach the backups too, or a restore resurrects data that was deleted for compliance reasons.",
    k: ["Point-in-time recovery versus periodic snapshots: point-in-time recovery limits loss to seconds and costs log storage; snapshots are simple and lose everything since the last one.", "Back up all artifacts versus only registered models: all is complete and expensive; registered-only is cheap and loses experiments that were never promoted."],
    p: ["A restore brings back metadata for artifacts whose objects were removed by cleanup.", "Backups exist and no one has ever restored one, so the first restore is during an outage."],
    v: "Restore the database to a chosen timestamp in a separate environment along with the object store. A sample of recorded artifacts all resolve to existing objects with matching checksums, and the restore time meets the stated target.",
    dep: ["metadata-database", "object-store", "retention-policies"]
  },
  "storage-tiering": {
    s: "Moving older or rarely read data to cheaper, slower storage classes, while keeping it addressable so it can still be fetched when needed.",
    d: "Policies move artifacts and metric series by age and access pattern. Hot data sits on fast media or standard object storage; cold data on infrequent-access or archive classes with lower capacity cost and higher retrieval cost and delay. The metadata database stays hot, so people can still search for archived runs. The interface should say when data is archived and how long retrieval takes. Moving the wrong data to archive makes a rollback or audit slow when it matters most.",
    k: ["Automatic tiering by age versus by observed access: age is predictable and may chill data still needed; access-based tiering follows use and costs tracking overhead.", "Archive registered model artifacts versus never archive them: archiving saves cost and delays rollback; keeping them hot costs money and protects recovery speed."],
    p: ["A production model's checkpoint is archived and takes hours to restore during an incident.", "Archived metric series cannot be charted until restored and users believe data is gone."],
    v: "Let a policy archive a run's data. The run remains searchable, its charts report archived status with an estimated retrieval time, and requesting it restores the data to a readable tier within that time.",
    dep: ["object-store", "metric-store", "retention-policies"]
  },
});
