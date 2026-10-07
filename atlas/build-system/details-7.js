// Details for the build system plate, part 7: action execution, isolation and hermeticity.
ATLAS.details("build-system", {
  "actions": {
    s: "The unit of work: one command line with declared input files, environment, and expected output files, which the engine runs, caches and replays as a whole.",
    d: "A rule registers an action by naming its command (an executable and arguments), the inputs it may read, the outputs it must produce, environment variables, and metadata such as resource needs and platform requirements. The action is a pure description; the engine decides whether to run it locally, remotely or skip it using a cache. After running, it checks that every declared output exists. It is hard because an action's correctness depends on the declared inputs being complete: the command can read anything the machine has, so completeness is enforced only by isolation, not by the description itself.",
    k: ["Small actions per file vs large batched actions: precise caching and parallelism, but process start and cache lookup overheads multiply.", "Declared outputs required vs allowing extra outputs: the engine knows everything that was produced, but tools with unpredictable output need wrappers."],
    p: ["A command that reads a file it never declared produces outputs the cache cannot invalidate correctly.", "An action that writes undeclared extra files leaks state between runs in a shared directory."],
    v: "Run an action in an empty sandbox containing only its declared inputs and confirm all declared outputs appear. Remove one declared output from the command and confirm the engine reports the missing output.",
    dep: ["action-key", "execution-strategies", "input-staging"]
  },
  "action-key": {
    s: "A digest of everything that determines an action's result: the command line, environment, tool digests, every input digest and the platform. Equal keys mean the output can be reused.",
    d: "The key is computed by hashing a canonical encoding of the command, arguments, environment variables, declared input paths with their content digests, the identity of the tools and the execution platform properties. If a recorded result exists under the key, it is reused. Anything left out of the key is an invisible input: a missing tool digest or environment variable gives stale results. It is hard because the key must include everything relevant but nothing incidental: an absolute path or timestamp makes keys unique and defeats caching.",
    k: ["Hashing input contents vs paths and timestamps: correct across machines and across checkouts, but needs digesting every input.", "Including the full environment vs an allowlist: safer correctness, but unrelated variables such as a username make keys differ between machines."],
    p: ["An unhashed tool binary updates on one machine and results from the old version are served from the cache.", "A home directory path in the environment gives each developer a distinct key, so nothing is shared."],
    v: "Compute the key for an action, change one input byte and confirm the key changes; run the same action from a different checkout directory and confirm the key is identical.",
    dep: ["actions", "content-hash-change-detection", "environment-control", "digest-cache"]
  },
  "execution-strategies": {
    s: "The alternative ways an action can be run, such as sandboxed locally, unsandboxed locally, through a persistent worker or on a remote worker, selected per action by policy.",
    d: "A strategy is an implementation that takes an action and returns its outputs. Policy maps action kinds or tags to an ordered list of strategies, and falls back if one cannot handle an action. For example, ordinary compiles go remote, tests run sandboxed locally, and an action that needs the network runs without a sandbox. Strategies are separate from rules, so the same graph runs in any environment. It is hard because each strategy has different capabilities and failure modes, and behavior that works in one fails in another.",
    k: ["Selecting strategies by policy vs in rules: one graph runs on laptops and clusters, but rule authors cannot guarantee an isolation level.", "Fallback to a weaker strategy on failure vs failing: builds complete despite infrastructure issues, but hermeticity gaps are hidden."],
    p: ["A silent fallback from sandboxed to unsandboxed execution hides undeclared dependencies until the sandbox is enforced elsewhere.", "A remote strategy failing and retrying locally doubles time without reporting why."],
    v: "Run a build with remote execution configured, then disable remote and rerun. Output digests should match, and the event stream should list the strategy used for each action.",
    dep: ["sandboxing", "persistent-workers", "remote-execution-api", "actions"]
  },
  "sandboxing": {
    s: "Runs each action in a restricted file system view that contains only its declared inputs, so reading anything undeclared fails immediately.",
    d: "Before running, the engine builds a directory containing links or copies of exactly the declared inputs, and runs the command inside it with a changed root or namespaces, or a view that denies other paths. Outputs are collected from it afterward and the directory is deleted. Network and process visibility can be blocked too. This turns missing-dependency bugs into immediate failures. It is hard because creating a tree per action costs time, because tools expecting system paths break, and because lighter isolation methods leak, like reads of absolute paths.",
    k: ["Linking inputs into a fresh tree vs mounting a filtered view: portable and simple, but slow for actions with thousands of inputs.", "Strict sandbox including network vs file-only isolation: stronger hermeticity, but some tools and tests legitimately need local sockets."],
    p: ["Setup of a sandbox with tens of thousands of input links takes longer than the compile itself.", "A tool that reads an absolute path outside the sandbox succeeds locally and fails remotely."],
    v: "Add a command that cats an undeclared file and run it under the sandbox. It must fail with file-not-found. Declare the file as an input and confirm it then succeeds and the action key changes.",
    dep: ["input-staging", "actions", "hermeticity"]
  },
  "input-staging": {
    s: "Materializes an action's declared inputs into its working directory or remote input tree, by linking, copying or fetching them from storage.",
    d: "For a local sandbox, staging creates symlinks or hard links to files in the output tree and source tree; for a remote worker, it assembles a directory tree and ensures every file and directory is present in the content-addressable store. Inputs are laid out at the paths the command expects. Tool runfiles and data dependencies are staged along with sources. It is hard because staging cost scales with input count, because links behave differently across file systems, and because the tree layout has to be identical locally and remotely or commands see different paths.",
    k: ["Symlinks vs hard links vs copies: symlinks are cheapest, but some tools resolve them to real paths and escape; copies are safest but cost space and time.", "Reusing a staged tree between actions vs rebuilding per action: faster, but shared state can leak between actions."],
    p: ["A tool resolves a symlink and then reads a sibling file not in the declared set, which works only on the local path.", "A huge shared toolchain tree is staged for every action and dominates the runtime."],
    v: "Stage the inputs for one action and list the directory. It should contain exactly the declared files at their expected paths, with unrelated source files absent.",
    dep: ["sandboxing", "merkle-directory-trees", "path-and-symlink-handling"]
  },
  "environment-control": {
    s: "Defines exactly which environment variables, working directory, locale and time an action sees, so results do not depend on the developer's shell.",
    d: "The engine starts each action with a clean environment containing only variables the rule or toolchain set, plus a small allowlist such as a temporary directory. Locale, time zone and user are fixed. Variables a rule wants from the user's shell are inherited by name and then included in the action key. Tools that derive output from the clock can be given a fixed timestamp. It is hard because many tools consult variables nobody realized they used, such as a language or home directory, and each leak makes outputs differ across machines.",
    k: ["Clean environment plus explicit inheritance vs inheriting everything: reproducible and shareable results, but tools needing a variable fail until it is added.", "Fixing the clock for actions vs real time: deterministic outputs, but tools that validate certificates or expiry misbehave."],
    p: ["A locale variable changes sort order in a tool's output, so generated files differ between machines.", "An inherited variable included in the key makes each developer's keys distinct."],
    v: "Run the same action with two different user environments. Output digests and the action key should match; an intentionally inherited variable should change the key when its value changes.",
    dep: ["actions", "action-key", "hermeticity"]
  },
  "output-collection": {
    s: "Gathers the files an action produced, verifies the declared ones exist, stores them, and records digests, sizes and exit status as the action's result.",
    d: "After the command exits, the engine checks that every declared output exists and has the expected type, moves or copies it into the output tree or store, computes digests, and builds the result record with the exit code and captured streams. Undeclared files left in the working directory are ignored or reported. Outputs can be directories whose contents are listed in a tree. It is hard because the result must be recorded atomically with the outputs, and output permissions, symlinks and file modes must be preserved faithfully.",
    k: ["Strict declared outputs vs capturing whatever appears: clear contract and clean caches, but tools with variable output names need an enclosing directory output.", "Moving outputs vs copying: faster and no duplicate storage, but a failure midway leaves a partly moved result."],
    p: ["An action that fails after writing partial outputs leaves files that look valid to the next build.", "Executable bits lost during collection make a cached binary fail to run when replayed."],
    v: "Run an action that produces a file with execute permission, then replay it from the cache on another machine. The replayed output should have identical digest and mode and should execute.",
    dep: ["actions", "action-result", "content-addressable-store"]
  },
  "persistent-workers": {
    s: "Long-running tool processes that accept many compile requests, keeping parsed state in memory so each action avoids starting a fresh process.",
    d: "Some tools are expensive to start, especially those with large runtime startup. A worker protocol keeps one process alive per tool and configuration, and the engine sends each action as a request containing arguments and input digests, receiving success or errors in reply. The worker may keep incremental state such as parsed files. The engine may run several workers in parallel and restart them if they grow or crash. It is hard because it weakens isolation: state kept inside the worker can leak between actions, and the build is only correct if the tool is a pure function of its request.",
    k: ["Workers with in-memory state vs fresh process per action: large speedups for slow-start tools, but hidden state can make results depend on history.", "Sandboxed workers vs shared directory workers: isolation of inputs, but per-request staging costs eat part of the gain."],
    p: ["A worker caches a file's contents across requests and ignores a later change, producing a stale output.", "Workers holding memory from a large compile are never recycled and push out other work."],
    v: "Compile the same set of files with and without workers and compare outputs byte for byte, then time both. Outputs must be identical and the worker run measurably faster per action.",
    dep: ["execution-strategies", "actions", "reproducibility"]
  },
  "hermeticity": {
    s: "The property that an action's result depends only on its declared inputs, so it behaves identically on any machine and at any time.",
    d: "A hermetic build declares every input, including tools, libraries, headers and configuration, and prevents everything else from being visible: undeclared files, the network, environment variables, the clock and host-installed software. Achieving it needs sandboxes, controlled toolchains and fixed environments. The reward is that results can be cached and executed anywhere. It is hard because it is a spectrum, not a switch: each leak is found only when a build fails on a clean machine, and the work to close the last leaks is disproportionate.",
    k: ["Strict enforcement from the start vs a gradual rollout: leaks are found early, but legacy code cannot build until fixed, and migration may stall.", "Hermetic toolchains packaged with the repo vs host tools: consistent results, but large downloads and a maintenance burden."],
    p: ["A single action reading the host's system library works for years and fails when the CI image updates.", "Network access in a build step makes results depend on an outside server's content that day."],
    v: "Build on a clean machine with no development tools installed except the build client, with network disabled after fetching. The build should succeed and produce the same output digests as on the developer machine.",
    dep: ["sandboxing", "environment-control", "toolchain-definitions", "declared-inputs-contract"]
  },
  "reproducibility": {
    s: "The property that building the same inputs produces bit-identical outputs, so digests can be compared and caches shared without risk.",
    d: "Beyond hermeticity, tools themselves must be deterministic: no embedded timestamps, absolute paths or random identifiers, stable ordering of files and symbols, and fixed archive metadata. Tool flags often exist to normalize these, and some outputs are post-processed to strip variable fields. It is verified by building twice and comparing. It is hard because every tool in the chain contributes, parallel steps may merge results in different orders, and a single exception undermines early cutoff and cache hits for everything downstream.",
    k: ["Normalizing tool output with flags vs post-processing outputs: simple when tools support it, but wrappers are needed for tools that do not.", "Reproducing bits exactly vs functionally equivalent: bit identity enables digest comparison and trust, but costs effort for little behavioral value."],
    p: ["Archives with file timestamps and ordering differing per run make every package unique, so nothing is deduplicated.", "A parallel link that orders symbols by thread timing creates a different binary each build."],
    v: "Build a target twice in different directories with different system time, then compare digests of every output. They should be identical, and a diff of any mismatch should name the first differing byte offset.",
    dep: ["hermeticity", "environment-control", "content-hash-change-detection"]
  }
});
