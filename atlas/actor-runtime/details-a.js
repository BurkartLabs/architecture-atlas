// Details for the actor runtime plate, part 1: testing, operations, patterns.
ATLAS.details("actor-runtime", {
  "test-probes": {
    s: "A test-only actor that receives messages on behalf of the code under test and lets the test assert on what arrived, in what order, within a time limit.",
    d: "The test hands the probe's reference to the actor being tested as a reply target or collaborator. The probe stores incoming messages in a queue the test thread can block on, with expect, expect-no-message and expect-within helpers. Because the actor under test cannot tell the probe from a real peer, interaction is exercised through the same public protocol production uses. The difficulty is time: an assertion about absence needs a wait long enough to be meaningful and short enough to keep the suite fast.",
    k: ["Probe actor vs inspecting actor internals: probes test only the observable protocol and survive refactoring, but cannot see private state transitions.", "Real-time timeouts vs virtual time: real waits are simple but slow and flaky under load, while virtual time needs the actors to use the runtime clock."],
    p: ["Asserting that nothing arrives with a tiny timeout passes before the slow message would have shown up.", "Probes that share one queue across tests let a late message from test one fail test two."],
    v: "Send a request to the actor under test with a probe as reply target, assert the exact reply arrives within the limit, then assert no further messages arrive for a full timeout window.",
    dep: ["actor-references", "mailbox-queue"]
  },
  "synchronous-test-dispatcher": {
    s: "A dispatcher that runs each message on the calling thread to completion before send returns, making single-actor tests sequential and free of timing dependence.",
    d: "Normally send enqueues and returns, and a pool thread runs the actor later. The synchronous dispatcher replaces that with an immediate call into the receive function on the sender's thread, so by the time send returns the effects are visible. Tests of one actor become ordinary sequential code. It cannot model concurrency: two actors that message each other recurse on one stack, and anything depending on real interleaving, timers or remote delivery behaves differently than in production.",
    k: ["Synchronous execution vs the production dispatcher: tests become deterministic and fast, but real races, mailbox buildup and scheduling fairness are never exercised.", "Run-on-sender recursion vs a single test queue: recursion is simplest, but a ping-pong pair can overflow the stack."],
    p: ["A suite passing only under the synchronous dispatcher hides ordering assumptions that fail under the real pool.", "Actors that block waiting for a reply deadlock immediately, since the replier cannot run until the sender returns."],
    v: "Run the same actor test under both dispatchers. Under the synchronous one assert state immediately after send returns; under the pool dispatcher assert it through a probe, and confirm both pass.",
    dep: ["dispatcher", "mailbox-queue"]
  },
  "virtual-time-testing": {
    s: "A manually advanced clock and timer service so tests can fast-forward timeouts, retries and periodic ticks instantly and in a precise, repeatable order.",
    d: "The runtime reads time only through its clock abstraction and registers all delays with the timer service. In tests both are replaced by a manual implementation: time stands still until the test calls advance, which fires every timer due in that interval in deadline order. A thirty-second retry policy then runs in microseconds. The hard part is completeness: any code that reads the system clock directly, or sleeps on a real thread, bypasses the virtual clock and makes the test racy again.",
    k: ["Injected clock vs reading system time directly: injection gives deterministic tests, but every library and actor in the path must use it.", "Advance-and-fire in deadline order vs jump to the end: ordered firing reproduces production sequences, but costs bookkeeping in the test timer."],
    p: ["A single direct system-clock read inside a dependency makes a timeout test pass on fast machines and fail on loaded ones.", "Advancing time without letting the mailboxes drain tests an impossible interleaving."],
    v: "Schedule a message for one hour ahead, advance the virtual clock fifty-nine minutes and assert nothing arrived, advance one more minute and assert it arrived, all within milliseconds of real time.",
    dep: ["clock-abstraction", "timer-wheel"]
  },
  "message-interception": {
    s: "Test hooks that observe, drop, delay, duplicate or reorder messages between actors, so a test can create the exact delivery sequence it wants to prove safe.",
    d: "The test installs an interceptor at a delivery boundary, usually the mailbox enqueue or the transport. It can record traffic for assertions, swallow a message to simulate loss, hold messages and release them in a chosen order, or inject duplicates. Protocols that claim to tolerate reordering or retransmission are checked against those faults directly. The difficulty is placement: intercepting before serialization misses encoding bugs, intercepting after it loses typed access to the message, so suites often need both.",
    k: ["Interception at the mailbox vs at the transport: mailbox hooks see typed objects and are easy to write, while transport hooks exercise serialization and framing.", "Scripted fault sequences vs random faults: scripts reproduce a bug exactly, random faults find unanticipated ones."],
    p: ["Interceptors left installed in a shared test system change the behavior of later, unrelated tests.", "Dropping a message the protocol never expected to lose produces a failure that mirrors no real fault."],
    v: "Install an interceptor that drops the first acknowledgment and duplicates the second, run the retry protocol, and assert the receiver processed each business message exactly once.",
    dep: ["mailbox-queue", "message-envelope"]
  },
  "network-fault-simulation": {
    s: "A transport substitute that injects latency, loss, partitions and node crashes between in-process nodes, so cluster behavior under failure is tested without real machines.",
    d: "Several actor systems run in one process, linked by a simulated network instead of sockets. The test controls per-link delay, probabilistic or targeted loss, one-way and two-way partitions, and abrupt node termination. Membership, failure detection and split-brain handling then see realistic symptoms on demand. The model is only as good as its assumptions: it must keep half-open connections, long pauses and asymmetric links, because those, not clean disconnects, are what break real clusters.",
    k: ["Simulated network vs real sockets with fault tooling: simulation is fast and repeatable, while real sockets catch kernel and buffer behavior it omits.", "Controlled clock with the simulation vs wall time: controlled time makes partitions deterministic but needs every timeout driven by the same clock."],
    p: ["Testing only clean, symmetric partitions misses the asymmetric and flapping links that cause most incidents.", "Simulated links with unlimited buffers hide the memory growth a real slow peer causes."],
    v: "Partition a five-node simulated cluster into two and three nodes, advance virtual time past the detection and downing limits, and assert exactly one side keeps running its singleton.",
    dep: ["node-transport", "failure-detector", "virtual-time-testing"]
  },
  "in-memory-journal-for-tests": {
    s: "A journal and snapshot store held in memory, with hooks to inject write failures and slow storage, so persistent actors are tested without a database.",
    d: "It implements the same journal contract as production storage but keeps events in ordered lists per entity. Tests can pre-load history to check recovery, read back what an actor wrote, and make the next write fail or stall to test error handling. Reads and writes complete immediately unless told otherwise. It proves the actor's logic is right but not that a real database honors the contract, so a smaller set of tests against the production store still has to exist.",
    k: ["In-memory store vs a containerized real store: memory is instant and deterministic, while the real store checks serialization, ordering and transaction behavior.", "Fault hooks on the fake vs trusting the contract: hooks verify failure paths exist, but they only model faults someone thought of."],
    p: ["A fake that is more forgiving than the real store, for example accepting duplicate sequence numbers, hides a production-only conflict.", "Sharing one fake across parallel tests mixes events between entities."],
    v: "Pre-load three events for an entity, start the actor and assert its state equals their fold; then make the next write fail and assert the actor stops without applying the unwritten event.",
    dep: ["event-journal", "snapshot-store"]
  },
  "multi-node-test-harness": {
    s: "Tooling that starts several runtime nodes, forms a real cluster between them, runs scripted steps on each node in lockstep and asserts on the combined result.",
    d: "A coordinator launches N systems, as processes or in-process systems with real transports, and exposes named barriers so that step three on every node begins only when all finish step two. Test code is written per role, such as first node and second node, in one file. The harness can kill or isolate a node mid-test. It is slow and resource-hungry, and failures are hard to read because logs interleave from several nodes, so good harnesses collect them per node with a shared timeline.",
    k: ["Real processes vs in-process systems: processes catch real transport and class-loading issues, while in-process starts faster and is easier to debug.", "Barrier-synchronized steps vs free-running nodes: barriers give repeatable assertions but can hide races that only appear without them."],
    p: ["Fixed ports and shared directories make parallel runs of the suite collide.", "A failed barrier leaves surviving nodes waiting until a global timeout, hiding which node failed first."],
    v: "Start three nodes, assert all see each other as up behind a barrier, terminate one node, and assert the remaining two report it as unreachable and then removed within the configured detection limit.",
    dep: ["gossip-membership", "node-transport", "node-discovery-and-seeding"]
  },
  "deterministic-schedule-explorer": {
    s: "A test mode that takes control of message delivery order and systematically explores interleavings, replaying any failing schedule from a recorded seed.",
    d: "All nondeterminism, meaning which mailbox runs next and when each timer fires, is routed through a single scheduler under test control. It then picks the next step by seed, by exhaustive enumeration of small cases, or by heuristics that favor unusual orders. A failing run prints the seed or choice list, so the exact interleaving replays. Its limit is the state space: it only works if the actors under test do no uncontrolled I/O or threading of their own.",
    k: ["Controlled single-threaded scheduling vs stress on the real pool: control makes bugs replayable, while stress finds memory-visibility bugs control cannot see.", "Random seeds vs exhaustive search: seeds scale to big systems, exhaustive search proves small protocols but explodes quickly."],
    p: ["An actor that reads the real clock or spawns its own thread escapes the explorer and the failure stops replaying.", "Reporting a seed without the code version makes the replay useless after the next commit."],
    v: "Run a protocol with a known ordering bug under one thousand seeds, take the first failing seed, and confirm replaying it fails identically every time while the fixed code passes all seeds.",
    dep: ["dispatcher", "virtual-time-testing", "per-sender-ordering"]
  },
  "actor-tree-inspector": {
    s: "A live view of the actor hierarchy with each actor's path, state, mailbox depth and children, used to see what a running system is actually doing.",
    d: "Because the hierarchy is the supervision tree, it can be walked from the guardians down using the runtime's own bookkeeping. The inspector lists actors, their behavior name, restart count and queued messages, and may let an operator send a diagnostic message to one. Inspecting a busy tree is itself load, and the picture is stale when drawn: actors start and stop while it is traversed. It must therefore sample rather than lock, and bound its output for systems with millions of entities.",
    k: ["Walking the tree with messages vs reading runtime internals: messages respect isolation but are slow for large trees, while internal reads are fast and may be inconsistent.", "Full dump vs sampled or filtered view: dumps are complete but dangerous at scale, sampled views stay safe and may miss the one actor that matters."],
    p: ["Inspecting every actor in a large system pauses the dispatcher and causes the outage being investigated.", "Treating the snapshot as consistent leads to blaming an actor that already stopped."],
    v: "Spawn a parent with three children, open the inspector and confirm it shows all four with correct paths, then kill one child and confirm the next refresh shows its replacement with a restart count of one.",
    dep: ["supervision-tree", "actor-paths-and-names", "mailbox-queue"]
  },
  "mailbox-and-throughput-metrics": {
    s: "Counters and gauges for queue depth, enqueue-to-processing latency, processing time and message rates per actor class, the main early warning for overload.",
    d: "The mailbox timestamps messages on enqueue and the dispatcher measures processing time on dequeue, feeding histograms keyed by actor class rather than by instance. Queue length growing while throughput stays flat means the actor is slower than its input, which is the signature of overload. Per-instance metrics for millions of actors would be too costly, so they are aggregated, with a sampled tail of the worst offenders. The measurement itself touches the hottest path, so it must be nearly free.",
    k: ["Per-class aggregation vs per-instance metrics: aggregation keeps cardinality and cost low but hides one pathological entity inside an average.", "Always-on timestamping vs sampled: always-on catches every spike, while sampling cuts overhead on the hot path at the cost of precision."],
    p: ["Alerting on average latency misses a single stuck actor whose queue grows without bound.", "High-cardinality labels such as entity id overwhelm the metrics backend."],
    v: "Send a burst of ten thousand messages to an actor that processes one per millisecond and confirm the queue-depth gauge peaks near ten thousand, falls to zero, and the latency histogram records the tail.",
    dep: ["mailbox-queue", "message-envelope", "dispatcher"]
  },
  "distributed-message-tracing": {
    s: "Propagates a trace identifier with each message so one request can be followed across actors and nodes, showing where time was spent and where it stopped.",
    d: "A trace context rides in the message envelope or a wrapper. When an actor handles a message and sends others, the runtime copies the context into the outgoing envelopes and records a span for the processing step. Spans from all nodes go to a collector that reassembles the tree. It must survive serialization, remoting and timers, and the asynchronous gaps are where context is usually lost. Unlike a call stack, one message often fans out, so the trace is a graph, not a line.",
    k: ["Context in the envelope, handled by the runtime, vs explicit fields in each message: envelope propagation is automatic and uniform, but requires runtime support for every send path.", "Sampling at the entry point vs recording everything: head sampling controls cost, while full tracing finds rare failures."],
    p: ["Context dropped when a message passes through a timer, stash or persistence step leaves trace fragments with no parent.", "Tracing every message of a high-rate system generates more telemetry than application data."],
    v: "Send one request that passes through three actors on two nodes and confirm the collector shows one trace with spans for each hop, correctly parented, and the remote hop's latency separated from processing time.",
    dep: ["message-envelope", "serializer-registry", "actor-scoped-logging"]
  },
  "dead-letter-monitoring": {
    s: "Collects, counts and exposes messages that could not be delivered, so lost messages, wrong addresses and shutdown races are visible instead of silent.",
    d: "Undeliverable messages are redirected to a dead-letter actor that stores or logs them with sender, intended recipient and reason: recipient stopped, mailbox full, unknown path, or dropped by policy. The monitor aggregates by recipient and reason, suppresses repeated log lines and raises alerts on rates. Some dead letters are normal, such as a reply arriving after the asker gave up. The skill is separating that background noise from a rising rate that means a crashed service or a routing mistake.",
    k: ["Log every dead letter vs count and sample: logging every one helps debugging but floods logs during incidents, while counters scale and lose the detail.", "Alert on absolute count vs on rate change: absolute thresholds miss slow leaks, rate-change alerts catch them but flap on normal bursts."],
    p: ["Treating all dead letters as errors trains operators to ignore the channel.", "Dead letters carrying large payloads or personal data retained in memory create leaks and privacy problems."],
    v: "Stop an actor, send it ten messages, and confirm the dead-letter counter rises by ten with reason recipient-terminated and the first sample records sender and path.",
    dep: ["dead-letters", "actor-scoped-logging"]
  },
  "actor-scoped-logging": {
    s: "Logging that automatically tags each line with the actor path, node and current message context, so output from thousands of concurrent actors can be filtered and correlated.",
    d: "Each actor gets a logger bound to its path and, optionally, per-message fields such as correlation id or entity key. Writes are handed to a logging actor or asynchronous appender instead of blocking the message-processing thread on I/O. Because actors interleave, plain text logs lose the thread of a single conversation; structured fields restore it. Cost and ordering matter: logging must not become a bottleneck or reorder lines in ways that mislead.",
    k: ["Asynchronous logging vs synchronous writes: asynchronous keeps dispatcher threads free but can lose the final lines in a crash.", "Per-message context fields vs per-actor only: message context enables tracing one request, but needs the runtime to set and clear it around every message."],
    p: ["Context left set after a message finishes tags the next, unrelated message with the wrong correlation id.", "Debug logging in a hot actor blocks threads when the appender queue fills."],
    v: "Send one message tagged with correlation id X through two actors and filter the aggregated log by X: confirm exactly the lines from both actors appear, each with its actor path.",
    dep: ["actor-context", "message-envelope"]
  },
  "cluster-management-api": {
    s: "A remote interface, usually HTTP, to inspect membership, join or leave nodes, trigger rebalancing and check health, so operators and orchestrators can manage the cluster safely.",
    d: "It exposes read endpoints for member states, shard distribution, singleton location and readiness, and write endpoints for graceful leave and manual downing. Orchestrators use the readiness and liveness endpoints to decide when to route traffic or restart a process, so the endpoints must reflect cluster state accurately. Write endpoints are dangerous: manually marking a live node down can split a cluster, so they need authentication and sometimes a confirmation step.",
    k: ["Readiness tied to cluster membership vs process liveness only: tying it to membership avoids sending traffic to a node not yet joined, but couples restarts to cluster health.", "Manual downing exposed vs removed: exposure lets an operator recover from a stuck partition, while removal prevents a mistaken command from causing one."],
    p: ["A liveness check that fails while the node waits to join makes the orchestrator kill it in a restart loop.", "Management endpoints exposed without authentication let anyone down the cluster."],
    v: "Call the members endpoint on every node during a rolling restart and confirm each shows the same member set, and that the leaving node reports not-ready before its process stops.",
    dep: ["gossip-membership", "node-lifecycle-states", "transport-security"]
  },
  "rolling-upgrade-support": {
    s: "Mechanisms that let nodes running different versions share a cluster during a deployment, including compatible messages, ordered shutdown and handoff of work.",
    d: "During a rolling upgrade old and new nodes exchange messages, gossip and stored events at once, so every wire format must be understood by both. The runtime helps with version-tagged membership, a leave protocol that hands off shards and singletons before a node exits, and rules such as upgrading in a set order. Application authors still carry most of the burden, because message and event shapes they change must stay compatible across at least one version.",
    k: ["Mixed versions during rollout vs a full stop and restart: mixed versions avoid downtime but require backward and forward compatible messages.", "Graceful leave with handoff vs killing the process: handoff keeps entities available, while killing is faster and forces the failure detector to clean up."],
    p: ["A new message type sent to a node that does not know it is dropped or breaks deserialization until the rollout finishes.", "Upgrading too many nodes at once drops the cluster below the quorum its split-brain policy needs."],
    v: "Upgrade one node of a three-node cluster while sending steady traffic and confirm zero lost requests, the node rejoining with the new version tag, and shards returning to it.",
    dep: ["schema-evolution", "rebalancing-and-handoff", "node-lifecycle-states"]
  },
  "runtime-configuration": {
    s: "The layered settings for the runtime: dispatcher sizes, mailbox types, timeouts, serialization bindings and cluster parameters, with defaults, overrides and validation.",
    d: "Settings load from defaults shipped with the runtime, an application file, environment overrides and sometimes per-actor deployment entries that choose a dispatcher or mailbox for a path pattern. The configuration is read at startup into immutable structures, and most values cannot change live. It is hard because settings interact: thread counts, mailbox bounds, detector thresholds and timeouts must stay mutually consistent, and a bad combination often shows up only under failure.",
    k: ["Immutable configuration read at start vs live reload: immutability makes behavior predictable, but changing a timeout needs a rolling restart.", "Path-pattern deployment overrides vs code-level choices: patterns let operators tune without code changes, but hide which dispatcher an actor really uses."],
    p: ["A failure-detector threshold shorter than a typical garbage-collection pause makes healthy nodes flap in and out of the cluster.", "Different settings on different nodes cause behavior that only reproduces on one machine."],
    v: "Start the node with a debug flag that prints the effective configuration, and confirm each value matches its intended source, then change one override and confirm the printed value and the behavior change.",
    dep: ["dispatcher", "failure-detector"]
  },
  "ask-pattern": {
    s: "A request-reply helper that creates a temporary actor to receive one reply and returns a future of it that fails if no answer arrives before a timeout.",
    d: "A sender cannot normally wait for an answer inside an actor. Ask creates a short-lived reply endpoint, includes its reference in the request, and exposes the result as a future completed by the first reply or failed on timeout. The caller attaches continuations or pipes the result back to itself as a message. Every ask needs a timeout, and its allocation and cancellation costs add up in hot paths. It is also the main place where actor code starts to block threads, if used carelessly.",
    k: ["Ask with a future vs explicit message protocol with a reply address: ask is convenient at the edge of the system, while explicit replies keep actors free of future handling.", "Short timeouts vs long: short timeouts fail fast and shed load, but turn a slow system into a failing one."],
    p: ["Blocking a dispatcher thread on the future inside an actor starves other actors and can deadlock when the replier needs that thread.", "A timeout does not cancel the request, so the work still happens and the reply goes to dead letters."],
    v: "Ask a responsive actor and confirm the future completes with its reply; ask a stopped actor and confirm it fails with a timeout at the limit and the late reply never reaches the caller.",
    dep: ["actor-references", "scheduled-messages", "actor-context"]
  },
  "request-reply-correlation": {
    s: "Matching a reply to the request that caused it, using identifiers carried in the messages, so one actor can have many outstanding requests at once.",
    d: "An actor that issues several requests concurrently tags each with a unique identifier or a typed adapter, keeps a table of pending requests, and on each reply looks up the originating context. Correlation also supports timeouts per request, deduplication of repeated replies and cleaning up after a peer dies. The table grows with outstanding work, so it must be bounded and expire stale entries. Without correlation, replies from retried or overlapping requests are indistinguishable and state gets corrupted.",
    k: ["Correlation ids in messages vs a temporary actor per request: ids are cheap and let one actor hold many requests, while per-request actors isolate state with more allocation.", "Per-request timers vs a periodic sweep: timers are exact but numerous, a sweep is cheaper but approximate."],
    p: ["A pending-request table that never expires entries leaks memory when peers vanish.", "Reusing a small cyclic id counter lets a very late reply match a newer request."],
    v: "Send five concurrent requests whose replies return in reverse order and confirm each is delivered to the correct originating context; drop one reply and confirm only that request times out.",
    dep: ["message-envelope", "scheduled-messages", "ask-pattern"]
  },
  "routers-and-pools": {
    s: "An actor that forwards messages to a set of workers by a routing rule such as round robin, random, consistent hash or smallest mailbox.",
    d: "A router holds references to workers it created or discovered and chooses one per message. Round robin and random spread load evenly for similar tasks, smallest-mailbox adapts to uneven ones, and consistent hashing sends all messages with the same key to the same worker so per-key order and local state hold. The router itself is a single mailbox and can become the bottleneck, so high-rate systems use group routers on the sender side. It must also notice dead workers and resize.",
    k: ["Router actor vs routing logic inside the sender: a router actor centralizes policy and membership, while in-sender routing removes a hop and a bottleneck.", "Consistent hashing vs round robin: hashing preserves per-key order and locality but skews load when keys are uneven."],
    p: ["Round robin across workers with unequal speed fills the slow worker's mailbox while others idle.", "A routee list not updated after a worker crashes sends messages to a stopped actor and into dead letters."],
    v: "Send one thousand messages through a four-worker round-robin router and confirm each worker received two hundred and fifty; then stop one worker and confirm the router stops sending to it.",
    dep: ["actor-references", "child-spawning", "death-watch"]
  },
  "scatter-gather": {
    s: "Sending one request to many actors in parallel and collecting replies into a single result, with a deadline and a policy for missing answers.",
    d: "An aggregator actor fans a request out, starts a timer, and accumulates replies in its own state until all have arrived or the deadline passes. It then replies with the complete or partial result. Because the aggregator owns the state, no locks are needed. The design questions are the partial-result policy, whether to cancel stragglers, and how to bound concurrency so a fan-out of thousands does not flood downstream mailboxes. Latency is set by the slowest participant.",
    k: ["Wait for all vs first-N or deadline: waiting for all is simplest and gives complete answers, while first-N or deadline bounds tail latency at the price of partial data.", "One aggregator per request vs a long-lived aggregator: per-request isolates state and cleanup, while long-lived saves allocation but needs correlation."],
    p: ["One slow participant sets the latency of every request, and its result arrives after the deadline into dead letters.", "Fan-out to hundreds of actors multiplies load during an incident, making recovery harder."],
    v: "Fan a request to ten actors where one never replies and confirm the aggregator answers at the deadline with nine results and an explicit marker listing the missing participant.",
    dep: ["request-reply-correlation", "scheduled-messages", "routers-and-pools"]
  },
  "state-machine-actors": {
    s: "Modelling an actor as explicit states with allowed messages and transitions, so protocol logic is readable and invalid input in a state is handled deliberately.",
    d: "Each state is a behavior that handles only the messages valid there; others are ignored, stashed or answered with an error. Transitions change the behavior and may set a state timeout that fires if nothing happens. The structure mirrors protocol diagrams, which makes review straightforward, and persistent actors can store the state in events. Complexity arrives with many states, shared data between them, and messages that are valid in several states in different ways.",
    k: ["Behavior per state vs one handler with a state field: behavior per state makes illegal messages unrepresentable, while a field with a switch is easier to start with and grows tangled.", "Ignoring unexpected messages vs failing: ignoring is tolerant of retries and reordering, while failing exposes protocol bugs early."],
    p: ["Transitions that forget to cancel the old state's timer deliver a stale timeout in the new state.", "An unhandled message silently dropped in a rare state looks like a lost request."],
    v: "Drive the actor through every legal transition in a table-driven test, then send each message in every state where it is illegal and confirm the documented outcome of ignore, stash or error.",
    dep: ["behavior-switching", "receive-timeout", "stash-and-unstash"]
  },
  "stash-and-unstash": {
    s: "Setting aside messages an actor cannot handle yet and replaying them, in their original order, when it changes to a state that can.",
    d: "While an actor is initializing, loading state or awaiting a reply, early messages are copied into a stash instead of being processed or dropped. On a transition they are prepended back to the mailbox so they run before newer messages. This preserves the arrival order and removes the need for ad hoc buffering. The stash is memory the mailbox bounds do not govern, so it needs its own capacity limit, and an unstash of a large backlog can monopolize the actor.",
    k: ["Stashing vs dropping with retry by the sender: stashing hides initialization from callers, while dropping keeps memory flat and moves complexity to senders.", "Unstash all at once vs a few at a time: all at once is simple, but a large batch delays new messages and can starve the actor's timers."],
    p: ["An unbounded stash during a long initialization consumes memory until the actor dies.", "A message stashed again after unstashing, because the new state also cannot handle it, loops forever."],
    v: "Send five messages to an initializing actor, complete initialization, and assert all five are processed in sent order before a sixth message sent afterward; overfill the stash and confirm the documented overflow error.",
    dep: ["mailbox-queue", "behavior-switching", "bounded-and-priority-mailboxes"]
  },
  "publish-subscribe-event-bus": {
    s: "A topic-based channel where publishers send to a name and every current subscriber receives a copy, decoupling who produces events from who consumes them.",
    d: "Subscribers register an actor reference for a topic or an event type; publish looks up subscribers and sends each a message. Locally it is a registry of references. Across a cluster a distributed variant gossips subscription lists or routes through a topic actor per node, delivering at most once. Subscribers that die must be removed automatically, using death watch. Delivery is best-effort and unordered across publishers, so it suits notifications, not guaranteed workflow steps.",
    k: ["Local bus vs cluster-wide topics: local is fast and simple, while cluster-wide adds subscription propagation delay and cost per node.", "Publisher fan-out vs per-node relays: direct fan-out is simple, relays cut network messages to one per node but add a hop."],
    p: ["A subscriber that is slow or full drops or delays messages, and the publisher never learns.", "Subscriptions racing with publishes mean a new subscriber misses events published just before it registered."],
    v: "Subscribe three actors on two nodes to one topic, publish ten events from a third node, and confirm each subscriber received all ten once; stop one and confirm it no longer receives.",
    dep: ["actor-references", "death-watch", "gossip-membership"]
  },
  "work-pulling": {
    s: "A pattern where workers request tasks when they are ready instead of having tasks pushed to them, giving natural load balancing and bounded queues.",
    d: "A producer or controller holds the pending work. Each worker sends a demand message saying how many tasks it can take, and the controller sends no more than has been demanded. Fast workers ask more often and receive more, slow workers are never flooded, and the controller's buffer is the only place work accumulates, so backpressure reaches the source. Workers that die take their in-flight tasks with them, so the controller must track assignments and redeliver on failure.",
    k: ["Pull with demand vs push with a router: pull balances uneven work and bounds worker mailboxes, while push has lower latency per task.", "Small vs large demand batches: small batches balance well but cost round trips, large batches amortize cost and can overload a slow worker."],
    p: ["Tasks assigned to a worker that crashes are lost unless the controller tracks and redelivers them.", "A controller with an unbounded buffer just moves the overload from the workers to its own memory."],
    v: "Run two workers, one ten times slower, over one thousand tasks and confirm the fast worker finished about ten times as many; kill the slow worker mid-run and confirm all tasks still complete.",
    dep: ["backpressure-and-flow-control", "death-watch", "actor-references"]
  },
  "circuit-breaker": {
    s: "A guard that stops calls to a failing dependency after repeated errors or timeouts, fails fast during an open period, then probes before resuming.",
    d: "The breaker counts consecutive or recent failures. Past a threshold it opens and rejects calls immediately for a cool-down, protecting the caller's threads and the struggling dependency. After the cool-down it goes half-open, letting a few trial calls through; success closes it, failure re-opens it. Inside an actor, state lives in the actor, while a shared breaker uses atomic counters. Tuning is difficult: thresholds too sensitive trip on noise, too lax let queues build up.",
    k: ["Failure count vs failure rate over a window: counts are simple, rates handle varying traffic better but need a sliding window.", "Per-dependency breaker vs per-call-site: per-dependency reflects shared health, per-call-site avoids one operation tripping unrelated ones."],
    p: ["A breaker that opens on slow responses but not on errors lets slow calls pile up and exhaust threads.", "All instances re-probing at the same moment after the cool-down send a synchronized burst."],
    v: "Make a dependency fail for thirty seconds and confirm calls reject immediately after the threshold with an open-circuit error, then half-open probes occur, and normal calls resume within one cool-down of recovery.",
    dep: ["scheduled-messages", "ask-pattern", "restart-backoff"]
  },
});
