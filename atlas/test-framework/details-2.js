// Details for the test framework plate, part 2: assertions, fixtures and doubles, selection, scheduling.
ATLAS.details("test-framework", {
  "assertion-library": {
    s: "The functions that compare actual to expected values and raise a structured failure, which the runner distinguishes from an unexpected error in the test itself.",
    d: "An assertion evaluates a condition and, on failure, throws a special error carrying the expected value, the actual value, an operator and a message. The runner catches it and classifies the test as failed rather than errored. Assertions come as plain functions or as a fluent chain starting from the actual value. The library owns equality semantics: identity, structural, ordered or unordered, and how cycles, special values and unordered collections are handled. Hard parts are equality that matches intuition and messages that make the cause obvious.",
    k: ["Fluent chain versus plain assertion functions: chains read like sentences and extend easily, but hide which part failed in a long expression.", "Structural versus identity equality by default: structural matches what authors mean, but costs time on large objects and can hide differing types."],
    p: ["An assertion with no message on a boolean condition fails with just false, leaving no clue to the actual value.", "Comparing values of different types passes through loose equality and masks a real regression."],
    v: "Assert equality on two nested structures that differ in one deep field and confirm the failure message names the path, expected and actual values rather than only reporting not equal.",
    dep: ["matchers", "failure-diffs", "test-lifecycle-machine"]
  },
  "matchers": {
    s: "Reusable predicates such as contains, matches pattern, has length or is close to, applied through the assertion chain with their own readable failure messages.",
    d: "A matcher pairs a predicate with a message generator, and the library gives each a negated form. Built-ins cover collections, strings, numbers, objects and errors. Asymmetric matchers can be nested inside expected structures, such as any number or an object containing at least these keys, so a comparison can ignore fields like timestamps. The hard part is composition: nested matchers must still produce one coherent diff, and negation must be defined for every matcher, including those that are not a simple complement.",
    k: ["Many small matchers versus few general ones: small matchers give precise messages, but enlarge the vocabulary an author must learn.", "Matchers usable inside expected structures versus only at the top: nesting makes partial comparisons concise, but complicates diffing and negation."],
    p: ["A partial-object matcher passes when a key is missing but undefined, hiding a removed field.", "Matchers for floating-point equality use exact comparison and pass or fail depending on the platform."],
    v: "Use a nested matcher that ignores a timestamp field in a compared object, change a different field, and confirm the failure points at the changed field while the ignored field never contributes to the failure.",
    dep: ["assertion-library", "failure-diffs"]
  },
  "failure-diffs": {
    s: "Renders the difference between expected and actual values as a readable, line-level or structure-aware diff with context, truncation and color, so the cause is visible at a glance.",
    d: "The formatter serializes both values with stable key ordering, handles cycles and special objects, then computes a diff, usually by lines, with a short context around each change. For long strings or deep structures it truncates and collapses identical regions. Color helps a terminal but must degrade to plain markers in CI logs. Hard parts are huge values that make diffing slow or output unreadable, values whose printed forms are identical but differ in type, and invisible differences such as whitespace and line endings.",
    k: ["Structure-aware diff versus text diff of serialized forms: structural diff points at the field, but text diff is simpler and works on any value.", "Truncate large values versus print in full: truncation keeps logs readable, but may cut the very line that differs."],
    p: ["Two strings that differ only by trailing whitespace or a different line ending print as identical, leaving the failure a mystery.", "A diff of an enormous object takes seconds and floods CI logs with thousands of lines."],
    v: "Compare two objects differing in one deep field and in trailing whitespace of a string, and confirm the output marks exactly those two places, makes whitespace visible and stays under a sensible length.",
    dep: ["assertion-library"]
  },
  "exception-assertions": {
    s: "Asserts that code throws, or does not throw, an error with a given type or message, capturing the error so its fields can be checked.",
    d: "The helper runs a function, catches what it throws and compares the error's class, message or properties to an expectation. A missing throw is itself a failure. For asynchronous code it awaits a rejection. Authors often want to check the cause chain and structured fields, not only the message text. Hard parts are matching on message text that changes with wording, making sure the exception came from the intended line rather than from setup, and distinguishing an unrelated error with a similar message.",
    k: ["Assert on type versus on message: types are stable but coarse, while messages are specific but brittle against rewording.", "A helper that wraps the call versus a try and catch in the test: a wrapper is concise and fails if nothing is thrown, but narrow wrapping is easy to forget."],
    p: ["A test that catches an exception but has no failure when nothing is thrown passes even if the code stops throwing.", "The assertion passes because setup code three lines earlier threw the same type of error."],
    v: "Remove the throw from the code under test and confirm the test fails with a message saying no error was thrown. Make a different error type occur and confirm the failure shows the actual type and message.",
    dep: ["assertion-library", "async-assertions"]
  },
  "async-assertions": {
    s: "Assertions for deferred results and eventually true conditions: await a resolution or rejection, or poll a condition until it holds or a deadline passes.",
    d: "Direct forms await a promise and compare its settled value or error. Polling forms repeat an assertion at intervals until it passes or a timeout elapses, then report the last failure. Both must integrate with the test's own timeout and with fake clocks, since polling relies on timers. The hard part is deciding between waiting and synchronizing: a fixed sleep is slow and still flaky, polling is robust but can hide ordering bugs, and waiting on an explicit signal is exact but requires the code to expose one.",
    k: ["Poll until true versus wait for an event: polling needs no hook in the code, but waiting on an event is faster and fails exactly when the event never occurs.", "Short default polling timeout versus long: short timeouts fail fast but flake on slow machines; long ones hide slowness."],
    p: ["A fixed sleep tuned on a fast laptop is too short on a loaded CI machine and causes sporadic failures.", "The final failure message shows only a timeout, not the last observed value."],
    v: "Poll for a value that becomes true after 200 milliseconds and confirm the test passes quickly. Make it never true and confirm the failure reports the last observed value, not just that time ran out.",
    dep: ["assertion-library", "timeouts", "clock-control"]
  },
  "soft-assertions": {
    s: "Collects several assertion failures within one test and reports them together at the end, instead of stopping at the first one.",
    d: "In a soft mode an assertion records its failure into the current test's list rather than throwing, and the runner fails the test at its end if the list is non-empty. This helps tests that check many independent properties of one result, because the author sees every difference in one run. The runner must still stop when a later line depends on an earlier one, so authors choose which assertions are soft. The hard part is attribution: each recorded failure needs its own location and message.",
    k: ["Soft versus hard assertions: soft shows all problems at once, but later code may run on garbage after an earlier check failed.", "Soft by default versus opt-in: default soft gives complete reports, but surprises authors who expect execution to stop."],
    p: ["A test ends without checking the collected list and passes despite recorded failures.", "Subsequent lines throw confusing errors because they ran after an earlier soft failure had left the data invalid."],
    v: "Write a test with three soft assertions, two of which are wrong, and confirm one failure report lists both wrong assertions with their own line numbers and that the test is marked failed.",
    dep: ["assertion-library", "test-lifecycle-machine"]
  },
  "approximate-comparison": {
    s: "Compares numbers, times and images within a tolerance, because exact equality on floating-point results or rendered output fails for reasons unrelated to correctness.",
    d: "Numeric comparison takes an absolute or relative tolerance, or a count of units in the last place. Timestamps compare within a window. Images compare pixel by pixel with a threshold on color difference and on the fraction of pixels that may differ, often after masking regions that legitimately vary. Tolerances encode a statement about acceptable behavior, so they need justification. Hard parts are choosing a threshold that is neither so tight that it fails across machines nor so loose that it hides regressions.",
    k: ["Absolute versus relative tolerance: absolute is simple but wrong across magnitudes, while relative breaks down near zero.", "Strict image comparison versus perceptual: strict catches every change but fails across font rendering and graphics drivers; perceptual passes real regressions below its threshold."],
    p: ["A loosened tolerance after one flaky failure stays loose forever and later hides a genuine numerical regression.", "Image baselines recorded on one machine fail on another because of font and anti-aliasing differences."],
    v: "Compare 0.1 plus 0.2 to 0.3 with and without tolerance and confirm only the tolerant check passes. Shift an image by one pixel and confirm the comparison reports the changed fraction against the threshold.",
    dep: ["assertion-library", "matchers"]
  },
  "snapshot-testing": {
    s: "Compares a serialized value or rendered output to a stored baseline file, failing on any difference and letting authors approve intended changes in bulk.",
    d: "The first run writes a serialized form of the value to a baseline file keyed by the test's ID; later runs serialize again and diff against it. Serialization must be deterministic: sorted keys, normalized whitespace, masked ids and timestamps. Baselines are committed so reviewers see output changes as diffs. The approach covers large outputs cheaply but only detects change, not wrongness. Hard parts are large snapshots no one reads, noisy diffs, and obsolete entries left behind when tests are removed.",
    k: ["Snapshot large outputs versus assert specific fields: snapshots give wide coverage with little code, but invite approving diffs without reading them.", "Baselines in separate files versus inline in the test: separate files handle large values, while inline literals keep the expectation next to the code."],
    p: ["Authors update snapshots reflexively whenever they fail, so the check turns into a record of whatever the code did.", "A snapshot containing a timestamp or random id fails on every run."],
    v: "Change rendering of a component, run the suite, and confirm failure with a readable diff against the committed baseline. Run again in a clean checkout with no baseline in CI and confirm it fails rather than writing one.",
    dep: ["failure-diffs", "test-naming-and-ids", "snapshot-update-workflow"]
  },
  "snapshot-update-workflow": {
    s: "The process by which intended snapshot changes are approved: an explicit update mode that rewrites baselines, flags obsolete entries and refuses to write in CI.",
    d: "Running with an update flag rewrites every baseline that differs, and an interactive mode asks per file or per failing test. The runner reports new, updated and obsolete snapshots separately and can delete obsolete ones. In CI mode, writing is disabled: a missing baseline is a failure, not a new snapshot. Review happens on the baseline diff in version control. The hard part is process rather than code, since rewriting all baselines at once makes it impossible to tell an intended change from a regression.",
    k: ["Bulk update versus per-test approval: bulk is fast, but removes the chance to review each change; per-test approval is slow for hundreds of diffs.", "Write missing snapshots automatically versus fail: auto-writing is convenient locally, but in CI it turns a lost baseline into a pass."],
    p: ["A developer runs update on the whole suite to fix one test and commits unrelated behavior changes in baselines.", "Obsolete snapshots from deleted tests accumulate and are never removed because no one runs the cleanup."],
    v: "Delete a baseline and run in CI mode, confirming failure naming the missing snapshot. Run with the update flag locally and confirm only the intended file changes in version control and obsolete entries are listed.",
    dep: ["snapshot-testing", "environment-flags", "cli-frontend"]
  },
  "fixtures": {
    s: "Reusable definitions of the state a test needs, such as a database with known rows or a started server, created on demand and cleaned up afterward.",
    d: "A fixture is a named resource with a creation step and a disposal step. Tests request fixtures by name or parameter, and the framework creates them in dependency order, caches them for their scope and tears them down in reverse, including after failure. Compared with plain setup code, fixtures are lazy: a test pays only for what it uses. Hard parts are teardown reliability, sharing expensive fixtures without sharing state, and diagnosing a failure in a fixture instead of in the test.",
    k: ["Fixtures requested by name versus global setup for every test: named fixtures cost only when used and document dependencies, but need a resolution mechanism.", "Create fresh per test versus share and reset: fresh is clean and slow, shared is fast but tests can contaminate each other."],
    p: ["Teardown does not run after a crash, leaving processes, ports and temporary files that break later runs.", "An error in a fixture is reported as a test failure with no sign that the test body never ran."],
    v: "Use a fixture that creates a temporary directory, fail a test using it, and confirm the directory is removed afterward. Confirm a test that does not request the fixture never creates it.",
    dep: ["setup-teardown-hooks", "fixture-scoping", "fixture-injection"]
  },
  "setup-teardown-hooks": {
    s: "Callbacks that run before and after each test, each group or each file, to establish and clean up shared state in a defined order.",
    d: "Hooks are registered on a group and run at its boundaries: before and after all tests in it, and before and after each test in it. Parents run setup before children and teardown after. A failing setup skips the group's tests and still runs the teardown that matches completed setup. Hooks can be asynchronous and have their own timeouts. They are simple and general, but state is shared through variables, so the dependency between hook and test is invisible, which is the problem fixtures try to solve.",
    k: ["Hooks versus fixtures: hooks are simple and familiar, but apply to every test in a group whether it needs them or not.", "Teardown always runs versus only after successful setup: always running can fail on half-built state, while skipping leaks resources."],
    p: ["A hook throws in the middle and later teardown assumes setup completed, throwing a second error that hides the first.", "Variables assigned in a before hook are used by tests that run in a different worker and see nothing."],
    v: "Make a setup hook fail partway and confirm the group's tests are reported as failed or skipped with the hook's error as cause, and that the teardown for completed steps still ran, shown by a log of cleanup actions.",
    dep: ["lifecycle-hooks", "suites-and-grouping", "timeouts"]
  },
  "fixture-scoping": {
    s: "Controls how long a fixture lives, per test, per file, per worker or per run, trading speed against how much state tests can share.",
    d: "Each fixture declares a scope. A per-test fixture is built and torn down around every test. Wider scopes build once and share among tests in the scope, which saves expensive work such as starting a server. A fixture may only depend on fixtures of equal or wider scope, otherwise a longer-lived object would hold a shorter-lived one. Hard parts are teardown order across scopes, parallel workers each owning their own copy of a worker-scope fixture, and preventing a wide-scope resource from accumulating state.",
    k: ["Wide scope versus narrow: wide saves startup time per test, but state left by one test can alter the next.", "Per-worker versus global: per-worker avoids contention, but multiplies resource use by the number of workers."],
    p: ["A run-scoped database accumulates rows across tests, so results depend on execution order.", "A worker-scope fixture on a fixed port conflicts with the same fixture in another worker."],
    v: "Use a worker-scoped fixture that logs creation and confirm it is created once per worker, not per test. Run with four workers and confirm four distinct resources appear, with no port conflicts.",
    dep: ["fixtures", "worker-pool", "global-state-reset"]
  },
  "fixture-injection": {
    s: "Resolves the fixtures a test or another fixture declares as parameters, building the dependency graph and passing the created values in.",
    d: "The framework inspects a test's parameter names or declared dependencies, finds the matching fixtures, resolves each fixture's own dependencies recursively and topologically orders creation. Overrides at narrower levels, such as a group or a file, replace a fixture for the tests below them. Cycles are detected and rejected. Because dependencies are explicit, the framework can skip unused fixtures and report which fixture failed. Hard parts are overriding without surprises and keeping errors readable when a dependency chain is several levels deep.",
    k: ["Injection by parameter name versus explicit references: names are concise, but renaming a fixture silently changes what is injected.", "Allow overrides at lower levels versus disallow: overrides allow customization per area, but make a fixture's actual definition depend on where it is used."],
    p: ["A misspelled parameter name resolves to nothing and the test fails with an obscure error about undefined.", "An override in one file changes a fixture used by a shared helper in a way its author did not expect."],
    v: "Declare a fixture depending on two others, request it in a test and confirm creation order in a log is dependencies first. Introduce a cycle and confirm the run fails naming both fixtures.",
    dep: ["fixtures", "fixture-scoping", "collection-phase"]
  },
  "test-data-builders": {
    s: "Helpers that construct valid test objects with sensible defaults, so each test states only the fields relevant to what it checks.",
    d: "A builder produces a complete, valid object, such as an order or a user, from defaults, and lets the test override individual fields. Factories can generate unique values for fields that must be unique, using a counter or seeded generator. They keep tests short and resilient: when a model gains a required field, one builder changes instead of hundreds of tests. Hard parts are defaults that hide the test's intent, random data that makes failures unreproducible, and builders that grow into a parallel implementation of the model.",
    k: ["Builders with defaults versus literals in each test: builders absorb model changes, but literals show exactly what the test depends on.", "Random defaults versus fixed: random values find assumptions, but need a recorded seed to reproduce failures."],
    p: ["A default value happens to satisfy the code under test, so a test passes without setting the field it claims to check.", "Unseeded random defaults produce a failure in one run in a hundred that nobody can reproduce."],
    v: "Build two objects in one test with unique fields and confirm they differ, then rerun with the same seed and confirm the same values. Add a required model field and confirm only the builder needed changing.",
    dep: ["seed-replay", "fixtures"]
  },
  "mocks-and-spies": {
    s: "Replaces a function or object with a recording stand-in that can return scripted values, and lets the test assert how it was called.",
    d: "A spy wraps the real function and records calls, arguments and results. A mock replaces it and also returns programmed values or throws. Frameworks install them by patching a property or module export, track every patch and restore the originals after each test. Module-level mocking must intercept the loader before the code under test imports its dependency. Hard parts are restoring everything reliably, mocks that drift from the real interface and tests that assert interactions so closely that any refactor breaks them.",
    k: ["Verify interactions versus verify results: interaction checks catch missing side effects, but couple tests to implementation and break on refactors.", "Auto-restore after each test versus manual: automatic restore prevents leaks, but surprises authors who set a mock once for a whole file."],
    p: ["A mock is not restored after a failure, so later tests in the same worker call a stub of the real function.", "The mock returns a shape the real dependency stopped producing, so tests pass while production breaks."],
    v: "Mock a dependency, call code that uses it twice, and assert the recorded arguments. Then run a following test in the same worker and confirm the original implementation is back, by observing its real output.",
    dep: ["module-registry-reset", "global-state-reset", "module-loader"]
  },
  "fakes-and-stubs": {
    s: "Working lightweight substitutes, such as an in-memory store or a canned response server, that behave like the real dependency closely enough for logic tests.",
    d: "A stub returns fixed answers. A fake implements real behavior in simplified form: an in-memory database, a local message queue, a fake payment gateway with failure modes. Fakes are shared between tests and sometimes between teams, and should be tested against the same contract as the real component. They let tests run fast and deterministically while still exercising realistic sequences. The hard part is fidelity: a fake that behaves differently from the real thing gives confident tests of a system that does not exist.",
    k: ["Fake versus mock: a fake supports realistic multi-step behavior with less per-test scripting, but needs its own maintenance and verification.", "Fake versus the real dependency in a container: fakes are fast and hermetic, but only the real thing finds integration bugs."],
    p: ["An in-memory fake accepts operations the real service rejects, such as duplicate keys, so tests never see the error path.", "The fake is updated for new features only when someone needs them, falling behind the real interface."],
    v: "Run one shared contract test suite against both the fake and the real dependency and confirm both pass. Add a case the real service rejects and confirm the fake rejects it too.",
    dep: ["fixtures", "io-interception"]
  },
  "clock-control": {
    s: "Replaces the system clock and timers with a controllable one, so a test can advance time instantly and get identical results regardless of machine speed.",
    d: "Fake timers intercept the language's time and timer functions. The test sets the current time and advances it, firing due callbacks in order. This makes expiry, retries and debounce tests instant and deterministic. The faked surface must be complete (wall clock, monotonic clock, timers, animation frames), or code that reads an unfaked source misbehaves. Hard parts are interactions with promise scheduling, which does not advance with timers, libraries that captured the real functions at import time and forgetting to restore real time.",
    k: ["Fake all time sources versus inject a clock: faking needs no change to the code, but injection is explicit and works at every boundary.", "Auto-advance timers versus manual advance: auto is convenient, but hides ordering that tests should assert."],
    p: ["A library captured the real timer function before the fake was installed, so its timeouts still take real time.", "Fake time is left installed after a failed test and the next test hangs waiting for a timer that never fires."],
    v: "Test a function that retries after 30 seconds by advancing the fake clock 30 seconds and confirm the retry happens in under a few milliseconds of real time. Confirm real time is restored for the next test.",
    dep: ["global-state-reset", "mocks-and-spies"]
  },
  "io-interception": {
    s: "Intercepts network, file system and process calls, serving recorded or scripted responses, so tests run without live services and without reaching out unexpectedly.",
    d: "Interception sits at a client library, a transport hook or the OS socket layer. In scripted mode the test declares expected requests and their responses. In record and replay mode the first run captures real traffic into a file and later runs replay it. Unmatched requests can be blocked, which turns an accidental real call into a failure. Hard parts are matching requests (ignoring volatile headers), stale recordings that drift from the real service and secrets in recorded traffic.",
    k: ["Record and replay versus hand-written responses: recordings are realistic and cheap to create, but go stale and hold sensitive data; hand-written responses stay minimal and intentional.", "Block unmatched calls versus pass them through: blocking proves hermeticity, but breaks tests whenever a library adds a new request."],
    p: ["A recording contains an access token or personal data and is committed to the repository.", "The test passes on a stale recording after the real service changed its response format."],
    v: "Run a test with outbound access disabled and confirm an unmatched request fails with the URL in the error. Delete a recorded entry and confirm replay fails instead of reaching the network.",
    dep: ["fakes-and-stubs", "hermetic-environment", "global-state-reset"]
  },
  "test-discovery": {
    s: "Finds test files and tests by walking directories with include and exclude patterns, then identifying which files and functions count as tests.",
    d: "Discovery starts from configured roots, applies glob patterns for file names, ignores generated and dependency directories and yields a file list. In some designs a second step parses or loads each file to find declarations. Directory listing order varies by platform, so results are sorted. For large repositories, walking the tree is slow, so it uses the version control index or a file system service. Hard parts are speed, symbolic links, case sensitivity differences and patterns that match nothing without anyone noticing.",
    k: ["Naming convention versus explicit registry: conventions need no upkeep, but a misnamed file is silently never run.", "Walk the file system versus ask version control for tracked files: version control is fast and ignores junk, but misses new untracked files until added."],
    p: ["A test file with a slightly wrong name or extension is never discovered and never fails.", "Discovery descends into a dependency directory and runs tests that belong to other packages."],
    v: "Count discovered files against a known list of test files, listing without running. Add a new file matching the pattern and a misnamed one and confirm only the matching one appears, with a warning if a pattern matched nothing.",
    dep: ["config-loading", "filesystem-watcher"]
  },
  "collection-phase": {
    s: "Loads each test file to build the tree of tests without running any test bodies, producing the list that selection, sharding and the editor all consume.",
    d: "The runner imports or evaluates each file in a worker, recording every declaration in a per-file tree, including generated parametrized cases. The tree is returned to the parent as plain data: names, locations, metadata, but not functions. Collection errors (syntax errors, failing imports, duplicate names) are reported per file and fail that file's tests without stopping others. Hard parts are cost, since collection executes top-level code, and consistency between collection and execution, which may occur in different processes.",
    k: ["Collect everything first versus collect lazily per worker: collecting first enables exact sharding and counts, but pays double load time for each file.", "Fail the run on a collection error versus skip the file: failing is honest, but one broken file blocks all feedback."],
    p: ["Top-level code runs during collection and has side effects such as opening connections, so even a list-only command is slow or dangerous.", "A file that errors during collection is dropped from counts and the run reports success."],
    v: "Introduce a syntax error in one test file and confirm the run reports that file as failed with the error, while other files still execute and the total count includes the failure.",
    dep: ["test-discovery", "module-loader", "test-declaration-api", "worker-protocol"]
  },
  "name-and-tag-filters": {
    s: "Narrows a run to tests whose path, full name, tag or owner matches given patterns, including exclusion, in the same way for CLI, editor and CI.",
    d: "Filters apply to the collected tree: path globs select files, name patterns match the full test name, and tag expressions combine labels with and, or and not. Matching a group selects all its children. The same filter language is shared across the command line, interactive mode and the editor integration so that what one shows, the other reproduces. Hard parts are quoting, regular expression versus substring semantics, what happens when a filter matches nothing and combining several filters predictably.",
    k: ["Regular expression versus plain substring matching: regular expressions are powerful, but names with special characters cause surprising matches.", "Fail when nothing matches versus succeed with zero tests: failing catches typos, but breaks scripts that intentionally filter to possibly empty sets."],
    p: ["A tag expression that excludes slow tests also excludes tests that were never labeled and were meant to run.", "A substring filter matches an unrelated test with a similar prefix and the author thinks a different test passed."],
    v: "Select by tag expression with an exclusion and confirm the listed tests match by inspection. Use a filter matching nothing and confirm the run exits non-zero with a message rather than succeeding.",
    dep: ["collection-phase", "test-metadata-and-tags"]
  },
  "impacted-test-selection": {
    s: "Chooses only the tests that could be affected by a set of changed files, using a dependency graph or recorded coverage, to cut run time on large suites.",
    d: "Given changed files from version control or a watcher, the selector walks reverse dependencies to find the affected test files, or consults a map recorded earlier of which tests touched which code. Selected tests run first or alone. Safe fallbacks are essential: changes to configuration, shared test utilities or lockfiles trigger a full run. Hard parts are dynamic dependencies the graph cannot see (data files, reflection, environment), stale maps and the false confidence of a green subset.",
    k: ["Static import graph versus recorded runtime coverage: static analysis is cheap and always available, while recorded coverage finds dynamic dependencies but needs a prior full run to maintain.", "Run the subset alone versus subset first and the rest later: subset alone is fastest, but later runs of the rest catch what selection missed."],
    p: ["A change to a configuration file or fixture data file is not in the import graph, so no test is selected and the build passes.", "The dependency map is not refreshed after tests change, so new tests are never selected."],
    v: "Change one source file and confirm the selected set equals the tests that import it directly or indirectly. Change a shared configuration file and confirm the whole suite is selected. Compare a nightly full run with the subset results.",
    dep: ["dependency-tracking", "coverage-merge", "watch-mode"]
  },
  "dependency-tracking": {
    s: "Maintains the map from each test file to the source files and data it loaded, built from import graphs or recorded runtime loading, and kept fresh across runs.",
    d: "While a test file runs, the loader records every module and data file it reads. The runner stores this as an edge list per test file, in a cache that persists between runs and is keyed by content hashes. Selection and watch mode query it in reverse. Invalidation matters: when a file changes, edges involving it need re-recording, so the affected test reruns even if it would not be selected. Hard parts are cache correctness, big monorepos and files read dynamically by name.",
    k: ["Record at runtime versus analyze statically: runtime recording sees dynamic loads, but only for tests that have run since the change.", "Persist the map between runs versus rebuild each time: persistence makes selection fast, but a corrupted or stale cache makes it wrong."],
    p: ["The cache is not shared between CI machines, so every run starts without a map and selection cannot work.", "A file read by computed path is not recorded, so changing it selects nothing."],
    v: "Run a test, then inspect the recorded edges for a known import chain and confirm every module on it appears. Delete the cache and confirm a full run rebuilds identical edges.",
    dep: ["module-loader", "filesystem-watcher", "source-transform"]
  },
  "failed-first-ordering": {
    s: "Runs tests that failed last time before the rest, so a developer learns about a persisting failure or its fix in seconds rather than at the end of the run.",
    d: "The runner reads a stored record of the previous run's outcomes, keyed by test ID, and sorts failures to the front of the schedule, sometimes also running newly changed tests early. Options either stop after the failing set passes or continue with the rest. The ordering must coexist with randomization and sharding, and the record has to survive between invocations in a location that is local to the user or the CI cache. Hard parts are stale records after test renames and ordering effects on order-dependent tests.",
    k: ["Failed first, then everything versus failed only: running everything is complete, while failed only gives the fastest loop but delays discovery of new breakage.", "Store results locally versus in shared storage: local is simple and private, shared helps CI but couples runs of unrelated branches."],
    p: ["Moving failures first changes order, so an order-dependent failure appears or disappears between the first run and the rerun.", "A stale record names tests that no longer exist and the runner reports confusing warnings."],
    v: "Fail one test in a large suite, rerun, and confirm the failing test starts first in the execution log. Fix it and confirm it passes first and the rest then run.",
    dep: ["result-history", "ordering-and-randomization"]
  },
  "test-history-prioritization": {
    s: "Orders or selects tests using historical data such as failure rate, runtime and relation to recent changes, to surface likely failures early or skip the unlikely.",
    d: "From stored results across many runs, the system computes per-test statistics: how often it fails, how often it fails together with a given kind of change and how long it takes. Scheduling then runs high-risk tests first and may defer or skip low-risk, slow ones in pre-merge runs while a full run happens later. It is a heuristic, not a guarantee. Hard parts are cold start for new tests, data skewed by flaky tests that fail randomly, and keeping the prediction honest by measuring what it missed.",
    k: ["Reorder only versus skip low-risk tests: reordering never loses coverage, but skipping saves much more time at the risk of a missed regression.", "Simple failure-rate scoring versus learned model: simple scores are explainable and cheap, while models find subtler relations but are harder to trust."],
    p: ["Flaky tests dominate failure statistics and the prioritizer learns to run noise first.", "A skipped test fails only in the later full run, long after the culprit change has merged and been built upon."],
    v: "Replay the last few hundred historical runs through the prioritizer and measure what share of real failures appear in the first ten percent of scheduled tests, compared against random ordering.",
    dep: ["result-history", "flaky-detection"]
  },
  "worker-pool": {
    s: "A set of long-lived worker processes or threads that receive test files from the scheduler, run them and send results back, sized to the machine.",
    d: "The pool starts N workers, usually one per core, and the scheduler assigns units of work, typically a test file, as workers become free. Workers keep loaded modules warm between files unless isolation resets them. The parent tracks each worker's state, collects results, replaces crashed workers and shuts everything down at the end. Hard parts are choosing the size (memory limits as much as cores), startup cost, balancing very uneven files and making cancellation and cleanup reliable.",
    k: ["Processes versus threads: processes isolate crashes and memory, while threads start faster and share data but a crash takes down the run.", "Pool size equal to cores versus smaller: using all cores is fastest on a dedicated machine, but oversubscribes memory and starves other work on shared hosts."],
    p: ["Too many workers each load large modules, exhausting memory and causing the operating system to kill them mid-test.", "A worker that is never replaced after a crash leaves the scheduler waiting for a result forever."],
    v: "Run a suite with one, two and four workers and confirm that the result set is identical and wall time scales sensibly. Kill a worker mid-run and confirm its file is rescheduled or reported as crashed.",
    dep: ["process-spawner", "worker-protocol", "work-stealing-queue", "crash-recovery"]
  },
  "sharding": {
    s: "Splits the full test list into a fixed number of disjoint parts so separate machines or CI jobs each run one part, with the union covering everything exactly once.",
    d: "Each machine is told its shard index and total count. All machines compute the same ordered list from collection, then take a slice: contiguous blocks, round robin or a balanced assignment from stored durations. Determinism is what makes the partition correct, so listing order must be identical everywhere. Reports from each shard are merged afterward. Hard parts are uneven shards when durations differ, a different list on different machines and merging results, coverage and snapshots across shards.",
    k: ["Static partition versus dynamic queue: static needs no coordinator and is reproducible, but one slow shard sets total time; dynamic evens load with more infrastructure.", "Split by file versus by test: files keep setup shared and are simple, tests give finer balance but repeat file setup on several shards."],
    p: ["Machines build the test list from different checkouts or flags, so some tests run twice and others never.", "One shard's job fails to upload results, and the merged report quietly shows a green run with fewer tests."],
    v: "Run all shards of a four-way split and confirm the union of executed test IDs equals the unsharded list with no duplicates, and that the merge step fails if any shard's results are missing.",
    dep: ["collection-phase", "duration-balancing", "structured-results", "ordering-and-randomization"]
  },
  "duration-balancing": {
    s: "Assigns tests to workers or shards using recorded durations so each finishes at about the same time, instead of splitting by count.",
    d: "The scheduler reads stored per-file or per-test timings and applies a packing heuristic, such as sorting by longest and giving each next item to the least loaded bin. Missing timings fall back to a default or the average. Timings are updated after each run, ideally smoothed over several runs. The result is a shorter critical path than count-based splitting. Hard parts are timing noise from cold caches, tests whose duration depends on their shard-mates and the staleness of data after large changes.",
    k: ["Longest-first packing versus simple round robin: packing shortens total time, but requires timing storage and fails to adapt to sudden changes.", "Use the most recent timing versus a rolling average: recent data adapts quickly, but averages resist noise from a single slow run."],
    p: ["New tests have no timing and are all given the default, so the shard that gets several slow new tests finishes late.", "Timings recorded under heavy parallel load overstate duration and skew balance."],
    v: "Compare shard completion times with count-based splitting and duration-based balancing on the same suite and confirm the spread between slowest and fastest shard shrinks, using timing data from the previous run.",
    dep: ["timing-collection", "result-history", "sharding"]
  },
  "ordering-and-randomization": {
    s: "Decides the sequence tests run in, defaulting to declared order and optionally shuffling with a seed to expose hidden dependencies between tests.",
    d: "Order may be declaration order, alphabetical, by prior duration or shuffled. Shuffling can apply to files, to groups within a file or to tests within a group, always from a seed that is printed and can be replayed. Random order flushes out tests that pass only because an earlier test left state behind. Hard parts are shuffling only where it is safe (groups with declared dependencies must stay ordered), and the shock of enabling shuffling on an old suite which fails in dozens of places.",
    k: ["Fixed order versus shuffled: fixed order is predictable and easy to debug, but lets order dependencies accumulate unnoticed.", "Shuffle at file level only versus at test level: files are safer and enough to reveal global leaks, while test-level shuffling finds more but breaks groups sharing setup."],
    p: ["A shuffled run fails and the seed was not printed, so the failure cannot be reproduced.", "Enabling random order on a large legacy suite produces so many failures that the team switches it off again."],
    v: "Run twice with different seeds and confirm different orders in the event log. Rerun with the first seed and confirm the identical order and identical results.",
    dep: ["seed-replay", "suites-and-grouping"]
  },
  "seed-replay": {
    s: "Records and reuses the random seed that drove ordering and generated data, so any run can be reproduced exactly from one printed number.",
    d: "At start the runner draws a seed or takes one from a flag, prints it in the header and passes it to the shuffler, to property-based generators and to factories through the test context. A replay run supplies the same seed and gets the same order and inputs. The seed must be derived deterministically per test, so adding a test does not change the data seen by others. Hard parts are hidden randomness outside the framework's control: the program's own random calls, hash ordering and time.",
    k: ["One global seed versus a derived seed per test: global is simple, but adding a test shifts everyone's data; per-test derivation keeps cases stable.", "Print the seed always versus on failure only: always printing keeps logs consistent, and printing only on failure hides it exactly when needed if the run is otherwise quiet."],
    p: ["Code under test uses its own unseeded generator, so replay with the same seed still produces different behavior.", "The seed is shown in a reporter that CI does not use, so it is absent from the failing log."],
    v: "Run with a fixed seed twice and compare the full event log, including generated data, byte for byte. Change one test and confirm the other tests' generated inputs stay the same.",
    dep: ["worker-pool"]
  },
  "work-stealing-queue": {
    s: "A shared queue from which idle workers take the next unit of work, evening out load when file durations vary widely.",
    d: "Rather than assigning all files up front, the scheduler keeps a queue and hands one to each worker as it finishes its last. Long files are placed first, when known, so they do not trail at the end. For finer balance, workers can split work: an idle worker takes tests from a busy worker's remaining files. The protocol needs acknowledgment so that work is never lost or run twice. Hard parts are fairness, the extra communication per unit and files that cannot be split because they share setup.",
    k: ["Dynamic queue versus fixed assignment: a queue adapts to real durations, but requires coordination and makes assignment nondeterministic between runs.", "Steal at file granularity versus test granularity: file granularity is simple, while test granularity balances better but repeats setup in more than one worker."],
    p: ["Nondeterministic assignment makes a state-sharing bug appear only when two specific files land in the same worker.", "A worker dies after taking work and the item is never returned to the queue."],
    v: "Run a suite with one extremely long file and many short ones on four workers and confirm the long file starts first, the other workers drain the short ones and total time is close to the long file's duration.",
    dep: ["worker-pool", "worker-protocol", "duration-balancing"]
  },
  "remote-executors": {
    s: "Runs tests on other machines or containers, shipping code and inputs to them and streaming results back, to scale beyond one host.",
    d: "A coordinator packages the build output, test binaries and inputs, schedules units of work onto remote workers through a queue or a cluster API and collects results and logs. Remote workers start from a defined image so that the environment matches. The system must handle machines that disappear, stragglers and network partitions by retrying or reassigning work. Hard parts are transferring large inputs quickly, caching them, keeping environments identical and making logs and artifacts from many machines readable as one run.",
    k: ["Push inputs per run versus use content-addressed caches: pushing is simple, but caches avoid resending unchanged files across thousands of runs.", "Reassign on worker loss versus fail the run: reassignment hides infrastructure failures, but can mask a test that crashes its machine."],
    p: ["Remote machines run an older image than the one the test was built against and fail in ways that never reproduce locally.", "A test that kills its worker is retried on machine after machine until the run's budget is gone."],
    v: "Run a suite remotely and locally from the same commit and compare the sets of passed and failed IDs. Kill a remote worker mid-run and confirm its work is completed elsewhere and flagged in the report.",
    dep: ["worker-protocol", "process-spawner", "hermetic-environment", "structured-results"]
  },
  "resource-locks": {
    s: "Declares that some tests need exclusive or limited access to a shared resource, such as a port or a database, and makes the scheduler serialize or limit them.",
    d: "Tests or groups carry a resource requirement, such as exclusive use of one named service or a count against a limited pool. The scheduler keeps a lock table and only dispatches a test when its resources are free, running others meanwhile. Resources may be provisioned dynamically, with each worker given its own database name or port range, which avoids locks entirely. Hard parts are deadlock when tests need several locks, starvation of waiting tests, and locks that leak when a worker dies.",
    k: ["Serialize tests that share a resource versus give each worker its own copy: serializing needs no extra provisioning, while per-worker copies keep full parallelism at a higher resource cost.", "Declared locks versus detecting conflicts at runtime: declarations are predictable, but undeclared sharing goes unnoticed until it flakes."],
    p: ["Two test files use the same port without declaring it, and fail only when scheduled together.", "A lock held by a crashed worker is never released and the run stalls."],
    v: "Mark two tests as needing the same exclusive resource and confirm in the event log that their time ranges never overlap while other tests run in between. Kill the holder and confirm the lock is released.",
    dep: ["worker-pool", "crash-recovery", "fixture-scoping"]
  }
});
