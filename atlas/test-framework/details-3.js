// Details for the test framework plate, part 3: isolation and execution, timeouts and flakes, measurement.
ATLAS.details("test-framework", {
  "process-isolation": {
    s: "Runs each test file, or each test, in its own operating system process so that memory, globals, handles and crashes cannot leak between tests.",
    d: "A fresh process gets its own address space, environment, working directory and file descriptors. Nothing the test does to global state survives it, and a crash or infinite loop affects only that process, which the parent can kill. The cost is startup: launching a runtime, loading the framework and the code under test for every unit. Mitigations include fork-based startup from a warm template process and reusing a process for several units with a reset in between. The hard part is choosing the unit of isolation.",
    k: ["Process per file versus per test: per file amortizes startup, but tests within a file can still contaminate each other; per test is cleanest and slowest.", "Fresh start versus fork from a warm parent: forking is fast, but inherits the parent's state and open handles, which can quietly leak."],
    p: ["A file of ten thousand fast tests pays process startup once per test and the suite takes an hour.", "Child processes inherit open file descriptors or ports from the parent and hold them after the test ends."],
    v: "Set a global variable in one test and confirm a test in another file sees it unset. Crash a test with an abort and confirm the parent reports that single test as crashed while all others complete.",
    dep: ["process-spawner", "worker-pool", "global-state-reset"]
  },
  "module-registry-reset": {
    s: "Clears the cache of loaded modules between tests or files so that code under test is freshly evaluated and holds no state from an earlier test.",
    d: "Most module systems cache each module's exports after first load, so module-level state persists for the process's life. The runner can wipe the cache between files, or give each file a private registry, so each test file gets fresh copies. Tests can also request an uncached reload of one module, which is how mocks of imports are installed. Hard parts are performance (re-evaluating a large dependency tree for each file), identity (two copies of the same class that fail instance checks) and native extensions that cannot be reloaded.",
    k: ["Private registry per file versus a shared cache: private registries isolate state, but re-evaluate common libraries for every file.", "Reset between tests versus between files: per test is cleaner, but multiplies the load cost and can break caches meant to be shared."],
    p: ["A class loaded in two registries fails an instance check across the boundary, giving errors that say a value is not an instance of its own type.", "Module-level singletons keep state across tests because the registry was only reset between files."],
    v: "Increment a module-level counter in one test and confirm the next file sees zero. Count module evaluations of a large dependency across ten files and confirm it matches the expected one per file.",
    dep: ["module-loader", "sandboxed-realms", "global-state-reset"]
  },
  "in-process-runner": {
    s: "Executes tests directly in the runner's own process, with no child processes, for the fastest startup and simplest debugging at the price of weaker isolation.",
    d: "The runner imports each test file and calls the test functions in sequence in one process. There is no serialization boundary and no startup cost per file, so small suites finish almost instantly and debuggers attach trivially. Isolation depends on conventions and explicit resets, and a hang or crash takes the runner with it. Many frameworks use it as a mode for single-file runs, debugging and tiny suites. Hard parts are cleaning up between tests and surviving test failures that corrupt the process.",
    k: ["In-process versus workers: in-process is fastest for small runs and easy to debug, but one crash or leak ruins the entire run.", "Run serially versus allow concurrency inside the process: concurrency uses async waits well, but interleaves state of tests that were written as if alone."],
    p: ["A test calls a function that terminates the process and the runner exits with no report at all.", "An uncaught error from a previous test's background work fails an unrelated later test."],
    v: "Run a single-file suite in-process and compare its result set to the same suite in worker mode. Then include a test that calls exit and confirm the run reports it, instead of vanishing.",
    dep: ["test-lifecycle-machine", "debugger-attach"]
  },
  "sandboxed-realms": {
    s: "Evaluates each test file inside a separate execution context within one process, with its own globals and built-ins, giving cheap isolation without process startup.",
    d: "The runtime offers separate contexts, each with its own global object, so one file's changes to built-ins or globals do not affect another's. The runner supplies the environment objects the test expects (a simulated document, timers, console) into the context. This is much faster than a process per file. Limits are leaks across the boundary: values passed in from the outer context have different built-in prototypes, so type checks fail, and native resources, such as handles, are shared.",
    k: ["Contexts in one process versus separate processes: contexts start in microseconds, but share memory, handles and fatal crashes.", "Provide a simulated environment versus the real one: a simulation runs anywhere and fast, but differs from the real environment in ways tests may depend on."],
    p: ["An array created outside the context fails an array check inside it, producing baffling assertion failures.", "A memory leak in one context is invisible until the whole worker process runs out of memory."],
    v: "Modify a built-in prototype in one file and confirm another file in the same worker sees the original. Pass an array across the boundary and confirm the runner's own checks handle it as an array.",
    dep: ["module-registry-reset", "global-state-reset", "worker-protocol"]
  },
  "global-state-reset": {
    s: "Restores shared global state, such as environment variables, timers, mocks, working directory and registered handlers, to its original values after each test.",
    d: "The runner snapshots what it can control before a test and restores it afterward: environment variables, the working directory, mock registries, fake timers, event listeners it installed and sometimes the process arguments. For state it cannot see, it relies on fixtures with teardown. Strict modes can detect leaks by comparing before and after, and fail the offending test. Hard parts are that global state is unbounded (any library may hold some) and that resets must run even after failures and timeouts.",
    k: ["Automatic reset of known globals versus explicit cleanup by authors: automatic reset is reliable for what it covers, but creates false confidence about everything else.", "Detect and fail on leaks versus silently reset: detection finds the polluter, but adds overhead and noise."],
    p: ["A test changes an environment variable and a later test in the same worker passes or fails depending on its position.", "Reset runs after the test but not after a timeout kill, so the next test inherits a half-restored state."],
    v: "Set an environment variable and change the working directory inside one test, then confirm in the next test that both have their original values. Fail and time out a test and repeat the check.",
    dep: ["test-lifecycle-machine", "mocks-and-spies", "clock-control"]
  },
  "test-lifecycle-machine": {
    s: "The state machine each test passes through (pending, running, passed, failed, skipped, timed out, errored) with defined transitions, and the single place where results are decided.",
    d: "Each test moves through pending, setup, running, teardown and a final state. The machine decides precedence when several things happen: a body that passes but whose teardown throws is a failure, a timeout during teardown is reported with the original result attached. It emits an event on each transition, which reporters and plugins consume. A well-specified machine is what makes retries, soft assertions, expected failures and interruption consistent. Hard parts are overlapping events, cancellation and the semantics of nested hooks.",
    k: ["A distinct errored state versus folding it into failed: distinguishing errors from assertion failures helps triage, but adds a state every consumer must handle.", "Teardown failure fails the test versus is reported separately: failing the test makes leaks visible, but blames a test for cleanup problems."],
    p: ["A late event from an abandoned test run arrives after the next test started and flips the wrong test's state.", "A test whose body passed but whose teardown failed is reported as passed because only the body was inspected."],
    v: "Make a test pass but throw in its teardown and confirm the final result is failed with the teardown error attached. Interrupt a run and confirm every started test ends in a defined state, not pending.",
    dep: ["lifecycle-hooks", "timeouts", "event-stream"]
  },
  "worker-protocol": {
    s: "The messages workers and the coordinator exchange: run this unit, here is a result, I am alive, stop; defined as serializable data so workers can be threads, processes or machines.",
    d: "The coordinator sends task messages with file paths, filtered test IDs, options and seeds; the worker replies with events (test start, test end, log, error) and a final summary. Only plain data crosses the boundary, so functions, class instances and errors must be serialized in a lossless form, including stack traces. Heartbeats let the coordinator detect hung workers. The protocol is versioned when workers run on other machines. Hard parts are back pressure on large outputs, preserving error detail and message ordering.",
    k: ["Streaming events as they happen versus a single result at the end: streaming gives live progress and partial results after a crash, but multiplies messages and needs ordering guarantees.", "Serialize errors to plain data versus pass references: plain data crosses any boundary, but loses custom fields and cause chains unless handled."],
    p: ["An error object with a circular reference cannot be serialized and the worker reports a transport error instead of the real failure.", "A very large log message blocks the channel and heartbeats stop, so a healthy worker is killed as hung."],
    v: "Capture the messages of a run and confirm every test has a start and end event in order, and a failing test's error carries its message, stack and cause fields after crossing the boundary.",
    dep: ["process-spawner", "event-stream", "hang-detection"]
  },
  "hermetic-environment": {
    s: "Runs tests in a controlled environment with fixed locale, time zone, working directory, temp space and network policy, so results do not depend on the machine.",
    d: "Hermeticity means the test's outcome depends only on declared inputs. The runner sets or clears environment variables, uses a private temp directory, pins the time zone and locale, supplies a fixed home directory and optionally blocks network access or runs in a container. Declared inputs, such as data files, are made available at known paths. Full hermeticity is a spectrum, and the hard part is finding the leaks: undeclared dependencies on installed tools, user configuration, the clock and the machine's identity.",
    k: ["Strict sandbox versus normal environment: a strict sandbox gives reproducible results everywhere, but makes tests that legitimately use local tools hard to write.", "Fixed locale and time zone versus the machine's: fixing them removes a major class of surprises, but stops tests from catching locale bugs."],
    p: ["A test reads a file in the developer's home directory and passes only on that developer's machine.", "Time zone differences make date tests fail for a few hours each day or only on one continent's machines."],
    v: "Run the suite on two machines with different locales, time zones and home directories and compare result sets. Run it with network access blocked and confirm no test needs it unless declared.",
    dep: ["global-state-reset", "process-spawner", "environment-flags"]
  },
  "timeouts": {
    s: "Limits on how long a test, a hook or the whole run may take, so a hang becomes a clear failure instead of a stalled build.",
    d: "Each test has a default timeout, overridable per test or group, and hooks have their own. The runner starts a timer when the unit begins, and on expiry marks it timed out, runs cleanup and, if the code is stuck in synchronous work, kills the worker, since a timer cannot interrupt a busy loop. A global run timeout provides an outer bound. The difficulty is that a single number does not fit: it must tolerate slow machines yet stay short enough to give feedback, and expired tests may keep running in the background.",
    k: ["A generous default versus tight: generous defaults avoid flakes on slow machines, but make a real hang cost minutes per test.", "Cooperative cancellation versus killing the worker: cooperation preserves the worker and cleanup, but cannot stop synchronous loops, while killing always works and loses state."],
    p: ["A timed-out test keeps running and its late failure is blamed on the next test.", "Timeouts are raised after each flake until tests quietly take far too long to fail."],
    v: "Write a test that sleeps beyond its limit and confirm it is marked timed out at about the limit, with its cleanup run. Write one that spins in a synchronous loop and confirm the worker is killed and replaced.",
    dep: ["test-lifecycle-machine", "hang-detection", "crash-recovery"]
  },
  "hang-detection": {
    s: "Notices workers that are alive but making no progress, using heartbeats and output silence, and takes action when a test timer alone would not fire.",
    d: "The coordinator expects events or heartbeats from each worker. If none arrives within a window, it declares a hang, collects diagnostics such as a stack dump or the list of open handles, then kills the worker and fails the current test. This covers cases a per-test timeout cannot: a hang in a hook, a blocked event loop, a deadlock in native code, or a worker that stopped before reporting. Hard parts are false positives during legitimately long tests and capturing useful diagnostics from a stuck process.",
    k: ["Heartbeats from a separate thread versus from the main loop: a separate thread detects a blocked loop, but then reports alive for a process that is stuck.", "Kill immediately versus capture diagnostics first: diagnostics make the hang debuggable, but delay recovery and can themselves hang."],
    p: ["A legitimately long test produces no events and is killed as hung.", "The hang is reported only as a timeout of the whole run, with no hint of which test or file was stuck."],
    v: "Introduce a test that deadlocks and confirm the run identifies the test by name within the heartbeat window, prints a stack or handle listing and continues with other work on a replacement worker.",
    dep: ["worker-protocol", "worker-pool", "timeouts"]
  },
  "retries": {
    s: "Reruns a failed test a limited number of times and records every attempt, so transient failures do not block a build while still being counted.",
    d: "On failure, the runner re-executes the test in a fresh state, optionally in a fresh worker, up to a limit. A test that passes on a later attempt is marked flaky, not simply passed, and its attempts are all kept in the results. Retry can apply to everything, to tagged tests or only to specific failure types. It must also rerun fixtures and teardown correctly. Hard parts are that retries make the suite green while hiding unreliable tests, and consume time and resources.",
    k: ["Retry in CI versus locally: CI retries protect the pipeline, but local runs without them show every flake to the developer who can fix it.", "Retry in place versus in a fresh worker: in place is fast, but a polluted worker can make every retry fail the same way."],
    p: ["A test that fails one run in two always passes with three attempts, and the team stops seeing a real race condition.", "The reporter shows only the final attempt, so the failing attempts and their logs are lost."],
    v: "Run a test that fails the first attempt and passes the second and confirm the result is marked flaky with both attempts recorded, and the exit code follows the configured policy for flaky tests.",
    dep: ["test-lifecycle-machine", "flaky-detection", "structured-results"]
  },
  "flaky-detection": {
    s: "Identifies tests whose outcome changes without any code change, using retry results, repeated runs and history, and quantifies how unreliable each one is.",
    d: "Evidence comes from retries that flip a result, from the same commit passing and failing in different runs, and from deliberate repeated execution of a test many times, sometimes under stress such as limited CPU or random order. The system computes a flake rate per test and flags those above a threshold. Output feeds quarantine decisions, dashboards and owners. Hard parts are separating flakes from real intermittent bugs in the product, and attributing the cause, since many flakes depend on shared infrastructure rather than the test.",
    k: ["Detect from history versus by repeated runs: history is free and passive, but needs a lot of data, while repeated runs are decisive but cost compute.", "Treat any flip as flaky versus require a rate: any flip catches everything, but a one-off infrastructure blip marks a healthy test."],
    p: ["An intermittent race in the product is classed as a flaky test and quarantined, so the real bug ships.", "Stress runs expose failures that only occur under unrealistic load and flood the team with noise."],
    v: "Run a known flaky test one hundred times and confirm the detector reports a flake rate close to its true rate. Run a stable test the same way and confirm it is not flagged.",
    dep: ["retries", "result-history", "ordering-and-randomization"]
  },
  "quarantine": {
    s: "Moves known-flaky or broken tests out of the blocking set while still running and recording them, with an owner and an expiry so they are not forgotten.",
    d: "A quarantine list, in code or in a data file, names tests whose failures do not fail the build. They continue to run so their reliability is measured, and a report shows how long each has been quarantined and who owns it. Rules can require a linked work item and a deadline, after which the test is fixed, deleted or fails the build again. Hard parts are governance: quarantine is easy to enter and hard to leave, and it silently removes protection from the code the test covered.",
    k: ["Run quarantined tests versus skip them: running keeps measuring and shows when they recover, but spends compute on non-blocking results.", "Automatic quarantine from statistics versus human decision: automatic is fast and consistent, but can hide a real regression that merely looks flaky."],
    p: ["The quarantine list grows without limit and the suite's real coverage shrinks while staying green.", "A test covering a critical path is quarantined for months and a regression there reaches production."],
    v: "Quarantine a failing test and confirm the build passes while the report lists it with its owner and age. Let its expiry pass and confirm the build begins failing on it again.",
    dep: ["flaky-detection", "test-metadata-and-tags", "structured-results"]
  },
  "crash-recovery": {
    s: "Detects that a worker died mid-test, attributes the crash to the right test, replaces the worker and carries on with the remaining work.",
    d: "The coordinator notices an exit or a lost connection, finds the test or file the worker was running and reports it as crashed, with captured output, exit signal and any core data. Remaining tests of that file are either rescheduled or marked not run. A new worker takes the slot. Repeated crashes of the same unit lead to giving up on it. Hard parts are attribution when several tests were in flight, native crashes that leave no message, and avoiding a crash loop that burns the entire run.",
    k: ["Reschedule the rest of the file versus mark as not run: rescheduling recovers coverage, but a deterministic crash then repeats and delays the run.", "Retry the crashing test versus fail immediately: retrying handles one-off kills by the system, but wastes time when the crash is deterministic."],
    p: ["A crash reports only that the worker exited, with no output of the test, because buffered output was lost.", "An out-of-memory kill is blamed on whichever test was running, not the one that leaked."],
    v: "Make one test abort the process and confirm that test is reported crashed with its exit signal, other files still complete and a replacement worker handles later work, all in the final counts.",
    dep: ["worker-pool", "worker-protocol", "process-spawner", "output-capture"]
  },
  "leak-detection": {
    s: "Detects tests that leave behind open handles, pending timers, child processes, unclosed connections or growing memory, and reports the test responsible.",
    d: "After each test or file, the runner inspects what is still alive: active handles and timers from the runtime, child processes, listening sockets, temp files, and optionally heap growth after a forced collection. Leftovers are reported with the creation site, or fail the test in strict mode. Unclosed resources are why runs fail to exit and why workers consume more memory over time. Hard parts are discriminating intended long-lived resources from leaks and capturing creation stacks cheaply.",
    k: ["Fail on leaks versus warn: failing keeps the suite clean, but a single third-party library that leaves a timer then blocks everyone.", "Check after every test versus after the file: per test pinpoints the culprit, but is costly and misses leaks that only appear from combinations."],
    p: ["The runner never exits because one test left a server listening, and CI hangs until its overall timeout.", "Memory grows by a few megabytes per test and workers are killed late in the run, far from the leaking test."],
    v: "Leave a timer and an open server in a test and confirm the report names the test and shows where each was created. Run a clean suite and confirm the process exits promptly after the last result.",
    dep: ["test-lifecycle-machine", "process-spawner", "global-state-reset"]
  },
  "bail-and-fail-fast": {
    s: "Stops the run after a set number of failures and cancels pending work, so a broken build returns feedback in seconds instead of running every remaining test.",
    d: "The coordinator counts failures as results arrive. When the limit is reached it stops dispatching, asks workers to stop, waits briefly for in-flight tests and finishes with a summary that says the run was cut short and how many tests did not run. This suits pre-merge checks and local loops where the first failure is the news. Hard parts are clean cancellation of running tests, consistent counts, and the fact that stopping early hides the number of other failures, which can matter for triage.",
    k: ["Stop at the first failure versus a threshold: the first failure is fastest, but a threshold shows whether the breakage is one test or many.", "Cancel in-flight tests versus let them finish: cancelling is faster, but may leave resources dirty and abandon results that were almost complete."],
    p: ["The summary reports only failures and omits that most tests never ran, which looks like a smaller problem than it is.", "In-flight tests are killed mid-teardown and leave shared resources in a bad state for the next run."],
    v: "Set a limit of one failure on a suite with an early failing test and confirm the run ends quickly, the summary states the count not run, and the exit code is non-zero.",
    dep: ["worker-pool", "failure-summary", "exit-codes"]
  },
  "coverage-instrumentation": {
    s: "Records which lines, branches and functions of the code under test execute during tests, by rewriting code, using runtime hooks or sampling.",
    d: "Source-level instrumentation inserts counters during transform, so counts are exact but build and run time grow. Runtime-native coverage asks the engine to report executed ranges and is cheaper but coarser in branches. Binary-level tools instrument compiled output. Counters are written at process exit or on demand to a data file per worker. Hard parts are source maps that keep results aligned to original files, excluding generated and test code, and getting data out of processes that crash.",
    k: ["Instrument source versus engine-reported coverage: instrumentation is precise but slows runs and changes the code, while engine reports are cheap and may miss branch detail.", "Collect always versus on demand: always collecting gives data every run at a performance cost, on demand keeps normal runs fast."],
    p: ["A worker is killed before it writes its coverage file and the report shows a large part of the code as untested.", "Instrumentation changes timing enough to turn a race-dependent test flaky."],
    v: "Run one test that calls a single function and confirm the report marks exactly that function and its executed lines as covered and the rest as uncovered, aligned to the original source lines.",
    dep: ["source-transform", "source-maps", "process-isolation", "worker-protocol"]
  },
  "coverage-merge": {
    s: "Combines coverage data from many workers, shards and runs into one coherent result, aligning files and counting a line as covered if any run covered it.",
    d: "Each worker writes raw data keyed by file path. The merger normalizes paths between machines and operating systems, sums counters or takes unions of covered ranges and handles files that appear in only some outputs. Merging across shards occurs after all shards finish. It must handle different versions of the same file (data from before and after an edit) by discarding or flagging mismatches. Hard parts are path normalization, partial data from failed shards and big data volumes.",
    k: ["Merge raw data versus merge per-shard reports: raw data merges exactly, but reports are smaller and easier to transport, losing detail.", "Include data from a failed shard versus drop it: including it keeps the number honest for what ran, but a partial shard understates total coverage."],
    p: ["Shards run on different checkouts so paths differ, and the same file appears as two files with half the coverage each.", "A missing shard output produces a lower coverage number that looks like a regression in the change."],
    v: "Split a suite across two shards and merge, then compare the merged result to an unsharded run's coverage on the same commit and confirm they match line for line.",
    dep: ["coverage-instrumentation", "sharding", "structured-results"]
  },
  "coverage-reports": {
    s: "Renders merged coverage as terminal tables, browsable annotated source and machine-readable formats, and enforces thresholds that can fail the build.",
    d: "From merged data the reporter computes percentages per file, directory and total for lines, branches and functions, and renders them as a summary, an annotated HTML view or an interchange file consumed by review tools. A gate compares to thresholds, absolute or relative to the base branch, and sets the exit status. Patch coverage restricts the measure to changed lines, which is more actionable than a global figure. Hard parts are the thresholds themselves, which create incentives that distort tests.",
    k: ["Global threshold versus changed-lines threshold: global is simple but moves slowly, while changed-lines is targeted but depends on accurate diffs.", "Hard gate versus informational: a gate enforces discipline, but leads to tests written only to cover lines."],
    p: ["A threshold is met by tests that execute code but assert nothing, so coverage rises while protection does not.", "Generated code is included in the denominator and the percentage no longer means anything."],
    v: "Lower coverage deliberately below the threshold and confirm the run exits non-zero and names the file and number. Open the annotated report and confirm uncovered lines are visibly marked in the right places.",
    dep: ["coverage-merge", "exit-codes", "ci-annotations"]
  },
  "mutation-testing": {
    s: "Makes small deliberate changes to the code under test and checks whether any test fails, measuring whether the tests would notice real bugs.",
    d: "A mutation tool generates variants by flipping operators, removing statements or altering constants. For each variant it runs the tests that cover the changed line, typically using coverage to select them. A variant that no test fails is a surviving mutant, pointing at an unchecked behavior. The result is a score of killed mutants. It is the most direct measure of test strength, but expensive: thousands of variants multiplied by test time. Hard parts are equivalent mutants that change nothing observable and cost control.",
    k: ["Run all tests per mutant versus only covering tests: all tests is simple, while covering tests cut time by orders of magnitude but depend on accurate coverage.", "Full runs versus incremental on changed code: full runs are thorough but slow, incremental fits a pull request and misses old weak spots."],
    p: ["Equivalent mutants are reported as survivors and developers waste time trying to kill unkillable ones.", "A mutant causes an infinite loop and the run stalls unless each mutant has its own time limit."],
    v: "Run it on a small function with a known untested branch and confirm the surviving mutant points at that branch. Add the missing assertion and confirm the same mutant is now killed.",
    dep: ["coverage-instrumentation", "source-transform", "timeouts", "worker-pool"]
  },
  "timing-collection": {
    s: "Measures how long each test, hook and file takes, including time spent in setup and waiting, and stores it for scheduling and slow-test reports.",
    d: "The lifecycle machine timestamps transitions using a monotonic clock. Durations are broken down into collection, setup, body, teardown and queue time. The data feeds the slowest-tests report, duration-based balancing and regressions in suite time. It should record the machine and load context, since a timing taken under contention is not comparable. Hard parts are noise from parallel execution, cold caches on the first run and distinguishing a slow test from a slow machine.",
    k: ["Measure wall time versus CPU time: wall time is what developers feel, but CPU time is stable under load.", "Record every run versus a sample: complete data is accurate for scheduling, but a sample cuts storage."],
    p: ["Durations measured with the wall clock jump when the system clock adjusts and produce negative or huge values.", "Setup cost shared by a group is attributed to the first test, which then looks slow."],
    v: "Run a suite with one test sleeping exactly one second and confirm the recorded duration is close to one second, separated from setup time, and appears at the top of the slowest-tests report.",
    dep: ["test-lifecycle-machine", "structured-results"]
  },
  "output-capture": {
    s: "Captures what each test prints to standard output, error and logging channels and attaches it to that test, shown only when it fails.",
    d: "While a test runs, the runner redirects the console and, if possible, the process's output streams into a per-test buffer. On pass the buffer is dropped or kept quietly; on failure it is printed with the failure. This keeps successful runs readable and ties noise to its source even with parallel workers. Output from native code and child processes must be captured at the stream level. Hard parts are interleaved output from concurrent tests, output after the test ended and enormous buffers.",
    k: ["Capture and show only on failure versus pass through live: capture keeps parallel output readable, but hides progress messages from slow tests.", "Cap buffer size versus keep all: caps protect memory, but may cut off the line that explains the failure."],
    p: ["Logging after a test ends goes to whichever test is current or to nowhere.", "Output from a child process bypasses capture and interleaves with the reporter's display."],
    v: "Print distinct lines from two tests running in parallel and fail one. Confirm the failure report contains only the failing test's lines and the passing test's output does not appear.",
    dep: ["worker-protocol", "process-spawner"]
  },
  "reporters": {
    s: "Components that subscribe to run events and produce output for a destination: a terminal, a file, a dashboard, a chat message or a code review tool.",
    d: "A reporter implements callbacks for run start, test start, test end, run end and sometimes logs. Several can run at once, such as a compact one on the terminal and a structured one to a file. Reporters receive plain data, so they run in the coordinator and never block workers; slow ones need buffering. Built-in choices include dot, list, tree and summary forms. Hard parts are streaming output that stays correct with parallel workers, and consistent handling of retries, flakes and skipped tests.",
    k: ["Reporters as plugins on the event stream versus built into the runner: plugins allow custom destinations, but every event field becomes a public contract.", "Several reporters at once versus one: multiple outputs serve people and machines in the same run, at the cost of more code in the hot path."],
    p: ["A custom reporter throws on an unexpected event and the run dies, or worse, silently stops printing failures.", "Reporters that differ in how they count retries show different totals for the same run."],
    v: "Run one suite with a terminal reporter and a structured-file reporter together and confirm both report the same counts and the same failing test IDs.",
    dep: ["event-stream", "plugin-api", "failure-summary"]
  },
  "structured-results": {
    s: "A machine-readable file of the full result set in a stable schema, which CI systems, dashboards and merge tools read instead of scraping terminal text.",
    d: "At the end of a run, or incrementally, the runner writes every test with its ID, status, duration, attempts, failure message, stack, output, attachments and metadata, plus run-level data such as seed, shard and environment. Common interchange formats carry a lowest-common-denominator subset, while a richer native format keeps everything. Files from shards are merged by ID. Hard parts are schema stability across versions, escaping, truncation of large fields and representing retries and skips without ambiguity.",
    k: ["Standard interchange format versus native format: the standard works with every consumer, but cannot carry flakes, attempts or attachments faithfully.", "Write once at the end versus incrementally: incremental output survives crashes, but is harder to keep consistent and to merge."],
    p: ["The run crashes before the end and no result file is written, so CI sees no data and reports nothing.", "Consumers treat a skipped test with a reason as passed because the format has no clear status for it."],
    v: "Run a suite with passing, failing, skipped and retried tests and validate the file against its schema. Confirm each test's status and attempt count match the console output.",
    dep: ["event-stream", "test-naming-and-ids"]
  },
  "live-progress": {
    s: "A terminal display that shows running tests, counts and elapsed time, updating in place on a person's terminal and falling back to plain lines when output is a log.",
    d: "The display detects whether output is an interactive terminal. On a terminal it redraws a status area with currently running files, progress counts and recent failures, using cursor control, and it prints permanent lines above it. When not interactive, as in CI logs, it prints one line per event, without escape codes. It must handle the terminal's width and resizing. Hard parts are redraw flicker, interleaving with captured logs and large worker counts, where per-worker rows would not fit.",
    k: ["In-place status area versus append-only lines: in-place is compact and friendly, but unreadable when captured to a file; append-only is always readable and long.", "Show every running test versus summary counts: details help find a stuck test, but flicker and overflow on wide pools."],
    p: ["Escape codes appear as garbage in a CI log that does not interpret them.", "A slow test gives no sign of life for minutes, so developers kill a run that was working."],
    v: "Run in a terminal and confirm the status area updates and disappears cleanly at the end. Redirect output to a file and confirm the file has only plain, complete lines with no escape sequences.",
    dep: ["reporters", "event-stream"]
  },
  "failure-summary": {
    s: "The end-of-run section that lists each failure once with its location, message, diff, relevant output and how to rerun it, ordered so the first thing to fix is first.",
    d: "After the last result, the summary prints counts by status, then each failure with test name, assertion message, diff, a stack trimmed to the author's own frames and any captured output. Retries and flakes are listed separately. Grouping identical messages avoids repeating the same cause across hundreds of failures. It is often the only part of the output a developer reads, so ordering and truncation matter. Hard parts are filtering framework frames out of stacks and long outputs.",
    k: ["Show every failure versus cap and group: showing all is complete but buries the cause; grouping and capping keeps the first problem visible at the cost of detail.", "Trim stack frames versus keep all: trimming focuses attention, but can hide a relevant frame inside a library."],
    p: ["Hundreds of failures with the same root cause fill the screen and push the first one out of the scrollback.", "A stack trace shows transformed code lines, not the author's source, because source maps were not applied."],
    v: "Cause the same error in fifty tests and confirm the summary groups them under one message with a count, shows one stack in original source coordinates and prints the rerun command.",
    dep: ["failure-diffs", "source-maps", "output-capture", "rerun-command"]
  },
  "attachments": {
    s: "Files that tests attach to a result, such as screenshots, traces, logs and recorded sessions, stored with the run and linked from reports.",
    d: "The test context offers a call to attach a file or buffer with a name and media type. The runner copies it into the run's output directory under the test's ID, records the reference in the structured results and uploads it with the other CI artifacts. Policies decide when to keep them: always, only on failure or only on first retry. Hard parts are volume (video and trace files are large), cleaning up old runs, keeping sensitive data out of attachments and making them accessible from the hosted report.",
    k: ["Keep on every run versus only on failure: always keeping helps comparison, but fills storage; failure-only is cheap but gives no baseline.", "Embed in the result file versus store as separate files: embedding gives one portable artifact, while separate files keep results small."],
    p: ["A screenshot taken on the first attempt is overwritten by the retry, so the original failure's evidence is gone.", "Attachments contain tokens or personal data that then sit in public CI artifacts."],
    v: "Fail a test after attaching a screenshot and a log, and confirm both are present in the output directory, listed in the structured results with correct names and reachable from the report's failure entry.",
    dep: ["structured-results", "retries", "reporters"]
  },
  "result-history": {
    s: "A store of results from past runs, keyed by test ID and commit, which supports flake statistics, timing, failure trends and failed-first ordering.",
    d: "After each run the results are appended to a database or a set of files, with run metadata: commit, branch, machine, seed and duration. Queries answer how often a test failed, when it first failed, whether it is slower than last week and which tests failed together. Retention limits keep it bounded. History must be tied to test identity, so renames create a gap. Hard parts are ingesting data from many shards and branches, and separating signal on main from noise on experimental branches.",
    k: ["Central service versus files in the repository or cache: a service enables fleet-wide queries, but is infrastructure to run; files are simple but local to one checkout.", "Keep every attempt versus the final result: every attempt is needed to see flakes, but multiplies storage."],
    p: ["Results from broken experimental branches pollute failure statistics for main.", "History is lost on every CI run because the cache directory is not persisted, so history-based features never work."],
    v: "Run a suite on two commits and query the store for a test's last two outcomes with commit IDs and durations. Rename a test and confirm the new name begins its own history.",
    dep: ["structured-results", "test-naming-and-ids"]
  },
  "event-stream": {
    s: "The ordered sequence of typed events (run started, test finished, log emitted) that every reporter, plugin and tool consumes as the single source of truth for a run.",
    d: "Workers emit events, the coordinator orders and enriches them with run context, and subscribers receive them in-process or over a pipe. Events are plain data with stable names and fields, which allows recording a run and replaying it into a different reporter. The set of events and their guarantees (every start has an end, ordering within a worker) is the framework's most important public interface. Hard parts are ordering across workers, backpressure and evolving event schemas without breaking subscribers.",
    k: ["One event stream for everyone versus separate paths for reporters and tools: one stream is consistent and recordable, but couples all consumers to one schema.", "Reliable delivery versus best effort: reliable delivery needs buffering and acknowledgments, while best effort drops events under load."],
    p: ["Events from two workers arrive interleaved and a reporter assumes they are serial, mixing test results.", "Adding a field to an event breaks a plugin that validated the exact shape."],
    v: "Record the stream of a run to a file, replay it into a different reporter and confirm the output matches the original run's counts and failures exactly.",
    dep: ["worker-protocol", "test-lifecycle-machine"]
  },
  "ci-annotations": {
    s: "Emits failures in the form the CI system or code review tool understands, so they appear as inline comments on the changed lines and in the check summary.",
    d: "A formatter converts failures and coverage gaps into the host's annotation syntax or API calls: a file, a line, a severity and a message. It also writes a summary page with counts, slowest tests and flakes. The runner needs to map failures to source locations in the original files, and limit counts, since hosts cap annotations per run. Hard parts are limits, correct paths relative to the repository root and avoiding duplicate comments on every rerun.",
    k: ["Annotations for every failure versus a capped, prioritized set: all failures is complete, but hits host limits and drowns the page.", "Log-based commands versus API calls: log commands need no credentials, while API calls support richer output and updates and require tokens."],
    p: ["Paths are relative to a subdirectory and annotations attach to no file, so the failure is invisible in the review.", "Annotations include secrets that appeared in an assertion message."],
    v: "Fail a test in a pull request and confirm an inline annotation appears on the correct file and line of the failing assertion, with the message, and that the check summary matches the run counts.",
    dep: ["reporters", "source-maps", "structured-results"]
  },
  "module-loader": {
    s: "Resolves import statements to files and evaluates them, with hooks for transforms, mocks and caches; the layer through which all code under test enters the runner.",
    d: "The loader maps a module specifier to a path using the language's resolution rules, reads the file, passes it through transforms, evaluates it and caches the exports. Test frameworks replace or wrap the loader to support mocking, per-file registries, path aliases and syntax the runtime does not run natively. Both module formats may need to be supported at once. Hard parts are interoperability between formats, circular imports, resolution that differs between the runner and the production build, and cost for large dependency trees.",
    k: ["Use the runtime's native loader with hooks versus a custom loader: native hooks stay close to production behavior, but custom loaders give full control over caching and mocking.", "Resolve like production versus like the test tooling: matching production catches resolution bugs, but tooling aliases are often more convenient."],
    p: ["A path alias works in the test run but not in the real build, so a test passes against an import that fails in production.", "Circular imports evaluate in a different order under the loader than in production and break only in tests."],
    v: "Import a module that exercises each resolution rule used by the project (relative, alias, package, dynamic) and confirm the resolved paths match those the production build uses, listed by a debug option.",
    dep: ["source-transform", "filesystem-watcher"]
  },
  "source-transform": {
    s: "Rewrites source before it runs, compiling newer syntax, stripping type annotations, inserting coverage counters and hoisting mocks, with caching so unchanged files cost nothing.",
    d: "A transform takes a file's text and returns code and a source map. Several can be chained by file type. Results are cached on disk keyed by content hash and configuration, since transforming is slower than running. Hoisting of mock declarations above imports is a transform too. Hard parts are cache invalidation (a plugin version change must invalidate), transforms that differ from the production compiler and so test code that never ran in the form shipped, and the cost for the first run.",
    k: ["Transform on the fly with a cache versus compile ahead of time: on the fly gives instant feedback on edits, but ahead of time reuses the production build exactly.", "A fast transpiler without type checks versus the real compiler: the fast one speeds feedback, but type errors then surface only in a separate step."],
    p: ["A stale transform cache runs old code after an edit because the key ignored a configuration change.", "The transform treats syntax differently from the production compiler, so a test passes on code that does not build."],
    v: "Edit a file, run, and confirm the change takes effect; run again with no edit and confirm the transform cache is hit, shown by timing or a counter. Change the transform configuration and confirm the cache is invalidated.",
    dep: ["module-loader", "source-maps"]
  },
  "source-maps": {
    s: "Maps positions in transformed code back to the original source, so stack traces, breakpoints and coverage refer to what the author wrote.",
    d: "Each transform emits a mapping from generated positions to original ones. The runner stores them, applies them when formatting stack traces and error locations, passes them to debuggers and uses them to translate coverage ranges. Chains of transforms require composed maps. Maps can be inline, in side files or kept in memory. Hard parts are accuracy for code that was heavily rewritten, performance when mapping thousands of frames and maps lost by a transform that forgot to emit one.",
    k: ["Keep maps in memory versus write to disk: memory is fast, but is lost when the process crashes before the failure is formatted.", "Map stacks eagerly versus on failure: eager is simple, but wasteful when most tests pass."],
    p: ["A failing line number refers to generated code, sending the author to a place that does not exist in their source.", "One transform in the chain drops its map and every position after it is wrong by a consistent offset."],
    v: "Throw an error from a known line of a transformed source file and confirm the printed stack shows that original file and line and column. Set a debugger breakpoint on the same line and confirm it stops there.",
    dep: ["source-transform"]
  },
  "process-spawner": {
    s: "Starts, monitors and terminates child processes and threads with controlled environment, arguments, standard streams and resource limits.",
    d: "The spawner builds a command line, environment and working directory, starts the child, wires its input, output and error streams and an optional message channel, and watches for exit. It supports signals and forced termination of the whole process tree, which matters because a killed worker may have children of its own. Limits on memory and CPU time protect the host. Hard parts are cross-platform differences in signals and shells, orphaned grandchildren and quoting of arguments.",
    k: ["Direct execution versus through a shell: direct avoids quoting problems and injection, but shells give globbing and pipelines that some commands expect.", "Kill the single process versus the whole group: killing the group prevents orphans, but needs platform-specific handling."],
    p: ["Killing a worker leaves its child processes running, holding ports and consuming memory for the next run.", "Arguments with spaces or quotes are split differently on different operating systems."],
    v: "Spawn a worker that itself starts a child, terminate the worker and confirm by listing processes that both are gone. Pass an argument containing spaces and quotes and confirm it arrives intact on each platform.",
    dep: []
  },
  "filesystem-watcher": {
    s: "Reports file changes efficiently, using operating system notifications with a polling fallback, with debouncing and ignore rules, to drive watch mode and cache invalidation.",
    d: "The watcher subscribes to change notifications for directory trees, filters ignored paths such as dependency and output directories and collapses bursts of events, for example from an editor's save, into one batch. Platform behavior varies in recursive support, rename events, limits on watches and network drives that give no events, so a polling fallback exists. Hard parts are missed events, event storms from tool output written into watched directories and mapping editor temporary files to real ones.",
    k: ["Native notifications versus polling: notifications are instant and cheap, but unreliable on network and virtual file systems, where polling still works.", "Short versus long debounce: short feels immediate but fires several runs for one save, while long delays feedback."],
    p: ["The operating system's watch limit is reached in a large repository and the watcher silently stops seeing changes.", "The test run writes files inside a watched directory and triggers itself endlessly."],
    v: "Save a file in a watched tree and confirm exactly one change batch arrives within the debounce window. Write a file in an ignored directory and confirm no event arrives.",
    dep: []
  },
  "exit-codes": {
    s: "The process exit status that tells scripts and CI whether the run passed, failed, was misconfigured or was interrupted, with distinct values for distinct causes.",
    d: "Zero means success. A different nonzero value separates test failures from internal errors, invalid usage, no tests found, interrupted runs and exceeded thresholds. Policy options decide whether flaky, skipped or quarantined tests count. The runner must also flush reports and clean up before exiting, and must exit even if leaked handles would otherwise keep the process alive. Hard parts are the contract: every automation that wraps the runner depends on those numbers, and a change breaks silently.",
    k: ["Distinct codes for failure classes versus a single failure code: distinct codes let automation react differently to a crash versus failing tests, but widen the interface.", "Force exit versus wait for handles to close: forcing guarantees termination, but can cut off output and cleanup."],
    p: ["A crash in the runner exits zero because a catch block swallowed the error, and CI reports success.", "A pipeline with a pipe to a log filter returns the filter's status and hides the runner's failure."],
    v: "Run suites that pass, fail, find no tests and have a configuration error, and confirm four distinct documented exit codes. Run through a typical CI wrapper and confirm the wrapper's job status matches.",
    dep: []
  },
  "isolation-vs-speed": {
    s: "Every unit of isolation (process, context, reset state, shared fixture) trades startup and setup cost against the chance that one test changes another's outcome.",
    d: "Stronger isolation removes whole classes of order-dependent bugs but costs time in startup, module loading and fixture creation. Weaker isolation is fast and leaks state, which shows up as flakes, hard to debug because the guilty test passed. The decision is spread across components: the unit of isolation, fixture scope, registry reset, and database strategy. Teams often pick different points for different suites, with fast suites sharing state and slower integration suites isolating strongly. Measuring leaks, not only time, guides the choice.",
    k: ["Isolate per test versus per file: per test is safest and costs the most, per file amortizes startup and relies on authors cleaning up.", "Share expensive resources and reset versus recreate: resetting is fast but incomplete resets are subtle bugs; recreating is slow but certain."],
    p: ["A suite optimized for speed gradually accumulates hidden ordering dependencies that surface only when someone changes the order.", "Maximal isolation makes the suite so slow that developers stop running it locally."],
    v: "Run the suite in random order and in reverse with the chosen isolation level and confirm identical results. Measure total time against the stricter level to know what the isolation costs.",
    dep: ["process-isolation", "fixture-scoping", "module-registry-reset", "global-state-reset"]
  },
  "determinism-and-reproducibility": {
    s: "The ability to rerun a failed run and get the same result, which depends on controlling seeds, order, time, environment and every input the test can observe.",
    d: "A failure that cannot be reproduced cannot be fixed. Reproducibility needs every source of variation named and controlled: random seeds, test order, clock, locale, machine identity, external services and concurrency. The framework controls some (seed, order, fake clock) and can only record the rest. Practice combines prevention (hermetic environments, fakes), recording (seed and environment in the report) and tooling (a rerun command). Perfect determinism is rarely achievable with concurrency, so the goal is narrowing where variation can come from.",
    k: ["Prevent variation versus record it: prevention removes the problem but limits realism, while recording keeps realistic tests and makes failures replayable.", "Deterministic scheduling of concurrent code versus real threads: deterministic scheduling makes races reproducible, but is slower and finds only what it explores."],
    p: ["A failure is attributed to a flake because nobody recorded the seed and environment of the failing run.", "A team forces determinism with fake time everywhere and misses bugs that only real clocks reveal."],
    v: "Take a failing CI run's recorded seed, order and environment and replay it elsewhere; confirm the same test fails with the same message, and the repeated replay gives identical event logs.",
    dep: ["seed-replay", "hermetic-environment", "clock-control", "failure-reproduction"]
  },
  "parallel-safety": {
    s: "Whether tests can run at the same time without interfering, which depends on what they share: ports, files, databases, environment variables and global state.",
    d: "Parallelism multiplies the sharing problem: two tests that never conflict in sequence can collide when concurrent. Safe parallelism comes from giving each worker its own copy of every shared resource (database names, ports, temp directories) or from declared locks. The runner exposes worker identity so resources can be partitioned. Some resources cannot be partitioned and force serial sections. The right granularity of parallelism is across files first, within a file only for tests written for it.",
    k: ["Partition resources per worker versus lock shared ones: partitioning keeps full parallelism but costs provisioning, locking is simple but serializes.", "Parallel across files only versus also within files: across files is mostly safe, within files speeds large files but exposes shared setup."],
    p: ["Tests pass alone and in serial but fail in parallel on fixed ports and shared temp file names.", "A shared database truncated by one worker deletes the rows another worker's test just created."],
    v: "Run the suite with one worker and with the maximum, repeatedly, and compare failing sets. Print each worker's database name and port and confirm they differ.",
    dep: ["worker-pool", "resource-locks", "fixture-scoping", "hermetic-environment"]
  },
  "feedback-latency": {
    s: "The time between a change and a trustworthy answer, which decides whether tests are run constantly or rarely, and so how early bugs are caught.",
    d: "Feedback speed is built from many small costs: process startup, transforms, module loading, collection, fixture setup, scheduling imbalance and reporting. Techniques include warm workers, caches, impacted-test selection, failed-first ordering, sharding and bail. Each shortens the loop and weakens a guarantee in some way: warm workers risk leaked state, selection risks missed tests. A useful practice is two loops, a fast local loop for the changed area and a complete gate before merge, and measuring both end-to-end, not only test body time.",
    k: ["Fast partial feedback versus slow complete feedback: partial results arrive in seconds and catch most breaks, but only the complete run is trusted to gate a merge.", "Optimize startup overhead versus individual slow tests: startup cost affects every run, while a few slow tests dominate the tail of the critical path."],
    p: ["A suite's time grows a little each week until developers stop running it before pushing.", "Speed optimizations such as selection are added without a periodic full run to check them."],
    v: "Measure time from saving a file to a reported result for a one-line change, and for the full suite, across ten runs. Track both over months and alert when either grows.",
    dep: ["watch-mode", "impacted-test-selection", "worker-pool", "failed-first-ordering"]
  },
  "trust-in-results": {
    s: "Whether a green result means the code is correct and a red result means a real problem, which erodes quickly with flakes, weak assertions and silently excluded tests.",
    d: "A suite is useful only while people believe it. Trust is lost by flakes that train teams to rerun and ignore failures, by tests that assert little, by skipped and quarantined tests that are never counted and by selection that misses breaks. It is built by reporting honestly (skips, retries and exclusions visible), measuring test quality (mutation score, flake rate), failing loudly on misconfiguration (zero tests found) and treating a flaky test as a defect with an owner and a deadline.",
    k: ["Retries to keep builds green versus failing on flakes: retries preserve flow, but teach people that red does not matter.", "Count coverage versus measure effectiveness: coverage is cheap and gamed, while mutation analysis is expensive and closer to truth."],
    p: ["Reruns become a habit, and a real regression is dismissed as the usual flake.", "A green build reflects a run that executed a tiny fraction of the suite because of a filter or discovery bug."],
    v: "Audit one release: confirm the number of tests executed equals the number discovered, list skipped and quarantined ones with owners and ages, and compare the flake rate and mutation score to the previous release.",
    dep: ["flaky-detection", "quarantine", "mutation-testing", "failure-summary"]
  },
  "extensibility-boundary": {
    s: "How much of the runner users may change: which events, hooks and registries are public contracts, and which internals are free to change between releases.",
    d: "Every extension point becomes a promise. A narrow surface keeps the framework changeable but pushes users to forks and workarounds; a wide one builds an ecosystem and freezes internals. Frameworks usually expose events, hooks, matcher and reporter registries, and transforms, and keep scheduling and isolation private. Versioned plugin APIs, deprecation periods and conformance tests for plugins manage the boundary. The decision shapes who can add features: the core team, or the whole user community.",
    k: ["Wide public surface versus narrow: wide enables an ecosystem and customization, but constrains every future change to the core.", "Plugins in-process versus out-of-process: in-process plugins are fast and powerful, while out-of-process ones cannot crash or slow the run."],
    p: ["Plugins reach into internals that were never documented, and a minor release breaks half of them.", "An ecosystem of plugins fragments conventions, so tests written for one setup cannot run on another."],
    v: "Upgrade the runner by a minor version with a set of popular plugins installed and run their test suites against it; confirm none fail, and that deprecated points warn before removal.",
    dep: ["plugin-api", "lifecycle-hooks", "event-stream", "custom-matchers"]
  }
});
