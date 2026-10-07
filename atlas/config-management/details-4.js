// Details for the configuration management plate, part 4: planning, ordering, scaling and rollout.
ATLAS.details("config-management", {
  "plan-compiler": {
    s: "Combines code, data and a node's facts into a complete, resolved plan for that node: the exact resources to converge, with values filled in and relationships recorded.",
    d: "Given a node name, the compiler gets facts and classification, loads the code for the node's environment, evaluates conditions, loops and lookups, and emits a graph of resources with final attribute values. The plan is a data structure sent to the agent, which never sees the source code. Compilation is where most expensive work happens: parsing, lookups and template rendering. It is hard to scale because it is CPU-heavy and per node, and because it must be deterministic so the same inputs always give the same plan.",
    k: ["Compile on the server vs on the node: server compilation keeps code and data central; node compilation distributes the work and requires every node to hold code and data.", "Compile on every request vs reuse a cached plan: compiling every time reflects the latest facts; reuse saves capacity but can serve stale data."],
    p: ["A lookup that depends on the time of day makes the plan differ between runs, and the node reports a change each time.", "A single compile error in shared code makes every node's plan request fail at once."],
    v: "Compile the plan for a test node twice from the same commit and facts and confirm both are identical, then change one data value and confirm only the resources using it differ.",
    dep: ["hierarchical-data-lookup", "templating-engine", "node-classifier", "functions-and-lookups"]
  },
  "dependency-graph": {
    s: "The directed graph of resources and the relationships among them, from which a valid execution order is derived and cycles are detected before anything runs.",
    d: "Each resource is a vertex. Edges come from explicit relationships, implicit rules, and containers such as modules that group resources. The planner checks that the graph has no cycles, then produces a topological order. Execution follows that order, and when a resource fails, those depending on it are skipped. It is hard because edges come from several sources that must be merged, because large graphs are expensive to analyze, and because a cycle error is reported in terms of the graph while the author thinks in files.",
    k: ["Graph-based ordering vs top-to-bottom file order: a graph captures real dependencies and allows skipping failed branches; file order is easy to understand and hides missing relationships.", "Fail on cycles at compile time vs detect at run time: compile-time failure is clear and early; run-time detection can miss paths that only occur on some nodes."],
    p: ["A cycle exists only on nodes with an optional module, and appears the first time one is added.", "A failed resource causes dozens of skipped dependents, and operators chase the symptom instead of the first failure."],
    v: "Introduce a deliberate two-resource cycle and confirm compilation fails naming both resources in the loop, then remove it and print the graph for a test node to confirm the order.",
    dep: ["resource-declarations"]
  },
  "explicit-ordering": {
    s: "Relationships authors write by hand to say that one resource must be applied before, after, or in response to another.",
    d: "The language offers requirement and ordering statements, chain syntax and before and after attributes that add edges to the graph. They state facts the planner cannot infer, such as that a configuration file must exist before a specific service starts. They are the main tool for correctness, and the main source of fragile code. The challenge is completeness: a missing edge works on most runs because the default order happens to be right, then fails on a node where the order changes.",
    k: ["Explicit edges everywhere vs trusting file order: explicit edges are correct under any order; relying on file order is shorter and fails when code is reorganized.", "Edges between individual resources vs between whole modules: individual edges are exact; module-level edges are shorter and over-constrain, hiding parallelism."],
    p: ["A missing relationship passes for months because the unspecified order was always the right one, then breaks after a refactor.", "Edges across module boundaries create hidden coupling, so a module cannot be changed without breaking others."],
    v: "Shuffle the order in which resources are written in a test module and apply it on a clean node five times, confirming every run succeeds because the explicit edges alone fix the order.",
    dep: ["dependency-graph"]
  },
  "implicit-ordering": {
    s: "Dependencies the system infers from resource types and attributes, such as a file needing its parent directory, or a service needing the package that provides it.",
    d: "Types declare automatic relationships: a file depends on its directory, and a user on its group. The planner adds these edges without author effort, which removes a large class of ordering mistakes. Rules are defined per type and must be documented. The difficulty is that they are invisible in the code: an author reading a module cannot see an edge that exists, and a rule that is almost right causes confusing order or unexpected cycles.",
    k: ["Inferred edges vs requiring all edges explicitly: inference removes boilerplate and common errors; explicit edges leave no surprises but are tedious and often forgotten.", "Narrow inference rules vs broad ones: narrow rules are predictable; broad rules catch more cases and create unexpected dependencies."],
    p: ["An inferred edge connects two resources in an unexpected way and creates a cycle no author wrote.", "Authors assume the system infers a dependency it does not, such as service on configuration file."],
    v: "Print the graph for a node and confirm each file resource has an edge from its parent directory resource, and that removing the directory resource turns the edge into a clear compile error.",
    dep: ["dependency-graph", "resource-abstraction"]
  },
  "notifications-and-restarts": {
    s: "A mechanism by which a changed resource triggers a refresh of dependents, typically restarting or reloading a service only when its configuration file actually changed.",
    d: "A relationship marked as notifying adds an ordering edge and a trigger: when the source resource reports a change, the target receives a refresh event, such as a service reload. When nothing changed, nothing happens, which is the point. Events collapse so that three changed files cause one restart. It is hard because refresh is separate from the target's state: a service that fails to restart leaves the file correct and the service wrong, and on the next run no change is detected, so the failure is never retried.",
    k: ["Restart on change vs reload on change: restart is simple and brief downtime; reload avoids interruption when the service supports it and can leave stale state.", "Event-based refresh vs always ensuring state: events avoid needless restarts; ensuring state on every run is robust but restarts too often."],
    p: ["The restart fails after the file is already updated, so the next run sees no change and never retries.", "Every node in a group restarts the same service in the same minute after a template edit, causing an outage."],
    v: "Change one setting in a template, converge a test node, and confirm exactly one reload of the service follows, then converge again and confirm no reload occurs.",
    dep: ["dependency-graph", "service-provider", "apply-loop"]
  },
  "tags-and-selection": {
    s: "Labels on resources and groups that let a run apply only a chosen subset, such as only security updates or only one module, without changing the code.",
    d: "Resources inherit tags from their module and type, and authors add more. A run can be limited to resources with given tags, or skip some. Selection supports partial convergence during incidents, targeted maintenance and staged introduction of new code. It is hard because a partial run applies part of a dependency graph: selecting a service without its configuration file converges something inconsistent, and tag discipline decays so that labels stop meaning what they claim.",
    k: ["Tag-based partial runs vs always running everything: partial runs are faster and targeted; full runs keep the node fully converged and consistent.", "Automatic tags from structure vs manual labels: automatic tags are reliable but coarse; manual labels are precise and decay."],
    p: ["A tagged run restarts a service without applying the configuration it depends on, leaving a mismatched state.", "Operators rely on a tag that a module stopped applying, and the run silently selects nothing."],
    v: "Run a test node with a single tag and confirm the report shows only resources carrying that tag as checked, and that the others are listed as not evaluated rather than unchanged.",
    dep: ["dependency-graph"]
  },
  "plan-cache": {
    s: "Stores compiled plans so nodes whose inputs have not changed can be served without recompiling, cutting server load sharply for large fleets.",
    d: "The cache keys a plan on the node, its facts, the code version and the data version. If nothing in the key changed, the previous plan is returned. A node whose run changed nothing requests a plan, finds it unchanged, and finishes quickly. Because most runs on a stable fleet change nothing, the savings are large. Invalidation is the hard part: data in an external service or a function reading a clock is not in the key, so the cache can serve a plan that is out of date or incorrect.",
    k: ["Cache by input hash vs by time: hashing is correct when all inputs are in the key; time-based expiry is simple and can serve old plans or recompile needlessly.", "Share one cache across servers vs one each: shared improves hit rates; per-server avoids a shared dependency and warms slowly."],
    p: ["An external data lookup changes, the key does not, and nodes keep getting the old plan.", "A deploy invalidates every cache simultaneously, and all nodes compile at once and overload the servers."],
    v: "Request a plan twice with no input changes and confirm the second is served from the cache, then change one data value and confirm the next request compiles a new plan.",
    dep: ["plan-compiler", "state-database"]
  },
  "execution-stages": {
    s: "Coarse phases in which groups of resources are applied in a fixed sequence, such as preparation, main configuration and cleanup, independent of fine-grained dependencies.",
    d: "Stages are a blunt ordering tool: everything in an earlier stage completes before anything in a later stage begins. They suit work that has to happen first or last, such as setting up package repositories before any package is installed, or running a final check. Stages hide actual dependencies, so they should be few. Used heavily they become a second ordering system that fights the graph, and a failure in an early stage skips everything after it.",
    k: ["Few coarse stages vs fine-grained edges only: stages are quick to apply to a whole category of resources; edges are exact and take more effort.", "A failed stage blocks later stages vs continuing: blocking avoids applying on a broken base; continuing makes partial progress and can compound the problem."],
    p: ["Resources are put in a stage to fix one ordering bug, and later the stage's contents grow into an unmaintainable set.", "A failure in the first stage skips the whole run, and the report shows hundreds of skipped resources."],
    v: "Place a repository resource in an early stage and a package in the main stage, run a clean node, and confirm the report order shows the repository applied before any package.",
    dep: ["dependency-graph"]
  },
  "server-fleet-scaling": {
    s: "Growing the central service from one machine to a pool that handles tens of thousands of nodes, by separating compilation, storage and file serving and adding capacity to the busy part.",
    d: "A single server compiles plans, serves files and stores reports. Capacity planning follows from run frequency: nodes times runs per hour gives requests per second, and compiles dominate. Scaling out means a load balancer in front of several compilers, a shared database, a shared code deployment and a way to keep them consistent. Bottlenecks move as the fleet grows: first CPU for compilation, then the database, then network bandwidth for file transfers.",
    k: ["Scale up one big server vs scale out: one server is simple to operate; scaling out removes the ceiling and adds consistency problems.", "Capacity for the average vs for the peak: average is cheaper; peak handles the thundering herd after an outage or restart."],
    p: ["After an outage every node returns at once and overloads the servers, so recovery takes far longer than the fault.", "Servers in the pool run different code versions during a deploy, and a node's runs flip between behaviors."],
    v: "Simulate the expected number of nodes requesting plans in one interval against a test pool, and confirm the median plan latency and the failure rate stay within target while one server is stopped.",
    dep: ["compile-worker-pool", "state-database", "proxy-tiers"]
  },
  "compile-worker-pool": {
    s: "A set of compile workers that run the planner in parallel on separate cores or machines, handling plan requests from many nodes at once.",
    d: "Compilation is single-threaded per request, so capacity comes from running many workers. Workers load code and data into memory, which is costly, and are reused across requests. A supervisor restarts workers that leak memory or hang and limits each worker's concurrency. Sizing balances memory against core count: too many workers exhaust memory on large code bases. Isolation between environments matters, because workers hold code for one environment and cannot safely serve another with different versions.",
    k: ["Long-lived workers vs one process per request: long-lived workers amortize loading; per-request processes isolate but waste time re-loading code.", "Few large workers vs many small ones: large workers share more but are heavy to restart; small workers isolate faults and cost memory."],
    p: ["A worker slowly leaks memory and is killed mid-request, so a node's run fails with a vague error.", "A deploy reloads code in every worker at once, and plan requests queue up until load recovers."],
    v: "Send plan requests for a hundred test nodes concurrently and confirm worker CPU is spread evenly, all requests complete, and killing one worker mid-test causes retried requests, not failures.",
    dep: ["plan-compiler", "work-queue"]
  },
  "proxy-tiers": {
    s: "Intermediate servers placed in regions or network segments that terminate node connections and serve files and cached plans, relaying only needed work to the central compilers.",
    d: "Remote offices, clouds and isolated networks each get a proxy that nodes contact instead of the central service. The proxy serves cached files and forwards plan requests and reports upstream. This cuts wide-area traffic and keeps nodes working across slow or intermittent links. It also becomes an additional trust boundary: proxies hold credentials and cached content. The difficulty is consistency, since each proxy holds its own copy of code and may lag the central view.",
    k: ["Proxies that forward requests vs full regional servers that compile: forwarding is simple and keeps compilation central; regional compilers survive isolation and duplicate data and capacity.", "Cache files at the proxy vs always fetch from the center: caching saves bandwidth; always fetching ensures freshness."],
    p: ["A proxy serves stale files after a deploy, and nodes behind it lag in version for hours.", "A compromised proxy can see every plan and secret that passes through it."],
    v: "Block the link between a proxy and the central service, run a node behind it, and confirm the node still completes a run from cached content and reports the staleness.",
    dep: ["mutual-tls-channel", "plan-cache"]
  },
  "state-database": {
    s: "The server's persistent store for facts, reports, node status and events, separate from code and data, sized for write-heavy traffic from every run of every node.",
    d: "Each run writes facts, a report and a status update, so write rate equals the node count over the run interval. Queries read recent facts, node status and event history. A relational or document store holds this data, with retention rules that delete old reports. Indexes serve console and API queries. It is the part of the system that fills up: reports are large, and without pruning they grow until the database slows every run that waits on its write.",
    k: ["Write reports synchronously vs through a queue: synchronous is simple and slows nodes when the database is slow; a queue absorbs bursts and delays visibility.", "Long retention vs short: long retention supports investigations; short retention keeps the database small and fast."],
    p: ["Reports are never pruned, and the database disk fills and stops all runs.", "A heavy console query locks tables that run completion needs, slowing the whole fleet."],
    v: "Check the table sizes after a week of normal runs and confirm growth matches the expected report volume, and that pruning removes reports older than the retention period.",
    dep: ["work-queue"]
  },
  "work-queue": {
    s: "A buffer between the components that accept reports and facts and those that store and process them, absorbing bursts so slow storage never blocks nodes.",
    d: "Incoming reports and facts are placed on a queue and handled by background workers that write to the database, run processors and fire events. This decouples node latency from storage latency and lets the system survive a database restart. Queue depth is a key health signal. It is hard because ordering, retry and overflow need explicit policy: a stuck message must not block those behind it, and a full queue must either apply back pressure or drop work.",
    k: ["Durable queue on disk vs in memory: disk survives restarts; memory is faster and loses queued reports.", "Back pressure vs dropping data when full: back pressure slows nodes but loses nothing; dropping keeps nodes fast and loses history."],
    p: ["A malformed report fails repeatedly and blocks the head of the queue, delaying all reports behind it.", "The queue grows during a database outage and exhausts disk, taking down the server as well."],
    v: "Stop the database for ten minutes while nodes keep running, restart it, and confirm queue depth rises then drains and the count of stored reports equals the count of runs.",
    dep: []
  },
  "splay-and-jitter": {
    s: "Randomized delays that spread node check-ins evenly over the run interval, so thousands of nodes do not all contact the server in the same second.",
    d: "Each agent picks a random offset, often derived from a hash of its identity so it stays stable, within the check-in interval, and adds jitter to retries after failures. Without it, nodes started by a common event such as a deploy or reboot become synchronized and produce load spikes that grow worse after each outage. With it, load is nearly flat. The cost is predictability: a change takes up to a full interval to reach every node, and urgent changes need a push trigger.",
    k: ["Stable per-node offset vs fresh random offset each run: stable offsets give steady load and predictable timing; fresh random offsets break synchronization after outages.", "Wide splay vs narrow: wide spreads load but delays change propagation; narrow is faster with spikes."],
    p: ["Retry logic with no jitter creates a thundering herd of retries after every server restart.", "A wide splay means an urgent fix takes the whole interval to reach the last node."],
    v: "Chart request arrival times from a thousand test agents over one interval and confirm arrivals are roughly uniform, with no second containing more than a small multiple of the average.",
    dep: ["pull-schedule"]
  },
  "batched-rollouts": {
    s: "Applies a change to the fleet in waves of increasing size, by group or percentage, pausing between waves so problems are found before they spread.",
    d: "A rollout defines the order of groups and batch sizes, such as one node, then a canary group, then ten percent, then the rest, with a check between waves on report outcomes and health signals. Nodes in later waves continue running the old code until their turn, which means the system must serve different code versions to different groups. Implementation uses separate environments, group-based pinning or server-side gating. It is hard because waves slow delivery and because partially rolled out changes leave the fleet in mixed states for a long time.",
    k: ["Environment promotion per wave vs gating by node attribute: environments are simple and coarse; attribute gating is flexible and more complex.", "Fixed wave sizes vs adaptive sizing by observed health: fixed is predictable; adaptive is faster when healthy and requires trustworthy signals."],
    p: ["A change is held at ten percent for weeks, and the fleet runs two behaviors that nobody remembers differ.", "Waves are defined by group, but a node belongs to several, so it moves earlier or later than intended."],
    v: "Roll a harmless change through three waves on a test fleet and confirm each wave's nodes report the new commit only after the previous wave passed its check, with later nodes still on the old commit.",
    dep: ["node-groups", "version-pinning", "canary-and-halt-rules"]
  },
  "canary-and-halt-rules": {
    s: "Conditions that automatically stop a rollout when early nodes report failures or unhealthy signals, so a bad change affects a few machines rather than the fleet.",
    d: "The first wave is a small set of representative nodes, a canary group. After they converge, rules evaluate: failed resource counts, runs that did not complete, application error rates and service health. If thresholds are exceeded the rollout halts and notifies operators. The rules need signals from outside the configuration system, since a change can converge cleanly and still break the application. Choosing canary nodes that represent the fleet is hard, because a rare node type that fails is never in the sample.",
    k: ["Automatic halt vs human approval between waves: automatic halting is fast and can be wrong; human approval is slower and handles ambiguity.", "Halt on configuration failures only vs include application health: configuration signals are available and narrow; application health catches real damage and needs integration."],
    p: ["Canaries are all in the same region and miss a failure that only affects another.", "Halt thresholds are so loose that a failure rate of several percent counts as healthy."],
    v: "Deploy a change that deliberately fails on one canary node and confirm the rollout stops before the next wave, operators are notified, and no node outside the canary group received the change.",
    dep: ["node-status-store", "alerts-and-notifications", "run-reports"]
  }
});
