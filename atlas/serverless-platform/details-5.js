// Details for the serverless platform plate, part 5: metering and billing, fleet foundation, cross-cutting concerns.
ATLAS.details("serverless-platform", {
  "duration-metering": {
    s: "Measuring how long each execution ran, from event delivery to completion, rounded to a billing increment, and emitting that figure reliably for every invocation.",
    d: "The host agent timestamps event delivery and result return with a monotonic clock, so wall-clock adjustments do not matter, and includes init time where it is billable. The figure is rounded up to a small increment, such as a millisecond. A record with duration and memory goes into a metering stream that must survive host loss. Duration depends on the platform's definition: whether queueing, the freeze and thaw, and extension time are included. The difficulty is exactness at very high volume with no double counting when retries replay records.",
    k: ["Measure in the host agent vs. in the runtime: the agent is authoritative and covers crashes, but cannot see inside the handler.", "Fine rounding increments vs. coarse: fine increments are fairer to short functions, but yield more distinct values to aggregate and explain."],
    p: ["A host crash before the record is sent leaves a run that was never billed, or when replayed, billed twice.", "Customers compare their own measured time with the billed time and find a mismatch because init time or rounding is included."],
    v: "Run 1,000 invocations with known sleep durations, and confirm the sum of metered durations equals expected values plus rounding, with no missing or duplicate request identifiers across a deliberate host kill.",
    dep: ["host-agent","invocation-records"]
  },
  "memory-time-pricing": {
    s: "The charge unit that multiplies the configured memory by the billed duration, usually expressed in gigabyte-seconds, plus a separate per-request fee.",
    d: "Cost for an execution is memory in gigabytes times seconds, at a unit price, regardless of how much memory the code actually used. Because CPU follows memory, doubling memory can halve duration for CPU-bound code and keep cost flat or lower. Free tiers and volume discounts apply to totals. Provisioned capacity bills for time held. The structure rewards short, efficient functions and punishes waiting: time spent idle inside a call, such as awaiting a slow API, is billed like compute time.",
    k: ["Bill on configured memory vs. on measured use: configured is simple and predictable and matches the reserved capacity, but gives no credit for over-allocation.", "Per-duration billing vs. per-instance-hour: per-duration scales cost to zero when idle, but is more expensive than reserved capacity for steady heavy load."],
    p: ["Functions that mostly wait on slow network calls pay compute rates while doing nothing.", "A tuning change in memory size gets assessed only on duration, and the cost per call goes up."],
    v: "Compute expected cost from the records of a known run using memory, duration and unit prices, and confirm it matches the invoiced line item to the billing precision.",
    dep: ["duration-metering","resource-sizing"]
  },
  "request-counting": {
    s: "Counts each invocation request for the per-request fee, defining exactly what counts: successful calls, errors, throttled attempts, retries and platform-initiated calls.",
    d: "A counter increments when an invocation is accepted and run, with explicit rules: throttled requests that never ran are usually free, retries are counted as separate requests, and events for pollers count per function call, not per message. Counting happens alongside duration records, so the two are reconciled. The hard part is a clear definition under at-least-once delivery: a retry the platform decided to make is still billed, so duplicate delivery has a direct cost.",
    k: ["Count every attempt vs. count only unique events: counting attempts is simple and aligned with work done, but makes platform retries a customer cost.", "Free throttled requests vs. billed: not billing throttles is fair, but they still consume front-door capacity."],
    p: ["A retry storm multiplies the request count, and the bill, for the same logical events.", "A recursive trigger loop produces millions of billed requests in hours."],
    v: "Send known numbers of successful, failing, throttled and retried requests, and confirm the count matches the documented rules for each category in the usage report.",
    dep: ["invocation-records","throttling-and-rate-limits"]
  },
  "cost-allocation": {
    s: "Attributing usage and cost to functions, teams, tags and environments, so owners can see what each part of a system costs and what drives it.",
    d: "Usage records carry the function, version and account, and tags on the function propagate to cost reports. Teams group by tag to allocate shared accounts. Since cost is memory-time plus requests plus supporting services such as logs, networks and gateways, the largest line is often not the function itself. Reports lag actual use by hours. Allocation is a data modeling problem: untagged resources become unattributed spend that nobody owns.",
    k: ["Tag-based allocation vs. account-per-team: tags are flexible within one account, but depend on discipline, while accounts give hard boundaries and cleaner reports.", "Include the supporting services in a function's cost vs. only compute: full cost shows true economics, but needs cross-service attribution."],
    p: ["Untagged functions accumulate as unallocated cost that no team feels responsible for.", "Log ingestion cost for a chatty function exceeds its compute cost and is never noticed."],
    v: "Tag functions by team, run a known workload, and confirm the cost report by tag matches the sum of the per-function records, with an unallocated remainder equal to the untagged functions' usage.",
    dep: ["usage-aggregation","environment-config"]
  },
  "usage-aggregation": {
    s: "Rolls the stream of per-invocation records into per-account totals by period, deduplicating, reconciling with other records and producing the figures that billing and quota systems read.",
    d: "Metering records flow into a partitioned stream, are deduplicated by request identifier, and are summed in windows by function and account. A second path reconciles against host reports to detect gaps. Late arrivals are accepted for a bounded time, after which a period is closed. Outputs feed invoices, dashboards and free-tier counters. The challenge is exactness at scale: a small loss rate becomes real money, and reprocessing after a bug must not double count.",
    k: ["Exactly-once via dedupe on identifier vs. tolerate small error: dedupe gives exact bills, but needs state sized by retention window.", "Close periods after a fixed lateness bound vs. keep open: fixed bounds allow final invoices on time, but drop records that arrive later."],
    p: ["A replayed stream after an incident double counts a period unless records are deduplicated.", "Late records beyond the closing bound are lost, or require a manual credit."],
    v: "Replay a day's records twice into a test pipeline and confirm totals equal a single pass, then drop a host's records and confirm reconciliation flags the missing volume against the host's own counters.",
    dep: ["duration-metering","request-counting","regional-cells"]
  },
  "bare-metal-hosts": {
    s: "Physical servers dedicated to running sandboxes, chosen for the CPU, memory and network features virtualization needs, because nested virtualization is slower and weaker.",
    d: "Worker hosts are physical machines or instances with hardware virtualization exposed directly, large memory, fast local storage and high network bandwidth. They run no customer workloads other than sandboxes. They are provisioned in racks within zones of a cell and are treated as disposable: reimaged rather than repaired. Host types differ by processor generation and memory ratio, which affects function performance, so identical settings can yield slightly different timings on different hosts.",
    k: ["Bare metal vs. virtual machines as hosts: bare metal gives direct hardware virtualization and avoids nesting overhead, but is slower to provision and replace.", "Large uniform hosts vs. mixed types: uniform fleets simplify scheduling and capacity, while mixed fleets exploit price and availability."],
    p: ["Hosts from different processor generations give a function different run times depending on placement.", "A firmware flaw affecting a whole class of hosts forces a mass drain."],
    v: "Run a fixed CPU benchmark inside sandboxes across every host type, and confirm the spread is within the documented variance and the virtualization extensions are active on every host.",
    dep: []
  },
  "hypervisor-layer": {
    s: "The host-level virtualization facility, in the kernel plus a user-space monitor, that creates and runs the micro-VMs and enforces memory and device boundaries between them.",
    d: "The kernel's virtualization module uses hardware extensions to run guests, while a small user-space monitor provides minimal virtual devices and handles guest exits. It supports features specific to this workload: fast boot, memory snapshotting and restore, balloon-style memory reclaim, and sharing of identical pages. The monitor is the primary security boundary above the hardware, so it is small, sandboxed itself and heavily tested. Its performance sets how many guests fit per host.",
    k: ["Minimal custom monitor vs. general-purpose virtual machine monitor: minimal has a smaller attack surface and faster boot, but supports fewer guest features.", "Memory ballooning and page sharing vs. fixed allocation: they raise density, but add overhead and can be a side-channel source."],
    p: ["A bug in guest-exit handling leads to a cross-tenant escape or a host crash.", "Memory reclaim that is too aggressive stalls guests and shows as latency spikes in functions."],
    v: "Create and destroy 10,000 micro-VMs on one host under load, measuring creation latency and host memory growth, and confirm no leak and no guest could observe memory content from a previous guest.",
    dep: ["bare-metal-hosts","host-os-minimal"]
  },
  "host-os-minimal": {
    s: "A purpose-built host operating system image with only what the agent and monitors need, updated by replacing the whole image rather than patching in place.",
    d: "The image contains a kernel, the virtualization components, the agent and a few essentials, and nothing else: no shell access for people by default, no package manager, a read-only root. It is built reproducibly and rolled out by draining and reimaging hosts. A small image means fewer vulnerabilities, fewer things to patch and consistent behavior across the fleet. Security fixes in the kernel are the most urgent updates because the kernel is shared by the monitors.",
    k: ["Immutable image replacement vs. in-place patching: replacement is uniform and testable, but needs spare capacity and a drain process.", "Minimal image without debugging tools vs. a full distribution: minimal reduces attack surface, but makes live troubleshooting harder and requires remote tracing tools."],
    p: ["A kernel update that changes scheduling behavior causes a fleet-wide shift in tail latency.", "A required diagnostic tool missing from the image slows incident response."],
    v: "Boot the image and list running services, open ports and installed packages, and confirm they match the manifest exactly, with a read-only root file system and no interactive login path.",
    dep: ["bare-metal-hosts"]
  },
  "overlay-network": {
    s: "A virtual network layered over the physical datacenter network that gives each tenant's sandboxes isolated addressing, enforces segmentation, and routes between sandboxes, services and the internet.",
    d: "Sandboxes get addresses in virtual networks whose traffic is encapsulated and mapped by host-level software or network cards, so tenants cannot see or spoof each other's packets. A mapping service tracks which virtual address lives on which host and distributes it. Policies filter traffic per sandbox. The network must set up connectivity within milliseconds during sandbox creation, since it sits on the cold start path, and its mapping state must scale to millions of ephemeral endpoints that come and go.",
    k: ["Host-based encapsulation vs. dedicated network hardware: host-based is flexible and programmable, but uses host CPU, while hardware offload is fast and less flexible.", "Eager distribution of mappings vs. on-demand lookup: eager avoids lookups on the data path, but needs heavy distribution as sandboxes churn."],
    p: ["Mapping updates that lag a sandbox's creation drop its first packets or make it unreachable.", "A mapping error that sends one tenant's traffic to another's address is a serious isolation failure."],
    v: "Create thousands of sandboxes per minute across tenants and test reachability within the same virtual network, blocked reachability between tenants, and spoofed source addresses, which must be dropped and counted.",
    dep: ["bare-metal-hosts","host-os-minimal"]
  },
  "regional-cells": {
    s: "Independent, complete copies of the invocation data path, each serving a fixed subset of customers, so that overload or a bad change is contained within one cell.",
    d: "A cell has its own front-end servers, scheduler, queues, hosts and metering buffers, and shares nothing with sibling cells on the hot path. Functions are assigned to cells, and a thin routing layer in front maps requests to cells. Cells are sized so that one can fail without exhausting the region and so that they are easy to test. Changes roll out cell by cell with bake times. The costs are lower pooling efficiency and the work of rebalancing customers.",
    k: ["Cell-based architecture vs. one large pooled fleet: cells bound failures and simplify testing, but pool less capacity and complicate moving tenants.", "Static assignment of tenants to cells vs. dynamic: static is simple and keeps caches warm, but makes a hot tenant's cell a problem to solve."],
    p: ["A shared dependency outside the cell quietly couples all cells' failures.", "A large customer assigned to one small cell saturates it and has no overflow."],
    v: "Inject a failure and a bad deploy into one cell in a test region, and confirm only tenants assigned to it see errors, while other cells keep their latency and success rate and the router drains the broken cell.",
    dep: ["bare-metal-hosts","overlay-network"]
  },
  "host-draining-and-patching": {
    s: "Removing a host from service gracefully, by stopping new placements and letting sandboxes finish or be recycled, so it can be updated, repaired or retired without failing in-flight work.",
    d: "The control plane marks a host as draining, and the scheduler stops placing there. Idle sandboxes are destroyed at once, and busy ones finish their current invocation, up to a limit; then the host is reimaged and returned to the pool. Because sandbox lifetimes are short, drains complete in minutes, which allows frequent patching. Draining pushes load to the rest of the cell and creates a wave of cold starts for the functions that lived on the host.",
    k: ["Wait for in-flight work vs. interrupt at once: waiting avoids failures, but delays urgent security patches by the longest running invocation.", "Drain a few hosts at a time vs. a zone at once: slow drains limit cold start waves, but lengthen patch campaigns."],
    p: ["Draining too many hosts together removes the headroom the scheduler needs and causes throttling.", "A long-running invocation that outlasts the drain limit is killed and surfaces as a spurious error."],
    v: "Drain 10 percent of a cell's hosts under load and confirm no invocation fails that was not already past its timeout, cold start rate rises only briefly, and drained hosts return running the new image.",
    dep: ["host-agent","host-os-minimal","regional-cells"]
  },
  "tenant-isolation-model": {
    s: "The overall decision about what keeps one customer's code from affecting another's, how many mechanisms are layered, and which risks are accepted in exchange for density and speed.",
    d: "Isolation can be strong and costly, such as a VM per tenant, or fast and dense, such as isolates in one process. Most platforms combine mechanisms and decide which tenants may share hosts, sandboxes and cache lines. The decision constrains cold start time, memory overhead, supported languages and operational cost, and cannot be changed later without rebuilding the execution layer. It also sets the threat model: whether the platform assumes tenants may be hostile, and whether side channels count.",
    k: ["Hardware virtualization for every tenant vs. lighter mechanisms with extra hardening: hardware is stronger and costs memory and boot time, while lighter options are faster and rely on more software correctness.", "Share hosts across tenants vs. dedicate hosts by trust tier: sharing maximizes utilization, but dedicated tiers remove whole classes of attack for the workloads that need it."],
    p: ["An isolation mechanism chosen for speed in early prototypes becomes impossible to replace once customers depend on its quirks.", "A single-layer defense is assumed sufficient, and one vulnerability becomes a cross-tenant incident."],
    v: "Run a standing adversarial test suite, with tenants attempting escape, memory reads and side channels against neighbors on shared hosts, and confirm every attempt fails and each blocked step is recorded.",
    dep: ["micro-vm-sandbox","container-sandbox","isolate-runtime","tenant-separation"]
  },
  "latency-vs-utilization": {
    s: "The standing trade-off between holding idle, initialized capacity, which cuts cold starts and costs memory, and packing hosts tightly, which cuts cost and raises the chance a request waits for a start.",
    d: "Every design choice moves along one curve: keep-alive time, pool size, overcommit ratio, provisioned capacity, snapshot use and host headroom each buy latency with idle capacity or the reverse. The right point differs by workload and by what customers pay for. Platforms expose part of the choice, for instance provisioned concurrency, and decide the rest themselves. The decision shows up in tail latency, in cost per invocation, and in how the platform behaves in the first seconds of a surge.",
    k: ["Idle warm capacity vs. high packing: idle capacity lowers tail latency, but is unbilled cost that must be recovered in price.", "Expose the knob to customers vs. hide it: exposing lets those who need latency pay for it, but adds complexity and a way to misconfigure."],
    p: ["Optimizing average utilization removes the headroom needed for correlated bursts, and the tail latency worsens.", "Aggressive overcommit works until a coordinated event makes many sandboxes use their full memory at once."],
    v: "Plot cold start rate, p99 latency and host utilization across several policy settings on the same recorded traffic, and confirm the chosen policy sits on the intended point of the curve.",
    dep: ["warm-pool-manager","host-capacity-tracking","provisioned-concurrency"]
  },
  "delivery-guarantees": {
    s: "What the platform promises about how many times an event causes a function to run: at most once for plain synchronous calls, at least once for asynchronous and polled sources, and never exactly once.",
    d: "Retries, redelivery after timeouts and failover all create duplicates, and avoiding duplicates entirely would mean losing events whenever anything fails. The platform picks at least once for everything that is retried and puts the burden of idempotency on handlers. This one decision explains the existence of retry schedules, dead-letter queues, visibility timeouts and partial-batch responses, and explains why handler code must be written differently from code behind a request-response server.",
    k: ["At least once vs. at most once: at least once never loses accepted events but delivers duplicates, while at most once avoids duplicates but loses events on failure.", "Ordering guaranteed per shard vs. no ordering: ordering supports per-key correctness but limits parallelism and blocks on bad records."],
    p: ["Handlers written as if each event is delivered once corrupt data under the first retry.", "Out-of-order delivery is mistaken for loss, and cleanup jobs delete data that is only late."],
    v: "Inject duplicates, delays and reordering into a staging event path, and confirm every handler produces the same final state as a single in-order delivery, with duplicates visible by event identifier.",
    dep: ["retry-policy","dead-letter-queues","idempotency","async-event-queue"]
  },
  "failure-blast-radius": {
    s: "The decision to limit how many customers any one failure, deployment or overloaded component can affect, through cells, per-tenant quotas, gradual rollouts and isolation of shared dependencies.",
    d: "Because the platform is shared, a single bad change or a runaway tenant can reach everyone unless limits exist at every level. Cells bound infrastructure failures, quotas bound tenants, per-function queues bound backlog, shuffle-style assignment spreads each customer across a few of many partitions so no two customers share exactly the same ones, and staged rollouts bound bad releases. Each reduces the share of customers hurt, and the design is judged by the largest failure it permits.",
    k: ["Many small cells vs. few large pools: small cells contain failures, but pool less capacity and cost more to operate.", "Slow staged rollouts vs. fast global ones: staged rollouts catch regressions early, but delay fixes and urgent security changes."],
    p: ["A shared control-plane dependency makes every cell fail together despite the cell design.", "A quota set far above real capacity lets one tenant take the shared capacity of others."],
    v: "Run a game day that injects a bad release, a runaway tenant and a lost zone in turn, and confirm the measured affected share of customers stays under the stated limit for each.",
    dep: ["regional-cells","throttling-and-rate-limits","deploy-orchestrator","quota-service"]
  },
  "statelessness-contract": {
    s: "The decision that functions hold no durable state of their own, so that any invocation may run anywhere and any sandbox may vanish, with all memory held in external stores.",
    d: "This is the bargain that makes scale-to-zero, retries and free placement possible. It shapes handler design, the choice of data stores, the use of caches and connection pools, and the meaning of everything local such as globals and temporary files. It also pushes complexity out of the platform and into applications, which must handle consistency, idempotency and connection storms. The contract is only advisory in practice, since warm reuse makes violations seem to work until scale reveals them.",
    k: ["Stateless functions vs. functions with durable local state: stateless ones scale and recover trivially, but every state access crosses the network.", "Platform-managed state primitives vs. bring your own store: managed primitives are convenient and consistent, but add platform surface and lock-in."],
    p: ["Code that works on one warm sandbox in testing fails under concurrency because state is duplicated.", "Shared mutable state in an external store becomes the new bottleneck for the highly parallel functions."],
    v: "Run the same test workload with sandbox reuse disabled and with random sandbox kills, and confirm outputs and stored data are identical to a run with stable sandboxes.",
    dep: ["stateless-contract","external-state-stores","warm-sandbox-reuse"]
  },
  "pricing-model-effects": {
    s: "How billing by memory and duration, with a per-request fee and a free tier, shapes the platform's own design and the designs customers choose.",
    d: "Because customers pay only while code runs, the platform absorbs the cost of idle capacity, warm pools and start-up time, and so works to shorten each. For customers, waiting on a slow call costs money, so architectures avoid holding functions open, fan out events and batch records. The per-request fee makes tiny functions at very high rates expensive relative to a long-lived service. Pricing therefore pushes toward event-driven designs and away from always-on and chatty ones, and it creates cost risks such as recursive triggers.",
    k: ["Pay per use vs. reserved capacity: pay per use is cheap for spiky or idle workloads, but costs more than reserved capacity for steady high volume.", "Bill initialization vs. not: billing init discourages heavy start-up work and aligns cost with resource use, but makes cold starts a charge as well as latency."],
    p: ["A steady, high-volume workload costs several times more than the same code on reserved servers.", "A runaway loop between a function and its trigger creates a very large bill before anyone notices."],
    v: "Model the monthly cost of a recorded workload at per-use and reserved prices, and confirm the break-even point predicted by the model matches billing for the same workload run at both rates.",
    dep: ["memory-time-pricing","request-counting","duration-metering"]
  },
});
