// Details for the batch processing plate, part 5: cluster resources, data sources and formats.
ATLAS.details("batch-processing", {
  "cluster-manager-interface": {
    s: "The adapter through which the engine requests containers, launches executors and learns of their loss from whichever resource manager the cluster uses.",
    d: "The engine does not own machines. It asks a resource manager for containers of a given size, receives them when capacity allows, starts executor processes inside and is told when they die or are reclaimed. Implementations exist for several managers with different models: some offer resources to the application, others accept requests. The interface hides this behind allocate, launch, kill and status calls. It is hard because semantics differ, including priorities, preemption signals and locality hints, and the engine must behave sensibly when it gets fewer resources than it asked for.",
    k: ["One abstract interface vs manager-specific features: abstraction lets the same job run anywhere, but hides capabilities such as preemption warnings that only some managers provide.", "Request all resources at start vs incrementally: all at start is simple and gang-like, while incremental starts sooner but may run underpowered."],
    p: ["The job waits indefinitely because the manager cannot grant the full request and nothing times out.", "A manager-specific default silently limits executors, so the job runs at a fraction of expected parallelism."],
    v: "Submit a job requesting 100 executors to a cluster with room for 40, and confirm it starts with 40, reports the shortfall, and uses additional executors as capacity appears.",
    dep: ["resource-profiles", "container-limits"]
  },
  "resource-profiles": {
    s: "The declared size of executors and tasks: cores, memory, accelerators and extra resources, used to request containers and pack tasks into them.",
    d: "Each executor is requested with a number of cores and memory, and tasks claim a number of cores each, so an executor runs cores divided by task cores tasks at once. Profiles can differ per stage, such as giving a memory-heavy stage larger executors or requesting accelerators only for the stage that uses them. The scheduler then matches tasks to executors with the right resources. It is hard because sizing is a guess, wrong in either direction, and different stages of one job often need different shapes.",
    k: ["One profile for the whole application vs per-stage profiles: one is simple and reuses executors, while per-stage fits each stage but needs more executor churn.", "Large executors vs small: large share memory and broadcast but concentrate failure impact, while small isolate failures and pack more flexibly."],
    p: ["Requesting executors larger than any machine's free memory means no container is ever granted.", "Oversizing memory for the heaviest stage wastes the rest of the job."],
    v: "Request executors of two sizes for two stages and confirm the first stage runs only on the small ones, the second only on the large ones, and the container sizes in the manager match.",
    dep: ["cluster-manager-interface"]
  },
  "dynamic-allocation": {
    s: "Grows and shrinks the number of executors with the pending workload, requesting more when tasks queue and releasing those that sit idle.",
    d: "When tasks have been pending for a threshold time, the engine requests more executors, often doubling each round. When an executor has been idle past a timeout and holds no needed cached data, it is released. Shuffle data must survive executor release, so it needs an external shuffle service or remote storage. It improves cluster use for variable workloads and long idle periods in interactive sessions. It is hard because scaling reacts with lag, the ramp-up is slow for short jobs, and release must not destroy cached or shuffle data.",
    k: ["Dynamic vs fixed executor count: dynamic uses fewer resources and shares the cluster, while fixed gives predictable start and performance.", "Exponential ramp-up vs immediate full request: exponential avoids over-requesting for small jobs, but takes longer to reach full parallelism."],
    p: ["Releasing an idle executor that holds the only copy of shuffle output forces recompute later.", "Slow ramp-up makes a short query run on a handful of executors."],
    v: "Submit a job with a small first stage and a large second stage and confirm the executor count rises after the pending-task timeout, reaches the cap, and falls after idle timeout when the job ends.",
    dep: ["external-shuffle-service", "cluster-manager-interface", "graceful-decommission"]
  },
  "graceful-decommission": {
    s: "Draining an executor before removal: it stops accepting tasks, hands off cached and shuffle data and then exits, instead of vanishing and forcing recomputation.",
    d: "When scaling down or when the cluster announces a node will go away, the engine marks the executor as decommissioning. The scheduler stops giving it new tasks, running tasks may finish and its cached blocks and shuffle files are copied to other executors or to remote storage. The driver updates location tables so reducers fetch from the new place. It turns many planned removals into non-events. It is hard because the time allowed is limited, copies compete for network and some data cannot be moved in time.",
    k: ["Migrate data before exit vs recompute after: migration avoids repeated work, but needs extra bandwidth and time before the node is reclaimed.", "Wait for running tasks vs kill them: waiting loses no work, but may exceed the warning period."],
    p: ["The warning period ends before migration finishes, so partial data is lost anyway.", "Migrated blocks land on executors that are themselves about to be removed."],
    v: "Decommission an executor holding cached partitions and shuffle files, and confirm they appear on other executors, no stage is resubmitted and the executor exits cleanly.",
    dep: ["block-manager", "shuffle-file-layout", "executor-loss"]
  },
  "preemptible-nodes": {
    s: "Using discounted machines that the provider can reclaim on short notice, in return for tolerating frequent executor loss.",
    d: "Preemptible or spot capacity costs far less but can disappear with a short warning. Batch engines suit it because lineage recomputation tolerates loss, as long as the lost work is small. Good designs keep the driver and shuffle storage on reliable machines, spread executors across zones, request many small executors, decommission on warning and do not count preemption against failure limits. It is hard because mass reclamation can remove most of a cluster in minutes and force heavy recomputation of long shuffle chains.",
    k: ["Reliable machines for drivers and shuffle vs all preemptible: reliable pieces protect the expensive state, but cost more per hour.", "Many small preemptible executors vs few large: small limit the loss per event, but raise overhead and per-task fetch counts."],
    p: ["Shuffle data stored only on preemptible machines is lost together with them, causing recomputation of the whole job.", "A large reclamation event repeatedly resets progress of a job that needs hours."],
    v: "Reclaim half of the preemptible executors during a long job and confirm the job completes, the recomputed task share is small, and preemptions are not counted toward failure limits.",
    dep: ["graceful-decommission", "executor-loss", "lineage-recomputation"]
  },
  "dependency-packaging": {
    s: "Delivering the application's code, libraries and runtime to every executor, as archives, container images or environments.",
    d: "Executors need the program's code and the libraries it calls, at compatible versions, plus a runtime for any other-language workers. Methods include uploading archives to each executor at start, referencing shared storage and building container images that contain everything. Images give reproducibility but make start slow if large. It is hard because conflicts between the engine's own libraries and the user's produce class loading errors only on the cluster, and native dependencies must match the machine's operating system.",
    k: ["Container images vs per-job archives: images give a reproducible environment, but are heavy to rebuild and distribute, while archives are quick to change but depend on node setup.", "Isolated class loading of user libraries vs shared: isolation avoids version conflicts, at the cost of memory and some compatibility issues."],
    p: ["A library version used locally differs from the executors' and fails only for some tasks.", "A large image pulled by hundreds of nodes at once saturates the registry and delays startup."],
    v: "Submit a job using a library absent from the base image, and confirm every executor loads the packaged version, reports its version identically and the job result equals the local run.",
    dep: ["cluster-manager-interface", "job-submission"]
  },
  "container-limits": {
    s: "The hard caps on memory and CPU the cluster manager enforces on each executor container, beyond which the process is throttled or killed.",
    d: "Memory limits kill the container on excess, with no warning. CPU limits throttle instead, so a task using more than its share is slowed, not stopped. Disk and network may also be limited. The engine must size its heap, overhead and worker memory to fit within the limit with margin, and its task parallelism to the CPU allotment. Limits provide isolation between tenants, but create sharp failure modes for tasks whose memory use varies by data.",
    k: ["Strict hard limits vs soft limits with overcommit: hard limits isolate tenants cleanly, while overcommit packs more work but risks node-wide pressure.", "CPU shares vs hard CPU quota: shares let a job use idle CPU, while a quota gives predictable speed but wastes idle capacity."],
    p: ["A container killed for memory is reported only as exit code 137, and the real cause, a worker process, is missed.", "CPU throttling makes tasks slow and unpredictable, and looks like skew."],
    v: "Run a task that exceeds its container memory limit and confirm the kill reason is visible in the manager and driver logs, and that raising limits by the measured excess stops the kills.",
    dep: ["resource-profiles", "queues-and-quotas"]
  },
  "queues-and-quotas": {
    s: "Cluster-level division of capacity among teams or workloads, with guaranteed and maximum shares, priorities and preemption of those over their share.",
    d: "The resource manager organizes applications into hierarchical queues, each with a guaranteed minimum, a maximum and a priority. Idle capacity can be borrowed by others, and borrowed capacity is reclaimed, by waiting or by preempting containers, when the owner needs it. Admission and fairness rules decide who gets scarce resources. It is hard because preemption kills work in progress, shares must reflect real organizational priorities and mistakes starve teams or waste capacity.",
    k: ["Guaranteed minimum with borrowing vs hard partitions: borrowing uses idle capacity, but reclaim preempts work, while hard partitions never interfere and waste capacity.", "Preempt immediately vs wait for tasks to finish: immediate honors guarantees fast, but wastes partial work."],
    p: ["A queue with a tiny maximum makes a critical job wait hours while the cluster is idle.", "Constant preemption between two queues makes neither finish its jobs."],
    v: "Fill the cluster from one queue, submit work to a second with a guarantee, and confirm it receives its guaranteed capacity within the configured time and the first queue is reduced to its remainder.",
    dep: ["cluster-manager-interface"]
  },
  "data-source-api": {
    s: "The plug-in interface that lets any storage system supply schema, partitions, a reader and optionally accept filters, columns and writes.",
    d: "A source implements a small set of capabilities: report a schema, list its input partitions, create a reader for each partition, and optionally accept pushed filters, required columns, limits and aggregates. Sinks implement writes with a commit protocol. The engine calls these during planning and execution. A narrow interface makes adding formats easy, while a rich one lets sources do more work themselves. It is hard because pushdown capabilities differ, semantics of pushed filters must be exact, and sources must report which pushed predicates they only partly applied.",
    k: ["Rich pushdown interface vs minimal read-only one: rich lets sources reduce data at the storage layer, but each capability is more to implement correctly.", "Source reports unhandled filters vs engine always re-applies: reporting avoids redundant work, while always re-applying is safe against buggy sources."],
    p: ["A source claims to apply a filter exactly but only uses statistics, returning extra rows that are never rechecked.", "Partition listing for a huge table runs on the driver and blocks planning for minutes."],
    v: "Implement a test source that records which filters and columns it receives, run a query with a filter and projection, and confirm the recorded pushdowns match the query and the result equals an unpushed run.",
    dep: ["schema-and-types"]
  },
  "columnar-formats": {
    s: "File formats that store each column's values together with per-block statistics, so queries read only the needed columns and skip blocks that cannot match.",
    d: "Rows are grouped into row groups, and within each group each column is stored contiguously, encoded with dictionaries, run lengths or bit packing, and compressed. A footer holds the schema and, for each group and column, minimum, maximum and null counts, and sometimes Bloom filters. A reader fetches the footer, picks groups and columns needed and reads only those byte ranges. It is hard because writer choices, such as row group size and sort order, decide how well skipping works, and nested data needs special encoding.",
    k: ["Large row groups vs small: large compress better and reduce per-group overhead, but skip less precisely and need more memory to write.", "Sort data on a filter column at write vs leave unordered: sorting makes min and max statistics selective, but adds write cost and fits one filter column only."],
    p: ["Unsorted data gives every row group the full min and max range, so no group is ever skipped.", "Millions of tiny files each with a footer make reading dominated by metadata."],
    v: "Read a sorted column filtered to one percent of values and confirm the reader skips about 99% of row groups, reads only the requested columns' byte ranges and returns the same rows as a full scan.",
    dep: ["compression-codecs", "schema-and-types"]
  },
  "row-formats": {
    s: "File formats that store whole records one after another, such as delimited text, line-delimited JSON and binary record files, good for ingestion and interchange but weak for analytics.",
    d: "Text formats are universal and human readable but need parsing for every value and carry no types or statistics. Binary record formats with embedded schemas are compact and support evolution, and suit streaming writes and row-at-a-time processing. Neither lets a reader skip columns. Splittability depends on the format and compression: line-based text can be split at newline boundaries, but some whole-file compression cannot be split at all, which forces one task per file.",
    k: ["Text interchange vs binary records: text is universal and debuggable, while binary is smaller, typed and faster to parse.", "Infer schema from data vs declare it: inference is convenient, but costs an extra pass and can mistype columns."],
    p: ["A single large compressed text file that cannot be split is processed by one task for hours.", "Embedded newlines or delimiters in values break line-based splitting and corrupt records."],
    v: "Read a 50 GB file in a splittable format and an unsplittable compressed one, and confirm the first runs as hundreds of parallel tasks and the second as one task.",
    dep: ["compression-codecs", "split-planning"]
  },
  "split-planning": {
    s: "Dividing input files into byte ranges, one per task, aligned to record or block boundaries and sized to balance task duration against overhead.",
    d: "The planner lists the files, then cuts each into splits of a target size, typically a block size, merging small files into one split and ignoring ranges outside required row groups. Readers handle records that straddle split boundaries by consistent rules, such as the task owning a record starting in its range. It determines the number of input partitions and thus parallelism. It is hard because listing a huge directory in an object store is slow, the file size distribution is uneven and cost per byte differs by format.",
    k: ["Splits at fixed byte size vs by row group: byte splits are simple, while row-group splits align with format structure and avoid reading across.", "Combine small files into one split vs one per file: combining cuts task count and overhead, but ignores locality and per-file setup costs."],
    p: ["Listing millions of files on the driver makes planning slower than the query.", "One huge splittable file and thousands of small ones give heavily uneven tasks."],
    v: "Plan input over a directory with 100,000 small files and 100 large ones, and confirm small files are combined to approach the target split size, task count is a small fraction of file count, and task input sizes are roughly even.",
    dep: ["data-source-api", "object-store-connector", "partition-count"]
  },
  "partition-discovery": {
    s: "Reading directory layouts such as region=eu/date=2026-01-01 as partition columns, and pruning directories that a filter excludes before any file is opened.",
    d: "Tables are commonly laid out in directories named by column values. The engine discovers these names, adds them as columns and, when a query filters on them, lists only matching directories. This is the cheapest and largest skip available. Partition values are inferred or taken from the catalog. The hard parts are scale and design: too many partition columns or high-cardinality values make millions of tiny directories and files, listing becomes slow, and types inferred from directory names can be wrong.",
    k: ["Directory partitioning vs file-level statistics only: directories prune before listing and are very cheap, but make many small files when over-partitioned, while statistics need reading file footers.", "Catalog-registered partitions vs filesystem discovery: the catalog is fast and exact, but can drift from the files, while discovery is always accurate but slow."],
    p: ["Partitioning by a high-cardinality column creates millions of directories with tiny files.", "A partition value inferred as an integer from a directory name loses leading zeros."],
    v: "Query a table partitioned by date with a filter on one day, and confirm only that day's directory is listed and read, according to the scan metrics, and the result equals a full scan with the filter applied.",
    dep: ["metastore-catalog", "split-planning", "data-source-api"]
  },
  "compression-codecs": {
    s: "The algorithms that shrink stored and shuffled data, trading CPU time against bytes, with differing speed and whether compressed files can be split for parallel reads.",
    d: "Fast codecs give moderate reduction with little CPU and suit shuffle and spill. Slower codecs give higher ratios and suit data stored for a long time. Whether a file can be read in parallel depends on codec and container: block-based compression inside a columnar or record file keeps splittability, while whole-file compression of text does not. Codec choice affects I/O bound versus CPU bound behavior: on a fast network, heavy compression can slow a job.",
    k: ["Fast codec vs high-ratio codec: fast keeps CPU low and suits intermediate data, while high ratio saves storage and network on cold data.", "Compress per block inside the file vs the whole file: per-block keeps files splittable, while whole-file gets a better ratio but forces single-task reads."],
    p: ["Choosing a high-ratio codec for shuffle data makes the job CPU bound with idle network.", "Whole-file compression on a large text file removes all parallelism."],
    v: "Write the same data with three codecs and compare file size, write time and scan time, and confirm that only block-compressed outputs are read by multiple tasks.",
    dep: []
  },
  "table-format-integration": {
    s: "Reading and writing tables whose metadata layer tracks the exact file list, giving atomic commits, snapshots and schema history on top of plain files.",
    d: "A table format keeps a log or manifest of which files belong to each version of the table. A reader plans from the manifest instead of listing directories, and sees a consistent snapshot even while writers work. Writers add files and then commit by atomically publishing a new manifest, which gives transactions, time travel and safe concurrent appends. The engine integrates through the source API, pushing file statistics from the manifest into planning. It is hard because concurrent writers need conflict detection and old files need careful cleanup.",
    k: ["Manifest-based table state vs directory listing: manifests give consistency and fast planning, but need a commit protocol and maintenance such as compaction.", "Optimistic concurrency vs locking: optimistic allows many writers and retries on conflict, while locking is simple but blocks."],
    p: ["Cleaning up old files while a long query still reads an old snapshot makes the query fail.", "Many small commits create huge manifests that slow planning."],
    v: "Start a long read, commit a new version from another job, and confirm the read finishes on its original snapshot, while a new read sees the new version, and neither sees partial files.",
    dep: ["data-source-api", "output-commit", "schema-evolution"]
  },
  "object-store-connector": {
    s: "The client layer that lets the engine read and write buckets in an object store through a file-like interface, hiding eventual consistency, request latency and the lack of rename.",
    d: "Object stores offer put, get by range, list and delete, with high throughput but per-request latency, request rate limits and, historically, listing that lags writes. The connector maps file operations onto these, issues parallel range reads, prefetches, retries throttled requests and implements directory semantics with prefixes. Rename is a copy and delete, which is slow and not atomic, which is why dedicated output committers exist. It is hard because behavior differs from a real file system in ways that break assumptions silently.",
    k: ["Many small range requests vs fewer large reads: small requests fetch only what is needed, but pay latency each time, while large reads waste bytes but are faster for scans.", "Treat the store as a file system vs use its native semantics: a file-system view is compatible with existing code, but hides non-atomic operations."],
    p: ["Request rate throttling at high parallelism causes slow tasks and retries.", "A listing that omits a recently written file makes a job miss data."],
    v: "Read a 10 GB file with parallel range requests and confirm throughput approaches the network limit, with retries on injected throttling errors, and that listing after write returns every file written.",
    dep: ["compression-codecs"]
  },
  "database-connectors": {
    s: "Readers and writers that move data between the engine and relational databases over their wire protocol, splitting reads into parallel queries.",
    d: "A connector reads a table by issuing several queries, each for a range of a numeric or date column, one per task, and optionally pushes filters and projections into the query text. Writes use batched inserts or bulk loading. It is a bridge to operational data, but it also concentrates load: dozens of parallel tasks hit a database that was not built for analytical scans. Hard parts include choosing split columns, type mapping, consistent snapshots across separate queries and not overwhelming the source.",
    k: ["Parallel range queries vs a single connection: parallel is faster, but multiplies load on the source and may read inconsistent data across ranges.", "Push filters to the database vs filter in the engine: pushdown transfers less data, but only for expressions the database supports."],
    p: ["Parallel scans on a production database slow the application it serves.", "Reading ranges at different times while rows change yields duplicates or gaps."],
    v: "Read a table with eight parallel ranges, and confirm each range returns disjoint rows summing to the total count, with the database's connection count limited to eight and filters visible in its query log.",
    dep: ["data-source-api", "schema-and-types"]
  },
  "schema-evolution": {
    s: "Reading files and tables whose schema changed over time: columns added, dropped, renamed or retyped, so old and new data work together.",
    d: "Files written last year may lack columns that files written today have, or store a column with a different type. Readers merge schemas, filling missing columns with nulls or defaults and promoting compatible types. Formats and table layers track columns by id rather than name to survive renames. The engine must decide a unified schema at planning, which can need reading many footers. It is hard because some changes are not compatible, name-based matching misreads renames, and merging can be costly or ambiguous.",
    k: ["Match columns by name vs by id: names are simple, but break on rename, while ids are robust but need support from the format and table layer.", "Merge schemas across all files vs use the latest: merging reads everything and is complete, while the latest is fast but may drop old columns."],
    p: ["A renamed column is read as a new column full of nulls for older files.", "A type change from integer to string is applied to some files only and fails in mid-job."],
    v: "Write three generations of files with an added column and a widened type, read them together and confirm every file's rows appear, missing values are null and widened values are correct.",
    dep: ["schema-and-types", "columnar-formats"]
  },
  "output-writers": {
    s: "The task-side code that encodes rows into files, chooses file names and partition directories, and controls file sizes and sort order of the result.",
    d: "Each task writes its partition's rows into one or more files, in a chosen format and codec, split into dynamic partition directories by column values and sometimes into buckets. Writers buffer rows into row groups, collect statistics, and report file paths to the commit protocol. The number and size of output files follows from task count and partitioning, so one stage with many partitions and many directory values can generate a huge number of tiny files. Controlling that, by repartitioning before write, is a recurring task.",
    k: ["Repartition before write for fewer larger files vs write as is: repartitioning gives tidy files at the cost of a shuffle, while writing as-is is fast but fragments output.", "Sort within files vs unordered: sorted files improve later skipping, but cost sort time at write."],
    p: ["Every task writes a file to every partition directory, producing tasks times directories tiny files.", "A writer that fails after finishing some files leaves them behind without the commit protocol."],
    v: "Write a partitioned table from 1,000 tasks and 100 directories, and confirm file count matches expectations. Then repartition by the partition column first and confirm file count drops to near the directory count with correct rows.",
    dep: ["columnar-formats", "output-commit", "compression-codecs", "partitioner"]
  }
});
