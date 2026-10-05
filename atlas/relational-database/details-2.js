// Details part 2: optimizer and executor.
ATLAS.details("relational-database", {
  "statistics-collection": {
    s: "Samples table contents to record row counts, distinct counts, null fractions and value distributions that the optimizer relies on to estimate how many rows each step returns.",
    d: "An analyze operation reads a random sample of pages and rows rather than the whole table, computes per-column statistics, and stores them in the catalog. Multi-column statistics can capture correlation and functional dependencies. Collection is triggered manually or by the maintenance scheduler after enough rows change. Sampling is the challenge: a fixed sample misjudges skewed or clustered data, distinct-count estimation from samples is notoriously error-prone, and statistics go stale between runs while plans keep using them.",
    k: ["Sampled rather than full scans: keeps collection cheap on huge tables, but rare values and distinct counts are estimated with error.", "Optional multi-column statistics: fix correlated-column misestimates, but must be defined deliberately and cost more to maintain."],
    p: ["Bulk loading without refreshing statistics leaves the optimizer believing the table is empty and choosing nested loops.", "Sampling on a physically ordered table can mistake clustering for uniform distribution."],
    v: "Load ten million rows with a skewed column, run analysis, and confirm catalog row count, null fraction and distinct estimates are within a small error of the true values from a full scan.",
    dep: ["system-catalog", "heap-files"]
  },
  "histograms-and-mcvs": {
    s: "Per-column summaries of value distribution: a list of the most common values with frequencies plus equal-population histogram buckets for the rest.",
    d: "For each column, collection stores the most frequent values with their fractions, then divides remaining values into buckets of equal row count with boundaries. To estimate a predicate, the optimizer looks up the value in the common list, or interpolates within a bucket for ranges. Correlation with physical order is also stored for index cost. Limits include a bounded number of buckets, loss of detail at the tails, and no knowledge of how columns relate to each other.",
    k: ["Common-values list plus histogram: precise for skewed hot values, approximate elsewhere, with accuracy bounded by a configurable target size.", "Equal-height rather than equal-width buckets: adapts to skew, but interpolation inside a wide bucket still guesses uniformity."],
    p: ["A parameter that is rare at plan time but common at execution runs with a plan sized for the wrong value.", "Column values differing only past a truncation limit look identical in the histogram."],
    v: "Query for a hot value and a rare value on a skewed column, and confirm the estimated row counts in the plan differ accordingly and each is within a factor of two of actual counts.",
    dep: ["statistics-collection"]
  },
  "cardinality-estimation": {
    s: "Predicts how many rows each operator will produce by combining predicate selectivities and join size estimates, the single most influential input to plan choice.",
    d: "For each filter the estimator derives a selectivity from statistics; for conjunctions it usually assumes independence and multiplies; for joins it uses distinct counts, estimating output as input sizes divided by the larger distinct count. Errors compound with every operator, so a small base error becomes orders of magnitude at the top of a deep plan. Remedies include multi-column statistics, sampling at plan time, and adaptive execution that re-plans using observed counts.",
    k: ["Independence assumption between predicates: cheap and usually adequate, but badly wrong for correlated columns, which the optimizer cannot detect without extra statistics.", "Estimating from stored statistics versus sampling at plan time: sampling adapts to current data, but adds latency to every plan."],
    p: ["Correlated filters such as city and postal code multiply into a far-too-small estimate, leading to nested-loop joins on huge inputs.", "Estimates for expressions over columns fall back to generic defaults, hiding real selectivity."],
    v: "Compare estimated and actual row counts for each plan node over a representative workload and flag nodes off by more than ten times. After adding multi-column statistics, confirm the flagged estimate converges.",
    dep: ["histograms-and-mcvs", "statistics-collection"]
  },
  "cost-model": {
    s: "Converts a plan's estimated work into a comparable number using weights for sequential and random page reads, per-row CPU, per-operator overhead and memory use.",
    d: "Each operator has a cost formula taking estimated input rows and widths: pages fetched, tuples processed, comparisons performed, plus a startup cost before the first row and a total cost. Parameters weight random reads more than sequential ones and CPU less than I/O, and are meant to reflect the hardware. The model ignores much: concurrency, cache state, and interference. Its goal is ranking plans correctly, not predicting time, and tuning constants to storage that is mostly cached matters greatly.",
    k: ["Startup versus total cost: lets the optimizer favor plans that return first rows fast for limits and cursors, at the cost of more complex bookkeeping.", "Fixed cost constants rather than measured ones: stable plans across runs, but wrong for storage whose random-read cost differs from the defaults."],
    p: ["Defaults assume slow random reads, so on fast flash storage the optimizer avoids useful index scans.", "Ignoring cache state makes a hot table look as expensive as a cold one."],
    v: "Run EXPLAIN with analyze across queries of different sizes and confirm plan cost rank-correlates with measured time. Change the random-read weight and confirm plans shift between index and sequential scans at a sensible selectivity.",
    dep: ["cardinality-estimation"]
  },
  "join-ordering": {
    s: "Chooses the order in which tables are joined, and which join algorithm each step uses, searching an exponential space of equivalent plans.",
    d: "Join order changes intermediate result sizes by orders of magnitude. For small queries, dynamic programming over subsets finds the best left-deep or bushy tree. Beyond a threshold the search switches to heuristics or randomized search such as genetic methods. Outer joins restrict legal reorderings, and join predicates implied by equivalence classes enable extra join paths. It is hard because search time grows exponentially while estimation errors may make the cheapest-looking order a poor one.",
    k: ["Exhaustive dynamic programming for small joins and heuristic search for large: optimal when affordable, but plans for many-table queries are not guaranteed good.", "Considering bushy as well as left-deep trees: finds better plans for some queries, at much larger search cost."],
    p: ["A twenty-table query spends longer planning than executing when the exhaustive search threshold is set too high.", "Query text order affects the result when heuristic search falls back, making plans unstable between near-identical statements."],
    v: "Join a fact table to five dimensions with selective filters and confirm the plan joins the most selective filters first. Increase table count past the search threshold and confirm planning time stays bounded.",
    dep: ["cost-model", "cardinality-estimation", "access-path-selection"]
  },
  "access-path-selection": {
    s: "For each table in a query, picks how to read it: sequential scan, an index scan, an index-only scan, a bitmap scan, or a combination of several indexes.",
    d: "The planner enumerates candidate paths, matching predicates and sort requirements to each index, estimates the pages and rows each touches, and keeps the cheapest, along with any ordered path that could avoid a later sort. Bitmap scans combine several indexes by building a sorted set of row locations first. Index-only scans consult the visibility map to skip table access. It is hard because the break-even between index and sequential reading depends on selectivity, row clustering and cache.",
    k: ["Bitmap scans between index and sequential access: reduce random I/O by visiting pages in order, but lose index ordering and need memory for the bitmap.", "Keeping paths that provide useful ordering even if costlier: can eliminate a sort later, but widens the search."],
    p: ["Stale statistics make a low-selectivity predicate look selective and trigger thousands of random reads.", "An index-only scan on a heavily updated table degrades because the visibility map has many unset pages."],
    v: "Run the same filter at selectivities of 0.01, 1, 20 and 80 percent and confirm the plan moves from index scan to bitmap scan to sequential scan near the cost model's predicted break-even.",
    dep: ["cost-model", "btree-index", "visibility-map"]
  },
  "partition-pruning": {
    s: "Eliminates partitions that cannot contain matching rows, at plan time using constants and at execution time using parameters or join values, so queries touch only relevant data.",
    d: "Given the partition bounds in the catalog and the query's predicates on the partition key, the planner proves some partitions irrelevant and excludes their scans. When values are unknown until run, such as parameters or values from an outer join side, pruning is repeated at executor startup or during execution. The difficulty is proof: predicates over functions of the key, ORs, and implicit casts defeat pruning, and plans with thousands of partitions spend real time in planning.",
    k: ["Plan-time plus run-time pruning: handles both literals and parameters, but run-time pruning means the plan still lists every partition.", "Pruning from partition bounds only, not statistics: reliable and cheap, but it cannot skip partitions on non-key predicates."],
    p: ["Wrapping the partition key in a function or cast in the filter prevents pruning and scans every partition.", "Prepared plans with many partitions carry lock and memory cost for all of them, even when most are pruned."],
    v: "Query a table of 365 daily partitions for one day with a literal and then a parameter, and confirm the plan or execution statistics show a single partition scanned in both cases.",
    dep: ["table-partitioning", "access-path-selection"]
  },
  "plan-cache": {
    s: "Remembers plans for repeated statements, keyed by normalized text and settings, to avoid replanning, and invalidates them when schema or statistics change.",
    d: "Caches are typically per session for prepared statements, though some are shared across sessions. A cached plan records its dependencies, and DDL or statistics changes invalidate it. Because a plan built for one parameter value may be poor for another, systems generate custom plans for the first few executions, compare their cost to a generic plan, and switch to the generic one if it is no worse. Hard parts are invalidation correctness and parameter-sensitive plans.",
    k: ["Generic plans reused across parameter values: eliminate planning cost on hot paths, but can be very wrong for skewed parameters.", "Per-session versus shared cache: per-session needs no cross-session locking, shared saves memory and planning across clients."],
    p: ["A plan fast for a common parameter is reused for a rare, expensive one and runs for minutes.", "Missed invalidation after an index drop makes a cached plan fail or silently use an obsolete path."],
    v: "Execute a prepared statement with a hot value six times and a rare value afterward, and confirm the plan type (custom or generic) in the statement info. Drop an index and confirm the next execution replans.",
    dep: ["prepared-statements", "cost-model", "system-catalog"]
  },
  "prepared-statements": {
    s: "Separates parsing and planning from execution, letting a client send a statement once and execute it repeatedly with different bound parameters.",
    d: "A prepare step parses and analyzes the statement, with parameter types inferred or declared. Execute binds values and either runs a cached plan or plans for the supplied values. Parameters are typed values, not text, which removes injection risk and conversion ambiguity. Server-side statements live in the session, which complicates pooling, so some clients use client-side preparation. Costs and benefits depend on whether planning is the dominant cost or the plan quality for variable parameters is.",
    k: ["Server-side prepare: saves parse and plan time and passes parameters safely, but ties state to one session.", "Parameter types inferred at prepare: convenient, but an ambiguous type can pick an unintended overload or cast."],
    p: ["Transaction-pooled connections lose or collide prepared statement names between clients.", "Interpolating values into text instead of binding them defeats both caching and injection safety."],
    v: "Prepare once and execute ten thousand times with varied values, confirm parse and analyze counts stay at one, then attempt an injection string as a parameter and confirm it is treated purely as a value.",
    dep: ["analyzer-and-binder", "wire-protocol", "session-state"]
  },
  "iterator-model": {
    s: "The classic execution model in which every operator exposes a next-row call that pulls rows from its children, so a plan runs as a tree of composable operators.",
    d: "Each operator implements open, next and close. The root pulls rows from children on demand, which makes pipelining natural: a filter above a scan never materializes anything. Pipeline breakers such as sort or hash build consume their entire input first. The model is simple, supports early termination for limits, and lets any operator combine with any other. Its cost is a function call and branch per row per operator, which dominates CPU for analytical queries.",
    k: ["Pull-based row-at-a-time operators: simple, composable and lazy so limits stop early, but per-row call overhead limits CPU throughput.", "Pipeline breakers materialize inputs: required by sort and hash build, and they decide where memory is needed."],
    p: ["Operators that hold resources open past the last needed row keep locks or buffers pinned.", "Rescans of an inner subtree without caching repeat expensive work for every outer row."],
    v: "Run a query with a limit of ten over a billion-row scan and confirm it returns immediately with almost no rows read, showing that operators pipeline and stop on demand.",
    dep: []
  },
  "vectorized-execution": {
    s: "Processes batches of hundreds or thousands of values per call, often in columnar layout, to amortize interpretation overhead and use CPU vector instructions and caches.",
    d: "Instead of one row per call, operators exchange batches where each column is a contiguous array and a selection vector marks live rows. Tight loops over typed arrays run branch-free and use SIMD. Expression evaluation compiles to type-specialized kernels or generated code. Row-store engines may add vectorized scan and aggregate nodes beside the iterator model. Complexity comes from nulls, variable-length data, converting between row and batch forms and supporting every operator and type.",
    k: ["Batch-at-a-time with selection vectors: several times higher throughput on scans and aggregates, but harder to implement per operator and type.", "Compiled versus interpreted expressions: compilation removes interpretation overhead, but adds compile latency that hurts short queries."],
    p: ["Compilation time exceeds execution time for a short query, making compiled mode slower overall.", "Falling back to row mode for one unsupported operator forces expensive conversions mid-plan."],
    v: "Run the same aggregation over one hundred million rows in row and batch modes, and confirm identical results with the batch mode substantially faster, while a point lookup shows no regression.",
    dep: ["iterator-model", "expression-evaluation"]
  },
  "expression-evaluation": {
    s: "Evaluates scalar expressions in filters, projections and join conditions, including arithmetic, comparisons, functions, casts and null handling, against each row or batch.",
    d: "The planner compiles each expression to a compact tree or bytecode program, with constants folded and common subexpressions identified. The evaluator walks it for each row, resolving column references into slots, calling type-specific operator functions, and applying three-valued logic with short-circuiting. Some engines generate native code for hot expressions. Difficulties: preserving exact semantics for overflow, collation and null, avoiding allocation per row, and making volatile functions evaluate exactly as many times as the query requires.",
    k: ["Short-circuit evaluation: skips unneeded work, but forbids relying on side effects or errors in the skipped branch.", "Marking functions by volatility: lets the planner fold and reorder immutable ones, but wrong declarations produce incorrect results."],
    p: ["A function wrongly declared immutable is folded to one value at plan time and used for every row.", "Divide-by-zero or cast errors surface from expressions the optimizer evaluated earlier than the author expected."],
    v: "Evaluate nulls, overflow, short-circuit and volatile-function cases through filters and projections, and confirm results match the language specification and that a volatile function runs once per row.",
    dep: ["type-coercion"]
  },
  "sequential-scan": {
    s: "Reads every page of a table in physical order, applying filters to each row, the fallback access path and the fastest way to read a large fraction of a table.",
    d: "The scan walks pages of the heap file in order, pins each page, checks visibility of every tuple against the query snapshot, evaluates predicates, and returns matching rows. Reading in order allows prefetching and uses a small ring of buffers so a large scan does not evict the whole cache. Concurrent scans of the same table can share a position to share I/O. Its cost is proportional to table size regardless of selectivity.",
    k: ["Ring buffer for large scans: protects the cache from being flushed by one scan, but the scan's pages are not retained for the next one.", "Synchronized scans: let concurrent queries share a single pass of I/O, but results appear in a different physical order each time."],
    p: ["Relying on scan order for results breaks when synchronized scans start in the middle of the table.", "A table full of dead row versions is read in full even when almost nothing is visible."],
    v: "Scan a table ten times the size of the cache and confirm cache hit rates for other tables are barely affected, and that two concurrent scans together read the table's pages about once.",
    dep: ["heap-files", "buffer-pool", "snapshot-management", "prefetching"]
  },
  "index-scan": {
    s: "Uses an index to find matching row locations, then fetches each row from the table, or answers from the index alone when all needed columns are present.",
    d: "The executor descends the index with a search key, iterates matching entries in index order, and for each follows its row pointer into the heap, pinning that page and checking visibility. Because index entries do not carry version visibility in many designs, an index-only scan consults a per-page flag to skip the heap. Random row fetches are the cost: on an unclustered table each match can hit a different page. Ordered output can eliminate a later sort.",
    k: ["Heap fetch for each match: keeps indexes small and independent of row versions, at the cost of random I/O proportional to matches.", "Index-only scans guided by a visibility map: avoid table reads on stable data, but degrade as tables churn without cleanup."],
    p: ["Fetching a large fraction of rows through an index is far slower than a sequential scan.", "Rows found in the index but already dead in the heap produce wasted fetches until cleanup runs."],
    v: "Run a range query returning 0.1 percent of rows with and without a covering index, and confirm the plan reports no heap fetches for the covering case after cleanup has run on the table.",
    dep: ["btree-index", "heap-files", "visibility-map", "snapshot-management"]
  },
  "nested-loop-join": {
    s: "For each row of the outer input, probes the inner input for matches, typically through an index lookup; the best join when the outer side is small.",
    d: "The operator reads one outer row, rescans or probes the inner side with the join key, and emits matching combinations, handling inner, outer, semi and anti variants. With an index on the inner key, cost is outer rows times a logarithmic lookup. Without one it is a full product. Variants cache inner results or batch outer rows into blocks. It supports any join condition, including inequalities, which hash and merge joins cannot.",
    k: ["Parameterized inner index probe: excellent for few outer rows and for latency, but scales linearly with outer size and can explode on a bad estimate.", "Supports arbitrary join predicates: needed for non-equality joins, though these may require a full product."],
    p: ["An underestimated outer side makes a nested loop run millions of probes where a hash join would take seconds.", "A missing index on the inner join key turns the join into a product of both table sizes."],
    v: "Join ten outer rows to a large indexed table and confirm one index probe per outer row. Remove the inner index and confirm the planner switches algorithm instead of using an unindexed nested loop.",
    dep: ["index-scan", "iterator-model"]
  },
  "hash-join": {
    s: "Builds an in-memory hash table on the smaller input and probes it with each row from the larger input; the standard choice for equality joins on large sets.",
    d: "The build phase consumes the smaller input into buckets keyed by the join columns, then the probe phase streams the other input, hashing each row to find matches. When the build side exceeds memory, both inputs are partitioned by hash into batches written to disk and joined batch by batch, with hybrid variants keeping the first batch resident. Cost is linear in both inputs. It is limited to equality conditions, and skew in the join key can overload one partition.",
    k: ["Build on the smaller side: minimizes memory, but depends on cardinality estimates that may pick the wrong side.", "Partitioned batches when memory is exceeded: let the join finish at any size, at the price of writing and rereading both inputs."],
    p: ["A heavily skewed key sends most rows to one batch, which still does not fit in memory and spills repeatedly.", "Underestimating the build side leads to far more batches than planned and slow multi-pass joins."],
    v: "Join a million-row table to a hundred-million-row table with the build side fitting in memory, then shrink the memory budget and confirm the join still completes with batched spilling and identical results.",
    dep: ["spill-to-disk", "iterator-model", "cardinality-estimation"]
  },
  "merge-join": {
    s: "Joins two inputs already sorted on the join key by advancing through both in step; efficient for very large inputs and when sorted order is available for free.",
    d: "Both inputs must be ordered by the join columns, either from index scans or explicit sorts. The operator walks them together, emitting matches and buffering groups of equal keys to handle duplicates, and also supports outer and full joins naturally. Its cost is one pass over each side plus any sort. It can win when inputs are pre-sorted, when the output must be ordered anyway, or when memory is too small for a hash table.",
    k: ["Requires sorted input: free if an index delivers order, otherwise an extra sort that often makes hash join cheaper.", "Naturally handles full outer joins and ordered output: a single pass serves both, but duplicate-heavy keys force buffering groups."],
    p: ["A large group of duplicate keys on both sides forces buffering and can degrade to a product.", "Sorting both inputs for a merge join that the optimizer chose from a poor estimate wastes more than a hash join would."],
    v: "Join two tables with indexes on the join key and an order-by on it, and confirm the plan uses merge join with no explicit sort and produces ordered output in one pass.",
    dep: ["sorting", "index-scan", "iterator-model"]
  },
  "aggregation": {
    s: "Computes grouped summaries and global aggregates using either a hash table of groups or by streaming over sorted input, including distinct and ordered aggregates.",
    d: "Hash aggregation keeps a table of group keys and running transition states, and emits when input ends; it spills partitions to disk when the groups exceed memory. Sorted aggregation consumes input ordered by group key and emits each group as it ends, using constant memory. Aggregates are defined by an initial state, a transition function and a final function, plus a combine function that lets partial results from parallel workers merge. Distinct and ordered-set aggregates need extra sorting.",
    k: ["Hash versus sorted aggregation: hash needs no input order but memory scales with group count, sorted uses constant memory but needs ordered input.", "Partial then final aggregation: lets parallel workers and pre-aggregation reduce data early, but requires a valid combine function."],
    p: ["High-cardinality grouping on a poor estimate gives a huge hash table and spills or runs out of memory.", "A user-defined aggregate without a combine function silently disables parallel plans."],
    v: "Group ten million rows into one million groups with a small memory budget and confirm results match a sorted-aggregate run, with spilled partitions reported in the execution statistics.",
    dep: ["sorting", "spill-to-disk", "expression-evaluation"]
  },
  "sorting": {
    s: "Orders rows for order-by, merge joins, distinct and index builds, using in-memory quicksort-style methods for small inputs and external merge sort for large ones.",
    d: "Rows are collected into a memory budget and sorted; if they fit, the result is returned directly. Otherwise sorted runs are written to temporary files and merged, possibly in several passes depending on the number of runs and merge fan-in. With a limit, a bounded heap keeps only the top rows. Key comparison uses type and collation rules and is the hot loop, so keys are often normalized into byte strings. Cost depends heavily on memory.",
    k: ["Top-N heap for limit queries: avoids sorting everything, but only helps when the limit is small relative to input.", "Normalized byte-comparable keys: make comparisons fast and branch-free, at the cost of extra key construction and space."],
    p: ["Sorting by a collation-aware text key is many times slower than by integer, surprising teams that order by text.", "A sort that does not fit in memory silently becomes a multi-pass disk sort and dominates query time."],
    v: "Sort fifty million rows with ample memory and then with memory capped at one percent of data, and confirm identical output, with the second reporting external merge passes and a longer but bounded runtime.",
    dep: ["spill-to-disk", "type-coercion"]
  },
  "spill-to-disk": {
    s: "Lets memory-hungry operators such as sort, hash join and aggregation continue past their memory budget by writing partitions or runs to temporary files and processing them in pieces.",
    d: "Each operator has a budget. When the in-memory structure exceeds it, the operator writes some data to temporary files in a format optimized for sequential access, optionally compressed, then rereads and processes it later. Hash operators partition by hash and recurse, while sort writes sorted runs for merging. Temporary files are tracked per session, cleaned on error and subject to disk quotas. The difficulty is that spilling transforms a query from memory-bound to I/O-bound, and the planner must predict it.",
    k: ["Spill rather than fail when over budget: queries always finish, but performance can drop by an order of magnitude.", "Per-operator budgets rather than one pool: simple to enforce and reason about, but a plan with many operators can exceed physical memory in total."],
    p: ["Temporary files fill the disk when many sessions spill huge queries simultaneously, and running transactions fail.", "Orphaned temporary files remain after a crash unless startup cleans the temp area."],
    v: "Run a large join under a small memory budget, check execution statistics for batches written and read, and confirm all temporary files are removed on completion, on cancellation and after a server restart.",
    dep: ["buffer-pool", "file-segment-manager"]
  },
  "parallel-query": {
    s: "Uses several worker processes or threads to run parts of one query at once: parallel scans, joins and aggregates whose partial results are gathered and merged.",
    d: "The planner inserts gather nodes above parallel-safe subplans. Workers divide a table's pages dynamically and run the same plan fragment, sharing a snapshot with the leader. Joins can share one hash table or each build their own, and aggregates run partial then combine. Data returns through shared-memory queues. It is hard because only operators and functions marked parallel-safe may run in workers, coordination costs can exceed gains for small queries, and workers compete for memory and I/O.",
    k: ["Dynamic work distribution of scan blocks: balances load across workers without precomputed splits, but defeats the strict physical order of rows.", "Cost threshold before parallel plans: avoids startup overhead on small queries, but misses benefit for medium ones near the threshold."],
    p: ["A function not marked parallel-safe silently forces a serial plan for the whole query.", "Each worker gets its own memory budget, so a plan with many workers can use many times the intended memory."],
    v: "Run a large scan-and-aggregate with zero and four workers and confirm identical results, a roughly proportional speedup, and four workers shown in the plan. Confirm a small query stays serial.",
    dep: ["sequential-scan", "aggregation", "hash-join", "snapshot-management"]
  },
});
