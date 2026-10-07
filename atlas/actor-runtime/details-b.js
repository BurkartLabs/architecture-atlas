// Details for the actor runtime plate, part 2: actors, supervision, messaging, timers.
ATLAS.details("actor-runtime", {
  "actor-definition": {
    s: "The unit of the model: private state, a message-handling behavior and a mailbox, processing one message at a time and never sharing state directly.",
    d: "An actor is defined by its initial behavior, a function from a received message to effects: send messages, spawn children, change behavior or stop. The runtime guarantees that at most one message is processed at a time, so state needs no locks. The cost is that all interaction goes through messages and that a long-running handler blocks that actor and its thread. Defining actors too small multiplies messages; too large turns an actor into a sequential bottleneck.",
    k: ["Many fine-grained actors vs few coarse ones: fine-grained gives parallelism and isolation of failure, while coarse ones cut message overhead and coordination.", "Mutable private state vs immutable behavior parameters: mutable fields are direct and fast, while immutable state per behavior makes transitions explicit and testable."],
    p: ["Closing over mutable state from outside the actor, such as in a callback, breaks the one-message-at-a-time guarantee.", "A handler that does blocking I/O stalls every message queued behind it."],
    v: "Send ten thousand increments concurrently from many senders to one counter actor and confirm the final value is exactly ten thousand with no locks in the actor code.",
    dep: ["mailbox-queue", "dispatcher", "actor-context"]
  },
  "actor-references": {
    s: "An opaque, serializable handle to an actor that supports sending only, so callers never touch the actor object and the runtime can move or replace it.",
    d: "A reference encodes the target address and the machinery to deliver to it: a local mailbox pointer, a remote association, or a shard routing proxy. It is the only capability a sender holds. References can be passed inside messages, so a reply address is simply a reference in the request. Because a reference may outlive its actor, sends to it must degrade to dead letters rather than fail, and equality should be by path and unique id so a restarted incarnation is distinguishable.",
    k: ["Opaque handle with send only vs exposing the actor object: opacity enables remoting and restart, but forbids direct method calls and synchronous reads.", "Reference tied to an incarnation id vs to a path only: incarnation ids stop messages reaching a new actor intended for the old, while path-only is easier to rebuild after a restart."],
    p: ["Holding a reference to a stopped child and sending to it silently produces dead letters.", "Sending a reference over the network without a serializer that preserves the address makes the receiver reply to a bogus location."],
    v: "Pass a reference inside a message to another actor on a second node and have it reply directly; confirm the reply reaches the original actor and that after a restart the old reference still resolves.",
    dep: ["actor-paths-and-names", "mailbox-queue", "location-transparent-references"]
  },
  "actor-paths-and-names": {
    s: "A hierarchical address for each actor made of its parents' names plus its own, unique among siblings and stable across restarts.",
    d: "Paths mirror the supervision tree, for example system, user, orders and an entity id, and carry node address and incarnation when remote. Parents choose child names or the runtime generates them. Stable names let other components find an actor again after a restart and let configuration target actors by path pattern. Names must be unique among siblings, so creating a name that is still being terminated conflicts. Path text is also a place where untrusted input, such as a user id, can cause trouble.",
    k: ["Parent-chosen stable names vs generated names: stable names allow lookup and idempotent creation, generated names avoid collisions.", "Path as identity vs a separate unique id: paths are readable and match the tree, while unique ids distinguish incarnations."],
    p: ["Spawning a child with a name that is still terminating fails with a duplicate-name error that appears only under load.", "Building names from unescaped external input lets a crafted value alter the hierarchy."],
    v: "Spawn a child named order-17, restart it by throwing an error, and confirm its path is unchanged; try to spawn a second child with the same name and confirm the documented duplicate-name failure.",
    dep: ["supervision-tree"]
  },
  "actor-lifecycle": {
    s: "The defined sequence of states and hooks from creation through running, restart and stop, giving actors fixed points to acquire and release resources.",
    d: "Spawning creates the actor and runs its start hook before any message is processed. On a failure the supervisor may restart it: the old instance gets a pre-restart hook, a new instance is built, and a post-restart hook runs. On stop the actor drains per policy, runs a stop hook and notifies watchers. Resources such as connections must be opened and closed in matching hooks, and the order of hooks relative to message processing and child termination is the detail that causes most lifecycle bugs.",
    k: ["Restart creates a fresh instance vs repairing the old one: fresh instances guarantee clean state, but anything not rebuilt in start hooks is lost.", "Hooks that run on the actor's own thread vs externally: own-thread hooks need no locks, but a hook that blocks delays recovery."],
    p: ["Closing a resource in the stop hook but not in the pre-restart hook leaks one handle per restart.", "A hook that throws while handling a failure can turn one fault into a restart loop."],
    v: "Make an actor open a counted resource on start and release it on stop; crash it ten times and stop it, and confirm the resource count is zero afterward.",
    dep: ["actor-definition", "supervisor-directives", "actor-context"]
  },
  "behavior-switching": {
    s: "Replacing the function that handles the next message, so an actor changes how it responds as its situation changes, without flags or conditionals.",
    d: "A handler returns or installs the behavior to use for the next message. States like waiting, active and closing become separate functions, each ignorant of the others, and each parameterized by only the data it needs. The switch takes effect for the next message, never the current one, so effects within one message are consistent. Typed systems encode this in return values, while untyped ones keep a stack of behaviors with push and pop. The cost is that state spread across behaviors can be harder to see than a single record.",
    k: ["Behavior returned as a value vs a mutable become call: values make transitions visible in types, while become is more concise.", "A stack of behaviors vs replace only: a stack makes temporary modes easy to enter and leave, but unbalanced pops cause confusing states."],
    p: ["Forgetting to carry data into the next behavior silently resets it to a default.", "Switching behavior while replies for the old behavior are still in flight makes them arrive in a state that cannot handle them."],
    v: "Drive an actor through open, active and closed, sending the same message in each state, and confirm it produces three different, documented outcomes without any state flag in the code.",
    dep: ["actor-definition", "actor-context"]
  },
  "actor-context": {
    s: "The per-actor handle to the runtime during message handling: the sender, self, the parent, children, the clock and the means to spawn, watch and stop.",
    d: "While a message is processed, the context exposes self, the current sender if present, spawning, stopping and watching, timers and the system's extensions. It is valid only inside the actor's own processing, so it must not be captured by callbacks or futures that run on other threads, where it would race with the actor. Typed designs pass it explicitly into the behavior to make this clear. It also holds the logger and the dispatcher choice for children.",
    k: ["Explicit context argument vs ambient implicit state: explicit passing makes misuse visible, while ambient access is shorter and easy to leak across threads.", "Sender available on every message vs only when requested: always-available sender simplifies replies but makes every message carry a reference."],
    p: ["Reading the sender inside a future callback returns the wrong actor, because the context has moved on to another message.", "Spawning children from a captured context after the actor stops creates orphans."],
    v: "Handle two messages from different senders in quick succession, with a callback that reads the sender later, and confirm the callback is forced to use a value captured at handling time.",
    dep: ["actor-definition", "child-spawning", "message-envelope"]
  },
  "child-spawning": {
    s: "Creating a new actor as a child of the current one, which becomes its supervisor, owns its lifecycle and receives its failures.",
    d: "Spawning registers the child under the parent's path with a name, props or behavior, a dispatcher and mailbox choice, and returns a reference immediately; the child starts asynchronously. The parent supervises it, and stopping the parent stops all descendants first. Spawning per request is cheap but must be paired with a stop when the work is done. Unbounded spawning in response to external input is a classic memory problem, since each actor holds a mailbox and state.",
    k: ["Spawn per task vs a fixed pool of workers: per-task gives isolation and simple code, while a pool bounds memory and concurrency.", "Parent as the only creator vs spawning from anywhere: parent-only keeps the tree meaningful, while global factories flatten it and weaken supervision."],
    p: ["A child created for every incoming request but never stopped accumulates until memory runs out.", "Assuming the child exists when spawn returns, and sending a message that depends on its initialization, races with its start hook."],
    v: "Spawn one thousand children from a parent, confirm each appears in the tree under it, then stop the parent and confirm every child's stop hook ran before the parent's termination was reported.",
    dep: ["supervision-tree", "actor-paths-and-names", "dispatcher"]
  },
  "typed-protocols": {
    s: "Declaring the set of messages an actor accepts as a type, so the compiler rejects sends of messages the receiver cannot handle.",
    d: "Each actor reference is parameterized by its message type, usually a closed set of variants. Handlers are checked for exhaustiveness, and the compiler flags sends of unrelated types. Replies are typed by including a reference of the reply type in the request. Complications are adapting between protocols, since a sender and receiver rarely share one type, which needs message adapters, and the runtime's own messages such as termination notices, which must be mapped into the actor's type.",
    k: ["Typed references vs untyped any-message actors: types catch protocol mistakes at build time, while untyped actors are more flexible and let anything be sent.", "Closed variants vs open message sets: closed sets give exhaustiveness checks, but add friction when extending a protocol across modules."],
    p: ["Adapters that wrap external events can lose information if they map several source types to one case.", "Types do not check ordering or state, so a well-typed message can still be illegal at runtime."],
    v: "Attempt to compile a send of a message type outside an actor's protocol and confirm the compiler rejects it; remove a case from a handler and confirm exhaustiveness checking reports it.",
    dep: ["actor-references", "message-envelope", "wire-formats"]
  },
  "actor-registry": {
    s: "A directory where actors register under a typed key and others look them up, locally or across the cluster, without knowing paths in advance.",
    d: "A service actor registers by key, such as a service name or protocol type, and clients subscribe or ask for the current set of references. The registry watches registrants and removes them on termination. In a cluster, entries are propagated by gossip or replicated data, so lookups are eventually consistent: a client may see a registrant that just died or miss one that just started. Clients must therefore tolerate failed sends and retry against a refreshed list.",
    k: ["Subscribing to a listing vs one-time lookup: subscription tracks changes and avoids stale caches, while lookup is simpler for startup wiring.", "Cluster-wide registry vs per-node: cluster-wide enables discovery across nodes with propagation delay, while per-node is instant and local."],
    p: ["Treating a lookup result as permanently valid sends to actors that have since left the cluster.", "Registering under a too-common key lets an unrelated actor receive messages meant for another service."],
    v: "Register a service actor on node A, look it up from node B and confirm delivery, then stop it and confirm node B's listing drops the entry within the propagation bound.",
    dep: ["actor-references", "death-watch", "replicated-data-types"]
  },
  "supervision-tree": {
    s: "The hierarchy in which each actor is created and supervised by its parent, so every failure has a defined owner that decides what happens next.",
    d: "When an actor throws while processing, the runtime suspends it and reports the failure as a message to its parent, which chooses a response. Responsibility is assigned by structure: workers that can fail sit below supervisors that carry only coordination logic, with risky or short-lived work pushed to the leaves. Good trees isolate failure domains, so a bad entity restarts alone without disturbing siblings. Designing them well means deciding what state a restart may discard and which children must live or die together.",
    k: ["Deep trees with narrow failure domains vs flat trees: deep trees contain faults precisely but add structure to maintain, while flat trees are simple and restart too much at once.", "Supervisors holding no business state vs combined roles: pure supervisors rarely fail themselves, so recovery stays reliable."],
    p: ["Placing critical shared state in a supervisor that also does work means its own crash loses what it was meant to protect.", "A flat tree under one parent restarts unrelated children together after one failure."],
    v: "Crash one leaf actor with an injected error and confirm only that subtree restarts, sibling subtrees keep processing without gaps, and the failure appears in the parent's decision log.",
    dep: ["actor-paths-and-names", "child-spawning", "supervisor-directives"]
  },
  "supervisor-directives": {
    s: "The choices a supervisor can make when a child fails: resume, restart, stop or escalate, selected per exception type.",
    d: "A decider function maps each failure to a directive. Resume keeps the child and its state and continues with the next message, restart discards its state and builds a new instance, stop ends it permanently, and escalate passes the decision to the supervisor's own parent. The mapping encodes knowledge about which errors are transient, which mean corrupted state and which are fatal. Defaults are cautious, usually restart on most errors, and the dangerous choice is resume, which keeps possibly corrupt state.",
    k: ["Resume vs restart on an error: resume preserves in-memory state and is fast but can continue with corrupted data, while restart is safe and loses uncommitted state.", "Per-exception mapping vs one blanket policy: per-type mapping is precise, but needs maintenance as error types change."],
    p: ["Resuming after an error that left state half-updated lets bad data spread silently.", "A catch-all restart for configuration errors repeats the same failure forever."],
    v: "Throw a transient error, a corrupting error and a fatal error from one child, and confirm they produce resume, restart and stop respectively, with state preserved only in the first case.",
    dep: ["supervision-tree", "actor-lifecycle"]
  },
  "restart-strategies": {
    s: "The policy for how many siblings a failure restarts: only the failed child, or all children of the supervisor, optionally in start order.",
    d: "One-for-one restarts just the failed child, suitable when siblings are independent. One-for-all stops and restarts every child, for groups whose members depend on a shared invariant or on one another's state. Rest-for-one restarts the failed child and those started after it, matching ordered dependencies. Choosing wrongly either leaves siblings holding references to a restarted peer's old incarnation or needlessly interrupts healthy work. Restart also changes what references mean, because new incarnations may need to be rediscovered.",
    k: ["One-for-one vs one-for-all: one-for-one limits disruption, one-for-all guarantees a consistent group after failure but interrupts healthy members.", "Rest-for-one by start order vs explicit dependency declarations: start order is implicit and easy to break, explicit dependencies are clearer and more verbose."],
    p: ["Siblings that cached a reference to a restarted peer keep sending to the dead incarnation.", "One-for-all on a large group turns a single transient error into a brief full outage."],
    v: "Under each of the three strategies, crash the second of three ordered children and record which children restarted; confirm the sets are one, three and two respectively.",
    dep: ["supervisor-directives", "supervision-tree", "death-watch"]
  },
  "restart-backoff": {
    s: "Delaying each restart by a growing, jittered interval so a repeatedly failing child does not spin and does not hammer a dependency that is down.",
    d: "After a failure the supervisor waits before recreating the child, with the delay doubling up to a cap and a random factor to prevent synchronized restarts. If the child stays healthy for a reset period, the delay returns to the minimum. During the wait, messages to the child queue or are dropped depending on configuration. It pairs with a limit on total restarts, and the key tuning is whether callers wait, fail fast or are buffered during the delay.",
    k: ["Exponential backoff with jitter vs fixed delay: backoff relieves a struggling dependency and avoids thundering herds, while a fixed delay recovers faster from brief faults.", "Buffer messages during backoff vs drop them: buffering preserves work and risks memory growth, dropping is safe and loses requests."],
    p: ["No jitter means many restarting children hit a recovering database at the same instant and knock it over again.", "A reset period shorter than the failure cycle means the delay never grows."],
    v: "Kill a child on startup five times in a row and measure the gaps between restart attempts: confirm they grow toward the cap with randomized variation, then reset after a long healthy run.",
    dep: ["restart-strategies", "scheduled-messages"]
  },
  "restart-intensity-limits": {
    s: "A cap on how many restarts a supervisor allows in a time window, beyond which it stops trying and gives up or escalates its own failure.",
    d: "A supervisor counts restarts within a sliding window, for example five in sixty seconds. Exceeding the limit means restarting is not helping, so the child is stopped for good, or the supervisor itself fails to its parent, spreading the recovery decision upward where a broader restart may fix the shared cause. The limit makes failures finite and visible. Setting it too low turns a flaky dependency into permanent outage, too high hides a crash loop that burns resources.",
    k: ["Give up on one child vs fail the whole supervisor: giving up isolates the problem, while escalating restarts a larger scope that may cure a shared cause.", "Sliding window vs lifetime count: a window forgives old failures, while a lifetime count eventually kills any long-running child."],
    p: ["A limit reached during a short dependency outage permanently stops children that would have recovered minutes later.", "No limit at all lets a crash loop run quietly for days."],
    v: "Configure three restarts per minute and crash a child four times in under a minute: confirm the fourth failure stops it or escalates, and that waiting out the window then allows restarts again.",
    dep: ["restart-strategies", "failure-escalation", "timer-wheel"]
  },
  "death-watch": {
    s: "A subscription that delivers a termination message to an actor when another actor stops, whether by choice, failure or the loss of its node.",
    d: "An actor watches a reference and later receives a terminated notification once. For local actors the runtime sends it on stop. For remote ones it comes from the failure detector when the node is declared down, or from the remote runtime when the actor stops normally. Watching is how workers detect a dead master and routers drop dead routees. The subtlety is that remote termination is a suspicion made after a delay, so a notification may arrive late, and a false positive means a live actor is treated as dead.",
    k: ["Watch for termination vs periodic heartbeat messages: watch is automatic and exact for local actors, while heartbeats work on any peer but cost traffic and tuning.", "Notification on node loss vs only on explicit stop: including node loss is essential for correctness, and means a network issue can look like a death."],
    p: ["Acting irreversibly, such as releasing a lock, on a remote terminated message that was a false suspicion creates two owners.", "Watching an already-dead actor must still deliver a termination message, or the watcher waits forever."],
    v: "Watch an actor on another node, stop it, and confirm one terminated message arrives; then kill the whole node and confirm a watcher of another actor there receives terminated after the detection delay.",
    dep: ["actor-references", "failure-detector", "system-message-channel"]
  },
  "failure-escalation": {
    s: "Passing a failure the supervisor cannot handle to its own parent, so recovery decisions move up the tree until some level can make them.",
    d: "When a decider returns escalate, the supervisor fails as if it had thrown the error itself, suspending all its children and notifying its parent, which then applies its own policy to the whole subtree. This lets low-level code stay ignorant of high-level recovery. At the top, the root guardian ends the system. Escalation is a blunt instrument because it restarts or stops entire subtrees, so it is for failures the local scope cannot reasonably fix.",
    k: ["Escalate vs handle locally: escalation puts a broad restart behind a narrow bug, while local handling keeps the blast radius small and needs the local code to know the right action.", "Escalating the original cause vs a wrapper: the original cause keeps diagnosis simple, wrappers add context and hide the type."],
    p: ["Escalating routine errors makes ordinary request failures restart large parts of the application.", "Reaching the top of the tree with an unhandled failure terminates the whole process without a clear report."],
    v: "Cause an error in a leaf whose parent escalates, and confirm the parent's whole subtree restarts under the grandparent's policy while sibling subtrees under other parents are untouched.",
    dep: ["supervisor-directives", "supervision-tree", "guardian-actors"]
  },
  "graceful-stop-and-shutdown": {
    s: "The ordered way to end an actor or the whole system: stop accepting work, finish or hand off in-flight work, release resources and then terminate.",
    d: "Stopping a parent stops its children first, so resources are released leaf to root. A graceful variant sends a request-to-stop message the actor processes after earlier messages, rather than killing it with its mailbox full. System shutdown runs phases: leave the cluster and hand over shards, stop accepting external requests, flush journals, then close transports. Each phase has a timeout so a stuck component cannot block the process forever, and what is lost on timeout must be decided in advance.",
    k: ["Graceful stop after pending messages vs immediate stop: graceful finishes accepted work but can wait forever, while immediate stops fast and discards queued messages.", "Phased shutdown with timeouts vs a single global timeout: phases keep order and clear diagnostics, a single timeout is simpler and truncates whatever was running."],
    p: ["Terminating the process on a signal without leaving the cluster forces peers to wait for the failure detector before shards move.", "Stopping the journal before actors finish their writes loses acknowledged events."],
    v: "Send a termination signal during steady traffic and confirm the node leaves the cluster, hands off its shards, finishes in-flight requests and exits within the phase limits, with no lost acknowledged writes.",
    dep: ["actor-lifecycle", "rebalancing-and-handoff", "node-lifecycle-states"]
  },
  "guardian-actors": {
    s: "The fixed top-level actors every system starts with, which own the user hierarchy, system services and the root of failure handling.",
    d: "A root guardian sits above two or three children: a user guardian that parents all application actors, and a system guardian for runtime internals such as the logger, timers and remoting. Separating them lets the runtime shut down application actors first and keep logging and transport alive until the end. The user guardian's supervision policy is the default for every top-level actor, so it deserves an explicit choice. If the root fails, the system terminates.",
    k: ["Separate user and system guardians vs one tree: separation orders shutdown correctly and isolates runtime internals, at the cost of fixed structure.", "Default restart policy at the user guardian vs requiring explicit policies: defaults are convenient and quietly apply to everything unconfigured."],
    p: ["Application actors created under the system guardian keep running after shutdown has stopped the services they need.", "A user guardian that stops on any failure turns one application error into a whole-system exit."],
    v: "Print the tree at startup and confirm the guardians' paths, then trigger shutdown and confirm application actors terminate before the logger and transport, using timestamps in the shutdown log.",
    dep: ["supervision-tree", "actor-paths-and-names"]
  },
  "mailbox-queue": {
    s: "The per-actor queue of unprocessed messages, written by any sender thread and drained by exactly one consumer at a time, with a hot, lock-light implementation.",
    d: "Many senders enqueue concurrently while the dispatcher dequeues for one actor, so the common structure is a multi-producer, single-consumer queue built from atomic operations rather than locks. Enqueue must be cheap because it happens on the sender's thread. The mailbox also carries a scheduling state, so the first enqueue to an idle actor schedules it. Its design determines per-sender ordering, memory per actor and behavior under overload; an unbounded queue never blocks senders but can grow until memory runs out.",
    k: ["Lock-free linked queue vs array ring buffer: linked queues are unbounded and allocate per message, while rings are faster and bounded.", "Unbounded vs bounded default: unbounded never blocks senders but hides overload until memory is gone, while bounded forces a policy at the edge."],
    p: ["An unbounded mailbox on a slow actor grows silently for hours before the process runs out of memory.", "Large messages in a mailbox multiply memory by queue depth, not just by message count."],
    v: "Send messages faster than an actor can process and chart queue depth and process memory: confirm depth rises, memory follows, and that after the burst the actor drains in order.",
    dep: ["mailbox-run-state", "message-envelope"]
  },
  "bounded-and-priority-mailboxes": {
    s: "Mailbox variants that cap queue length with a defined overflow policy, or deliver urgent messages ahead of ordinary ones.",
    d: "A bounded mailbox rejects, drops the oldest or newest, or blocks the sender for a short time when full; each choice moves the overload decision somewhere else. A priority mailbox orders messages by a function, so control messages overtake data. Priority breaks the ordering a sender normally expects between its own messages, and a stream of high-priority messages can starve the rest. Both variants cost more than the default queue, and the right policy depends on whether messages are commands, which must not be lost, or samples, which can be.",
    k: ["Drop vs block the sender on overflow: dropping keeps actors responsive and loses data, while blocking propagates pressure and can deadlock cyclic actors.", "Priority ordering vs strict arrival order: priority speeds urgent traffic and breaks per-sender ordering and fairness."],
    p: ["A blocking bounded mailbox in a cycle of actors deadlocks when every queue in the cycle is full.", "Dropped messages are counted nowhere, so data loss goes unnoticed."],
    v: "Fill a bounded mailbox of one hundred with one hundred and fifty messages and confirm the documented overflow count of fifty goes to dead letters; in a priority mailbox confirm a control message jumps the queue.",
    dep: ["mailbox-queue", "dead-letters"]
  },
  "message-envelope": {
    s: "The wrapper around each message carrying the sender, the target, optional metadata and a trace context, separate from the application payload.",
    d: "Between send and receive the runtime attaches the sender reference, correlation or trace fields, a timestamp for latency measurement and a serializer hint for remote delivery. The payload is expected to be immutable, because it is shared between the sender and the receiver without copying when local. The envelope is what lets cross-cutting features such as tracing, metrics and security work without changing every message class, but every extra field is allocated per message on the hottest path.",
    k: ["Metadata in the envelope vs inside the payload: the envelope serves every message uniformly and keeps payloads clean, while payload fields are explicit and travel with the data.", "Immutable payloads shared by reference vs copying on send: sharing is fast, copying protects against mutation and costs allocation."],
    p: ["A mutable payload sent locally and modified by the sender afterward changes what the receiver sees, and the bug disappears under remoting where a copy is made.", "Large per-message metadata inflates both memory and wire size."],
    v: "Send a message carrying a trace id through three hops and confirm the id is present in each envelope; mutate a payload after send in a test and confirm the immutability checks reject it.",
    dep: ["serializer-registry"]
  },
  "per-sender-ordering": {
    s: "The guarantee that messages from one sender to one receiver arrive in the order sent, with no promise about order across different senders.",
    d: "A single mailbox queue preserves enqueue order, and per-sender FIFO follows locally. Over the network it requires a single ordered connection per pair, with sequence numbers to detect gaps after reconnect. Across senders no order exists, because they are concurrent. The guarantee is cheap to provide and enough for most protocols, but easy to lose: routers, multiple connections, priority mailboxes, retries and a different path for system messages can all reorder.",
    k: ["Per-pair FIFO vs global ordering: per-pair is cheap and local, while total order needs a sequencer and limits scale.", "Ordered single lane vs multiple parallel lanes: one lane keeps order and caps throughput, many lanes increase throughput and order only within a lane."],
    p: ["Sending a request and a follow-up through different routes lets the follow-up arrive first.", "Assuming ordering between messages from two different senders works in tests with one thread and fails in production."],
    v: "Send one hundred numbered messages from one sender to one receiver across nodes, with a forced connection drop in the middle, and confirm the receiver processes them in order with no duplicates or gaps.",
    dep: ["mailbox-queue", "association-and-lanes"]
  },
  "at-most-once-delivery": {
    s: "The default send guarantee: each message is delivered zero or one times, never duplicated, with no retry if it is lost.",
    d: "Send enqueues and returns without waiting for acknowledgment. Locally the only loss is a full or stopped recipient. Over a network, messages in transit during a connection break or node crash vanish, and the sender is not told. The semantics are cheap and avoid duplicates, and applications needing more build it on top with acknowledgments and retries. It forces designs to be explicit: the sender must decide what a missing reply means and set timeouts accordingly.",
    k: ["Fire and forget vs acknowledged send: fire and forget is fastest and loses messages silently, acknowledged send detects loss and costs round trips.", "Defining loss as a normal event vs masking it with hidden retries: explicit loss keeps latency honest, hidden retries create duplicates and unbounded delay."],
    p: ["Using fire-and-forget for a command that must happen, such as charging a card, loses it on a connection reset.", "Reading no error from send as proof of delivery."],
    v: "Kill the receiving node while a sender emits steady messages, and confirm the sender sees no error, the receiver sees a gap, and no message appears twice after reconnection.",
    dep: ["mailbox-queue", "node-transport", "dead-letters"]
  },
  "at-least-once-delivery": {
    s: "A layer that persists messages, retries until acknowledged and so delivers every message one or more times, requiring receivers to tolerate duplicates.",
    d: "The sender keeps unacknowledged messages with delivery ids, usually in its persistent state so they survive a crash, and resends on a timer until the receiver confirms. The receiver deduplicates by id or makes processing idempotent. This is the practical basis for reliable workflows over an unreliable network. The costs are state per outstanding message, redelivery storms after an outage and the work of idempotent handlers, since exactly-once is only achievable as at-least-once plus deduplication.",
    k: ["At-least-once with idempotent receivers vs exactly-once claims: idempotent receivers are achievable and simple to reason about, while exactly-once needs coordination and still has limits.", "Retry with backoff vs fixed interval: backoff avoids storms but delays recovery."],
    p: ["Unlimited redelivery to a dead receiver grows the unacknowledged set without bound.", "Duplicates processed twice because deduplication state was not persisted with the effect."],
    v: "Drop the first three acknowledgments, crash and restart the sender mid-stream, and confirm the receiver processed every business message exactly once after deduplication, while the sender's outstanding set returned to zero.",
    dep: ["event-journal", "scheduled-messages", "per-sender-ordering"]
  },
  "dead-letters": {
    s: "The destination for messages that cannot be delivered, with the reason attached, so no loss is silent and failures can be counted and inspected.",
    d: "When a send targets a stopped actor, an unknown path or a full bounded mailbox, the runtime wraps the message with sender, recipient and cause and sends it to a dead-letter actor. By default it only logs a limited number. Subscribers can collect them for monitoring, replay or alerting. The facility is best effort: messages lost on the network or in a crashed process never reach it. It is mostly a debugging and monitoring tool, not a reliability mechanism.",
    k: ["Collecting dead letters for inspection vs discarding them: collection makes loss visible and costs memory under floods, discarding saves resources.", "Replaying dead letters automatically vs only manually: automatic replay recovers transient losses but can repeat poison messages."],
    p: ["A stopped actor receiving heavy traffic produces a flood that overwhelms logs.", "Believing dead letters capture all loss, when network and crash losses bypass them."],
    v: "Send messages to a stopped actor, to a nonexistent path and to a full bounded mailbox, and confirm three dead letters arrive with three distinct, correct reasons.",
    dep: ["mailbox-queue", "actor-references"]
  },
  "backpressure-and-flow-control": {
    s: "Mechanisms that slow or stop producers when consumers cannot keep up, so queues stay bounded instead of absorbing overload until memory runs out.",
    d: "Plain actor sends never push back, so flow control is added: credit-based demand where a consumer grants a number of messages it is ready for, bounded mailboxes with drop or reject policies, and rate limiters at entry points. Pressure must propagate to the true source, such as the network connection or client, or it is just moved. In a cluster, the signals themselves cross unreliable links, so demand messages can be lost or delayed.",
    k: ["Credit-based demand vs bounded queue with rejection: credits keep queues short and add round trips, while rejection is simple and pushes retry logic to the sender.", "Shedding load at the edge vs deep in the system: edge shedding is cheap and early, while deep shedding wastes the work already done."],
    p: ["Backpressure applied in one stage while a later stage has an unbounded queue just moves memory growth.", "A lost demand message leaves a producer waiting forever for credit."],
    v: "Run a fast producer against a slow consumer and confirm queue depth stays under the configured bound, producer rate converges to consumer rate, and the process memory stays flat for an hour.",
    dep: ["bounded-and-priority-mailboxes", "mailbox-and-throughput-metrics", "reactive-streams-bridge"]
  },
  "reactive-streams-bridge": {
    s: "An adapter between actors and asynchronous stream processing with demand signaling, so stream stages and actors can exchange data without unbounded buffering.",
    d: "Streams define publishers, subscribers and a demand protocol: a subscriber requests n elements and the publisher never sends more. The bridge exposes an actor as a source or sink, converting mailbox sends into demand-driven elements, and runs stream stages on the same dispatchers. It lets a pipeline of transformations be described declaratively while individual stages stay actors. Mismatches show at the boundary: an actor's push model must be given a buffer and an overflow strategy to fit pull-based demand.",
    k: ["Demand-driven streams vs actor pushes: demand bounds memory and adds protocol machinery, while pushes are simple and risk overload.", "Fused stages in one actor vs one actor per stage: fusing is faster, one per stage isolates failure and adds queueing."],
    p: ["An actor source with an unbounded buffer defeats the backpressure the stream was meant to give.", "A stage failing without a recovery strategy cancels the whole stream."],
    v: "Connect an actor producing one million elements to a slow stream sink and confirm the actor receives demand signals, the in-flight count stays within the buffer size, and all elements arrive in order.",
    dep: ["backpressure-and-flow-control", "dispatcher", "actor-references"]
  },
  "timer-wheel": {
    s: "A data structure that schedules very many timers cheaply by hashing deadlines into time slots, trading precise timing for constant-cost insert and cancel.",
    d: "The wheel is an array of buckets, each representing a short tick of time. A timer is placed in the bucket for its deadline, and a single thread advances the wheel one tick at a time, firing the timers in the current bucket. Insertion and cancellation are constant time, which matters when every request or entity holds a timeout. Resolution is a tick, often tens of milliseconds, so sub-tick accuracy is lost. Firing must hand work to the dispatcher, never run user code on the timer thread.",
    k: ["Hashed wheel vs a priority queue of deadlines: the wheel is cheaper per timer at large counts, while a heap is exact and slower per operation.", "Coarse tick vs fine tick: coarse ticks reduce wakeups and precision, fine ticks cost CPU for little gain."],
    p: ["Running handlers on the timer thread lets one slow handler delay every other timer.", "Very long delays need hierarchical wheels or rounds counters, or they fire early after wraparound."],
    v: "Schedule one million timeouts, cancel nine hundred thousand, and confirm the rest fire within one tick of their deadline with the timer thread's CPU use staying low.",
    dep: ["clock-abstraction", "dispatcher"]
  },
  "scheduled-messages": {
    s: "Sending a message to an actor after a delay or at an interval through the timer service, returning a handle that can cancel it.",
    d: "An actor asks the scheduler to deliver a message to a reference later. When the delay elapses the scheduler sends it as an ordinary message, subject to the mailbox's queue, so it can arrive late if the actor is busy. Delays are lower bounds, not guarantees. Fixed-rate schedules are repeated sends, and a slow consumer can accumulate backlog. Cancellation is best effort, since a message already enqueued cannot be recalled, and the receiver must tolerate late ticks.",
    k: ["Fixed-delay vs fixed-rate repetition: fixed-delay never piles up, fixed-rate keeps cadence and can build a backlog after a stall.", "Scheduler-owned timers vs actor-owned timers: scheduler-owned are simple and live beyond the actor, actor-owned stop with it and are easier to cancel."],
    p: ["A cancelled timer's message already in the mailbox still arrives and triggers old behavior.", "A scheduled message to a stopped actor goes to dead letters repeatedly at every tick."],
    v: "Schedule a message with a one-second delay and confirm it arrives no earlier than one second; cancel another before it fires and confirm it never arrives, even when the actor was briefly busy.",
    dep: ["timer-wheel", "mailbox-queue", "actor-references"]
  },
  "receive-timeout": {
    s: "A per-actor inactivity timer that delivers a timeout message if no message has arrived within a set time, resetting on each message.",
    d: "The actor sets a receive timeout, and the runtime restarts a timer on every message processed. If the interval elapses with no message, a special timeout message is delivered. It is used for session expiry, idle cleanup and passivation of entities. A subtle point is that the timer resets on any message including the timeout and internal ones, so it must be explicitly excluded for background traffic. It is cheap with a timer wheel, but each reset has a cost on busy actors.",
    k: ["Per-actor inactivity timer vs a periodic sweeper: inactivity timers are exact and add per-message resets, while sweepers are cheap and coarse.", "Reset on every message vs only on application messages: resetting on all is simple, while selective reset prevents internal traffic from keeping idle actors alive."],
    p: ["Heartbeats or monitoring pings reset the timeout and prevent an idle actor from ever expiring.", "A timeout message arriving after new work was enqueued closes an actor that is about to be busy."],
    v: "Set a five-second timeout on an actor, send nothing and confirm one timeout message at five seconds; send a message at four seconds and confirm the timeout moves to nine.",
    dep: ["timer-wheel", "passivation"]
  },
  "periodic-and-keyed-timers": {
    s: "Named timers owned by an actor, where starting a timer with an existing key replaces the old one, so stale ticks from cancelled timers are never delivered.",
    d: "An actor starts a timer under a key, once or periodically, and the runtime delivers its message as a self-send. Starting again with the same key cancels the earlier one and discards any of its messages already queued, using a generation number carried in the message. Timers stop with the actor. This removes a common bug of cancelled timers still firing. It is a convenience layer over the scheduler, and its generation check relies on every timer message passing through the runtime's own check.",
    k: ["Keyed replace semantics vs manual cancel handles: keyed timers prevent stale deliveries automatically, while handles give finer control and need discipline.", "Timers cleaned up with the actor vs surviving it: tying them to the actor prevents leaks, and loses background work that should continue."],
    p: ["Using separate keys per request creates a timer per request with no upper bound.", "Timer messages stashed and later unstashed lose their generation check and fire stale."],
    v: "Start a keyed timer, restart it with the same key before it fires, and confirm exactly one message arrives at the second deadline and none from the first.",
    dep: ["scheduled-messages", "actor-lifecycle"]
  },
  "clock-abstraction": {
    s: "A single interface for reading time and waiting, used by every runtime component, so tests can substitute a controlled clock and production can use monotonic time.",
    d: "Components obtain the time from the system's clock service instead of the operating system. It offers a monotonic reading for measuring intervals, immune to wall-clock changes, and a wall-clock reading for timestamps stored or exchanged between nodes. Mixing them is a classic bug: monotonic values are meaningless on another machine, and wall time jumps backward after adjustment. Distributed logic such as leases and failure detection must use monotonic time locally and treat wall clocks across nodes as approximate.",
    k: ["Monotonic clock for intervals vs wall clock: monotonic is safe against adjustments, while wall time is required for human-readable and cross-node timestamps.", "Injected clock everywhere vs direct system reads: injection permits virtual time in tests, and requires discipline across all code."],
    p: ["Measuring a timeout with wall time makes it fire early or never after a clock step.", "Comparing timestamps from two nodes with unsynchronized clocks to order events."],
    v: "Step the system wall clock back one hour during a run and confirm timeouts, failure detection and timers behave unchanged, while stored timestamps show the step.",
    dep: []
  },
});
