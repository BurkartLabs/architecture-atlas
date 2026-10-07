// Details for the load testing plate, part 2: test data, protocol clients, generator runtime, distribution.
ATLAS.details("load-testing", {
  "data-parameterization": {
    s: "Replacing fixed values in requests with values drawn from data sets, so each virtual user sends different accounts, products and search terms.",
    d: "Scenarios reference named variables, and the data layer supplies a value for each use according to a strategy: sequential, random, or unique per user. Parameters can come from files, generators or earlier responses. Good data has the same skew as production, where a few items are popular and most are rare. It is hard because uniform random data defeats caches and unique-key paths differently from real traffic, so the distribution matters as much as the values.",
    k: ["Uniform random versus production-shaped distributions: uniform is simple but defeats or overuses caches; shaped data is realistic but requires analysis of real traffic.", "Reading data on demand versus loading it all into memory: loading is fast but costs memory per generator; on-demand keeps memory low and adds I/O to the hot path."],
    p: ["Every user requests random product identifiers, so the target's cache hit rate is far below production and latency is overstated.", "A data file is too small, and values repeat so often that unique constraints or deduplication change the behavior."],
    v: "Compare the distribution of a parameter in the target's access log with the distribution in production, and confirm that the cache hit ratio during the test is in the same range as production.",
    dep: ["data-feeders","unique-data-allocation"]
  },
  "data-feeders": {
    s: "Components that read records from files, databases or generators and hand them to virtual users in a defined order and with a defined policy for running out.",
    d: "A feeder loads a data set and serves records through strategies: circular, random, queue or shuffle. It must be thread-safe and fast, since it is on the path of every iteration. When data runs out it either wraps, fails the test or stops the user, and that policy should be explicit. It is hard because in a distributed run the same file is on every generator, so a naive feeder gives the same records to all of them.",
    k: ["Circular wrap-around versus fail-on-exhaustion: wrapping keeps the test running but reuses data and can violate uniqueness; failing makes the shortage visible.", "In-memory feeder versus a shared feed service: in-memory is fast but duplicates data per generator; a service keeps one source of truth at the cost of a network call."],
    p: ["The feeder wraps silently, and after the first pass users share accounts, causing lock contention that no real traffic would cause.", "A slow shared feeder service becomes the bottleneck and throttles the whole test."],
    v: "Run a test longer than the data set's length and confirm the configured exhaustion policy fires visibly, and that two generators never receive the same record from a unique feed.",
    dep: ["data-partitioning","data-parameterization"]
  },
  "dynamic-value-extraction": {
    s: "Pulling values out of one response, such as tokens, identifiers and form fields, and using them in later requests, as a real client would.",
    d: "After a response arrives, extractors apply a pattern to the headers or body, via a path expression over structured data or a regular expression over text, and store the result in the user's variables. A later request references it. Extraction turns recorded scripts into working ones. It is hard because extraction failures are quiet: a pattern that matches nothing leaves an empty variable, and the following requests fail in ways that look like target errors.",
    k: ["Structured-path extraction versus regular expressions: paths are precise and cheap on structured data; patterns handle arbitrary text but are fragile and slower.", "Failing the step on a missed extraction versus continuing: failing exposes script bugs immediately; continuing keeps load constant but pollutes the error rate."],
    p: ["A changed field name makes the extraction return nothing, and every later request sends an empty identifier and gets a fast rejection.", "Extractors run on large bodies for every response and consume the generator's CPU."],
    v: "Run one virtual user against a stub that returns a known token and confirm the next request carries exactly that token, and that a deliberately missing field produces a named error, not an empty request.",
    dep: ["checks-and-assertions","http-client"]
  },
  "unique-data-allocation": {
    s: "Ensuring each virtual user gets records that no other user is using at the same time, such as a distinct account or order, where the target requires it.",
    d: "Some operations, like login to a single-session account or editing a record, conflict if two users share the same data. The allocator hands out each record to one user and takes it back at the end of use, or assigns disjoint ranges to each user ahead of time. It must also account for data consumed by a run, such as an order that cannot be placed twice. It is hard because allocation across many generators needs either partitioning or a shared lock service.",
    k: ["Pre-assigned ranges versus a central allocator: ranges need no coordination and scale, but leave data idle in a slow partition; a central allocator balances but is a shared dependency.", "Reusable records versus consumable records: reuse keeps the pool small but needs reset; consumable data is simple per run but must be regenerated every time."],
    p: ["Two users share one account and lock each other, so latency reflects test-made contention, not target capacity.", "Records consumed by a previous run are not reset, and the test fails at the start with already-processed errors."],
    v: "Run a test with the maximum planned users and confirm via the target's records that no two simultaneous sessions used the same account, and that a rerun after reset begins cleanly.",
    dep: ["data-partitioning","data-cleanup"]
  },
  "credential-and-token-pools": {
    s: "Pre-created users and pre-obtained tokens that virtual users draw on, so that authentication does not dominate or distort the measured traffic.",
    d: "Realistic tests need many distinct identities. The pool is created before the run through provisioning scripts, or logged in at test start, and tokens are refreshed before expiry. Pre-obtained tokens skip the login path, which is appropriate when login is not under test. The pool also protects the identity provider from being load-tested by accident. It is hard because tokens expire mid-run and because creating thousands of users in a shared environment may itself be rate limited.",
    k: ["Log in during the test versus using tokens obtained beforehand: logging in tests the identity path but adds load to it; pre-obtained tokens isolate the target but skip a real code path.", "One shared identity versus one per user: a shared identity is easy and hits per-user caches and rate limits unrealistically; unique identities are realistic and expensive to create."],
    p: ["All tokens expire at the same minute mid-run, and the error rate jumps for a reason unrelated to the target.", "Thousands of requests under one identity hit a per-user rate limit, so most traffic is rejected."],
    v: "Run longer than the token lifetime and confirm refresh happens before expiry, that requests carry distinct identities, and that the identity provider's own load matches the intended share.",
    dep: ["data-feeders","load-test-authentication"]
  },
  "synthetic-data-generation": {
    s: "Creating the data sets for a test, with realistic shapes, sizes and relationships, either on the fly or in advance, without copying real personal data.",
    d: "Generators produce names, addresses, order lines and documents following rules for format, uniqueness, size and correlation. The target database is often seeded to a realistic volume first, since a query on a thousand rows says nothing about one on a hundred million. Production data, if used, is masked or sampled. It is hard because realism has many dimensions, such as value skew, referential structure and text length, and a data set that looks right in size may be wrong in distribution.",
    k: ["Generated data versus masked production data: generated is safe and repeatable but may miss real skew; masked production data is realistic but risks leaking personal information and is heavy to move.", "Seeding the target to production volume versus a small set: full volume exposes index and cache behavior; a small set is quick and misleads about queries."],
    p: ["The test database holds ten thousand rows while production holds a billion, so every query plan differs and latency is far too good.", "Masked data keeps identifying details that were not on the mask list."],
    v: "Compare table sizes, value distributions and query plans of a representative query between the seeded test target and production, and confirm they agree within a stated tolerance.",
    dep: ["data-parameterization","environment-isolation"]
  },
  "data-partitioning": {
    s: "Splitting the data set across generators so each uses its own disjoint slice, avoiding collisions and keeping coordination off the hot path.",
    d: "The coordinator assigns each generator a range, a hash bucket or a separate file before the test starts. Each generator then feeds its virtual users without talking to the others. Partitions are sized to the expected consumption, and the plan accounts for generators added or lost mid-run. It is hard because uneven partitions leave some generators out of data while others have plenty, and failing generators strand records.",
    k: ["Static partitions at start versus dynamic hand-out in batches: static avoids coordination but is rigid; batches balance but add messages during the run.", "Partition by user versus by record: by user keeps sessions consistent within a generator; by record spreads load of popular items evenly."],
    p: ["One generator runs out of data in the middle of the run because its slice was sized for equal users, but its share of requests was larger.", "A failed generator takes its unused slice with it, and the test ends short."],
    v: "Start a distributed run, dump the first records served by each generator, and confirm the slices are disjoint and that the sum of consumed records equals the sum served.",
    dep: ["work-distribution","data-feeders"]
  },
  "http-client": {
    s: "The client that builds, sends and parses HTTP requests and responses for virtual users, with enough control to behave like real clients at low cost.",
    d: "It supports methods, headers, bodies, redirects, compression, cookies, keep-alive, and multiple protocol versions. It records timing phases per request, and it should do as little work per response as possible: read and discard the body unless a check needs it. Cookie jars and caches are per user. It is hard because the client's defaults, such as redirect following, retries, and header sets, silently change the traffic, and subtle differences from real clients change how the target and its proxies respond.",
    k: ["Using the full protocol stack versus a minimal custom client: a full stack behaves like real clients and costs CPU; a minimal one is faster but may miss behaviors such as redirects or compression.", "Automatic retries versus none: retries imitate resilient clients but hide failures and add hidden load; no retries expose errors truthfully."],
    p: ["The client follows redirects automatically, and one logical request is counted as one but produces three on the target.", "Bodies are fully buffered for every response, and memory grows with response size times concurrency."],
    v: "Send a known request from one virtual user and capture it at the target or a proxy, confirming method, headers, compression and connection reuse match what a real client sends.",
    dep: ["connection-pooling","tls-handling","name-resolution","high-resolution-timer"]
  },
  "connection-pooling": {
    s: "Management of reused connections: when a virtual user opens a new connection, when it reuses one, and how many may be open at once.",
    d: "Real clients reuse connections within a session and open several in parallel; the pool mimics this by keeping per-user or shared connections alive, with limits on total and per-host counts. Whether connections are shared among virtual users changes the target's connection count dramatically. It is hard because the pool setting is part of the workload: a pool shared by all users hides handshake costs and head-of-line blocking, and one per user multiplies connections to numbers that stress load balancers.",
    k: ["Per-user connections versus a shared pool: per-user connections mimic distinct clients and their handshake costs, a shared pool saves sockets and understates connection load.", "A strict connection cap versus unbounded opening: a cap protects the generator but queues requests locally and adds latency that real clients would not see."],
    p: ["A small pool queues requests inside the generator, and the measured latency includes waiting for a connection that no real client would wait for.", "A shared pool hides the cost of new connections, and the target's connection limits are never exercised."],
    v: "Count connections at the target during a run and confirm the number and reuse rate match the intended client model, and that the latency breakdown shows connection wait separately.",
    dep: ["port-and-socket-limits","latency-breakdown"]
  },
  "tls-handling": {
    s: "Encrypted connection setup and resumption for virtual users: handshakes, session reuse, certificate checks and the CPU cost on both sides.",
    d: "Real clients negotiate encryption, validate certificates and resume sessions. The generator can model full handshakes for new clients and resumption for returning ones, with realistic protocol versions and cipher offers. Handshakes are among the most expensive parts of connection setup, so the share of new connections determines how much CPU the target spends on cryptography. It is hard because disabling verification or encryption for convenience changes the target's real cost, and certificate stores on generators drift.",
    k: ["Full handshake per new user versus resumption: full handshakes stress the target's crypto path realistically; resumption is cheap and fits returning clients.", "Verifying certificates versus trusting everything: verifying matches real behavior and catches broken certificates; trusting everything is simpler for test environments and hides misconfiguration."],
    p: ["Tests run without encryption against a target that terminates it in production, and the CPU cost of handshakes never appears.", "A generator's trust store lacks the test environment's certificate authority, and every request fails at handshake."],
    v: "Capture a connection and confirm the protocol version, cipher offer and resumption behavior match those of real clients, and compare target CPU per handshake against production measurements.",
    dep: ["connection-pooling","name-resolution"]
  },
  "name-resolution": {
    s: "How virtual users turn host names into addresses: resolver caching, rotation across records and the load on the name service itself.",
    d: "Target names usually resolve to several addresses through a load balancer or round-robin records. A generator that resolves once and caches the answer sends all its traffic to one address, while real clients spread across them. The tool can resolve per connection, honor expiry times, or pin addresses for controlled tests. It is hard because operating-system resolvers cache in ways the tool does not control, and because one generator behind one resolver is not representative of thousands of clients.",
    k: ["Resolve once per run versus per connection: once is cheap and pins traffic to one address; per connection spreads load like real clients and adds resolver traffic.", "Using the system resolver versus a built-in one: the system resolver reflects deployment settings; a built-in one gives control and honest timing."],
    p: ["All generator traffic goes to one balancer node, which saturates while its peers sit idle, and the result blames the balancer.", "Resolution time is counted inside request latency in one run and excluded in another, making comparison meaningless."],
    v: "Observe the destination addresses of connections over a run and confirm they spread across the record set in the proportions production clients show, and that resolution time is reported on its own.",
    dep: ["latency-breakdown","connection-pooling"]
  },
  "websocket-and-streaming-client": {
    s: "Clients for long-lived connections and streams, which hold state for minutes or hours and send and receive messages, unlike one-shot request and response.",
    d: "These clients open a persistent connection, perform a handshake, subscribe, then send and receive frames while the scenario runs. Measurement shifts from per-request latency to message delay, delivery rate and connection survival. The load is the number of held connections and the message rate across them. It is hard because the interesting cost is memory and file descriptors held for each idle connection, and because measuring message latency needs a timestamp carried in the payload and clocks that agree.",
    k: ["Many idle connections versus fewer busy ones: idle holds test the target's memory and descriptor limits; busy ones test message throughput; real systems have both.", "Message delay measured by embedded timestamps versus by request echo: timestamps measure one-way delay but need synchronized clocks; echo measures round trip on a single clock."],
    p: ["Connections ramp too fast and the target's accept queue overflows, so the failures reflect the ramp, not steady capacity.", "Message latency is computed from clocks on two hosts that differ by hundreds of milliseconds."],
    v: "Hold the target number of connections for the planned duration and confirm none dropped silently, that message rate matches the plan, and that delay measured by two methods agrees.",
    dep: ["concurrency-runtime","clock-sync","port-and-socket-limits"]
  },
  "queue-and-broker-client": {
    s: "Producer and consumer clients for messaging systems, used to load asynchronous paths where work is accepted now and finished later.",
    d: "A producer sends messages at a controlled rate with chosen sizes and keys, and consumers read and acknowledge them, so throughput, backlog and end-to-end delay can be measured. Latency is not a single response time but the delay from publish to final processing, found by tagging messages and observing their completion. It is hard because the interesting failures are backlogs that grow slowly and uneven partition load, and neither shows up in a send-side timing.",
    k: ["Measuring publish acknowledgment versus end-to-end completion: acknowledgment is easy and says little about processing; end-to-end needs correlation of tagged messages but measures what users wait for.", "Even keys versus production-like skewed keys: even keys balance partitions and hide hot spots; skewed keys expose the real bottleneck."],
    p: ["The test reports healthy publish latency while the consumer backlog grows by millions of messages.", "Message keys are random, so no partition is hot, while production traffic sends one customer's messages to a single partition."],
    v: "Publish tagged messages at a steady rate, measure the delay until each completes processing, and confirm that a deliberately slowed consumer shows growing delay and backlog in the report.",
    dep: ["run-markers","protocol-plugin-interface","high-resolution-timer"]
  },
  "database-wire-client": {
    s: "A client speaking a database's wire protocol directly, to load the database layer in isolation or replay captured query workloads.",
    d: "It opens connections, authenticates, runs statements with parameters and reads result sets, recording latency per statement. It can replay a captured workload at its original timing or scale it. Used alone it tests the database without the application. It is hard because a realistic database workload depends on transaction boundaries, prepared statement behavior, session settings and data values, and a replay that ignores them misrepresents locking and plan caching.",
    k: ["Replaying captured queries versus synthetic query mixes: replay is realistic for one past period but ages and needs privacy handling; synthetic mixes are controllable but approximate.", "Direct database load versus load through the application: direct isolates the data layer; through the application includes connection pools and object mapping costs that often dominate."],
    p: ["Replayed queries use parameter values from a past day and hit rows that no longer exist, so the plans are unrealistic.", "Each client opens its own connection beyond the database's connection limit, and the test measures connection rejection."],
    v: "Run the workload against a copy of the database and confirm statement counts, lock waits and cache behavior reported by the database resemble those seen during production load.",
    dep: ["protocol-plugin-interface","synthetic-data-generation","connection-pooling"]
  },
  "rpc-client": {
    s: "A client for binary request and response protocols driven by interface definitions, with generated stubs, streaming calls and metadata.",
    d: "Interface definitions generate message types and call stubs. The client serializes messages, sends them over multiplexed connections, and handles status codes, deadlines and streaming. Because many calls share one connection, the number of connections no longer indicates load. It is hard because multiplexing and flow control change where queueing occurs, and because load balancing for such connections may happen per connection, so a few long-lived connections pin all load on a few server instances.",
    k: ["One multiplexed connection per generator versus many: one is efficient and pins load on one server instance; many spread load but cost more setup.", "Honoring deadlines versus unlimited waits: deadlines mimic real callers and produce timeouts that count as errors; unlimited waits hide stalls inside very high latencies."],
    p: ["A single connection per generator concentrates all calls on one server instance behind a connection-level balancer.", "The interface definition used for load differs from the deployed one, and the target rejects calls or ignores unknown fields."],
    v: "Check the distribution of calls across server instances during the run and confirm it matches that of production clients, and that deadline failures are counted as errors.",
    dep: ["protocol-plugin-interface","connection-pooling","tls-handling"]
  },
  "protocol-plugin-interface": {
    s: "The extension point through which new protocol clients are added, defining how they open connections, send, receive and report timing and errors.",
    d: "A plugin implements a small contract: create a session, perform an operation, close, and emit timing and status in the shared sample format. The runtime handles scheduling, data and metrics. Because every protocol reports through the same samples, thresholds and reports work unchanged. It is hard because protocols differ in what counts as a request, a success and a latency, and a plugin that reports these differently quietly breaks comparability across protocols.",
    k: ["A narrow contract versus a rich one: narrow keeps plugins simple and uniform; rich lets plugins expose protocol-specific timing at the cost of more varied reports.", "In-process plugins versus out-of-process workers: in-process is fast; out-of-process isolates crashes and allows any implementation at the cost of per-call overhead."],
    p: ["A plugin measures latency from its own queue entry instead of the actual send, and reports numbers smaller than any other client.", "A plugin crash takes down the generator and loses every sample not yet flushed."],
    v: "Run a plugin against a stub with a known fixed delay and confirm reported latency equals that delay within timer resolution, and that errors appear with the expected classification.",
    dep: ["high-resolution-timer","error-classification","sample-buffer"]
  },
  "scheduler": {
    s: "The core loop that decides which virtual user runs next and when, using timers and ready queues to start work at planned moments.",
    d: "It keeps a time-ordered structure of pending events, such as arrivals, wakeups after think time and timeouts, and a queue of ready users. At each step it dispatches ready users to executors and sleeps until the next event. Efficient timers, such as hierarchical wheels or heaps, matter at hundreds of thousands of events. It is hard because it must stay responsive even while users do work, as a slow user callback delays every other timer and shows up as extra latency in unrelated requests.",
    k: ["A single scheduler thread versus one per core: a single thread is simple and deterministic but caps throughput; per-core schedulers scale but need partitioning of users.", "Wheel timers versus a heap: wheels give constant-time insertion with limited precision; heaps are exact and cost logarithmic time."],
    p: ["A blocking call inside a user step stalls the scheduler, and every other user's timing is delayed.", "Timer precision is coarse, so arrivals are rounded to the same tick and sent in bursts."],
    v: "Schedule a fixed number of events per second and measure the lateness of each, confirming the high percentile of lateness stays well below the smallest latency being measured.",
    dep: ["high-resolution-timer","concurrency-runtime"]
  },
  "vu-executor": {
    s: "The component that runs one virtual user's scenario step by step, switching between users as they wait for I/O, think time or timers.",
    d: "The executor owns each user's state and drives the script: call a client, wait, continue. It decides how users map onto threads or tasks, and how many are active per core. It enforces iteration limits and stops users at the end of a stage. It is hard because each blocked user must cost almost nothing, and because overload changes behavior: when responses are slow, a closed model queues users while an open one creates more executors.",
    k: ["One thread per user versus cooperative tasks: threads are simple but cost memory and switches; tasks scale to tens of thousands per core and need non-blocking clients.", "Reusing user objects between iterations versus creating new ones: reuse reduces allocation but risks leaking state between iterations."],
    p: ["A scenario step does synchronous heavy work, such as hashing, and blocks other users on the same worker.", "Users that are stuck on a dead connection stay forever in the active count, so the number of users appears constant while no work is done."],
    v: "Run with the planned users and confirm via generator metrics that active-user count, iterations per second and per-step durations are consistent, and that stuck users are terminated by timeouts.",
    dep: ["scheduler","script-runtime","concurrency-runtime"]
  },
  "concurrency-runtime": {
    s: "The model under which many virtual users overlap in time: operating threads, event loops with non-blocking I/O, or lightweight tasks multiplexed onto few threads.",
    d: "It decides how I/O waiting is handled and how work is spread over cores. Event-driven runtimes use a few threads that never block, handling thousands of sockets each; thread-based ones are simpler to script but heavy. Either must avoid sharing mutable state across cores. It is hard because garbage collection or allocator pauses, lock contention and scheduler preemption on the generator all appear as latency in the measured requests unless they are separated from the target's.",
    k: ["Event loop versus threads per user: event loops scale to huge connection counts; threads allow straightforward blocking code and top out in the thousands.", "Pinning workers to cores versus letting the operating system move them: pinning reduces jitter and cache misses but wastes cores when load is uneven."],
    p: ["One worker thread becomes saturated while others idle because users were assigned unevenly, and its users see inflated latency.", "A pause for memory reclamation freezes all users for tens of milliseconds, which appears as a latency spike at the target."],
    v: "Measure event-loop lag or scheduling delay on the generator under full load and confirm it is small compared with the shortest latency of interest, with no correlated pauses in the latency series.",
    dep: ["scheduler","port-and-socket-limits"]
  },
  "script-runtime": {
    s: "The execution environment that runs user scenario code, providing the APIs to call clients, access data and record metrics, with limits on cost per call.",
    d: "It embeds an interpreter or loads compiled scenario code, exposes a controlled API surface, and gives each virtual user isolated state. Startup time, per-user memory and per-call overhead decide how many users fit on a host. It also enforces sandbox limits so a bad script cannot damage the generator. It is hard because script-level cost, such as string building or parsing inside a scenario, consumes the same CPU that the protocol client needs and slows the load that is being applied.",
    k: ["An embedded interpreter versus native scenario code: an interpreter makes scripts portable and safe but costs CPU per step; native code is fastest and needs a build step and sandboxing.", "Isolated state per user versus shared globals: isolation prevents leaks and costs memory; shared state is cheap and prone to races."],
    p: ["Scenario code builds large strings per request, and the generator's CPU is spent in the script instead of sending traffic.", "Global variables are shared across users, and one user's value overwrites another's."],
    v: "Profile the generator running the scenario and confirm that most CPU time is in the protocol client and not in script code, and that per-user memory matches the capacity plan.",
    dep: ["concurrency-runtime","generator-resource-guard"]
  },
  "rate-pacer": {
    s: "A limiter that holds the actual send rate to the configured request or iteration rate, smoothing bursts and compensating for drift.",
    d: "The pacer uses token buckets or fixed-interval schedules to release work at a defined rate, per scenario or in total. It measures how far behind the plan the generator is and either catches up within a bound or records the shortfall. Rate limits cover requests per second, bytes per second or iterations per second. It is hard because high rates need microsecond-level timing, and a pacer that sleeps with coarse timers produces bursts of requests at timer boundaries.",
    k: ["Token bucket with bursts versus strict spacing: a bucket allows bursts that match real traffic and can overload; strict spacing is smooth and unlike real arrivals.", "Pacing per generator versus globally: per generator needs no coordination and drifts in total; global pacing is exact and needs a shared clock or quota service."],
    p: ["The pacer cannot keep up, quietly delivers eighty percent of the planned rate and the report states the planned figure.", "Catch-up is unbounded, and after a stall the pacer fires seconds of backlog in one burst."],
    v: "Compare requests sent per second over each interval with the configured rate and confirm the error is small, and that the report shows any shortfall as an explicit number.",
    dep: ["high-resolution-timer","scheduler"]
  },
  "generator-resource-guard": {
    s: "Monitoring of the generator's own CPU, memory, network and event-loop lag, with a flag on any result produced while the generator was overloaded.",
    d: "The guard samples host and process resources alongside the load run, and compares them with limits. If the generator crosses a limit, the run is flagged, because latencies measured on a saturated generator include its own queueing. It reports these as first-class metrics next to target metrics. It is hard because overload is gradual: CPU at ninety percent may already be distorting timing, and the limit that matters depends on the workload.",
    k: ["Flag the run versus abort it: flagging keeps data but risks someone reading it anyway; aborting protects against bad conclusions at the cost of lost runs.", "Fixed resource limits versus ones calibrated by a pilot run: fixed limits are simple but wrong across hardware; calibration is accurate and needs extra runs."],
    p: ["The generator runs at full CPU for the whole test and the latencies are inflated, but the report shows only target metrics.", "Only CPU is watched, and the limit hit is actually network bandwidth or socket count."],
    v: "Run a test that deliberately exceeds the generator's capacity and confirm the report marks the run as generator-limited and the verdict is inconclusive, while a lighter run is not flagged.",
    dep: ["concurrency-runtime","port-and-socket-limits"]
  },
  "port-and-socket-limits": {
    s: "The operating system limits on open files, ephemeral ports and connection tracking that cap how many concurrent connections one generator can hold.",
    d: "Each connection uses a descriptor and a local port; the number of ports available per destination address is tens of thousands, and connections in the closing state occupy them for a time. Firewalls and address translation add their own tables. Generators raise limits, widen port ranges, spread across several local addresses or destinations, and reuse connections. It is hard because the failure appears as connection errors or long connect times that look like target problems.",
    k: ["Adding local addresses versus adding generators: addresses raise the port ceiling cheaply on one host; more hosts also add CPU and bandwidth.", "Reusing connections versus opening new ones: reuse avoids port exhaustion and understates handshake load; new connections are realistic and quickly hit limits."],
    p: ["Ephemeral ports run out under a high connection rate, and connect errors begin at a rate that tracks the generator, not the target.", "Default descriptor limits cap the generator at about a thousand connections, far below the plan."],
    v: "Open the maximum planned connections from one generator, confirm none fail from local resource errors, and check that the counts of closing connections do not approach the port limit.",
    dep: []
  },
  "coordinator": {
    s: "The control node that distributes a test to generators, starts and stops them in sync, gathers their results and produces one combined report.",
    d: "The coordinator parses the test definition, splits the load and data across generators, sends the work and waits for readiness. During the run it collects metric streams, evaluates thresholds on the merged data and handles abort requests. At the end it assembles results. It is hard because it must tolerate generator failures: a lost generator reduces delivered load, and the coordinator must detect that, report it and decide whether the run is still valid.",
    k: ["A central coordinator versus peer-to-peer generators: central is simple and single-point-of-failure; peer-to-peer survives loss of any node and complicates merging and control.", "Coordinator in the data path versus control only: in the path it sees every sample and becomes a bottleneck; control only scales by sending metrics to a separate store."],
    p: ["A generator dies mid-run and the coordinator keeps reporting the planned load, so the target appears to handle load that was never sent.", "The coordinator is on a small machine and becomes the limit when merging high sample rates."],
    v: "Kill one generator mid-run and confirm the coordinator detects it within a few seconds, reports the lost share of load and marks the run according to policy.",
    dep: ["generator-agent","work-distribution","start-stop-barrier","histogram-merging"]
  },
  "generator-agent": {
    s: "The process on each generator host that receives a share of the test, runs it locally and streams results back to the coordinator.",
    d: "The agent receives its slice of the scenario, data and rates, starts the local runtime, reports readiness, and sends aggregated metrics and health at intervals. It reports local errors and stops promptly on command. It should be stateless between tests and cheap to start so generators can be created on demand. It is hard because the agent shares the host with the load it generates, and its own reporting traffic must not interfere with measurement.",
    k: ["A long-running agent versus a process launched per test: long-running starts fast but accumulates state and versions; per-test is clean and costs startup time.", "Push of metrics from agent versus pull from coordinator: push works through firewalls and scales; pull gives the coordinator control of rate but needs inbound access."],
    p: ["Agent and tool versions differ between hosts, and the scenario runs with different behavior on each.", "The agent's reporting uses the same network interface as the load and competes with it for bandwidth."],
    v: "Start agents on hosts with mixed history, run the same short test and confirm each reports the same tool version and a matching configuration hash, and that the load reaches each share's target.",
    dep: ["vu-executor","sample-buffer","metric-transport"]
  },
  "work-distribution": {
    s: "Dividing the load profile, scenarios and data among generators so the sum matches the plan and generators of different sizes get fair shares.",
    d: "The coordinator computes each generator's share of arrival rate or user count, often proportional to its measured capacity, and assigns data partitions. When a generator is added or lost, it can redistribute. Uneven splitting of integers and rates must not drop or double load. It is hard because capacity differs by host, and because a share must stay below what that host can deliver without distortion, or the run is capped by the weakest node.",
    k: ["Equal shares versus capacity-weighted shares: equal is simple and limited by the weakest host; weighting uses all hosts but needs a capacity calibration.", "Static split versus rebalancing during the run: static is predictable; rebalancing survives failures and changes the load pattern mid-run."],
    p: ["Integer division gives each generator a rounded share, and the total delivered rate is a few percent below plan.", "One slower host gets an equal share, saturates, and quietly delivers less while inflating its latencies."],
    v: "Sum the achieved rate across generators per interval and confirm it matches the plan, and that per-generator achieved rates match their assigned shares within tolerance.",
    dep: ["generator-health-monitor","data-partitioning"]
  },
  "clock-sync": {
    s: "Keeping the clocks of generators and servers close enough that timestamps from different hosts can be ordered and overlaid.",
    d: "Hosts synchronize with a network time source, and the tool measures and records each generator's offset against the coordinator. Metrics are bucketed by timestamp, so offsets of even a second shift buckets between generators and blur peaks. For one-way message delay the offset directly adds to the result. It is hard because a drifting virtual machine clock can jump, and per-request latencies come from local monotonic clocks, which are unaffected, while the bucket timestamps come from wall time, which is.",
    k: ["Monotonic clock for durations versus wall time: monotonic is immune to adjustments; wall time is needed to align with other systems and can step.", "Trusting host synchronization versus measuring offsets in the tool: trusting is free and unverified; measuring adds a protocol and proves the alignment."],
    p: ["One generator's clock is three seconds off, so its metric buckets are merged into the wrong seconds and the combined graph shows a false dip.", "Latency is computed from wall-clock differences, and a clock adjustment during the run produces negative durations."],
    v: "Record each generator's offset against the coordinator before and after a run and confirm it is within the tolerance required by the finest bucket size, and that no negative durations appear.",
    dep: []
  },
  "start-stop-barrier": {
    s: "A synchronization point so all generators begin and end their load at the same moment, instead of each starting when its own setup finishes.",
    d: "Generators prepare, load data, open initial connections and report ready. The coordinator then sets a common start time slightly in the future and every agent starts at that instant according to its synchronized clock. Stop and abort work the same way. This gives a clean aligned ramp across the cluster. It is hard because a generator that is late makes the ramp uneven, and waiting for the slowest stalls a large run, so a policy for stragglers is needed.",
    k: ["Wait for all generators versus start with those ready: waiting gives a clean full-strength test; starting with a subset avoids stalls and delivers less load.", "Scheduled start time versus a start message: a time is precise if clocks agree; a message is simple and varies by network delay."],
    p: ["Generators start at different times because setup took longer on some, so the ramp is a staircase of arrivals, not the planned smooth line.", "A start time in the past because of a clock offset makes one generator start instantly while the rest wait."],
    v: "Log each generator's first request time in a distributed run and confirm they fall within a small window around the planned start, and that stop times align similarly.",
    dep: ["clock-sync","generator-agent"]
  },
  "generator-provisioning": {
    s: "Creating and removing generator hosts on demand, with a known image, enough resources and a network position suited to the test.",
    d: "Provisioning starts hosts from a standard image holding the tool, system limits and certificates, sized to the planned load, and removes them afterward. Choices of host size, count and location come from capacity estimates. Using the same image each time keeps tests comparable. It is hard because cloud hosts vary in performance and neighbors, and because creating hundreds of hosts for a test costs money and time that must be planned, with cleanup guaranteed.",
    k: ["Dedicated long-lived generators versus created per test: long-lived hosts start instantly and cost money idle; per-test hosts cost only while used and add minutes of startup.", "Few large hosts versus many small ones: large hosts need fewer agents; small ones give finer scaling and spread of network paths."],
    p: ["Generators are not removed after a failed run, and a fleet runs for days at cost.", "Hosts are drawn from different hardware generations, so per-host capacity differs and results shift run to run."],
    v: "Provision a fleet, run a calibration test measuring each host's maximum clean rate, and confirm all are within a narrow band; after the run confirm every host is gone.",
    dep: ["generator-agent","port-and-socket-limits"]
  },
  "generator-health-monitor": {
    s: "Continuous checks of each generator's liveness, resource use and delivered rate, used to detect failures and mark degraded data.",
    d: "Agents send heartbeats and metrics for CPU, memory, network, event-loop lag and achieved rate against assigned rate. The monitor declares a generator lost after missed heartbeats, flags degraded ones and informs the coordinator, which can redistribute load or mark the run. It feeds the report's note on how trustworthy the numbers are. It is hard because a slow network can look like a dead generator, and a dead generator that is wrongly assumed alive silently removes load.",
    k: ["Short heartbeat timeouts versus long ones: short detects failure fast and misclassifies slow networks; long avoids false alarms and delays reaction.", "Redistributing a lost share versus accepting reduced load: redistribution maintains planned load and overloads survivors; accepting keeps measurement clean at lower load."],
    p: ["A generator that stopped sending traffic but still sends heartbeats is considered healthy.", "A temporary network partition triggers redistribution, and the returning generator doubles the load."],
    v: "Pause one generator's load while leaving its process alive and confirm the monitor flags a delivered-rate shortfall; then stop its process and confirm detection within the timeout.",
    dep: ["generator-resource-guard","metric-transport"]
  },
});
