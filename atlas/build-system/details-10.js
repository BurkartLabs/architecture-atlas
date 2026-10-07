// Details for the build system plate, part 10: cross-cutting concerns.
ATLAS.details("build-system", {
  "declared-inputs-contract": {
    s: "The rule about what counts as an input: anything an action may read must be declared, and anything undeclared must be unreachable or ignored.",
    d: "Every layer relies on this contract. Rules declare inputs for actions, the action key hashes them, sandboxes enforce them, caches reuse results based on them, and remote execution uploads exactly them. The contract can be enforced strictly, by making undeclared files invisible, or loosely, by trusting tools and compensating with depfiles and header scanning. The choice shapes how fast the first build is, how portable results are, and how many bugs appear only on clean machines. It is hard because the declared set is duplicated information that can drift from what code uses.",
    k: ["Strict declaration with enforcement vs trusting tool reports: caching and remote execution are safe, but every rule and tool needs exact input lists.", "Declaring inputs at file level vs directory level: easy to write, but any file in the directory change invalidates the action."],
    p: ["An undeclared input works on the author's machine from stale files and fails in CI.", "Over-declaring a whole directory makes every unrelated change rebuild the action."],
    v: "Run the full build in an enforcing sandbox on a clean checkout and confirm no action fails for missing files. Remove one declared input from a rule and confirm exactly that action fails.",
    dep: ["actions", "sandboxing", "action-key", "dependency-declaration"]
  },
  "incrementality-granularity": {
    s: "The choice of unit at which the build tracks change: whole project, directory, target, action, file or function, trading precision against bookkeeping.",
    d: "Finer units rebuild less but need more nodes, more declarations, more digests and more cache lookups. Coarser units are simpler but redo work. The granularity appears in target size, in whether compilers are invoked per file or in batches, in whether outputs are hashed for early cutoff, and in whether the language supports finer incremental compilation internally. Teams choose it per language and per layer. It is hard because the optimum depends on edit patterns and machine speed, and shifts as the repository grows.",
    k: ["Per-file actions vs batched actions: maximal reuse and parallelism, but per-process overhead dominates for fast compilers.", "Fine targets vs coarse ones: small rebuild sets and good caching, but more declarations and larger graphs to load and analyze."],
    p: ["Per-file actions with a slow-starting tool spend more time starting processes than compiling.", "Coarse targets make any edit rebuild a large library and everything linked against it."],
    v: "Edit one file in a large library and compare the number of actions and total time under different granularities. The chosen setting should keep rebuild time proportional to the edit's size.",
    dep: ["targets", "minimal-rebuild", "early-cutoff", "actions"]
  },
  "hermeticity-policy": {
    s: "The decision of how strictly actions are isolated from the host: fully sandboxed and network-free, partially isolated, or open, and how exceptions are granted.",
    d: "A strict policy gives portable, cacheable results and enables remote execution, at the cost of migration work and some friction for tools that assume the host. A relaxed policy builds legacy projects but limits sharing: results from open actions cannot be trusted by others. Most organizations pick a strict default and give explicit, tagged, audited exceptions. The policy also covers toolchains, network access during fetches, and the clock. It is hard because exceptions accumulate, and each one is a hole through which nondeterminism enters the shared caches.",
    k: ["Strict default with tagged exceptions vs opt-in isolation: holes are visible and counted, but migration is front-loaded.", "Enforcing the same policy locally and remotely vs weaker locally: no surprises in CI, but slower local iteration."],
    p: ["Exceptions granted to unblock a release never expire, and the cache fills with results from open actions.", "Local builds are lenient and CI strict, so developers see failures only after pushing."],
    v: "List every action that ran outside the sandbox in a full build with its reason tag. Each should be an approved exception, and the list should shrink or stay flat from one release to the next.",
    dep: ["hermeticity", "sandboxing", "cache-upload-policy", "execution-strategies"]
  },
  "cache-trust-and-security": {
    s: "Decisions about who may read and write shared caches and remote workers, since every cached output is executed or shipped by someone else.",
    d: "A shared cache and a remote executor are supply-chain components: a malicious or buggy entry, once stored under a legitimate key, is trusted by every consumer. Mitigations include write access limited to trusted builders, authenticated and signed results, separate caches per trust level, reproducibility checks, and isolation of workers from secrets. Credentials needed by actions must not become inputs or logs. It is hard because security controls cut cache hit rates, and because the same key and digest properties that make sharing efficient make poisoning wide.",
    k: ["Partitioned caches by trust level vs one global cache: poisoning is contained, but sharing between partitions drops.", "Signing results vs trusting the transport: tamper detection and audit trail, but key management and verification cost."],
    p: ["A developer machine with write access uploads a tampered object that is then used in a release.", "Secrets passed through the environment appear in action keys, logs and cached results."],
    v: "Attempt to upload a result with a mismatching digest or from an unauthorized identity and confirm rejection. Audit the caches for any entries produced by unsandboxed or untrusted actions.",
    dep: ["cache-upload-policy", "remote-cache-service", "worker-isolation", "content-addressable-store"]
  },
  "scale-and-latency": {
    s: "The set of design choices that decide how build time grows with repository size, including what is loaded, what is kept in memory and what is done remotely.",
    d: "At small scale, a build is bound by compile time. At large scale, other costs dominate: loading and analyzing a large graph, checking for changes across millions of files, hashing, cache lookups and network round trips. Systems answer with a resident daemon, lazy loading, file watching, remote caches, remote execution and early cutoff. Each shifts cost from the developer's machine to shared infrastructure, and each adds a failure mode. It is hard because the work that scales linearly with repository size, such as full scans, must be removed entirely to keep incremental builds fast.",
    k: ["Sub-linear incremental cost via watching and memoization vs simple full scans: fast no-op builds in huge repositories, but more state to keep correct.", "Moving work to shared remote services vs local compute: scales with the cluster, but depends on network and service availability."],
    p: ["A new rule with per-target work proportional to the entire repository slows every build as the repository grows.", "A remote service outage turns every developer's build into a very slow local one."],
    v: "Measure a no-op build and a one-file edit rebuild at two repository sizes. Both times should stay nearly flat as the repository doubles, with the profile showing no phase that grows linearly.",
    dep: ["build-daemon", "incremental-engine", "remote-execution-api", "file-watcher"]
  },
  "migration-and-compatibility": {
    s: "How an existing project, with its own scripts and assumptions, moves to the build system, and how the system stays compatible across versions of itself, its rules and its protocols.",
    d: "Adopting a hermetic build rarely happens at once. Projects wrap existing commands as actions with loose isolation, generate build files from other formats, run old and new builds in parallel, and tighten policy as leaks are fixed. The system itself changes: flags are deprecated, rule APIs evolve, cache and protocol formats are versioned. Compatibility flags and gradual rollouts let both sides move. It is hard because migration is long, visible only in aggregate, and every shortcut taken to get a team onboarded becomes a permanent hole in hermeticity.",
    k: ["Incremental migration with wrappers vs a clean rewrite: teams adopt early and keep shipping, but the old and new build coexist for years.", "Long-lived compatibility flags vs forced cutover: gentle for users, but the number of supported combinations keeps rising."],
    p: ["A wrapper that runs the old build script as one giant action caches nothing useful and hides all dependencies.", "A deprecated flag is removed and silently breaks scripts that nobody owns."],
    v: "Build the same revision with the old and new systems and compare outputs by digest or behavior. Track the number of unsandboxed or wrapper actions over time and confirm it falls each quarter.",
    dep: ["hermeticity-policy", "rule-definitions", "command-line-interface"]
  }
});
