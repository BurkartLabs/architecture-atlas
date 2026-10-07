// Details for the fuzzer plate, part 5: specialized strategies, process and OS support, cross-cutting concerns.
ATLAS.details("fuzzer", {
  "differential-oracle": {
    s: "Runs the same input through two or more implementations of one specification and reports any disagreement as a bug in at least one of them.",
    d: "The harness feeds an input to each implementation, normalizes the outputs or error classes into a comparable form and compares them. Disagreements show parsing differences, specification gaps and logic bugs that never crash. It needs no knowledge of the correct answer. It uses output normalization in the harness and the crash oracle. It is hard because exact equality is too strict: floating point, ordering, error text and permitted ambiguity make benign differences, so normalization decides what counts as a bug.",
    k: ["Strict equality versus normalized comparison: strict finds every difference with many false alarms, normalized is quiet and can hide real bugs inside the normalization.", "Two implementations versus many with voting: two shows a difference without saying who is wrong, many point to the outlier."],
    p: ["Both implementations share a flaw, such as one common library, and the oracle never fires.", "Benign differences, such as error message text, flood the reports."],
    v: "Plant a difference in one implementation on a specific input class and confirm the harness reports the disagreement with both outputs, and confirm identical implementations never report one.",
    dep: ["entry-point-harness", "crash-deduplication"]
  },
  "round-trip-checks": {
    s: "Properties that must hold between operations, such as decode after encode returning the original, used as oracles when no reference implementation exists.",
    d: "The harness applies an operation and its inverse and checks that the result equals the input, or applies a transformation that must not change the output, such as reordering independent items, and compares. Failures indicate logic errors that never crash. It uses the typed input handling and assertions. It is hard because the right property needs domain knowledge, properties that are true only for some inputs cause false alarms, and checks on equality must account for allowed normalization.",
    k: ["Property over all inputs versus over valid inputs: all is a stronger test and needs the target to handle bad inputs consistently, valid only is realistic and narrower.", "Cheap checks always versus costly checks sampled: always is thorough and slow, sampling keeps speed and misses rare failures."],
    p: ["The property is subtly false for edge cases that are allowed by the specification, so reports are noise.", "The round trip passes because both directions share the same bug."],
    v: "Introduce a defect that drops a field during encoding and confirm the property check reports the mismatched input on the first run that includes that field.",
    dep: ["assertions-and-invariants", "typed-structure-fuzzing"]
  },
  "api-sequence-fuzzing": {
    s: "Fuzzes a library or service through sequences of calls with generated arguments and handles, using API descriptions to keep calls valid.",
    d: "A description lists functions, argument types, constraints and which calls produce handles that others consume. The generator builds sequences by choosing a callable, producing arguments and reusing earlier results. Execution records coverage and failures. It suits libraries, system call interfaces and databases. It uses stateful harnesses and structure-aware generation. It is hard because descriptions must be written or inferred, valid sequences are rare under random choice, and reduction needs to remove calls while keeping handles consistent.",
    k: ["Typed API descriptions versus inferred usage: descriptions give valid and deep calls and cost effort, inference from tests is cheap and shallow.", "Random sequences versus guided by coverage: random is simple, guidance prioritizes sequences that reach new code."],
    p: ["The description allows calls the real library forbids, and failures are misuse rather than bugs.", "Removing a call during reduction invalidates later handles and the reducer stalls."],
    v: "Describe a small API with a known order-dependent defect, fuzz it, and confirm a minimized report listing the minimal call sequence.",
    dep: ["stateful-harness", "typed-structure-fuzzing", "input-serialization"]
  },
  "protocol-state-fuzzing": {
    s: "Fuzzes a protocol implementation by modeling its message sequence and state machine, so messages are sent in valid orders with mutated content.",
    d: "A model lists message types, legal transitions and the responses expected. The fuzzer drives the implementation to a chosen state with valid messages, then mutates the next message or sends one out of order. It may also infer the state machine from observed responses and compare it with the specification. It uses the network harness and state feedback. It is hard because states are only visible through responses, long handshakes slow each run, and encryption layers must be handled or bypassed.",
    k: ["Handwritten model versus inferred state machine: handwritten is accurate and costs effort, inferred needs less and may be partial.", "Fuzz within valid sequences versus allow arbitrary order: valid sequences reach deep states, arbitrary order finds state-confusion bugs."],
    p: ["Cryptographic handshakes cannot be mutated, so only the post-handshake messages are ever fuzzed.", "A state is reached only after a timer expires and runs take too long to cover it."],
    v: "Against an implementation with a bug in a late protocol state, confirm the model-driven fuzzer reaches that state and reports the bug, and that a model-free fuzzer in equal time does not.",
    dep: ["network-harness", "state-feedback", "stateful-harness"]
  },
  "directed-fuzzing": {
    s: "Steers the search toward a particular code location, such as a changed line or a suspected bug site, instead of toward coverage in general.",
    d: "The system computes a distance from each executed block to the target, using the call graph or control-flow graph, and favors inputs that get closer. The scheduler allocates more energy to close inputs, and may start with broad exploration then shift to focus. It uses edge feedback and the power schedule. It is useful for reproducing a reported crash, testing a patch and confirming a static analysis warning. It is hard because distance is imprecise through indirect calls and does not capture the data needed to reach the site.",
    k: ["Static distance versus dynamic feedback: static distance is cheap and imprecise, dynamic feedback is accurate and builds slowly.", "Focus fully on the target versus mixed with general coverage: full focus is faster when the path is easy and can get stuck, mixed is robust and slower."],
    p: ["The target is reachable only through an indirect call the analysis cannot see, so distance is wrong.", "The search converges near the target at a point guarded by an unsatisfiable condition."],
    v: "Pick a known deep location in a target and confirm directed fuzzing reaches it faster than undirected fuzzing across repeated runs, with the time to first hit recorded.",
    dep: ["edge-coverage", "power-schedules", "compile-time-instrumentation"]
  },
  "hybrid-fuzzing": {
    s: "Pairs a fast mutation-based fuzzer with symbolic execution, which solves for inputs that pass conditions mutation cannot satisfy.",
    d: "When the fuzzer plateaus at a branch it cannot flip, the system takes a corpus input that reaches the branch, runs it symbolically to collect path constraints, negates the constraint for the blocked branch and asks a solver for an input. That input goes back to the corpus. The fuzzer handles breadth and the solver handles precise conditions such as checksums and nested comparisons. It uses the corpus store and campaign phase control. It is hard because symbolic execution is slow, scales poorly with path length, and the two engines must exchange work without stalling each other.",
    k: ["Run the solver on demand at plateaus versus continuously: on demand saves compute and starts late, continuous finds branches early and uses cores.", "Share corpus both ways versus one way: both ways lets the fuzzer extend solver inputs and adds sync cost."],
    p: ["The solver times out on long paths, so the expensive engine contributes little.", "Symbolic models of library calls are incomplete and the generated inputs do not actually flip the branch."],
    v: "On a target with a hash-checked branch, confirm hybrid mode passes the branch and the fuzzer alone does not within the same time, and check that the solver's input actually exercises the new edge.",
    dep: ["phase-control", "corpus-synchronization", "comparison-feedback"]
  },
  "process-isolation": {
    s: "Runs each target instance in its own operating-system process, so crashes, hangs and corruption cannot reach the fuzzer or other instances.",
    d: "The fuzzer or its supervisor starts the target as a child process, controls its input, resources and lifetime, and learns the outcome from the exit status and shared memory. A crash only ends one child. Isolation costs process creation and context switches, which fork servers and persistent modes reduce. It underlies every out-of-process mode. It is hard because a child that stays alive after a crash, spawns processes of its own or holds files open makes cleanup unreliable.",
    k: ["Separate process per target versus in-process: separate is safe and slower, in-process is fastest and fragile.", "Kill whole process group versus only the child: group killing prevents orphans, and requires care not to kill the fuzzer itself."],
    p: ["Orphaned child processes accumulate after crashes and consume the machine's memory.", "A child holds the shared memory segment after the fuzzer exits, leaving leaked system resources."],
    v: "Crash and hang the target repeatedly over an hour and confirm the process count and open resource count return to baseline after each run.",
    dep: ["resource-limits"]
  },
  "shared-memory-channel": {
    s: "A memory region mapped by both the fuzzer and the target, used to pass the input and return coverage without copying through files or pipes.",
    d: "The fuzzer creates a shared segment holding the coverage array and sometimes the input buffer, and passes its identifier to the child through the environment. The target's instrumentation writes coverage directly into it, and the fuzzer reads it after each run. Control messages travel over a small pipe. It makes per-run overhead microseconds. It uses operating-system shared memory. It is hard because segments persist after crashes if not removed, and a target writing wildly can overwrite the channel.",
    k: ["Shared memory for input versus a file: shared is fastest and size-limited, a file is simpler and slower.", "Coverage array reset each run versus incremental clearing: full reset is simple and costs proportional to map size, incremental needs tracking."],
    p: ["Stale segments from killed runs fill the system's shared memory quota and new instances fail to start.", "A stray write by the target corrupts the coverage array and invents coverage."],
    v: "Run the target, check the segment is mapped in both processes, then kill the fuzzer and confirm the segment is released and no leftover remains.",
    dep: ["process-isolation"]
  },
  "resource-limits": {
    s: "Operating-system limits on memory, processes, files, CPU time and disk that stop a misbehaving target from harming the host or other instances.",
    d: "The supervisor sets per-process limits before the target starts and may place it in a control group with caps on memory, CPU share and process count. Exceeding the limit ends the process with a signal or an error return, which the fuzzer interprets. Disk quotas stop crash storms from filling storage. It supports isolation and exhaustion oracles. It is hard because a limit that is too tight hides legitimate behavior, and the failure mode looks like a crash or a hang unless the supervisor distinguishes them.",
    k: ["Tight limits versus generous: tight limits catch abuse quickly and report ordinary heavy inputs, generous ones are quiet and let a few runs hog the host.", "Per-process limits versus group-level: per-process is simple and bypassed by child processes, group limits are complete and need privileges."],
    p: ["A memory limit kills the process and the failure is reported as an unexplained crash.", "No disk limit lets a crash storm fill the filesystem and stop every instance."],
    v: "Run an input that allocates unbounded memory and confirm the process is stopped at the configured limit, the report states the limit was hit, and neighbors on the host are unaffected.",
    dep: ["process-isolation"]
  },
  "deterministic-environment": {
    s: "Controls everything outside the input that could change a run, such as time, randomness, locale, memory layout, thread scheduling and environment variables.",
    d: "The supervisor sets fixed seeds, a fixed clock source, an empty or fixed environment, a fixed working directory and, where possible, disabled address randomization. Threads are limited or scheduled deterministically. The same input then produces the same path and the same crash. It underlies reproduction, minimization and corpus replay. It is hard because not every source can be controlled: hardware timing, real network and concurrency leak in, and the more that is fixed the further the run is from production behavior.",
    k: ["Fix address layout versus allow randomization: fixed layout makes crashes reproducible, randomized layout finds bugs that depend on layout and makes them elusive.", "Single-threaded execution versus real threads: single-threaded is deterministic and misses concurrency bugs, real threads find them and vary."],
    p: ["The campaign and the replay use different environment variables, and crashes do not reproduce.", "A target reads the time or process id and takes different paths each run."],
    v: "Run the same input one hundred times in the controlled environment and confirm identical coverage maps, output and exit status on every run.",
    dep: ["process-isolation", "resource-limits"]
  },
  "virtualization-layer": {
    s: "A virtual machine or emulated system that hosts the target, giving snapshots, device control and containment for targets that cannot run as plain processes.",
    d: "A hypervisor or system emulator runs a guest operating system or firmware image, exposes memory and registers for snapshots, and can record coverage from the hardware or the emulator. Fuzzers restore guest state quickly and inject inputs through memory or devices. It supports kernel, firmware and whole-system targets. It is hard because virtual machines are heavier than processes, guest and host timing diverge, and device models must be complete enough for the guest to boot and run.",
    k: ["Hardware virtualization versus full emulation: hardware virtualization runs near native speed and needs host support, emulation runs anywhere including foreign instruction sets and is slower.", "Snapshot restore per input versus reboot: restore is orders of magnitude faster and requires complete state capture."],
    p: ["Guest time and host time drift, so timeout decisions and logs disagree.", "An unmodeled device blocks the guest at boot and the campaign never starts."],
    v: "Boot the guest, take a snapshot, run an input, restore, and confirm the restored state matches the snapshot byte for byte in the pages that were tracked.",
    dep: ["resource-limits"]
  },
  "execution-speed": {
    s: "How many inputs per second the whole pipeline runs, which bounds how much of the search space a campaign can cover in a fixed time.",
    d: "Speed is set by the harness, the execution mode, instrumentation overhead, sanitizer cost, input size and synchronization. Moving from process-per-input to persistent mode, trimming inputs and removing logging each give large factors. Speed shapes every other decision: a slow target needs smarter mutation, a fast one benefits from sheer volume. It touches every layer. It is hard because optimizations conflict with isolation and determinism, and the cheapest speedups change the target's behavior.",
    k: ["Persistent and in-process modes versus isolated runs: persistent is fast and leaks state between runs, isolated runs are slow and trustworthy.", "Heavier oracles versus raw speed: sanitizers find silent bugs and cost several times in speed, bare builds find only crashes faster."],
    p: ["A harness that logs or allocates heavily runs ten times slower than needed and no one measures it.", "Large inputs slow every stage and the corpus drifts toward bigger entries."],
    v: "Report executions per second per instance and compare against a trivial empty harness on the same machine, and confirm the overhead of each layer is accounted for in the breakdown.",
    dep: ["persistent-mode", "throughput-accounting", "compile-time-instrumentation"]
  },
  "determinism": {
    s: "Whether the same input always produces the same path and result, which reproduction, reduction, deduplication and the coverage signal all depend on.",
    d: "Nondeterminism enters through time, randomness, threads, uninitialized memory, address layout, environment, leftover state and the network. It makes coverage unstable, so inputs are admitted for noise; it makes crashes irreproducible, reduction fails and deduplication splits. Controlling it means stubbing the environment, restarting state and fixing seeds. It touches the harness, the oracles, triage and reduction. It is hard because some of the interesting bugs are exactly the nondeterministic ones, and removing nondeterminism removes the chance to see them.",
    k: ["Force determinism versus tolerate it: forcing makes the pipeline reliable and hides nondeterministic bugs, tolerating finds them and complicates everything downstream.", "Verify stability up front versus assume it: checking each admitted input repeatedly costs runs and keeps the corpus clean."],
    p: ["Unstable edges inflate the corpus with inputs that add nothing on replay.", "A crash seen once never reproduces and the report is closed, though a race caused it."],
    v: "Run each corpus entry repeatedly and compare coverage maps, and report the fraction of entries with unstable edges and the fraction of crashes that reproduce on replay.",
    dep: ["deterministic-environment", "environment-stubs", "state-reset"]
  },
  "validity-vs-depth": {
    s: "The balance between inputs valid enough to get past parsing and checks, and inputs malformed enough to exercise error handling and unexpected states.",
    d: "Structure-aware generation produces deep, valid inputs and rarely tests error paths; raw byte mutation tests error paths and is stopped by early validation. Checksums, length fields and magic values can be relaxed in a fuzzing build, fixed up by mutators or satisfied by feedback. Most targets need both, in some mix. It touches harnesses, mutation, grammar tools and the build. It is hard because the right mix is unknown in advance, and a campaign that only generates valid inputs misses the parser bugs that matter.",
    k: ["Valid-by-construction inputs versus raw mutation: valid inputs go deep quickly, raw mutation finds parsing bugs, and a mix needs more machinery.", "Relax checks in the fuzzing build versus keep them: relaxing reaches deeper code and tests code differently from production."],
    p: ["A campaign gets a good coverage number on valid inputs and never sends the malformed ones where memory-safety bugs live.", "A fixed checksum makes every mutation rejected at the first check."],
    v: "Measure the share of executions that pass each validation stage and the coverage in each stage, and confirm both malformed and well-formed inputs reach their intended code.",
    dep: ["grammar-based-generation", "custom-mutators", "comparison-feedback"]
  },
  "feedback-signal-quality": {
    s: "How well the signal that decides which inputs to keep, usually code coverage, matches what is actually valuable for finding bugs.",
    d: "Coverage is a proxy. It misses state, data values and deep conditions, it is polluted by unstable edges and map collisions, and it rewards inputs that take many paths without being closer to a bug. Better signals add comparison values, hit counts, state annotations or distance to a target, at some cost. It determines the corpus, the schedule and the dedup of inputs. It is hard because there is no direct measure of bug-finding potential, and every signal is exploited by the search in ways its designers did not intend.",
    k: ["Richer signals versus simple coverage: richer signals find more and enlarge the corpus and slow everything, simple coverage is robust and blind to state.", "Trust the signal versus verify admissions: verifying removes noise at the cost of repeat runs."],
    p: ["A noisy signal fills the corpus with inputs that look new and are not, and the campaign stalls.", "Coverage growth is reported as progress while the interesting code behind a state remains unreached."],
    v: "Measure what share of admitted inputs reproduce their new coverage on replay, and compare bugs found over time between signal variants on target programs with known planted bugs.",
    dep: ["edge-coverage", "hit-count-bucketing", "map-sizing-and-collisions", "state-feedback"]
  },
  "isolation-and-safety": {
    s: "Keeping a target that is designed to misbehave from damaging the fuzzer, other instances, the host or anything else it can reach.",
    d: "Fuzzed targets crash, hang, exhaust memory, write odd files, spawn processes and open network connections. Containment uses processes, resource limits, sandboxes, virtual machines and stubs for external effects. Inputs may also be dangerous: a corpus may contain real malware, personal data or a working exploit and needs access control. It touches execution, platform and storage. It is hard because stronger isolation costs speed, and a target with a real side effect, such as deleting files, needs a stub, not a sandbox.",
    k: ["Strong isolation versus speed: virtual machines contain anything and run slowly, processes are fast and share the kernel.", "Real dependencies versus stubs: real ones give realism and risk, stubs are safe and miss integration bugs."],
    p: ["A fuzzed target with network access sends requests to real services or the internal network.", "Crash artifacts containing real user data are published in a public tracker."],
    v: "Run a target that attempts to write outside its directory and open outbound connections and confirm both are blocked and logged, and that the host's state is unchanged afterward.",
    dep: ["process-isolation", "resource-limits", "environment-stubs", "virtualization-layer"]
  },
  "compute-budget": {
    s: "How much machine time a campaign gets and how it is spent across targets and strategies, since fuzzing converts compute into bugs at a diminishing rate.",
    d: "Discoveries follow a curve: many early, then rarer as the easy paths are used up, so each additional core hour buys less. Budget decisions include how many cores per target, how long to run, when to stop, and how to mix cheap and expensive techniques. Cost sets the whole design, from preemptible capacity to corpus minimization. It touches scheduling, scale and operations. It is hard because the value of an extra hour is unknown, and a plateau is the same whether the target is clean or the fuzzer is stuck.",
    k: ["Run long on few targets versus short on many: long runs reach deep bugs and many short runs cover more code with shallow bugs.", "Spend on expensive techniques versus more cheap runs: techniques such as solver assistance reach special conditions, and plain volume is simpler and often better value."],
    p: ["A budget spread evenly keeps feeding exhausted targets while new code gets none.", "Cost cutting by shortening runs removes the late discoveries that account for most serious bugs."],
    v: "Track distinct bugs found per core hour per target over several weeks and confirm the allocation follows the marginal yield, with reasons recorded for each reduction.",
    dep: ["time-budgeting", "worker-fleet", "campaign-stats"]
  },
});
