// Details for the endpoint detection and response plate, part C: telemetry pipeline and kernel sensors.
ATLAS.details("edr-agent", {
  "event-schema": {
    s: "The versioned, normalized structure every sensor event is converted into, so detections, storage and analysts work with one vocabulary regardless of source or operating system.",
    d: "Each event has a type, a timestamp, a host and process identity, an actor, a target and type-specific fields such as path, hash, address or command line. Sensors emit raw platform records and a normalizer maps them into this form. The schema is versioned, with fields added over time and old agents still in the field for years. It is hard because it must be rich enough for detection and compact enough for the budget, and because every consumer depends on it, so field meanings cannot change quietly.",
    k: ["One normalized schema vs raw platform events: normalized events let one rule work everywhere; raw events keep every detail and push platform knowledge into every consumer.", "Additive-only changes vs breaking versions: additive changes let old and new agents coexist; breaking versions allow cleanup and force migration of all consumers."],
    p: ["A field is empty on one platform and detections silently never match there.", "Two sensors report the same action as different event types, producing duplicate alerts."],
    v: "Generate the same action (a file write by a process) on each supported platform and confirm the resulting events validate against the schema, with identical field names and comparable values.",
    dep: ["os-abstraction-layer"]
  },
  "process-entity-table": {
    s: "The agent's in-memory record of every live and recently ended process: identity, parent, image, hash, signer, command line, user and start time, used to enrich every other event.",
    d: "Created when a process starts and updated by later events, the table is keyed by a stable identity (identifier plus start time), because identifiers are reused. Other sensors join to it so a file write or connection event carries the full process context without repeating it. Ended processes are kept briefly for late events. The challenge is completeness and cost: processes started before the agent loaded must be discovered by enumeration, and the table must stay correct under fork storms.",
    k: ["Keep ended processes for a window vs drop immediately: a window lets late events attach to the right process; immediate drop saves memory and loses context.", "Enrich at event time vs at upload: event-time enrichment captures what was true then; upload-time enrichment is cheaper and may see a changed state."],
    p: ["A process starting during agent boot is missed, and its later events have no lineage.", "Identifier reuse attaches a new process's events to an old entity."],
    v: "Start a process tree, end the parent, then have a child write a file, and confirm the file event carries the parent's image and command line from the retained entry, and table size returns to baseline after the retention window.",
    dep: ["process-creation-hooks","event-schema"]
  },
  "event-filtering": {
    s: "Reduces the event stream before storage and upload by dropping, aggregating or sampling events that add little detection value, within explicit policy.",
    d: "Filters work at several points: sensors skip trusted paths, the pipeline collapses repeated identical events into a count, rate limits cap noisy processes, and sampling keeps a fraction of low-value types. Detections that run locally see events before filtering, so detection and upload sets can differ. The tradeoff is permanent: anything dropped cannot be investigated later. The difficulty is a filter written against today's noise that hides tomorrow's attack, such as a busy process an attacker injects into.",
    k: ["Filter before local detection vs after: filtering first saves CPU and blinds detection; filtering after keeps detection complete and spends more.", "Drop vs aggregate: aggregation keeps a count and shape of activity; dropping saves more and loses even that."],
    p: ["A trusted-process filter hides malicious activity running inside that trusted process.", "Rate limits drop the one important event during a burst because they are first-come."],
    v: "Generate a burst of ten thousand identical benign events and one distinct malicious test event, and confirm the upload holds an aggregated count for the burst, the distinct event in full, and a drop counter equal to the difference.",
    dep: ["event-schema","policy-engine","data-scope-and-privacy"]
  },
  "local-enrichment": {
    s: "Adds context on the machine before events are queued: file hashes, signer, version information, user details and local reputation, so the cloud need not recompute them.",
    d: "Hashing a file costs reads, so the agent caches hashes by path and modification time and computes them in a low-priority thread. Signature verification, version metadata and directory group membership are likewise cached. Enriched fields travel with the event. This improves detection locally and saves cloud work. The difficulty is staleness (a file changes after hashing), cache growth, and cost on first access to large files when other work is waiting.",
    k: ["Hash on write vs on execute: hashing on write catches files early and costs I/O for files never run; hashing on execute hashes only what matters and adds delay to launch.", "Cache by path and time vs by content: path-time caches are cheap and can be fooled by restoring a timestamp; content caches are exact and need the hash first."],
    p: ["A file replaced with an older timestamp uses a stale cached hash.", "Hashing a large database file on every change consumes disk bandwidth continuously."],
    v: "Write a test file, confirm its event contains a hash matching an independent computation, modify and retime it, and confirm the cache is invalidated and the new hash is reported.",
    dep: ["file-system-filter","local-state-store","resource-governor"]
  },
  "persistent-event-queue": {
    s: "A bounded on-disk queue holding events until the cloud confirms receipt, so telemetry survives reboots, crashes and network outages.",
    d: "Events are written in sequence to segment files with checksums and removed only after acknowledgment. The queue has a size cap and a policy for overflow: drop oldest, drop lowest priority or stop collecting. Writes are batched to limit disk wear and I/O. It supports local history queries. The challenge is corruption recovery after power loss, protecting the queue from tampering, and ensuring that a long outage does not fill the disk or turn into an upload flood on reconnection.",
    k: ["Drop oldest vs drop newest on overflow: dropping oldest keeps the most recent activity; dropping newest preserves the start of an incident.", "Priority classes vs one flat queue: classes keep high-value alerts when space runs out; one queue is simpler and loses important events along with trivial ones."],
    p: ["A torn write after power loss makes the whole segment unreadable and the agent crash-loops on it.", "The queue fills a small system disk, and the host runs out of space because of the agent."],
    v: "Fill the queue with events, kill the service mid-write, restart, and confirm the agent recovers, replays unacknowledged events in order once and reports the number of lost events.",
    dep: ["local-state-store","backpressure-and-loss","event-schema"]
  },
  "batch-and-upload": {
    s: "Groups queued events into compressed batches and sends them on a schedule that respects bandwidth, power, connectivity and priority.",
    d: "Batches are formed by size or age, whichever comes first, compressed and sent with sequence numbers for deduplication. High-severity alerts bypass batching and go immediately. The scheduler backs off with jitter on failure, avoids metered or low-battery states if policy says so, and caps daily volume. Resumable uploads handle large items. The difficulty is balancing latency against cost and avoiding fleet-wide synchronization, where every machine retries at the same moment.",
    k: ["Large batches vs small frequent ones: large batches compress better and use fewer connections; small batches reduce detection latency and memory held.", "Immediate send for alerts vs one path for everything: immediate alerts support fast response; a single path is simpler and delays the most urgent signal."],
    p: ["Fixed retry intervals make every agent hammer the backend at the same instant after an outage.", "A metered connection is consumed by telemetry because no volume cap exists."],
    v: "Block the backend, generate events and one alert, restore connectivity, and confirm the alert arrived first, batches arrive in sequence with jittered timing, and daily byte counters stay under the cap.",
    dep: ["persistent-event-queue","secure-transport","resource-governor"]
  },
  "backpressure-and-loss": {
    s: "Tracks how full each stage is, slows or sheds work in a defined order when a stage cannot keep up, and counts every event lost so gaps are visible, not hidden.",
    d: "Each pipeline stage has a bounded buffer. When one fills, the stage upstream either blocks, which risks stalling a kernel callback, or drops with a counter by event type and reason. Counters are sent to the backend as part of health data, so analysts know a time range is incomplete. Sensors in the kernel can never block on user space for long. The difficulty is deciding what to shed first and making loss measurable, since silent loss makes every absence of evidence misleading.",
    k: ["Block upstream vs drop at the boundary: blocking preserves data and can stall the host; dropping protects the host and creates gaps.", "Per-type loss counters vs a single total: per-type counters show whether the lost data mattered; one total is cheap and not actionable."],
    p: ["Kernel buffers overflow during a build and file events vanish, with no record that they did.", "Detection logic treats absence of events as safe when events were actually dropped."],
    v: "Flood the pipeline above capacity, and confirm the host stays responsive, per-type drop counters sum to the shortfall between generated and received events, and the console marks the time range as incomplete.",
    dep: ["persistent-event-queue","kernel-user-channel","agent-health-reporting"]
  },
  "process-creation-hooks": {
    s: "Kernel notifications issued when a process or thread is created or ends, giving the agent a reliable record of every program launch with its parent, image and command line.",
    d: "The OS offers a registration for callbacks invoked synchronously during process creation. The agent's callback captures identity, parent, image path, command line and user, forwards them to user space and, for prevention, may wait for a verdict before the process runs. Because the callback runs in the creation path, it must be quick and must never block indefinitely. The difficulty is parent spoofing, processes created without the usual path, containers and sandboxes that present different views, and the callback limits the OS imposes.",
    k: ["Synchronous verdict vs notify only: waiting for a verdict lets the agent block before any code runs; notification adds no delay and only detects.", "Capture command line in the kernel vs fetch later: capture in the callback is accurate; fetching later is simpler and can read an altered value."],
    p: ["A callback that waits on a stopped user-space service hangs every new process and the host cannot start anything.", "Short-lived processes exit before user space looks them up, leaving events with no detail."],
    v: "Launch a program with a long, distinctive command line and confirm the event arrives with the right parent, image and full arguments before the program's first file write, even for a process that exits in a millisecond.",
    dep: ["kernel-user-channel","kernel-component-safety"]
  },
  "file-system-filter": {
    s: "A component layered into the file system path that sees file open, read, write, rename and delete operations, allowing the agent to scan, log or block them.",
    d: "The filter sits between applications and the file system, receiving each request with the calling process, path and operation. It can allow, deny or delay a request, for example while a scan completes. Per-file contexts hold cached verdicts. It is the foundation of on-access scanning and ransomware protection. It runs on every I/O of the machine, so its cost directly affects everything. The hard parts are path normalization (links, short names, alternate streams), recursion when the agent's own scan triggers its own filter, and network and virtual file systems.",
    k: ["Block on open vs scan on close: blocking on open stops access to bad content; scanning on close lets work proceed and detects after write completes.", "Filter all volumes vs selected paths: all volumes give full coverage and full cost; selected paths cut overhead and create blind spots."],
    p: ["A scan triggered by a file open itself opens files, and without a bypass for the agent's own I/O it recurses.", "Path matching differs between short and long names, letting a rule be bypassed."],
    v: "Write, rename and delete a test file through different path spellings, and confirm one event per operation with a normalized path and the calling process, and measure I/O latency overhead on a file-copy benchmark.",
    dep: ["kernel-user-channel","kernel-component-safety"]
  },
  "network-filter": {
    s: "A component in the network stack that sees connections and packets with the owning process, enabling flow telemetry, blocking and host isolation.",
    d: "Hooks at the connection and packet layers report new flows, their addresses, ports, direction and the originating process, and can permit or drop them. Flow-level hooks are cheap; payload inspection is expensive and often skipped, since traffic is encrypted. Associating a packet with a process is the hard part, because some flows are created by system services on behalf of others, and tunneling, virtual adapters and containers change what is visible. Rules for isolation live here.",
    k: ["Flow metadata only vs payload inspection: metadata is cheap and works with encryption; payload inspection reveals content and costs CPU and breaks under encryption.", "Packet-level hook vs connection-level hook: packet hooks see everything and cost per packet; connection hooks cost per flow and miss mid-flow behavior."],
    p: ["Traffic from a system proxy service is attributed to that service, not the program that requested it.", "An isolation rule fails to cover a second network adapter that comes up later."],
    v: "Open a connection from a test process to a lab address, and confirm a flow event with correct process, remote address and port; then apply a block rule and confirm a new attempt fails and is logged.",
    dep: ["kernel-user-channel","kernel-component-safety"]
  },
  "module-load-monitor": {
    s: "Notifications when executable images, libraries or drivers are mapped into a process or the kernel, revealing side-loading, injected modules and unsigned drivers.",
    d: "The OS reports each image load with path, base address, and the process it was loaded into. The agent evaluates the file's signature, location and hash, and compares against expectations: a library loaded from a user-writable directory into a system process is suspicious. Driver loads are especially important, because vulnerable signed drivers are used to disable security software. The difficulty is volume, since every process loads dozens of modules, and cache keys for verification so each module is checked once.",
    k: ["Verify every load vs verify on first sight: every-load verification is thorough and expensive; first-sight caching is cheap and can miss a file replaced later.", "Block unsigned drivers vs alert on them: blocking is strong and can break hardware drivers; alerting leaves the machine open until a human acts."],
    p: ["A signed but vulnerable driver is loaded, and used to turn off the agent's own protection.", "Loads from a network path stall because signature checks wait on the network."],
    v: "Place a test library in a user-writable directory and load it from a system-owned test process, and confirm a module event with path, hash and unsigned status plus a detection on the unusual location.",
    dep: ["kernel-user-channel","local-enrichment","local-rule-engine"]
  },
  "config-store-monitor": {
    s: "Watches changes to system configuration stores, such as registry-style databases or key configuration files, where persistence, security settings and service definitions live.",
    d: "Kernel callbacks or file watchers report creations, writes and deletions of keys and values, with the acting process and new data. The agent filters to locations attackers use: autostart entries, service definitions, security product settings, certificate stores and scheduled-task definitions. Matches feed detections and the rollback record. The challenge is noise, since software writes constantly to these stores, and values changed via indirect paths (file replacement, import tools) that skip the hook.",
    k: ["Watch selected locations vs the whole store: selected locations are cheap and miss new persistence tricks; whole-store watching is complete and noisy.", "Record old and new value vs new value only: old values enable rollback and double the data; new values only are smaller and cannot undo."],
    p: ["A persistence location added in a newer OS release is not on the watch list.", "Bulk imports during software installation flood the pipeline with thousands of benign writes."],
    v: "Add a test autostart entry from a lab process, and confirm an event with the acting process, key path, old and new values, plus a persistence detection; then restore through rollback and confirm the value is back.",
    dep: ["kernel-user-channel","remediation-rollback","local-rule-engine"]
  },
  "kernel-tracing-probes": {
    s: "Instrumentation points in the operating system's own tracing facility that report system calls, memory operations and security-relevant events without a custom kernel driver.",
    d: "Modern kernels offer tracing interfaces and sandboxed, verified programs that attach to events: system call entry, memory permission changes, thread injection, handle opens. The agent loads small programs that filter at source and send compact records through a ring buffer. Because the OS verifies them, they are less able to crash it than a custom module. The difficulty is portability across kernel versions, limits on program size and loops, the cost of probing hot calls and dependence on interfaces the OS vendor can change.",
    k: ["OS-verified probes vs custom driver: verified probes are safer and updatable; custom drivers can do anything and carry crash risk.", "Filter in the probe vs in user space: filtering at the source cuts transfer volume; user-space filtering is more flexible and costs more copying."],
    p: ["An OS update changes a traced structure's layout and probes read garbage or fail to load.", "Probing a very frequent call adds a small cost that adds up to noticeable overhead."],
    v: "Trigger a permission change to executable memory from a test process, and confirm a probe record with process, address range and old and new permissions arrives, and CPU overhead stays under the budget on a syscall-heavy benchmark.",
    dep: ["kernel-user-channel","kernel-component-safety"]
  },
  "kernel-user-channel": {
    s: "The queue or shared memory path that carries events from kernel sensors to the user-space service and returns verdicts, built so the kernel never waits on user space for long.",
    d: "Sensors write compact records into per-processor ring buffers or message ports that the service drains. For blocking decisions the kernel posts a request and waits for a reply with a strict timeout, then applies a default. Records carry sequence numbers so gaps are detected. Design aims are bounded memory, no unbounded wait, and safe behavior when the service is dead. Difficulties are bursts that overflow buffers, handling a service crash mid-request, and validating data crossing the privilege boundary in both directions.",
    k: ["Shared ring buffer vs message port: ring buffers are fast with no copy per event; ports are simpler, have flow control built in and cost more per message.", "Timeout then default allow vs wait: a timeout keeps the host alive when the service stalls and opens a window; waiting is strict and can hang the host."],
    p: ["The service crashes while the kernel waits, and every blocked operation hangs until a timeout that was set too long.", "A malicious user program writes to the port and sends forged verdicts."],
    v: "Kill the user-space service during an event burst and confirm no operation blocks beyond the timeout, drop counters record the gap with sequence numbers, and the restarted service resumes without kernel reload.",
    dep: ["kernel-component-safety"]
  },
  "kernel-component-safety": {
    s: "Engineering practices that keep code running in the kernel from crashing or compromising the host: strict input validation, bounded execution, fault isolation and staged release.",
    d: "Practices include validating every pointer and length from user space, bounding loops and wait times, using memory-safe or heavily tested code, parsing content only in user space or in a sandbox, fuzzing, running under verification tools in test and keeping the kernel footprint small. Updates are staged with early rings and kill switches, and the component can fall back to a minimal mode. The reason is blunt: a kernel fault takes the entire machine, and a mistake that ships in an update takes the whole fleet at once.",
    k: ["Minimal kernel footprint vs richer in-kernel capability: minimal footprints are safer and need more user-space round trips; rich capability is faster with larger crash surface.", "Memory-safe code in the kernel vs conventional low-level code: memory-safe code removes whole bug classes with toolchain and interface constraints; conventional code has wider support."],
    p: ["A null pointer dereference on an unexpected input crashes every machine that processes the same content.", "A test environment lacks the driver and configuration mix of customer machines, so a defect passes all tests."],
    v: "Run the kernel component under a fuzzer and verification tools with malformed inputs for a fixed duration, and confirm zero crashes, then boot a canary ring of varied hardware and confirm no boot loops after the update.",
    dep: []
  },
});
