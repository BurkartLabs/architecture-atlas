// Details for the serverless platform plate, part 1: packaging, versions and configuration, observability.
ATLAS.details("serverless-platform", {
  "function-package": {
    s: "The archive a developer uploads: handler code, bundled dependencies and a manifest naming the runtime, entry point and size settings. It is the unit the platform stores, versions and starts.",
    d: "The package is a compressed archive with a handler reference such as a file and function name, plus a declared runtime. The platform unpacks it on the worker, loads the runtime and calls the handler once per event. Size limits apply to both compressed and unpacked forms because unpacking and loading cost start-up time. The difficulty is that package contents decide cold start cost: a large dependency tree, native binaries built for the wrong platform, or files that are only read at init all move latency from the developer's laptop to every first request.",
    k: ["Zip-style archive vs. full container image: archives are small and fast to fetch but constrain what can be installed; images allow anything at the cost of larger fetches.", "Bundle dependencies into the package vs. resolve at start-up: bundling makes starts deterministic and offline, but every release re-uploads the whole tree."],
    p: ["A package built on a developer machine with a different operating system or CPU family fails only after deployment, with an unhelpful load error.", "Unused dependencies inflate the package, adding fetch and init time to every cold start."],
    v: "Deploy the package, invoke it from a fresh account region with no warm sandboxes, and confirm the handler returns the expected output and the init duration in the invocation record matches the size of what was loaded.",
    dep: ["package-store"]
  },
  "dependency-layers": {
    s: "Shared bundles of libraries or runtimes that many functions reference by version instead of each copying them into its own package.",
    d: "A layer is an immutable archive published once and attached to functions by version reference. At sandbox creation the worker fetches the function package and each layer and overlays them into one file tree, with a fixed precedence when paths collide. Layers cut upload size and let a security patch roll out by publishing a new layer version. They do not reduce the total bytes loaded at start-up, and they make the package's true content depend on several separately versioned objects, which complicates reproducing a failure.",
    k: ["Shared layer vs. vendored copy: one place to patch and smaller uploads, but a layer update changes behavior only when each function is re-published against it.", "Fixed layer count and size cap vs. unbounded stacking: keeps start-up predictable, but forces teams to merge unrelated libraries into one layer."],
    p: ["Two layers that both provide the same path silently shadow each other, so the wrong library version is loaded.", "Cross-account layer sharing breaks when the owner deletes a version that consumers still reference."],
    v: "Publish a layer, attach it to two functions, print the resolved file listing inside each at runtime, and confirm the layer files are present and a path collision resolves in the documented order.",
    dep: ["function-package","package-store","immutable-versions"]
  },
  "container-image-functions": {
    s: "Functions delivered as container images, letting teams reuse existing build tooling and ship larger dependency sets than archives allow, with a runtime interface client inside the image.",
    d: "The developer builds an image that includes a client implementing the runtime protocol, and pushes it to a registry. The platform copies and indexes it into its own store, then at start-up mounts it as the sandbox root file system. Because images can reach gigabytes, the platform cannot fetch them whole on the start path; it reads blocks on demand and caches them on hosts. The hard parts are keeping the image-to-sandbox translation fast and ensuring that an image's contents, not only its tag, are what runs.",
    k: ["Platform-managed copy of the image vs. pulling from the customer registry at start: a private copy avoids registry outages and rate limits, but adds a publish delay and storage cost.", "Standard container layers vs. a custom flattened format: flat formats stream faster, but lose the sharing that layer caches give common base images."],
    p: ["A mutable tag deployed once and then re-pushed leaves versions pointing at changed content unless the platform pins the digest.", "Large images with heavy init code make cold starts seconds long even when block loading is fast."],
    v: "Publish an image-based function, invoke it from a cold state, and confirm the init duration is far below the time to download the whole image, showing blocks were loaded on demand.",
    dep: ["package-store","lazy-image-loading","sandbox-lifecycle"]
  },
  "package-store": {
    s: "Durable, content-addressed storage of every uploaded package and layer, replicated within the region and readable by worker hosts at high rate.",
    d: "On upload the platform computes a content hash, writes the object to regional storage, and records the digest in function metadata. Workers read by digest, which makes objects immutable and caches safe. Regional replicas and per-host or per-rack caches shield the store from fleet-wide fetch bursts after a popular function scales out. The hard part is read amplification: a function that scales from zero to a thousand sandboxes triggers a thousand fetches of one object, so the system needs tiered caches rather than one origin.",
    k: ["Content-addressed objects vs. name-addressed objects: digests make caching and integrity checks trivial, but need a separate index to find the current version by name.", "Per-region store vs. replicated everywhere: regional storage is simpler and cheaper, while multi-region functions need an explicit replication step."],
    p: ["A cache layer that evicts too eagerly turns every scale-out into a thundering herd on the origin.", "Deleting an object that an old version still references makes that version unrunnable."],
    v: "Force 500 simultaneous cold starts of one function and confirm the origin store serves a small number of reads while the rest come from rack or host caches, and every sandbox sees an identical digest.",
    dep: []
  },
  "package-validation": {
    s: "Checks run at publish time, before a version is accepted: size and format limits, handler resolution, malware and vulnerability scanning, and sometimes a trial load of the code.",
    d: "The upload path rejects archives that are malformed, too large, or that contain unsafe paths. Optional stages scan dependencies against vulnerability databases and check the signature of the publisher. Some platforms perform a trial initialization in a sandbox to catch missing handlers early. Each added check lengthens publish time and can produce false rejects. The difficulty is catching what is cheap to catch at upload without making deployment slow, since deploys are frequent and gate every release.",
    k: ["Strict gate at publish vs. lenient publish with later warnings: strict catches errors before users see them, but blocks urgent fixes on scanner false positives.", "Trial load at publish vs. first invocation: finding errors early is a better experience, but it executes untrusted code in the control path."],
    p: ["A path-traversal entry in an archive writes outside the intended directory when unpacked on a host.", "A scan that only runs at publish never flags a vulnerability disclosed a month later in an already deployed version."],
    v: "Upload an archive with an entry named to escape its directory and one with a missing handler, and confirm both are rejected with distinct errors and no new version number is consumed.",
    dep: ["function-package","function-metadata-store"]
  },
  "local-emulation": {
    s: "Tooling that runs the same runtime image and event shapes on a developer machine so handlers can be tested and debugged without deploying.",
    d: "An emulator starts the real runtime interface in a container or process, feeds it sample events from files, and exposes the same local endpoints as the platform's Runtime API. It can also simulate trigger payloads for queues, storage events and HTTP calls. It cannot reproduce the real limits, identity, network paths or cold start behavior. Its value depends on how faithfully the event formats and runtime protocol are kept in sync with the service, which is why platforms publish both from one source.",
    k: ["Real runtime image locally vs. a lightweight mock: the image catches environment differences, but is heavy to start and still lacks real permissions and networking.", "Emulating the whole service vs. only the invocation: full emulation is tempting, but diverges from the service in edge cases and gives false confidence."],
    p: ["A handler that passes locally fails in production because the real execution role denies a call the local credentials allowed.", "Sample events captured years ago lack fields that newer trigger versions add."],
    v: "Run the same event file locally and in the deployed function and compare the outputs. They match, and any difference is explained by a documented limit such as role, network or memory.",
    dep: ["runtime-api","function-package"]
  },
  "immutable-versions": {
    s: "Publishing freezes code and configuration into a numbered version that never changes, so the exact thing that was tested is the thing that runs.",
    d: "Each publish copies the current code digest, runtime, memory size and environment settings into a new version record. Versions are never edited, only created or deleted. The unpublished, mutable head is the version developers update. Invocations name a version either directly or through an alias. Immutability makes caching, rollback and audit straightforward, but it means configuration that changes often, such as feature settings, must live somewhere outside the version or each change spawns a release.",
    k: ["Freeze configuration with code vs. keep it mutable: frozen settings make rollback complete, but force a release for every setting change.", "Unlimited retained versions vs. a cap with pruning: retention preserves audit and rollback, but accumulates storage and old vulnerable code."],
    p: ["Treating the unpublished head as production means one deploy changes live behavior with no rollback target.", "Deleting an old version that an alias or event source still points to turns working triggers into errors."],
    v: "Publish version 7, edit the head, and confirm invoking version 7 still returns the old behavior while its code digest and settings match the values recorded at publish.",
    dep: ["function-metadata-store","package-store"]
  },
  "aliases-and-traffic-shifting": {
    s: "Named, movable pointers to versions, optionally splitting traffic between two versions by weight to enable gradual rollout and instant rollback.",
    d: "An alias such as production maps to one version, or two with weights. Triggers and callers reference the alias, and the platform resolves it per invocation. A rollout gradually raises the weight of the new version while alarms watch error rates, and a rollback sets the weight back. Resolution must be fast and consistent across front-door servers. The hard part is that weighted routing is probabilistic per request, so a single user may see both versions, and an update takes time to reach every routing node.",
    k: ["Weighted random routing vs. sticky routing by key: random is simple and balanced, but a user can alternate versions within one session.", "Automated rollback on alarms vs. human approval: automation limits damage fast, but a noisy alarm can abort healthy releases."],
    p: ["Both versions write to the same schema, so a rollback after partial traffic shift leaves data the old code cannot read.", "An alias update propagating unevenly means some front-door servers send traffic to the old target for seconds after the change."],
    v: "Set 10 percent weight to version 8, send 1,000 requests, and confirm roughly 100 report version 8 in their invocation records. Then reset the weight to zero and confirm none do within the stated propagation time.",
    dep: ["immutable-versions","version-resolver","routing-table"]
  },
  "environment-config": {
    s: "Key-value settings attached to a version and injected into the process as environment variables at sandbox start, for values that are not secret and change per environment.",
    d: "Settings are stored with the version and passed to the runtime when the sandbox is created, so they are readable before the handler runs. Size limits keep the injected block small. Because values are frozen in a version, the same code runs in different environments by publishing differently configured versions. Values are sometimes encrypted at rest and decrypted at injection. The pitfall is scope: anything in the environment is visible to all code in the process, including libraries, and is often captured by crash dumps and debug logs.",
    k: ["Environment variables vs. fetching config at runtime: variables are free and available at init, but changing them requires a new sandbox, while runtime fetch costs a call and a failure mode.", "Per-version values vs. per-alias values: per-version is simple and reproducible, but alias-level settings let one version serve several stages."],
    p: ["Printing the whole environment in a debug statement writes every setting to logs that many people can read.", "Changing a setting appears to do nothing because warm sandboxes keep running with the old values."],
    v: "Change a setting, publish, and confirm new sandboxes report the new value while the invocation record shows warm sandboxes of the old version are not reused for the new one.",
    dep: ["immutable-versions","sandbox-lifecycle"]
  },
  "secrets-injection": {
    s: "Delivery of credentials and keys to running functions from a managed secret store, with access controlled by the function's role and values cached to avoid per-request lookups.",
    d: "Rather than baking secrets into packages or environment variables, functions fetch them at init or on first use from a secret manager through an authenticated call, often via a local caching extension. The call is authorized by the execution role. Values are cached for a time to limit latency and cost, which makes rotation lag by the cache lifetime. The difficulty is the trade-off between secret exposure and added dependency: every cold start adds a network round trip and a new way to fail.",
    k: ["Fetch at init vs. fetch per use: init-time fetch is fast afterward but misses rotation until the sandbox is recycled, while per-use fetch is always fresh and slower.", "Platform-injected secrets vs. application fetch: injection hides the fetch from code, but a change in the secret value cannot reach running sandboxes."],
    p: ["A secret fetched during init that fails makes every cold start fail, turning a secret-store outage into a function outage.", "Logging a fetched connection string copies the secret into a log store with broader access."],
    v: "Rotate a secret, wait past the cache lifetime, invoke the function, and confirm the new value is used. Then revoke the role's access and confirm the fetch is denied and logged.",
    dep: ["execution-role","init-phase"]
  },
  "resource-sizing": {
    s: "The memory setting that also determines CPU share, network bandwidth and price for a function, chosen by the owner and enforced by the sandbox.",
    d: "The owner picks a memory size; the platform allocates CPU, network and sometimes ephemeral disk proportionally. Sandboxes are placed on hosts by memory footprint, and the cgroup or VM limit kills processes that exceed it. Because CPU scales with memory, a larger setting can make a function faster enough to cost the same or less per call. Choosing the right size requires measuring peak memory and duration at several settings, which is why some platforms offer a tuning tool that runs the function at many sizes.",
    k: ["One knob controlling memory, CPU and network vs. separate knobs: one knob is easy to explain, but forces payment for memory when only CPU is needed.", "Hard memory cap with out-of-memory kill vs. soft limits with swapping: a hard cap is predictable and safe, but fails abruptly in the middle of a request."],
    p: ["Setting memory by guess leaves a CPU-bound function slow and paying more in total than at a higher setting.", "A memory spike on one large payload kills the sandbox and all concurrent state it held."],
    v: "Run the same workload at three memory sizes and record duration and billed cost for each. Confirm the invocation record's max memory used is below the limit with a margin at the chosen size.",
    dep: ["resource-limits","host-capacity-tracking"]
  },
  "execution-role": {
    s: "The identity a function assumes while running. Short-lived credentials for it are delivered to the sandbox so code can call other services under limited, auditable permissions.",
    d: "Each function is bound to a role defining what it may do. At invocation the platform obtains temporary credentials for that role from the identity service and gives them to the runtime, usually as environment values refreshed before expiry. Calls the function makes are signed with them and authorized by the target service. The challenge is least privilege: roles are broad by habit, and the credentials sit in the process memory of code that may include compromised dependencies.",
    k: ["Per-function role vs. shared role per application: per-function limits blast radius, but multiplies policies to maintain.", "Short-lived credentials refreshed by the platform vs. long-lived keys: short-lived credentials limit theft, but add a dependency on the identity service in the start path."],
    p: ["A wildcard permission copied into a role lets an injected dependency read unrelated data stores.", "Credentials cached past expiry in a warm sandbox cause sudden denied calls in the middle of a long-lived reuse."],
    v: "Inspect the function's calls to another service in audit logs, confirm they are attributed to the role, and confirm an action outside the role's policy is denied with a clear error.",
    dep: ["host-agent","secrets-injection"]
  },
  "resource-policies": {
    s: "Rules attached to the function itself that say which accounts, services or event sources may invoke it, separate from what the function may do.",
    d: "A resource policy lists principals allowed to call the invoke action, optionally restricted by source identifier, such as one specific queue or one API. The front door evaluates it with the caller's identity before accepting the request. Event sources registered by the platform get entries added automatically. The hard part is cross-account and confused-deputy cases: a service allowed to invoke on anyone's behalf must be restricted to the owner's own resource, or any customer of that service could trigger the function.",
    k: ["Resource-based allow vs. caller-identity-only: resource policies enable cross-account and service triggers without altering caller roles, but give two places where access can be granted or denied.", "Source-scoped conditions vs. broad service allow: scoping prevents confused deputy abuse, at the cost of one policy statement per trigger."],
    p: ["Allowing a service principal without a source condition lets other customers of that service invoke the function.", "A deleted trigger leaves a policy statement behind that still grants access."],
    v: "From a second account, attempt to invoke the function with and without a granted statement and confirm the first is denied and logged, and the second succeeds only for the named source.",
    dep: ["request-authentication","function-metadata-store"]
  },
  "log-capture": {
    s: "Collection of whatever the function writes to standard output and error, plus platform lines marking start, end and report, into a stream that survives the sandbox.",
    d: "The worker agent attaches to the runtime's output, tags each line with function, version and request identifier, and ships it onward in small batches. Because sandboxes are frozen between requests, lines written during a request must be flushed before the freeze, or they appear on the next thaw out of order. The difficulty is volume and loss: a chatty function can exceed the log pipeline's rate, and logs from a sandbox killed by timeout or out-of-memory may be cut off mid-line.",
    k: ["Capture stdout and stderr vs. a structured logging API: capturing works with any code, but lacks levels and fields unless the application formats them itself.", "Synchronous flush at request end vs. asynchronous shipping: synchronous keeps logs complete, but adds latency to each invocation."],
    p: ["Output buffered inside the runtime when a sandbox is frozen shows up minutes later attached to a different request.", "A function that logs entire payloads can exceed pipeline limits and drop lines silently."],
    v: "Invoke a function that logs a unique token, then confirm the token appears with the right request identifier, and kill a sandbox by timeout and verify the lines written before the kill are present.",
    dep: ["host-agent","freeze-and-thaw"]
  },
  "log-delivery-pipeline": {
    s: "The path logs take from the host to searchable storage: buffering, batching, regional ingestion, indexing and retention, with delay and loss behavior defined.",
    d: "Host agents batch log records and send them to regional ingestion endpoints, which write to partitioned storage and optionally index them for search or forward to subscribers. Delivery is at-least-once with some tolerated lag, so records can arrive late or duplicated. Retention settings control cost. The challenge is isolating tenants in shared ingestion, and keeping the pipeline from back-pressuring the hosts: it must drop or sample before it slows invocations.",
    k: ["Drop logs under pressure vs. block the function: dropping protects invocation latency, but loses exactly the records needed during an incident.", "Per-tenant ingestion quotas vs. shared capacity: quotas stop one noisy function from starving others, but may throttle a legitimate burst."],
    p: ["Search results lag by tens of seconds, so someone concludes an invocation never logged anything.", "Retention set to never expire silently becomes the largest line in the bill."],
    v: "Emit 10,000 log lines from many concurrent sandboxes, then count them in the log store. The count equals the number emitted within the stated delay or the shortfall is reported as dropped.",
    dep: ["log-capture","regional-cells"]
  },
  "metrics-emission": {
    s: "Counters and timers produced by the platform for every function, such as invocations, errors, duration, throttles and concurrency, plus custom values emitted by code.",
    d: "The platform records standard metrics at the front door and worker, aggregates them per function and version over fixed windows, and publishes them to a metrics service. Custom metrics can be embedded in log lines in a defined format and extracted asynchronously, avoiding a network call from the handler. Aggregation hides detail: a one-minute average duration conceals a long tail, so percentiles and maxima are provided too. High cardinality, such as a metric per user, is limited because it multiplies storage.",
    k: ["Log-embedded custom metrics vs. direct API calls: embedding adds no latency or failure path to the handler, but arrives later and costs log volume.", "Pre-aggregated windows vs. raw per-invocation data: aggregates are cheap to query, but cannot answer questions about one request."],
    p: ["Alarming on average duration misses a tail that is hurting a tenth of users.", "A dimension with unbounded values, such as request identifier, explodes metric count and cost."],
    v: "Send a known number of failing and succeeding invocations, then confirm the invocation and error metrics reach the expected counts within the stated window and the duration maximum reflects the slowest call.",
    dep: ["invocation-records","usage-aggregation"]
  },
  "trace-propagation": {
    s: "Carrying a trace identifier from the caller through the platform into the function and out to its downstream calls so a request can be followed across services.",
    d: "The front door accepts or generates a trace context and places it in the invocation event or environment. The runtime exposes it to code, and tracing libraries attach it to outbound calls. The platform itself emits segments for its own phases, such as queueing, init and handler time, so latency splits into parts the developer cannot see otherwise. Sampling decides what is stored. The hard part is asynchronous links: a queue between producer and function breaks the parent-child chain unless the context travels in message attributes.",
    k: ["Platform-created root segments vs. only code-created: platform segments expose cold start and queue time, but add overhead and collector load.", "Head sampling at the entry vs. tail sampling after the fact: head sampling is cheap and simple, but misses the rare slow trace that was not selected."],
    p: ["A queue hop without context propagation produces two disconnected traces for one logical request.", "Sampling at a low rate hides a failure that affects only a small percentage of calls."],
    v: "Make one request through a gateway, a function and a downstream call, then fetch the trace and confirm it contains platform init time, handler time and the downstream call under one identifier.",
    dep: ["invoke-api","runtime-api"]
  },
  "invocation-records": {
    s: "A per-invocation summary written by the platform: request identifier, version, duration, billed duration, memory used, init time and outcome. It is the ground truth for debugging and billing.",
    d: "At the end of each invocation the worker agent emits a report line with measured values and whether the sandbox was a cold start. The same data feeds metering, metrics and sometimes a queryable event stream. Because it is generated outside the handler, it still exists when the handler crashes or times out. The difficulty is volume: one record for every invocation means billions per day, so the pipeline must be cheap, and consistent with what the customer is billed.",
    k: ["One record per invocation vs. sampled records: complete records support billing and audit, but multiply storage and ingestion cost.", "Records emitted by the host agent vs. by the runtime: the agent still reports on a crash, but sees only coarse resource figures."],
    p: ["Billed duration is rounded up, so a reader comparing it with measured duration thinks the platform is overcharging.", "A record lost with a crashed host leaves an invocation that was run but never billed or logged."],
    v: "Run an invocation that times out and one that succeeds, and confirm both have records with a request identifier, duration and an init duration present only for the cold one.",
    dep: ["host-agent","duration-metering"]
  },
  "alarms-and-alerts": {
    s: "Threshold and anomaly rules over function metrics that notify people or trigger automation, such as halting a rollout, when errors, latency or throttles cross a limit.",
    d: "An alarm evaluates a metric statistic over a number of periods, such as error rate over three minutes, and changes state when a condition holds. State changes call a notification target or an automation, including a deployment controller that halts or reverses a traffic shift. Good alarms combine error rate with traffic so a quiet function does not alarm on one failure. The challenge is delay: aggregation windows and evaluation periods mean detection lags the failure by minutes.",
    k: ["Short evaluation windows vs. long: short windows detect quickly but flap on noise, while long ones are stable but let a bad release run longer.", "Static thresholds vs. anomaly bands: static is easy to reason about, but needs retuning as traffic changes."],
    p: ["Alarming on invocation count of zero treats a legitimately idle function as an outage.", "Missing data is treated as healthy, so a function that stops being invoked at all raises no alert."],
    v: "Inject a fault that fails every request, and confirm the alarm enters its alert state within the configured periods, notifies the target, and halts a weighted rollout in progress.",
    dep: ["metrics-emission","aliases-and-traffic-shifting"]
  },
});
