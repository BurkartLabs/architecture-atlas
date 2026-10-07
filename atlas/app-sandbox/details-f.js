// Details for the application sandbox plate, part 6: assurance and cross-cutting concerns.
ATLAS.details("app-sandbox", {
  "threat-model": {
    s: "A written statement of who the attacker is, what they control, what they want, and which boundaries the sandbox is meant to hold against them.",
    d: "It names assets (user files, devices, other apps, the system), attackers (a malicious app, a compromised parser, a hostile web page behind the app) and capabilities (arbitrary code in the target, control of all its input). It lists in-scope and out-of-scope goals, for example kernel exploits and hardware side channels. Every design choice can be traced to it. It is hard because it must stay current as features add attack surface, and because unstated assumptions, such as that the helper never handles input from the network, are where escapes come from.",
    k: ["Assume arbitrary code execution in the target vs assume bugs are rare: assuming compromise drives the split design and costs complexity; assuming rarity is cheaper and fails at the first parser flaw.", "Broad scope including side channels vs a narrow scope: a broad scope is honest about leaks and cannot be fully met; narrow is achievable and leaves gaps unspoken."],
    p: ["The model was written at launch and never updated while new portals and helpers were added.", "Out-of-scope items are never communicated, so users and developers assume protections that do not exist."],
    v: "Pick any permission or message type in the product and trace it to a threat-model line that justifies it. A reviewer must find no feature without a trace and no listed threat without a mitigation or a recorded acceptance.",
    dep: []
  },
  "escape-surface-inventory": {
    s: "A maintained list of every path by which confined code can influence anything outside the sandbox, with the owner and the defense for each.",
    d: "Entries cover the broker channel and each message type, handles passed in, shared memory, files in granted locations, device and network access, allowed system calls and their kernel code, helper processes, and update and install paths. Each has an owner, a threat, and a test. It turns the vague idea of a small attack surface into a list that can shrink. It is hard because the surface is spread over code, policy and kernel configuration, and because the inventory is wrong the moment a developer adds a convenience.",
    k: ["Generate the inventory from policy and code vs maintain by hand: generated lists stay accurate and miss unwritten dependencies; hand-written lists carry judgment and rot.", "Review on every change vs periodically: per-change review prevents silent growth and slows delivery; periodic reviews find drift late."],
    p: ["A debugging channel is not in the inventory and survives to the release build.", "Surface counted in messages but not in the kernel calls those messages cause."],
    v: "Compare the inventory with an automatically extracted list of allowed calls, mounts, handles and message types from a running app. Any difference, in either direction, is a defect in the inventory or the product.",
    dep: ["threat-model", "broker-minimal-surface"]
  },
  "policy-regression-tests": {
    s: "Automated tests that assert what each profile allows and forbids, run on every policy, kernel or app change.",
    d: "Positive tests confirm the app's core functions work under its profile, and negative tests try each forbidden class, such as reading an unlisted file, opening a socket, attaching to a process, and expect denial. Tests run inside the real sandbox with the real compiled policy, on each supported kernel. They also check policy diffs against stored expectations. It is hard because negative tests must fail for the right reason, and a test that passes because the file did not exist proves nothing.",
    k: ["Run tests inside the real sandbox vs against the policy as data: real runs catch kernel differences and are slow; data checks are fast and only prove what the compiler says.", "Assert the specific denying layer vs only that it failed: layer assertions catch a protection quietly vanishing behind another; failure-only is robust and weaker."],
    p: ["Negative tests pass because the target path was absent, and a later permissive rule goes unnoticed.", "Tests run only on the newest kernel, and older ones in the field behave differently."],
    v: "Delete one deny rule in a candidate profile and confirm the suite fails at the matching test and names the layer. Restore it and confirm all tests pass on every supported kernel version.",
    dep: ["escape-surface-inventory", "policy-compiler", "denial-logging"]
  },
  "broker-fuzzing": {
    s: "Feeding the broker, its services and helpers a stream of malformed and random inputs to find memory errors and logic flaws before attackers do.",
    d: "Harnesses drive the channel decoders and each service handler with coverage-guided input generation, run with memory error detectors, and replay saved crashes as regression tests. Stateful fuzzing sends valid sequences with mutations, since many flaws need specific message order. Parsers in helpers such as media decoders are fuzzed separately. It is hard because services depend on the environment (devices, prompts, files) that must be simulated, and because coverage plateaus on state-dependent code.",
    k: ["Fuzz handlers directly with stubs vs through the real channel: direct is fast and skips framing and state; the real channel is faithful and slower.", "Stateful sequence fuzzing vs single messages: sequences find ordering bugs and need a model of valid protocol; single messages are simple."],
    p: ["Harness replaces authorization with a stub and never exercises the checks where flaws live.", "Fuzzing stops once coverage plateaus, and the crash found by a longer run is never reached."],
    v: "Run the fuzzer against a build with a known injected overflow in one handler and confirm it finds and minimizes the crash within the time budget, then confirm the fix passes the saved reproduction.",
    dep: ["message-schema-validation", "broker-channel"]
  },
  "compatibility-testing": {
    s: "Running real applications under the sandbox across versions and configurations to find what the restrictions break before users do.",
    d: "A corpus of popular and unusual apps runs scripted workflows with the enforced profiles on each supported platform version. Failures are triaged into app bugs, missing portal use and policy errors. Telemetry from the field adds breakage reports. The results gate tightening changes and drive the baseline. It is hard because workflows are long and stateful, because failure often looks like an app bug, and because pressure to fix compatibility is the main force widening policies.",
    k: ["Broad shallow corpus vs deep tests of a few apps: breadth finds common breakage; depth finds the subtle failures in the most used software.", "Block releases on compatibility vs ship and fix: blocking prevents breakage and slows security fixes; shipping is fast and breaks users."],
    p: ["Tests exercise only the happy path, so a feature that needs a denied call fails only for users.", "Fixing each break by loosening the profile is accepted without a security review."],
    v: "Tighten one rule on a staging build and run the corpus. The report must list which apps break, with the first failing call, and a policy owner must confirm each as intended or fix it.",
    dep: ["policy-regression-tests", "denial-triage-tooling"]
  },
  "overhead-measurement": {
    s: "Tracking what the sandbox costs in launch time, throughput, latency and memory, release by release, against stated budgets.",
    d: "Benchmarks cover launch, file-heavy and network-heavy workloads, broker round trips and graphics, on representative hardware, with and without the sandbox. They separate fixed costs from per-call costs, and report distributions, not averages. Budgets prevent slow creep. It is hard because overhead is workload specific, because noise on shared hardware hides small regressions, and because security teams and product teams often disagree about what is acceptable.",
    k: ["Strict budgets that block merges vs tracked trends: strict budgets stop regressions and annoy; trends are tolerant and drift upward.", "Measure on real apps vs microbenchmarks: real apps show what users feel and are noisy; microbenchmarks are precise and may not matter."],
    p: ["Only warm launches are measured, and cold start including policy compile is slow in the field.", "A filter change that adds microseconds to every call is invisible in app-level benchmarks until a heavy app is tried."],
    v: "Run the benchmark suite on two builds and confirm the report shows the median and tail difference with confidence bounds, flags any metric over budget, and reproduces within the stated noise on a rerun.",
    dep: ["sandbox-profiling"]
  },
  "hardening-flags": {
    s: "Build and runtime options applied to the broker and helpers, such as stack protection, relocation hardening and checked allocators, that make bugs harder to exploit.",
    d: "Compilers can add stack canaries, bounds checks, control-flow integrity and fortified library calls; linkers can mark relocation tables read-only and build position-independent code; allocators can randomize and detect misuse. Applied to the trusted components first, these raise the cost of turning a flaw into an escape. Checks for the flags run in the release pipeline. It is hard because each flag costs speed or compatibility, and because code written in memory-unsafe ways remains risky whatever the flags.",
    k: ["Maximum hardening on the broker vs the same everywhere: the broker gains most from it and can afford the cost; uniform settings are simpler and slow every helper.", "Rewrite in memory-safe code vs harden existing code: rewriting removes bug classes and takes years; hardening is incremental and leaves them."],
    p: ["A build setting silently drops a flag and the shipped binary lacks protection.", "Hardened allocator is used in the broker but not in a helper with a parser."],
    v: "Run an automated binary inspection on every release artifact that confirms each required protection is present, and fail the build when one is not.",
    dep: ["memory-protections", "broker-minimal-surface"]
  },
  "defense-in-depth-layering": {
    s: "Arranging independent restrictions so a flaw in one, such as a filter bypass, still leaves the attacker blocked by another.",
    d: "The same dangerous capability is blocked at several layers: no path in the filesystem view, no rule in the access policy, no system call allowed, no identity that permits it. Layers should fail independently, so they use different mechanisms and different authors. The model assumes any single layer will eventually be bypassed. It is hard because layers share assumptions and code, so they fail together, and because extra layers add complexity that is itself a source of bugs and more denials to debug.",
    k: ["Overlapping independent layers vs one well-built layer: overlap tolerates a flaw and multiplies the maintenance; one layer is simple and has no fallback.", "Same team owns all layers vs separate owners: separate owners reduce correlated mistakes and coordinate poorly."],
    p: ["Two layers both rely on the same path normalization routine, so one bug defeats both.", "Teams remove a layer as redundant after it appeared never to deny anything."],
    v: "For each critical capability, disable each layer in turn in a test build and confirm an attack test is still blocked by another. Any capability blocked by exactly one layer is recorded as a gap.",
    dep: ["escape-surface-inventory", "mandatory-access-control", "syscall-filter", "filesystem-view-construction"]
  },
  "exploit-review-and-response": {
    s: "The process for analyzing real sandbox escapes and bypasses, fixing the cause and checking for the same class of flaw elsewhere.",
    d: "Reports arrive from researchers, crashes, alerts or public disclosures. The team reproduces the escape, finds which layer failed, ships a fix, and then asks where else the same mistake exists, adding a test and an inventory entry. Policy updates can ship faster than kernel updates, so mitigations may be deployed as rules first. Rewards and clear disclosure channels encourage reports. It is hard because fixes touch kernels and apps owned by others, and a stopgap policy can break apps while the real fix is pending.",
    k: ["Ship a narrow policy mitigation first vs wait for the full fix: mitigation protects quickly and may break apps and hide the real bug; waiting is clean and leaves users exposed.", "Fix the instance vs remove the class: fixing the instance is fast and recurs; removing the class takes redesign."],
    p: ["Fix lands in the broker, but the same unchecked pattern exists in three other services.", "Mitigation rules are left in place for years and nobody remembers why an app is broken."],
    v: "For a past escape, confirm a regression test fails on the vulnerable build and passes on the fixed one, and that the written review lists every other site searched for the same pattern.",
    dep: ["threat-model", "policy-regression-tests", "policy-versioning"]
  },
  "trust-boundary-placement": {
    s: "The decision about which code sits on which side of the line between confined and trusted, which fixes what an attacker gains when a given component fails.",
    d: "Every component is placed: parsers and renderers on the untrusted side, authority and persistence on the trusted side, and portals in between. Moving a component across the line changes performance, complexity and impact. The placement reaches every layer: what the broker must validate, what the filter must permit, what handles must be passed. It is hard because performance pushes work into the trusted side or the target, because boundaries drawn late cut through shared data structures, and because a boundary that was clean at design time erodes with each convenience added.",
    k: ["Many small confined components vs a few large ones: many components limit damage and need more IPC; few are simple and each flaw reaches more.", "Draw the boundary at the process vs at a finer scope: process boundaries use hardware and are heavy; in-process isolation is cheap and relies on software discipline."],
    p: ["A shared memory structure crosses the boundary and the trusted side trusts fields the untrusted side writes.", "A component placed on the trusted side only for speed becomes the most-attacked code in the system."],
    v: "Draw the data flow of one feature and mark each place where data crosses the boundary. Each crossing must have a validator and a recorded owner, and an injected flaw on the untrusted side must not reach a privileged action.",
    dep: ["broker-process", "helper-process-types"]
  },
  "least-privilege": {
    s: "The rule that every process, handle and grant carries only what the task needs, for as long as it needs it, applied at every layer.",
    d: "At each layer it means a different thing: narrow profiles, empty capability sets, a minimal filesystem view, single-file handles, one-time prompts, short leases, small message sets. It is cumulative, since a generous grant anywhere can void restraint elsewhere. It is measured by listing what a process can do, not what it does. It is hard because needs differ by moment, because developers ask for the maximum to avoid breakage, and because privileges reappear through indirection, such as a broker that does anything it is asked.",
    k: ["Grant narrowly and widen on demand vs grant generously and trim: narrow-first reveals needs and costs iteration; generous-first ships fast and rarely gets trimmed.", "Time-limited grants vs permanent: limited grants shrink the window of abuse and need renewal and more prompts."],
    p: ["A permission granted for a one-time import stays for the life of the install.", "The broker holds standing authority that any compromised caller can invoke through a generic service."],
    v: "For a running app, enumerate effective permissions at every layer and for each ask which feature uses it. A permission with no feature, or an expired grant still active, is a defect.",
    dep: ["default-deny-baseline", "capability-dropping", "grant-revocation"]
  },
  "strictness-vs-compatibility": {
    s: "The standing tension between a policy tight enough to stop attacks and loose enough that real applications still work.",
    d: "Every restriction breaks something, and the people who feel it are developers and users, not attackers. Tight rules produce failures that get fixed by loosening; loose rules produce no failures and no protection. Mechanisms to manage this include staged enforcement, per-app exceptions with expiry, portals that replace broad permissions, and telemetry on breakage. It shapes the baseline, templates, learning mode and the update process. It is hard because the pressure is steady and one-directional, and exceptions rarely expire.",
    k: ["Expiring per-app exceptions vs permanent allowances: expiry forces a fix and creates deadlines that break apps; permanent allowances never come back to bite until abused.", "Enforce strictly from the start vs ratchet over releases: strict is clean for new apps and hard for old; ratcheting is gentle and slow to arrive."],
    p: ["Exceptions granted for a launch are never revisited and accumulate into a second, undocumented policy.", "Compatibility pressure from one popular app weakens the shared baseline for all."],
    v: "List all active exceptions with owner, reason and expiry date. Each must have all three, none may be past expiry, and the count must be trending down release over release.",
    dep: ["profile-templates", "learning-mode", "compatibility-testing"]
  },
  "performance-overhead": {
    s: "The cost the sandbox adds to launching and running apps, which decides how many restrictions people tolerate and how often helpers are split.",
    d: "Costs arise at launch (namespaces, mounts, policy load), on every call (filtering, access checks), on every brokered request (a context switch and copies) and in memory (one broker and helpers per app). The cost determines design: whether to proxy or pass handles, whether to reuse warm helpers, whether to ask a person for every file. It is hard because the heaviest users, graphics and media, are also the hardest to confine, and because a restriction that is too slow is turned off.",
    k: ["Pay per-call checks vs pay at launch: per-call checks stay current and cost on every call; launch-time setup is cheap afterward and becomes stale.", "Warm pre-started sandboxes vs clean launches: warm ones start fast and share state or layout; clean launches are slower and more isolated."],
    p: ["Cost is measured with a few simple apps and the heavy workload is found to be unusable.", "A protection is made optional because of speed and then is never enabled."],
    v: "Run a set of representative heavy workloads under and outside the sandbox and report the slowdown for each. Any workload over its budget must be listed with the layer responsible.",
    dep: ["overhead-measurement", "gpu-access-mediation"]
  },
  "policy-evolution": {
    s: "How rules change over time as platforms, apps and threats do, including how breakage, rollback and old apps are handled.",
    d: "Policies are versioned, signed and delivered with releases. New kernel features allow tighter rules, new attacks require emergency changes, and apps change what they need. The system needs a way to tighten safely: stage, measure breakage, support old apps for a time and warn developers. Old behavior kept for compatibility is a standing weakness. It affects the manifest format, the compiler, the loader and the consent store. It is hard because tightening is breaking by nature, and the oldest apps often cannot be updated.",
    k: ["Version-gated rules for old apps vs one policy for everyone: gating keeps old apps working and keeps weak rules alive; one policy is strong and breaks a tail of apps.", "Fast push of policy outside releases vs ship with the platform: fast push closes holes quickly and can break devices without a test cycle; platform shipping is safe and slow."],
    p: ["Compatibility modes added for old apps are never removed, and attackers target them.", "Policy updates are not tested against the kernel versions still in the field."],
    v: "Publish a policy change through the staged channel to a test cohort, confirm breakage telemetry arrives, and then show that rollback restores the previous behavior and records the change.",
    dep: ["policy-versioning", "compatibility-testing"]
  },
  "failing-closed": {
    s: "The rule that when any part of the sandbox cannot do its job, the result is refusal, not silent loss of protection.",
    d: "Applies everywhere: a policy that does not load stops the launch; a broker that is down means requests fail; an unknown message type is rejected; a missing kernel feature prevents the app from starting. Failing closed makes failures visible and costs availability, so it needs clear error reporting, quick recovery and tested paths. It shapes the loader, bootstrap, broker and channel designs. It is hard because failure paths are rarely tested, because kernel interfaces sometimes report success when they did nothing, and because users blame the sandbox for every break.",
    k: ["Refuse to run vs degrade gracefully: refusing keeps the guarantee and annoys users; degrading keeps work going and makes protection unpredictable.", "Fail the single request vs end the whole app: failing the request is gentle and gives the app a chance to misuse retries; ending the app is clear and costly."],
    p: ["A fallback path quietly runs the app without the filter when the filter fails to load.", "Error messages are generic, so people disable the sandbox to get work done."],
    v: "Inject failures one at a time: policy load error, missing kernel feature, broker crash, unreadable consent store. In each case the app must be refused or its requests denied, with a clear reason, and never run unconfined.",
    dep: ["policy-loading", "sandbox-bootstrap", "broker-process"]
  }
});
