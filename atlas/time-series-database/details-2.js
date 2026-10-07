// Details for the time-series database plate, part 2: query language, planner and engine.
ATLAS.details("time-series-database", {
  "query-api": {
    s: "The network interface for reads: instant queries at one time, range queries over a window with a step, and metadata endpoints for series, labels and values.",
    d: "An instant query evaluates an expression at one timestamp. A range query evaluates it at every step between a start and end and returns a matrix of series. Metadata endpoints list label names, label values and series matching selectors, which power autocomplete. Requests carry a timeout, tenant identity and limits. Responses stream or buffer as JSON or a binary form. The difficulty is protecting the node: a range query over a wide window at a small step can request millions of points, so step and size validation and cancellation on client disconnect matter.",
    k: ["Range query by repeated instant evaluation vs a native range engine: repeated evaluation is simple; a native engine shares selection and decoding across steps and is far faster.", "Buffered vs streamed response: buffering allows returning a clean error on failure; streaming lowers memory but can only truncate a response after it has begun."],
    p: ["A dashboard refreshing a one-year range at one-second step asks for 31 million points per series and exhausts memory.", "Queries not cancelled when the client disconnects keep consuming CPU for results nobody reads."],
    v: "Send a range query with a step that would exceed the point limit and confirm a clear rejection; cancel a running heavy query from the client and confirm its CPU usage stops within seconds.",
    dep: ["query-parser", "query-limits"]
  },
  "query-language": {
    s: "A purpose-built language for selecting series by label and computing over time, with selectors, range windows, functions, aggregation and arithmetic between series.",
    d: "Expressions combine selectors that pick series by name and label matchers, range vectors that hold a window of samples per series, functions that turn windows into values, aggregation operators that group by labels, and binary operators that join series by matching labels. The result type, instant vector, range vector or scalar, determines what can be composed. The language is designed so that common monitoring questions are short. The difficulty is semantics: lookback, staleness, extrapolation and label matching in joins each have rules that surprise users.",
    k: ["Purpose-built language vs SQL: a time-aware language makes windows, rates and label joins concise; SQL has familiar tools and richer joins but makes time-window logic verbose.", "Implicit label matching in binary operations vs explicit joins: implicit matching is terse; it silently drops series whose labels do not line up."],
    p: ["Dividing two series with slightly different label sets returns an empty result, and the user reads it as zero.", "Using a window shorter than two scrape intervals yields no output because the rate needs two samples."],
    v: "Run an expression that divides errors by requests per service and confirm each output series carries the service label and the value matches a hand computation from the raw samples.",
    dep: ["query-parser"]
  },
  "query-parser": {
    s: "Turns query text into a typed syntax tree, reporting errors with positions and rejecting expressions whose operand types do not fit.",
    d: "A lexer and parser build a tree of selectors, calls, aggregations and binary expressions, with duration literals and label matcher syntax. A type checker assigns each node a result type and checks function arguments and operator combinations, and rewrites preprocessing details such as offset and fixed evaluation time modifiers. Error messages point to the offending token. Expression trees can be printed back to canonical text, which the cache and rules use as a key. The difficulty is quality of error messages and a grammar that stays unambiguous as features are added.",
    k: ["Hand-written parser vs generated: generated grammars are easy to extend and check; hand-written parsers give better error messages and recovery.", "Type check at parse time vs at execution: parse-time checks fail fast before any work; execution-time checks accept more but waste resources on invalid requests."],
    p: ["Printing an expression back produces text that parses differently, which breaks cache keys and rule diffs.", "Overly deep nesting from generated queries overflows a recursive evaluator."],
    v: "Parse a corpus of valid and invalid expressions, confirm invalid ones fail with a line and column, and confirm that parse, print and parse again yields an identical tree for every valid one.",
    dep: []
  },
  "selector-matching": {
    s: "Label matchers of four kinds, equal, not equal, regex match and regex not match, that together select the series an expression reads.",
    d: "A selector lists matchers against label values, including the metric name. The engine asks the index for postings matching each matcher and intersects or subtracts them. Equality matchers are one lookup; regex matchers must test every value of a label unless optimized. A selector must contain at least one matcher that cannot match the empty string, which prevents a query from selecting everything. Negative matchers are evaluated as a complement. The difficulty is cost: a loose regex or negative matcher scans a large share of the index.",
    k: ["Require a non-empty matcher vs allow any selector: requiring one prevents accidental full scans; it forbids some legitimate global queries.", "Anchored regex vs unanchored: anchoring makes matches predictable and enables prefix optimization; unanchored matches surprise users who forget it."],
    p: ["A matcher on an absent label matches series without the label, which people forget when writing negations.", "A regex on a high-cardinality label evaluates against every distinct value on each query."],
    v: "Select with a regex over a label that has 100,000 values and confirm the query's index-lookup time is reported; replace it with an equality matcher and confirm the lookup time drops by orders of magnitude.",
    dep: ["postings-index", "regex-matcher-optimization"]
  },
  "subqueries-and-offsets": {
    s: "Time modifiers that read data from the past or evaluate an inner expression over a sliding window, so one query can compare now to last week or smooth a computed series.",
    d: "An offset shifts the evaluation time of a selector backward so a graph can overlay the same hour last week. A fixed evaluation time modifier pins a selector at one timestamp. A subquery evaluates an inner expression at a resolution across a window and then applies a range function to those results, for example the maximum over a day of a five-minute rate. The engine must evaluate the inner expression many times and keep intermediate results in memory. The difficulty is cost, since the inner expression multiplies evaluations, and alignment of subquery steps.",
    k: ["Subquery at its own resolution vs outer step: an explicit resolution makes cost predictable; inheriting the outer step is convenient but changes results when the dashboard step changes.", "Compute through a recording rule vs a subquery: rules compute once on a schedule; subqueries are flexible but repeat the work for every viewer."],
    p: ["A subquery over thirty days at one-minute resolution evaluates the inner expression 43,200 times per series.", "An offset query asks for data older than retention and returns nothing, which looks like a metric that did not exist."],
    v: "Run a query overlaying now with the value one week ago and confirm each point matches the same expression evaluated directly at the shifted timestamp.",
    dep: ["query-parser", "range-selection"]
  },
  "logical-planner": {
    s: "Rewrites the parsed expression into an efficient plan: resolves selectors, merges duplicate reads, reorders operations and decides which parts can be pushed down or split by time.",
    d: "The planner takes the syntax tree and builds operators, looks up time ranges that matter for each selector given offsets and range windows, and detects repeated sub-expressions so they are computed once. For distributed execution it splits the plan into a part that runs near the data and a part that merges. It also estimates the number of series and points to decide whether to parallelize and whether limits will be exceeded. The difficulty is correctness of rewrites: pushing an aggregation below a join, or splitting a range function across time slices, must give the same answer.",
    k: ["Rule-based rewrites vs cost-based planning: fixed rules are predictable and testable; cost-based choices need statistics that can be stale or missing.", "Split a query by time interval vs execute whole: splitting parallelizes and caches well; it breaks functions that need a window spanning slice borders unless overlap is added."],
    p: ["A rewrite that is valid for sums but applied to averages gives wrong results across shards.", "Splitting a rate across boundaries without extending the window loses one step at every seam."],
    v: "Execute a set of expressions with the optimizer on and off over the same data and confirm the results are identical sample by sample, while the optimized plan reads fewer chunks.",
    dep: ["query-parser", "selector-matching"]
  },
  "sql-interface": {
    s: "An optional SQL front end that exposes series and events as tables, with time-bucketing and gap-filling functions, for users and tools that already speak SQL.",
    d: "A SQL layer maps measurements to tables with a time column, tag columns and value columns. It adds functions for bucketing time into fixed intervals, filling missing buckets, interpolation and last-observation carry-forward. Queries are parsed, planned by a general relational optimizer and executed against the same storage through a scan interface that supports time-range and label pushdown. It makes joins between metrics and reference data possible and connects ordinary reporting tools. The difficulty is mapping a model of sparse, irregular series onto tables without losing the time-specific optimizations.",
    k: ["SQL layer over the native engine vs a separate engine: a layer reuses storage and ingestion; a separate engine optimizes for analytics but duplicates data.", "Expose tags as columns vs as a map: columns are natural for SQL and statistics; maps allow arbitrary label sets but hide them from the planner."],
    p: ["A query without a time predicate scans every block and every retained chunk.", "Gap-filling with the wrong interpolation mode invents values for periods in which the source was down."],
    v: "Run a bucketed aggregate in SQL and the equivalent query in the native language over the same range and confirm the numbers match, and that the SQL plan shows the time predicate pushed to the scan.",
    dep: ["query-parser", "pushdown"]
  },
  "range-selection": {
    s: "Finds the series matching a selector and loads only the chunks overlapping the needed time range, from the head and from blocks, ready for iteration.",
    d: "For a selector the engine gets postings from the head and from each block overlapping the query range, intersects them, and resolves series references to label sets and chunk metadata. Blocks whose time range does not overlap are skipped without being opened. Chunk metadata lets the iterator decode only chunks that overlap each step's window, including a lookback before the first step. The difficulty is the amount of work done before any sample is read: index lookups, metadata fetches and the memory used to hold series sets for broad selectors.",
    k: ["Select then read lazily vs materialize first: lazy reading keeps memory low and can stop early; materializing allows sorting and limit checks before work begins.", "Include a lookback before the start vs exact start: a lookback gives the first step a value; without it the left edge of a graph appears empty."],
    p: ["Selecting without narrowing by time touches every block, and cost scales with retention instead of window.", "A series that existed only briefly still costs an index entry and a metadata fetch in every overlapping block."],
    v: "Query a one-hour range on a node with a month of blocks and confirm via query statistics that only the blocks overlapping that hour were opened, and chunks outside it were never decoded.",
    dep: ["postings-intersection", "block-reader", "head-block"]
  },
  "series-iterators": {
    s: "Lazy iterators that walk samples in time order, merging the head, overlapping blocks, out-of-order buffers and replicas into one deduplicated stream per series.",
    d: "Each series is read as a chain of chunk iterators: decode the chunk, seek to the window, yield samples. A merge iterator combines iterators from overlapping blocks and the head, picking the lowest timestamp and discarding duplicates. In a cluster the same series from replicas is merged and deduplicated by timestamp. Seeking inside compressed chunks is sequential, so a step that skips ahead still decodes the intervening samples. The difficulty is correctness around duplicates and ties, and performance of decoding for wide queries.",
    k: ["Merge on read vs compact first: merging on read tolerates overlap and replicas at CPU cost; pre-merging at compaction time saves query work but requires time and storage.", "Deduplicate by timestamp vs by timestamp and value: timestamp-only is cheap and consistent; value comparison catches conflicting writes but costs more and rarely resolves them."],
    p: ["Replica samples that differ slightly in timestamp are not deduplicated and doubles the sum.", "Seek-heavy queries over compressed chunks decode far more than they return."],
    v: "Write the same samples to two replicas, query with merge, and confirm each timestamp appears exactly once; then write a sample to one replica only and confirm it still appears.",
    dep: ["range-selection", "chunk-format", "vertical-compaction"]
  },
  "aggregation-operators": {
    s: "Operators that combine many series into fewer, such as sum, average, minimum, maximum, count and top-k, grouped by chosen labels or by all labels except some.",
    d: "At each step the operator groups its input series by a label subset, computes the aggregate across their values at that timestamp, and emits one series per group. Grouping can include specified labels or exclude them. Some operators, such as quantile and top-k, need all values, while sums and counts can be computed incrementally and in parallel. The engine must handle series that appear and disappear between steps. The difficulty is memory for high-fan-in groups, and distribution, where an average of shard averages is wrong unless counts travel with it.",
    k: ["Streaming aggregation vs buffered: streaming holds one accumulator per group and uses little memory; operators like quantile need every value for the step.", "Group by listed labels vs by exclusion: listing is explicit and stable; exclusion keeps newly added labels and can silently change output cardinality."],
    p: ["Averaging pre-aggregated averages across shards gives a result weighted wrongly by series count.", "A grouping label that does not exist on all series merges them into one group with an empty value."],
    v: "Aggregate 1,000 series with a known sum by region and confirm each output equals the hand-computed total; split the input across two shards and confirm the merged result is identical.",
    dep: ["series-iterators"]
  },
  "rate-and-counter-functions": {
    s: "Functions that turn cumulative counters into per-second rates over a window, detecting resets and extrapolating to the window edges.",
    d: "A rate function takes all samples in a range, walks them in order and sums increases, treating any decrease as a reset to zero and adding the new value. The total is divided by the window length after extrapolating towards the window boundaries, bounded by the series' actual first and last sample. Companion functions give the increase, the instantaneous rate from the last two samples, and the change of a gauge. The difficulty is edge behavior: a window with fewer than two samples yields nothing, and extrapolation can create a fractional count for integer events.",
    k: ["Extrapolated rate vs exact interval rate: extrapolation smooths over scrape jitter and gives aligned values; it can overstate short windows and produce non-integer counts.", "Rate over a long window vs a short one: long windows are smooth and robust to missed scrapes; short windows react quickly but are noisy and need at least two samples."],
    p: ["A rate window of one scrape interval contains one sample, so the result is empty.", "A counter reset detected as a decrease can be missed if it rises above its old value between samples."],
    v: "Feed a counter growing at exactly 10 per second with one reset in the middle and confirm the rate stays near 10 across the reset and equals 10 at windows without edge effects.",
    dep: ["series-iterators", "metric-types"]
  },
  "histogram-functions": {
    s: "Functions that estimate quantiles and other statistics from histogram buckets or native histograms, interpolating inside buckets and merging across series before estimating.",
    d: "For classic histograms the estimate takes cumulative bucket counts, finds the bucket containing the target rank and interpolates linearly between its bounds. Aggregation must happen first on the bucket counters by summing rates per bucket and boundary, then the quantile function is applied. For native histograms the function works on the sparse buckets directly with exponential interpolation. The error is bounded by bucket width. The difficulty is that the estimate is only as good as the bucket layout, and a quantile that falls in the top bucket cannot be estimated beyond its lower bound.",
    k: ["Estimate from merged buckets vs average quantiles: merging gives a true distribution estimate; averaging per-instance quantiles is cheaper but mathematically wrong.", "Linear interpolation within buckets vs assuming exponential distribution: linear is simple and exact for uniform buckets; exponential interpolation fits latency data better in wide buckets."],
    p: ["Buckets that do not contain the real tail make the 99th percentile report the largest finite bound.", "Summing buckets that have different boundaries across versions produces nonsense without a warning."],
    v: "Observe values from a known distribution into the histogram, compute the 95th percentile, and confirm the estimate lies within the bucket containing the true value and is within the stated error bound.",
    dep: ["aggregation-operators", "native-histograms", "rate-and-counter-functions"]
  },
  "query-parallelism": {
    s: "Splitting a query across CPU cores or nodes by time slice, by series shard, or by sub-expression, then merging partial results into the final answer.",
    d: "A long range query is cut into time intervals that run concurrently and are merged at the front end, which also lets each slice be cached separately. A query over many series can be split by hashing series into shards, each computing a partial aggregate. Within a node, series decode and aggregation are spread over a worker pool. Each split adds overhead, and results must combine exactly. The difficulty is choosing split counts: too many splits flood storage with small requests and starve other queries, too few leave cores idle.",
    k: ["Split by time vs by series shard: time splits make caching and retries easy but cannot help a single huge step; shard splits cut per-query cost but need aggregations that are decomposable.", "Fixed split count vs adaptive: fixed is predictable; adaptive uses resources well but is harder to reason about under load."],
    p: ["One expensive tenant's split queries saturate every worker and starve the others.", "A split at a boundary inside a range window gives different results from the unsplit query."],
    v: "Run the same wide query with splitting disabled and enabled, compare results sample by sample, and confirm wall-clock time drops while total CPU stays within a small multiple.",
    dep: ["logical-planner", "query-fanout"]
  },
  "pushdown": {
    s: "Sending selection, filtering or partial aggregation to the storage layer or to the nodes holding the data, so less data is moved and decoded.",
    d: "The planner passes time bounds and label matchers into the storage scan so irrelevant blocks and chunks are skipped. In a cluster it also pushes partial aggregates such as sum and count to each owner, which return one row per group instead of every sample. Some stores can push down downsampled reads or even range functions. The difficulty is correctness and capability negotiation: only decomposable operations may move, and the planner must know what each backend supports and fall back gracefully.",
    k: ["Push partial aggregates to owners vs pull raw samples: partials cut network and memory by orders of magnitude; they restrict to decomposable functions and complicate replica merging.", "Pushdown through a capability interface vs fixed assumptions: negotiation tolerates mixed backends and versions; it adds a layer to test and keep consistent."],
    p: ["Pushing a top-k to each shard returns the wrong global top-k when series are split across shards.", "A backend that silently ignores a pushed filter returns extra series that the engine then trusts."],
    v: "Run a grouped sum over 100 million samples in a cluster and confirm the bytes returned to the coordinator are proportional to the group count, not the sample count, and the result matches the raw computation.",
    dep: ["logical-planner", "aggregation-operators"]
  },
  "results-cache": {
    s: "Stores computed query results by expression and time slice, so repeated or overlapping dashboard queries reuse earlier work and compute only the new tail.",
    d: "Range queries are aligned to step multiples and split into intervals. Each interval's result is cached under a key made from the tenant, canonical expression, step and interval. A refresh a minute later finds all but the most recent interval cached and evaluates only that. Recent intervals are not cached, or are cached with a short lifetime, because data can still arrive. Caches live in memory or a shared external store. The difficulty is staleness: late or out-of-order samples change past results, and cached recording rule outputs can hide corrections.",
    k: ["Cache aligned intervals vs whole results: aligned slices are reusable across overlapping queries; whole-result caching is simpler but misses on any change of start or end.", "Skip caching of recent data vs cache everything: skipping prevents serving incomplete results; it means the freshest interval always costs a full evaluation."],
    p: ["Caching an interval before late samples arrive freezes an undercount that dashboards show for hours.", "A key that omits the tenant lets one tenant read another's results."],
    v: "Run the same dashboard query twice a minute apart and confirm via statistics the second run evaluates only the most recent interval, and the combined result equals an uncached evaluation.",
    dep: ["query-parallelism", "multi-tenancy"]
  },
  "query-limits": {
    s: "Caps on a single query's resources: series count, samples loaded, bytes returned, duration and concurrency, enforced during execution with clear errors.",
    d: "Limits are checked as data is read: after index lookup the series count is compared to a maximum, and chunk bytes and sample counts are tallied as chunks are decoded. Exceeding a limit aborts the query with an error that names it. Timeouts cancel work cooperatively, and a concurrency limit with a queue protects the node from many heavy queries at once. Limits are set per tenant and sometimes per query class. The difficulty is early detection, since a limit checked only at the end has already used the memory, and tuning so legitimate queries pass.",
    k: ["Fail fast on a limit vs return partial results: failing is honest and predictable; partial results keep dashboards alive but mislead if the truncation is missed.", "Per-query limits vs per-tenant budgets: per-query limits stop a single bad query; per-tenant budgets stop many moderately bad ones."],
    p: ["Limits checked after loading all chunks protect nothing: the memory has already been used.", "A limit set too tight rejects the monthly report while an ordinary dashboard still triggers the node to run out of memory."],
    v: "Run a query selecting more series than the limit and confirm it aborts before decoding chunks, with an error naming the limit, and node memory does not rise measurably.",
    dep: ["range-selection"]
  },
});
