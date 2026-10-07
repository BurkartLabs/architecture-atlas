// Details for the container runtime plate, part 1: interfaces, image build, image format.
ATLAS.details("container-runtime", {
  "cli-client": {
    s: "The command-line program that turns user commands into calls to the runtime's API and formats the replies, streams and exit codes for a terminal or a script.",
    d: "The client holds almost no logic: it parses arguments, builds a request, calls the API over a local socket or remote endpoint, and renders the response. For interactive commands it switches the terminal to raw mode and relays bytes both ways. Some clients also perform work locally, such as reading a build context or resolving short image names against configured registries. It is hard because users treat its flags and output as a stable interface, so changes to defaults, output columns or error text break automation.",
    k: ["Thin client over the API vs client with local logic: a thin client behaves the same everywhere, but local steps such as name resolution then differ between tools.", "Human-formatted output vs structured output: tables are readable, but scripts that parse them break when columns change, so a machine format must be offered."],
    p: ["A script parsing table output breaks when a new column is added in a later version.", "A client and daemon of different versions silently negotiate down and drop a flag the user relied on."],
    v: "Run a container with a long-running command, interrupt it from the client, and confirm the client exit code matches the container's exit status and the terminal is restored to cooked mode.",
    dep: ["engine-api"]
  },
  "engine-api": {
    s: "The versioned request interface through which clients create, inspect, start, stop and delete containers and images, usually served over a local socket.",
    d: "The API is a set of resources (containers, images, networks, volumes) with create, inspect, list and delete operations plus streaming endpoints for logs, events and attached streams. Requests are versioned in the path so older clients keep working. Long operations such as pulls return progress as a stream. Streaming endpoints hijack the connection into a raw bidirectional byte stream. It is hard because the API is both the user interface and the contract with every orchestrator built on it, so mistakes become permanent.",
    k: ["Versioned paths vs a single evolving surface: versioning lets old clients work indefinitely, at the cost of keeping every old behavior alive in the server.", "Resource-oriented REST vs RPC with streams: REST fits inspection and lists well, but attach and exec need raw stream upgrades that break HTTP assumptions."],
    p: ["A proxy or load balancer in front of the socket drops the hijacked stream, so attach works locally but not remotely.", "Callers poll list endpoints at high rates and make the daemon spend its time on inspection instead of work."],
    v: "Create a container with a raw API call, start it, and list it; confirm the state field changes from created to running. Request an unsupported API version and confirm a clear version error.",
    dep: ["container-lifecycle", "api-socket-security", "state-store"]
  },
  "api-socket-security": {
    s: "The rules that decide who may call the runtime's API: file permissions on the socket, group membership, transport encryption with client certificates, and user-level scoping.",
    d: "Because the API can start a container that mounts the whole host filesystem, whoever can write to the socket effectively has administrator rights. Local access is controlled by the socket's owner and group. Remote access uses mutually authenticated TLS or a tunneled shell session. Rootless setups place the socket in the user's own runtime directory so the blast radius is that user. Authorization plugins can veto individual requests. It is hard because there is no fine-grained permission model: most deployments either grant everything or nothing.",
    k: ["Group-based socket access vs per-user rootless daemons: groups are simple, but membership equals root, while per-user daemons confine damage at the cost of one daemon each.", "Remote TLS endpoint vs a tunnel over existing remote login: TLS needs certificate management, while tunnels reuse existing identity and audit at some latency."],
    p: ["Mounting the API socket into a container, for convenience, hands that container control of the host.", "A remote endpoint is enabled without client certificate verification and is reachable by anyone on the network."],
    v: "As a user outside the permitted group, attempt a request on the socket and confirm permission denied. As a permitted client, connect remotely with a wrong certificate and confirm the handshake fails.",
    dep: []
  },
  "event-stream": {
    s: "A live feed of state changes (container created, started, died, image pulled) that tools subscribe to instead of polling the API.",
    d: "Each lifecycle transition, image operation and health change is published as a small timestamped record with an object type, an action and attributes. Clients subscribe with filters and may ask for a replay window from a given time. The runtime keeps a bounded buffer so slow subscribers cannot exhaust memory. Orchestrators and monitoring agents rely on it to learn that a container exited. It is hard because delivery is best effort: a subscriber that disconnects can miss events and must reconcile with a full listing.",
    k: ["Push events vs polling listings: events give low latency and low load, but a missed event leaves a consumer wrong until it reconciles.", "Bounded replay buffer vs durable event log: a bounded buffer keeps the runtime simple, while a durable log would allow exact recovery at the cost of storage."],
    p: ["A consumer treats the stream as complete, misses a death event during a reconnect and shows a dead container as running.", "A subscriber that reads slowly is disconnected, and the tool silently stops receiving updates."],
    v: "Subscribe to events, run and kill a container, and confirm create, start and die events arrive in order with the exit code. Disconnect, restart the container, and confirm a replay from the earlier timestamp shows the missed events.",
    dep: ["engine-api", "container-lifecycle"]
  },
  "client-libraries": {
    s: "Language bindings that wrap the API so programs can drive the runtime without hand-written HTTP, including stream handling and version negotiation.",
    d: "A library maps API resources to typed calls, manages the socket connection, decodes progress streams and exposes attach and exec as readable and writable streams. Test suites and build tools use them to start throwaway containers. Many are generated from a machine-readable API description, others are hand-written. The difficulty is keeping up: when the API adds a field, generated libraries may drop it silently, and when streams are multiplexed the library must demultiplex stdout and stderr correctly.",
    k: ["Generated bindings vs hand-written ones: generated code tracks the API exactly but feels awkward, while hand-written code reads well and drifts from the server.", "Pinning an API version vs negotiating at connect time: pinning gives repeatability, negotiation gives compatibility with whatever daemon is present."],
    p: ["A library that does not drain progress streams on a pull stalls forever because the daemon blocks on write.", "Unmultiplexed output interleaves stdout and stderr headers into the data and corrupts binary output."],
    v: "Using the library, start a container that prints to both stdout and stderr, and confirm each stream is received separately and completely, then confirm the container is removed after the test.",
    dep: ["engine-api"]
  },
  "daemon-configuration": {
    s: "The file and flags that set storage location, default runtime, registries, network ranges, logging defaults and security options for the long-running service.",
    d: "Configuration is read at start-up from a file and overridden by flags. It names the data root, the snapshotter, the default low-level runtime, insecure or mirrored registries, default address pools for networks and default logging and resource options. Some settings reload on a signal, most need a restart, and a restart of a daemon that owns containers may stop them unless live restore is enabled. It is hard because defaults chosen once on a developer machine become production behavior.",
    k: ["Daemon-wide defaults vs per-container options: defaults keep commands short, but a changed default alters every future container without any change in the commands.", "Reload on signal vs restart for all changes: reload avoids downtime, though only some settings can safely change while containers run."],
    p: ["The default address pool for bridge networks overlaps the corporate network and silently breaks routing to internal hosts.", "A configuration change requires a restart that stops every container because live restore was never enabled."],
    v: "Change the log driver default in the configuration, restart the service, start a container without options, and confirm its inspect output shows the new driver. Confirm the daemon logs reject an unknown key.",
    dep: []
  },
  "orchestrator-adapter": {
    s: "The interface through which a cluster scheduler drives the host: pull images, create pod sandboxes and containers, stream logs, and report status without using the human-facing API.",
    d: "A cluster node agent speaks a purpose-built remote procedure interface rather than the user API. It has two service groups: images (pull, list, remove, filesystem usage) and runtime (create a sandbox, create and start containers in it, exec, port-forward, stats). A sandbox is a shared network namespace and cgroup parent for several containers. The runtime reports state and the agent reconciles. It is hard because the agent assumes idempotent calls and unique names, and the runtime must survive repeated create attempts after timeouts.",
    k: ["A dedicated adapter vs the general user API: an adapter has stable, minimal semantics for schedulers, but doubles the surface the runtime must keep correct.", "Sandbox as a first-class object vs per-container networking: sandboxes allow shared namespaces for sidecars, but add lifecycle rules for the pause process that holds them."],
    p: ["A retried create call after a timeout produces a duplicate container because names were not checked for idempotence.", "Image and container garbage collection by both the agent and the runtime fight over the same objects."],
    v: "Using the adapter interface alone, create a sandbox with two containers, confirm both share an IP address, stop one, and confirm the sandbox and the other container keep running.",
    dep: ["container-model", "container-lifecycle", "image-gc", "network-plugins"]
  },
  "build-file-parser": {
    s: "Reads the build recipe, a line-oriented file of instructions, expands arguments and produces an ordered, validated list of build steps.",
    d: "The parser splits the recipe into instructions such as base image selection, file copies, commands to run, environment settings and metadata. It handles line continuations, comments, argument substitution and escape rules, and records which instruction came from which line for error messages. The output feeds the graph solver. It is hard because the format grew organically: quoting, shell form versus exec form, and implicit behaviors such as what a copy does with a trailing slash create surprises that every compatible tool must reproduce exactly.",
    k: ["Strict parsing with early errors vs lenient parsing: strictness catches typos before a long build, but rejects recipes that older tools accepted.", "Shell form vs exec form for commands: shell form allows pipes and expansion, but wraps the program in a shell that swallows signals."],
    p: ["Shell form leaves a shell as the main process, so a stop signal never reaches the real program and the stop times out.", "An argument declared before the base image is not visible in later stages, so a substitution silently expands to nothing."],
    v: "Build a recipe with a deliberate unknown instruction and confirm the error names the correct line number. Build a valid recipe and confirm the resulting config shows the declared entrypoint and environment.",
    dep: []
  },
  "build-graph-solver": {
    s: "Converts parsed build steps into a graph of operations with explicit inputs and outputs, then schedules them in parallel and skips branches nobody needs.",
    d: "Each step becomes a node that takes a filesystem snapshot as input and produces a new snapshot. Steps with no data dependency can run concurrently and a stage that no target reaches is never executed. The solver also deduplicates identical nodes across concurrent builds. Because the graph is an intermediate form, several front ends can target it. It is hard because correctness depends on declaring every input: a step that reads something the graph does not know about will be reused from cache when it should be rerun.",
    k: ["Graph with parallel scheduling vs sequential step execution: a graph shortens builds and prunes unused stages, but needs every dependency declared explicitly.", "A shared long-lived build service vs one process per build: a service shares cache and deduplicates work, at the cost of multi-tenant isolation concerns."],
    p: ["Two parallel steps write to the same path through a shared mount and race, producing different output on each run.", "A build target selection prunes a stage with a needed side effect and the image lacks a file nobody saw missing."],
    v: "Build a recipe with two independent slow stages and confirm total time is near the longer one, not the sum. Request only one target and confirm the other stage never runs.",
    dep: ["build-file-parser", "build-cache"]
  },
  "build-cache": {
    s: "Stores the filesystem result of each build step under a key so unchanged steps are reused instead of executed again.",
    d: "After a step finishes, its resulting snapshot is stored and indexed by a cache key. On the next build, if the key matches, the stored result is used and the step is skipped. Caches live in the local store, in a separate cache directory, or in a remote registry shared across machines. Once a step misses, every later step that depends on it also misses. It is hard because invalidation is by key only: unrelated changes high in the recipe rebuild everything below, and non-deterministic steps are cached forever.",
    k: ["Local cache only vs shared remote cache: local is fast and private, while remote lets clean CI machines reuse work but adds transfer cost and trust questions.", "Cache by step key vs cache by content of results: step keys are cheap to compute, but content-based reuse finds more hits when different steps yield identical output."],
    p: ["A step that downloads the latest package is cached indefinitely, so builds keep shipping an outdated dependency.", "An unbounded cache fills the disk on a build machine and the next build fails with no space."],
    v: "Build twice with no changes and confirm every step reports cached and the second build takes seconds. Change one early file and confirm all later steps rerun.",
    dep: ["cache-key-computation", "content-store"]
  },
  "cache-key-computation": {
    s: "Derives the identity of a build step from its instruction, its parent snapshot and the content of any files it copies in.",
    d: "For a command step the key is built from the command text, the environment and the parent's identity. For a copy step it also includes a hash over the copied files' contents, paths and selected metadata such as mode, while ignoring timestamps. Keys chain, so a change anywhere invalidates everything after it. Exclusion rules keep irrelevant files from changing keys. It is hard because the key must include exactly the inputs that affect the result: too few causes stale reuse and too many destroys cache hits.",
    k: ["Hash file contents vs rely on timestamps: contents are stable across fresh checkouts and give real hits, but hashing a large context costs time on every build.", "Include file mode and ownership in the key vs ignore them: including them is accurate, but different checkouts on different systems then miss the cache."],
    p: ["A generated file in the context with a changing timestamp or order invalidates every copy step on each build.", "Files outside the exclusion list, such as logs, leak into the key and make caches useless."],
    v: "Touch a copied file without changing its contents and confirm the step still hits the cache. Change one byte and confirm the step misses.",
    dep: ["content-addressing", "build-context-transfer"]
  },
  "build-context-transfer": {
    s: "Sends the files a build may read from the client to the builder, ideally only the changed ones, honoring an ignore list.",
    d: "The context is a directory the recipe can copy from. Older flows packed it into an archive and uploaded all of it each build. Newer builders request only files the graph actually reads and send only those whose content changed since the last build, using a file-synchronization protocol over the session. Ignore patterns exclude version control data, dependencies and secrets. It is hard because the context can be gigabytes, and an overly broad one slows each build and may leak credentials into an image layer.",
    k: ["Incremental sync of needed files vs uploading the whole context: sync cuts transfer time sharply, but needs a stateful session between client and builder.", "Ignore list in the context vs explicit copy paths only: ignore lists protect by default, while explicit paths are precise but easy to forget."],
    p: ["The whole project directory including credentials is copied into a layer because no ignore list excluded it.", "A very large context directory makes a remote build take minutes before the first step starts."],
    v: "Add a file matching the ignore list, build, and confirm the transfer size in build output does not include it. Run a second build and confirm only changed files transfer.",
    dep: ["build-graph-solver"]
  },
  "multi-stage-builds": {
    s: "Allows one recipe to use several base images in sequence, so build tools stay in early stages and only selected outputs are copied into a small final image.",
    d: "Each stage starts from its own base and ends as a snapshot. A later stage copies named paths from an earlier stage and discards the rest, so compilers and caches never reach the shipped image. Stages can be named, targeted individually and run in parallel by the graph solver. It is the main technique for small images. It is hard because the final stage must contain every runtime dependency the build stage implicitly provided, such as libraries and certificates, and gaps appear only at run time.",
    k: ["Separate build and runtime stages vs one stage cleaned afterwards: separate stages leave no residue in layers, while cleaning inside one layer cannot remove what an earlier layer holds.", "Minimal final base vs full base: minimal images reduce size and attack surface, but lack shells and tools for debugging."],
    p: ["The final stage copies a binary but not the shared libraries or trust certificates it needs, and fails only at first run.", "Deleting files in a later layer is assumed to shrink the image, though the earlier layer still stores them."],
    v: "Build a two-stage image, run it, and confirm the program works. Inspect the layer list and confirm no compiler or source file exists in any layer of the final image.",
    dep: ["build-graph-solver", "layer-blobs"]
  },
  "build-secrets": {
    s: "Gives a build step temporary access to credentials or files through mounts that are never written into a layer or the cache key.",
    d: "A step can request a secret mount, an SSH agent socket or a cache mount. The secret appears as a file or socket only while that command runs, in memory-backed storage, and is excluded from the resulting layer and from the cache key. Cache mounts persist a directory, such as a package cache, between builds to speed them up without becoming image content. It is hard because the build tool controls only its own recipe: a command that copies the secret elsewhere inside the layer defeats the protection.",
    k: ["Mount-based secrets vs build arguments: mounts leave no trace in the image history, while arguments are recorded in the image config in plain text.", "Persistent cache mounts vs fully clean builds: cache mounts make dependency installs fast, but results may depend on hidden prior state."],
    p: ["A token passed as a build argument is readable by anyone who pulls the image and runs its history command.", "A cache mount holds partial downloads from a failed build and poisons the next one."],
    v: "Build with a secret mount that writes the secret to a file, then inspect every layer and the image config and confirm the secret string is nowhere present. Confirm the build step could read it.",
    dep: ["build-graph-solver", "tmpfs-mounts"]
  },
  "multi-platform-builds": {
    s: "Produces one image reference that contains a variant for each processor architecture and operating system, built by emulation, cross-compilation or native builders.",
    d: "The builder runs the recipe once per target platform, then publishes the per-platform manifests plus an index that maps platforms to them. Variants run either on native machines, through user-space instruction emulation registered with the kernel, or by cross-compiling in an early stage that always runs natively. The pull side chooses a variant by matching the host. It is hard because emulated builds are slow and sometimes behave differently, and the index must list every platform users will pull.",
    k: ["Native builders per platform vs emulation: native builds are fast and faithful, while emulation needs only one machine but can be ten times slower.", "Cross-compilation inside the recipe vs building under emulation: cross compiling is fast but requires the toolchain to support it and test coverage on the target."],
    p: ["The index omits one architecture, so users on that hardware get a manifest unknown error or pull the wrong variant.", "An emulated build step crashes with an illegal instruction that never appears on real hardware."],
    v: "Build for two platforms, inspect the published index and confirm two entries with distinct platform fields. Pull on each platform type and confirm the matching variant is selected.",
    dep: ["image-index", "build-graph-solver"]
  },
  "image-manifest": {
    s: "The small document that lists an image's configuration blob and ordered layer blobs by digest and size, and is itself identified by its own digest.",
    d: "A manifest names one config blob and an ordered array of layer descriptors, each with a media type, a digest and a size, plus optional annotations. Pulling begins by fetching the manifest, then fetching each listed blob and verifying its digest. Because the manifest hash covers all digests, one value pins the entire image. It is hard because tools read manifests from untrusted registries, so parsers must bound sizes and reject mismatched descriptors, and because tags can move while digests cannot.",
    k: ["Reference by tag vs by digest: tags are readable but mutable, so the same name can yield different content, while digests are exact but unreadable.", "Manifest embeds layer list vs separate layer metadata: embedding makes a single hash cover everything, but any layer change creates a new manifest."],
    p: ["A deployment pins a tag, someone repushes it, and half the fleet runs different code after restarts.", "A client trusts the size field and allocates memory or downloads far more than the manifest declared."],
    v: "Fetch a manifest by tag and by its digest and confirm identical bytes. Hash the manifest bytes and confirm the result equals the digest used to fetch it.",
    dep: ["content-addressing", "image-config", "layer-blobs"]
  },
  "image-index": {
    s: "A manifest of manifests: it maps platform descriptions to per-platform image manifests so one name resolves to the right variant for each host.",
    d: "The index lists manifest descriptors, each with a platform record naming operating system, architecture, variant and optionally required features. A client selects the entry that best matches the host and then pulls that manifest. The same mechanism carries non-image entries such as attached signatures and attestations when they are linked by a subject field. It is hard because matching is a policy: when no entry equals the host exactly, clients differ in whether they fall back to a compatible variant.",
    k: ["One multi-platform name vs a name per platform: one name simplifies deployment across mixed hardware, but hides which bytes each host runs.", "Strict platform matching vs fallback to compatible variants: strict matching avoids wrong binaries, but fallbacks let older hardware use newer builds."],
    p: ["Pushing a single-platform image over an existing multi-platform tag removes the other platforms without any warning.", "A host with an unusual variant string matches nothing and pull fails even though a compatible image exists."],
    v: "Pull the same index on two hosts of different architecture and confirm each resolves to a different manifest digest. Inspect the index and confirm each descriptor has a platform entry.",
    dep: ["image-manifest"]
  },
  "image-config": {
    s: "The JSON document holding what the image runs and how: default command, environment, working directory, user, exposed ports, layer diff identifiers and build history.",
    d: "The config blob stores runtime defaults used to construct the runtime spec when no override is given: entrypoint, command, environment variables, user, working directory, labels and declared volumes and ports. It also lists the uncompressed digest of every layer, called diff identifiers, which form the image's identity independent of compression, and a history of the steps that built it. It is hard because its fields are defaults the runtime merges with user options, and merge rules for entrypoint versus command are widely misunderstood.",
    k: ["Image-level defaults vs explicit run-time settings: defaults make images self-describing, but hide behavior in metadata users never read.", "Image ID from config digest vs from manifest digest: config-based IDs ignore compression and distribution, but differ from the names registries use."],
    p: ["The image's declared user is root by omission, so containers run as root without anyone choosing that.", "Secrets set as environment variables at build time are stored in the config and visible to every puller."],
    v: "Inspect an image's config and confirm the entrypoint, user and environment match the recipe. Override the command at run time and confirm only the command changes while entrypoint persists.",
    dep: ["content-addressing"]
  },
  "layer-blobs": {
    s: "Each layer is an archive of filesystem changes relative to the layer below, stored and transferred as an opaque blob identified by its digest.",
    d: "A layer archive records added or modified files with paths, modes, owners, timestamps and extended attributes, and deletions as special marker entries. Stacking layers in order, lowest first, reconstructs the full root filesystem. Because layers are shared by digest, ten images from one base store the base once and pull it once. It is hard because the archive format has quirks around hard links, sparse files, device nodes and path safety, and an unpacker must refuse paths that escape the target directory.",
    k: ["Many small layers vs few large layers: many layers improve sharing and cache hits, but each adds mount overhead and a ceiling on stacking depth.", "Deterministic archive ordering and timestamps vs raw output: deterministic archives give stable digests and sharing, but need a normalizing step in the build tool."],
    p: ["An archive entry with parent-directory components writes outside the target during unpack, overwriting host files.", "A recompressed or re-archived layer gets a new digest, so sharing and signatures are lost."],
    v: "Pull two images from the same base and confirm the base layer digests are identical and downloaded once. Unpack a layer into an empty directory and confirm the files match the build step's changes.",
    dep: ["content-addressing", "layer-compression", "whiteouts-and-diffs"]
  },
  "layer-compression": {
    s: "The codec applied to each layer for transfer and storage, trading CPU time and decompression speed against size and the ability to seek into the blob.",
    d: "Layers are typically compressed with a general-purpose stream codec. The compressed digest names the blob on the wire, while the uncompressed digest is recorded in the config. Newer formats chunk the archive so individual files can be fetched without reading the whole blob, which enables lazy pulling. Parallel decompression speeds unpack on many-core hosts. It is hard because compression changes the digest: converting formats changes every blob identity, which breaks signatures and cache sharing.",
    k: ["Fast codec vs dense codec: faster decompression shortens container start, while denser compression cuts registry storage and network time.", "Seekable chunked layers vs plain streams: chunked layers allow on-demand file access, but cost size and need support in both registry and runtime."],
    p: ["Recompressing an image for speed changes digests and invalidates the signature that policy requires.", "A client without the newer codec fails with an unknown media type on an image that works on newer hosts."],
    v: "Compress the same layer with two codecs and confirm two different blob digests with the same recorded uncompressed digest. Pull both and confirm the unpacked filesystems are identical.",
    dep: ["content-addressing"]
  },
  "content-addressing": {
    s: "Naming every blob and manifest by the cryptographic hash of its bytes, so identity, integrity and deduplication come from the same value.",
    d: "A digest has an algorithm prefix and a hex hash. Whoever fetches a blob recomputes the hash and rejects a mismatch, so a registry or mirror cannot substitute content. Storing by digest deduplicates automatically, and a reference to a digest is a precise, immutable pointer. Hash choice, canonical serialization of JSON and the exact bytes of the compressed stream all matter. It is hard because anything that re-serializes content changes its identity, and because verification must happen before the data is used, not after.",
    k: ["Hash of the compressed bytes vs hash of the content: compressed digests verify downloads directly, while content digests stay stable across codecs.", "A single mandated algorithm vs algorithm agility: one algorithm is simple, while agility allows migrating when a hash weakens but multiplies code paths."],
    p: ["A tool unpacks data while still downloading and runs it before the digest check completes.", "Re-encoding a manifest with different whitespace changes its digest and breaks every reference to it."],
    v: "Download a blob, compute its hash independently, and confirm it equals the digest in the manifest. Corrupt one byte in a local copy and confirm the store rejects it.",
    dep: []
  },
  "whiteouts-and-diffs": {
    s: "The convention for expressing deleted files in a layer, plus the process of computing which files changed between two filesystem states.",
    d: "Because a layer can only add entries, a deletion is written as a marker file with a reserved name prefix, and removing a whole directory contents uses an opaque marker. When layers are applied, markers hide lower entries. Building a layer means walking the changed filesystem against its parent snapshot and emitting only differences. Overlay filesystems use different native representations, such as character devices and extended attributes, so the unpacker translates. It is hard because renames, permission-only changes and directory replacement are easy to encode wrongly.",
    k: ["Marker files in the archive vs native deletion records: markers keep the format filesystem-neutral, but every unpacker must translate them to what the kernel needs.", "Walking the whole tree to diff vs tracking writes: walking is simple and exact, but slow for large trees, while tracking is fast but needs filesystem support."],
    p: ["A deleted secret remains readable in a lower layer, since the marker only hides it in the merged view.", "A replaced directory without an opaque marker merges old files into the new directory unexpectedly."],
    v: "Build an image that deletes a file in a later step, then run it and confirm the file is absent. Extract only the lower layer and confirm the file is still present there.",
    dep: ["layer-blobs"]
  },
});
