// Details for the batch processing plate, part 2: SQL layer, lazy evaluation and plans, optimizer.
ATLAS.details("batch-processing", {
  "sql-parser": {
    s: "Turns SQL text into a syntax tree and then into an unresolved logical plan that the analyzer can bind to real tables and columns.",
    d: "A grammar-driven parser tokenizes the statement, builds a syntax tree and converts it to the same plan node types the programmatic API produces, with names still unresolved. Queries, data definition and session commands share the entry point. The dialect is a large surface: quoting rules, case sensitivity, implicit conversions, set operations and vendor extensions all have to be decided. Errors must point to a position in the text, and ambiguity in the grammar is resolved by precedence rules that users rarely read.",
    k: ["Standard dialect vs permissive compatibility with other systems: standard is predictable, while permissive eases migration but accumulates special cases.", "Parse into the shared plan vs a separate SQL tree: sharing means one optimizer and one set of semantics, at the cost of SQL quirks leaking into plan nodes."],
    p: ["Keyword and identifier case differences make the same query pass in one engine and fail in another.", "A missing parenthesis around mixed set operations silently changes precedence and the result."],
    v: "Parse a query with nested subqueries, a window and a set operation, and confirm the resulting plan tree matches the one built by the equivalent dataframe calls, with an error pointing to the right line and column on a typo.",
    dep: ["logical-plan", "metastore-catalog"]
  },
  "metastore-catalog": {
    s: "The registry of databases, tables, columns, partitions, locations and formats that lets queries refer to data by name instead of by path.",
    d: "The catalog maps a table name to a schema, storage location, format, partition list and statistics. It can be in-memory for a session or backed by a shared service so many engines see the same tables. The analyzer consults it to resolve names, and writers update it after adding partitions. It is hard because the catalog and the actual files can diverge: files added directly to storage are invisible until registered, and a large partition count makes listing slow.",
    k: ["Shared external catalog vs per-session catalog: shared gives one truth across tools and teams, but is a service that must be highly available and versioned.", "Metadata in a service vs in the table's own files: a service is fast to query, while self-describing tables avoid drift but need file reads to plan."],
    p: ["Tens of thousands of partitions make planning take minutes because every partition is fetched from the catalog.", "A dropped table whose data was never deleted leaves orphaned files that look like data to later jobs."],
    v: "Register a table, add files directly to storage, and confirm a query does not see them until the partitions are repaired. Then confirm a query on a table of 50,000 partitions plans in seconds after pruning.",
    dep: ["schema-and-types"]
  },
  "function-registry": {
    s: "The table of built-in and user-registered functions, with their argument types, return types and optimizer properties such as determinism.",
    d: "Names used in expressions resolve here to function implementations. Built-ins cover string, date, math, collection and aggregate operations; users add their own. Each function declares whether it is deterministic, whether it can be evaluated on constants at plan time and what type it returns for given inputs, which the optimizer uses to fold and reorder expressions. The hard part is correctness at the edges: null handling, overflow, time zones and locale vary, and one wrong flag lets the optimizer move a function where it breaks.",
    k: ["Declared function properties vs inferring them: declared properties are cheap and explicit, but a wrong declaration produces incorrect optimization silently.", "Large built-in library vs a small core with extensions: a large library avoids user functions that are opaque, while a small core is easier to keep correct."],
    p: ["A function marked deterministic that reads state is folded to a constant at planning and returns the same value forever.", "Date functions that depend on session time zone give different answers on different clusters."],
    v: "Call every registered function with null, empty and boundary inputs and confirm results match the specification, and confirm a function marked nondeterministic is never pushed below a join or evaluated at plan time.",
    dep: ["schema-and-types"]
  },
  "window-and-aggregates": {
    s: "Operators that compute over groups of rows: group-by aggregates, and window functions that compute over sliding or ordered frames without collapsing rows.",
    d: "Group-by aggregation hashes or sorts rows by key and folds each group with partial and final steps so most work happens before the shuffle. Window functions partition rows by key, sort inside each partition and evaluate a frame such as the previous five rows or all rows so far, emitting one output row per input row. Both require a shuffle on the partitioning keys. Windows are hard because a single partition key must fit and sort in one task, and frames over large ranges are expensive to maintain incrementally.",
    k: ["Partial then final aggregation vs a single shuffle of raw rows: partial reduces shuffle volume sharply for repeated keys, but gains little when keys are mostly unique.", "Exact distinct counting vs approximate sketches: exact is precise but memory-heavy, while sketches use fixed memory with a small error bound."],
    p: ["A window with no partition key moves every row into one task and runs on a single machine.", "Count of distinct values over many groups exhausts memory because each group holds a full set."],
    v: "Run a grouped sum on a billion rows with few keys and confirm shuffle bytes are a tiny fraction of input due to partial aggregation, and a windowed rank matches a reference computed on a sample.",
    dep: ["hash-aggregation", "external-sort", "partitioner", "map-side-combine"]
  },
  "join-algorithms": {
    s: "The physical strategies for joining two datasets: broadcast hash, shuffled hash, sort-merge and nested loop, each suited to different sizes and conditions.",
    d: "A broadcast join sends the small side to every task and probes a hash table, avoiding a shuffle. A shuffled hash join partitions both sides by key and builds a hash table for the smaller partition. A sort-merge join sorts both sides by key after the shuffle and merges them, and spills gracefully. Nested loops handle non-equality conditions and are slowest. Strategy is chosen from estimated sizes, hints and join type. It is hard because a wrong estimate picks a plan that runs out of memory or moves far more data than needed.",
    k: ["Hash join vs sort-merge join: hash is faster when one side fits in memory, while sort-merge handles any size by spilling and sorting at higher cost.", "Broadcast threshold fixed vs derived from executor memory: fixed is predictable, while derived adapts to the cluster but changes plans between environments."],
    p: ["Broadcasting a side whose real size is far above its estimate fails with out-of-memory on every executor.", "A non-equality condition falls back to a nested loop over billions of row pairs with no warning."],
    v: "Join a 1 GB table to a 100 GB table, confirm the explain output shows a broadcast join with no shuffle of the large side, then raise the small side to 50 GB and confirm it switches to sort-merge.",
    dep: ["hash-aggregation", "external-sort", "broadcast-variables", "partitioner", "spilling"]
  },
  "subquery-rewriting": {
    s: "Transforms correlated and nested subqueries into joins and aggregates, which the engine can execute in parallel instead of once per outer row.",
    d: "A correlated subquery, evaluated naively, runs for every row of the outer query. The rewriter decorrelates it into a join or semi-join, an aggregate joined back by the correlation key, or an anti-join for not-exists. Scalar subqueries that return one row are evaluated once and broadcast. Set-membership subqueries become semi-joins. The hard part is exact semantics: null handling in not-in differs from not-exists, empty-group behavior of aggregates must be preserved, and some shapes cannot be decorrelated at all.",
    k: ["Always decorrelate into joins vs support only simple forms: always decorrelating is fast for most queries but is complex to keep correct, while limited support rejects valid SQL.", "Evaluate scalar subquery once and reuse vs re-evaluate per use: once is cheap but needs the subquery to be uncorrelated and deterministic."],
    p: ["Rewriting not-in as an anti-join ignoring nulls returns rows the original would exclude.", "A decorrelated aggregate drops groups with no match, changing a count of zero into a missing row."],
    v: "Run a not-in query on data containing nulls and a not-exists query on the same data and confirm each returns exactly what the SQL standard specifies, and that neither plan contains a per-row subquery execution.",
    dep: ["logical-plan", "join-algorithms", "rule-based-optimizer"]
  },
  "lazy-evaluation": {
    s: "Operations build a description of the computation rather than running it. Work starts only when an action needs a result.",
    d: "Calling transformations does no data processing: it extends a plan or lineage tree. When an action runs, the engine has the whole computation in hand and can fuse steps, prune unused columns, reorder filters and skip partitions entirely. It also means nothing is validated against data until then, and a dataset used twice is computed twice unless it is cached. The model is hard on users: timing, errors and side effects appear at the action, not at the line that caused them, and intermediate values cannot simply be inspected.",
    k: ["Lazy plans vs eager step-by-step execution: lazy allows global optimization and pipelining, but delays errors and hides cost, while eager is easy to debug but cannot optimize across steps.", "Whole-program planning at each action vs incremental planning: whole-program finds the best plan, at the price of repeated planning for repeated actions."],
    p: ["A transformation with an expensive side effect appears to do nothing until a later action, then runs repeatedly.", "Timing a transformation measures only plan building, giving a falsely fast result."],
    v: "Apply ten transformations to a large dataset and confirm no job appears in the UI and no data is read until an action is called, at which point exactly one job is submitted.",
    dep: ["logical-plan", "lineage-graph"]
  },
  "logical-plan": {
    s: "A tree of relational operators such as scan, filter, project, join and aggregate that says what to compute without saying how.",
    d: "The logical plan is the engine's central representation. The API and SQL both produce it, the analyzer resolves it, and the optimizer rewrites it with equivalence-preserving rules. Nodes carry expressions and schemas. It is independent of physical strategies, so a join is just a join, with no choice yet of algorithm. Keeping it clean is difficult: every new operator must have well-defined semantics for nulls, ordering and types, and every rewrite rule must be proven safe for all of them.",
    k: ["Tree of relational operators vs a graph with shared subplans: trees are simple to rewrite, whereas graphs allow reuse of common subexpressions but complicate every rule.", "Immutable plan nodes vs in-place mutation: immutable nodes make rules safe to apply speculatively and compare, but allocate more."],
    p: ["A rewrite rule that is wrong only for null inputs passes ordinary tests and corrupts production results.", "Plans that grow very deep from generated code overflow the stack in the optimizer."],
    v: "Print the logical plan of a query and confirm it contains only operators and expressions with resolved types, and that applying the optimizer returns a plan with the same output schema and, on a test data set, the same result.",
    dep: ["schema-and-types"]
  },
  "analyzer": {
    s: "Resolves names, types and functions in a raw plan against the catalog, inserts implicit casts and rejects invalid queries before any work starts.",
    d: "The analyzer runs rules to a fixed point: binding table and column names to catalog entries, expanding wildcards, resolving functions, checking that grouped queries select only grouped columns and coercing types so that an integer compared to a decimal gets a defined cast. The output is a fully typed plan or a clear error. It is hard because name resolution has scoping rules, such as aliases, nested queries and ambiguous columns, and because implicit coercion rules silently change semantics, for example when strings are compared to numbers.",
    k: ["Strict typing vs permissive implicit casts: strict catches mistakes early but breaks legacy queries, while permissive accepts more and hides data errors.", "Fixed-point rule iteration vs a single ordered pass: fixed-point handles interdependent rules, but costs planning time and may not terminate if rules fight."],
    p: ["Implicit conversion of a string column to a number on comparison prevents using an index or filter pushdown and changes which rows match.", "Ambiguous column references after a self-join resolve to the wrong side."],
    v: "Submit queries with a missing column, an ambiguous column and a type mismatch, and confirm each is rejected at analysis with a message naming the column, before any task is scheduled.",
    dep: ["metastore-catalog", "function-registry", "schema-and-types"]
  },
  "physical-plan": {
    s: "The chosen executable form of the query: concrete operators with algorithms, partitioning and ordering requirements, ready to be cut into stages.",
    d: "The planner converts each logical operator into a physical one, selecting algorithms such as a hash or sort-merge join and a partial or final aggregate. Each operator declares what partitioning and ordering it needs and provides, and the planner inserts shuffle and sort operators wherever a child does not already satisfy the requirement. The result is a tree the scheduler cuts at those exchanges. It is hard because a poor choice multiplies cost and because interacting requirements can produce redundant shuffles that a single operator's view does not see.",
    k: ["Enforcing required distribution by inserting exchanges vs asking each operator to repartition itself: central insertion lets the planner remove redundant ones, at the cost of a global pass.", "Single best plan vs keeping alternates for later: a single plan is simple, while alternates enable run-time switching but need more machinery."],
    p: ["Two successive operations on the same key each add a shuffle because the first's partitioning was not recognized.", "A plan assumed sorted data that the source does not provide, producing wrong merge-join output."],
    v: "Group and join on the same key and confirm the physical plan has one shuffle, not two, with each exchange showing the partitioning it produces.",
    dep: ["logical-plan", "join-algorithms", "partitioner"]
  },
  "narrow-wide-dependencies": {
    s: "Distinguishes operations where each output partition depends on one input partition from those where it depends on many, which require a shuffle.",
    d: "In a narrow dependency, such as filter or map, partition i of the output needs only partition i of the input, so work is pipelined within one task and recovery recomputes a single partition. In a wide dependency, such as group by key, every output partition needs data from every input partition, requiring a shuffle and creating a stage boundary. This distinction determines where stages are cut, what is pipelined, how much recovery costs and where the network is used. It is hard because a wide step makes a failure expensive: losing one output of an upstream stage may require re-running many tasks.",
    k: ["Maximize narrow pipelines vs materialize each step: pipelining avoids writing intermediates, but makes a failed task redo the whole chain.", "Co-partitioned inputs to avoid wide dependencies vs shuffling at use time: pre-partitioning moves cost to write time, in exchange for cheap repeated joins."],
    p: ["Assuming a repartition is cheap when it adds a full network shuffle of the dataset.", "Union of many inputs creates a narrow dependency with huge partition count that overwhelms the scheduler."],
    v: "Build a pipeline with filter, map, reduce-by-key and map, and confirm the stage view shows exactly two stages divided at the reduce, with the first two operations in one task.",
    dep: ["partitioned-dataset", "partitioner"]
  },
  "schema-and-types": {
    s: "The set of column names, data types and nullability that every plan node produces, including nested structures, decimals and timestamps.",
    d: "Every operator has an output schema derived from its inputs. The type system covers integers, floating point, fixed-precision decimals, strings, binary, dates, timestamps and nested arrays, maps and structs, each with defined comparison, casting and null rules. The schema drives binary row layout, file format mapping and optimization. It is hard because details matter: decimal precision on arithmetic, time zone handling in timestamps, integer overflow and the difference between null and missing, and file formats map these types imperfectly.",
    k: ["Schema known before running vs inferred from data: known schemas enable early errors and optimization, while inference is convenient but costs a pass over the data and can guess wrong.", "Nullable by default vs non-null by default: nullable is safe for messy data but disables some optimizations and bloats rows."],
    p: ["Inferring a schema from a small sample types a column as integer and later values overflow or fail to parse.", "Decimal arithmetic that exceeds maximum precision silently becomes null or rounds."],
    v: "Write a table with decimals, timestamps with zones and nested structs, read it back, and confirm every value round-trips exactly, including null and boundary values.",
    dep: []
  },
  "code-generation": {
    s: "Compiles a pipeline of operators into one tight function at run time, eliminating per-row virtual calls and keeping values in registers.",
    d: "Instead of interpreting a tree of operator objects, each calling the next for every row, the engine generates source for a fused stage, compiles it in memory and runs it per partition. The loop over rows contains the filter, projection and partial aggregate inline. This removes call overhead and boxing and improves cache use. It is hard because the compiler has limits: generated methods can exceed size limits, compilation adds latency for short queries, and bugs in generated code are difficult to debug, so engines keep an interpreted fallback.",
    k: ["Compile fused stages vs interpret operator trees: compilation is much faster for CPU-heavy work, while interpretation starts instantly and is easier to debug.", "Code generation vs vectorized batches: generation fuses everything into one loop, while vectorization uses simple pre-compiled kernels with less compile risk."],
    p: ["A very wide table generates a method too large to compile, forcing a silent fallback to a much slower path.", "Compile time dominates a query that runs for under a second."],
    v: "Run a filter-aggregate query over 100 million rows with generation on and off, and confirm the generated version runs several times faster and the explain output marks the fused stage.",
    dep: ["physical-plan", "operator-pipeline", "binary-row-format"]
  },
  "rule-based-optimizer": {
    s: "Applies a library of equivalence-preserving rewrites, such as constant folding, filter combining and unnecessary-operator removal, until the plan stops changing.",
    d: "Rules are small functions that match a plan pattern and return a simpler or cheaper equivalent: merge adjacent filters, fold constant expressions, remove redundant projections or sorts, eliminate joins that cannot change results, and simplify boolean logic. They run in batches to a fixed point. Because rules need no statistics, they always help or are neutral. They are hard because each interacts with others, ordering matters, and a rule that is almost right is the most dangerous kind of bug.",
    k: ["Many small independent rules vs a few large transformations: small rules are easier to verify and extend, but their interplay is hard to predict.", "Run to fixed point vs a fixed number of passes: fixed point finds all simplifications but can loop or be slow, while limited passes bound planning time."],
    p: ["Two rules that undo each other make the optimizer loop until the iteration limit and produce a different plan on each run.", "Folding an expression with an overflow at plan time raises an error for a branch that would never have executed."],
    v: "Optimize a query containing a constant expression, a redundant projection and two adjacent filters and confirm the output plan has one filter, folded constants and no redundant operator, with identical results.",
    dep: ["logical-plan", "function-registry"]
  },
  "predicate-pushdown": {
    s: "Moves filters as close to the data as possible, through joins and projections and into the file scan, so unneeded rows are never read or shuffled.",
    d: "The rule moves a filter below operators that do not change which rows it applies to and splits conjunctions so each part goes where it can. At the scan, filters are translated into file-level checks: partition elimination, row-group statistics and, for some formats, per-page or index lookups. This can cut the data read by orders of magnitude. It is hard because pushdown through outer joins, aggregates and nondeterministic functions changes results, and because only certain predicates can be expressed to the file reader.",
    k: ["Push filters into the reader vs filter after reading: pushdown skips bytes, but the reader's statistics are only coarse, so rows are still filtered again above.", "Inferring additional filters across join keys vs only explicit ones: inference reduces both inputs, but is wrong if equality does not hold for nulls."],
    p: ["Pushing a filter below the preserved side of an outer join changes the result by dropping rows that should appear with nulls.", "A cast applied to the column in the predicate prevents the reader from using its statistics."],
    v: "Filter on a sorted column of a large columnar file and confirm the scan metrics show most row groups skipped, bytes read a small fraction of the file, and results equal an unpushed run on the same data.",
    dep: ["rule-based-optimizer", "columnar-formats", "partition-discovery", "data-source-api"]
  },
  "projection-pruning": {
    s: "Removes columns that no later operator needs, so the scan reads and the shuffle carries only the columns the query actually uses.",
    d: "The optimizer computes, for each operator, which input columns its parent requires and inserts or tightens projections accordingly, down to the scan. With a columnar format, unread columns cost no I/O at all; with row formats, they are still read but not carried through the shuffle. Nested fields can be pruned individually. The difficulty is that opaque user functions and whole-row operations need every column, which defeats pruning, and wide tables make the saving large only if the plan stays visible to the optimizer.",
    k: ["Nested-field pruning vs whole-column pruning: nested pruning reads only the needed sub-fields, but needs reader support and careful handling of schema differences.", "Pruning early vs keeping columns for reuse: early pruning shrinks data sooner, but can force re-reading when a later action wants the dropped columns."],
    p: ["Selecting all columns through a wildcard reads every column of a 500-column table for a query that uses three.", "A user function over a full record forces all fields to be materialized."],
    v: "Select three columns from a 300-column columnar table and confirm the scan lists only those three and bytes read are about one percent of the file.",
    dep: ["rule-based-optimizer", "columnar-formats", "data-source-api"]
  },
  "statistics-collection": {
    s: "Gathers row counts, sizes, distinct counts, min and max, null counts and histograms for tables and columns so the cost model has facts to work from.",
    d: "Statistics are produced by an explicit analyze command that scans data, by writers that record file-level statistics as they write, or by sampling. They are stored in the catalog or in file metadata. The optimizer reads them to estimate selectivity and sizes. The cost is a full or sampled scan, and the risk is staleness: statistics describe data as of collection, and any later load makes them wrong, often without warning. Collecting for every column of every table is rarely affordable.",
    k: ["Full scan statistics vs sampled: full is accurate but expensive on huge tables, while sampling is cheap but misses rare values and skew.", "Collect on write vs on demand: on-write stays current but slows ingestion, while on-demand needs scheduling and goes stale between runs."],
    p: ["Statistics collected on an empty table make the optimizer choose a plan for zero rows after the table is loaded.", "Histograms on a heavily skewed column are built from a sample that missed the hot key."],
    v: "Analyze a table, load more data without refreshing and confirm the explain output's estimated rows are stale. Refresh and confirm the estimates match actual counts within a small factor.",
    dep: ["metastore-catalog", "columnar-formats"]
  },
  "cost-based-optimizer": {
    s: "Chooses between equivalent plans by estimating the data volume and resource cost of each, using statistics, instead of applying fixed rules.",
    d: "Given estimates of rows and bytes at each operator, the cost-based optimizer computes selectivity of filters and joins, then compares plans by a weighted cost of I/O, CPU and network. It decides join strategies, join order and which side to build or broadcast. Quality depends entirely on estimate accuracy, which degrades with depth, with correlated columns and with user functions it cannot see. Without statistics it falls back to default assumptions. Many engines therefore treat it as a bonus on top of rules and run-time correction.",
    k: ["Cost-based vs heuristic choice: cost-based adapts to data but depends on accurate statistics, while heuristics are stable but wrong whenever the data differs from assumptions.", "Search many plan shapes vs a greedy choice: more search finds better plans but planning time grows fast with the number of joins."],
    p: ["Estimates multiply independent selectivities for correlated filters and underestimate by a large factor, causing a wrong join side.", "The optimizer spends minutes planning a query with dozens of joins."],
    v: "Run a five-way join with and without statistics and compare the plans: with statistics the smallest filtered input is joined first and total shuffle bytes drop measurably.",
    dep: ["statistics-collection", "logical-plan", "join-algorithms"]
  },
  "join-reordering": {
    s: "Changes the order in which a multi-way join combines tables, so the smallest and most selective intermediate results come first.",
    d: "The order of inner joins does not change the result but changes intermediate sizes by orders of magnitude. The optimizer searches orderings, typically with dynamic programming for a small number of tables and a greedy or randomized method beyond that, scoring each by estimated intermediate size. Star-schema shapes get special treatment: filtered dimension tables join with the large fact table first. It is hard because estimates are noisy and because search time grows factorially, so a cap on the number of reordered tables is common.",
    k: ["Exhaustive search for small joins vs greedy for large: exhaustive finds the best estimated plan, while greedy is predictable in planning time but can miss good orders.", "Reorder inner joins only vs also outer joins: restricting is always safe, but forgoes optimization where outer joins could be reordered under conditions."],
    p: ["Joining two large tables first because of a missing filter estimate produces a huge intermediate that is later filtered away.", "Reordering across a hint or a non-deterministic function changes results."],
    v: "Join a large fact with three dimension tables written in the worst order and confirm the optimizer's order joins the most selective dimension first, cutting the largest shuffle by at least half.",
    dep: ["cost-based-optimizer", "join-algorithms", "statistics-collection"]
  },
  "runtime-filters": {
    s: "Builds a compact filter from one join side at run time and uses it to skip partitions or rows on the other side before they are read or shuffled.",
    d: "When a small, filtered table joins a large one, the engine first evaluates the small side, then derives either a set of partition keys, for dynamic partition pruning, or a probabilistic membership filter. The large side's scan then skips partitions or discards non-matching rows early. This turns a filter on a dimension table into a savings on the fact table's I/O. It is hard because it adds a dependency between stages, must be cheap to build and ship, and only pays off when the join is selective.",
    k: ["Exact partition set vs probabilistic filter: partition sets prune whole files exactly, while probabilistic filters work on any column with false positives and a small size.", "Always build the filter vs only when estimated beneficial: always is simple, but wastes work when the join is not selective."],
    p: ["Building a filter from a large side costs more than the data it saves and delays the scan.", "The filter is applied only after the data is read, so it saves shuffle but not I/O."],
    v: "Join a partitioned fact table to a dimension filtered to one region and confirm the scan metrics report most partitions pruned at run time, with identical results to a run with the feature disabled.",
    dep: ["partition-discovery", "join-algorithms", "adaptive-execution"]
  },
  "adaptive-execution": {
    s: "Re-optimizes the remaining plan at stage boundaries using the exact sizes observed so far, instead of relying only on estimates made before running.",
    d: "After a shuffle stage completes, its output sizes per partition are known exactly. The engine then replans downstream: it can switch a shuffled join to a broadcast when one side turned out small, merge many tiny shuffle partitions into fewer, and split oversized skewed partitions. Planning therefore proceeds in steps, with query stages as the unit. It corrects the main weakness of static estimation. It is hard because it limits what can be planned in advance, makes plans differ between runs and needs materialized shuffle output to measure.",
    k: ["Re-plan at stage boundaries vs plan once: re-planning uses real sizes and fixes bad estimates, while plan-once is stable and simpler to debug.", "Enable by default vs opt-in: default makes everyone benefit, but changes behavior that existing tuning assumed."],
    p: ["A plan inspected before execution is not the plan that ran, which confuses performance comparisons.", "Coalescing partitions too aggressively reduces parallelism for the next stage."],
    v: "Run a query whose static estimate is wrong by 100 times and confirm the final plan shows a join switched to broadcast and coalesced shuffle partitions, with a shorter runtime than with the feature off.",
    dep: ["partition-coalescing", "skew-handling", "join-algorithms", "task-metrics"]
  }
});
