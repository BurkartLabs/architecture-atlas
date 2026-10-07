// Details for the container runtime plate, part 2: registry and trust, container management, shim.
ATLAS.details("container-runtime", {
  "registry-client": {
    s: "The component that speaks the registry's HTTP protocol: resolving tags, fetching manifests and blobs, uploading content and following redirects to storage backends.",
    d: "It resolves a short name to a registry host, a repository and a tag or digest, then issues requests for manifests and blobs. Blob downloads support ranges so interrupted transfers resume, and registries often redirect to a separate storage or content-delivery host. It retries with backoff, honors rate-limit responses and negotiates authentication challenges. It is hard because the network is hostile and flaky: it must verify every byte, bound response sizes, and cope with registries that implement the protocol slightly differently.",
    k: ["Short names resolved through a search list vs fully qualified names only: search lists are convenient, but let an unexpected registry answer for a familiar name.", "Aggressive retries vs fail fast: retries hide transient errors, but amplify load on a registry that is already throttling."],
    p: ["An unqualified image name resolves to a different registry than intended, pulling an attacker's look-alike image.", "A redirect to a storage host is blocked by a firewall, so manifests load but every blob fails."],
    v: "Pull an image through a proxy that logs requests and confirm one manifest request, then ranged blob requests. Block the storage redirect host and confirm the error names the failing blob.",
    dep: ["registry-auth", "content-addressing"]
  },
  "pull-pipeline": {
    s: "Fetches a manifest, downloads missing layers concurrently, verifies each digest, and hands the blobs to the unpacker, skipping what the store already holds.",
    d: "Resolution turns a name into a manifest digest, selecting a platform variant if the reference is an index. The pipeline then checks the content store for each config and layer digest and downloads only the absent ones, in parallel up to a limit. Each blob is hashed as it streams to disk and committed only if the digest matches. Unpacking can overlap with downloads, layer by layer in order. It is hard because progress, cancelation and partial failure must leave no half-written content visible.",
    k: ["Parallel layer download vs sequential: parallel pulls use bandwidth better, but unpacking must still be ordered, so memory or disk holds waiting layers.", "Verify while streaming vs after completion: streaming avoids a second read, but must discard partial data cleanly on mismatch."],
    p: ["Two concurrent pulls of the same layer download it twice because they do not coordinate on the digest.", "A killed pull leaves a partial blob that a later pull trusts without verification."],
    v: "Pull an image, then pull a second image sharing its base and confirm the shared layers are not downloaded again. Kill a pull midway and confirm the next pull completes and verifies.",
    dep: ["registry-client", "content-store", "layer-unpack", "image-manifest"]
  },
  "push-pipeline": {
    s: "Uploads an image to a registry: checks which blobs the registry already has, uploads only the missing ones, then publishes the manifest last.",
    d: "For each layer and the config, the client asks whether the registry holds the digest. Missing blobs are uploaded in chunks or monolithically, and a layer already present in another repository can be mounted by reference without any data transfer. The manifest is uploaded last, because a manifest pointing at absent blobs would be invalid. It is hard because uploads are long and partial uploads must resume, and because compressing layers on the fly can change digests relative to what was stored locally.",
    k: ["Cross-repository blob mounting vs uploading again: mounting saves bandwidth, but requires the pusher to have read access to the source repository.", "Manifest uploaded last vs first: last guarantees every reference resolves, but a crash in between leaves orphaned blobs for registry cleanup."],
    p: ["Compressing at push time yields a new digest from the local one, so the pushed image no longer matches its signature.", "Pushing a tag overwrites a production tag because tags are mutable and the client does not warn."],
    v: "Push an image to an empty repository and confirm blobs arrive before the manifest in the registry log. Push it again and confirm no blob data is uploaded.",
    dep: ["registry-client", "content-store", "image-manifest"]
  },
  "registry-auth": {
    s: "Obtains and presents credentials to a registry: reads stored logins, answers token challenges, and scopes tokens to the repositories and actions requested.",
    d: "On a first unauthorized response the registry replies with a challenge naming a token service and a scope. The client requests a short-lived bearer token from that service using stored credentials, then retries. Credentials come from a configuration file or an external helper program that reads an operating-system or cloud credential store. Tokens are cached until expiry. It is hard because credentials are long-lived secrets on disk, and scopes differ between pull and push, so a token that works for one fails for the other.",
    k: ["Credential helper programs vs plain files: helpers keep secrets in a protected store, while files are simple but readable by anything running as the user.", "Short-lived scoped tokens vs long-lived credentials sent every request: scoped tokens limit leaks, at the price of an extra round trip per scope."],
    p: ["A plain-text credential file in a home directory is baked into an image or leaked in a bug report.", "A token scoped for pull is reused for push and fails with a confusing denied error."],
    v: "Pull a private image with a valid login and confirm success. Remove the login and confirm an authentication failure that names the registry, not a generic not-found.",
    dep: []
  },
  "mirrors-and-proxies": {
    s: "Local or regional registries that cache images pulled from upstream, so repeated pulls stay on the local network and survive upstream rate limits or outages.",
    d: "The runtime is configured so that requests for an upstream registry are first sent to a mirror. A pull-through cache fetches from upstream on a miss, stores the content and serves later requests locally. Mirrors can be restricted to pull only and often keep their own garbage collection. Digests make caching safe, since the content is verified end to end, while tag resolution still needs fresh upstream answers. It is hard because a stale tag answer from a mirror serves old content, and an outage of the mirror must fall back correctly.",
    k: ["Mirror consulted first with upstream fallback vs mirror only: fallback keeps pulls working, while mirror-only enforces that nothing unvetted enters the environment.", "Caching tag resolutions vs always resolving upstream: cached tags are fast and available, but can serve outdated content for mutable tags."],
    p: ["A mirror caches a tag once and keeps serving a vulnerable image long after upstream replaced it.", "The mirror is down and clients wait for long timeouts before falling back, stalling every start."],
    v: "Pull an image twice through the mirror and confirm the second pull produces no upstream requests in the mirror log. Disable the mirror and confirm fallback to upstream within the configured timeout.",
    dep: ["registry-client"]
  },
  "signature-artifacts": {
    s: "Signatures stored as separate objects in the registry, linked to the image digest they vouch for, so signing never changes the image itself.",
    d: "A signature is a small artifact whose subject field names the signed manifest digest. Registries list artifacts that refer to a subject, so tools can discover signatures, attestations and bundles for a digest. The signature covers the digest, not a tag. Keys may be long-lived and held by the publisher, or short-lived and issued after an identity check, with a public transparency log recording the signing event. It is hard because signing proves who vouched for a digest, not that the content is safe or that the signer is the right party.",
    k: ["Detached signature artifacts vs signatures embedded in the image: detached signing leaves the digest unchanged and allows many signers, but needs registry support for linking.", "Long-lived signing keys vs short-lived identity-bound certificates: long-lived keys are simple but a leak is catastrophic, while short-lived certificates need an identity service and a log."],
    p: ["A signature is attached to a tag name in tooling and not to the digest, so a moved tag appears signed.", "The signing key is stored in the CI system and a compromised pipeline signs malicious images."],
    v: "Sign an image, list artifacts referring to its digest and confirm the signature appears. Push a different image under the same tag and confirm it has no signature artifact.",
    dep: ["image-index", "content-addressing"]
  },
  "signature-verification": {
    s: "The policy engine that decides, at pull or run time, whether an image has valid signatures from acceptable identities, and rejects it otherwise.",
    d: "A policy lists registries or repositories and the signers or key sets each must have. On pull, the verifier resolves the tag to a digest, finds signature artifacts, checks cryptographic validity and the signer's identity against policy, and only then allows the content to be unpacked or started. Verification can happen in the client, in the runtime or in an admission step in the cluster. It is hard because the check must bind to the digest actually run, not a tag resolved twice, and policy gaps default to allowed.",
    k: ["Verify at pull in the runtime vs at admission in the orchestrator: runtime checks cover every pull path, while admission checks centralize policy but miss images already present.", "Default deny vs default allow for unmatched images: deny is safer but breaks anything not yet signed, so rollout needs a staged audit mode."],
    p: ["The policy verifies the tag at admission, then the runtime pulls the tag again and gets a different digest.", "An unsigned image already cached on the host runs because verification happens only on pull."],
    v: "Configure a policy requiring a specific signer, then pull one signed and one unsigned image. Confirm the unsigned pull is rejected with a policy error and nothing is added to the store.",
    dep: ["signature-artifacts", "pull-pipeline"]
  },
  "attestations": {
    s: "Signed statements attached to an image digest that describe how it was built and what it contains, such as a software bill of materials and build provenance.",
    d: "An attestation is a signed envelope holding a predicate about a subject digest: the list of packages inside, the source revision and builder identity, or vulnerability scan results. The builder generates them during the build and stores them next to the image in the registry. Policies can require, for example, that provenance names a trusted builder. It is hard because the statements are only as truthful as their producer: a builder that can be influenced by the recipe may attest to something false.",
    k: ["Builder-generated attestations vs separately scanned reports: builder output is precise about inputs, while an independent scan is not under the author's control.", "Attach to the image index vs to each platform manifest: attaching to the index covers all platforms at once, but per-platform contents may differ."],
    p: ["A bill of materials generated from the recipe rather than the final filesystem omits packages added at run time of the build.", "Policy checks that an attestation exists but not who signed it, so any signer satisfies it."],
    v: "Build with attestations enabled, then list the artifacts for the digest and confirm a bill of materials and a provenance statement exist. Verify the provenance names the expected source revision.",
    dep: ["signature-artifacts", "build-graph-solver"]
  },
  "container-model": {
    s: "The runtime's record of what a container is: its image, configuration, mounts, networks, resource settings, labels and current state, kept separate from the process itself.",
    d: "A container object ties together a snapshot for the root filesystem, the merged runtime spec, networking choices, log settings and user-level metadata such as name and labels. Creating one allocates identifiers and storage but starts no process. The object outlives the process: after exit it remains inspectable until deleted. It is hard because there are two owners of truth, the record in the runtime and the process in the kernel, and they can disagree after a crash or a forced kill.",
    k: ["Container as a persisted object vs as a running process only: persistence allows inspect, logs and restart after exit, but creates records that need cleanup.", "Unique generated id with optional names vs name as identity: ids avoid collisions, while names are what people use and need uniqueness checks."],
    p: ["Stopped containers accumulate with their writable layers and consume disk until someone prunes them.", "A name collision on retry causes create to fail and the caller assumes the first attempt did not happen."],
    v: "Create a container without starting it and confirm inspect shows state created, an assigned snapshot and mounts, and that no process with the container's namespaces exists on the host.",
    dep: ["state-store", "metadata-store", "snapshotter", "runtime-spec"]
  },
  "container-lifecycle": {
    s: "The state machine of create, start, pause, resume, stop, kill and delete, with rules for which transitions are legal and what each does to the process and its resources.",
    d: "Create prepares the root filesystem, spec and namespaces but holds the user process before its program starts. Start releases it. Pause freezes all processes using the control group freezer, resume thaws them. Stop sends a termination signal, waits a grace period, then sends a kill. Delete removes the record, snapshot and runtime state, and only works on a stopped container. It is hard because every step can fail midway and the runtime must leave a state from which delete always works.",
    k: ["Separate create and start steps vs a single run: separation allows setup such as network wiring between them, but adds a state to track.", "Graceful stop with timeout then kill vs immediate kill: graceful stop lets programs flush data, but a stubborn program delays shutdown by the whole timeout."],
    p: ["Delete fails because a mount is still busy, leaving a stopped container whose resources cannot be removed.", "Pause freezes a process while it holds a lock the daemon also needs, hanging unrelated operations."],
    v: "Walk one container through create, start, pause, resume, stop and delete, checking after each step that inspect state and the host process list agree, and that delete leaves no mounts or snapshot.",
    dep: ["container-model", "runtime-command-contract", "runtime-shim", "cgroup-hierarchy"]
  },
  "state-store": {
    s: "Durable storage of container records so the runtime can restart and rediscover what it was managing, and reconcile with what the kernel says is running.",
    d: "Records are kept in an embedded transactional database or as files in a per-container directory, containing configuration, state and the identifiers needed to find the shim and the low-level runtime's own state. On start, the runtime loads records and probes each recorded process to see whether it is still alive, reattaching or marking it exited. It is hard because writes straddle crashes: a state change recorded before the process is created, or after it dies, leaves a lie that recovery must detect.",
    k: ["Embedded transactional store vs plain files per container: transactions give atomic updates and queries, while files are easy to inspect and repair by hand.", "Record intent before acting vs record result after: recording intent allows cleanup of half-done work, while recording results risks forgetting a created resource."],
    p: ["A crash between creating a process and recording it orphans a running container the runtime no longer knows.", "Restoring records onto a different data root with stale pids reports dead containers as running."],
    v: "Start containers, kill the runtime process with a hard signal, restart it, and confirm each container is rediscovered with the correct state and the same process ids.",
    dep: []
  },
  "restart-policy": {
    s: "A per-container rule telling the runtime whether and how to start a container again after it exits or the host boots: never, on failure, unless stopped, or always.",
    d: "When the supervised process exits, the runtime evaluates the policy against the exit code and whether the user stopped it deliberately. If a restart applies, it waits with an increasing delay, up to a cap, and recreates the process from the same container record. On boot, the runtime starts containers whose policy requires it. It is hard because a crash loop must not consume the host, a manual stop must not be undone, and the delay counter must reset only after the container has been healthy for a while.",
    k: ["Runtime-level restart vs leaving restarts to an orchestrator: runtime restart is simple and local, while an orchestrator can reschedule on another host when the host is the problem.", "Exponential backoff with a cap vs fixed delay: backoff protects dependencies from storms, but delays recovery after a one-off failure."],
    p: ["A container that fails instantly restarts in a tight loop and fills logs and the disk.", "A container stopped by the user restarts after the daemon is restarted because the policy ignored the stop intent."],
    v: "Run a container that exits with an error under an on-failure policy and confirm the restart count rises with growing delays. Stop it manually and confirm it stays stopped after a runtime restart.",
    dep: ["container-lifecycle", "exit-reporting"]
  },
  "health-checks": {
    s: "A periodic command run inside a container that reports healthy or unhealthy, so the runtime and orchestrators can tell a started process from a working one.",
    d: "The container definition gives a probe command, an interval, a timeout, a start grace period and a retry count. The runtime executes the probe through the exec mechanism on the schedule and records the exit code. After enough consecutive failures the status changes to unhealthy and an event is emitted. The runtime itself usually does not act on it beyond reporting. It is hard because the probe consumes resources inside the container's limits, and a slow probe can overlap or be killed.",
    k: ["Probe inside the container vs probe from outside over the network: inside probes see local state with no network exposure, while outside probes test what clients actually reach.", "Strict thresholds vs tolerant thresholds: strict thresholds detect failure quickly but flap on brief load, while tolerant ones react slowly."],
    p: ["The probe command is missing from a minimal image, so the container is permanently unhealthy.", "A probe that runs longer than its interval piles up processes inside a container near its process limit."],
    v: "Start a container whose probe fails after a file is deleted, and confirm status changes to unhealthy after the configured retries, with an event and the probe output visible in inspect.",
    dep: ["exec-and-attach", "event-stream"]
  },
  "exec-and-attach": {
    s: "Exec starts an additional process inside a running container's namespaces; attach connects a client to the streams of the container's main process.",
    d: "Exec asks the low-level runtime to create a new process that joins the container's existing namespaces and control group, with its own environment, user and optionally a terminal, and returns its exit code. Attach does not create anything: it connects to the standard streams or terminal of the process already running, through the shim. Several clients can attach. It is hard because the new process must inherit exactly the container's restrictions, and a mismatch in capabilities or filters is a security bug.",
    k: ["Join namespaces from outside vs run an agent inside the container: joining needs no agent and works on any image, but needs care to apply every restriction.", "Detach key sequence handled in the client vs in the runtime: client handling keeps the stream raw and simple, but the key can interfere with programs that use the same keys."],
    p: ["An exec process runs with more capabilities than the container's main process because the profile was not reapplied.", "Closing a client terminal leaves exec processes running inside the container with no owner."],
    v: "Exec a process that prints its capability set and cgroup path and confirm both equal the main process's. Attach from a second client and confirm both see the same output.",
    dep: ["runtime-shim", "terminal-handling", "process-syscalls"]
  },
  "logging-drivers": {
    s: "Pluggable destinations for container output: local files, a structured journal, a network log collector or none, chosen per container with rotation and buffering options.",
    d: "The shim or runtime reads the container's stdout and stderr, splits them into lines with a timestamp and a stream label, and passes each record to the configured driver. File drivers rotate by size and count, remote drivers batch and retry. The log reading command reads back through the same driver where supported. It is hard because a container can write faster than a destination accepts, and the runtime must decide between blocking the application, which stalls it, and dropping lines.",
    k: ["Blocking delivery vs non-blocking with a buffer that drops: blocking never loses lines but can freeze the application, while dropping keeps the application running at the cost of gaps.", "Local files with rotation vs shipping directly to a collector: local files survive a network outage and allow local reads, while direct shipping avoids disk use."],
    p: ["A chatty container with no rotation fills the host disk with one unbounded log file.", "A remote log endpoint outage blocks the container's writes and the application hangs."],
    v: "Run a container that prints a numbered line each millisecond with rotation at a small size and confirm files rotate, the retained count is respected and the log command shows the newest lines without gaps.",
    dep: ["stdio-plumbing", "daemon-configuration"]
  },
  "live-resource-updates": {
    s: "Changing a running container's memory, CPU or process limits without restarting it, by rewriting the settings of its control group.",
    d: "An update request changes the container record and then writes new values into the control group files. Raising a limit takes effect immediately. Lowering a memory limit below current usage triggers reclaim and may trigger the out-of-memory killer. Some options, such as namespaces, capabilities and mounts, cannot change on a live process at all. It is hard because the runtime's record, the spec file in the bundle and the actual control group values must stay consistent, or a restart will revert the change.",
    k: ["Update in place vs recreate the container: in place keeps processes and state, but a restart may silently revert unless the record was updated too.", "Allow lowering below current use vs reject it: allowing it permits reclaim, but can kill the process unexpectedly."],
    p: ["The control group is updated but not the stored record, so the next restart returns to the old limit.", "Lowering memory below the working set kills the main process and the update is reported as successful."],
    v: "Run a memory-hungry container, raise its limit and confirm it keeps growing past the old limit. Read the control group file and confirm it equals the value shown by inspect.",
    dep: ["container-model", "memory-limits", "cpu-limits"]
  },
  "checkpoint-restore": {
    s: "Freezing a running container and saving its process memory and kernel state to disk so it can later resume, possibly on another host.",
    d: "A checkpoint tool walks the container's process tree, reads each process's memory, open files, sockets, timers and namespaces through kernel interfaces, and writes images to a directory. Restore recreates the processes with the same identifiers inside new namespaces and replays the state. It enables live migration and fast warm starts. It is hard because not all state can be captured: devices, some network connections and kernel features are unsupported, and restore needs the same filesystem contents and compatible kernel.",
    k: ["Checkpoint with open network connections kept vs closed: keeping them allows seamless resume, but peers must tolerate the interruption and tuples must match.", "Full memory dump vs incremental pre-dumps: pre-dumps shorten the final freeze, but add complexity and storage."],
    p: ["Restore on a host with a different kernel feature set fails after the long checkpoint was already taken.", "A container using an unsupported device is checkpointed partly and cannot be restored."],
    v: "Checkpoint a counting program, delete the container, restore from the images, and confirm the counter continues from its saved value, not from zero, with the same process id inside the container.",
    dep: ["pid-namespace", "runtime-command-contract", "process-syscalls"]
  },
  "runtime-shim": {
    s: "A small per-container process that launches the low-level runtime, stays as the container's parent, holds its streams and reports its exit, so the main runtime can restart freely.",
    d: "For each container the runtime starts a shim. The shim calls the low-level runtime to create the container, becomes its parent, keeps the terminal or stream pipes open, waits for the process to exit and records the status. It exposes a local socket for commands such as start, kill, exec and state. Keeping it tiny keeps memory per container low. It is hard because it is the only owner of the process: if it dies, the container loses its parent and its streams.",
    k: ["Per-container shim vs the daemon as direct parent: a shim lets the daemon restart without killing containers, but costs a process per container.", "One shim per pod vs one per container: sharing saves memory for many containers, but couples their lifetimes and failures."],
    p: ["The shim is killed by a cleanup script that matches its name, and the container becomes unmanageable.", "A shim inherits a restrictive limit from the daemon and fails to open streams for busy containers."],
    v: "Start a container, restart the main runtime, and confirm the container's process and shim keep the same pids. Then kill the container and confirm the exit code is recorded by the shim.",
    dep: ["shim-protocol", "runtime-command-contract", "exit-reporting", "stdio-plumbing"]
  },
  "shim-protocol": {
    s: "The local request interface between the main runtime and each shim, covering create, start, kill, delete, exec, state, wait and resource queries.",
    d: "The protocol is a small remote procedure interface over a Unix socket whose path is derived from the container id. Requests mirror lifecycle verbs, and the shim answers with process ids, exit statuses and events. A versioned protocol lets one runtime drive shims built for different low-level runtimes. The shim also publishes events, such as exit and out-of-memory, back to the runtime. It is hard because the protocol must stay stable across upgrades, since old shims live as long as their containers.",
    k: ["Versioned protocol with long-lived shims vs restarting containers at upgrade: versioning keeps workloads running through upgrades, but old versions must be supported for a long time.", "Shim chooses the low-level runtime vs the daemon chooses: shim choice keeps daemon generic, while daemon choice centralizes configuration."],
    p: ["A runtime upgrade drops support for the old protocol and cannot talk to shims of running containers.", "The shim socket path exceeds the system limit for socket names, and the connection fails only for long container ids."],
    v: "Upgrade the main runtime while containers run and confirm it can still call state, exec and kill on every old shim through the protocol.",
    dep: ["runtime-shim"]
  },
  "stdio-plumbing": {
    s: "The pipes or named pipes that connect a container process's input, output and error streams to the shim and onward to clients and the logger.",
    d: "Before the process starts, the shim creates three streams and passes their ends to the low-level runtime, which installs them as the process's standard descriptors. The shim copies output into the logging driver and to any attached clients, and copies attached input to the process. Streams must outlive the main runtime, so they are named pipes at known paths. It is hard because a slow reader applies back-pressure to the container and an unread pipe fills and blocks it.",
    k: ["Named pipes vs sockets for streams: named pipes survive reconnection and are simple, but have no framing so stdout and stderr need separate pipes.", "Copy through the shim vs hand the descriptors directly to the logger: copying allows fan-out to many readers, but adds a hop and a place to lose data."],
    p: ["A log reader stops reading and the pipe fills, so the container blocks on its next write.", "An attached client closes input and the program waiting on end of file never sees it because the pipe stays open."],
    v: "Run a container writing a large known file to stdout, read it through the log command, and compare checksums. Start a container that reads stdin, close the client's input, and confirm the program sees end of file.",
    dep: ["runtime-shim"]
  },
  "terminal-handling": {
    s: "Allocation and management of a pseudo-terminal for containers started interactively, including raw mode, window size changes and signal generation from keys.",
    d: "For an interactive container the runtime creates a pseudo-terminal pair, gives the container the secondary end as its controlling terminal and keeps the primary end. Bytes typed by the user pass through the primary end, where the kernel's line discipline turns control keys into signals for the foreground process group. The client puts the user's real terminal into raw mode and forwards size changes so full-screen programs redraw. It is hard because terminal state lives in several places and must be restored on every exit path.",
    k: ["Allocate a terminal vs plain pipes: a terminal gives line editing, colors and job control, but merges stdout and stderr into one stream.", "Client raw mode with signal forwarding vs the daemon interpreting keys: raw forwarding behaves like a real terminal, but needs correct window-size and signal propagation."],
    p: ["A crash of the client leaves the user's terminal in raw mode with no echo.", "A resize is not forwarded, so editors inside the container draw at the old width."],
    v: "Start an interactive container, run a full-screen program, resize the client terminal, and confirm the program redraws at the new size. Press the interrupt key and confirm the foreground process receives it.",
    dep: ["console-socket", "stdio-plumbing"]
  },
  "console-socket": {
    s: "A socket over which the low-level runtime passes the terminal's primary descriptor back to the shim, since only the runtime can create it inside the container's namespaces.",
    d: "The shim creates a listening Unix socket and gives its path to the low-level runtime. When the runtime sets up the container's terminal, it opens the pseudo-terminal, then sends the primary descriptor to the shim over that socket using descriptor passing. The shim keeps the descriptor for the container's life and connects it to clients. It is hard because passing descriptors across processes and namespaces is subtle, and the order matters: the runtime must send it before the user program begins reading input.",
    k: ["Descriptor passing over a socket vs the runtime holding the terminal: passing lets the runtime exit after setup, while holding it would keep another process alive.", "Create the terminal inside the container's mount namespace vs on the host: inside gives the right device nodes, but needs a rendezvous to return it."],
    p: ["The socket path is deleted early and the runtime fails to connect, so interactive containers do not start.", "The descriptor is leaked into another container's process through inheritance and its input is readable."],
    v: "Start an interactive container and confirm the shim receives a pseudo-terminal descriptor, that the container's standard input is a terminal device, and that typed input reaches it.",
    dep: ["runtime-command-contract", "mount-namespace"]
  },
  "exit-reporting": {
    s: "Collecting the process's exit code or fatal signal from the kernel and delivering it to the runtime, which records it and fires events and restart logic.",
    d: "The shim, as parent, waits for the container process and reads its status, distinguishing exit codes from deaths by signal. It records the status and time and notifies the main runtime. Exit codes above 128 conventionally mean a signal. The runtime then stops the log copy, tears down networking, runs delete hooks and applies the restart policy. It is hard because the exit of the main process is not the exit of all processes in the container, and the out-of-memory killer's work must be told apart from a normal failure.",
    k: ["Report only the main process's status vs wait for the whole group: main status is simple, but background children may still be running and need cleanup.", "Record kill reason (out of memory, timeout) vs only the number: reasons are far more useful to operators, but need extra queries to the kernel."],
    p: ["An exit code of 137 is read as an application failure when the kernel killed it for memory.", "Status is lost if the shim dies before reporting, so the container shows no exit information."],
    v: "Run containers that exit with code 3, are killed by a signal and exceed their memory limit, and confirm inspect shows three distinct outcomes including a flag for the out-of-memory case.",
    dep: ["runtime-shim", "zombie-reaping"]
  },
  "shim-recovery": {
    s: "Reconnecting the main runtime to surviving shims and containers after the runtime restarts, and cleaning up those that died while it was away.",
    d: "On start, the runtime scans its state store and the shims' socket paths. For each record it connects to the shim, asks for state, and rebuilds its in-memory view, re-opening stream readers and event subscriptions. Containers that exited during the gap have their status read from the shim's saved file and are processed as if the exit had just happened. It is hard because processes can die at any moment during recovery, and records can refer to shims that no longer exist.",
    k: ["Recover from shims at start vs stop all containers on restart: recovery keeps workloads up through upgrades, but needs idempotent, crash-safe reconciliation.", "Trust the stored record vs probe the process: probing is accurate but slower, and a recycled process id can be mistaken for the container."],
    p: ["A recycled process id makes recovery adopt an unrelated process as the container.", "Exit events fired during the gap are never delivered, so restart policy does not run for those containers."],
    v: "Stop the main runtime, let one container exit during the gap, restart the runtime, and confirm all containers show correct state, the exited one shows its exit code, and the restart policy was applied.",
    dep: ["runtime-shim", "state-store", "shim-protocol"]
  },
});
