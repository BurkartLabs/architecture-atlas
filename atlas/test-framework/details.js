// Details for the test framework plate, part 1: developer interface, configuration and plugins, test definition.
ATLAS.details("test-framework", {
  "cli-frontend": {
    s: "The command-line entry point that parses arguments, loads configuration, starts a run and turns the outcome into an exit status, usually the only interface CI ever uses.",
    d: "The front end merges flags, environment variables and configuration files into one resolved options object, then hands it to the planner and executor. It decides whether the run is one-shot, watching or listing only. Everything a person might want to say (path patterns, name filters, shard, seed, reporter, bail) must be expressible as a flag, because CI cannot click. The difficulty is precedence and discoverability: the same option can arrive from three places, and a typo in a flag should fail loudly instead of silently running everything.",
    k: ["Strict versus lenient flag parsing: rejecting unknown flags catches typos before a long run, but breaks wrapper scripts that forward options meant for other tools.", "Positional filters as paths versus names: path arguments are predictable and fast, while name patterns are convenient but can match nothing without a clear warning."],
    p: ["A filter that matches zero tests exits successfully, so a typo in CI turns a full suite into a green no-op.", "Option precedence differs between flag, file and environment, so a local run and a CI run quietly use different settings."],
    v: "Run with a filter that matches nothing and confirm the runner exits non-zero with a message naming the filter. Then pass the same option by flag and by file and confirm the resolved-options printout shows the flag winning.",
    dep: ["config-loading", "test-discovery", "exit-codes"]
  },
  "watch-mode": {
    s: "A long-lived mode that watches source and test files and reruns only the tests affected by each save, keeping feedback inside a few seconds.",
    d: "After an initial run the runner keeps its workers and module caches warm and subscribes to file change events. On each batch of changes it consults the dependency graph to find the affected tests, invalidates the changed modules, and reruns just those, usually failed tests first. It prints a compact result and waits. Hard parts include debouncing bursts of saves, not rerunning while a previous run is mid-flight, discarding stale results from superseded runs, and keeping state truly clean across reruns inside long-lived workers.",
    k: ["Warm workers versus fresh processes per rerun: warm workers return results in milliseconds, but leaked state across reruns can make a passing test fail only in watch mode.", "Rerun by dependency versus rerun everything: dependency-based reruns are fast, but a missed edge, such as a dynamic import or a data file, shows stale green."],
    p: ["A save that happens during a run starts a second run whose output interleaves with the first, so the displayed result belongs to neither.", "Watching a directory that the tests themselves write into creates an infinite rerun loop."],
    v: "Edit one source file imported by a single test file, save, and confirm only that file reruns within a second or two and its result replaces the previous one. Then break and fix the file and watch the status flip both ways.",
    dep: ["filesystem-watcher", "dependency-tracking", "impacted-test-selection", "module-registry-reset", "failed-first-ordering"]
  },
  "interactive-filter": {
    s: "Keyboard-driven prompts inside the runner that let a person narrow a running session to a file, a name pattern or only failures without restarting it.",
    d: "While in watch mode the runner reads single keypresses from the terminal and opens small prompts: filter by file path, filter by test name, rerun failed only, update snapshots, toggle coverage. Each action rewrites the active selection and triggers a rerun against the warm workers. It must put the terminal into raw mode, coexist with test output, and restore terminal state on exit. The hard part is state: the active filters need to be visible at all times, or developers forget that most of the suite is currently excluded.",
    k: ["Filter state that persists versus resets each run: persistence supports focused work, but a forgotten filter hides failures in everything else.", "Prompts inside the runner versus restarting with new flags: prompts keep warm state and are fast, but they cannot be scripted or reproduced from a log."],
    p: ["A filter left on from earlier in the day makes a branch look green while most tests have not run.", "Raw terminal mode that is not restored on a crash leaves the shell unusable, typing invisibly."],
    v: "Start watch mode, apply a name filter, and confirm the header shows the active filter and that only matching tests run. Press the clear key and confirm the full count returns. Kill the process and check the terminal echoes typing normally.",
    dep: ["watch-mode", "name-and-tag-filters", "cli-frontend"]
  },
  "ide-test-explorer": {
    s: "An integration that lists tests in an editor's tree, runs or debugs a single test from a gutter icon and shows results inline, over a structured protocol rather than screen scraping.",
    d: "The editor talks to a long-lived process or a one-shot command that can list tests without running them, run a chosen set by stable ID, and stream structured results back. Each test needs a location in source so the gutter can attach to it, and a stable ID that survives edits above it. Because discovery in a dynamic language may require executing the file, the explorer's view is only as fresh as its last discovery. Debug requests reuse the debugger-attach path.",
    k: ["Static parsing of test files versus executing them to list tests: parsing is fast and safe, but misses generated and parametrized tests; executing is accurate but runs arbitrary code on every keystroke.", "A runner-specific adapter versus one shared protocol: a shared protocol gives every editor support at once, but limits features to its common denominator."],
    p: ["Test IDs built from line numbers shift after an edit, so a result is shown against the wrong test.", "Discovery that executes top-level code in test files triggers side effects, such as connecting to a database, from simply opening a folder."],
    v: "Open a project in the editor, confirm the tree lists a parametrized test's cases, run one case from its gutter icon, and confirm only that case executes and the pass or fail mark appears on the right line.",
    dep: ["test-discovery", "structured-results", "test-naming-and-ids", "debugger-attach", "event-stream"]
  },
  "debugger-attach": {
    s: "Starts a test in a state where a debugger can attach, pausing before the first line, with parallelism and timeouts turned off so breakpoints behave.",
    d: "The runner launches a single worker with the language runtime's inspector enabled, usually waiting for a client before running. It disables parallel workers, retries and timeouts, since a paused test would otherwise be killed as hung. Source maps let breakpoints in original source land on transformed code. If tests run in a sandboxed realm or a child process, the inspector port must be forwarded to the right process, and each new worker needs a distinct port. The runner should also report the endpoint it is listening on.",
    k: ["Single worker in-band versus the normal pool: running in one process makes breakpoints reliable, but hides concurrency-dependent failures that only occur in parallel.", "Wait for the debugger before running versus start immediately: waiting lets early breakpoints fire, but hangs forever if no debugger ever connects."],
    p: ["The test timeout is left on, so the process is killed while the developer reads a variable.", "Breakpoints bind to generated code with no source map, so they never fire and appear to be ignored."],
    v: "Launch a single failing test in debug mode, attach from the editor, set a breakpoint inside the code under test, and confirm execution stops there with source-level variable names and the call stack intact.",
    dep: ["source-maps", "process-spawner", "timeouts", "worker-pool", "cli-frontend"]
  },
  "failure-reproduction": {
    s: "The information and options that let a developer rerun exactly one failing case with the same seed, order, environment flags and inputs that failed in CI.",
    d: "A failure printed in CI is useful only if it can be replayed locally. The runner therefore records the random seed, the shard and worker order, relevant environment flags, the generated inputs of property tests and the retry count, and prints them next to the failure. A reproduction command packages them into one line. Hard cases involve hidden inputs the runner never saw: current time, machine locale, test order across files and leftover state, which are only recoverable if they were recorded.",
    k: ["Record every input up front versus only on failure: always recording costs space on every run, but recording after the fact is impossible.", "A printed command versus a reproduction bundle: a command is easy to paste but depends on the same checkout, while a bundle carries inputs yet is heavy to store."],
    p: ["The seed is printed only for the reporter the CI uses, so a local rerun with a different reporter draws a different order.", "A failure caused by test order reproduces only when the whole file runs, not when the single case is rerun alone."],
    v: "Take a failure from a randomized CI run, paste its reproduction command on a clean checkout, and confirm the same test fails with the same message. Then change the seed and confirm the failure disappears if it was order-dependent.",
    dep: ["seed-replay", "rerun-command", "ordering-and-randomization", "property-based-tests", "failure-summary"]
  },
  "rerun-command": {
    s: "A copy-pasteable command printed with each failure that selects precisely that test, so rerunning it takes one paste instead of reconstructing filters by hand.",
    d: "The command combines the runner invocation with a path, a full test name or stable ID, a project or shard selector and any seed or flags needed. Quoting is the hard part: test names contain spaces, brackets, quotes and parameter values, and must survive the shell of whatever platform the developer uses. The reporter has to know the exact invocation that produced the run, including wrapper scripts, to print something that works rather than a generic hint.",
    k: ["Select by stable ID versus by name pattern: IDs are exact, but names are what people recognize and can be edited by hand.", "Print on every failure versus once in the summary: per-failure output is convenient but triples log length in a run with hundreds of failures."],
    p: ["A name that contains regular expression characters matches more tests than intended, so the rerun runs unrelated cases.", "The printed command omits the working directory or project, so it fails or runs a different test in a monorepo."],
    v: "Copy the printed command for a parametrized failing case containing spaces and quotes into a fresh shell and confirm exactly one test runs and fails. Repeat on a second operating system's shell.",
    dep: ["name-and-tag-filters", "test-naming-and-ids", "cli-frontend"]
  },
  "config-loading": {
    s: "Locates, parses and validates project configuration from files, package metadata and flags into a single resolved settings object used by every other component.",
    d: "The runner searches upward from the working directory for a configuration file, which may be static data or an executable script. It validates keys and types, expands paths relative to the file, applies defaults, then overlays environment and flags. Executable configuration is powerful and lets projects compute settings, but means that loading configuration runs code before any test starts. The hard problems are error messages that name the offending key and file, and a way to print the final merged result for debugging.",
    k: ["Declarative configuration versus executable: declarative files can be validated and statically read by tools, while executable files allow conditionals but defeat tools and slow startup.", "Fail on unknown keys versus ignore them: failing finds typos immediately, but breaks configuration shared across runner versions."],
    p: ["A misspelled option is ignored, so a timeout or coverage threshold the team believes is enforced is not.", "Relative paths resolve against the working directory instead of the config file, so the suite finds different files depending on where it is launched."],
    v: "Run the runner's print-config command from two different directories in a monorepo and confirm both resolve the same file and the same absolute paths. Introduce a misspelled key and confirm startup fails naming it.",
    dep: ["environment-flags"]
  },
  "config-inheritance": {
    s: "Lets one configuration extend a shared base or preset and override parts of it, so many projects keep consistent settings without copying them.",
    d: "A configuration can name a parent, either another file or a published preset, whose values are merged under the child's. Merge rules matter: scalars override, but arrays and maps may replace, append or deep-merge depending on the key. Presets carry opinions such as transforms, environment and reporter lists for a stack. Resolution must be deterministic and show provenance. The hard part is that a change to a shared base silently alters hundreds of projects, so the effective configuration needs to be inspectable and diffable.",
    k: ["Replace arrays versus concatenate them: replacing is predictable, but forces children to repeat the base list to add one entry.", "Shared presets versus per-project copies: presets keep a fleet consistent and make upgrades one change, but couple every project to the preset owner's release schedule."],
    p: ["A base change that adds a setup file runs in projects that never expected it and breaks them all at once.", "Two bases both define a transform, and the winner depends on merge order that nobody wrote down."],
    v: "Print the effective configuration for a child project and confirm each value shows which file supplied it. Change one base value and confirm the child's printout and behavior change while an overridden key does not.",
    dep: ["config-loading", "project-workspaces"]
  },
  "project-workspaces": {
    s: "Runs several projects, each with its own configuration, environment and test set, from one invocation in a repository that holds many packages.",
    d: "A root configuration lists projects. The runner resolves each project's settings, discovers its tests, and treats the union as one run with one report, while keeping per-project environment, setup files and transforms separate. Scheduling can interleave projects across the shared worker pool. The runner must map a changed file to the owning project, and distinguish identical test names in different projects. Hard parts are cross-project dependencies, global setup ordering and per-project caches that must not collide.",
    k: ["One shared worker pool versus a pool per project: sharing keeps all cores busy, but requires workers to switch environment, which can be slow or leak state.", "Single combined report versus per-project reports: one report gives a single status, while per-project reports localize failure and caching."],
    p: ["Two projects share a cache directory and overwrite each other's compiled output, causing sporadic failures.", "A filter that names a test matches same-named tests in several projects and runs more than intended."],
    v: "Run a workspace containing two projects with different environments and confirm each project's tests see their own environment, the report labels each test with its project, and a path filter selects only the owning project.",
    dep: ["config-inheritance", "worker-pool", "test-discovery"]
  },
  "plugin-api": {
    s: "A defined interface through which extensions add reporters, transforms, environments, matchers and hooks without modifying the runner, versioned so plugins survive upgrades.",
    d: "Plugins are modules the runner loads by name or path and calls through registered extension points. The API exposes events to observe, options to read and registries to add to, and a context object for logging and state. Version negotiation tells a plugin which API it was loaded against. Ordering rules decide which plugin wins when two modify the same thing. The hard part is deciding the boundary: too narrow and users fork the runner, too wide and every internal change breaks a plugin.",
    k: ["Event subscription versus overriding internal functions: events are stable and safe, but overriding allows deeper changes at the cost of breaking on every release.", "In-process plugins versus out-of-process: in-process is fast and flexible, but a faulty plugin can crash or slow the whole run."],
    p: ["Plugins loaded in an unspecified order produce different behavior on different machines.", "A plugin that holds references to test objects leaks memory across a long watch session."],
    v: "Install a plugin that logs each lifecycle event and confirm it receives start, test and end events in order with correct data. Remove the plugin and confirm the run behaves as before.",
    dep: ["lifecycle-hooks", "config-loading", "event-stream"]
  },
  "lifecycle-hooks": {
    s: "Named points in a run, such as before all, before each file and after each test, where configuration and plugins can run code or observe state.",
    d: "The runner defines a fixed sequence of phases: global setup, worker start, file start, test start, test end, file end, global teardown and run end. Hooks can be synchronous or asynchronous, and the runner defines what happens if one throws or hangs: fail the test, fail the file or abort the run. Global hooks run once in the parent process and cannot share live objects with workers, only serializable data. Ordering guarantees must be explicit, especially for teardown after failure or interruption.",
    k: ["Hooks that can fail the run versus advisory only: failing hooks enforce preconditions, but a broken plugin hook then blocks every developer.", "Global setup in the parent versus in each worker: once in the parent is cheap, but workers cannot see its in-memory results."],
    p: ["A global teardown that is skipped after an interrupt leaves databases, ports and temp directories behind for the next run.", "A hook that throws with no timeout hangs the run silently before any test starts."],
    v: "Register hooks that append their names to a log, run a suite with one failing test, and confirm the log shows every setup before its tests and every teardown after, including teardown after a forced interrupt.",
    dep: ["worker-protocol", "timeouts", "test-lifecycle-machine"]
  },
  "custom-matchers": {
    s: "A registry through which projects add domain-specific assertions that carry the same messages, negation and diff behavior as the built-in ones.",
    d: "A custom matcher is a function that receives the actual value and expected arguments and returns pass or fail with a lazy message. Registering it makes it callable from the assertion chain, including negated and asynchronous forms. The framework supplies helpers for formatting values and equality, so output stays consistent. Hard parts are typing, so editors and compilers know the matcher exists, keeping matchers pure, and making the failure message correct in both the positive and negated case.",
    k: ["Global registration versus per-file import: global is convenient but makes a matcher's origin invisible, while imports are explicit but repetitive.", "A matcher that returns a message versus one that throws: returning lets the framework handle negation and soft collection, while throwing is simpler but bypasses both."],
    p: ["The negated message is copied from the positive one, so a failure reads as the opposite of what happened.", "A matcher that does network or file work makes assertions slow and nondeterministic."],
    v: "Register a matcher, use it in a passing test, a failing test and a negated failing test, and confirm each failure message states expected and actual values correctly and the editor recognizes the matcher's type.",
    dep: ["matchers", "plugin-api", "failure-diffs"]
  },
  "environment-flags": {
    s: "Environment variables and flags that change runner behavior, such as CI detection, color output, seeds and worker counts, and how they interact with files and defaults.",
    d: "Runners read the environment to detect CI and change defaults: disable watch, disable color, fail on focused tests or unapproved snapshots, and choose a different reporter. Variables also pass context into workers, such as worker index and shard number, which tests may read. The framework should document which variables it reads and which it sets for tests. Hard parts are leakage between the runner's own variables and the program under test, and the variety of CI detection heuristics.",
    k: ["Behavior changes automatically in CI versus explicit flags only: auto detection gives safe defaults, but means CI and local runs differ without anyone choosing it.", "Pass the full parent environment to tests versus a filtered one: the full environment is convenient, but leaks developer machine settings into results."],
    p: ["A local machine variable such as a locale or timezone changes test results, passing locally and failing in CI.", "Variables set by the runner for workers collide with variables the program under test also reads."],
    v: "Run the same suite with the CI variable set and unset and confirm the effective options printout differs only in documented ways. Print the worker index variable in two workers and confirm they differ.",
    dep: []
  },
  "test-declaration-api": {
    s: "The functions, decorators or annotations a test author uses to declare a test, which the runner records during collection and later invokes with its fixtures.",
    d: "Declaring a test registers a name, a body and options such as timeout and tags in a tree owned by the current file. Styles vary: free functions, methods on classes, annotations, or a data table. The declaration is inert; the runner decides whether, when and where the body runs. Hard parts include declaring tests dynamically from data, detecting declarations made at the wrong time (inside a running test), and keeping declaration order stable so IDs and sharding stay consistent.",
    k: ["Functions registered at load time versus classes discovered by naming convention: functions compose and generate easily, while conventions need no import but hide what counts as a test.", "Declare during load versus lazily: eager registration lets listing work without running tests, but forces tests to be declared before any asynchronous setup."],
    p: ["A test declared inside another test's body is silently never registered, or runs on one pass and not the next.", "Declaration order depends on a nondeterministic directory listing, so sharding differs between machines."],
    v: "List tests without running them and confirm every declared test, including ones generated from a data table, appears once with a stable name. Run twice and diff the lists to confirm identical order.",
    dep: ["collection-phase", "suites-and-grouping", "test-naming-and-ids"]
  },
  "suites-and-grouping": {
    s: "A nesting of tests under named groups that shares setup, naming prefixes and options, and defines the tree the reporter and filters operate on.",
    d: "Groups form a tree from file to suite to test. Each node can carry hooks, a timeout, tags and skip state that descendants inherit. The full name of a test is its path through the tree, which becomes its identity for filters, history and snapshots. Deep nesting reads well in reports but spreads one test's setup across many places. Hard parts are inheritance rules (does a child's timeout replace or add) and hook ordering around nested groups, especially for teardown.",
    k: ["Nested groups versus flat tests with prefixes: nesting shares setup naturally, but deep trees hide which hooks apply to a test.", "Group-level state shared between tests versus per-test state: sharing is faster, but couples tests and breaks under random order."],
    p: ["Renaming a group changes the identity of every test inside it, wiping their history and snapshots.", "State set in a group body at declaration time is shared by tests that were meant to be independent."],
    v: "Nest two groups with hooks that log their names and confirm the log shows outer setup, inner setup, test, inner teardown, outer teardown for each test. Rename the outer group and confirm the reported names all change.",
    dep: ["test-declaration-api", "setup-teardown-hooks", "test-metadata-and-tags"]
  },
  "parametrized-tests": {
    s: "Declares one test body that runs once per row of input data, producing a separate named result per case instead of a loop that stops at the first failure.",
    d: "The author supplies a table or generator of cases. The runner expands it at collection into individual tests, each with a generated name that includes the parameters, so each case passes, fails, is filtered and retried independently. Cases can come from files or computed lists, which means collection may do real work. Hard parts are naming (readable, unique and stable), large tables that generate thousands of tests and slow collection, and parameters that are not easily printed, such as objects.",
    k: ["Expand into separate tests versus loop inside one test: separate tests give per-case results and filters, but increase collection cost and result volume.", "Names from parameter values versus index numbers: values are readable, but unstable and sometimes unprintable; indexes are stable but opaque."],
    p: ["Two rows render to the same name, so a failure cannot be attributed and history merges them.", "A generator that depends on the clock or random data produces different cases on each collection, breaking sharding."],
    v: "Declare a body with five rows, one deliberately wrong, and confirm five results appear with distinct names, four pass and one fails, and that the failing case alone can be rerun by name.",
    dep: ["test-declaration-api", "test-naming-and-ids", "collection-phase"]
  },
  "property-based-tests": {
    s: "Generates many random inputs against a stated property, then shrinks any failing input to a minimal counterexample and records it for replay.",
    d: "The author states a property, such as decoding what was encoded returns the original, and input generators. The framework draws hundreds of values from a seeded generator, runs the property for each and, on failure, repeatedly simplifies the input while it still fails. The minimal case is printed with the seed and often saved to a corpus so it reruns forever. Hard parts are writing generators that cover edge cases but remain valid, shrinking through structured and dependent data, and runtime budgets that vary with machine speed.",
    k: ["Many random cases per run versus a fixed small set: random exploration finds surprising bugs, but makes a run's outcome vary unless the seed is controlled.", "Shrink aggressively versus quickly: heavy shrinking gives readable counterexamples at the cost of slow failure reports."],
    p: ["A discovered counterexample is not saved, so the next run passes and the bug is forgotten until it recurs in production.", "A generator that rarely produces an interesting case means the property passes for thousands of trivial inputs."],
    v: "Introduce a known off-by-one bug and confirm the property fails with a short shrunk counterexample and a seed, that rerunning with the seed fails identically, and that fixing the bug makes the saved case pass.",
    dep: ["seed-replay", "test-declaration-api", "failure-diffs"]
  },
  "test-metadata-and-tags": {
    s: "Labels and attributes attached to tests, such as speed, owner, feature area and required resources, that filters, schedulers and reports can act on.",
    d: "Metadata is attached at declaration through arguments, annotations or file-level declarations, and inherited down the group tree. The runner exposes it to filters (run only fast tests), to the scheduler (needs the single shared database), to reports (group failures by owner) and to quarantine lists. Tags are most valuable when they are few, documented and enforced. The hard part is keeping them true: a tag that says fast on a test that takes a minute is worse than no tag.",
    k: ["Free-form tags versus a declared vocabulary: free-form is easy to start, but accumulates misspellings that silently exclude tests; a declared list catches them.", "Metadata in code versus an external manifest: in-code metadata lives next to the test, while a manifest lets owners be assigned without editing files."],
    p: ["A tag typo means a test is excluded from the suite that CI runs and nobody notices.", "Ownership metadata is never updated after a team reorganization, so failures page the wrong people."],
    v: "Tag a subset of tests, run with the tag filter, and confirm exactly that subset executes and the report shows the tag. Introduce a tag not in the declared vocabulary and confirm the run reports an error.",
    dep: ["suites-and-grouping", "name-and-tag-filters"]
  },
  "skip-and-expected-failure": {
    s: "Marks tests that must not run, or that are known to fail, so the suite stays green and honest while tracking the debt explicitly.",
    d: "A skip excludes a test, with a reason, unconditionally or based on platform or feature checks evaluated at run time. An expected failure runs the test and reports pass if it fails and an alert if it unexpectedly passes. Focus markers do the opposite, running only the marked tests. The runner counts skipped, expected-failed and focused tests separately in output. The hard part is that skips accumulate: without a count, an age or a reason, the suite slowly loses its coverage while staying green.",
    k: ["Skip versus expected failure: a skip is cheap and silent, but an expected failure still runs and tells you the moment the bug is fixed.", "Allow focus markers in committed code versus forbid them in CI: allowing helps local work, but a stray focus marker makes the whole suite pass on one test."],
    p: ["A focused test is committed, and CI reports success after running a single test.", "Skipped tests carry no reason or owner, so no one ever revisits them."],
    v: "Commit a focus marker and confirm CI mode fails with a message naming the file. Skip a test with a reason and confirm the summary lists the count and reason, and an unexpected pass of an expected failure is reported.",
    dep: ["test-declaration-api", "environment-flags", "test-metadata-and-tags"]
  },
  "async-test-support": {
    s: "Lets tests return deferred results or use callbacks and waits, and makes the runner wait for completion, catch late errors and fail a test that never finishes.",
    d: "A test body can return a promise or future, accept a completion callback or run on an event loop the runner drives. The runner awaits it with a timeout and attributes any uncaught error or unhandled rejection to the test running at that moment. Work that outlives a test is the hard part: a timer or request started in one test may fail during the next, so the runner must track pending work, flush or cancel it and surface it as the right test's failure.",
    k: ["Wait for explicit completion versus wait for the event loop to drain: explicit completion is precise, but draining catches stray work at the cost of slow or never-ending tests.", "Fail on unhandled errors versus log them: failing finds real bugs, but turns harmless noise from third-party code into red builds."],
    p: ["A test forgets to return its promise and passes before its assertions run, so failures are never reported.", "An error raised after the test finished is attributed to whichever test happens to be running now."],
    v: "Write a test that omits its returned promise and asserts false after a delay. Confirm the runner flags it as an error or unhandled rejection, instead of passing silently, and names the test that started it.",
    dep: ["timeouts", "test-lifecycle-machine", "async-assertions"]
  },
  "test-naming-and-ids": {
    s: "The scheme that gives each test a stable, unique, readable identifier used by filters, history, snapshots, retries and the editor.",
    d: "An ID is usually the file path plus the group path plus the test title, with parameters appended. It must be stable across runs and machines, unique within a project, and recoverable from a failure message. Renames change IDs and detach a test from its history, so the framework either tolerates it or provides an explicit ID override. Hard parts are duplicates, characters that clash with shell and file systems, normalizing path separators across operating systems and very long names.",
    k: ["Derive IDs from names versus assign them explicitly: derived IDs need no bookkeeping, but break history on rename; explicit IDs survive renames at the cost of manual upkeep.", "Include file path versus title only: paths make IDs unique, but moving a file churns every ID in it."],
    p: ["Windows path separators in IDs make history and snapshots from one operating system not match the other.", "Duplicate titles in one group silently overwrite each other's snapshot or history entry."],
    v: "Run the suite on two operating systems and confirm every test ID is identical. Rename a test and confirm the history store treats it as a new test, unless an explicit ID override was set.",
    dep: ["suites-and-grouping", "test-declaration-api"]
  }
});
