// Details for the stream processor plate, part 2: planning, time and watermarks, windows, joins.
ATLAS.details("stream-processor", {
  "logical-plan": {
    s: "A tree of relational or dataflow operations describing what to compute, independent of how it will be partitioned, ordered or placed on machines.",
    d: "Queries and table programs are converted into a tree of operations: scans, projections, filters, aggregates, joins, and window operations, annotated with types, time attributes and key information. Dataflow programs skip this step and go straight to a graph. The logical plan is the object optimization works on and the object users inspect when asking why a query is slow. It is hard because streaming adds properties that batch plans lack: whether each node emits updates or only inserts, whether it needs state, and which node owns the time attribute.",
    k: ["A single logical plan shared by batch and streaming vs separate plans: one optimizer to maintain and equal semantics, but properties like retraction support must be modeled in every rule.", "Early physical hints in the plan vs a purely logical plan: hints let users steer the result, but they leak implementation decisions into queries."],
    p: ["Reading a plan that omits changelog and state annotations leads engineers to believe a query is cheap when it holds unbounded state.", "Plans differ between versions, so a restored job cannot map old state to the new operators."],
    v: "Print the optimized plan for a join and an aggregate: each node should show its change kind and whether it keeps state, and the plan should be identical between two submissions of the same text.",
    dep: ["sql-parser", "table-api"]
  },
  "rule-based-optimizer": {
    s: "Applies a library of equivalence-preserving rewrites to the logical plan, such as pushing filters and projections toward the sources and merging adjacent operators.",
    d: "Rules match a pattern in the plan and replace it with an equivalent, cheaper form: predicate pushdown, projection pruning, subquery decorrelation, constant folding, and join reordering for simple cases. Streaming-specific rules split aggregations into local and global phases, or turn windows into specialized operators. Rules run in phases until a fixpoint. Connectors can accept pushed-down filters and projections, which reduces data read. The challenge is rule interaction: a rule valid for batch can be wrong when updates and retractions are present.",
    k: ["Pushing operations into the source vs executing in the engine: less data is read and moved, but semantics must match what the external system really does.", "Many small independent rules vs a handful of fused ones: rules are easy to add and test, but ordering and interactions become hard to predict."],
    p: ["A filter pushed below a stateful operator changes which updates it sees, so output changes with no error.", "A rule that is not idempotent loops during planning."],
    v: "Plan a query with a selective filter after a projection and confirm the optimized plan reads only needed columns and applies the filter at the scan; results must equal an unoptimized run on the same data.",
    dep: ["logical-plan"]
  },
  "cost-based-optimizer": {
    s: "Chooses among equivalent plans, such as join order and join algorithm, using estimated row counts and statistics; its inputs are weaker for streams than for stored tables.",
    d: "For bounded inputs the optimizer uses table and column statistics to estimate selectivity and cost, and picks join order and distribution strategies such as broadcasting a small side. For unbounded streams there are no totals, so estimates rely on rate hints or heuristics. Cost should also include state size and the cost of updates. Statistics must be collected and kept fresh, otherwise the estimates are worse than a fixed heuristic. The hard part is that wrong estimates compound through a join tree.",
    k: ["Statistics-driven choices vs fixed heuristics: better plans on well-described data, but stale or missing statistics produce worse plans than simple rules.", "Cost model centered on rows vs including state and latency: row counts suit batch, whereas streaming plans are dominated by state growth and update volume."],
    p: ["Statistics gathered once go stale, so the optimizer chooses a join order that blows up after the data changes.", "Applying batch cost assumptions to unbounded inputs picks plans that scale poorly with state."],
    v: "Run a three-way join with accurate statistics and with deliberately wrong ones: the chosen join order should differ, and the plan with accurate statistics should process fewer intermediate rows in the metrics.",
    dep: ["logical-plan", "rule-based-optimizer"]
  },
  "changelog-mode-inference": {
    s: "A planner pass that works out which operators emit inserts only, updates, or deletes, and where normalization or key-preserving steps must be inserted so every consumer receives a form it accepts.",
    d: "Each operator declares the change kinds it produces and the kinds it requires from its inputs. The pass walks the plan, propagates requirements upstream and capabilities downstream, and inserts stateful normalization when a producer lacks before-images but a consumer needs them. It also checks that required keys survive projections and joins. The result decides state usage: a retract-capable path needs more state than append-only. Failure is reported as a planning error naming the incompatible pair.",
    k: ["Inferring modes automatically vs requiring users to declare them: queries stay simple, but users cannot easily predict why a state-heavy step appeared in their plan.", "Normalizing early vs late: early normalization simplifies downstream rules, late normalization avoids state when the sink does not need it."],
    p: ["A hidden normalization operator adds large state that nobody planned for.", "A projection drops the key column and makes an upsert path impossible, failing only at plan time on production tables."],
    v: "Plan a change-log source into an upsert sink with and without the key column in the select list: the first must plan cleanly, the second must fail naming the lost key, and the plan must show where normalization was added.",
    dep: ["logical-plan", "changelog-streams"]
  },
  "execution-mode-selection": {
    s: "Decides whether a job runs as a continuous streaming job or as a batch job over bounded inputs, which changes exchanges, scheduling, state and fault-tolerance strategy.",
    d: "If every source is bounded, the job can run in batch mode: operators are scheduled in stages, shuffles write to blocking storage, sort-based aggregations replace hash state, and recovery re-runs only lost stages. Streaming mode keeps all tasks running, uses pipelined exchanges and continuous snapshots. Semantics should match, but results can differ in details such as watermark behavior and output ordering. Choosing batch needs known boundedness and no processing-time dependence. Batch avoids state backends and checkpointing overhead for bounded work.",
    k: ["Batch mode for bounded inputs vs streaming mode for everything: batch uses fewer resources and recovers by stage, while streaming reuses the identical runtime and keeps results fresh.", "Automatic selection vs explicit user choice: automatic prevents mismatches, but explicit choice makes cost and behavior predictable."],
    p: ["A backfill run in streaming mode with huge state is far slower and costlier than batch mode.", "Logic depending on processing time or arrival order gives different answers in batch mode."],
    v: "Run the same program on a fixed dataset in both modes: results must match, and the batch run should show no checkpoints and staged scheduling, while the streaming run keeps all tasks running.",
    dep: ["bounded-sources", "job-graph", "blocking-shuffle"]
  },
  "stream-graph": {
    s: "The program-level graph of operators and the exchanges between them, produced from user code or from the physical plan, before operators are merged into tasks.",
    d: "Each API call adds a node with its operator, parallelism and output type, and each connection records how records move: forward, hash by key, rebalance or broadcast. Code generation for relational operators produces the operator bodies. Slot sharing groups, uids and max parallelism are attached here. The stream graph is the last stage where the structure still matches what the user wrote. Hard parts are choosing exchange types that preserve order and key locality, and attaching stable identities for state mapping.",
    k: ["Exchange type chosen per edge vs one global partitioning: each edge uses the cheapest transfer that is correct, but the user or planner must reason about ordering on each one.", "Operators described as logical nodes with parallelism vs fixed physical instances: parallelism can change later, but the graph cannot express per-instance behavior."],
    p: ["Forward edges between operators of different parallelism are silently turned into rebalancing, which changes locality and order.", "Missing identities make later state mapping fragile."],
    v: "Print the stream graph for a keyed aggregation: it should show a hash exchange before the aggregate, forward edges elsewhere, and the parallelism and identity of every node.",
    dep: ["dataflow-operators", "partitioners", "operator-uids"]
  },
  "job-graph": {
    s: "The scheduler-facing graph produced from the stream graph after operator chaining, whose vertices are chains that run as tasks and whose edges are the data exchanges.",
    d: "Chained operators are merged into single vertices, and each remaining edge becomes a pipelined or blocking data set between vertices. The job graph, together with its dependencies and configuration, is serialized and sent to the cluster. Vertices carry parallelism, slot-sharing assignments, state and checkpoint settings. The cluster expands it into the execution graph, one task per parallel instance. It is the unit of submission and is the structure compared when deciding whether state from a savepoint maps to a new version of the job.",
    k: ["Chaining decided at graph translation vs at runtime: placement and slots are known up front, but the plan cannot adapt to load.", "A serialized graph shipped to the cluster vs executing the program on the cluster: submission is cheap and portable, but user code must be packaged and its dependencies shipped."],
    p: ["A change in chaining or vertex order alters the graph and can break restore from older snapshots.", "A very large graph slows scheduling and checkpoint coordination."],
    v: "Submit the same job twice and diff the serialized graphs: vertex identities and edge types must be identical, and a modified operator order must show up as a changed vertex.",
    dep: ["stream-graph", "operator-chaining"]
  },
  "operator-chaining": {
    s: "Fuses consecutive operators with a one-to-one connection and equal parallelism into one task, passing records by direct method call instead of through serialization and buffers.",
    d: "Two operators can be chained if they are connected forward with the same parallelism, and the downstream has no other input, and both permit chaining. A chain runs on one thread, and a record is handed over as an object, avoiding serialization, queues and thread switches. It lowers latency and CPU, but the whole chain is one unit for scheduling and for backpressure and a slow operator slows its chain. Chains can be broken deliberately to isolate heavy operators or to gain parallelism on one stage.",
    k: ["Chain by default vs separate tasks: chaining removes serialization and thread hops, whereas breaking a chain isolates a slow operator and shows it separately in metrics.", "Per-operator parallelism vs chains of equal parallelism: independent scaling for each stage means more exchanges and fewer chains."],
    p: ["A blocking call in one chained operator stalls checkpoint barriers for the whole chain.", "A chain that mixes light and heavy operators hides the bottleneck in a single task metric."],
    v: "Compare a job with chaining on and off at equal parallelism: the chained one should show fewer tasks, no serialization on the internal edge, and measurably lower latency and CPU per record.",
    dep: ["job-graph", "mailbox-thread-model"]
  },
  "event-time": {
    s: "The timeline defined by timestamps inside records, recording when events actually happened, which makes results independent of arrival delays and reproducible when data is replayed.",
    d: "Each record carries a timestamp assigned at the source or extracted from a field. Operators that depend on time, such as windows, timers and interval joins, use these timestamps and the watermark rather than the machine clock. This yields the same result for a live run and a replay of the same data, even when delivery order differs. It needs a way to decide when time has progressed enough: the watermark. The trade is that results wait for stragglers, and a missing or mistaken timestamp corrupts them.",
    k: ["Event time vs processing time: results are correct and replayable regardless of delays, but latency is tied to how late data can be and the logic is harder to reason about.", "Timestamps from the payload vs from the transport: payload timestamps reflect the real event, transport timestamps are always present but reflect ingestion."],
    p: ["Timestamps in the wrong unit, such as seconds treated as milliseconds, place every event in January 1970 and windows never close.", "Events with future timestamps push the watermark ahead and make later events late."],
    v: "Replay a recorded day of data at ten times speed and compare windowed results with the live run: they must match exactly, even though arrival timing is very different.",
    dep: ["timestamp-assigners", "watermark-propagation"]
  },
  "processing-time": {
    s: "The machine's wall clock when a record is processed; simple and lowest latency, but results depend on speed, load and restarts and are not reproducible.",
    d: "Operators that use processing time read the local clock and register timers against it. Window firing happens on wall-clock boundaries with no watermark, no waiting for late data and no out-of-order issue. This suits monitoring and approximations where freshness matters more than exactness. The same input processed twice gives different results, because assignment depends on when each record happened to arrive. After a failure, backlog is processed in a burst, so counts per wall-clock window reflect recovery, not the real traffic.",
    k: ["Processing time vs event time: no watermark logic and the lowest latency, but results cannot be reproduced and backlog distorts them.", "Mixing both in one job: each operator can use the right clock, but the job then has results that are only partly reproducible."],
    p: ["After a restart the backlog is processed in minutes and lands in a few windows, producing a false spike in the metric.", "Tests using processing time are flaky because they depend on scheduling."],
    v: "Pause a job for a minute, resume, and look at per-window counts: a processing-time window shows a spike on resume, while an event-time window over the same data shows the true distribution.",
    dep: ["timer-service"]
  },
  "timestamp-assigners": {
    s: "Extract or assign an event timestamp for each record, at the source or right after it, so downstream time-based operators have a time to work with.",
    d: "An assigner reads a field from the record, or takes the connector's timestamp such as a log append time, and attaches it as record metadata. It is applied as close to the source as possible so per-partition order is preserved and watermarks reflect real arrival patterns. Timestamps are metadata, separate from the payload, and stay with the record through operators. Assignment bugs are quiet: a wrong field or unit makes windows wrong but the job healthy.",
    k: ["Assigning at the source vs after a shuffle: per-partition order lets watermarks stay tight, while later assignment sees a mixed stream with more disorder.", "Timestamp from payload vs connector metadata: payload is the true event time, metadata is reliable but tied to ingestion."],
    p: ["Assigning timestamps after a keyed shuffle makes disorder much larger and needs a far larger lateness bound.", "A null or unparsable timestamp field fails the job or assigns minimum time."],
    v: "Feed a record whose payload time is two hours old and check the record timestamp seen by a downstream process function: it must equal the payload time, not the ingestion time.",
    dep: ["event-time", "split-readers"]
  },
  "watermark-generators": {
    s: "Produce watermarks, assertions that event time has reached a point, usually the maximum timestamp seen so far minus a bound on expected out-of-orderness.",
    d: "A generator observes each record's timestamp and periodically emits a watermark. The common strategy tracks the maximum timestamp and subtracts a fixed delay; strictly ascending data needs no delay. Generation can be periodic, bounded by a wall-clock interval, or punctuated by special records. Generators run per source split, so partitions are tracked independently and then combined. The bound is a tradeoff: small bounds give low latency and many late records, large bounds make results wait.",
    k: ["Bounded out-of-orderness vs perfect watermarks: bounded delay is practical and tunable, while a perfect watermark is not possible without knowing the future.", "Periodic emission vs per-record: periodic is cheap, per-record is exact but multiplies downstream traffic."],
    p: ["A delay bound set from average lateness instead of tail lateness drops a steady percentage of records as late.", "A single misbehaving producer sending a far-future timestamp pushes time ahead."],
    v: "Inject records with known disorder of up to five seconds and a five-second bound: no record may be reported late, and with a one-second bound the late-record counter must rise.",
    dep: ["timestamp-assigners", "event-time"]
  },
  "watermark-propagation": {
    s: "Moves watermarks through the graph: each operator takes the minimum over its input channels, forwards it, and uses it to fire timers and windows.",
    d: "Watermarks are special elements flowing in the data channels. An operator tracks the latest watermark per input channel and its own watermark is the minimum of them, forwarded when it advances. After a shuffle each task therefore waits for the slowest upstream task. When the watermark advances past a timer or window end, the operator fires it. Operators that change timestamps must not move time backwards. One slow or stalled partition holds back every downstream result, which is why idleness matters.",
    k: ["Minimum across inputs vs per-input handling: the minimum guarantees no record is ever behind the watermark, but one slow input stalls everything.", "Watermarks as in-band elements vs a separate channel: in-band keeps them ordered with the data, but they are subject to the same backpressure delay."],
    p: ["One partition with no data holds the watermark at its old value, so windows never fire and the job looks healthy.", "Backpressure delays watermarks as much as data, so time appears to stall."],
    v: "Stop one source partition and read the watermark metric on downstream operators: it must freeze at that partition's last value, and resume once data or an idleness mark arrives.",
    dep: ["watermark-generators", "input-gates", "timer-service"]
  },
  "idleness-handling": {
    s: "Marks an input that has produced nothing for a while as idle, so it no longer holds back the combined watermark, and reactivates it when data arrives.",
    d: "A source split or channel with no records for a configured timeout emits an idle marker. Downstream operators exclude idle inputs when computing the minimum watermark. When a record arrives again the input becomes active, and its first records may be behind the current watermark and therefore late. Idleness is a trade of liveness against completeness: waiting longer keeps results complete, a shorter timeout lets results progress. It matters most with more partitions than data, bursts, and low-traffic keys.",
    k: ["Short idleness timeout vs long: short keeps windows firing on sparse data, but a briefly quiet partition then produces late records when it resumes.", "Excluding idle inputs vs advancing time by processing clock: exclusion is deterministic given the marker, wall-clock advance is simpler but not replayable."],
    p: ["Partitions that wake up after being marked idle send records that are already late, and they are dropped.", "No idleness timeout with fewer keys than partitions leaves the pipeline stuck."],
    v: "Run a source with eight partitions and data on only three: with idleness off the downstream watermark must not advance, and with a five-second timeout it must advance after five seconds.",
    dep: ["watermark-propagation", "watermark-generators"]
  },
  "timer-service": {
    s: "Lets operators register callbacks for a future event time or processing time, deduplicated per key and persisted in state so they survive failures and rescaling.",
    d: "Each timer is a key, a namespace and a timestamp. Event-time timers fire when the watermark passes them, processing-time timers when the clock reaches them. Timers are kept in priority queues per key group and are part of the snapshot, so a restored job fires timers that were pending. Registering the same timer twice has no effect. Window operators are implemented with timers for emission and cleanup. The difficulty is volume: millions of timers cost memory and CPU, and timers on a rescaled job must be redistributed with their keys.",
    k: ["Timers stored in the state backend vs on the heap: a backend-stored queue scales with disk but each access is slower, the heap queue is fast but bounded by memory.", "Deduplicated timers per key and timestamp vs one per registration: deduplication bounds the queue, but callbacks cannot carry per-registration data."],
    p: ["Registering a timer per record with unique timestamps creates one entry per record and exhausts memory.", "A very slow timer callback blocks the task thread and delays barriers."],
    v: "Register a timer ten minutes ahead, take a snapshot, restart from it, and advance the watermark: the callback must fire once, at the correct time, with the correct key.",
    dep: ["watermark-propagation", "state-backend-interface", "key-groups"]
  },
  "late-data-policy": {
    s: "The rules for records that arrive after the watermark has passed their timestamp: drop them, include them in updated results, or route them to a side output.",
    d: "A record is late when its timestamp is behind the current watermark. The default for windows is to drop it, count it in a metric, and optionally send it to a side output. With allowed lateness, a window whose end passed is kept until the lateness limit and refires with updated results. Beyond that, state is cleaned. Process functions choose their own policy. The decision balances completeness against latency and state retention, and the downstream system must accept corrections when updates are emitted.",
    k: ["Drop with a metric vs update results: dropping is simple and bounds state, but updating gives eventually correct totals at the cost of retaining window state and emitting corrections.", "Larger watermark delay vs allowed lateness: delay postpones every result for everyone, lateness corrects only the windows that need it."],
    p: ["Late records are dropped without a counter or side output, so totals drift without any signal.", "Refired window results are written to a sink as new rows instead of updates and double count."],
    v: "Send a record older than the watermark and verify one of three outcomes as configured: the late counter increments, the window result is updated, or it appears on the side output; never silently missing.",
    dep: ["watermark-propagation", "side-outputs", "allowed-lateness"]
  },
  "tumbling-windows": {
    s: "Fixed-size, non-overlapping windows aligned to a clock, so each record belongs to exactly one window, such as each five-minute interval.",
    d: "The assigner maps a timestamp to the window that contains it by rounding down to a multiple of the size plus an optional offset. One window is active per key and period, so state is small. The window fires when the watermark passes its end, then is cleaned after the lateness period. Time zones and daylight saving changes matter for day-sized windows, so offsets must be set deliberately. It is the cheapest window and the default for periodic aggregates.",
    k: ["Aligned to epoch vs aligned to first record: epoch alignment gives comparable windows across keys and jobs, first-record alignment spreads firing load but results are not comparable.", "Large windows vs small: large windows hold more state until firing, small windows emit more often and load the sink."],
    p: ["Day windows without a time zone offset produce boundaries at midnight UTC that surprise local users.", "All windows for all keys fire at the same instant, producing a burst against the sink."],
    v: "Feed records at known timestamps across a boundary and check the output: each record must appear in exactly one window with the expected start and end, including records exactly on the boundary.",
    dep: ["window-operator", "event-time"]
  },
  "sliding-windows": {
    s: "Fixed-size windows that overlap because they start every slide interval, so each record belongs to size divided by slide windows, giving smooth moving aggregates.",
    d: "A record is assigned to every window whose range covers its timestamp, so a one-hour window sliding every minute assigns each record to sixty windows. With incremental aggregation, each window keeps a small accumulator, but the update cost and state grow with the overlap factor. Each window fires when the watermark passes each end. Variants optimize by combining panes, sub-windows of the slide size, which are aggregated then merged. Without such optimization, small slides on large windows are expensive.",
    k: ["Per-window accumulators vs panes: per-window is simple but cost multiplies with overlap, panes cut the work but need an aggregation that can be merged.", "Small slide vs large slide: small gives smooth output and heavy load, large reduces cost and gives coarser steps."],
    p: ["A one-day window sliding by one second creates tens of thousands of windows per key and runs out of state.", "A non-mergeable aggregate cannot use panes and silently costs far more than expected."],
    v: "Run a ten-minute window sliding by one minute and check that each record contributes to exactly ten window results, and that state size scales with overlap as predicted by the formula.",
    dep: ["window-operator", "incremental-window-aggregation"]
  },
  "session-windows": {
    s: "Session windows are defined by activity: records for a key belong to one session until a gap of inactivity longer than a threshold closes it, so size varies per key.",
    d: "Each record starts a proto-window from its timestamp to timestamp plus gap. When windows for the same key overlap, they are merged into one, and the aggregate and any registered timers merge too. The session fires when the watermark passes its end. Because boundaries depend on data, state per key can contain several open windows, and a late record can bridge two sessions into one, refiring an already emitted result. Merging needs an aggregation that can combine accumulators.",
    k: ["Data-driven merge vs fixed boundaries: sessions match real user behavior, but window state and logic is heavier and results can be revised by late data.", "Short gap vs long gap: short gap splits activity into many sessions, long gap holds state open and delays results."],
    p: ["A late record that bridges two closed sessions causes a merged result for data that was already emitted separately.", "A key that never goes quiet produces a session that never closes and grows without bound."],
    v: "Send records at t=0 and t=30s with a 20-second gap, then a late record at t=15s: the result must change from two sessions to one merged session and be emitted again as a correction.",
    dep: ["window-operator", "timer-service", "late-data-policy"]
  },
  "global-windows": {
    s: "A single window per key that never ends on its own, so emission is controlled entirely by a custom trigger and eviction, used for count-based or custom-logic windows.",
    d: "All records for a key belong to one window that covers all time. By default nothing fires, so a trigger must decide when to emit, for example every hundred records, and when to purge. Without a purge, state grows with the number of records for the key. It provides the window API's state handling and trigger hooks for logic that does not fit time-based assignment. When all of this is needed per key anyway, a process function is often simpler and clearer.",
    k: ["Global window with custom trigger vs a process function: reuse of the window machinery and aggregations, but the trigger contract is subtle and cleanup is easy to forget.", "Count-based emission vs time-based: counts are predictable in volume but the timing of results depends on input rate."],
    p: ["No purge in the trigger accumulates every record forever.", "A count trigger on a slow key holds its last partial batch indefinitely unless a timeout is also set."],
    v: "Use a count trigger of 100 and send 250 records for one key: results must be emitted after record 100 and 200, with 50 records held, and window state must be purged after each firing as configured.",
    dep: ["triggers", "window-operator"]
  },
  "triggers": {
    s: "Decide when a window emits its result: on watermark passing the end, on element count, on processing time, early and repeatedly, and whether the window contents are kept or purged.",
    d: "A trigger is called for every record, on each timer, and when windows merge. It returns one of continue, fire, purge or fire-and-purge. The default for event-time windows fires once when the watermark passes the end. Custom triggers add early firing to show speculative results before completion, and late firing after the end for late records. Trigger state is kept per window. Emitting repeatedly turns the output into a series of updates, so the consumer must handle updates, not just one final row.",
    k: ["Single firing at window end vs early and late firings: one result is simple and final, while early results give freshness at the cost of updates the sink must handle.", "Fire-and-keep vs fire-and-purge: keeping makes later results cumulative, purging makes each result a delta and saves state."],
    p: ["Early firing every second on millions of keys floods the sink with updates.", "Mixing purge with allowed lateness drops contents needed to correct later results."],
    v: "Configure early firing every ten seconds for a one-minute window and confirm that results appear each ten seconds and a final result at the end, each cumulative and consistent with the previous one.",
    dep: ["window-operator", "timer-service"]
  },
  "allowed-lateness": {
    s: "Keeps a window's state for a bounded period after its end so late records can still update it, re-emitting corrected results until the lateness limit passes.",
    d: "When the watermark passes the window end, the window fires its first result, but state is retained until watermark passes end plus lateness. Each late record within the limit triggers a further firing with the updated aggregate. After the limit, state is deleted and further records go to the late-data side output or are dropped. Retention multiplies state: every window stays resident for the extra period. Output must be an update or the consumer receives duplicates for the same window.",
    k: ["Retaining window state for lateness vs dropping after firing: corrections are possible, but state grows with window count times lateness and results change after being published.", "Per-window lateness vs a global watermark delay: lateness affects only affected windows, delay slows all results."],
    p: ["A day of allowed lateness on minute windows keeps over a thousand windows per key in state.", "Downstream treats each refiring as a new fact and counts the window twice."],
    v: "Set lateness to ten minutes, send a record five minutes after the window fired: a second result with the updated total must be emitted, and a record eleven minutes late must go to the side output.",
    dep: ["window-operator", "late-data-policy", "state-ttl"]
  },
  "window-operator": {
    s: "The operator that assigns records to windows, holds per-window state, registers cleanup and firing timers, calls the trigger, and emits results with the window's time bounds.",
    d: "For each record the operator calls the assigner, adds the record or updates its accumulator in window state keyed by key and window, and consults the trigger. Timers fire the trigger when the watermark or clock reaches a boundary. On firing it passes window contents or the accumulator to the user function and attaches window start and end. Cleanup timers delete state after lateness. Session windows additionally merge state. Per-key per-window state is the dominant cost, which makes the choice of aggregation important.",
    k: ["Buffering all records vs incremental accumulators: buffering allows any function over the full contents but state grows with records, accumulators keep state constant but limit the function.", "A generic window operator vs specialized ones: generic is flexible, specialized variants cut overhead, at the cost of fewer options and tuning knobs."],
    p: ["Buffering every record in a long window makes state the size of the data, not of the result.", "Forgetting that cleanup runs on a timer means state lingers when the watermark stalls."],
    v: "Run a window query and compare state size to window count: with incremental aggregation the size per window must stay constant as records arrive, and after the lateness period it must drop to zero.",
    dep: ["triggers", "timer-service", "keyed-stream-api", "value-state"]
  },
  "incremental-window-aggregation": {
    s: "Folds each record into a compact accumulator as it arrives instead of buffering the records, so window state size is independent of how many records fall into the window.",
    d: "The user supplies an aggregate with three steps: create accumulator, add a record, and merge two accumulators, plus a result extractor. The window operator stores one accumulator per key and window and updates it on every record. Results are produced from the accumulator at firing. Session windows and panes need the merge step. It is efficient but limited to aggregations that can be expressed as an accumulator; median or distinct counts need approximate sketches or buffering.",
    k: ["Accumulator state vs buffering records: constant space and fast firing, but only aggregates that decompose incrementally are possible.", "Approximate sketches vs exact buffering for distinct counts and quantiles: sketches have bounded size and bounded error, exact needs all values."],
    p: ["An accumulator that holds a growing collection, such as a set, erases the space advantage.", "A merge function that is not associative gives different results for session windows depending on arrival order."],
    v: "Aggregate a million records into one window and check state size: it must match the size of one accumulator, and results must equal a batch computation over the same records.",
    dep: ["window-operator", "type-system"]
  },
  "window-join": {
    s: "Joins two streams on a key and a shared window: records pair only if they fall into the same window, and results are emitted when the window closes.",
    d: "Both inputs are keyed and assigned to the same window assigner. For each key and window, records from both sides are buffered, and when the window fires the cross product of matching records is emitted. State is bounded by window size, and cleanup follows the window. Outer variants emit unmatched records at firing. The semantics are simple but coarse: two records a second apart that straddle a boundary never join, which is why interval joins exist.",
    k: ["Window join vs interval join: windows give simple, batched semantics and bounded state, but miss pairs that cross a boundary.", "Emit at window end vs on arrival: emitting at end is complete and ordered, emitting on arrival is lower latency but needs a different operator."],
    p: ["Records just either side of a boundary never match, producing missing pairs that look like data loss.", "A large window with a high-cardinality key buffers both sides in full."],
    v: "Send matching records at 59 and 61 seconds with a one-minute tumbling window: they must not join, whereas matching records at 10 and 50 seconds must join once.",
    dep: ["window-operator", "tumbling-windows", "keyed-stream-api"]
  },
  "interval-join": {
    s: "Joins records from two keyed streams whose timestamps differ by at most a given interval, buffering each side only for as long as a match is still possible.",
    d: "For a record on one side, the operator looks up buffered records of the other side with the same key and timestamp in a bounded range, and emits each pair. Each record is buffered until the watermark proves no partner can still arrive, then cleaned by a timer. State is therefore bounded by the interval size and rate. Records in event time only; input must carry timestamps and a sensible watermark. Lateness matters: a late record is dropped from the join.",
    k: ["Relative time bounds vs fixed windows: no boundary artifacts and bounded state, but each record can match many partners and the operator is less general.", "Buffering both sides vs one side only: both is symmetric and flexible, one side saves state if one stream is known to arrive first."],
    p: ["A wide interval multiplies state and output, producing a join explosion for hot keys.", "Lagging watermarks on one input delay cleanup, which keeps the buffers large."],
    v: "Join orders to shipments with a bound of plus or minus four hours and send pairs at 3.9 and 4.1 hours apart: the first must join, the second must not, and state must shrink once the watermark passes.",
    dep: ["timer-service", "keyed-stream-api", "event-time", "map-state"]
  },
  "regular-join": {
    s: "A relational join over unbounded inputs with no time bound, which must keep every record from both sides in state indefinitely unless retention is limited.",
    d: "Each input is stored in keyed state, usually as the list of rows per join key. A new row on one side is joined with all stored rows on the other and the results are emitted, with updates or retractions when the inputs themselves are changelogs. Semantically it matches a batch join, which makes it the most general. It is also the most expensive: state size is the full history of both inputs, so a retention period or a time-bounded variant is usually needed.",
    k: ["Unbounded join vs time-bounded join: exact results over all history, but state grows without bound unless retention is set.", "Storing rows per key as lists vs with a unique key index: lists handle any join, key indexes make updates faster when a unique key exists."],
    p: ["Both inputs retained forever fill the state backend after weeks of operation.", "A hot join key makes one lookup return a large list on every record."],
    v: "Run a join between two high-volume streams and watch state size over a day: it should grow in line with the retention setting, and results must match a batch join of the same data over the same period.",
    dep: ["join-state-ttl", "map-state", "changelog-streams"]
  },
  "temporal-table-join": {
    s: "Joins each record of a stream with the version of a changing table that was valid at the record's timestamp, giving point-in-time-correct enrichment.",
    d: "The right side is a versioned table: a changelog with a key and a time attribute. The operator keeps versions per key in state and, for each left record, picks the version valid at its timestamp, waiting for the right side's watermark to pass that timestamp so late updates are not missed. Old versions are cleaned once the watermark passes. The result is reproducible, because it uses event time, unlike a lookup of the current value. The cost is state for versions and added latency waiting for the watermark.",
    k: ["Versions by event time vs latest value: results are correct and replayable, but latency waits on the slower input's watermark and state keeps multiple versions.", "Processing-time temporal join vs event-time: processing time is immediate and stateless but cannot reproduce past results."],
    p: ["A quiet right-side input holds its watermark, so the join stalls.", "Right-side keys updated rarely accumulate versions that never clean without retention."],
    v: "Update an exchange rate at 10:00 and send a transaction stamped 09:59 and one stamped 10:01: the first must use the old rate and the second the new one, also when replayed in reverse order.",
    dep: ["event-time", "watermark-propagation", "changelog-streams", "map-state"]
  },
  "lookup-join": {
    s: "Enriches each record by querying an external table, such as a database, at processing time for the key, optionally with a cache and asynchronous requests.",
    d: "For each incoming record the operator reads the current value from an external system by key, joins it, and emits the result. The external system is not versioned, so results reflect whatever the table held at that moment and are not reproducible after replay. A cache with time-to-live reduces calls and latency, and asynchronous requests hide latency. It is simple to set up and uses no state for the table. It is limited by the capacity and latency of the external system and by freshness of the cache.",
    k: ["Lookup against the live external table vs a temporal join with a changelog: lookups need no state and have a simple setup, but results are not deterministic and depend on the external load.", "Cache with a short time-to-live vs none: fewer calls and lower latency, but results can lag behind recent changes."],
    p: ["A cache miss storm after a restart overloads the external database.", "Reprocessing historic data joins it with today's dimension values instead of the values from then."],
    v: "Change a row in the external table and send two records for its key, before and after the cache expires: the first uses the old value and the second the new one, and the database request count shows cache hits.",
    dep: ["async-io-operator", "keyed-stream-api"]
  },
  "join-state-ttl": {
    s: "A retention limit for join state, after which rows are removed so unbounded joins stop growing, at the price of missing matches for rows older than the limit.",
    d: "Join state entries carry a last-access or last-write time. A cleanup mechanism, on timers or during backend compaction, deletes entries older than the configured retention. Any record arriving after its partner's state was removed no longer matches, so results become approximate for old data. The retention should be chosen from the largest real delay between related records, with a margin. It is a correctness setting, not only a memory one, and should be monitored with a counter of expired lookups if available.",
    k: ["Retention longer than the max business delay vs shorter: long retention is correct and costs state, short retention saves memory but silently loses matches.", "Refresh retention on read vs only on write: on read keeps active keys alive and inactive ones expire, on write is simpler and predictable."],
    p: ["Retention chosen by memory budget alone loses matches for slow business processes without any error.", "Cleanup on timers over millions of keys creates periodic CPU spikes."],
    v: "Set retention to one hour, send the left row, wait 61 minutes, send the right row: they must not join, and state size must drop after the retention period passes.",
    dep: ["state-ttl", "regular-join"]
  }
});
