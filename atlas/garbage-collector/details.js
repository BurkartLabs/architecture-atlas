// Details for the garbage collector plate, part 1: operation and tuning.
ATLAS.details("garbage-collector", {
  "heap-sizing-policy": {
    s: "Decides the initial, minimum and maximum heap size and how fast the heap grows or shrinks between them in response to how much survives each collection.",
    d: "After each collection the policy measures live data and compares it with a target occupancy, then sets the next heap size as a multiple of the live set, clamped between configured bounds. Growth is usually quick and shrinking slow, because a heap that is too small collects constantly while one that is too large only wastes memory. The policy talks to the trigger logic, the commit layer and the footprint limits. It is hard because the live set is only known after a collection, and the best multiple depends on allocation rate and the pause goal.",
    k: ["Heap sized as a multiple of live data vs a fixed size: the multiple adapts to the program but oscillates when the live set swings; a fixed size is predictable but wrong for most workloads.", "Fast growth with slow shrinking vs symmetric resizing: avoids collection storms after a spike, but the process holds memory long after it is needed."],
    p: ["A maximum set below the true live set plus headroom makes the collector run back to back and the program appears hung.", "A minimum equal to the maximum hides growth problems in testing, then fails when the host has less memory."],
    v: "Run a workload with a stable 200 MB live set and confirm the log shows the heap settling at the configured multiple of that figure, then growing when the live set doubles and shrinking after it falls.",
    dep: ["commit-and-uncommit", "footprint-limits", "collection-triggers"]
  },
  "pause-time-goal": {
    s: "A target for the longest stop-the-world interval the collector may impose, which the collector tries to meet by limiting how much work each pause does.",
    d: "The goal is a soft target in milliseconds. The collector keeps estimates of how fast it can copy or scan, and sizes each pause's work, such as how many regions to evacuate or how large a young generation to allow, so the predicted time fits the goal. It consults the pause histogram to learn actual costs. Collectors that run concurrently treat the goal as a bound on the unavoidable pauses only. The difficulty is that costs depend on pointer density, cache behavior and thread scheduling, so predictions miss, and a tight goal raises the total collection work.",
    k: ["Soft goal with predictive sizing vs hard real-time bounds: soft goals work on ordinary hardware and are usually met, but give no guarantee for any single pause.", "Tight pause goal vs larger heap: a tight goal forces smaller increments and more frequent collections, which costs throughput and needs extra memory headroom."],
    p: ["Setting a very low goal on a pointer-heavy heap causes the collector to fall behind allocation and fall back to a long full pause.", "Measuring only the average pause hides the rare long ones that users notice."],
    v: "Set a 20 ms goal, drive a steady allocation load for ten minutes and confirm the 99.9th percentile pause in the log is near the goal, with no full-collection fallbacks.",
    dep: ["pause-histograms", "young-collection", "mixed-collection"]
  },
  "throughput-goal": {
    s: "A target for the fraction of total time spent running the program rather than collecting, which the collector meets by enlarging the heap and spacing collections apart.",
    d: "The goal is expressed as a ratio, such as at most one part collection to nineteen parts program. The ergonomics loop measures cumulative collection time against run time and grows the heap or the young generation until the ratio is met. Larger young spaces mean fewer collections and more garbage per collection, because each survivor set is a smaller share of the space. It trades latency for efficiency: bigger heaps mean longer individual pauses for non-concurrent collectors. It conflicts with the footprint limits and the pause goal, and the policy needs a priority order among them.",
    k: ["Throughput first, then pause, then footprint vs the reverse order: batch jobs want the first; services with latency targets want the second, and the order decides which limit gives way.", "Larger young generation vs larger old generation for spare memory: a larger young space cuts promotion of short-lived data, while a larger old space delays full collections."],
    p: ["Optimizing throughput on an interactive service produces occasional multi-second pauses that exceed client timeouts.", "Competing goals with no stated priority make the heap oscillate as each goal takes turns winning."],
    v: "Run a batch workload with the goal set, then compare collection time to total run time from the log. Confirm the ratio stays under the target after warm-up and that heap size grew to achieve it.",
    dep: ["heap-sizing-policy", "adaptive-generation-sizing"]
  },
  "footprint-limits": {
    s: "The hard and soft ceilings on how much memory the collector may hold, including heap maximum, committed size and metadata overhead, enforced even when goals suggest growing further.",
    d: "A maximum heap size caps reserved and committed memory, and soft limits request a collection or a shrink before the cap. Total process footprint is larger than the heap: it includes card tables, bitmaps, remembered sets, thread buffers and off-heap data. Limits are checked on commit and on growth decisions. When allocation would exceed the cap, the collector collects more aggressively, clears soft references, and finally raises an out-of-memory error. The hard part is that the metadata overhead scales with heap size and that other parts of the process also consume memory outside the collector's view.",
    k: ["Cap the heap only vs cap the whole process: capping the heap is simple to reason about, but total memory can exceed the machine limit through metadata and native allocations.", "Soft limit with a gentle response vs a single hard limit: a soft limit lets the collector try harder before failing, at the cost of slower operation near the ceiling."],
    p: ["Setting the heap maximum equal to container memory leaves no room for metadata and native memory, and the process is killed by the host.", "Ignoring metadata overhead makes a large heap use far more memory than its configured size."],
    v: "Allocate until the cap is reached and confirm the log shows escalating collections, soft references cleared, then an out-of-memory error. Meanwhile process resident size stays below the configured process limit.",
    dep: ["commit-and-uncommit", "container-memory-awareness"]
  },
  "adaptive-generation-sizing": {
    s: "Adjusts the sizes of the young and old areas and the survivor spaces over time, using measured survival rates and promotion volumes to keep premature promotion and full collections low.",
    d: "The policy tracks how much survives each young collection, how much is promoted, and how fast the old area fills. If survivors overflow, the survivor spaces or young area grow; if the old area fills before collections free it, the old area is enlarged or the young area shrunk. Changes are damped by moving averages so one spike does not resize the heap. It interacts with the heap sizing policy, the promotion policy and the pause goal. It is hard because tuning one area moves pressure to the other, and the right ratio changes as the program moves through phases.",
    k: ["Adaptive resizing vs fixed ratios: adaptation follows the workload but can thrash during phase changes; fixed ratios are stable but suit only one allocation pattern.", "Large young area vs short pauses: a large young area collects less often but each collection may copy more, depending on survival rate."],
    p: ["Premature promotion of data that dies soon after fills the old area with garbage and triggers expensive full collections.", "Aggressive adaptation during warm-up locks in sizes that suit startup rather than steady state."],
    v: "Run a program with a rising then falling survival rate and confirm the log shows survivor and young sizes growing and then shrinking, with the full-collection count staying at or near zero.",
    dep: ["heap-sizing-policy", "promotion-policy", "survivor-aging"]
  },
  "collection-triggers": {
    s: "The rules that start a collection: allocation failure, occupancy thresholds, predicted time to exhaustion, explicit requests and periodic timers.",
    d: "The simplest trigger is allocation failure: when a space is full, collect. Concurrent collectors cannot wait for that, so they start a cycle when occupancy crosses a threshold, estimated from the allocation rate and the time a cycle needs to finish before memory runs out. Some collectors add time-based triggers to return memory when a program is idle. Triggers also decide the type of collection: young, mixed or full. It is hard because starting early wastes cycles and starting late means the collector loses the race and falls back to a long stop-the-world collection.",
    k: ["Occupancy threshold vs adaptive start time from allocation rate: a threshold is simple and predictable, while adaptive timing fits changing workloads but depends on accurate rate estimates.", "Starting early vs starting late: early starts keep concurrent cycles safe at the cost of extra collector work; late starts save work and risk allocation stalls."],
    p: ["A fixed threshold tuned on a quiet system lets a burst of allocation outrun the concurrent cycle.", "A periodic timer firing during peak load adds collection cost exactly when the program is busiest."],
    v: "Ramp allocation rate steadily and confirm from the log that cycles start progressively earlier in occupancy terms, and that no cycle ends in a stall or a fall back to a stop-the-world collection.",
    dep: ["allocation-rate-metrics", "heap-sizing-policy"]
  },
  "container-memory-awareness": {
    s: "Reads memory and processor limits imposed by the host or container so that default heap sizes and thread counts match what the process may actually use.",
    d: "On startup the runtime reads the limits that the operating system or container manager exposes, such as a memory cap and a CPU quota, rather than total machine memory. It derives default maximum heap as a fraction of the cap and chooses the number of collector threads from the CPU quota. Limits can change while the process runs, so some runtimes re-read them. The difficulty is that default fractions leave too little room for non-heap memory, and a quota expressed as shares of time does not equal a number of cores for choosing thread counts.",
    k: ["Heap as a fraction of the container limit vs an explicit absolute size: fractions adapt automatically to deployment size, but an explicit value gives the operator exact control.", "Threads from the CPU quota vs from visible cores: the quota avoids oversubscription under throttling, but can under-use capacity when the quota is generous."],
    p: ["Using host memory rather than the container limit sets a maximum heap above the cap, so the process is killed instead of throwing an error.", "Too many collector threads inside a small CPU quota cause throttling that appears as long pauses."],
    v: "Start the same program under a 512 MB limit and a 4 GB limit and confirm the reported maximum heap and collector thread count differ accordingly and stay below the limits.",
    dep: ["footprint-limits", "parallel-gc-workers"]
  },
  "explicit-gc-requests": {
    s: "The program's or a tool's ability to ask for a collection, along with policy on whether to honor it, run it concurrently, or ignore it.",
    d: "A runtime usually offers a call that requests a full collection, and diagnostic tools issue the same request before taking a heap dump or histogram. Production systems often convert the request into a concurrent cycle or disable it, because libraries that call it on a timer cause repeated full pauses. A few legitimate uses remain: releasing native memory that is tied to objects, and cleaning before a measurement. The difficulty is that callers assume the request frees memory immediately, while the runtime treats it as a hint that may run later, partially or not at all.",
    k: ["Honor requests as full stop-the-world collections vs convert to concurrent cycles: honoring gives callers predictable results but lets any library cause long pauses.", "Disable requests entirely vs allow them: disabling prevents misuse, but breaks tools and code that rely on prompt release of native resources."],
    p: ["A library that calls for a collection every minute produces a regular full pause that looks like a performance regression in the application.", "Code relying on a request to run finalizers or release buffers breaks silently when requests are disabled."],
    v: "Call the request in a loop with it honored and again with it disabled, and confirm the log shows a full collection each time in the first case and none in the second.",
    dep: ["full-collection", "gc-logging"]
  },
  "gc-logging": {
    s: "A structured log line for every collection: its type, cause, duration, heap size before and after, and the phases within it, written to a file or stream.",
    d: "At the start and end of each pause and concurrent cycle the collector writes a record with a timestamp, cause, kind, pause duration, heap occupancy before and after, committed size and per-phase times. Verbose levels add worker thread timings, region counts and reference processing. Logs are written asynchronously to avoid adding to pauses and can rotate by size. Because the format is stable enough for tools to parse, it becomes the primary data source for tuning. The challenge is volume, format changes between versions, and that logs cover only the collector, not what the program was doing.",
    k: ["Always-on logging at low verbosity vs enabling on demand: always-on means data exists when a problem occurs, at the cost of a small constant write load and storage.", "Human-readable lines vs machine-readable structured events: readable lines help operators directly, while structured events are safer to parse and extend."],
    p: ["Logging disabled by default means the first outage has no collector data to examine.", "Log lines timestamped in a different clock than application logs make correlating a pause with a slow request guesswork."],
    v: "Run a load test, then parse the log and confirm every pause has cause, duration and before and after occupancy, and that the summed pause times match the total reported by the runtime's own counters.",
    dep: ["pause-histograms", "gc-event-tracing"]
  },
  "pause-histograms": {
    s: "Distributions of stop-the-world durations, recorded per collection kind, so tail latency and not just the average is visible.",
    d: "Each pause duration is placed into a histogram with logarithmic buckets, kept per collection type and sometimes per phase. The runtime exposes percentiles, maximum and counts through its management interface or telemetry export. Histograms are cheap to update, since each pause is a single increment, and can be merged across processes. The pause goal logic can read them to calibrate predictions. The difficulty is that pause time is not application latency: a request that spans a pause, or waits for the safepoint to be reached, sees more delay than the pause alone reports.",
    k: ["Histograms vs average and maximum only: histograms show the shape and tail, at the cost of more storage and some bucket-boundary error.", "Measuring pause duration vs measuring time to reach the safepoint too: including the wait shows what threads experienced, but needs instrumentation on every thread."],
    p: ["Reporting the mean pause hides a rare two-second pause behind many 5 ms ones.", "Excluding the time to reach a safepoint makes the collector look better than the application experienced."],
    v: "Inject one long pause of known length among thousands of short ones and confirm the maximum and the top percentile bucket show it, while the median is unchanged.",
    dep: ["gc-logging", "safepoints"]
  },
  "allocation-rate-metrics": {
    s: "Counters for bytes and objects allocated per second, per thread and per space, which indicate collection pressure and drive triggering.",
    d: "Each thread-local buffer counts bytes it hands out, and the collector sums these at refill or collection time rather than on every allocation, so the cost is near zero. Rates are computed over a window and smoothed. The metrics feed the trigger logic and the pacing of concurrent cycles, and are exported to dashboards. Per-thread figures help find which part of a program allocates heavily. The limit of the technique is resolution: counting at buffer granularity blurs short bursts, and counting objects instead of bytes needs extra instrumentation.",
    k: ["Counting at buffer refill vs on every allocation: refill counting has no fast-path cost, but loses precision between refills.", "Rate averaged over a long window vs a short one: long windows are stable but miss bursts that cause stalls; short windows react but are noisy."],
    p: ["A burst shorter than the smoothing window outruns the concurrent cycle without ever showing as a high rate.", "Reading the rate as a cause of slowness when it is a symptom of one hot loop creating temporary objects."],
    v: "Run a loop allocating a known 100 MB per second and confirm the reported rate is within a few percent of it, and that adding a second identical thread doubles the total and shows two contributors.",
    dep: ["tlab", "collection-triggers"]
  },
  "heap-histogram": {
    s: "A count and total size of live objects grouped by type, taken after a collection, showing what is occupying the heap without capturing every object.",
    d: "The tool triggers a full collection if asked, then walks the heap and tallies instances and bytes per type, producing a ranked list. It runs at a safepoint and takes time proportional to the heap, so large heaps are paused for seconds. It is much smaller than a dump and can be taken repeatedly to see which types grow. Comparing two histograms shows a leaking type. It cannot say why objects are retained, which is the job of heap dump analysis, and it counts live objects only if a collection preceded it.",
    k: ["Collecting first vs reading as-is: collecting shows only live data, but adds a full pause; reading as-is is faster but includes garbage that is not yet reclaimed.", "Histogram vs full dump: a histogram is small and fast, while a dump answers retention questions at the cost of large files and a long pause."],
    p: ["Taking a histogram on a large production heap pauses the service for seconds and triggers a failover.", "Reading counts from an uncollected heap and blaming types that are mostly garbage."],
    v: "Create exactly one million instances of a test type, take a histogram after a collection and confirm the count and size match what was created within the header overhead per instance.",
    dep: ["full-collection", "safepoints", "object-header"]
  },
  "heap-dump": {
    s: "A snapshot of every live object, its type, fields and references, written to a file so retention can be analyzed offline.",
    d: "The runtime stops threads at a safepoint and walks the heap, writing each object's type, size and field values plus the roots with their kinds and thread stacks. The file is as large as the live heap, so writing it can take many seconds. Analysis tools load the file, compute the dominator tree and retained sizes, and let engineers follow reference chains back to roots. Dumps can be triggered by command, by signal or automatically on an out-of-memory error. The challenges are size, the pause while writing, and that the dump holds sensitive data such as credentials.",
    k: ["Dump on demand vs automatically on out-of-memory: on-demand dumps give a clean baseline, while automatic ones capture the failure state, but may fill the disk or fail with memory exhausted.", "Include field values vs structure only: values allow root-cause analysis but expose sensitive data; structure-only dumps are safer but less useful."],
    p: ["The dump file written to a small volume fills the disk and takes the host down along with the process.", "Dumps copied to shared locations expose passwords and personal data held in memory."],
    v: "Create a known chain from a static root to a large buffer, dump the heap, open it in the analyzer and confirm the shortest path to the buffer matches the chain and the retained size is correct.",
    dep: ["safepoints", "root-set", "object-header"]
  },
  "leak-analysis": {
    s: "The method of finding why memory keeps growing: comparing snapshots over time, finding the dominators that retain growth and tracing them back to the code that keeps references.",
    d: "A managed heap cannot leak in the sense of lost memory, so a leak is an object still reachable that the program will never use again. The analyst takes histograms or dumps at intervals, finds types whose counts only rise, then looks at the dominator tree to find the single object keeping most of them alive, such as a cache, listener list or thread-local map. The path from the root names the owner. The difficulty is separating real leaks from legitimate growth, such as a cache that has not reached its bound, and from fragmentation or native memory growth, which this method cannot see.",
    k: ["Compare snapshots over time vs analyze a single dump: comparison separates growth from steady state, but needs several dumps and pauses; a single dump shows size but not trend.", "Dominator tree vs listing reference paths: dominators give retained size and a few culprits, while reference paths show every holder, which is noisy but complete."],
    p: ["Concluding there is a leak from a heap that simply has not yet hit its collection threshold.", "Chasing heap growth when the real growth is in native buffers or thread stacks that heap tools do not show."],
    v: "Run a service with a seeded leak, take dumps at two points and confirm the analysis names the leaking collection as the dominator, with retained size that grows between snapshots by roughly the leaked amount.",
    dep: ["heap-dump", "heap-histogram", "weak-references"]
  },
  "allocation-profiling": {
    s: "Sampling of allocation sites, with stack traces, to show which code produces the most bytes and which allocations cause buffer refills.",
    d: "Rather than record every allocation, the profiler samples a byte count: roughly every N kilobytes allocated, it records the object type and the allocating call stack. Taking the sample on the buffer refill and slow path keeps the fast path free. Samples are aggregated into a flame graph of bytes by call site. Some profilers also sample objects that survive, showing what is retained rather than merely created. The limits are statistical error on small sites, bias toward large allocations at refill boundaries, and inlining that attributes allocation to the wrong source line.",
    k: ["Sampling by bytes vs tracing every allocation: sampling has low overhead and works in production, while full tracing is exact but can slow the program many times over.", "Allocation sites vs surviving objects: allocation sites find churn that drives collection frequency, while survivor sampling finds memory that stays and drives heap size."],
    p: ["Optimizing the allocation site at the top of the profile when the objects die instantly and cost almost nothing.", "Profile attributing allocation to a helper because the compiler inlined the real caller."],
    v: "Run code that allocates 90 percent of its bytes at one known site and confirm the profile's top entry is that site with a share near 90 percent, and that sampling overhead is under a few percent of run time.",
    dep: ["allocation-slow-path", "tlab", "allocation-rate-metrics"]
  },
  "gc-event-tracing": {
    s: "Timeline events for each collector phase, emitted into a tracing system so pauses can be lined up against application activity.",
    d: "The collector emits begin and end events with timestamps for each phase: root scanning, marking, evacuation, reference processing, and for concurrent work its start and finish. Events are written to a low-overhead ring buffer or tracing system, tagged with thread and collection ids. Viewers show collector threads alongside application threads on one timeline, so a slow request can be matched to the pause that overlapped it. The hard part is overhead on short phases, clock synchronization with application traces, and keeping event names stable for tools.",
    k: ["Phase-level events vs one record per collection: phase events show where time went, at the cost of more data and some overhead per pause.", "Always-on ring buffer vs enable on demand: a ring buffer keeps recent history for after-the-fact analysis, but uses fixed memory and loses older data."],
    p: ["Events recorded with a different clock than the application trace cannot be aligned, so correlations are wrong by milliseconds.", "Tracing enabled at fine granularity in production adds overhead that distorts the pauses being measured."],
    v: "Capture a trace during a load test and confirm that a known slow request overlaps a pause in the timeline, and that phase durations sum to the pause duration in the log within a small error.",
    dep: ["gc-logging", "safepoints"]
  },
  "oom-diagnostics": {
    s: "What the runtime records when allocation finally fails: the reason, which space was exhausted, a heap dump if configured, and a hook to run commands such as restart.",
    d: "An out-of-memory condition has several causes: heap full of live data, a large allocation that no contiguous space can satisfy, metadata space exhausted, native memory or thread creation failure, or the collector spending nearly all time collecting while recovering little. The runtime throws an error naming the cause and can write a dump, run a command or exit. The collector's overhead limit raises the error early when collection time dominates. It is hard because the failing allocation may be tiny and innocent, while the real cause is whatever consumed the memory before it.",
    k: ["Throw an error and continue vs exit immediately: continuing lets code release resources, but a process short of memory is often in an inconsistent state; exit with restart is safer for services.", "Overhead-limit early failure vs trying until nothing is left: early failure avoids a service that technically runs but makes no progress, but can fail work that would have finished."],
    p: ["Catching the error and retrying keeps a degraded process alive that fails every request in an unpredictable way.", "The dump on failure cannot be written because the process or disk has no memory or space left."],
    v: "Force each exhaustion cause in turn, such as a heap leak, a huge array and a metadata flood, and confirm each produces a distinct error message and, where configured, a dump and a restart.",
    dep: ["heap-dump", "footprint-limits", "large-object-space"]
  },
});
