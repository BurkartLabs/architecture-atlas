// Details for the fuzzer plate, part 1: continuous operation, triage, reduction.
ATLAS.details("fuzzer", {
  "ci-fuzzing": {
    s: "Runs fuzz targets for a short, bounded time on every change, replaying the saved corpus and mutating briefly to catch regressions before they merge.",
    d: "A job builds the fuzz targets with instrumentation, restores the stored corpus, replays every entry as a regression test, then fuzzes for a few minutes. Any crash fails the check and attaches the input. Short runs find only shallow bugs, so this stage mainly protects against reintroducing known failures and against changes that break the harness. It talks to the corpus store, the build system and the code review tool. The difficulty is time: runs must be short, deterministic enough not to flake, and cheap enough to run on every change.",
    k: ["Replay-only versus replay-plus-fuzzing: replay is fully deterministic and fast, while added mutation time catches new bugs but can fail a change for a bug it did not introduce.", "Blocking versus advisory results: blocking stops regressions at the source, but a false or unrelated crash blocks unrelated work and teaches developers to ignore the check."],
    p: ["A crash caused by an older bug fails an unrelated change, and developers learn to rerun until green.", "The restored corpus is stale after a format change, so replay exercises nothing and the check passes vacuously."],
    v: "Reintroduce a fixed bug on a branch and confirm the check fails with the original crashing input attached, then revert the change and confirm it passes.",
    dep: ["regression-replay", "corpus-store", "fuzzing-build-config"]
  },
  "continuous-fuzzing-service": {
    s: "A long-running service that keeps fuzzing the latest build of every enrolled target around the clock and feeds results to developers.",
    d: "The service watches for new builds, rebuilds targets, assigns them to workers, and keeps a persistent corpus per target so each day's work builds on the last. It collects crashes, deduplicates them, files reports and later checks whether fixes worked. It depends on the worker fleet for compute, on the corpus store for memory, and on triage for output. Hard parts are fairness between targets, preserving a corpus across code changes, and making sure a quiet dashboard means no bugs rather than a stalled campaign.",
    k: ["Always-on dedicated fuzzing versus bursts on idle capacity: dedicated runs give steady depth, while bursts are cheaper but lose scheduling continuity.", "Fresh start per build versus corpus carried across builds: carrying keeps progress but may keep inputs that no longer mean anything."],
    p: ["A broken build step silently stops fuzzing for weeks while dashboards still show the last results.", "One noisy target consumes most of the fleet because allocation ignores marginal discovery rate."],
    v: "Land a change that adds a reachable bug, and confirm the service files a report with a reproducer within its documented latency, then confirm it marks the bug fixed after the fix lands.",
    dep: ["worker-fleet", "corpus-store", "crash-deduplication", "target-onboarding"]
  },
  "change-targeted-fuzzing": {
    s: "Focuses fuzzing effort on code touched by a recent change, so a regression is found in hours instead of waiting for broad campaigns to reach it.",
    d: "The system maps a change to modified functions or blocks, then biases scheduling toward inputs that reach them, or seeds directed fuzzing at those locations. It uses coverage data from the corpus to know which inputs already reach changed code and runs them first. It talks to the version control history, the scheduler and the coverage store. The hard part is that a bug introduced by a change often manifests far from the changed lines, so narrow targeting misses it.",
    k: ["Targeting changed lines versus their callers: tight targeting is fast but misses behavior changes propagated elsewhere; wider targeting dilutes the benefit.", "Prioritizing existing corpus inputs versus generating new ones: replay is quick but cannot find paths the corpus never reached."],
    p: ["Changed code with no input reaching it yields no signal, and the run reports clean when it has tested nothing.", "Refactors that move code invalidate line-level mapping and the targeting aims at the wrong place."],
    v: "Introduce a bug in a function reached by the corpus and confirm the targeted run finds it much faster than an untargeted run of equal length, measured over several seeds.",
    dep: ["directed-fuzzing", "seed-scheduler", "coverage-reports"]
  },
  "coverage-reports": {
    s: "Reports of which code the corpus actually reaches, per target and over time, used to find blind spots in harnesses and seeds.",
    d: "A report builder replays the corpus against a coverage-instrumented build that records line, branch or function hits, then merges and renders them against source. The output shows unreached code, which usually means a harness limitation, a missing seed or a check the fuzzer cannot pass, rather than dead code. It depends on the corpus store and the instrumentation. The difficulty is that fuzz coverage is cheap to inflate by repeated runs and expensive to interpret: reaching a line says nothing about reaching it in a dangerous state.",
    k: ["Replaying the corpus versus logging coverage during fuzzing: replay is accurate and separable but costs extra compute; live logging is free but mixes in noise.", "Line coverage versus edge coverage reporting: lines are readable for people, edges match what the fuzzer optimizes, and the two can disagree."],
    p: ["A high coverage percentage is read as testing confidence even though large branches are unreachable from the harness.", "Reports built from a different build than the one fuzzed point at lines that no longer exist."],
    v: "Pick a function the report lists as unreached, add a seed or harness change that reaches it, rerun, and confirm the report now shows those lines covered.",
    dep: ["compile-time-instrumentation", "corpus-store", "edge-coverage"]
  },
  "fix-verification": {
    s: "Checks that a reported crash no longer reproduces after the fix, closes the report, and manages disclosure timelines for externally reported bugs.",
    d: "When a fix lands, the service rebuilds, replays the stored reproducer and the broader crash set, and marks the bug fixed only if all stop failing. It records the fixing change, keeps the input as a permanent regression case, and applies disclosure rules such as a deadline after which the report becomes public. It talks to the tracker, version control and the corpus. The difficulty is distinguishing a real fix from a change that merely moved the crash, so related inputs must be replayed too.",
    k: ["Closing automatically on a clean replay versus requiring a human: automation is fast and consistent, but a fix that only blocks one input can close a bug still open.", "Fixed bugs kept as regression inputs versus discarded: keeping guards against return at small storage cost."],
    p: ["A fix that handles the one reproducer leaves nearby inputs crashing and the report closes too early.", "Disclosure deadlines run on a stale fixed-date record and expose a bug whose fix was already delayed."],
    v: "Fix a known bug, then confirm the service replays the reproducer, marks the report fixed, and the input appears in the regression set, then revert the fix and confirm the replay fails.",
    dep: ["reproducer-packaging", "tracker-integration", "regression-replay"]
  },
  "target-onboarding": {
    s: "The process and tooling that take a new piece of code from nothing to a running, meaningful fuzz campaign: harness, seeds, build and acceptance checks.",
    d: "Onboarding includes writing a harness, collecting seed inputs, adding a build configuration with instrumentation and sanitizers, and checking that the target starts, runs fast, and reaches a reasonable share of code. Many systems provide a checklist or automated smoke run that rejects targets which are too slow, nondeterministic or leak state. It depends on the harness, build configuration and coverage reporting. The hard part is that a poorly designed harness looks fine and finds nothing, so quality gates must measure reach and speed.",
    k: ["A gated onboarding checklist versus a permissive one: gates keep the fleet from wasting compute on weak targets, but raise the effort that discourages contributors.", "Shared harness templates versus bespoke ones: templates are fast and consistent but fit unusual interfaces poorly."],
    p: ["A harness that returns early on malformed input passes onboarding and quietly tests only the parser's front door.", "Seeds copied from test suites encode one platform's assumptions and cut off coverage elsewhere."],
    v: "Onboard a new target, run it for ten minutes, and confirm the smoke report shows the expected executions per second, nonzero coverage growth and a stable edge count across restarts.",
    dep: ["entry-point-harness", "seed-selection", "fuzzing-build-config", "coverage-reports"]
  },
  "crash-deduplication": {
    s: "Collapses the many crashing inputs a campaign produces into a small set of distinct bugs, so people see one report per underlying defect.",
    d: "Each crash is reduced to a signature such as the failure type plus the top stack frames, or the set of coverage edges unique to it. Crashes with matching signatures form a bucket and only a representative is reported. It consumes crash records from oracles and feeds the tracker. The difficulty is that one bug can show different stacks through different callers, and different bugs can share a frame, so every signature choice both over-merges and over-splits somewhere.",
    k: ["Coarse signatures versus fine signatures: coarse merges real bugs and hides some, while fine signatures flood reports with duplicates.", "Dedup at report time versus at collection time: late dedup keeps full data for reanalysis, but early dedup protects storage during a crash storm."],
    p: ["Two distinct bugs share a top frame in a common helper and one is never reported.", "A signature includes addresses or inline frames that vary by build, so every build reports old bugs again."],
    v: "Feed a set of crashes from two known bugs reached by many different inputs and confirm the output has exactly two buckets, each with one representative and a count.",
    dep: ["stack-hash-bucketing", "crash-signal-handling", "memory-error-sanitizers"]
  },
  "stack-hash-bucketing": {
    s: "Groups crashes by a hash of their normalized call stack, usually the top several frames, as the cheapest and most common deduplication signature.",
    d: "The collector captures the stack at the failure point, drops runtime and sanitizer frames, normalizes addresses to symbols or offsets within modules, takes the top N frames, and hashes them with the failure type. N is a tuning choice. Symbolization needs debug information matching the build. It feeds deduplication and report titles. The hard part is stability: inlining, optimization levels, recursion and frames inside shared helpers change the stack for the same bug.",
    k: ["Few frames versus many frames in the hash: few frames merge variants of one bug, while many frames split the same bug across callers.", "Symbol names versus module offsets: names survive rebuilds, but offsets distinguish identically named code and need no symbolization."],
    p: ["Allocation or logging wrapper frames dominate the top of every stack and everything lands in one bucket.", "A rebuild with different inlining changes all hashes and a month of triage history no longer matches."],
    v: "Trigger the same bug through three different callers and one other bug in the same helper, and confirm the hashing places the first three together and the other bug apart.",
    dep: ["crash-signal-handling", "memory-error-sanitizers"]
  },
  "severity-classification": {
    s: "Assigns each distinct crash a severity by failure type and context, such as read versus write overflow, so people fix the dangerous ones first.",
    d: "A classifier maps oracle output to categories: an out-of-bounds write ranks above a read, a use-after-free above a null dereference, an assertion or timeout lower still. It may consider whether the crashing code processes untrusted input and whether the offset or size is attacker-influenced. It reads sanitizer reports and feeds the tracker's priority field. The hard part is that the first reported fault is the surface of a deeper problem, and a harmless-looking read can reveal an exploitable bug.",
    k: ["Rule-based severity versus analyst review: rules are fast and consistent but miss context, while analysts judge better but become the bottleneck.", "Rank by failure type versus by reachability from real entry points: type is easy to know, reachability matters more but needs analysis."],
    p: ["A null dereference in an input parser is rated low, though an attacker can use it for denial of service at will.", "Harness-only paths are rated critical though production code never takes them."],
    v: "Run the classifier on a labeled set of past crashes with known outcomes and confirm that critical and low labels match the recorded human assessment at an agreed rate.",
    dep: ["memory-error-sanitizers", "crash-deduplication"]
  },
  "exploitability-assessment": {
    s: "Estimates whether a crash gives an attacker control, for example over a write address or a function pointer, to separate security bugs from reliability bugs.",
    d: "Heuristics look at the crashing instruction, register state, whether the faulting address derives from input bytes, and heap layout around the fault. Some tools replay the input while tracking taint to see what the attacker controls. The result is a coarse label, not proof. It consumes sanitizer and core dump data and informs severity. It is hard because real exploitability depends on mitigations, surrounding code and allocator behavior that a crash site alone does not reveal.",
    k: ["Heuristic labeling versus manual exploit development: heuristics scale to thousands of crashes but are often wrong, while manual work is accurate and rare.", "Conservative versus aggressive labels: conservative labels waste attention on harmless bugs, aggressive ones let dangerous bugs sit in the queue."],
    p: ["A label of probably not exploitable is treated as a reason to defer a bug that a skilled attacker later turns into a working exploit.", "Heuristics tuned on one platform mislabel crashes on another with a different allocator."],
    v: "Run the assessment on a set of crashes with known exploits and known harmless faults and confirm it ranks the exploitable ones above the harmless ones.",
    dep: ["severity-classification", "dataflow-feedback", "crash-signal-handling"]
  },
  "reproducibility-check": {
    s: "Replays a crashing input repeatedly in a clean environment to confirm it fails every time before anyone is asked to look at it.",
    d: "The checker reruns the saved input in a fresh process, in the same build and with a clean environment, several times. It records the pass rate and whether the same failure signature recurs. Inputs that fail only sometimes go to flaky handling. It relies on the reproducer packaging for the exact setup and the deterministic environment. The hard part is that failures that depend on timing, memory layout, state left by earlier inputs or fuzzer-specific environment do not reproduce outside the campaign.",
    k: ["Replay in isolation versus replay with recent history: isolation is clean but misses state-dependent bugs that require earlier inputs.", "A fixed replay count versus adaptive retries: a fixed count is predictable, adaptive retries catch rare failures at higher cost."],
    p: ["A crash that depended on leftover state in a persistent process is dropped as unreproducible although it is real.", "Replay uses different environment variables or memory limits than the campaign and never fails."],
    v: "Take a crash from a campaign, run the check on a fresh machine from the packaged reproducer, and confirm it fails on all runs with the same signature as the campaign report.",
    dep: ["reproducer-packaging", "deterministic-environment", "state-reset"]
  },
  "root-cause-analysis": {
    s: "Works out why a crash happened, as opposed to where it surfaced, by tracing the faulting value back to the first wrong step.",
    d: "Analysts or tools use the minimized input, sanitizer allocation and free stacks, a debugger and sometimes record-and-replay to walk backward from the failure to where memory was misallocated, a length miscalculated or a state corrupted. Some tools automate this with slicing or by comparing executions of passing and failing inputs. It depends on the reduced test case and symbol information. It is hard because corruption often happens long before the crash and the visible fault is far from the bug.",
    k: ["Automated slicing versus manual debugging: automation narrows the search quickly but misses design-level causes, while manual work finds them at higher cost.", "Comparing with a near-miss input versus single-run analysis: a passing neighbor isolates the cause but needs one that exists."],
    p: ["The fix targets the crash site by adding a check, leaving the real corruption in place to appear elsewhere.", "Optimized builds drop variables and frames so the trace cannot be followed."],
    v: "On a crash with a known planted cause, confirm the analysis names the planted line as the first point where state diverges from a passing neighbor input.",
    dep: ["test-case-minimizer", "memory-error-sanitizers", "reproducer-packaging"]
  },
  "bug-report-generation": {
    s: "Builds a developer-ready report from a crash: summary, failure type, stack, reproducer, build information and a link to deduplicated duplicates.",
    d: "The generator assembles the sanitized stack, reduced input, build identifier, command to reproduce, regression range if known, and severity. It writes a title derived from failure type and top frame and attaches the input in a safe form. It reads from triage stages and writes to the tracker. The hard part is content that helps without overwhelming: a report that needs fifteen steps to reproduce is closed, and one with sensitive input data cannot be shared widely.",
    k: ["Attach the raw input versus a description of it: raw bytes reproduce exactly, while a description is safe to share but lossy.", "Auto-assigning an owner by code history versus routing to a triage queue: history is fast and sometimes wrong, queues are slower and more reliable."],
    p: ["The title is the sanitizer's generic message, so reports for different bugs look identical in a list.", "The reproduction command depends on a local path that exists only on the fuzzing machine."],
    v: "Hand a generated report to a developer who has never seen the target and confirm they reproduce the crash from the report alone on a clean checkout in a few minutes.",
    dep: ["reproducer-packaging", "severity-classification", "crash-deduplication", "test-case-minimizer"]
  },
  "tracker-integration": {
    s: "Creates, updates and closes issues in the team's tracker from fuzzer findings, linking duplicates and tracking each bug from report to verified fix.",
    d: "The integration maps each bug bucket to one issue, keyed by signature, and updates it with new counts, newer reproducers and fix status. It assigns owners, applies severity and deadlines, and reopens an issue when a fixed signature reappears. It talks to the tracker's API and to fix verification. The difficulty is idempotence and identity: signatures change across builds, reports can be filed twice under concurrency, and humans edit issues in ways the automation must respect.",
    k: ["One issue per signature versus one per input: per signature keeps queues short, per input preserves detail but floods them.", "Automatic reopen on recurrence versus a new issue: reopen preserves history, while a new issue avoids confusing a regression with the old bug."],
    p: ["A rate limit or tracker outage drops filing silently and bugs live only in the fuzzer's logs.", "Two workers file the same new signature at once and the tracker holds duplicates."],
    v: "Trigger a new bug twice from two workers at the same time and confirm exactly one issue is created, then confirm a recurrence after closure reopens it with the new input.",
    dep: ["crash-deduplication", "bug-report-generation"]
  },
  "flaky-crash-handling": {
    s: "Detects and manages crashes that do not reproduce reliably, keeping their evidence without drowning developers in unfixable reports.",
    d: "Flaky crashes come from races, timing, uninitialized values, memory layout, leftover state or the fuzzer's own environment. The handler measures reproduction rate, classifies by cause where possible, and applies thresholds: reliable crashes go to developers, flaky ones are held with counts and rerun with extra instrumentation or deterministic scheduling. It uses the reproducibility check and deterministic environment. The hard part is that flaky bugs are often the most serious ones, such as races, and the policy must not discard them.",
    k: ["Quarantine flaky crashes versus report them with a flag: quarantine protects attention, while reporting keeps real race bugs visible at some noise.", "Rerun with extra instrumentation versus accept as is: instrumentation can reveal the cause but may change timing and hide it."],
    p: ["A real race is filtered as noise because it reproduced in two out of ten runs.", "Flaky crashes caused by the harness's own state leak are reported as target bugs."],
    v: "Run a target with a known intermittent race and confirm the handler records a reproduction rate, keeps the evidence, and the report is flagged as flaky rather than discarded.",
    dep: ["reproducibility-check", "race-and-deadlock-detectors", "deterministic-environment"]
  },
  "test-case-minimizer": {
    s: "Shrinks a crashing or interesting input to the smallest version that still triggers the same failure, so it is readable and fast to replay.",
    d: "The minimizer repeatedly removes or simplifies parts of the input, reruns the target, and keeps a change if the same failure signature still appears. It uses fixed strategies such as removing blocks, zeroing bytes and shortening runs until no step helps. It talks to the execution engine and to crash signatures to decide whether the failure is the same. It is hard because the target must be deterministic, and because a looser failure match lets the reduction drift to a different bug.",
    k: ["Strict versus loose failure matching: strict keeps the reduction on the original bug but accepts fewer reductions; loose gets smaller inputs that may show another bug.", "Byte-level versus structure-aware reduction: bytes work for any format, while structure keeps the input valid and reaches a more meaningful minimum."],
    p: ["The reduced input crashes at a different location, and the report describes the wrong bug.", "Each step costs a full execution, so a slow target makes minimization take longer than the fuzzing."],
    v: "Minimize a large crashing input and confirm the result is smaller, still fails with the identical signature, and replays in one run on a clean build.",
    dep: ["delta-debugging", "crash-deduplication", "process-isolation"]
  },
  "delta-debugging": {
    s: "A systematic search that splits a failing input into parts and keeps only the parts needed to fail, guaranteeing a locally minimal result.",
    d: "The algorithm divides the input into chunks, tests the input with each chunk removed and each chunk alone, and recurses on the smaller failing one, increasing granularity until no single removal still fails. The test function is the target run plus the signature check. It guarantees a result from which no listed piece can be removed. It is hard because failure must be monotone enough, because many tests are required, and because the order and granularity of chunks affects both speed and the result.",
    k: ["Fixed granularity versus adaptive splitting: adaptive reduces the number of runs for large inputs, while fixed is simpler and predictable.", "Local minimality versus global minimum: local minimality is reachable, a true smallest input is not and would need exhaustive search."],
    p: ["A test that is nondeterministic lets a passing run discard a needed chunk and the result is wrong.", "Chunks that break the file format all fail early in parsing and the algorithm treats it as the wrong failure."],
    v: "Run delta debugging on an input with a known two-byte trigger inside a thousand bytes of padding and confirm it reduces to only the trigger bytes and required framing.",
    dep: ["test-case-minimizer", "timeout-detection"]
  },
  "structure-aware-reduction": {
    s: "Reduces an input by editing its parsed structure, removing nodes or simplifying fields, so every candidate stays valid and the result is meaningful.",
    d: "A reducer parses the input into a tree or typed record and proposes edits such as dropping a child, replacing a subtree with a simpler one or lowering a number. After each edit it serializes and runs the target. Because candidates remain well formed, far fewer attempts are wasted on inputs rejected at parse time. It depends on the grammar or schema and the serializer. It is hard because each format needs its own reducer, and the schema must stay in step with the target.",
    k: ["Format-specific reducers versus the generic one: specific reducers reach readable results quickly, and cost one implementation per format.", "Reducing the parsed form versus the bytes: the parsed form stays valid, while bytes can reach crashes that only malformed data causes."],
    p: ["A reducer that normalizes input during parsing removes the very malformation that caused the crash.", "The grammar permits more than the target does, and reduced inputs are rejected."],
    v: "Reduce a crashing structured document and confirm the result still parses, is smaller than a byte-level reduction of the same input, and still crashes with the same signature.",
    dep: ["test-case-minimizer", "grammar-definition", "input-serialization"]
  },
  "seed-recording": {
    s: "Records the random seeds, mutation choices and environment values used for each execution, so any run can be regenerated exactly.",
    d: "The fuzzer logs its random generator state or the sequence of mutation decisions for each candidate, along with settings such as time-dependent values and the build identifier. Given the base input and the record, a single candidate can be rebuilt without storing every candidate. It feeds reproducer packaging and campaign debugging. It is hard because any hidden source of randomness, such as address layout, threads or system time, breaks the record, and storing per-run logs at millions of runs is expensive.",
    k: ["Record the mutation sequence versus only the seed: sequence is robust to fuzzer changes, but needs more storage; a seed is compact and tied to exact fuzzer version.", "Log every run versus only interesting ones: full logs aid debugging at large storage cost, while sampling loses rare cases."],
    p: ["An upgrade of the fuzzer changes the random generator and old seeds no longer regenerate their inputs.", "A target that reads time or an uninitialized value makes the recorded input behave differently on replay."],
    v: "Pick a recorded run, regenerate its input from the seed record on another machine, and confirm the bytes match the stored input exactly.",
    dep: ["determinism", "mutator-selection"]
  },
  "reproducer-packaging": {
    s: "Bundles a crashing input with everything needed to rerun it: the exact build, command line, environment and any helper files.",
    d: "A package holds the reduced input, build identifier or binary, arguments, environment variables, resource limits and the expected failure signature. A single script or container reruns it and checks the signature. It is consumed by developers, the reproducibility check and fix verification. The hard part is capturing implicit inputs such as files, locale, time or network state that the harness reads, and keeping a binary or its symbols available long after the build server forgets them.",
    k: ["Ship a container or full environment versus a script and input: a container reproduces reliably but is heavy, while a script is light and relies on a matching host.", "Keep the original binary versus rebuild from source: the binary guarantees fidelity, a rebuild saves storage but may not reproduce."],
    p: ["The harness reads a file from the fuzzing machine's disk that is not in the package, so replay elsewhere does nothing.", "Symbols are pruned after a retention window and an old crash can no longer be symbolized."],
    v: "Move a package to a clean machine with no access to the fuzzing environment, run its script, and confirm the crash reproduces with the recorded signature.",
    dep: ["seed-recording", "deterministic-environment", "fuzzing-build-config"]
  },
  "regression-replay": {
    s: "Replays every saved crash input and corpus entry against new builds as ordinary tests, so previously fixed bugs and covered paths cannot silently return.",
    d: "A runner iterates the corpus and the crash archive, executes each input once against the target without mutation and fails on any crash or sanitizer report. It can run in seconds to minutes and sits in normal test runs. It consumes the corpus store and reproducer packages. It is hard to keep valuable: inputs tied to an obsolete format become inert, and a corpus that grows without limit makes replay slow enough to be dropped from the pipeline.",
    k: ["Replay the whole corpus versus a minimized subset: whole corpus is thorough but slow, a minimized set keeps coverage at a fraction of the time.", "Replay with sanitizers versus a release build: sanitizers catch silent bugs, while release builds match production behavior."],
    p: ["Replay runs against a build without sanitizers and a memory error that used to be caught passes.", "A format change rejects every stored input at the first byte and replay reports success."],
    v: "Check that a saved input for a fixed bug fails against the commit before the fix and passes after it, using only the replay command and no mutation.",
    dep: ["corpus-store", "corpus-minimization", "reproducer-packaging"]
  },
});
