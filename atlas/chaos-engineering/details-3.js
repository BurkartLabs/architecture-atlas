// Details for the chaos engineering plate, part 3: the fault library.
ATLAS.details("chaos-engineering", {
  "cpu-stress": {
    s: "Consumes processor capacity on a target, by busy loops or by a share limit, to test behavior when computation is scarce.",
    d: "The fault runs worker threads that spin at a chosen utilization on selected cores, or reduces the processor share given to the target. It tests autoscaling triggers, request timeouts under queueing, health check sensitivity and priority between critical and background work. The stress competes with the application for time slices, so effects depend on scheduler fairness. It is hard to interpret: stress threads and the application compete differently than an application's own load would, so the result approximates but does not equal a real overload.",
    k: ["Spin on all cores vs a fraction of cores: all cores simulate total starvation; a fraction tests partial contention and is more realistic.", "Stress workers vs limit the target's share: stress workers are simple; limiting the share is more faithful to noisy-neighbor conditions."],
    p: ["Stressing the host agent along with the target starves the agent and prevents its own cleanup.", "Autoscaling reacts by adding instances, which hides whether a single instance copes."],
    v: "Apply fifty percent CPU stress to one instance and confirm host utilization rises to the set level, request latency on that instance rises, and the load balancer or autoscaler response appears in telemetry.",
    dep: ["host-agent","cgroup-limits"]
  },
  "memory-pressure": {
    s: "Reduces free memory on a target by allocating or by limiting available memory, to test behavior under low memory, swapping and out-of-memory termination.",
    d: "The fault allocates and touches memory up to a target level, or lowers the memory limit of the target's resource group. It reveals how the application handles allocation failure, whether caches shrink, whether the host starts swapping and which process the kernel chooses to kill. It also exercises restart logic. It is hard because memory effects are nonlinear: little happens until a threshold, then everything slows and then a process is killed.",
    k: ["Allocate pressure from outside vs lower the target's limit: outside pressure tests host-wide behavior; a lowered limit tests the target's own handling and is more precise.", "Gradual growth vs sudden allocation: gradual finds the threshold; sudden tests abrupt spikes."],
    p: ["The pressure process itself is selected for termination first, so the experiment ends with no effect.", "Pressure on a shared host kills an unrelated neighbor."],
    v: "Raise memory use to ninety percent of the target's limit in steps and observe the swap rate, latency, and the point where the process is restarted, with the restart recorded in telemetry.",
    dep: ["host-agent","cgroup-limits"]
  },
  "disk-fill": {
    s: "Fills a filesystem to a chosen level to test behavior when storage is full: logging, writes, temporary files, databases and alerts.",
    d: "The fault creates large files on the target volume, using reserved space or sparse allocation, until a set percentage is used. It exposes applications that crash when logs cannot be written, databases that stop accepting writes and monitoring that fails to alert on full disks. The fault file location and cleanup are recorded exactly. It is hard because a full disk can stop the agent, the audit log and the system's own recovery tools, so cleanup must not need space.",
    k: ["Fill to a percentage vs fill to zero: a percentage tests alerts and early handling; zero tests the hard failure but may damage data and block cleanup.", "Fill the data volume vs the log volume: the data volume tests write failure; the log volume tests whether logging failure takes the service down."],
    p: ["Filling the volume that holds the agent's own files stops the agent from removing the fault.", "A database that corrupts on a full disk turns a test into data loss."],
    v: "Fill a log volume to ninety-five percent and confirm the disk alert fires, the service continues, and after cleanup the free space equals the original figure within a small tolerance.",
    dep: ["host-agent","auto-revert"]
  },
  "disk-io-slowdown": {
    s: "Makes storage reads and writes slower or intermittently failing to test timeouts, queue depth, cache behavior and durability handling.",
    d: "The fault throttles input and output on a device through resource limits, adds delay at the block layer or injects errors on some operations. Databases, queues and anything that writes synchronously show high latency, blocked threads and cascading timeouts. It also tests whether the application distinguishes slow storage from broken storage. It is hard because storage layers include caches that absorb the fault, so the effect depends on cache hit rate and write patterns.",
    k: ["Throttle throughput vs add latency per operation: throttling models a saturated shared device; per-operation latency models a failing or remote device.", "Delay vs inject errors: delay tests timeouts and back-pressure; errors test retry, corruption detection and failover."],
    p: ["Caches hide the slowdown, and the experiment passes because nothing hit the disk.", "Slow storage under a lock-heavy component blocks health checks and causes unnecessary restarts."],
    v: "Add fifty milliseconds to every write on a test volume and compare write latency and request latency before and during the fault, with the delay visible in storage metrics.",
    dep: ["block-layer-faults","cgroup-limits","host-agent"]
  },
  "descriptor-exhaustion": {
    s: "Uses up file descriptors, sockets or similar per-process or per-host limits to test how software behaves when it cannot open anything new.",
    d: "The fault opens many descriptors, or lowers the limit for a target, so that new connections, files and pipes fail. Typical results are refused connections, failures to write logs and crashes where error handling is missing. It also tests that monitoring reports the condition. Related limits include ephemeral ports, process counts and inotify watches. It is hard because exhaustion often causes secondary failures far from the cause, such as an unrelated health check failing on a connection error.",
    k: ["Lower the limit vs consume descriptors: lowering is precise and reversible; consuming is closer to a leak but affects every process on the host.", "Per-process vs host-wide: per-process isolates the target; host-wide tests system behavior and risks the agent."],
    p: ["The agent shares the host-wide table and cannot open a connection to the control plane to be told to stop.", "Failure to open a log file crashes the process with no error message to diagnose."],
    v: "Lower the descriptor limit of one service in a test and confirm new connections are refused with the expected error, an alert fires on the usage ratio, and the limit returns to its original value afterward.",
    dep: ["cgroup-limits","host-agent"]
  },
  "clock-skew": {
    s: "Shifts or distorts a target's clock to test components that depend on time: expiry, ordering, leases, certificates and scheduled jobs.",
    d: "The fault moves the clock forward or back, changes its speed or makes it jump, either for the whole host or only for one process through interposition. It exposes lease and lock logic that trusts time, token and certificate validation, cache expiry, log ordering and distributed protocols that assume bounded drift. It is hard because time is used everywhere, a host-wide change affects the agent and monitoring too, and returning the clock can itself cause a jump that breaks software.",
    k: ["Process-level skew vs host-level skew: process-level is contained and safe; host-level tests the real failure of a drifting machine and risks every service on it.", "Step change vs gradual drift: a step finds hard failures; gradual drift tests tolerance and detection by clock monitoring."],
    p: ["Time moved back makes logs and traces out of order, so the timeline of the experiment cannot be trusted.", "Moving a clock into the past causes certificates to look not yet valid and fails the agent's own connection."],
    v: "Skew one process clock by two minutes and confirm token or lease expiry fires at the shifted time, other processes are unaffected, and the clock is restored without a jump in later timestamps.",
    dep: ["host-agent","syscall-faults"]
  },
  "process-kill": {
    s: "Terminates a chosen process, by signal or by killing its container, to test supervision, restart, state recovery and failover.",
    d: "The fault selects a process by name, role or identifier and sends a termination or kill signal, optionally repeatedly. It tests the init system or supervisor, restart delay, connection draining, in-flight request loss, client retries and state that was not persisted. A graceful signal tests shutdown handling; an immediate kill tests crash recovery. It is hard because a single clean restart shows little: the revealing cases are repeated kills, kills during startup and kills of the process holding a lock or leadership.",
    k: ["Graceful termination vs immediate kill: graceful tests shutdown code; immediate kill tests real crash recovery and data safety.", "Single kill vs repeated kills: single is the easy case; repeated kills test crash loops, back-off and the point where the supervisor gives up."],
    p: ["Killing a stateless process shows a pass, while the real weakness is the stateful peer nobody tested.", "A supervisor that restarts instantly hides lost requests that clients had to retry."],
    v: "Kill one replica under steady load and measure failed requests, the time until the replacement serves traffic and whether clients saw errors, then compare with the hypothesis bound.",
    dep: ["host-agent","signal-delivery"]
  },
  "instance-termination": {
    s: "Removes a whole virtual machine, container or node through the infrastructure's own control interface, to test replacement, capacity and data failover.",
    d: "The fault calls the cloud or cluster interface to terminate or stop a selected instance, or to cordon and drain it. It tests autoscaling groups, scheduling of replacements, load balancer deregistration, replication failover, and whether state on local disks is truly replicated. It reproduces the commonest real infrastructure failure. It is hard because replacement speed depends on capacity availability, images and warm-up time, which differ between quiet and busy times.",
    k: ["Terminate abruptly vs drain first: abrupt termination is the real failure case; draining tests planned maintenance and is easier to survive.", "Random instance vs chosen instance: random finds unexpected weaknesses; chosen targets the leader, the primary or the only holder of some data."],
    p: ["Terminating an instance holding the only copy of data turns a test into data loss.", "Capacity shortage in the zone means the replacement never starts, which the experiment treats as a platform error instead of a finding."],
    v: "Terminate one instance of a three-instance group under load and measure the time to a replacement serving traffic and the client error rate in the interval, both inside the hypothesis bounds.",
    dep: ["cloud-api-driver","cluster-operator","blast-radius-limit"]
  },
  "zone-outage": {
    s: "Simulates the loss of an entire availability zone or data center by making all of its instances and links unavailable together.",
    d: "The fault combines instance termination, network isolation and dependency blackholes for all targets in one zone, or blocks traffic at the zone boundary. It tests capacity headroom in the surviving zones, data replication and quorum, load balancer failover, DNS or traffic steering and operator procedures. It is the largest common scenario and is usually done as a game day with approvals. It is hard because it exercises everything at once, so a failure's cause is difficult to isolate.",
    k: ["Isolate the zone network vs terminate its instances: isolating is fast to undo and keeps instances alive; terminating tests replacement and data loss and is slower to recover.", "Whole zone at once vs staged by service: whole zone is realistic; staging finds individual weaknesses before the full test."],
    p: ["Surviving zones lack capacity for the redirected traffic and fail in turn.", "The control plane or monitoring lives in the zone being removed, so the test blinds its own safety."],
    v: "Isolate one zone during a game day and measure traffic moved to other zones, error rate, replica failover time and the capacity left in the surviving zones, then restore and confirm rebalance.",
    dep: ["network-partition","instance-termination","cloud-api-driver","game-day-planning"]
  },

  "latency-injection": {
    s: "Adds delay to network traffic or calls between chosen parties to test timeouts, retries, queueing and user-visible slowness.",
    d: "Delay is added at a proxy, in the host's network stack or in an application hook, with fixed values, distributions or occasional spikes. It tests whether callers set sensible timeouts, whether retries amplify load, whether circuit breakers open and whether slow dependencies are isolated by separate pools. It is the most informative fault because slow is harder to handle than down. It is hard because the effect depends on position: delay added on the client side, server side or in the path changes which timeouts see it.",
    k: ["Fixed delay vs a realistic distribution: fixed is repeatable and easy to read; a distribution with a tail matches real slow dependencies and finds timeout mismatches.", "Delay at the caller vs at the callee: caller-side delay tests the caller's timeouts; callee-side delay tests the callee's own queueing and its callers together."],
    p: ["A delay just under the caller's timeout never triggers failure handling but makes the system slow and saturated.", "Added delay that applies to health checks takes healthy instances out of rotation."],
    v: "Add four hundred milliseconds to one dependency and confirm the caller's latency histogram shifts by that amount, timeouts fire where configured, and the breaker state change appears in metrics.",
    dep: ["proxy-fault-filter","traffic-shaping","header-targeting"]
  },
  "packet-loss": {
    s: "Drops, duplicates, reorders or corrupts a fraction of network packets to test protocol recovery and application behavior on an unreliable link.",
    d: "Loss is applied by the host's traffic control layer or a network device model, as random, bursty or correlated loss. Reliable protocols retransmit, which turns loss into delay and throughput collapse; unreliable ones lose data. The fault tests retransmission timers, connection timeouts, streaming quality and failure detectors that use heartbeats. It is hard because small percentages of loss produce large effects on some protocols and none on others, and because bursts matter more than averages.",
    k: ["Random loss vs bursty loss: random is simple; bursty matches real congestion and defeats naive retry timing.", "Loss on all traffic vs on one port or peer: all traffic is blunt and risks the agent; one peer isolates a dependency."],
    p: ["Loss applied to the agent's control connection delays cleanup and the experiment appears to hang.", "Loss on a link carrying heartbeats causes false failure detection and unnecessary failovers."],
    v: "Apply five percent loss between two services and measure retransmissions, request latency tail and throughput against baseline, with loss rate verified by packet counters.",
    dep: ["traffic-shaping","host-agent"]
  },
  "bandwidth-limit": {
    s: "Restricts the data rate between components to test behavior over slow or saturated links, including large transfers, replication and backups.",
    d: "A rate limit is applied to a network interface, a flow or a proxy route, with a burst allowance. Large transfers slow down, queues build, and replication or log shipping may lag far behind. It tests back-pressure, flow control, chunking and timeouts that assume a certain throughput. It is hard because the limit may shift a bottleneck to somewhere unexpected: slow writes on one side can hold memory buffers or locks on the other.",
    k: ["Rate limit with queue vs rate limit with drop: queueing adds delay and tests memory use; dropping tests retransmission and loss handling.", "Per-flow limit vs per-interface limit: per-flow targets one relationship; per-interface tests contention among all traffic."],
    p: ["A limit on control traffic as well as data slows heartbeats and triggers false failures.", "Unbounded buffers on the sender grow until memory runs out, which is a real finding, but looks like an agent crash."],
    v: "Limit a replication link to ten percent of normal rate and measure replication lag growth, memory use of senders, and lag recovery time after the limit is lifted.",
    dep: ["traffic-shaping","host-agent"]
  },
  "network-partition": {
    s: "Splits the network so that some components cannot reach others while each side keeps running, to test quorum, leader election and split-brain handling.",
    d: "The fault blocks traffic between groups of instances or between a service and its dependencies, one-way or both ways, using firewall rules, routing changes or proxy rules. Distributed systems must pick a side, refuse writes or reconcile later. It tests consensus protocols, failure detection thresholds, client behavior with stale leaders and data merge. It is hard because partitions are partial and asymmetric in real life, such as A reaching B while B cannot reach A, which is harder to handle than a clean split.",
    k: ["Clean full partition vs partial or one-way partition: clean is simple to reason about; partial and asymmetric ones find the failures that actually occur.", "Block at the network layer vs at a proxy: network blocking is universal; proxy blocking is targeted but misses traffic that bypasses the proxy."],
    p: ["Blocking the control plane along with data traffic leaves both sides unsupervised.", "Both sides of a partition accept writes and corrupt data in the test environment, which is the finding, but needs a data check."],
    v: "Partition one replica from its peers and confirm the minority side refuses writes, a leader is elected on the majority side, and after healing all replicas converge to the same data.",
    dep: ["traffic-shaping","proxy-fault-filter","privilege-model"]
  },
  "dns-failure": {
    s: "Makes name resolution fail, slow down or return wrong answers to test caching, retries, fallbacks and dependence on names.",
    d: "The fault blocks queries to resolvers, returns errors or empty answers, adds delay, serves stale or incorrect addresses, or expires records. It tests resolver caching and time-to-live handling, library behavior on failed lookups, connection reuse and whether services work while names are unresolved. It is hard because resolution happens at several layers, in the application, a local cache and the system resolver, each with its own retry and cache behavior.",
    k: ["Fail all lookups vs fail specific names: all lookups simulate a resolver outage; specific names isolate one dependency.", "Return an error vs return a wrong address: errors test fallback; wrong addresses test validation and can send traffic where it should not go."],
    p: ["Cached answers hide the failure for the length of their lifetime, so a short experiment shows nothing.", "A wrong address that points at a live production service sends test traffic to a real system."],
    v: "Block lookups for one dependency name and measure how long existing connections keep working, when new connections begin to fail and how the service reports the error.",
    dep: ["traffic-shaping","proxy-fault-filter"]
  },
  "connection-reset": {
    s: "Closes or resets established connections abruptly, or refuses new ones, to test connection management, retries and idempotency.",
    d: "The fault sends resets, closes connections mid-request, lets connections hang with no response or refuses to accept. It is applied at a proxy or in the host's network stack. It exercises connection pools that hold dead connections, clients that retry non-idempotent calls, half-written requests and database transactions caught mid-flight. It is hard because the interesting damage happens at an exact moment, such as after a write was applied but before the reply, which random timing hits rarely.",
    k: ["Reset on connect vs reset mid-request: reset on connect is easy to retry; mid-request resets test whether a duplicate or lost operation is handled.", "Reset vs silent hang: resets fail fast and show retry logic; hangs test timeouts and are usually more damaging."],
    p: ["Retrying a payment call after a reset creates a duplicate charge in the test environment.", "Pools that never validate connections keep sending on dead ones long after the fault ended."],
    v: "Reset one percent of established connections under load and verify, from client and server logs, that every request ended exactly once as success or a handled error, with no duplicates.",
    dep: ["proxy-fault-filter","traffic-shaping"]
  },
  "certificate-expiry": {
    s: "Presents expired, not-yet-valid or untrusted certificates, or a stale trust set, to test whether renewal, validation and alerting work before real expiry.",
    d: "The fault replaces a certificate at a proxy or test endpoint with an expired or mismatched one, or moves the clock past a certificate's lifetime in a controlled place. It tests client validation, rotation automation, alerts on days left and the behavior of fallback and pinned certificates. It is hard because expiry causes sudden total failure at an exact moment, and renewals touch many systems in sequence.",
    k: ["Expired certificate vs revoked or untrusted one: expiry tests lifecycle management; revocation and trust failures test validation and root changes.", "Test endpoint vs real service: a test endpoint is safe; the real service tests the real chain but causes real failure."],
    p: ["Clients that skip validation pass the test and are insecure, which is a different finding.", "Renewal alerts routed to a retired mailbox never reach a person."],
    v: "Point a test client at an endpoint with an expired certificate: the connection is refused with the expected error, the alert for approaching expiry fires in an earlier test, and renewal replaces the certificate without restart.",
    dep: ["proxy-fault-filter","clock-skew"]
  },
  "dependency-blackhole": {
    s: "Makes a dependency unreachable in a way that gives no response, so callers must rely on their own timeouts, fallbacks and degraded modes.",
    d: "Traffic to the dependency is dropped silently, with no reset or refusal, so calls hang until timeout. This differs from a fast failure and is usually more harmful. It tests timeouts, circuit breakers, bulkheads, cached or default responses and whether non-critical dependencies are really optional. It is hard because the interesting result is the blast through the caller: threads and connections held waiting for the dead dependency can starve unrelated work.",
    k: ["Silent drop vs fast refusal: silent drop is the realistic worst case; fast refusal is easier to handle and tests only the error path.", "Block one dependency vs several at once: one finds specific weaknesses; several tests combined degradation and fallback chains."],
    p: ["A dependency believed to be optional turns out to be on the critical path and the service stops.", "A long default timeout makes the experiment end before the caller's timeout fires."],
    v: "Blackhole a non-critical dependency under load and confirm the page or API still returns within the latency bound, with the degraded mode flag visible in telemetry and no thread pool exhausted.",
    dep: ["network-partition","proxy-fault-filter","pool-exhaustion"]
  },

  "http-error-injection": {
    s: "Returns chosen HTTP error statuses for a fraction of matching requests, to test client error handling, retries and fallbacks.",
    d: "At a proxy or in application middleware, matching requests receive a status such as 500, 503 or 429 with or without the real call being made. The fault tests whether clients retry sensibly, honor retry-after hints, show useful messages, trip breakers and avoid retrying non-retryable errors. It is hard because the realism depends on what the real service returns: a mock error body that differs from the real one may be parsed differently.",
    k: ["Abort the request vs call the backend and then replace the reply: aborting is simple and spares the backend; calling first tests the case where the work was done but the client saw an error.", "Fixed status vs a realistic mix: fixed is easy to read; a mix matches real failures and tests more handling code."],
    p: ["Injected errors retried by several layers multiply load on the backend.", "A fake error body missing required fields crashes the client in a way real errors never would."],
    v: "Inject five percent 503 responses on one route and verify client retry counts, final user-visible error rate, and that retries respect their budget and back-off.",
    dep: ["proxy-fault-filter","traffic-filter","percentage-sampling"]
  },
  "rpc-status-injection": {
    s: "Injects failure statuses into remote procedure calls, such as unavailable, deadline exceeded or internal error, to test call-level handling in typed interfaces.",
    d: "An interceptor in the client, the server or a proxy replaces a call's result with an error status from the protocol's set, or adds delay so deadlines expire. It tests deadline propagation, retry policies per status, hedged requests and mapping of internal errors to user-facing ones. It is hard because these protocols carry deadlines across hops, so a fault at one hop shortens the time left for all later hops in ways that are difficult to predict.",
    k: ["Interceptor in the application vs fault in a proxy: an interceptor sees typed calls and can fail precisely; a proxy needs no code change but sees less structure.", "Return an error vs let the deadline expire: errors test status handling; expiring deadlines test propagation and wasted work downstream."],
    p: ["A status code the client treats as retryable by default makes it hammer a failing service.", "Deadline expiry still lets the server finish the work, wasting resources, and the test misses it."],
    v: "Inject unavailable status for ten percent of calls to one method and confirm the retry policy retries only that class, with total attempts within budget and deadlines honored end to end.",
    dep: ["application-hooks","mesh-fault-rules"]
  },
  "response-delay": {
    s: "Holds specific application responses for a set time before returning them, to test slow handlers, timeouts and queue growth at the request level.",
    d: "Unlike network delay, this fault is applied after the request is processed or before it is answered, often only for chosen routes or users. It exposes thread-per-request exhaustion, queue build-up in front of slow handlers, timeouts that are too long and the lack of load shedding. It is hard because delaying inside the handler may hold database connections or locks the real slowdown would also hold, so where the delay is applied changes which resources are tied up.",
    k: ["Delay before processing vs after processing: before holds only a thread; after holds locks and transactions as a real slow path would.", "Uniform delay vs a heavy tail: uniform finds a threshold; a heavy tail matches real contention and tests tail handling."],
    p: ["Delay inside a lock-holding section blocks unrelated requests and gives a result that is more severe than any realistic fault.", "Delay applied to the health endpoint removes the instance from rotation."],
    v: "Delay a single route by two seconds and confirm that other routes' latency stays within bound, thread pool use for the route rises as predicted and load shedding or timeouts engage.",
    dep: ["application-hooks","proxy-fault-filter"]
  },
  "payload-corruption": {
    s: "Alters response or message content, such as truncating, malforming or changing field values, to test validation and parsing in the receiver.",
    d: "A proxy or hook modifies bodies by removing fields, changing types, truncating, adding unexpected fields, swapping in an older schema version or producing empty collections. It tests schema validation, defensive parsing, handling of partial reads and whether bad data is rejected or propagated into storage. It is hard because the aim is realistic wrongness, not random bytes: well-formed but wrong data is what real bugs produce, and it passes weak validation.",
    k: ["Malformed bytes vs well-formed but wrong data: malformed bytes test the parser; wrong values test business validation, which is where real incidents occur.", "Corrupt in transit vs corrupt at source: in transit tests the receiver's checks; at source tests whether corruption spreads to other consumers."],
    p: ["Corrupted messages written into a queue or database persist after the experiment ends and must be cleaned.", "Receivers that log full payloads write corrupt or sensitive data to logs."],
    v: "Send a response with a missing required field to one consumer: it must reject the message, report a validation error and not write anything derived from it to storage, which is checked by reading the store.",
    dep: ["proxy-fault-filter","application-hooks"]
  },
  "exception-injection": {
    s: "Throws exceptions or returns error values from chosen points in application code to test internal error paths that are otherwise rarely run.",
    d: "Through hooks, instrumentation or flags compiled into the code, the fault makes selected functions fail: database calls, serialization, file access, calls to dependencies. It exercises cleanup code, transaction rollback, resource release, error translation and logging. These paths rarely run in production, so they hide bugs. It is hard because it needs cooperation from the application or runtime instrumentation, and because choosing injection points that matter needs knowledge of the code.",
    k: ["Systematic injection of each call site vs targeted points: systematic finds more bugs but takes many runs; targeted is cheap and covers known risks.", "Build-time hooks vs runtime instrumentation: build-time hooks are stable and fast; runtime instrumentation needs no code change but is invasive and risky."],
    p: ["An injected failure inside a cleanup path hides the original error and leaks resources.", "Fault hooks left enabled in a production build are an operational risk."],
    v: "Fail one database call in a request handler and confirm the transaction rolls back, no resource leaks appear in handle counts and the client receives the documented error response.",
    dep: ["application-hooks"]
  },
  "pool-exhaustion": {
    s: "Uses up a bounded pool, such as threads, connections or worker slots, to test queueing, timeouts, back-pressure and isolation between workloads.",
    d: "The fault holds pool entries without releasing them, or sends slow work that ties up entries, or lowers the pool size. Callers then queue, time out or fail. It tests whether separate pools isolate dependencies, whether queues are bounded, whether waiting has a timeout and whether the system sheds load before collapse. It is hard because a pool shared by many request types turns one slow dependency into total failure, which is exactly the effect to test and is hard to predict.",
    k: ["Hold entries vs slow the work: holding entries tests the limit directly; slowing work tests the natural way pools fill.", "Exhaust one pool vs several: one tests isolation between workloads; several tests whether recovery needs ordered steps."],
    p: ["Waiters with no timeout queue forever, so the service never recovers after the fault ends.", "Health checks sharing the exhausted pool fail and trigger restarts that worsen it."],
    v: "Hold ninety percent of one connection pool and verify requests to unrelated routes keep their latency, requests needing the pool time out within bound and the pool drains within seconds after release.",
    dep: ["application-hooks","dependency-blackhole"]
  },
  "cache-flush": {
    s: "Empties or disables a cache to test whether the backing store and the service survive a cold cache and a surge of misses.",
    d: "The fault deletes cache contents, makes entries expire together, restarts cache nodes or bypasses the cache. The system then sends the full request load to the origin, which may be slower or smaller than the cache by orders of magnitude. It tests request coalescing, rate limits on the origin, warm-up strategies and stampede protection. It is hard because the damage appears on the backend, not at the cache, and builds over minutes as the cache refills.",
    k: ["Flush everything vs flush a fraction: everything is the worst case; a fraction tests partial loss, such as one node, which is more common.", "Flush once vs repeatedly: once tests recovery; repeated flushes test whether the system can ever warm up under load."],
    p: ["The origin collapses under the miss storm and the experiment becomes a data store outage.", "Entries with the same expiry time recreate the flush every cycle."],
    v: "Flush one cache node under production-like load and watch the origin request rate, its latency and the cache hit ratio recover over time, keeping within the guard limits.",
    dep: ["application-hooks","blast-radius-limit"]
  },
  "retry-storm": {
    s: "Generates or provokes a surge of retried requests to test whether retry policies amplify a small failure into an overload.",
    d: "The fault makes a dependency fail briefly while clients retry, or directly adds retried traffic at a multiplier. Layers of retries multiply: three attempts at each of three layers send up to twenty-seven requests for one. The test checks retry budgets, exponential back-off with jitter, circuit breakers, and whether the failing service is given room to recover. It is hard because the dangerous behavior appears only with many clients and deep call chains, which small tests cannot reproduce.",
    k: ["Provoke by a short outage vs add synthetic retries: a short outage tests real clients and policies; synthetic retries reproduce amplification with no real failure.", "Retry budget per client vs per-request retry limit: a budget caps total extra load; per-request limits are simple but still multiply across layers."],
    p: ["Clients retrying in lockstep without jitter return as a wave and keep the service down.", "The test overloads a shared dependency, so other teams see a real incident."],
    v: "Fail a backend for ten seconds under load and measure peak request rate at the backend: it must stay below the stated multiple of normal, and recovery must complete within the hypothesis time.",
    dep: ["http-error-injection","response-delay","blast-radius-limit"]
  },
});
