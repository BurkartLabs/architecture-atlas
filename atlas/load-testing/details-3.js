// Details for the load testing plate, part 3: timing, metrics pipeline, target safeguards, correlation, cross-cutting concerns.
ATLAS.details("load-testing", {
  "high-resolution-timer": {
    s: "A monotonic clock with microsecond or better resolution, read cheaply on the hot path, from which every latency and every scheduled start is derived.",
    d: "Timers read a monotonic counter provided by the operating system or hardware, unaffected by wall-clock adjustments. A request's latency is the difference of two reads, taken as close to the actual send and receive as possible. The read itself must be cheap, since it runs twice per request, and its resolution must be far below the latencies measured. It is hard because the clock read, thread migration between cores and virtualization can each add noise, and where the timestamp is taken defines what the number means.",
    k: ["Timestamp at the socket versus at the application: socket-level is closer to the wire and needs lower-level hooks; application-level includes the generator's own queueing.", "Reading the clock per request versus a cached coarse clock: per request is exact and costs a little; a cached clock is cheap and rounds to milliseconds."],
    p: ["A wall clock is used for durations, and a time adjustment produces negative or huge latencies.", "The start timestamp is taken before the request waits in a local queue, so generator delay is counted as target latency."],
    v: "Time a stub that sleeps for a known interval, such as five milliseconds, and confirm the recorded latency equals it within the timer's resolution across many samples, with no negative values.",
    dep: []
  },
  "coordinated-omission-correction": {
    s: "Compensating for the bias that arises when a stalled response delays the requests that should have been sent meanwhile, so those never-sent requests' waiting is counted.",
    d: "If a test sends the next request only after the previous returns, then a long stall suppresses all the requests that would have been issued during it, and only one slow sample is recorded. The result understates tail latency badly. Correction measures latency from the intended send time on the schedule, or fills in the missing samples. It is hard because it requires a schedule of intended times, which closed models lack, and because correcting a model that was supposed to be closed changes its meaning.",
    k: ["Measure from the intended start versus from the actual send: intended-start charges queueing delay to the target as real users would feel it; actual-send hides it.", "Open arrivals that never wait versus statistical back-filling afterwards: open arrivals avoid the bias by construction; back-filling repairs closed data and assumes the expected interval."],
    p: ["A ten-second stall appears as one slow sample in a stream of a million, and the report shows a fine p99.9.", "Intended-time measurement is enabled for some scenarios and not others, and runs cannot be compared."],
    v: "Freeze the target for ten seconds mid-run at a fixed request rate and confirm the reported high percentiles reflect the roughly tens of thousands of delayed requests, not a single one.",
    dep: ["arrival-rate-controller","high-resolution-timer","histogram-recorder"]
  },
  "latency-breakdown": {
    s: "Splitting each request's time into phases such as name lookup, connect, handshake, send, wait for first byte and transfer, to show where the time goes.",
    d: "The client records a timestamp at each phase boundary and stores the durations beside the total. The wait for the first byte approximates server processing plus network, while transfer time depends on response size and bandwidth. Breakdowns allow a report to say that connect time grew while server time did not. It is hard because phases overlap with reused connections, where connect and handshake are zero, and because storing many values per sample multiplies the data volume.",
    k: ["Recording all phases for every request versus for a sample: all phases give full fidelity at several times the data; sampling is cheap and can miss rare slow phases.", "Reporting phases separately versus only the total: separate phases localize a problem, while totals are simpler to threshold and compare."],
    p: ["Connection reuse makes the connect phase zero for most requests, so a phase average hides the cost of the requests that did connect.", "Transfer time is included in latency for large responses, and a bandwidth limit on the generator is read as slow server processing."],
    v: "Add a fixed delay at the target before responding and confirm only the wait phase grows by that amount, while connect and transfer stay unchanged.",
    dep: ["high-resolution-timer","http-client"]
  },
  "response-validation": {
    s: "Deciding for each response whether it was correct enough to count as a success, using status, content checks and expected timing rules.",
    d: "Validation runs the configured checks on each response and attaches the verdict to the sample. It distinguishes protocol success from functional success, such as a valid status carrying an error message. Validation cost counts against the generator, so rules are cheap and run after the latency timestamp is taken. It is hard because success is context dependent: a slow success may be a failure for the user, and an expected rejection, such as a validation error from a deliberate bad input, is a success of the test.",
    k: ["Validate every response versus a sample: every response gives exact error rates and costs CPU; sampling is cheap and misses rare errors.", "Validation before versus after the end timestamp: after keeps check cost out of the latency; before is wrong as latency includes generator work."],
    p: ["Validation time is included in the latency, and heavy body parsing inflates results.", "An expected 404 for a deliberate negative case is counted as an error and fails the run."],
    v: "Feed a stub returning mixed correct and corrupted bodies at known proportions and confirm the reported failure fraction matches, with latency unchanged by validation cost.",
    dep: ["checks-and-assertions","high-resolution-timer"]
  },
  "error-classification": {
    s: "Grouping failures by cause, such as timeout, refused connection, reset, protocol error, server error or failed check, so counts are interpretable.",
    d: "Each failed request is labeled by where it failed and why, using codes from the transport, the protocol and the checks. Reports show error rates by class over time. Classification separates failures originating in the generator, like local resource exhaustion, from those in the target or network. It is hard because the same symptom has several causes, for example a timeout may mean a slow server or a lost packet, and because over-fine classes bury the signal in dozens of rare types.",
    k: ["Few coarse classes versus many fine ones: coarse classes are readable and merge distinct causes; fine classes are precise and noisy.", "Counting timeouts as errors versus separate class: timeouts as errors keep a single rate; a separate class shows saturation versus faulty responses."],
    p: ["Local port exhaustion appears as connection refused and the team debugs the target.", "Errors are counted only as non-success statuses, so connection resets that produced no status are missing from the error rate."],
    v: "Inject each failure type in turn, such as dropped packets, refused connections and slow responses, and confirm each appears under its own class with the correct source label.",
    dep: ["response-validation","port-and-socket-limits"]
  },
  "histogram-recorder": {
    s: "A compact structure that records each latency into logarithmic buckets, keeping the whole distribution at fixed memory with bounded relative error.",
    d: "Rather than storing every sample, the recorder increments a counter in the bucket that covers the value. Bucket widths grow with magnitude so relative precision, such as two significant digits, holds from microseconds to minutes. Recording takes a few operations and no allocation, which keeps it off the hot path. Percentiles are read from cumulative counts. It is hard because the precision setting trades memory for accuracy, and because recorders must be written without locks across threads.",
    k: ["Histograms versus storing raw samples: histograms use fixed memory and merge exactly; raw samples allow any later analysis and cost memory in proportion to the request count.", "Higher precision versus lower: higher precision gives accurate tails at more memory per histogram, which multiplies across scenarios and intervals."],
    p: ["A histogram range is set too low, and values beyond it are clamped, so extreme stalls are cut off at the maximum.", "One shared recorder is updated by many threads with contention, and the recording slows the generator."],
    v: "Record a known distribution with a hundred million values and confirm each percentile is within the configured relative error of the exact value, using little memory and without contention.",
    dep: ["high-resolution-timer"]
  },
  "throughput-counters": {
    s: "Counters of requests, bytes, successes and failures per interval, giving the achieved rate that is compared with the planned rate.",
    d: "Per-thread counters are incremented on each completion and summed at intervals, then reported as rates. They distinguish requests started, requests completed and requests failed, because under stress these diverge. Achieved throughput against offered load is the basic capacity curve. It is hard because a requests-per-second figure depends on what a request is: a page with many sub-requests or one operation, and because completions lag starts, so counting by completion time shifts load between buckets.",
    k: ["Counting at start versus at completion: starts show the offered load; completions show delivered throughput; both are needed to see saturation.", "Per-thread counters merged periodically versus a shared atomic counter: per-thread avoids contention and has small delay; shared is simpler and slows at high rates."],
    p: ["Only completed requests are counted, and when the target stalls the throughput appears to drop, though the generator kept sending.", "Retries are counted as separate requests, and throughput looks higher than the number of user operations."],
    v: "Offer a known rate against a stub of known capacity and confirm offered, completed and failed counts per interval satisfy offered equals completed plus failed plus in-flight.",
    dep: ["histogram-recorder","error-classification"]
  },
  "warm-up-exclusion": {
    s: "Dropping the initial period of a run from the results, while caches, pools and compiled code in the target settle, so the numbers describe steady state.",
    d: "A cold target is slow for a while: caches empty, connection pools small, code not yet optimized, autoscaling not yet reacted. The tool marks an initial window as warm-up, still runs it at load, and keeps its data separate from the measured window. The exclusion can be a fixed time or based on stability detection. It is hard because the right length depends on the target, and excluding too much hides startup behavior that users meet after every deploy.",
    k: ["Fixed warm-up period versus automatic stability detection: fixed is predictable and wrong on some systems; detection adapts and can be fooled by slow drift.", "Excluding warm-up from reports versus showing it separately: excluding gives clean numbers; showing it separately keeps cold-start behavior visible."],
    p: ["Warm-up is too short, and the measured window still includes cache fill, making every run look slow and variable.", "Warm-up is excluded without saying so in the report, and a team believes the first minutes of service performed like the rest."],
    v: "Plot latency over a run and confirm it is flat by the time the measured window starts, and that the report states the excluded duration and shows the warm-up data separately.",
    dep: ["histogram-recorder","ramp-profiles"]
  },
  "sample-buffer": {
    s: "A bounded in-memory buffer that holds recent samples or histograms on the generator until they are aggregated or shipped, without blocking the load.",
    d: "Workers write samples into per-thread ring buffers or histograms, and a separate thread drains them at intervals. The buffer has fixed size, so when the consumer is slow the tool must drop oldest samples or aggregate more coarsely, and must count what it drops. It keeps the hot path free of locks and allocation. It is hard because losing samples biases results toward the happy case, as the slowest requests finish last and are most likely lost at the end of a run.",
    k: ["Dropping samples on overflow versus blocking the producer: dropping protects the load and loses data; blocking keeps data and slows the load being measured.", "Per-thread buffers versus a shared queue: per-thread has no contention and needs merging; a shared queue is simple and contends at high rates."],
    p: ["Overflow drops samples silently, and the report's request count is below the real count.", "The final flush at test end is skipped, and the slowest in-flight requests, which matter most, never reach the report."],
    v: "Run at the highest planned rate with a slow consumer and confirm the report shows a count of dropped samples, and that totals otherwise equal the number sent.",
    dep: ["histogram-recorder"]
  },
  "local-aggregation": {
    s: "Reducing samples to per-interval histograms and counters on each generator before sending, cutting data volume by orders of magnitude.",
    d: "Every few seconds each generator folds its samples into histograms and counters keyed by scenario, request name, status class and tags, then ships that compact summary. The volume depends on the number of distinct keys, not requests. Raw samples can still be written locally for later retrieval. It is hard because tag cardinality is the real cost: tagging by user identifier or full URL creates millions of series and defeats the reduction.",
    k: ["Shipping aggregates versus raw samples: aggregates are small and fixed the questions to be asked; raw samples are flexible and expensive to move and store.", "Short aggregation intervals versus long ones: short intervals give detail and more data; long ones are cheap and blur short spikes."],
    p: ["A request name includes an identifier from the path, so each request is a separate series and the aggregates are as large as the raw data.", "A long interval smears a five-second stall into an average that looks harmless."],
    v: "Compare the data volume sent by one generator for a run with its request count, confirming that it scales with series count and not requests, and that totals match the local raw archive.",
    dep: ["sample-buffer","tags-and-labels","histogram-recorder"]
  },
  "histogram-merging": {
    s: "Combining histograms from many generators and intervals by adding bucket counts, which gives exact combined percentiles that averaging cannot.",
    d: "Because histograms with the same bucket layout are additive, the coordinator or store sums counts per bucket across generators and across time. The percentile of the combined data is read from the merged counts. Averaging each generator's p99 gives a number with no statistical meaning. Merging requires identical layout and range. It is hard because histograms with different precision or range settings cannot be added exactly, and because merging at the wrong granularity loses the ability to ask for arbitrary time windows later.",
    k: ["Merge into one run-level histogram versus keep per-interval histograms: one is small and allows only whole-run answers; per-interval allows any window and costs more storage.", "Strict layout equality versus converting between layouts: strict is exact and rigid; conversion allows mixed versions and adds error."],
    p: ["Teams average p95 from several generators and report a figure that is neither the real p95 nor an upper bound.", "A new tool version changes bucket layout, and old and new data in one chart cannot be merged."],
    v: "Split one known data set across four generators, merge their histograms, and confirm every percentile equals the value computed from the full data set within the histogram precision.",
    dep: ["histogram-recorder","local-aggregation"]
  },
  "metric-transport": {
    s: "The channel that carries aggregates from generators to the coordinator or store, with buffering, retry and ordering, and without adding load to the path under test.",
    d: "Agents send intervals of aggregated data over a persistent connection or to a message queue, with sequence numbers so duplicates and gaps are detectable. If the link breaks, data is buffered locally and sent later. The transport should use a separate network path from the load where possible. It is hard because delivery guarantees conflict with timeliness: retrying keeps data complete and delays the live view, and at-least-once delivery can double count unless intervals are idempotent.",
    k: ["At-least-once with deduplication versus best effort: at-least-once keeps totals exact at some complexity; best effort is simple and loses intervals during network trouble.", "Direct stream to the coordinator versus a broker in between: direct has fewer parts; a broker decouples and absorbs bursts but adds delay."],
    p: ["Retried intervals are applied twice, and the request totals exceed what was sent.", "Metrics share the generator's network interface with the load, and heavy load delays the very data that would reveal the saturation."],
    v: "Cut the link between one generator and the coordinator for thirty seconds mid-run and confirm that after restoration the totals equal the generator's local counts, with no duplicates or gaps.",
    dep: ["local-aggregation","time-series-store"]
  },
  "time-series-store": {
    s: "Storage optimized for timestamped numeric data, holding aggregated metrics and histograms by series for charts, queries and comparisons.",
    d: "The store keeps data keyed by metric name, tags and time, compresses it, and answers range queries and rollups. Retention is tiered: fine granularity for recent runs and coarse for old. For latency it must store distributions, not just points, or support percentile queries over merged buckets. It is hard because queries must be fast while writes arrive continuously from many generators, and because high-cardinality tags blow up index size.",
    k: ["A purpose-built store versus the team's general monitoring store: sharing reuses dashboards and mixes test data with production; a dedicated store isolates and needs its own operations.", "Storing histograms versus pre-computed percentiles: histograms support any later percentile and merging; precomputed percentiles are small and cannot be combined."],
    p: ["Only p95 and p99 points are stored, and a later question about p99.9 cannot be answered.", "Test data fills the production monitoring store and raises its cost, and alerts evaluate the test's synthetic traffic."],
    v: "Query a run for any percentile over any sub-window after the run is complete, and confirm the result matches the raw archive and returns within an interactive time.",
    dep: ["tags-and-labels"]
  },
  "raw-sample-archive": {
    s: "Long-term storage of every request's record, with timestamps, status and phases, for detailed analysis of a single run's anomalies.",
    d: "Generators write per-request records to local files in a compact columnar or line format, uploaded after the run. Analysts query it to find the slowest requests, the failing user, or the exact moment of a stall. It is large, so retention is short and writing must not disturb the load, often buffered and compressed in a separate thread. It is hard because high-rate tests produce billions of records, and writing them competes for disk and memory with the generator.",
    k: ["Archiving every request versus slow and failed requests only: everything allows any investigation at large cost; selective archives are small and omit the context of normal requests.", "Writing during the run versus holding in memory: writing needs disk bandwidth and bounds memory; holding is fast and loses data on a crash."],
    p: ["Raw writing saturates the generator's disk, and latency rises with it.", "The archive is deleted before an incident review, and only aggregates remain."],
    v: "After a run, count the records in the archive and compare with the throughput counters, then locate one deliberately slowed request by its tag and timestamp.",
    dep: ["sample-buffer","tags-and-labels"]
  },
  "tags-and-labels": {
    s: "Key-value labels attached to samples, such as scenario, request name, build and environment, which allow slicing metrics and comparing runs.",
    d: "Tags are attached by the scenario, the tool and the run configuration, and they become dimensions in aggregation and storage. Good tags are low cardinality and stable: scenario, endpoint template, region, status class. Run-level tags carry build, commit and environment so history can be filtered. It is hard because every extra dimension multiplies series, and an ad hoc tag with unbounded values, such as an identifier, makes the pipeline slow and storage large.",
    k: ["Free-form tags versus a controlled vocabulary: free-form is flexible and drifts into inconsistent names; a controlled set keeps queries working and slows adding tags.", "Tagging by URL versus by named step: URL is automatic and explodes with path parameters; a named step is manual and stable."],
    p: ["A tag contains a user identifier, producing a million series and a store that cannot keep up.", "Two teams spell the environment tag differently, and comparisons miss half of the runs."],
    v: "List the distinct values of each tag after a run and confirm each tag's cardinality is within a stated bound and every run carries build and environment tags.",
    dep: []
  },
  "environment-isolation": {
    s: "Separating the test target and its dependencies from production and from other tests, so the load does not harm real users or get distorted by others.",
    d: "A dedicated environment, or a tightly scoped portion of a shared one, runs the target with data and dependencies of the right scale. Separation covers compute, databases, caches, queues and network, and also what the load can reach, including third parties. Testing in production is done with limits, marked traffic and a stop control. It is hard because a full-size copy of a system is expensive and a smaller one changes the bottlenecks, so the claim the test makes must match the environment's fidelity.",
    k: ["A full-scale dedicated environment versus a scaled-down copy: full scale gives numbers close to production at high cost; a scaled copy is cheap and requires extrapolation that may not hold.", "Testing in production versus in a copy: production is the only faithful target and carries risk to users; a copy is safe and drifts from reality."],
    p: ["The test environment shares a database server with another team's workload, and results depend on their schedule.", "The load generator is configured with a production address by mistake, and real users experience an outage."],
    v: "Check that the test environment's addresses, credentials and data stores cannot reach production, and record the environment's size and configuration in the report next to the results.",
    dep: ["network-path-model"]
  },
  "kill-switch": {
    s: "A fast, reliable way to stop all load immediately, from the tool, from an external monitor or from a person, before damage spreads.",
    d: "The switch stops every generator, including remote ones, within seconds, and does not depend on the target being healthy. It can be triggered by a person, by the abort rules, or by an external signal such as production error rate or customer-facing alerts when testing against shared systems. A second path, such as a flag that generators poll, works if the coordinator fails. It is hard because stopping must be tested, as an untested stop is the one that fails in an incident.",
    k: ["Central stop command versus generators checking a flag: a command is immediate and needs connectivity; polling a flag survives a lost coordinator and acts after the poll interval.", "Stop at once versus drain in-flight work: at once limits damage; draining leaves clean state and keeps load on a struggling target for seconds."],
    p: ["The kill command goes through the same overloaded network as the load and arrives after minutes.", "Generators stop creating new users but let existing ones keep looping, and the load barely falls."],
    v: "Exercise the switch during a run at full load and measure the time from trigger to zero requests at the target, repeating it with the coordinator disabled.",
    dep: ["coordinator","generator-agent","abort-on-fail"]
  },
  "test-traffic-marking": {
    s: "Labeling synthetic requests, for example with a header or identity, so the target, its logs and its analytics can recognize and exclude them.",
    d: "Every request carries a marker such as a header, a test user group or a reserved identifier range. Downstream systems use it to route to test data stores, skip side effects like emails, exclude the traffic from business analytics and let operators filter logs. The marker has to propagate through services and queues. It is hard because a marker that is lost at one hop lets the test charge a card or send a message, and because a marker that changes behavior makes the test differ from real traffic.",
    k: ["Marking and diverting side effects versus real behavior: diverting is safe and tests a slightly different path; real behavior is faithful and can spend money or notify people.", "Header marker versus reserved test accounts: a header is easy and can be stripped by intermediaries; test accounts survive every hop and need provisioning."],
    p: ["A queue consumer does not read the marker, and thousands of real emails go to test addresses.", "Analytics counts the test traffic as customers and the marketing team celebrates a spike."],
    v: "Follow one marked request through the target's services and logs, confirm every hop sees the marker, and confirm no external side effect, such as an email or payment, occurs.",
    dep: ["run-markers","dependency-stubbing"]
  },
  "dependency-stubbing": {
    s: "Replacing external or costly dependencies of the target with controllable stand-ins that behave like the real ones in timing and failure.",
    d: "Third-party payment, messaging and mapping services cannot or should not be loaded. Stubs imitate them with realistic latency distributions and error rates, and the target is configured to call them. This isolates the system from the quota and cost of the real thing and lets the test explore slow dependencies. It is hard because the stub's behavior defines the result: a stub that always answers in a millisecond makes the target look faster than it will be in production.",
    k: ["Stubs with realistic latency versus instant stubs: realistic stubs reproduce thread and connection occupancy; instant stubs are simple and flatter the target.", "Stubbing a dependency versus using its sandbox: a stub is controllable and may diverge; a vendor sandbox is realistic and has unknown limits."],
    p: ["The stub answers instantly, and the target never builds up the in-flight requests it would under a slow real provider.", "The stub is not configured in one service, and the test calls the real provider at volume."],
    v: "Check the stub's latency distribution against production measurements of the real dependency, and confirm in the target's logs that no calls left for the real provider.",
    dep: ["environment-isolation","test-traffic-marking"]
  },
  "load-test-authentication": {
    s: "How test traffic gets past access controls without weakening them in the target: test credentials, dedicated clients and scoped tokens.",
    d: "Real access control, such as sessions, tokens, signed requests and rate limits, would block or distort a high-volume test. The test environment may issue many tokens from a dedicated test identity provider, or use test clients exempt from per-user rate limits. The exemption must be narrow and not a hole in production. It is hard because bypassing authentication removes real work from the measured path, and keeping it adds load on the identity system that may not be the subject of the test.",
    k: ["Real authentication in the loop versus bypass: real authentication measures the true path at the cost of loading the identity provider; bypass isolates the service and omits real work.", "Exempting test clients from rate limits versus testing under them: exempting lets capacity be found; testing under them shows the effect of production limits."],
    p: ["A rate limit exemption for the test client is left enabled in production configuration.", "Authentication is bypassed with a shared token, and the per-user code paths and caches are never exercised."],
    v: "Confirm test traffic uses the intended authentication path by inspecting the target's auth logs, and confirm the test-only exemption fails against the production configuration.",
    dep: ["credential-and-token-pools","environment-isolation"]
  },
  "data-cleanup": {
    s: "Removing or resetting the data a test created, so the next run starts from a known state and the environment does not fill with synthetic records.",
    d: "Tests create accounts, orders and files. Cleanup deletes them by marker or restores a snapshot, and runs after every test or on a schedule. Stateful targets whose data changes over a run, such as inventory counts, need reset to a known baseline for runs to be comparable. It is hard because deletes can be slower than inserts, because cascading references must be respected, and because incomplete cleanup makes each run slower than the last as tables grow.",
    k: ["Restoring a snapshot versus deleting by marker: a snapshot is exact and slow for large data; deleting by marker is quick and may miss derived records.", "Cleanup after each run versus periodically: after each run keeps runs comparable; periodic is cheaper and lets state drift between runs."],
    p: ["Test records accumulate for months, query times drift upward, and no code change is to blame.", "Cleanup runs against the wrong environment and removes real records that carry the same marker pattern."],
    v: "Compare the target's table sizes and key counters before a run and after cleanup, and confirm they match within a stated tolerance, and that real records were untouched.",
    dep: ["test-traffic-marking","unique-data-allocation"]
  },
  "network-path-model": {
    s: "Making the path between generators and target resemble the clients' real path in latency, bandwidth, loss and entry points.",
    d: "Real clients arrive over the internet, through content delivery edges and load balancers, with high and variable latency. Generators in the same data center bypass most of this and measure only the server. Placing generators in several regions, shaping latency and loss, and entering through the real front door reproduces the path. Choosing which parts to include depends on the question asked. It is hard because the generator's own network can be the limit, and because internet paths are variable and not repeatable.",
    k: ["Generators next to the target versus at distant regions: close generators isolate server capacity with clean repeatable numbers; distant ones include real network effects and noise.", "Entering through the production front door versus directly to the service: the front door tests balancers and edge layers; direct entry isolates the service and skips components."],
    p: ["Generators sit in the same rack as the target, and the test never experiences connection setup over a long, lossy path.", "A shared link between generators and target is saturated by the test, and the result describes the link."],
    v: "Measure round-trip time, loss and bandwidth from the generators to the target, compare them with what real client populations see, and confirm bandwidth use stays well below link capacity.",
    dep: ["generator-provisioning","name-resolution"]
  },
  "server-metrics-ingest": {
    s: "Pulling server-side measurements such as CPU, memory, queue depth and database activity into the test's timeline, aligned with client-side results.",
    d: "The tool queries the monitoring system or receives pushes from agents on the target's hosts for the time window of the run and stores them with the run's data, with the same tags and clock. Charts then overlay client latency with server utilization. Picking the metrics to ingest in advance, saturation signals for each tier, speeds up diagnosis. It is hard because monitoring data has its own resolution and delay, typically ten to sixty seconds, so short phenomena are invisible.",
    k: ["Pulling from the existing monitoring system versus dedicated agents: pulling reuses what exists with coarse resolution; dedicated agents give fine resolution and more to deploy.", "A fixed set of key metrics versus everything: a key set is fast and focused; ingesting everything finds surprises and costs storage."],
    p: ["Server metrics are sampled every minute, and a ten-second CPU saturation that explains the latency spike is invisible.", "Server hosts have clocks offset from the generators, and the overlay puts the cause after the effect."],
    v: "Run a load with a known CPU burn on one server tier and confirm the ingested CPU series rises at the right moment on the same timeline as the client latency increase.",
    dep: ["time-series-store","clock-sync","tags-and-labels"]
  },
  "trace-correlation": {
    s: "Linking a slow client-side request to its distributed trace in the target, so one can see which service or call took the time.",
    d: "The generator adds a trace context header to requests, or a subset of them, and records the trace identifier in the sample. Analysts open the trace of the slowest or failed request and see the call tree with timings. Sampling of traces is set up so that the test's slow requests are retained, since typical sampling drops most. It is hard because tracing itself adds overhead and may be sampled differently under load, and because the worst requests are the ones most likely to be dropped by head-based sampling.",
    k: ["Tracing every test request versus sampling: every request makes the worst case always available at overhead and cost; sampling is cheap and may drop the slow ones.", "Generator-assigned trace identifiers versus ones assigned by the target: generator-assigned lets the sample record the identifier directly; target-assigned needs a return header."],
    p: ["Trace sampling at the target drops ninety-nine percent of requests, and the slowest request has no trace.", "Full tracing during the test adds enough overhead that the measured latency no longer matches an untraced run."],
    v: "Take the slowest request in the run report, look up its trace identifier and confirm a complete trace exists whose total duration matches the recorded latency less network time.",
    dep: ["raw-sample-archive","run-markers","http-client"]
  },
  "run-markers": {
    s: "Identifiers and events that tie target-side logs, traces and metrics to a specific test run, scenario and moment.",
    d: "Each run has an identifier carried in a header or tag on its requests and posted as an event at start, stage changes and end to the target's monitoring. Operators can then filter logs to the run and see exactly when load changed. Markers also help separate the test from other activity in shared environments. It is hard because markers must be applied consistently by all generators and understood by the target's pipeline, and because nothing in the target may change behavior because of them.",
    k: ["Header-carried identifier versus out-of-band event only: a header ties each request to the run and needs the target to log it; an event is simple and marks only time ranges.", "One run identifier versus identifiers per scenario and generator: one is simple; finer identifiers allow narrowing down and multiply tags."],
    p: ["The target's access log does not record the marker header, so requests cannot be matched with the run after the fact.", "The end marker is never sent after a crash, and the run appears open for days in the monitoring."],
    v: "Filter the target's logs by the run identifier and confirm the count equals the count of requests in the test report, and that start and end events align with the first and last request.",
    dep: ["tags-and-labels","http-client"]
  },
  "saturation-analysis": {
    s: "Determining which resource in the target saturates first, using utilization, queueing and error signals against the offered load.",
    d: "Analysis plots server resource use and queue depth against load to find the point where throughput stops growing and latency climbs, the knee. It checks the usual resources: CPU, memory, disk, network, connections, threads and locks. Utilization at a tier shows nearly saturated before the knee, while queue lengths show the actual wait. It is hard because saturation is often in a hidden shared resource, such as a connection pool or a lock, which no host metric shows.",
    k: ["Looking at utilization versus queue length: utilization is widely available and says little about waiting; queue length shows pressure directly and needs instrumentation.", "Finding the knee with a ramp versus step plateaus: a ramp is quick and blurs the knee; plateaus locate it exactly at the cost of time."],
    p: ["CPU on all servers is at fifty percent, and the team concludes there is capacity, while a connection pool is the true limit.", "The ramp is so fast that the saturation point is smeared across minutes of transient behavior."],
    v: "Increase load in steps and confirm that throughput plateaus and latency rises at the same step as a specific resource's utilization or queue reaches its limit, and that relieving it moves the knee.",
    dep: ["server-metrics-ingest","ramp-profiles","throughput-counters"]
  },
  "bottleneck-analysis": {
    s: "Locating the component or call whose time or queueing limits the whole system's throughput, then confirming it by changing it and measuring again.",
    d: "Starting from the saturated resource and the slow traces, analysis finds the code path, query, lock or dependency responsible, using latency breakdowns, traces and server profiles. A hypothesis is tested by relieving the suspected bottleneck, for example by adding capacity to one tier, and rerunning. The new knee shows whether it was the limit. It is hard because relieving one bottleneck reveals the next, and several can be present at once, interacting.",
    k: ["Changing one thing per run versus several: one per run gives a clear cause; several save time and confuse attribution.", "Profiling under load versus reading metrics only: profiling finds the exact code and perturbs the target; metrics are free and point only at the component."],
    p: ["A fix is declared successful because the median improved, while the tail that users feel was unchanged.", "Two bottlenecks sit close together, the first is fixed, and capacity gains only a few percent."],
    v: "Apply the proposed change, rerun the same load profile and confirm the knee moves to a higher load by the predicted amount, with the old limiting resource no longer saturated.",
    dep: ["saturation-analysis","trace-correlation","latency-breakdown"]
  },
  "capacity-model": {
    s: "A model that turns measured results into predictions: how much load a configuration handles, and how many instances are needed for a target load with headroom.",
    d: "Measured throughput per instance at acceptable latency, plus utilization at the knee, gives a per-instance capacity. Scaling to production adds assumptions on how capacity grows with instances, shared limits such as the database, and a safety margin for failure and growth. The model states the load at which an objective stops holding. It is hard because scaling is not linear: shared components, coordination and caches mean doubling instances rarely doubles capacity.",
    k: ["Extrapolating from a small environment versus testing at full scale: extrapolation is cheap and rests on a scaling assumption; full scale is direct and costly.", "Planning at the knee versus at a utilization limit below it: the knee maximizes use and leaves no headroom; a lower limit leaves room for spikes and failures."],
    p: ["Capacity is assumed to scale linearly, and a shared database caps throughput at a third of the prediction.", "The model uses throughput at the knee without a safety margin, and a single instance failure causes overload."],
    v: "Predict capacity for a configuration the test did not use, then test that configuration and confirm the measured knee is within the model's stated error.",
    dep: ["saturation-analysis","run-history","slo-mapping"]
  },
  "error-log-correlation": {
    s: "Matching client-side failures with server-side logs and exceptions from the same time and run, to explain what each error class actually was.",
    d: "Failures in the run, grouped by class and time, are looked up in the target's logs using the run marker, trace identifier or time window. The tool can show the top server errors during the run next to the error rate, such as timeouts to a dependency or pool exhaustion messages. It is hard because error logs under heavy load are themselves flooded or sampled, and because a single root cause produces many different messages across tiers.",
    k: ["Searching logs by marker versus by time window: markers give an exact match and need logging support; time windows work everywhere and include unrelated entries.", "Summarizing top messages versus linking to raw logs: summaries are quick and hide rare messages; raw links are complete and slow to read."],
    p: ["The logging system rate-limits under the flood, and the relevant exceptions are dropped during the failure.", "A single database timeout appears as five different messages in five tiers, and the report lists five separate problems."],
    v: "Cause a known fault, such as a dependency timing out, and confirm the correlated view lists that fault's log message with a count close to the failed requests of the matching class.",
    dep: ["run-markers","error-classification","server-metrics-ingest"]
  },
  "workload-realism": {
    s: "How closely the generated traffic resembles real usage in mix, data, arrival pattern, client behavior and network path, which bounds what the results can claim.",
    d: "Every result is only as general as the workload that produced it. Realism covers the open or closed arrival model, the scenario mix, data skew, think time, connection behavior and the size of the data in the target. Achieving it means analyzing production traffic and revisiting the model as usage shifts. It is not always the aim: a deliberately unrealistic stress or soak finds specific limits. The decision shapes the model, data and client layers and determines whether numbers can be compared with production.",
    k: ["High-fidelity replay of production versus simplified synthetic models: replay is realistic for one period and costly to maintain; synthetic models are controllable and risk missing behavior.", "One realistic workload versus several targeted ones: one answers the capacity question; targeted ones isolate causes and do not predict production."],
    p: ["The test passes at a load whose mix differs from today's peak, and the production failure is in a path the test barely exercises.", "Realism is assumed because the scenarios mirror the documented flows, never checked against access logs."],
    v: "Compare the test's request mix, rate distribution, payload sizes and cache hit ratio with a sample of production traffic from a comparable period and document the differences next to the results.",
    dep: ["scenario-mix","data-parameterization","open-workload-model","network-path-model"]
  },
  "generator-saturation": {
    s: "The risk that the generator, not the target, is the thing running out of capacity, which makes results describe the tool instead of the system.",
    d: "A generator that is CPU bound, short on sockets or on bandwidth delays its own sends and receives, and the delay appears as target latency or as lower throughput. The decision to treat generator health as a measured quantity, with calibration runs and flagged results, touches the runtime, clients, distribution and reporting layers. Each design choice, such as buffering, validation and logging, spends the same scarce CPU. It is hard because the effects are gradual and plausible, not obvious failures.",
    k: ["Generous generator capacity versus tight packing: generous capacity keeps measurement clean at higher cost; tight packing saves money and risks silent distortion.", "Calibration against a known stub versus trusting host metrics: calibration measures the generator's real ceiling; host metrics are free and miss event-loop delay."],
    p: ["A test that doubled the generator count shows the same throughput, and the team concludes the target is capped when the load balancer was the limit instead.", "The result is reported with no information about generator utilization, so a saturated generator cannot be ruled out."],
    v: "Run the same load against a fast stub on the same generator hardware and confirm latency and rate match the stub's known behavior, then check that the real run's generator metrics stay below the calibrated ceiling.",
    dep: ["generator-resource-guard","concurrency-runtime","port-and-socket-limits","pass-fail-evaluator"]
  },
  "measurement-overhead": {
    s: "The cost of observing: every timestamp, check, tag, trace and log line spends resources that change the very latencies being measured.",
    d: "Measurement shares the CPU, memory and network with load generation. Decisions on validation depth, sample detail, histogram precision, tracing and archiving determine how much distortion each run carries. The design aims at constant-cost recording on the hot path, deferred work on other threads, and an explicit measure of the overhead itself. Comparing results between configurations that differ in instrumentation is not valid. It is hard because the overhead is small per request and large in aggregate.",
    k: ["Rich per-request detail versus lean recording: rich detail explains failures and costs CPU and storage; lean recording is faithful to timing and gives less to analyze.", "Measuring overhead explicitly versus assuming it is negligible: measurement takes a calibration run and gives a bound; assuming costs nothing and is often wrong at high rates."],
    p: ["Turning on full tracing and body validation halves the achievable rate, and the report compares it to an earlier lean run.", "Logging each request to the console under load makes the generator the slowest component."],
    v: "Run the same test with instrumentation off, minimal and full, and confirm the differences in achieved rate and latency are within the stated overhead budget, and recorded in the report.",
    dep: ["high-resolution-timer","histogram-recorder","response-validation","sample-buffer"]
  },
  "repeatability": {
    s: "Whether running the same test twice gives the same answer within known bounds, which is what makes a result a measurement and a comparison meaningful.",
    d: "Repeatability depends on controlling the target's state, data, environment, load shape, generator hardware and random seeds, and on recording all of them. Variation that cannot be removed has to be measured by repeated runs and carried into thresholds. The decision touches data reset, provisioning, configuration capture and noise handling. It is hard because shared infrastructure, caches carried over between runs and time-of-day effects all change results, and exact repetition of a randomized workload requires seeds.",
    k: ["Seeded random workloads versus fresh randomness per run: seeds give identical traffic and may overfit to one sequence; fresh randomness explores more and varies the result.", "Strict environment control versus accepting variance: control narrows noise at high cost; accepting variance is cheap and needs more runs and wider margins."],
    p: ["Two runs differ by twenty percent because a cache survived from the first, and the later run is taken as a regression.", "Random seeds are not recorded, and a failure cannot be reproduced."],
    v: "Run the identical test five times from a clean state and confirm the spread of key percentiles is within the margin used by the thresholds, with all inputs recorded in each report.",
    dep: ["noise-and-variance","data-cleanup","config-as-code","run-history"]
  },
  "blast-radius": {
    s: "How far damage can spread if a test goes wrong: to shared dependencies, other tenants, real customers, third-party services or the bill.",
    d: "A load tool is a tool for causing harm on purpose, at a controlled level. Limits therefore need to exist at several layers: caps on rate and users in the tool, an isolated environment, marked traffic, stubs for external services, a stop that works, and approval before runs against shared or production-like systems. The decision affects the target safeguards, distribution and coordination. It is hard because a misconfigured value, such as an extra zero, can turn a test into an outage faster than anyone reacts.",
    k: ["Hard caps enforced in the tool versus operator discipline: caps stop mistakes at the cost of occasional friction; discipline is flexible and fails under pressure.", "Pre-approved test windows versus ad hoc runs: windows warn dependent teams and slow experimentation; ad hoc is fast and surprises people."],
    p: ["A typo adds an extra zero to the arrival rate and the first minute of the test takes down a shared service.", "A scenario calls a metered third-party service with no stub, and the test generates a large invoice."],
    v: "Attempt to start a run whose rate exceeds the configured cap or points at a restricted target and confirm the tool refuses; then confirm the kill switch stops real load within the documented time.",
    dep: ["kill-switch","environment-isolation","dependency-stubbing","test-traffic-marking"]
  },
  "time-and-clocks": {
    s: "The rule that durations come from one monotonic clock per host, wall time is used only for alignment, and every cross-host timestamp has a known offset.",
    d: "Many measurements depend on time: latency from monotonic reads, buckets from wall time, schedules from intended start times, and overlays with server data. The decision is to separate clocks by purpose, synchronize hosts, measure offsets, and state the tolerance. It reaches the timer, the pacer, metric bucketing, distributed start and server correlation. It is hard because clocks fail quietly: a drifting or stepping clock produces plausible but wrong data, and one-way delay measurements inherit the offset directly.",
    k: ["Monotonic durations with wall-time bucketing versus wall time only: the split is immune to adjustment and needs two clocks to be managed; wall time only is simple and fragile.", "Disciplined host synchronization versus in-tool offset measurement: host synchronization is free and unverified; in-tool measurement proves alignment at the cost of a protocol."],
    p: ["A virtual machine pause makes the wall clock jump, and a minute of data lands in the wrong bucket.", "Server and generator clocks differ by seconds, and correlated charts show the effect before the cause."],
    v: "Record clock offsets for every generator and server host before and after a run and confirm they are within the bucket size, and that no latency was computed from wall-clock differences.",
    dep: ["high-resolution-timer","clock-sync"]
  },
});
